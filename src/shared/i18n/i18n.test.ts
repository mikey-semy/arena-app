import { describe, expect, it, vi } from "vitest";
import { en } from "./en.js";
import { pickLang, setLang, t } from "./index.js";
import { ru } from "./ru.js";

describe("подписи", () => {
  it("словари покрывают одни и те же ключи", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  it("ни одна подпись не пустая", () => {
    for (const [key, value] of [...Object.entries(ru), ...Object.entries(en)])
      expect(value, key).not.toBe("");
  });

  it("язык берётся из предпочтений браузера", () => {
    expect(pickLang(["ru-RU", "en"])).toBe("ru");
    expect(pickLang(["en-US"])).toBe("en");
    expect(pickLang([])).toBe("en");
  });

  it("выбор человека важнее настроек браузера", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    store.set("arena.lang", "en");
    expect(pickLang(["ru-RU"])).toBe("en");
    store.set("arena.lang", "ru");
    expect(pickLang(["en-US"])).toBe("ru");
    // Мусор в хранилище не должен ломать выбор
    store.set("arena.lang", "клингонский");
    expect(pickLang(["ru-RU"])).toBe("ru");
    vi.unstubAllGlobals();
  });

  it("t() отдаёт подпись выбранного языка", () => {
    setLang("en");
    expect(t("auth.signIn")).toBe(en["auth.signIn"]);
    setLang("ru");
    expect(t("auth.signIn")).toBe(ru["auth.signIn"]);
  });
});
