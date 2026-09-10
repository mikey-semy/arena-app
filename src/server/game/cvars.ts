// Что игроку разрешено менять в своём конфиге.
//
// Список закрытый, и это не перестраховка: значения подставляются в клиент при
// запуске, а через cvar Quake настраивается вообще всё, включая то, что даёт
// преимущество. Разрешаем ровно то, что относится к удобству, а не к силе.
export type CvarSpec =
  | { kind: "number"; min: number; max: number; fallback: string }
  | { kind: "choice"; values: readonly string[]; fallback: string };

export const ALLOWED: Record<string, CvarSpec> = {
  /** Чувствительность мыши. */
  sensitivity: { kind: "number", min: 0.1, max: 30, fallback: "3" },
  /** Угол обзора. Верхняя граница — 130: дальше движок начинает искажать модели. */
  cg_fov: { kind: "number", min: 60, max: 130, fallback: "110" },
  /** Форма прицела: у Quake их десять. */
  cg_drawCrosshair: {
    kind: "choice",
    values: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    fallback: "4",
  },
  cg_crosshairSize: { kind: "number", min: 8, max: 96, fallback: "24" },
  /** Показывать своё оружие. Дело вкуса, на игру не влияет. */
  cg_drawGun: { kind: "choice", values: ["0", "1", "2"], fallback: "1" },
};

export const DEFAULTS: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED).map(([name, spec]) => [name, spec.fallback]),
);

/** Оставляет только разрешённое и приводит значения в допустимые границы. */
export function sanitizeCvars(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof input !== "object" || input === null) return out;

  for (const [name, spec] of Object.entries(ALLOWED)) {
    const raw = (input as Record<string, unknown>)[name];
    if (raw === undefined) continue;
    const value = String(raw).trim();

    if (spec.kind === "choice") {
      if (spec.values.includes(value)) out[name] = value;
      continue;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) continue;
    // Не отвергаем, а зажимаем: ползунок в браузере мог показать 30.0000001,
    // и отказывать из-за этого человеку незачем
    const clamped = Math.min(spec.max, Math.max(spec.min, parsed));
    out[name] = String(Math.round(clamped * 100) / 100);
  }

  return out;
}
