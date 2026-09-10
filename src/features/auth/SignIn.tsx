import { t } from "../../shared/i18n/index.js";
import { DiscordIcon } from "../../shared/icons/DiscordIcon.js";

/** Вход один — через Discord. Своей пары «почта и пароль» нет и не планируется. */
export function SignIn() {
  return (
    <a href="/api/auth/discord">
      <button type="button" className="discord">
        <DiscordIcon />
        {t("auth.signIn")}
      </button>
    </a>
  );
}
