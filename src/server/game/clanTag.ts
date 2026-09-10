// Проверка тега клана.
//
// Тег видно в игре перед ником, поэтому он живёт по правилам шрифта Quake:
// латиница и цифры, коротко. Длинный тег вытеснит сам ник из таблицы счёта.
const TAG = /^[A-Z0-9]{2,6}$/;

export function normalizeTag(raw: string): string {
  return raw.trim().toUpperCase();
}

export function checkTag(raw: string): { tag: string } | { error: string } {
  const tag = normalizeTag(raw);
  if (!TAG.test(tag)) return { error: "Тег: от 2 до 6 символов, латиница и цифры" };
  return { tag };
}

export function checkClanName(raw: string): { name: string } | { error: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) return { error: "Название: от 2 до 40 символов" };
  return { name };
}
