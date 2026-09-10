import { chooseLang, currentLang, LANGS } from "../../shared/i18n/index.js";

/** Переключатель языка. Двух языков хватает, поэтому это тумблер, а не список. */
export function LangSwitch() {
  const now = currentLang();
  return (
    <span className="lang">
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          className={lang === now ? "on" : ""}
          onClick={() => lang !== now && chooseLang(lang)}
        >
          {lang}
        </button>
      ))}
    </span>
  );
}
