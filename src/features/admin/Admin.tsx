import { useCallback, useEffect, useState } from "react";
import { t } from "../../shared/i18n/index.js";
import { useMe } from "../auth/useMe.js";

type Player = {
  id: string;
  nick: string;
  displayName: string;
  role: "player" | "admin";
  banReason: string | null;
  banUntil: string | null;
};

/**
 * Панель администратора.
 *
 * Бан бьёт там, где игрок реально проходит, — на мосту. Он же единственная
 * дверь в игру, поэтому проверка стоит и при выписке билета, и при входе:
 * билет живёт час, и без второй проверки забаненный доигрывал бы этот час.
 */
export function Admin() {
  const state = useMe();
  const [players, setPlayers] = useState<Player[] | undefined>(undefined);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [days, setDays] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    fetch("/api/admin/players")
      .then((r) => (r.ok ? r.json() : { players: [] }))
      .then((body) => setPlayers((body as { players: Player[] }).players))
      .catch(() => setPlayers([]));
  }, []);

  const admin = state.status === "signed" && state.me.role === "admin";
  useEffect(() => {
    if (admin) reload();
  }, [admin, reload]);

  if (state.status !== "signed" || state.me.role !== "admin")
    return <p className="dim">{t("auth.needed")}</p>;

  const act = async (path: string, body: unknown) => {
    setError("");
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const answer = (await response.json()) as { error?: string };
    if (!response.ok) return setError(answer.error ?? t("common.error"));
    reload();
  };

  return (
    <section className="panel">
      <h2>{t("admin.title")}</h2>
      {error && <p className="dim">{error}</p>}
      {players === undefined && <p className="dim">{t("common.loading")}</p>}

      {players?.map((player) => (
        <div key={player.id} className="player">
          <p className="row">
            <b>{player.nick}</b>
            <span className="dim">{player.displayName}</span>
            {player.role === "admin" && <span className="dim">· {t("admin.role")}</span>}
            {player.banReason && (
              <span className="banned">
                {t("admin.banned")}: {player.banReason}
                {" · "}
                {player.banUntil
                  ? new Date(player.banUntil).toLocaleDateString("ru")
                  : t("admin.forever")}
              </span>
            )}
          </p>
          <p className="row">
            {player.banReason ? (
              <button
                type="button"
                className="quiet"
                onClick={() => act("/api/admin/unban", { userId: player.id })}
              >
                {t("admin.unban")}
              </button>
            ) : (
              <>
                <input
                  placeholder={t("admin.reason")}
                  value={reason[player.id] ?? ""}
                  onChange={(e) => setReason({ ...reason, [player.id]: e.target.value })}
                />
                <input
                  type="number"
                  min="0"
                  placeholder={t("admin.days")}
                  value={days[player.id] ?? ""}
                  onChange={(e) => setDays({ ...days, [player.id]: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() =>
                    act("/api/admin/ban", {
                      userId: player.id,
                      reason: reason[player.id] ?? "",
                      days: Number(days[player.id] ?? 0),
                    })
                  }
                >
                  {t("admin.ban")}
                </button>
              </>
            )}
            <button
              type="button"
              className="quiet"
              onClick={() =>
                act("/api/admin/role", {
                  userId: player.id,
                  role: player.role === "admin" ? "player" : "admin",
                })
              }
            >
              {player.role === "admin" ? t("admin.dropAdmin") : t("admin.makeAdmin")}
            </button>
          </p>
        </div>
      ))}
    </section>
  );
}
