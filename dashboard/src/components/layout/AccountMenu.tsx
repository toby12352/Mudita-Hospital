import { useEffect, useId, useRef, useState } from "react";
import type { User } from "../../auth";
import type { Locale } from "../../i18n";
import { ServerBadge, type ConnState } from "./ServerBadge";

type Props = {
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

export function AccountMenu({
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const name = user.display_name?.trim() || user.username;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={rootRef}>
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
      <button
        type="button"
        className="account-avatar"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t("accountMenu")}
        onClick={() => setOpen((value) => !value)}
      >
        {initials(name)}
      </button>
      {open ? (
        <div className="account-dropdown" id={menuId} role="dialog" aria-label={t("accountMenu")}>
          <div className="account-identity">
            <p className="account-name">{name}</p>
            <p className="account-role">{user.role}</p>
          </div>
          <ServerBadge
            conn={conn}
            detail={detail}
            onChangeServer={() => {
              setOpen(false);
              onChangeServer();
            }}
            onRetry={onRetry}
            t={t}
          />
          <button type="button" className="btn ghost account-logout" onClick={onLogout}>
            {t("logOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const firstChar = (value: string) => Array.from(value)[0] ?? "";
  if (parts.length >= 2) {
    return (firstChar(parts[0]) + firstChar(parts[parts.length - 1])).toLocaleUpperCase();
  }
  return Array.from(parts[0]).slice(0, 2).join("").toLocaleUpperCase();
}
