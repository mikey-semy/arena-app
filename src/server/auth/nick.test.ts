import { describe, expect, it } from "vitest";
import { toNick } from "./nick.js";

describe("ник для игры", () => {
  it("кириллица становится латиницей", () => {
    expect(toNick("Витя")).toBe("vitya");
    expect(toNick("Щука")).toBe("schuka");
  });

  it("посторонние символы схлопываются в подчёркивание", () => {
    expect(toNick("злой  игрок!!")).toBe("zloy_igrok");
  });

  it("длина ограничена", () => {
    expect(toNick("a".repeat(50))).toHaveLength(20);
  });

  it("пустое имя не проходит дальше", () => {
    expect(toNick("!!!")).toBe("player");
    expect(toNick("")).toBe("player");
  });
});
