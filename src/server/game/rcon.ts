// Управление игровым сервером на ходу.
//
// rcon — родной механизм Quake: команда уходит одной датаграммой вместе
// с паролем. Пароль ходит открытым текстом, поэтому сервер слушает rcon
// только во внутренней сети — снаружи к нему не подойти.
import { createSocket } from "node:dgram";

const HOST = process.env.ARENA_GAME_HOST ?? "127.0.0.1";
const PORT = Number(process.env.ARENA_GAME_PORT ?? 27960);
const PASSWORD = process.env.Q3_RCON_PASSWORD ?? "";

export function rconAvailable(): boolean {
  return PASSWORD.length > 0;
}

export function rcon(command: string): Promise<string | undefined> {
  if (!PASSWORD) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    const done = (value: string | undefined) => {
      socket.close();
      resolve(value);
    };
    const timer = setTimeout(() => done(undefined), 1500);

    socket.on("message", (message) => {
      clearTimeout(timer);
      done(message.subarray(4).toString("latin1"));
    });
    socket.on("error", () => {
      clearTimeout(timer);
      done(undefined);
    });

    const payload = Buffer.from(`rcon ${PASSWORD} ${command}`, "latin1");
    socket.send(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), payload]), PORT, HOST);
  });
}
