// Схема базы. Меняется только через миграции: just db-generate, just db-migrate.
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Игрок. Вход через Discord, поэтому паролей здесь нет и не будет —
 * нам нечего хранить и нечего терять.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Идентификатор в Discord — по нему узнаём вернувшегося игрока. */
    discordId: text("discord_id").notNull(),
    /** Как человека зовут на сайте. Приходит из Discord, дальше можно менять. */
    displayName: text("display_name").notNull(),
    /**
     * Ник в игре. Латиница, потому что шрифт Quake 3 другого не знает.
     * Цветовые коды (^1..^7) хранятся как есть — они часть ника.
     */
    nick: text("nick").notNull(),
    avatarUrl: text("avatar_url"),
    /**
     * Роль. Первый администратор назначается по ARENA_ADMIN_DISCORD_ID при
     * входе — иначе назначать было бы некому: панель без администратора
     * бесполезна, а раздавать роль руками в базе каждый раз незачем.
     */
    role: text("role").$type<"player" | "admin">().notNull().default("player"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_discord_id_key").on(table.discordId),
    uniqueIndex("users_nick_key").on(table.nick),
  ],
);

/**
 * Сессия входа. Живёт в базе, а не в подписанном куке: так вход можно
 * оборвать — угнанный кук иначе действителен до самого срока.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

/**
 * Игровой конфиг. Раньше его таскали файлом с машины на машину —
 * теперь он живёт в аккаунте и приезжает в браузер сам.
 * Хранится как набор cvar, а не куском текста: так его можно показать
 * редактором и проверить значения.
 */
export const configs = pgTable("configs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  cvars: jsonb("cvars").$type<Record<string, string>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Клан. Тег — то, что видно в игре перед ником, поэтому короткий и латиницей.
 */
export const clans = pgTable(
  "clans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** 2–6 символов, верхний регистр. Уникален: по нему клан и узнают. */
    tag: text("tag").notNull(),
    name: text("name").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("clans_tag_key").on(table.tag)],
);

/**
 * Состав. Игрок состоит не более чем в одном клане — так в Clan Arena и
 * заведено, а разрешив несколько, мы не смогли бы ответить, за кого он играет.
 * Отсюда уникальность по userId, а не составной ключ.
 */
export const clanMembers = pgTable(
  "clan_members",
  {
    clanId: uuid("clan_id")
      .notNull()
      .references(() => clans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** leader может звать и выгонять; последний leader из клана не уходит. */
    role: text("role").$type<"leader" | "member">().notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("clan_members_user_key").on(table.userId),
    index("clan_members_clan_idx").on(table.clanId),
  ],
);

/**
 * Бан. Бьёт там, где игрок реально проходит, — на мосту: без билета в игру
 * не войти, а билет забаненному не выпишут и предъявленный не примут.
 *
 * Строка на игрока, а не история: снятый бан не нужно хранить, а нужный
 * повод остаётся в reason. Историю заведём, когда понадобится разбирать споры.
 */
export const bans = pgTable("bans", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  /** Пусто — навсегда. */
  until: timestamp("until", { withTimezone: true }),
  bannedBy: uuid("banned_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
