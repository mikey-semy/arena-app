// Кланы: справочник, состав, вступление и выход.
import { and, asc, count, eq, sql } from "drizzle-orm";
import { db, schema } from "./index.js";

export type ClanRow = {
  tag: string;
  name: string;
  members: number;
};

/** Справочник. Сортируем по составу: живые кланы интереснее пустых. */
export async function listClans(): Promise<ClanRow[]> {
  return db
    .select({
      tag: schema.clans.tag,
      name: schema.clans.name,
      members: count(schema.clanMembers.userId),
    })
    .from(schema.clans)
    .leftJoin(schema.clanMembers, eq(schema.clanMembers.clanId, schema.clans.id))
    .groupBy(schema.clans.id)
    .orderBy(sql`count(${schema.clanMembers.userId}) desc`, asc(schema.clans.tag));
}

export async function getClan(tag: string) {
  const rows = await db.select().from(schema.clans).where(eq(schema.clans.tag, tag)).limit(1);
  return rows[0];
}

export async function getClanMembers(clanId: string) {
  return db
    .select({
      nick: schema.users.nick,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      role: schema.clanMembers.role,
    })
    .from(schema.clanMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.clanMembers.userId))
    .where(eq(schema.clanMembers.clanId, clanId))
    .orderBy(asc(schema.clanMembers.joinedAt));
}

/** В каком клане состоит игрок. Клан не более одного — так в CA и заведено. */
export async function getMembership(userId: string) {
  const rows = await db
    .select({ tag: schema.clans.tag, name: schema.clans.name, role: schema.clanMembers.role })
    .from(schema.clanMembers)
    .innerJoin(schema.clans, eq(schema.clans.id, schema.clanMembers.clanId))
    .where(eq(schema.clanMembers.userId, userId))
    .limit(1);
  return rows[0];
}

export async function createClan(
  userId: string,
  tag: string,
  name: string,
): Promise<{ tag: string } | { error: string }> {
  if (await getMembership(userId)) return { error: "Ты уже в клане" };
  if (await getClan(tag)) return { error: "Тег занят" };

  // Создание клана и вступление в него — одно событие. Разорви их, и при сбое
  // между шагами останется клан без единого участника, в том числе без лидера.
  return db.transaction(async (tx) => {
    const [clan] = await tx
      .insert(schema.clans)
      .values({ tag, name, createdBy: userId })
      .returning();
    if (!clan) return { error: "Не удалось создать клан" };
    await tx.insert(schema.clanMembers).values({ clanId: clan.id, userId, role: "leader" });
    return { tag: clan.tag };
  });
}

export async function joinClan(
  userId: string,
  tag: string,
): Promise<{ ok: true } | { error: string }> {
  if (await getMembership(userId)) return { error: "Ты уже в клане" };
  const clan = await getClan(tag);
  if (!clan) return { error: "Нет такого клана" };
  await db.insert(schema.clanMembers).values({ clanId: clan.id, userId, role: "member" });
  return { ok: true };
}

export async function leaveClan(userId: string): Promise<{ ok: true } | { error: string }> {
  const membership = await getMembership(userId);
  if (!membership) return { error: "Ты не в клане" };
  const clan = await getClan(membership.tag);
  if (!clan) return { error: "Нет такого клана" };

  if (membership.role === "leader") {
    // Клан без лидера некому распустить и некому пополнять, поэтому последний
    // лидер сначала передаёт роль. Иначе получился бы осиротевший клан.
    const leaders = await db
      .select({ userId: schema.clanMembers.userId })
      .from(schema.clanMembers)
      .where(and(eq(schema.clanMembers.clanId, clan.id), eq(schema.clanMembers.role, "leader")));
    if (leaders.length <= 1) return { error: "Сначала передай роль лидера" };
  }

  await db.delete(schema.clanMembers).where(eq(schema.clanMembers.userId, userId));
  return { ok: true };
}
