/*
 * arena-app: интерфейс внешнего агента к клиенту Quake.
 *
 * Зачем. Чтобы обучать что-либо играть, нужны «руки»: читать состояние игры и
 * слать команды управления. Внутрь мода это не встроить — qagame.qvm у OSP
 * закрытый. Поэтому агент живёт снаружи, а игру за него ведёт обычный клиент
 * Quake, у которого мы перехватываем две точки: разбор снапшота и сборку
 * команды управления.
 *
 * Строгий шаг. Получив снапшот, клиент отправляет состояние и ЖДЁТ ответа.
 * Это ключевое решение: без него обучение недетерминировано, а сервер нельзя
 * гнать быстрее реального времени — агент будет отставать и учиться на
 * состояниях, которых уже нет.
 *
 * Формат — строки JSON. На сорока шагах в секунду разбор JSON стоит меньше,
 * чем один кадр, а отлаживать двоичный протокол вслепую дорого.
 */

#include "client.h"

/* Объявлено в cl_input.c, но не в заголовке — а нам оно нужно: агент задаёт
 * углы сам, и записать команду обязан тот же код, что и для мыши. */
void CL_FinishMove( usercmd_t *cmd );

#include <errno.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <unistd.h>

/** Куда подключаться агенту, «адрес:порт». Пусто — интерфейс выключен. */
static cvar_t *agent_endpoint;
/** Сколько ждать команду, мс. Ноль — ждать сколько угодно. */
static cvar_t *agent_timeout;

static int agentSocket = -1;
static qboolean agentFailed = qfalse;

/** Последняя полученная команда. Применяется, пока не пришла новая. */
static struct {
	int forward, right, up;
	int buttons;
	int weapon;
	float deltaYaw, deltaPitch;
} agentAction;

static char agentLine[4096];

static void CL_AgentClose(const char *why)
{
	if (agentSocket >= 0) {
		Com_Printf("Агент: соединение закрыто (%s)\n", why);
		close(agentSocket);
		agentSocket = -1;
	}
	/* Больше не пытаемся: иначе на каждом снапшоте будет попытка соединиться,
	 * и клиент встанет колом вместо того, чтобы просто играть без агента. */
	agentFailed = qtrue;
}

static void CL_AgentConnect(void)
{
	char host[128];
	const char *colon;
	struct sockaddr_in addr;
	int port;
	int one = 1;

	if (agentFailed || agentSocket >= 0)
		return;
	if (!agent_endpoint || !agent_endpoint->string[0])
		return;

	colon = strchr(agent_endpoint->string, ':');
	if (!colon) {
		Com_Printf("Агент: в agent_endpoint нужен «адрес:порт»\n");
		agentFailed = qtrue;
		return;
	}
	Q_strncpyz(host, agent_endpoint->string, MIN((int)sizeof(host), (int)(colon - agent_endpoint->string) + 1));
	port = atoi(colon + 1);

	agentSocket = socket(AF_INET, SOCK_STREAM, 0);
	if (agentSocket < 0) {
		Com_Printf("Агент: сокет не создан\n");
		agentFailed = qtrue;
		return;
	}

	Com_Memset(&addr, 0, sizeof(addr));
	addr.sin_family = AF_INET;
	addr.sin_port = htons((unsigned short)port);
	if (inet_pton(AF_INET, host, &addr.sin_addr) != 1) {
		CL_AgentClose("не разобран адрес");
		return;
	}

	if (connect(agentSocket, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
		CL_AgentClose(strerror(errno));
		return;
	}

	/* Задержка Нейгла склеивает мелкие пакеты. Нам важнее, чтобы команда
	 * ушла немедленно: полсотни байт сорок раз в секунду — не тот трафик,
	 * ради которого стоит экономить. */
	setsockopt(agentSocket, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));
	Com_Printf("Агент: подключён к %s\n", agent_endpoint->string);
}

static qboolean CL_AgentSend(const char *line)
{
	size_t left = strlen(line);
	const char *at = line;

	while (left > 0) {
		ssize_t wrote = write(agentSocket, at, left);
		if (wrote <= 0) {
			if (errno == EINTR)
				continue;
			CL_AgentClose(strerror(errno));
			return qfalse;
		}
		at += wrote;
		left -= (size_t)wrote;
	}
	return qtrue;
}

/** Читает одну строку. Возвращает qfalse, если соединение оборвалось. */
static qboolean CL_AgentReadLine(void)
{
	size_t used = 0;

	for (;;) {
		char ch;
		ssize_t got = read(agentSocket, &ch, 1);
		if (got == 0) {
			CL_AgentClose("другая сторона ушла");
			return qfalse;
		}
		if (got < 0) {
			if (errno == EINTR)
				continue;
			CL_AgentClose(strerror(errno));
			return qfalse;
		}
		if (ch == '\n')
			break;
		if (used + 1 < sizeof(agentLine))
			agentLine[used++] = ch;
	}
	agentLine[used] = '\0';
	return qtrue;
}

/** Достаёт число по имени поля. Разбирать JSON целиком тут незачем: полей
 *  десяток, и все они числа. */
static float CL_AgentNumber(const char *json, const char *key, float fallback)
{
	char needle[32];
	const char *at;

	Com_sprintf(needle, sizeof(needle), "\"%s\"", key);
	at = strstr(json, needle);
	if (!at)
		return fallback;
	at = strchr(at, ':');
	if (!at)
		return fallback;
	return (float)atof(at + 1);
}

void CL_AgentInit(void)
{
	agent_endpoint = Cvar_Get("agent_endpoint", "", CVAR_INIT);
	agent_timeout = Cvar_Get("agent_timeout", "0", CVAR_ARCHIVE);
	Com_Memset(&agentAction, 0, sizeof(agentAction));
}

qboolean CL_AgentActive(void)
{
	return agentSocket >= 0;
}

/**
 * Отдаёт состояние и ждёт команду.
 *
 * Отдаём сырые числа движка, а не «удобные» признаки: что из них важно,
 * решает тот, кто учит. Пересчитывать здесь — значит зашить свои догадки
 * в движок и потом пересобирать его ради каждой правки.
 */
void CL_AgentSnapshot(void)
{
	char out[4096];
	int len;
	int i, count;
	playerState_t *ps;

	CL_AgentConnect();
	if (agentSocket < 0)
		return;
	if (!cl.snap.valid)
		return;

	ps = &cl.snap.ps;
	len = Com_sprintf(out, sizeof(out),
		"{\"time\":%i,\"health\":%i,\"armor\":%i,\"weapon\":%i,"
		"\"ground\":%i,\"origin\":[%.2f,%.2f,%.2f],\"velocity\":[%.2f,%.2f,%.2f],"
		"\"angles\":[%.2f,%.2f],\"ammo\":%i,\"entities\":[",
		cl.snap.serverTime, ps->stats[STAT_HEALTH], ps->stats[STAT_ARMOR],
		ps->weapon, ps->groundEntityNum,
		ps->origin[0], ps->origin[1], ps->origin[2],
		ps->velocity[0], ps->velocity[1], ps->velocity[2],
		cl.viewangles[PITCH], cl.viewangles[YAW],
		ps->ammo[ps->weapon]);

	count = 0;
	for (i = 0; i < cl.snap.numEntities && count < 16; i++) {
		entityState_t *es = &cl.parseEntities[(cl.snap.parseEntitiesNum + i) & (MAX_PARSE_ENTITIES - 1)];
		if (es->number == ps->clientNum)
			continue;
		len += Com_sprintf(out + len, sizeof(out) - len,
			"%s{\"n\":%i,\"t\":%i,\"o\":[%.1f,%.1f,%.1f]}",
			count ? "," : "", es->number, es->eType,
			es->pos.trBase[0], es->pos.trBase[1], es->pos.trBase[2]);
		count++;
	}
	Com_sprintf(out + len, sizeof(out) - len, "]}\n");

	if (!CL_AgentSend(out))
		return;
	if (!CL_AgentReadLine())
		return;

	agentAction.forward = (int)CL_AgentNumber(agentLine, "forward", 0);
	agentAction.right = (int)CL_AgentNumber(agentLine, "right", 0);
	agentAction.up = (int)CL_AgentNumber(agentLine, "up", 0);
	agentAction.buttons = (int)CL_AgentNumber(agentLine, "buttons", 0);
	agentAction.weapon = (int)CL_AgentNumber(agentLine, "weapon", 0);
	agentAction.deltaYaw = CL_AgentNumber(agentLine, "dyaw", 0);
	agentAction.deltaPitch = CL_AgentNumber(agentLine, "dpitch", 0);
}

/**
 * Подменяет команду управления. Углы двигаем через cl.viewangles, как это
 * делает мышь: движок сам приведёт их к сети и к предсказанию движения.
 */
qboolean CL_AgentCommand(usercmd_t *cmd)
{
	if (agentSocket < 0)
		return qfalse;

	cl.viewangles[YAW] += agentAction.deltaYaw;
	cl.viewangles[PITCH] += agentAction.deltaPitch;
	if (cl.viewangles[PITCH] > 85.0f)
		cl.viewangles[PITCH] = 85.0f;
	if (cl.viewangles[PITCH] < -85.0f)
		cl.viewangles[PITCH] = -85.0f;

	cmd->forwardmove = ClampChar(agentAction.forward);
	cmd->rightmove = ClampChar(agentAction.right);
	cmd->upmove = ClampChar(agentAction.up);
	cmd->buttons = agentAction.buttons;
	if (agentAction.weapon > 0)
		cmd->weapon = (byte)agentAction.weapon;

	/* Углы записываются после подмены: они берутся из cl.viewangles,
	 * которые мы только что сдвинули. */
	CL_FinishMove(cmd);
	return qtrue;
}
