import type { User } from "../../auth";
import type { Locale } from "../../i18n";
import { ServerBadge, type ConnState } from "./ServerBadge";

type Props = {
  title: string;
  user: User;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onLogout: () => void;
  conn: ConnState;
  detail: string;
  onChangeServer: () => void;
  onRetry: () => void;
  t: (k: string) => string;
};

export function Topbar({
  title,
  user,
  locale,
  onLocale,
  onLogout,
  conn,
  detail,
  onChangeServer,
  onRetry,
  t,
}: Props) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{t("brand")}</p>
        <h1 className="title-sm">{title}</h1>
      </div>
      <div className="user-chip">
        <ServerBadge
          conn={conn}
          detail={detail}
          onChangeServer={onChangeServer}
          onRetry={onRetry}
          t={t}
          compact
        />
        <div className="lang-switch lang-compact" role="group" aria-label={t("language")}>
          <button
            type="button"
            className={`btn ghost ${locale === "en" ? "lang-active" : ""}`}
            onClick={() => onLocale("en")}
          >
            {t("english")}
          </button>
          <button
            type="button"
            className={`btn ghost ${locale === "my" ? "lang-active" : ""}`}
            onClick={() => onLocale("my")}
          >
            {t("myanmar")}
          </button>
        </div>
        <span>
          {user.display_name} · {user.role}
        </span>
        <button type="button" className="btn ghost" onClick={onLogout}>
          {t("logOut")}
        </button>
      </div>
    </header>
  );
}
