import { NavLink, Route, Routes } from "react-router";
import { Admin } from "../features/admin/Admin.js";
import { SignIn } from "../features/auth/SignIn.js";
import { signOut, useMe } from "../features/auth/useMe.js";
import { ClanPage } from "../features/clans/Clan.js";
import { Clans } from "../features/clans/Clans.js";
import { LangSwitch } from "../features/lang/LangSwitch.js";
import { PlayButton } from "../features/play/PlayButton.js";
import { Profile } from "../features/profile/Profile.js";
import { t } from "../shared/i18n/index.js";
import { SteamIcon } from "../shared/icons/SteamIcon.js";
import logo from "./img/q3-logo.png";

function Home() {
  return (
    <>
      <section className="panel">
        <h2>{t("app.tagline")}</h2>
        <PlayButton />
      </section>
      <section className="panel">
        <h2>{t("own.title")}</h2>
        <p className="dim">{t("own.why")}</p>
        <p>
          <a
            href="https://store.steampowered.com/app/2200/Quake_III_Arena/"
            target="_blank"
            rel="noreferrer"
          >
            <button type="button" className="steam">
              <SteamIcon />
              {t("own.buy")}
            </button>
          </a>
        </p>
      </section>
    </>
  );
}

export function App() {
  const state = useMe();

  return (
    <div className="shell">
      <header className="top">
        <img className="mark" src={logo} alt="" />
        <h1>{t("app.title")}</h1>
        <nav>
          <NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")} end>
            {t("nav.play")}
          </NavLink>
          <NavLink to="/clans" className={({ isActive }) => (isActive ? "active" : "")}>
            {t("nav.clans")}
          </NavLink>
          {state.status === "signed" && state.me.role === "admin" && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : "")}>
              {t("nav.admin")}
            </NavLink>
          )}
          {state.status === "signed" && (
            <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
              {t("nav.profile")}
            </NavLink>
          )}
        </nav>
        <div className="spacer" />
        <LangSwitch />
        {state.status === "loading" && <span className="dim">{t("common.loading")}</span>}
        {state.status === "guest" && <SignIn />}
        {state.status === "signed" && (
          <div className="row">
            {state.me.avatarUrl && (
              <img className="avatar" src={state.me.avatarUrl} alt={state.me.displayName} />
            )}
            <span>{state.me.displayName}</span>
            <button type="button" className="quiet" onClick={signOut}>
              {t("auth.signOut")}
            </button>
          </div>
        )}
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/clans" element={<Clans />} />
        <Route path="/clans/:tag" element={<ClanPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>

      <footer className="bottom dim">
        {/* Требование GPLv2: движок — изменённый ioquake3, и мы его
            распространяем, отдавая в браузер. */}
        ioquake3 · GPLv2 ·{" "}
        <a href="https://github.com/mikey-semy/arena-app" target="_blank" rel="noreferrer">
          {t("footer.source")}
        </a>
      </footer>
    </div>
  );
}
