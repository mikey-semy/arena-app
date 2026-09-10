// Сайт: вход, аккаунты, дальше всё остальное.
//
// Мост (src/proxy) намеренно отдельный процесс: он должен пережить перезапуск
// сайта, иначе выкатка новой версии выкинет всех из матча.

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { checkTicket, issueTicket, newNonce } from "../proxy/ticket.js";
import { authorizeUrl, type DiscordConfig, exchangeCode } from "./auth/discord.js";
import { COOKIE, endSession, findSessionUser, startSession } from "./auth/session.js";
import { activeBan, banPlayer, listPlayers, setRole, unbanPlayer } from "./db/admin.js";
import {
  createClan,
  getClan,
  getClanMembers,
  getMembership,
  joinClan,
  leaveClan,
  listClans,
} from "./db/clans.js";
import { changeNick, getConfig, saveConfig, upsertDiscordUser } from "./db/users.js";
import { checkClanName, checkTag, normalizeTag } from "./game/clanTag.js";
import { DEFAULTS, sanitizeCvars } from "./game/cvars.js";

const PORT = Number(process.env.SITE_PORT ?? 3100);
// Адрес, который видит браузер. В разработке это приложение на 5273, а не мы:
// оно переливает /api сюда, поэтому Discord должен возвращать человека туда,
// иначе после входа он окажется на голом API вместо сайта.
const SITE_URL = process.env.SITE_URL ?? `http://127.0.0.1:${PORT}`;
const SECURE_COOKIES = SITE_URL.startsWith("https:");
const WEB_ROOT = resolve(process.env.WEB_ROOT ?? "var/site");
// Браузерный клиент с игровыми паками. Отдаём его сами, а не отдельным
// веб-сервером: лишняя движущая часть ради статики себя не окупает.
const GAME_ROOT = resolve(process.env.GAME_ROOT ?? "game/client");

const discord: DiscordConfig = {
  clientId: process.env.DISCORD_CLIENT_ID ?? "",
  clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  redirectUri: `${SITE_URL}/api/auth/discord/callback`,
};

const app = Fastify({
  logger: true,
  // За Traefik настоящий адрес клиента приходит в заголовке. Без этого
  // ограничитель частоты считал бы всех одним посетителем — адресом прокси.
  trustProxy: true,
});
await app.register(cookie, { secret: process.env.SESSION_SECRET ?? "" });

// Ограничитель частоты. Без него один скрипт забивает базу кланами и сессиями,
// а вход перебирают сколько угодно раз. Считаем по адресу.
await app.register(rateLimit, {
  global: false,
  max: 60,
  timeWindow: "1 minute",
});

/** Строже обычного: вход и создание — то, что перебирают. */
const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
const normal = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

/**
 * Заголовки безопасности. Ставим сами, а не надеемся на Traefik: он общий
 * для всех проектов хоста, и менять его настройки ради нас — значит трогать
 * чужое.
 *
 * connect-src обязан включать адрес моста: WebTransport подчиняется тому же
 * правилу, что и обычные запросы, и без этого игра просто не подключится.
 */
const BRIDGE_ORIGIN = process.env.ARENA_PUBLIC_BRIDGE
  ? `https://${process.env.ARENA_PUBLIC_BRIDGE}`
  : "";

const CSP = [
  "default-src 'self'",
  // wasm-unsafe-eval — это движок игры: без него WebAssembly не запустится
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // Аватары приходят из Discord
  "img-src 'self' https://cdn.discordapp.com data:",
  `connect-src 'self' ${BRIDGE_ORIGIN}`.trim(),
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

app.addHook("onSend", async (_request, reply) => {
  reply.header("content-security-policy", CSP);
  reply.header("x-content-type-options", "nosniff");
  reply.header("referrer-policy", "same-origin");
  if (SECURE_COOKIES)
    reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
});

const STATE_COOKIE = "arena_oauth_state";

app.get("/api/auth/discord", strict, async (_request, reply) => {
  if (!discord.clientId || !discord.clientSecret)
    return reply.code(503).send({ error: "Вход через Discord не настроен" });

  // Состояние в куке, а не в памяти: сайт может быть перезапущен или размножен,
  // и тогда состояние из памяти одного процесса другому неизвестно
  const state = randomBytes(16).toString("base64url");
  reply.setCookie(STATE_COOKIE, state, {
    path: "/api/auth",
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIES,
    maxAge: 600,
  });
  return reply.redirect(authorizeUrl(discord, state));
});

app.get("/api/auth/discord/callback", async (request, reply) => {
  const query = request.query as { code?: string; state?: string };
  const expected = request.cookies[STATE_COOKIE];
  reply.clearCookie(STATE_COOKIE, { path: "/api/auth" });

  // Без сверки состояния чужой сайт мог бы залогинить тебя своим аккаунтом
  if (!query.state || !expected || query.state !== expected)
    return reply.code(400).send({ error: "Состояние входа не совпало" });
  if (!query.code) return reply.code(400).send({ error: "Discord не вернул код" });

  const profile = await exchangeCode(discord, query.code);
  const user = await upsertDiscordUser(profile);
  const session = await startSession(user.id);

  reply.setCookie(COOKIE, session.token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIES,
    expires: session.expiresAt,
  });
  return reply.redirect("/");
});

app.post("/api/auth/logout", async (request, reply) => {
  await endSession(request.cookies[COOKIE]);
  reply.clearCookie(COOKIE, { path: "/" });
  return reply.send({ ok: true });
});

app.get("/api/me", normal, async (request, reply) => {
  const user = await findSessionUser(request.cookies[COOKIE]);
  if (!user) return reply.code(401).send({ error: "Не вошёл" });
  return reply.send({
    id: user.id,
    displayName: user.displayName,
    nick: user.nick,
    avatarUrl: user.avatarUrl,
    role: user.role,
    clan: (await getMembership(user.id)) ?? null,
  });
});

/** Всё дальше — только вошедшим. Гость получает 401 и идёт логиниться. */
async function requireUser(request: { cookies: Record<string, string | undefined> }) {
  return findSessionUser(request.cookies[COOKIE]);
}

app.get("/api/config", async (request, reply) => {
  const user = await requireUser(request);
  if (!user) return reply.code(401).send({ error: "Не вошёл" });
  return reply.send({ cvars: await getConfig(user.id) });
});

app.put("/api/config", normal, async (request, reply) => {
  const user = await requireUser(request);
  if (!user) return reply.code(401).send({ error: "Не вошёл" });

  const body = request.body as { cvars?: unknown };
  const cvars = sanitizeCvars(body?.cvars);
  await saveConfig(user.id, cvars);
  return reply.send({ cvars: { ...DEFAULTS, ...cvars } });
});

app.put("/api/profile/nick", strict, async (request, reply) => {
  const user = await requireUser(request);
  if (!user) return reply.code(401).send({ error: "Не вошёл" });

  const body = request.body as { nick?: unknown };
  if (typeof body?.nick !== "string") return reply.code(400).send({ error: "Нужен ник" });

  const result = await changeNick(user.id, body.nick);
  if ("error" in result) return reply.code(409).send({ error: result.error });
  return reply.send(result);
});

app.get("/api/clans", normal, async (_request, reply) => reply.send({ clans: await listClans() }));

app.get("/api/clans/:tag", async (request, reply) => {
  const { tag } = request.params as { tag: string };
  const clan = await getClan(normalizeTag(tag));
  if (!clan) return reply.code(404).send({ error: "Нет такого клана" });
  return reply.send({
    tag: clan.tag,
    name: clan.name,
    members: await getClanMembers(clan.id),
  });
});

app.post("/api/clans", strict, async (request, reply) => {
  const user = await requireUser(request);
  if (!user) return reply.code(401).send({ error: "Не вошёл" });

  const body = request.body as { tag?: unknown; name?: unknown };
  const tag = checkTag(String(body?.tag ?? ""));
  if ("error" in tag) return reply.code(400).send(tag);
  const name = checkClanName(String(body?.name ?? ""));
  if ("error" in name) return reply.code(400).send(name);

  const result = await createClan(user.id, tag.tag, name.name);
  if ("error" in result) return reply.code(409).send(result);
  return reply.send(result);
});

app.post("/api/clans/:tag/join", async (request, reply) => {
  const user = await requireUser(request);
  if (!user) return reply.code(401).send({ error: "Не вошёл" });
  const { tag } = request.params as { tag: string };
  const result = await joinClan(user.id, normalizeTag(tag));
  if ("error" in result) return reply.code(409).send(result);
  return reply.send(result);
});

app.post("/api/clans/leave", async (request, reply) => {
  const user = await requireUser(request);
  if (!user) return reply.code(401).send({ error: "Не вошёл" });
  const result = await leaveClan(user.id);
  if ("error" in result) return reply.code(409).send(result);
  return reply.send(result);
});

/**
 * Ссылка в игру для вошедшего. Билет выписывает сайт, проверяет мост —
 * игровой сервер о людях ничего не знает, он видит только адреса.
 */
app.post("/api/play", strict, async (request, reply) => {
  const user = await requireUser(request);
  if (!user) return reply.code(401).send({ error: "Не вошёл" });

  const secret = process.env.ARENA_TICKET_SECRET ?? "";
  if (!secret) return reply.code(503).send({ error: "Вход в игру не настроен" });

  const bridge = process.env.ARENA_PUBLIC_BRIDGE ?? "";
  if (!bridge) return reply.code(503).send({ error: "Не задан адрес моста" });

  const ban = await activeBan(user.id);
  if (ban)
    return reply.code(403).send({
      error: ban.until
        ? `Доступ закрыт до ${ban.until.toLocaleString("ru")}: ${ban.reason}`
        : `Доступ закрыт: ${ban.reason}`,
    });

  // Билет живёт час: он нужен ровно на то, чтобы войти. Матч от этого не
  // прервётся — мост проверяет билет один раз, на открытии сессии.
  const ticket = issueTicket(
    {
      room: process.env.ARENA_ROOM ?? "arena",
      name: user.nick,
      nonce: newNonce(),
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
    secret,
  );

  const url = new URL("/play/", SITE_URL);
  url.searchParams.set("connect", bridge);
  url.searchParams.set("i", ticket);
  return reply.send({ url: url.toString() });
});

/** Пускает только администратора. Остальным — 404, а не 403: незачем
 * подсказывать, что панель вообще существует. */
async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await findSessionUser(request.cookies[COOKIE]);
  if (user?.role !== "admin") {
    reply.code(404).send({ error: "Нет такого" });
    return undefined;
  }
  return user;
}

app.get("/api/admin/players", normal, async (request, reply) => {
  const admin = await requireAdmin(request, reply);
  if (!admin) return;
  return reply.send({ players: await listPlayers() });
});

app.post("/api/admin/ban", strict, async (request, reply) => {
  const admin = await requireAdmin(request, reply);
  if (!admin) return;

  const body = request.body as { userId?: string; reason?: string; days?: number };
  if (!body?.userId || !body.reason?.trim())
    return reply.code(400).send({ error: "Нужны игрок и повод" });

  // Повод обязателен не из вежливости: без него через месяц никто не вспомнит,
  // за что человек забанен, и снять бан будет не на чем.
  const until =
    body.days && body.days > 0 ? new Date(Date.now() + body.days * 24 * 3600 * 1000) : null;

  const result = await banPlayer(body.userId, admin.id, body.reason.trim(), until);
  if ("error" in result) return reply.code(409).send(result);
  return reply.send(result);
});

app.post("/api/admin/unban", strict, async (request, reply) => {
  const admin = await requireAdmin(request, reply);
  if (!admin) return;
  const body = request.body as { userId?: string };
  if (!body?.userId) return reply.code(400).send({ error: "Нужен игрок" });
  await unbanPlayer(body.userId);
  return reply.send({ ok: true });
});

app.post("/api/admin/role", strict, async (request, reply) => {
  const admin = await requireAdmin(request, reply);
  if (!admin) return;
  const body = request.body as { userId?: string; role?: string };
  if (!body?.userId || (body.role !== "player" && body.role !== "admin"))
    return reply.code(400).send({ error: "Нужны игрок и роль" });
  // Снять роль с себя можно: иначе последний администратор заперт в роли
  // навсегда. Но тогда он теряет панель — это его осознанный выбор.
  await setRole(body.userId, body.role);
  return reply.send({ ok: true });
});

app.get("/api/health", async () => ({ ok: true }));

// Собранное приложение отдаём сами. Отдельный веб-сервер под три файла — лишняя
// движущаяся часть; в боевом контуре перед нами и так стоит Traefik.
// Каталога нет — значит запущены в разработке, где приложение раздаёт vite.
const PLAY_COOKIE = "arena_play";

/**
 * Игру и паки отдаём не всем.
 *
 * Дело не во взломе: pak0.pk3 — контент id Software, и оставлять его открытым
 * значит раздавать чужой товар всему интернету. Пускаем двоих: вошедшего и
 * того, у кого на руках наш подписанный билет.
 *
 * Билет приходит в ссылке-приглашении один раз, а паков в ней два десятка,
 * и параметра в них нет. Поэтому при первом заходе кладём короткий кук —
 * дальше по нему.
 */
async function guardPlay(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.cookies[PLAY_COOKIE] === "1") return;
  if (await findSessionUser(request.cookies[COOKIE])) return;

  const secret = process.env.ARENA_TICKET_SECRET ?? "";
  const offered = (request.query as { i?: string }).i;
  if (secret && offered && !("error" in checkTicket(offered, secret))) {
    reply.setCookie(PLAY_COOKIE, "1", {
      path: "/play",
      httpOnly: true,
      sameSite: "lax",
      secure: SECURE_COOKIES,
      maxAge: 6 * 3600,
    });
    return;
  }

  return reply.code(403).send({ error: "Нужен вход или приглашение" });
}

if (existsSync(GAME_ROOT)) {
  // Отдельная область видимости: проверка нужна только на /play/, а хук,
  // навешенный на всё приложение, закрыл бы и вход, и сам сайт.
  await app.register(async (scope) => {
    scope.addHook("onRequest", guardPlay);
    await scope.register(fastifyStatic, {
      root: GAME_ROOT,
      prefix: "/play/",
      // Второй раз украшать reply нельзя — первый уже это сделал
      decorateReply: false,
      // Паки не меняются никогда: у них в имени версия игры, а не хеш
      maxAge: "30d",
    });
  });
  app.log.info(`отдаю игру из ${GAME_ROOT}`);
}

if (existsSync(WEB_ROOT)) {
  await app.register(fastifyStatic, { root: WEB_ROOT });
  // Пути вроде /clans/OSP существуют только в браузере: на диске такого файла
  // нет, и без этого перезагрузка страницы отдавала бы 404.
  //
  // Но подменять этим ЛЮБОЙ промах нельзя. Отсутствующий файл возвращался бы
  // страницей сайта с кодом 200, и тот, кто его запрашивал, принимал бы разметку
  // за содержимое. На этом клиент однажды и слёг: он принял index.html за
  // отпечаток сертификата и умер на его разборе. Поэтому /api/ и /play/
  // отвечают честным 404.
  const REAL_404 = ["/api/", "/play/"];
  app.setNotFoundHandler((request, reply) => {
    if (REAL_404.some((prefix) => request.url.startsWith(prefix)))
      return reply.code(404).send({ error: "Нет такого" });
    return reply.sendFile("index.html");
  });
  app.log.info(`отдаю приложение из ${WEB_ROOT}`);
}

// В контейнере слушать только петлю нельзя: до нас не достучится Traefik.
// Наружу порт при этом не проброшен — снаружи виден только маршрутизатор.
await app.listen({ port: PORT, host: process.env.SITE_HOST ?? "127.0.0.1" });
