import { useEffect, useState } from "react";
import brandLogo from "@/assets/logo.png";
import {
  fetchHealth,
  getApiBase,
  isApiConfigured,
  setApiBase,
} from "@/shared/api";
import {
  clearSession,
  createIdleWatcher,
  fetchMe,
  getStoredToken,
  getStoredUser,
  hasPermission,
  login,
  logout,
  storeSession,
  type User,
} from "@/shared/auth";
import { useI18n } from "@/shared/i18n";
import { applyUiScale, resetUiScale, zoomIn, zoomOut } from "@/shared/uiScale";
import "@/shared/styles/App.css";
import { HomePage } from "@/pages/home/HomePage";
import { AppNavBar, type NavSectionId } from "./AppNavBar";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { HelpOverlay } from "./HelpOverlay";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LoginForm } from "./LoginForm";
import { ServerBadge } from "./ServerBadge";
import { ServerSetupForm } from "./ServerSetupForm";
import type { ConnState, NavIntent, View } from "./types";
import { OpdPage } from "@/pages/opd/OpdPage";
import { OtPage } from "@/pages/ot/OtPage";
import { PharmacyBillingPage } from "@/pages/pharmacy/PharmacyBillingPage";
import { PharmacyPage } from "@/pages/pharmacy/PharmacyPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const [conn, setConn] = useState<ConnState>("checking");
  const [detail, setDetail] = useState("Checking API…");
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [permissions, setPermissions] = useState<string[]>([]);
  const [booting, setBooting] = useState(!!getStoredToken());
  const [view, setView] = useState<View>("home");
  const [navIntent, setNavIntent] = useState<NavIntent>({});
  const [activeSection, setActiveSection] = useState<NavSectionId>("home");
  const [navEpoch, setNavEpoch] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [needsServerSetup, setNeedsServerSetup] = useState(!isApiConfigured());
  const [apiEpoch, setApiEpoch] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    applyUiScale();
  }, []);

  useEffect(() => {
    if (needsServerSetup) return;
    let cancelled = false;
    const controller = new AbortController();

    async function check() {
      try {
        const health = await fetchHealth(controller.signal);
        if (cancelled) return;
        if (health.status === "ok" && health.db === "ok") {
          setConn("ok");
          setDetail(`API ${health.service} · DB ${health.db}`);
        } else {
          setConn("offline");
          setDetail(`Degraded: status=${health.status}, db=${health.db}`);
        }
      } catch {
        if (cancelled) return;
        setConn("offline");
        setDetail("Cannot reach API — check cable, power, firewall port 8080, or Server IP");
      }
    }

    setConn("checking");
    setDetail("Checking API…");
    check();
    const id = window.setInterval(check, 5000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [needsServerSetup, apiEpoch]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setBooting(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me.user);
        setPermissions(me.permissions);
        storeSession(token, me.user);
      } catch {
        if (cancelled) return;
        clearSession();
        setUser(null);
        setPermissions([]);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user || user.must_change_password) return;
    const watcher = createIdleWatcher(() => {
      void (async () => {
        await logout();
        clearSession();
        setUser(null);
        setPermissions([]);
        setView("home");
        setNavIntent({});
        setActiveSection("home");
        setAuthError("Locked after 15 minutes idle — please sign in again.");
      })();
    });
    return () => watcher.dispose();
  }, [user]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetUiScale();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleLogin(username: string, password: string) {
    setAuthError(null);
    const result = await login(username, password);
    storeSession(result.token, result.user);
    setUser(result.user);
    try {
      const me = await fetchMe();
      setPermissions(me.permissions);
      storeSession(result.token, me.user);
      setUser(me.user);
    } catch {
      setPermissions([]);
    }
  }

  async function handleLogout() {
    await logout();
    clearSession();
    setUser(null);
    setPermissions([]);
    setView("home");
    setNavIntent({});
    setActiveSection("home");
    setAuthError(null);
  }

  async function handlePasswordChanged(result: { token: string; user: User }) {
    storeSession(result.token, result.user);
    setUser(result.user);
    const me = await fetchMe();
    setPermissions(me.permissions);
    setUser(me.user);
    storeSession(result.token, me.user);
  }

  function finishServerSetup(base: string) {
    setApiBase(base);
    setNeedsServerSetup(false);
    setApiEpoch((n) => n + 1);
    setAuthError(null);
  }

  function openServerSetup() {
    setNeedsServerSetup(true);
  }

  function navigate(next: View, intent: NavIntent = {}, section: NavSectionId = "home") {
    setView(next);
    setNavIntent(intent);
    setActiveSection(section);
    setNavEpoch((n) => n + 1);
  }

  if (needsServerSetup) {
    return (
      <main className="shell">
        <header className="brand">
          <div className="brand-lockup">
            <img src={brandLogo} alt="" className="brand-logo brand-logo--lg" />
            <div>
              <p className="eyebrow">{t("brand")}</p>
              <h1>{t("serverIp")}</h1>
              <p className="lede">Enter the hospital server address on this LAN (port 8080).</p>
            </div>
          </div>
        </header>
        <LanguageSwitcher locale={locale} onChange={setLocale} t={t} />
        <ServerSetupForm
          initial={getApiBase()}
          onSave={finishServerSetup}
          onUseLocal={() => finishServerSetup("http://127.0.0.1:8080")}
        />
      </main>
    );
  }

  if (booting) {
    return (
      <main className="shell">
        <p className="lede">{t("restoringSession")}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="shell">
        <header className="brand">
          <div className="brand-lockup">
            <img src={brandLogo} alt="" className="brand-logo brand-logo--lg" />
            <div>
              <p className="eyebrow">{t("brand")}</p>
              <h1>{t("signIn")}</h1>
              <p className="lede">{t("offlineLan")}</p>
            </div>
          </div>
        </header>
        <LanguageSwitcher locale={locale} onChange={setLocale} t={t} />
        <LoginForm
          onSubmit={handleLogin}
          error={authError}
          disabled={conn === "offline"}
          t={t}
        />
        <ServerBadge
          conn={conn}
          detail={detail}
          onChangeServer={openServerSetup}
          onRetry={() => setApiEpoch((n) => n + 1)}
          t={t}
        />
      </main>
    );
  }

  if (user.must_change_password) {
    return (
      <main className="shell">
        <header className="brand">
          <div className="brand-lockup">
            <img src={brandLogo} alt="" className="brand-logo brand-logo--lg" />
            <div>
              <p className="eyebrow">{t("brand")}</p>
              <h1>{t("changePassword")}</h1>
              <p className="lede">Required on first login for {user.username}</p>
            </div>
          </div>
        </header>
        <ChangePasswordForm onDone={handlePasswordChanged} onCancel={handleLogout} />
      </main>
    );
  }

  const titleKey =
    view === "settings"
      ? "settings"
      : view === "pharmacy"
        ? "pharmacyStock"
        : view === "pharmacy_billing"
          ? "pharmacyBilling"
          : view === "opd"
            ? "opd"
            : view === "ot"
              ? "ot"
              : "home";

  const pageKey = `${view}-${navEpoch}`;

  return (
    <main className="shell shell-wide shell-app">
      <div className="app-chrome">
        <header className="topbar">
          <div className="brand-lockup">
            <img src={brandLogo} alt="" className="brand-logo" />
            <div>
              <p className="eyebrow">{t("brand")}</p>
              <h1 className="title-sm">{t(titleKey)}</h1>
            </div>
          </div>
          <div className="user-chip">
            <LanguageSwitcher locale={locale} onChange={setLocale} t={t} compact />
            <span>
              {user.display_name} · {user.role}
            </span>
            <button type="button" className="btn ghost" onClick={openServerSetup}>
              {t("serverIp")}
            </button>
          </div>
        </header>
        <AppNavBar
          view={view}
          navIntent={navIntent}
          activeSection={activeSection}
          canSettings={hasPermission(permissions, "settings")}
          canPharmacy={hasPermission(permissions, "pharmacy")}
          canOPD={hasPermission(permissions, "opd")}
          canOT={hasPermission(permissions, "ot")}
          onNavigate={navigate}
          onHelp={() => setHelpOpen(true)}
          onLogout={() => void handleLogout()}
          t={t}
        />
      </div>

      <div className="app-content">
        {view === "home" ? <HomePage key={pageKey} t={t} /> : null}
        {view === "settings" ? (
          <SettingsPage
            key={pageKey}
            canManageUsers={hasPermission(permissions, "manage_users")}
            initialTab={navIntent.settingsTab ?? "hospital"}
            t={t}
          />
        ) : null}
        {view === "pharmacy" ? (
          <PharmacyPage
            key={pageKey}
            isAdmin={user.role === "Admin"}
            initialScreen={navIntent.pharmacyScreen ?? "browse"}
          />
        ) : null}
        {view === "pharmacy_billing" ? (
          <PharmacyBillingPage
            key={pageKey}
            initialMode={navIntent.billingMode ?? "list"}
          />
        ) : null}
        {view === "opd" ? (
          <OpdPage key={pageKey} initialMode={navIntent.billingMode ?? "list"} />
        ) : null}
        {view === "ot" ? (
          <OtPage key={pageKey} initialMode={navIntent.otMode ?? "list"} />
        ) : null}
      </div>

      <ServerBadge
        conn={conn}
        detail={detail}
        onChangeServer={openServerSetup}
        onRetry={() => setApiEpoch((n) => n + 1)}
        t={t}
      />
      {helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} t={t} /> : null}
    </main>
  );
}
