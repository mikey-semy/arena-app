import { useEffect, useState } from "react";
import { t } from "../../shared/i18n/index.js";
import { useMe } from "../auth/useMe.js";

type Cvars = Record<string, string>;

/**
 * Профиль и настройки игры.
 *
 * Конфиг живёт в аккаунте, а не файлом на диске: сел за чужой компьютер,
 * зашёл — настройки уже там. Раньше их таскали руками с машины на машину.
 */
export function Profile() {
  const state = useMe();
  const [cvars, setCvars] = useState<Cvars | undefined>(undefined);
  const [nick, setNick] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state.status !== "signed") return;
    setNick(state.me.nick);
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : undefined))
      .then((body) => body && setCvars((body as { cvars: Cvars }).cvars))
      .catch(() => setCvars({}));
  }, [state]);

  if (state.status === "loading") return <p className="dim">{t("common.loading")}</p>;
  if (state.status === "guest") return <p className="dim">{t("auth.needed")}</p>;

  const set = (name: string, value: string) => {
    setCvars((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const save = async () => {
    await fetch("/api/profile/nick", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nick }),
    });
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cvars }),
    });
    if (response.ok) setCvars(((await response.json()) as { cvars: Cvars }).cvars);
    setSaved(true);
  };

  return (
    <>
      <section className="panel">
        <h2>{t("profile.title")}</h2>
        <label>
          <span>{t("profile.nick")}</span>
          <input
            value={nick}
            onChange={(e) => {
              setNick(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <p className="dim">{t("profile.nickHint")}</p>
      </section>

      <section className="panel">
        <h2>{t("config.title")}</h2>
        <p className="dim">{t("config.hint")}</p>

        {cvars === undefined ? (
          <p className="dim">{t("common.loading")}</p>
        ) : (
          <>
            <label>
              <span>{t("config.sensitivity")}</span>
              <input
                type="number"
                step="0.1"
                value={cvars.sensitivity ?? ""}
                onChange={(e) => set("sensitivity", e.target.value)}
              />
            </label>
            <label>
              <span>{t("config.fov")}</span>
              <input
                type="number"
                value={cvars.cg_fov ?? ""}
                onChange={(e) => set("cg_fov", e.target.value)}
              />
            </label>
            <label>
              <span>{t("config.crosshair")}</span>
              <select
                value={cvars.cg_drawCrosshair ?? "4"}
                onChange={(e) => set("cg_drawCrosshair", e.target.value)}
              >
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <p className="row" style={{ marginTop: "1.25rem" }}>
          <button type="button" onClick={save} disabled={cvars === undefined}>
            {t("profile.save")}
          </button>
          {saved && <span className="dim">{t("profile.saved")}</span>}
        </p>
      </section>
    </>
  );
}
