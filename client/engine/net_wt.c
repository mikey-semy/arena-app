/*
 * arena-app: сетевой слой браузерного клиента поверх WebTransport.
 *
 * Кладётся поверх code/qcommon/net_ip.c при сборке под Emscripten
 * (см. client/Dockerfile). Правится не патчем, а подменой файла целиком:
 * патч из десятка кусков ломается на каждом обновлении движка, а здесь
 * зависимость одна — набор функций, объявленных в qcommon.h.
 *
 * Зачем вообще: в WebAssembly нет сокетов, поэтому официальная сборка идёт
 * с net_enabled 0 и играть по сети не умеет. WebSocket не годится — это TCP,
 * потерянный пакет останавливает очередь и получается «резина». WebTransport
 * даёт ненадёжные датаграммы поверх QUIC, то есть ровно семантику UDP.
 *
 * Упрощение, на котором всё держится: у браузерного клиента ровно ОДИН
 * собеседник — мост. Поэтому адресов здесь нет: любой разбор имени даёт один
 * и тот же фиктивный адрес, а отправка всегда уходит в единственную сессию.
 * Мастер-сервер и обзор серверов так не работают — их заменяет сайт.
 */

#include "q_shared.h"
#include "qcommon.h"
#include <emscripten.h>

static cvar_t *net_enabled;
static cvar_t *net_dropsim;

/* Единственный собеседник. Значения произвольны: важно лишь, чтобы адрес
 * стабильно сравнивался сам с собой — движок сверяет отправителя пакета
 * с адресом сервера. */
static netadr_t bridgeAdr;

static void NET_InitBridgeAdr(void)
{
	Com_Memset(&bridgeAdr, 0, sizeof(bridgeAdr));
	bridgeAdr.type = NA_IP;
	bridgeAdr.ip[0] = 127;
	bridgeAdr.ip[3] = 1;
	bridgeAdr.port = BigShort(27960);
}

/* ── сторона браузера ─────────────────────────────────────────────────────── */

/* ВНИМАНИЕ: тело EM_JS проходит через препроцессор C. Любые «//» внутри —
 * и в комментариях, и в «https://» — съедаются как начало комментария, а
 * сборка падает на непонятной ошибке минификатора. Поэтому пояснения к JS
 * живут снаружи макросов, а двойной слэш в URL записан через \x2F. */

/* Билет предъявляется первой датаграммой (тип 2), до всякого игрового трафика.
 * Не через путь или заголовок запроса: как их разбирает мост, зависит от
 * потрохов его библиотеки, а своё кадрирование у нас уже есть и оно наше.
 *
 * Открывает сессию к мосту. Адрес берётся из ARENA_BRIDGE, который выставляет
 * страница, а НЕ из строки подключения движка. Причина: движок дёргает разбор
 * имени и для своих служебных хостов (update.quake3arena.com, authorize),
 * причём раньше, чем для игрового сервера, — и сессия уходила бы не туда.
 * У браузерного клиента собеседник ровно один, так что выбирать нечего.
 *
 * ARENA_CERT_HASH задаётся только в разработке: самоподписанный сертификат
 * браузер принимает исключительно по отпечатку. В боевом контуре у моста
 * обычный сертификат и хеша нет. */
EM_JS(void, arena_wt_open, (void), {
	const where = globalThis.ARENA_BRIDGE;
	if (!where) return;
	const state = (Module.arenaNet ||= { queue: [], status: 0, session: null });
	// Дублируем наружу: иначе состояние сети недосягаемо ни из консоли
	// браузера, ни из поддержки — модуль движка живёт в своей области видимости
	globalThis.ARENA_NET = state;
	if (state.status === 1 || state.status === 2) return;
	state.status = 1;
	state.queue.length = 0;

	const mark = (step) => { (globalThis.ARENA_STEPS ||= []).push(step); };
	mark("начали " + where);

	const parts = where.split(":");
	const url = `https:\x2F\x2F${parts[0]}:${parts[1] || 27961}/play`;
	mark("адрес " + url);

	const options = {};
	try {
		if (globalThis.ARENA_CERT_HASH) {
			options.serverCertificateHashes = [{
				algorithm: "sha-256",
				value: Uint8Array.from(atob(globalThis.ARENA_CERT_HASH), c => c.charCodeAt(0)),
			}];
		}
	} catch (err) {
		mark("отпечаток не разобрался, иду без него");
		delete options.serverCertificateHashes;
	}

	let transport;
	try {
		transport = new WebTransport(url, options);
	} catch (err) {
		console.error("arena: не открылся WebTransport", err);
		state.status = 3;
		return;
	}
	state.session = transport;
	mark("сессия создана");

	transport.closed.then(
		(info) => { mark("закрыта: " + JSON.stringify(info)); state.status = 3; },
		(err) => { mark("оборвана: " + (err && err.message)); state.status = 3; });
	transport.ready.then(async () => {
		mark("сессия готова");
		state.status = 2;
		state.writer = transport.datagrams.writable.getWriter();
		state.limit = Math.max(512, (transport.datagrams.maxDatagramSize || 1200) - 4);

		if (globalThis.ARENA_TICKET) {
			const raw = new TextEncoder().encode(globalThis.ARENA_TICKET);
			const out = new Uint8Array(1 + raw.length);
			out[0] = 2;
			out.set(raw, 1);
			state.writer.write(out).catch(err => console.error("arena: билет не ушёл", err));
		}

		const asm = { id: -1, parts: [], have: 0 };
		const push = (packet) => {
			if (state.queue.length > 256) state.queue.shift();
			state.queue.push(packet);
		};
		const reader = transport.datagrams.readable.getReader();
		try {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value || value.length < 1) continue;
				if (value[0] === 0) {
					push(value.slice(1));
					continue;
				}
				if (value[0] !== 1 || value.length < 4) continue;
				const id = value[1], index = value[2], count = value[3];
				if (id !== asm.id) {
					asm.id = id;
					asm.parts = new Array(count);
					asm.have = 0;
				}
				if (index >= asm.parts.length || asm.parts[index]) continue;
				asm.parts[index] = value.slice(4);
				asm.have++;
				if (asm.have !== asm.parts.length) continue;
				let total = 0;
				for (const part of asm.parts) total += part.length;
				const whole = new Uint8Array(total);
				let at = 0;
				for (const part of asm.parts) { whole.set(part, at); at += part.length; }
				asm.id = -1;
				push(whole);
			}
		} catch (err) {
			console.error("arena: чтение датаграмм прервано", err);
		}
		state.status = 3;
	}, (err) => {
		mark("сессия не открылась: " + (err && err.message));
		console.error("arena: сессия не открылась", err);
		state.status = 3;
	});
});

/* 0 — не начинали, 1 — подключаемся, 2 — работает, 3 — закрыто или упало. */
EM_JS(int, arena_wt_status, (void), {
	return (Module.arenaNet && Module.arenaNet.status) || 0;
});

/* Копия обязательна: HEAPU8 — память движка, он перезапишет её раньше,
 * чем браузер успеет отправить датаграмму.
 *
 * Кадрирование то же, что в мосте (src/proxy/bridge.ts): байт 0 говорит,
 * целый это пакет или кусок. Разбор — в комментарии там. */
EM_JS(void, arena_wt_send, (const void *data, int length), {
	const state = Module.arenaNet;
	if (!state || state.status !== 2 || !state.writer) return;
	const payload = HEAPU8.slice(data, data + length);
	const limit = state.limit || 1196;
	const fail = err => console.error("arena: отправка не удалась", err);

	if (payload.length <= limit) {
		const out = new Uint8Array(1 + payload.length);
		out[0] = 0;
		out.set(payload, 1);
		state.writer.write(out).catch(fail);
		return;
	}

	const count = Math.ceil(payload.length / limit);
	const id = (state.nextId = ((state.nextId || 0) + 1) & 0xff);
	for (let i = 0; i < count; i++) {
		const slice = payload.subarray(i * limit, Math.min((i + 1) * limit, payload.length));
		const out = new Uint8Array(4 + slice.length);
		out[0] = 1;
		out[1] = id;
		out[2] = i;
		out[3] = count;
		out.set(slice, 4);
		state.writer.write(out).catch(fail);
	}
});

/* Возвращает длину пакета или 0, если очередь пуста. Слишком большие пакеты
 * выбрасываем: это заведомо не наш трафик. */
EM_JS(int, arena_wt_recv, (void *buffer, int maxLength), {
	const state = Module.arenaNet;
	if (!state || state.queue.length === 0) return 0;
	const packet = state.queue.shift();
	if (packet.length > maxLength) return 0;
	HEAPU8.set(packet, buffer);
	return packet.length;
});

/* ── то, что движок ждёт от сетевого слоя ─────────────────────────────────── */

qboolean Sys_StringToAdr(const char *s, netadr_t *a, netadrtype_t family)
{
	/* Разбирать нечего: DNS в браузере недоступен, а собеседник один.
	 * Любое имя — это мост. */
	(void) family;
	Com_Printf("Разбор адреса «%s» → мост\n", s ? s : "(пусто)");
	arena_wt_open();
	*a = bridgeAdr;
	return qtrue;
}

qboolean NET_CompareBaseAdrMask(netadr_t a, netadr_t b, int netmask)
{
	byte cmpmask, *addra, *addrb;
	int curbyte;

	if (a.type != b.type)
		return qfalse;

	if (a.type == NA_LOOPBACK)
		return qtrue;

	if (a.type == NA_IP) {
		addra = (byte *) &a.ip;
		addrb = (byte *) &b.ip;
		if (netmask < 0 || netmask > 32)
			netmask = 32;
	} else if (a.type == NA_IP6) {
		addra = (byte *) &a.ip6;
		addrb = (byte *) &b.ip6;
		if (netmask < 0 || netmask > 128)
			netmask = 128;
	} else {
		Com_Printf("NET_CompareBaseAdr: bad address type\n");
		return qfalse;
	}

	curbyte = netmask >> 3;
	if (curbyte && memcmp(addra, addrb, curbyte))
		return qfalse;

	netmask &= 0x07;
	if (netmask) {
		cmpmask = (1 << netmask) - 1;
		cmpmask <<= 8 - netmask;
		if ((addra[curbyte] & cmpmask) == (addrb[curbyte] & cmpmask))
			return qtrue;
	} else {
		return qtrue;
	}

	return qfalse;
}

qboolean NET_CompareBaseAdr(netadr_t a, netadr_t b)
{
	return NET_CompareBaseAdrMask(a, b, -1);
}

const char *NET_AdrToString(netadr_t a)
{
	static char s[NET_ADDRSTRMAXLEN];

	if (a.type == NA_LOOPBACK)
		Com_sprintf(s, sizeof(s), "loopback");
	else if (a.type == NA_BOT)
		Com_sprintf(s, sizeof(s), "bot");
	else
		/* Настоящего адреса у нас нет и быть не может: за этим адресом стоит
		 * мост, а за мостом — игровой сервер. Показываем это честно. */
		Com_sprintf(s, sizeof(s), "bridge");

	return s;
}

const char *NET_AdrToStringwPort(netadr_t a)
{
	static char s[NET_ADDRSTRMAXLEN];

	if (a.type == NA_LOOPBACK)
		Com_sprintf(s, sizeof(s), "loopback");
	else if (a.type == NA_BOT)
		Com_sprintf(s, sizeof(s), "bot");
	else
		Com_sprintf(s, sizeof(s), "bridge");

	return s;
}

qboolean NET_CompareAdr(netadr_t a, netadr_t b)
{
	if (!NET_CompareBaseAdr(a, b))
		return qfalse;

	if (a.type == NA_IP || a.type == NA_IP6)
		return (a.port == b.port) ? qtrue : qfalse;

	return qtrue;
}

qboolean NET_IsLocalAddress(netadr_t adr)
{
	return adr.type == NA_LOOPBACK;
}

void Sys_SendPacket(int length, const void *data, netadr_t to)
{
	if (to.type == NA_BAD || to.type == NA_BOT)
		return;
	arena_wt_send(data, length);
}

qboolean Sys_IsLANAddress(netadr_t adr)
{
	/* Браузер не знает своих интерфейсов, а мост всегда снаружи. */
	return adr.type == NA_LOOPBACK;
}

void Sys_ShowIP(void)
{
	Com_Printf("Адреса недоступны: клиент работает через мост WebTransport\n");
}

void NET_JoinMulticast6(void) {}
void NET_LeaveMulticast6(void) {}

void NET_Config(qboolean enableNetworking)
{
	/* Включать и выключать нечего: сессия живёт, пока жив собеседник. */
	(void) enableNetworking;
}

/* Разбор входящих. Повторяет NET_Event из net_ip.c, только источник пакетов
 * не select() по сокетам, а очередь датаграмм из браузера. */
static void NET_ReadIncoming(void)
{
	byte bufData[MAX_MSGLEN + 1];
	netadr_t from;
	msg_t netmsg;
	int length;

	for (;;) {
		MSG_Init(&netmsg, bufData, sizeof(bufData));
		length = arena_wt_recv(netmsg.data, netmsg.maxsize);
		if (length <= 0)
			return;

		netmsg.readcount = 0;
		netmsg.cursize = length;
		from = bridgeAdr;

		if (net_dropsim && net_dropsim->value > 0.0f && net_dropsim->value <= 100.0f) {
			if (rand() < (int) (((double) RAND_MAX) / 100.0 * (double) net_dropsim->value))
				continue;
		}

		if (com_sv_running->integer)
			Com_RunAndTimeServerPacket(&from, &netmsg);
		else
			CL_PacketEvent(from, &netmsg);
	}
}

void NET_Sleep(int msec)
{
	/* Спать нельзя: в браузере поток один, и уснув мы остановим кадр.
	 * Просто разбираем то, что пришло. */
	(void) msec;
	NET_ReadIncoming();
}

void NET_Init(void)
{
	NET_InitBridgeAdr();
	net_enabled = Cvar_Get("net_enabled", "1", CVAR_LATCH | CVAR_ARCHIVE);
	net_dropsim = Cvar_Get("net_dropsim", "", CVAR_TEMP);
	Cmd_AddCommand("net_restart", NET_Restart_f);
	Com_Printf("Сеть: WebTransport через мост\n");
}

void NET_Shutdown(void)
{
	Cmd_RemoveCommand("net_restart");
}

void NET_Restart_f(void)
{
	NET_InitBridgeAdr();
}
