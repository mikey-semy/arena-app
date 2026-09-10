import { describe, expect, it } from "vitest";
import { ALLOWED, DEFAULTS, sanitizeCvars } from "./cvars.js";

describe("конфиг игрока", () => {
  it("пропускает разрешённое", () => {
    expect(sanitizeCvars({ sensitivity: "2.5", cg_fov: "110" })).toEqual({
      sensitivity: "2.5",
      cg_fov: "110",
    });
  });

  it("выбрасывает всё, чего нет в списке", () => {
    expect(sanitizeCvars({ r_gamma: "3", cg_drawGun: "0" })).toEqual({ cg_drawGun: "0" });
  });

  it("зажимает числа в границы, а не отвергает", () => {
    expect(sanitizeCvars({ sensitivity: "999" })).toEqual({ sensitivity: "30" });
    expect(sanitizeCvars({ sensitivity: "-5" })).toEqual({ sensitivity: "0.1" });
  });

  it("не пропускает значение вне списка выбора", () => {
    expect(sanitizeCvars({ cg_drawCrosshair: "42" })).toEqual({});
  });

  it("мусор не роняет разбор", () => {
    for (const junk of [null, undefined, 0, "строка", [], { sensitivity: {} }])
      expect(() => sanitizeCvars(junk)).not.toThrow();
  });

  it("значения по умолчанию сами проходят проверку", () => {
    expect(sanitizeCvars(DEFAULTS)).toEqual(DEFAULTS);
    expect(Object.keys(DEFAULTS)).toEqual(Object.keys(ALLOWED));
  });
});
