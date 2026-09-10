// Подписи берутся только через t(). Ни одной строки текста в компонентах —
// правило записано в AGENTS.md и действует с первого компонента.
//
// Язык ставится один раз при загрузке, а переключение перезагружает страницу.
// Переключение без перезагрузки потребовало бы контекста, подписки и прогона
// всех компонентов через хук — ради контрола, которым пользуются один раз
// в жизни аккаунта. Перезагрузка стоит миллисекунды и не стоит ни строчки.
import { en } from "./en.js";
import { type Key, ru } from "./ru.js";

export type Lang = "ru" | "en";

export const LANGS: readonly Lang[] = ["ru", "en"];

const dictionaries: Record<Lang, Record<Key, string>> = { ru, en };
const STORED = "arena.lang";

function isLang(value: string | null): value is Lang {
  return value === "ru" || value === "en";
}

/**
 * Выбранный язык, иначе язык браузера, иначе английский.
 * Выбор человека важнее настроек браузера: он мог их не менять годами.
 */
export function pickLang(preferred: readonly string[]): Lang {
  const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(STORED);
  if (isLang(stored)) return stored;
  return preferred.some((code) => code.toLowerCase().startsWith("ru")) ? "ru" : "en";
}

let current: Lang = "ru";

export function setLang(lang: Lang): void {
  current = lang;
}

export function currentLang(): Lang {
  return current;
}

/** Запоминает выбор и перезагружает страницу — см. пояснение сверху. */
export function chooseLang(lang: Lang): void {
  try {
    localStorage.setItem(STORED, lang);
  } catch {
    // Приватный режим или запрет на хранилище: язык не запомнится, но
    // переключится на эту сессию — это лучше, чем упасть
  }
  location.reload();
}

export function t(key: Key): string {
  return dictionaries[current][key];
}
