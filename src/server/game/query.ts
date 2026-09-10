// Опрос игрового сервера.
//
// Разговариваем с ним тем же внесетевым протоколом Quake, что и любой клиент:
// четыре байта 0xFF, дальше команда. Никакого своего канала заводить не нужно
// и не стоит — этот работает с 1999 года и переживёт нас.
import { createSocket } from "node:dgram";

const HOST = process.env.ARENA_GAME_HOST ?? "127.0.0.1";
const PORT = Number(process.env.ARENA_GAME_PORT ?? 27960);
const PREFIX = Buffer.from([0xff, 0xff, 0xff, 0xff]);

export type Player = {
  name: string;
  score: number;
  ping: number;
  /** Бот. Отличается нулевым пингом — других признаков протокол не даёт. */
  bot: boolean;
};

export type ServerState = {
  map: string;
  gametype: string;
  hostname: string;
  maxClients: number;
  players: Player[];
  humans: number;
  bots: number;
};

/** Одна посылка, один ответ. Молчание — это ответ «сервер лежит». */
function ask(command: string, timeoutMs = 1500): Promise<Buffer | undefined> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    const done = (value: Buffer | undefined) => {
      socket.close();
      resolve(value);
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);

    socket.on("message", (message) => {
      clearTimeout(timer);
      done(message);
    });
    socket.on("error", () => {
      clearTimeout(timer);
      done(undefined);
    });
    socket.send(Buffer.concat([PREFIX, Buffer.from(command, "latin1")]), PORT, HOST);
  });
}

/** Цветовые коды Quake (^1..^7) в имени — разметка, а не текст. */
function stripColors(name: string): string {
  return name.replace(/\^[0-9]/g, "");
}

export async function serverState(): Promise<ServerState | undefined> {
  const reply = await ask("getstatus arena");
  if (!reply) return undefined;

  const lines = reply.subarray(4).toString("latin1").split("\n");
  const raw = lines[1] ?? "";
  const parts = raw.split("\\");
  const info: Record<string, string> = {};
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const key = parts[i];
    const value = parts[i + 1];
    if (key !== undefined && value !== undefined) info[key] = value;
  }

  const players: Player[] = [];
  for (const line of lines.slice(2)) {
    const match = /^(-?\d+)\s+(\d+)\s+"(.*)"$/.exec(line.trim());
    if (!match) continue;
    const ping = Number(match[2]);
    players.push({
      score: Number(match[1]),
      ping,
      name: stripColors(match[3] ?? ""),
      bot: ping === 0,
    });
  }

  return {
    map: info.mapname ?? "?",
    gametype: info.g_gametype ?? "?",
    hostname: stripColors(info.sv_hostname ?? "arena"),
    maxClients: Number(info.sv_maxclients ?? 0),
    players,
    humans: players.filter((p) => !p.bot).length,
    bots: players.filter((p) => p.bot).length,
  };
}
