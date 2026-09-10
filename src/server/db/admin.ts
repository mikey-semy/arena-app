// Администрирование: роли и баны.
import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { db, schema } from "./index.js";

export type BanInfo = { reason: string; until: Date | null };

/** Действующий бан игрока. Истёкший не считается и мешать не должен. */
export async function activeBan(userId: string): Promise<BanInfo | undefined> {
  const rows = await db
    .select({ reason: schema.bans.reason, until: schema.bans.until })
    .from(schema.bans)
    .where(
      and(
        eq(schema.bans.userId, userId),
        or(isNull(schema.bans.until), gt(schema.bans.until, new Date())),
      ),
    )
    .limit(1);
  return rows[0];
}

/** То же, но по нику: мост знает игрока только по нему. */
export async function activeBanByNick(nick: string): Promise<BanInfo | undefined> {
  const rows = await db
    .select({ reason: schema.bans.reason, until: schema.bans.until })
    .from(schema.bans)
    .innerJoin(schema.users, eq(schema.users.id, schema.bans.userId))
    .where(
      and(
        eq(schema.users.nick, nick),
        or(isNull(schema.bans.until), gt(schema.bans.until, new Date())),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function listPlayers() {
  return db
    .select({
      id: schema.users.id,
      nick: schema.users.nick,
      displayName: schema.users.displayName,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
      banReason: schema.bans.reason,
      banUntil: schema.bans.until,
    })
    .from(schema.users)
    .leftJoin(schema.bans, eq(schema.bans.userId, schema.users.id))
    .orderBy(asc(schema.users.nick));
}

export async function banPlayer(
  userId: string,
  by: string,
  reason: string,
  until: Date | null,
): Promise<{ ok: true } | { error: string }> {
  if (userId === by) return { error: "Себя банить незачем" };

  const target = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!target[0]) return { error: "Нет такого игрока" };
  // Иначе двое администраторов могут заблокировать друг друга и остаться
  // без панели вдвоём. Роль снимается отдельно и осознанно.
  if (target[0].role === "admin") return { error: "Сначала снимите роль администратора" };

  await db
    .insert(schema.bans)
    .values({ userId, reason, until, bannedBy: by })
    .onConflictDoUpdate({
      target: schema.bans.userId,
      set: { reason, until, bannedBy: by, createdAt: new Date() },
    });
  return { ok: true };
}

export async function unbanPlayer(userId: string): Promise<void> {
  await db.delete(schema.bans).where(eq(schema.bans.userId, userId));
}

export async function setRole(userId: string, role: "player" | "admin"): Promise<void> {
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
}
