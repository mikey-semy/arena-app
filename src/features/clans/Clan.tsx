import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { t } from "../../shared/i18n/index.js";
import { useMe } from "../auth/useMe.js";

type Member = {
  nick: string;
  displayName: string;
  avatarUrl: string | null;
  role: "leader" | "member";
};
type Clan = { tag: string; name: string; members: Member[] };

export function ClanPage() {
  const { tag } = useParams<{ tag: string }>();
  const state = useMe();
  const [clan, setClan] = useState<Clan | undefined | null>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/clans/${tag}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setClan((body as Clan | null) ?? null))
      .catch(() => setClan(null));
  }, [tag]);

  if (clan === undefined) return <p className="dim">{t("common.loading")}</p>;
  if (clan === null) return <p className="dim">{t("clans.notFound")}</p>;

  const mine = state.status === "signed" ? state.me.clan : undefined;
  const act = async (path: string) => {
    setError("");
    const response = await fetch(path, { method: "POST" });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) return setError(body.error ?? t("common.error"));
    location.reload();
  };

  return (
    <section className="panel">
      <h2>
        {clan.tag} — {clan.name}
      </h2>
      <h3>{t("clans.members")}</h3>
      {clan.members.map((member) => (
        <p key={member.nick} className="row">
          {member.avatarUrl && (
            <img className="avatar" src={member.avatarUrl} alt={member.displayName} />
          )}
          <b>{member.nick}</b>
          <span className="dim">{member.displayName}</span>
          {member.role === "leader" && <span className="dim">· {t("clans.leader")}</span>}
        </p>
      ))}

      {state.status === "signed" && (
        <p className="row" style={{ marginTop: "1.25rem" }}>
          {!mine && (
            <button type="button" onClick={() => act(`/api/clans/${clan.tag}/join`)}>
              {t("clans.join")}
            </button>
          )}
          {mine?.tag === clan.tag && (
            <button type="button" className="quiet" onClick={() => act("/api/clans/leave")}>
              {t("clans.leave")}
            </button>
          )}
          {error && <span className="dim">{error}</span>}
        </p>
      )}
    </section>
  );
}
