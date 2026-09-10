import { useCallback, useEffect, useState } from "react";
import { t } from "../../shared/i18n/index.js";
import { useMe } from "../auth/useMe.js";

type Player = { name: string; score: number; ping: number; bot: boolean };
type State = {
  map: string;
  players: Player[];
  humans: number;
  bots: number;
  maxClients: number;
};

/**
 * Что происходит на сервере прямо сейчас.
 *
 * Опрашиваем раз в десять секунд, а не держим соединение: состояние меняется
 * медленно, а живой канал ради шести строк — лишняя движущаяся часть.
 */
export function ServerNow() {
  const me = useMe();
  const [state, setState] = useState<State | undefined | null>(undefined);
  const [bots, setBots] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/server")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setState((body as State | null) ?? null))
      .catch(() => setState(null));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const applyBots = async () => {
    setError("");
    const response = await fetch("/api/server/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: Number(bots) }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) return setError(body.error ?? t("common.error"));
    setTimeout(load, 1500);
  };

  const isAdmin = me.status === "signed" && me.me.role === "admin";

  return (
    <section className="panel">
      <h2>{t("server.title")}</h2>

      {state === undefined && <p className="dim">{t("common.loading")}</p>}
      {state === null && <p className="dim">{t("server.offline")}</p>}

      {state && (
        <>
          <p className="row">
            <span className="dim">{t("server.map")}</span>
            <b>{state.map}</b>
            <span className="dim">
              {state.humans} {t("server.humans")} · {state.bots} {t("server.bots")}
            </span>
          </p>

          {state.players.length === 0 && <p className="dim">{t("server.nobody")}</p>}
          {state.players.map((player) => (
            <p key={`${player.name}-${player.ping}`} className="row">
              <b>{player.name}</b>
              {player.bot && <span className="dim">· {t("server.bots")}</span>}
              <span className="dim">{player.score}</span>
            </p>
          ))}
        </>
      )}

      {isAdmin && (
        <p className="row" style={{ marginTop: "1.25rem" }}>
          <input
            type="number"
            min="0"
            max="8"
            placeholder={t("server.botCount")}
            value={bots}
            onChange={(e) => setBots(e.target.value)}
          />
          <button type="button" onClick={applyBots} disabled={bots === ""}>
            {t("server.apply")}
          </button>
          <span className="dim">{error || t("server.botsOff")}</span>
        </p>
      )}
    </section>
  );
}
