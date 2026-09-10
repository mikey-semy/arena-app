import { useState } from "react";
import { t } from "../../shared/i18n/index.js";
import { useMe } from "../auth/useMe.js";

/**
 * Вход в игру. Билет выписывает сайт вошедшему — руками ссылки собирать
 * не нужно, и мост знает, кого впустил.
 */
export function PlayButton() {
  const state = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (state.status !== "signed") return <p className="dim">{t("play.needAuth")}</p>;

  const play = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/play", { method: "POST" });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setError(body.error ?? t("common.error"));
        return;
      }
      location.href = body.url;
    } finally {
      setBusy(false);
    }
  };

  return (
    <p className="row">
      <button type="button" onClick={play} disabled={busy}>
        {busy ? t("play.opening") : t("play.now")}
      </button>
      <span className="dim">{error || t("play.first")}</span>
    </p>
  );
}
