import { describe, expect, it } from "vitest";
import { checkClanName, checkTag } from "./clanTag.js";

describe("тег клана", () => {
  it("приводится к верхнему регистру", () => {
    expect(checkTag(" osp ")).toEqual({ tag: "OSP" });
  });

  it("кириллица не проходит: шрифт Quake её не нарисует", () => {
    expect(checkTag("КЛАН")).toHaveProperty("error");
  });

  it("слишком короткий и слишком длинный не проходят", () => {
    expect(checkTag("A")).toHaveProperty("error");
    expect(checkTag("ABCDEFG")).toHaveProperty("error");
  });

  it("название схлопывает пробелы", () => {
    expect(checkClanName("  Злые   Гуси  ")).toEqual({ name: "Злые Гуси" });
  });

  it("пустое название не проходит", () => {
    expect(checkClanName(" ")).toHaveProperty("error");
  });
});
