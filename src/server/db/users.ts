// Работа с игроками в базе. Отдельно от чистых функций (auth/nick.ts):
// иначе тесты на них тянули бы за собой подключение к базе.
import { eq } from "drizzle-orm";
import { toNick } from "../auth/nick.js";
import { DEFAULTS } from "../game/cvars.js";
import { db, schema } from "./index.js";

/** Ники уникальны: по ним в логах узнаётся игрок. Занят — добавляем число. */
export async function freeNick(raw: string): Promise<string> {
  const base = toNick(raw);
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 17)}${attempt}`;
    const taken = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.nick, candidate))
      .limit(1);
    if (taken.length === 0) return candidate;
  }
  throw new Error(`Не удалось подобрать свободный ник для «${raw}»`);
}

/** Заводит игрока при первом входе, дальше только обновляет профиль. */
export async function upsertDiscordUser(profile: {
  id: string;
  username: string;
  globalName: string | undefined;
  avatarUrl: string | undefined;
}) {
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.discordId, profile.id))
    .limit(1);

  const displayName = profile.globalName ?? profile.username;

  const found = existing[0];
  if (found) {
    // Ник не трогаем: он уже в логах матчей и в чужой памяти
    const [updated] = await db
      .update(schema.users)
      .set({
        displayName,
        avatarUrl: profile.avatarUrl ?? null,
        // Роль основателя восстанавливается при каждом входе: если её случайно
        // сняли, доступ к панели не теряется навсегда
        ...(process.env.ARENA_ADMIN_DISCORD_ID === profile.id ? { role: "admin" as const } : {}),
      })
      .where(eq(schema.users.id, found.id))
      .returning();
    if (!updated) throw new Error("Не удалось обновить профиль");
    return updated;
  }

  // Первый администратор назначается по .env: иначе назначать было бы некому,
  // а лезть в базу руками после каждой установки — плохая замена настройке.
  const isFounder = process.env.ARENA_ADMIN_DISCORD_ID === profile.id;

  const [created] = await db
    .insert(schema.users)
    .values({
      discordId: profile.id,
      displayName,
      nick: await freeNick(displayName),
      avatarUrl: profile.avatarUrl ?? null,
      role: isFounder ? "admin" : "player",
    })
    .returning();
  if (!created) throw new Error("Не удалось создать игрока");
  return created;
}

/** Конфиг игрока. Нет записи — отдаём значения по умолчанию. */
export async function getConfig(userId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ cvars: schema.configs.cvars })
    .from(schema.configs)
    .where(eq(schema.configs.userId, userId))
    .limit(1);
  return { ...DEFAULTS, ...(rows[0]?.cvars ?? {}) };
}

export async function saveConfig(userId: string, cvars: Record<string, string>): Promise<void> {
  await db
    .insert(schema.configs)
    .values({ userId, cvars, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.configs.userId,
      set: { cvars, updatedAt: new Date() },
    });
}

/** Смена ника. Занят — говорим об этом, а не молча подставляем другой. */
export async function changeNick(
  userId: string,
  raw: string,
): Promise<{ nick: string } | { error: "занят" | "пустой" }> {
  const nick = toNick(raw);
  if (nick === "player" && toNick(raw) !== raw.toLowerCase()) return { error: "пустой" };

  const taken = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.nick, nick))
    .limit(1);
  const owner = taken[0];
  if (owner && owner.id !== userId) return { error: "занят" };

  await db.update(schema.users).set({ nick }).where(eq(schema.users.id, userId));
  return { nick };
}
