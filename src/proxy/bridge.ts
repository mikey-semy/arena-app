// Мост между браузером и игровым сервером.
//
// Браузер не умеет UDP, а Quake без UDP не играется: по TCP потеря пакета
// останавливает очередь, и получается «резина». WebTransport даёт настоящие
// ненадёжные датаграммы поверх QUIC — это ровно семантика UDP, только
// зашифрованная. NAT-обход из WebRTC нам не нужен: сервер публичный.
//
// На каждую сессию заводится СВОЙ UDP-сокет. Иначе игровой сервер увидит всех
// игроков как один адрес и будет считать их одним клиентом.
//
//   браузер ──QUIC/датаграммы──▶ мост ──UDP с отдельного порта──▶ ioq3ded
//
import { createSocket } from "node:dgram";
import { readFileSync } from "node:fs";
import { Http3Server } from "@fails-components/webtransport";
import { activeBanByNick } from "../server/db/admin.js";
import { checkTicket } from "./ticket.js";

const GAME_HOST = process.env.ARENA_GAME_HOST ?? "127.0.0.1";
const GAME_PORT = Number(process.env.ARENA_GAME_PORT ?? 27960);
const LISTEN_HOST = process.env.ARENA_BRIDGE_HOST ?? "0.0.0.0";
const LISTEN_PORT = Number(process.env.ARENA_BRIDGE_PORT ?? 27961);
// В разработке сертификат самоподписанный и лежит в var/dev-cert; в боевом
// контуре это выпуск Let'"'"'s Encrypt, где файлы называются иначе. Поэтому пути
// задаются отдельно, а каталог — только удобная умолчальная форма.
const CERT_DIR = process.env.ARENA_CERT_DIR ?? "var/dev-cert";
const CERT_FILE = process.env.ARENA_CERT_FILE ?? `${CERT_DIR}/cert.pem`;
const KEY_FILE = process.env.ARENA_KEY_FILE ?? `${CERT_DIR}/key.pem`;

// Ключ подписи приглашений. Пуст — вход свободный: так удобно в разработке,
// но в боевом контуре это дыра, поэтому мост об этом громко предупреждает.
const TICKET_SECRET = process.env.ARENA_TICKET_SECRET ?? "";

/**
 * Погашенные билеты. Одного входа достаточно: дальше пересланная ссылка
 * бесполезна. Держим в памяти, а не в базе, — билет живёт час, и переживать
 * перезапуск моста ему незачем. Перезапуск и так рвёт все сессии.
 */
const spent = new Map<string, number>();

function spendTicket(nonce: string, expires: number): boolean {
  const now = Date.now() / 1000;
  for (const [key, until] of spent) if (until <= now) spent.delete(key);
  if (spent.has(nonce)) return false;
  spent.set(nonce, expires);
  return true;
}

// Пакет Quake бывает до 1400 байт (MAX_PACKETLEN движка), а в QUIC-датаграмму
// влезает около 1200 — зависит от MTU пути. Разница небольшая, но стартовый
// gamestate идёт кусками по 1312 байт и не проходит целиком.
//
// Уменьшить куски в самом Quake нельзя без последствий: FRAGMENT_SIZE знают обе
// стороны, и, поменяв его, мы отрежем от сервера обычные клиенты Quake. А это
// ценно: кто хочет, играет своим нативным клиентом прямо на 27960.
// Поэтому режем на уровне транспорта — там, где ограничение и возникло.
//
//   [0] целый пакет:  payload
//   [1, id, index, count] кусок: часть payload
//
// Потеря куска = потеря пакета целиком. Для UDP это нормально: Quake на такое
// рассчитан, он переспросит.
const WHOLE = 0;
const PART = 1;
const TICKET = 2;
const HEADER = 4;

// Всё, что больше, — не наш трафик: MAX_MSGLEN движка 16384.
const MAX_PACKET = 16384;

type Session = {
  readonly datagrams: {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    maxDatagramSize?: number;
  };
  readonly closed: Promise<unknown>;
  close(info?: { closeCode?: number; reason?: string }): void;
};

function log(...parts: unknown[]): void {
  console.log(new Date().toISOString(), ...parts);
}

/** Собирает пакет обратно из кусков. Живёт ровно одну сессию. */
class Reassembler {
  private id = -1;
  private parts: (Uint8Array | undefined)[] = [];
  private have = 0;

  /** Возвращает собранный пакет или undefined, если ещё не всё пришло. */
  add(id: number, index: number, count: number, part: Uint8Array): Uint8Array | undefined {
    if (id !== this.id) {
      // Пришёл кусок нового пакета — предыдущий недособрался и уже не нужен
      this.id = id;
      this.parts = new Array(count);
      this.have = 0;
    }
    if (index >= this.parts.length || this.parts[index]) return undefined;
    this.parts[index] = part;
    this.have++;
    if (this.have !== this.parts.length) return undefined;

    const total = this.parts.reduce((n, p) => n + (p?.byteLength ?? 0), 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of this.parts) {
      if (!p) return undefined;
      out.set(p, at);
      at += p.byteLength;
    }
    this.id = -1;
    return out;
  }
}

/** Гоняет датаграммы между одной сессией браузера и своим UDP-сокетом. */
async function bridgeSession(session: Session, id: number): Promise<void> {
  const udp = createSocket("udp4");
  // Привязываем сразу: иначе порт неизвестен, а он нужен для записи в лог —
  // именно по нему потом сходятся игрок и его статистика
  udp.bind();
  await new Promise<void>((resolve) => udp.once("listening", () => resolve()));

  const writer = session.datagrams.writable.getWriter();
  const incoming = new Reassembler();
  let nextPacketId = 0;
  let alive = true;

  const stop = (why: string) => {
    if (!alive) return;
    alive = false;
    log(`сессия ${id}: закрыта (${why}), ${who}, отдано ${sent} пакетов`);
    udp.close();
    writer.close().catch(() => {});
  };

  // Сколько влезает в одну датаграмму. Спрашиваем у транспорта, а не гадаем;
  // если он молчит — берём заведомо проходящий минимум.
  const limit = Math.max(512, (session.datagrams.maxDatagramSize ?? 1200) - HEADER);

  const send = (chunk: Uint8Array) => {
    writer.write(chunk).catch((err) => {
      log(`сессия ${id}: датаграмма ${chunk.byteLength} байт не ушла:`, (err as Error).message);
    });
  };

  let sent = 0;
  udp.on("message", (payload) => {
    if (!alive || payload.length === 0 || payload.length > MAX_PACKET) return;
    if (!admitted) return;
    sent++;

    if (payload.length <= limit) {
      const out = new Uint8Array(1 + payload.length);
      out[0] = WHOLE;
      out.set(payload, 1);
      send(out);
      return;
    }

    const count = Math.ceil(payload.length / limit);
    const packetId = nextPacketId++ & 0xff;
    for (let i = 0; i < count; i++) {
      const slice = payload.subarray(i * limit, Math.min((i + 1) * limit, payload.length));
      const out = new Uint8Array(HEADER + slice.length);
      out[0] = PART;
      out[1] = packetId;
      out[2] = i;
      out[3] = count;
      out.set(slice, HEADER);
      send(out);
    }
  });
  udp.on("error", (err) => {
    log(`сессия ${id}: ошибка UDP`, err.message);
    stop("ошибка UDP");
  });

  session.closed.then(() => stop("сессия завершена")).catch(() => stop("сессия оборвалась"));

  // Пока билет не предъявлен, к игре не пускаем: датаграммы просто некуда
  // переливать — UDP-сокет ещё не открыт.
  let admitted = !TICKET_SECRET;
  let who = "без билета";
  if (admitted) log(`сессия ${id}: вход свободный, ARENA_TICKET_SECRET не задан`);

  const reader = session.datagrams.readable.getReader();
  try {
    while (alive) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.byteLength < 1) continue;

      if (value[0] === TICKET) {
        if (admitted) continue;
        const raw = new TextDecoder().decode(value.subarray(1));
        const result = checkTicket(raw, TICKET_SECRET);
        if ("error" in result) {
          log(`сессия ${id}: отказано — ${result.error}`);
          session.close({ closeCode: 403, reason: result.error });
          return;
        }
        // Бан проверяем здесь, а не только при выписке билета: билет живёт
        // час, и без этой проверки забаненный спокойно доигрывал бы час
        // по уже выданной ссылке.
        const ban = await activeBanByNick(result.ticket.name).catch(() => undefined);
        if (ban) {
          log(`сессия ${id}: отказано — ${result.ticket.name} забанен (${ban.reason})`);
          session.close({ closeCode: 403, reason: "доступ закрыт" });
          return;
        }

        if (!spendTicket(result.ticket.nonce, result.ticket.expires)) {
          log(`сессия ${id}: отказано — билет уже использован`);
          session.close({ closeCode: 403, reason: "билет уже использован" });
          return;
        }
        admitted = true;
        who = `${result.ticket.name} (матч ${result.ticket.room})`;
        // Привязка «игрок ↔ порт» — по ней статистика из логов OSP свяжется
        // с человеком: игровой сервер знает игроков только по адресу
        log(`сессия ${id}: впущен ${who}, порт ${udp.address().port}`);
        continue;
      }

      if (!admitted) continue;

      if (value[0] === WHOLE) {
        udp.send(value.subarray(1), GAME_PORT, GAME_HOST);
        continue;
      }
      if (value[0] !== PART || value.byteLength < HEADER) continue;
      const whole = incoming.add(
        value[1] as number,
        value[2] as number,
        value[3] as number,
        value.subarray(HEADER),
      );
      if (whole && whole.byteLength <= MAX_PACKET) udp.send(whole, GAME_PORT, GAME_HOST);
    }
  } catch (err) {
    log(`сессия ${id}: чтение прервано`, (err as Error).message);
  } finally {
    stop("поток кончился");
  }
}

async function main(): Promise<void> {
  const server = new Http3Server({
    host: LISTEN_HOST,
    port: LISTEN_PORT,
    secret: process.env.ARENA_BRIDGE_SECRET ?? "arena-dev-secret",
    cert: readFileSync(CERT_FILE, "utf8"),
    privKey: readFileSync(KEY_FILE, "utf8"),
    // Датаграммы читаем байтами: пакет Quake — это просто буфер, разбирать
    // его здесь незачем, мост про содержимое ничего не знает
    defaultDatagramsReadableMode: "bytes",
  });

  server.startServer();
  await server.ready;
  log(`мост слушает ${LISTEN_HOST}:${LISTEN_PORT}, игра на ${GAME_HOST}:${GAME_PORT}`);

  const incoming = server.sessionStream("/play");
  const reader = incoming.getReader();
  let counter = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    const session = value as unknown as Session;
    const id = ++counter;
    log(`сессия ${id}: открыта`);
    bridgeSession(session, id).catch((err) => log(`сессия ${id}: упала`, err));
  }
}

main().catch((err) => {
  console.error("мост не поднялся:", err);
  process.exit(1);
});
