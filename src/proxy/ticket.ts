// Билет на вход в игру.
//
// Приглашение — это ссылка с билетом. Мост его проверяет и только тогда пускает
// к игровому серверу. Билет подписан и самодостаточен: базы данных нет и пока
// не нужно, а значит нечего терять и нечего чинить при перезапуске.
//
// Формат: <данные>.<подпись>, обе части в base64url.
// Подпись — HMAC-SHA256 по строке данных, ключ в .env.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type Ticket = {
  /** Случайная метка. Нужна, чтобы билет можно было погасить после входа. */
  nonce: string;
  /** Матч, в который зовут. Пока один, но нумеровать надо с самого начала. */
  room: string;
  /** Имя приглашённого — по нему статистика из логов свяжется с человеком. */
  name: string;
  /** Момент, после которого билет недействителен, в секундах эпохи. */
  expires: number;
};

const encode = (data: Buffer | string): string => Buffer.from(data).toString("base64url");

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Метка для нового билета. Отдельной функцией, чтобы её не забыли проставить. */
export function newNonce(): string {
  return randomBytes(9).toString("base64url");
}

export function issueTicket(ticket: Ticket, secret: string): string {
  const payload = encode(JSON.stringify(ticket));
  return `${payload}.${sign(payload, secret)}`;
}

/** Возвращает билет или причину отказа — так вызывающий может её записать. */
export function checkTicket(
  raw: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): { ticket: Ticket } | { error: string } {
  const dot = raw.indexOf(".");
  if (dot <= 0) return { error: "не билет" };

  const payload = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1), "base64url");
  const want = Buffer.from(sign(payload, secret), "base64url");

  // Сравнение за постоянное время: иначе по времени ответа можно подобрать
  // подпись побайтно
  if (given.length !== want.length || !timingSafeEqual(given, want))
    return { error: "подпись не сходится" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { error: "данные не читаются" };
  }

  const ticket = parsed as Partial<Ticket>;
  if (
    typeof ticket.room !== "string" ||
    typeof ticket.name !== "string" ||
    typeof ticket.nonce !== "string" ||
    typeof ticket.expires !== "number"
  )
    return { error: "не хватает полей" };

  if (ticket.expires <= now) return { error: "просрочен" };

  return {
    ticket: {
      room: ticket.room,
      name: ticket.name,
      nonce: ticket.nonce,
      expires: ticket.expires,
    },
  };
}
