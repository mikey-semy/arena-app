// Русские подписи. Ключи — по смыслу, а не по месту на экране: подпись
// переезжает, смысл остаётся.
export const ru = {
  "app.title": "arena",
  "app.tagline": "Clan Arena в браузере",

  "nav.play": "Играть",
  "nav.clans": "Кланы",
  "nav.matches": "Матчи",
  "nav.profile": "Профиль",

  "auth.signIn": "Войти через Discord",
  "auth.signOut": "Выйти",
  "auth.needed": "Чтобы играть, нужно войти",
  "auth.notConfigured": "Вход через Discord пока не настроен",

  "play.now": "Играть",
  "play.opening": "Открываю…",
  "play.first": "Первый заход долгий: игра целиком качается в браузер",
  "play.needAuth": "Войди, чтобы играть",

  "own.title": "Нужна своя копия игры",
  "own.why":
    "arena не раздаёт Quake III Arena — это чужой товар. Игра берётся из твоей копии, и покупается она один раз.",
  "own.buy": "Купить в Steam",

  "nav.admin": "Админка",
  "admin.title": "Игроки",
  "admin.ban": "Забанить",
  "admin.unban": "Снять бан",
  "admin.reason": "Повод",
  "admin.days": "Дней (0 — навсегда)",
  "admin.banned": "Забанен",
  "admin.forever": "навсегда",
  "admin.makeAdmin": "Сделать админом",
  "admin.dropAdmin": "Снять админа",
  "admin.role": "Роль",

  "footer.source": "исходники",

  "clans.title": "Кланы",
  "clans.empty": "Кланов пока нет — заведи первый",
  "clans.create": "Создать клан",
  "clans.tag": "Тег",
  "clans.tagHint": "2–6 символов латиницей: тег видно в игре перед ником",
  "clans.name": "Название",
  "clans.members": "Состав",
  "clans.membersCount": "человек",
  "clans.join": "Вступить",
  "clans.leave": "Выйти из клана",
  "clans.yours": "Твой клан",
  "clans.leader": "лидер",
  "clans.notFound": "Такого клана нет",

  "profile.title": "Профиль",
  "profile.nick": "Ник в игре",
  "profile.nickHint": "Латиница: шрифт Quake 3 другого не знает",
  "profile.displayName": "Имя на сайте",
  "profile.save": "Сохранить",
  "profile.saved": "Сохранено",

  "config.title": "Настройки игры",
  "config.hint": "Конфиг живёт в аккаунте и приезжает в браузер сам",
  "config.sensitivity": "Чувствительность мыши",
  "config.fov": "Угол обзора",
  "config.crosshair": "Прицел",
  "config.reset": "Вернуть как было",

  "common.loading": "Загружаю…",
  "common.error": "Что-то пошло не так",
} as const;

export type Key = keyof typeof ru;
