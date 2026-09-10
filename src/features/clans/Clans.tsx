import { useEffect, useState } from "react";
import { Link } from "react-router";
import { t } from "../../shared/i18n/index.js";
import { useMe } from "../auth/useMe.js";

type ClanRow = { tag: string; name: string; members: number };

/** Справочник кланов и форма создания. */
export function Clans() {
  const state = useMe();
  const [clans, setClans] = useState<ClanRow[] | undefined>(undefined);
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/clans")
      .then((r) => r.json())
      .then((body) => setClans((body as { clans: ClanRow[] }).clans))
      .catch(() => setClans([]));
  }, []);

  const create = async () => {
    setError("");
    const response = await fetch("/api/clans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag, name }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) return setError(body.error ?? t("common.error"));
    setTag("");
    setName("");
    location.reload();
  };

  const inClan = state.status === "signed" && state.me.clan;

  return (
    <>
      <section className="panel">
        <h2>{t("clans.title")}</h2>
        {clans === undefined && <p className="dim">{t("common.loading")}</p>}
        {clans?.length === 0 && <p className="dim">{t("clans.empty")}</p>}
        {clans?.map((clan) => (
          <p key={clan.tag} className="row">
            <Link to={`/clans/${clan.tag}`}>
              <b>{clan.tag}</b> — {clan.name}
            </Link>
            <span className="dim">
              {clan.members} {t("clans.membersCount")}
            </span>
          </p>
        ))}
      </section>

      {state.status === "signed" && !inClan && (
        <section className="panel">
          <h2>{t("clans.create")}</h2>
          <label>
            <span>{t("clans.tag")}</span>
            <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={6} />
          </label>
          <p className="dim">{t("clans.tagHint")}</p>
          <label>
            <span>{t("clans.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </label>
          <p className="row" style={{ marginTop: "1.25rem" }}>
            <button type="button" onClick={create}>
              {t("clans.create")}
            </button>
            {error && <span className="dim">{error}</span>}
          </p>
        </section>
      )}
    </>
  );
}
