// Сессии входа.
//
// Идентификатор сессии — случайные 32 байта, в базе лежит его хеш. Причина
// простая: дамп базы не должен давать возможность войти чужими сессиями,
// а сравнивать нам нужно только на равенство.
import { createHash, randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db, schema } from "../db/index.js";

const DAYS = 30;
export const COOKIE = "arena_session";

const hash = (token: string): string => createHash("sha256").update(token).digest("hex");

export async function startSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DAYS * 24 * 3600 * 1000);
  await db.insert(schema.sessions).values({ id: hash(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function findSessionUser(token: string | undefined) {
  if (!token) return undefined;

  const rows = await db
    .select({ user: schema.users, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, hash(token)))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  if (row.expiresAt.getTime() <= Date.now()) {
    await endSession(token);
    return undefined;
  }
  return row.user;
}

export async function endSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(schema.sessions).where(eq(schema.sessions.id, hash(token)));
}

/** Протухшие сессии никому не мешают, но и копить их незачем. */
export async function dropExpiredSessions(): Promise<void> {
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}
