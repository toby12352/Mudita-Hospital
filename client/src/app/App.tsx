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
import { PortalPicker } from "@/pages/portal/PortalPicker";
import { AppNavBar } from "./AppNavBar";
import { AuthFrame } from "./AuthFrame";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { DeskStatusBar, shortcutsForView } from "./DeskStatusBar";
import { HelpOverlay } from "./HelpOverlay";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LoginForm } from "./LoginForm";
import { landingFor, portalForRole, viewInPortal } from "./portal";
import { ServerIpButton } from "./ServerIpButton";
import { ServerSetupForm } from "./ServerSetupForm";
import type { ConnState, NavIntent, NavSectionId, PortalId, View } from "./types";
import { OpdDoctorsPage } from "@/pages/opd/OpdDoctorsPage";
import { OpdPage } from "@/pages/opd/OpdPage";
import { OpdServicesPage } from "@/pages/opd/OpdServicesPage";
import { OtMaintenancePage } from "@/pages/ot/OtMaintenancePage";
import { OtPage } from "@/pages/ot/OtPage";
import { PharmacyBillingPage } from "@/pages/pharmacy/PharmacyBillingPage";
import { PharmacyPage } from "@/pages/pharmacy/PharmacyPage";
import { PharmacyReturnPage } from "@/pages/pharmacy/PharmacyReturnPage";
import { PharmacyTransferPage } from "@/pages/pharmacy/PharmacyTransferPage";
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
  const [activeSection, setActiveSection] = useState<NavSectionId>("opd");
  const [adminPortal, setAdminPortal] = useState<PortalId | null>(null);
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
          setDetail(t("errConnected"));
        } else {
          setConn("offline");
          setDetail(t("errDbDown"));
        }
      } catch {
        if (cancelled) return;
        setConn("offline");
        setDetail(t("errUnreachable"));
      }
    }

    setConn("checking");
    setDetail(t("checking"));
    check();
    const id = window.setInterval(check, 5000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [needsServerSetup, apiEpoch, t]);

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
        setActiveSection("opd");
        setAdminPortal(null);
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
    setActiveSection("opd");
    setAdminPortal(null);
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

  function navigate(next: View, intent: NavIntent = {}, section: NavSectionId = "opd") {
    setView(next);
    setNavIntent(intent);
    setActiveSection(section);
    setNavEpoch((n) => n + 1);
  }

  if (needsServerSetup) {
    return (
      <AuthFrame
        title={t("serverIp")}
        lede="Enter the hospital server address on this LAN (port 8080)."
      >
        <LanguageSwitcher locale={locale} onChange={setLocale} t={t} />
        <ServerSetupForm
          initial={getApiBase()}
          onSave={finishServerSetup}
          onUseLocal={() => finishServerSetup("http://127.0.0.1:8080")}
        />
      </AuthFrame>
    );
  }

  if (booting) {
    return (
      <AuthFrame>
        <p className="lede">{t("restoringSession")}</p>
      </AuthFrame>
    );
  }

  if (!user) {
    return (
      <AuthFrame title={t("signIn")} lede={t("offlineLan")}>
        <div className="auth-toolbar">
          <LanguageSwitcher locale={locale} onChange={setLocale} t={t} />
          <ServerIpButton
            conn={conn}
            detail={detail}
            onSave={finishServerSetup}
            onUseLocal={() => finishServerSetup("http://127.0.0.1:8080")}
            onRetry={() => setApiEpoch((n) => n + 1)}
            t={t}
          />
        </div>
        <LoginForm
          onSubmit={handleLogin}
          error={authError}
          disabled={conn === "offline"}
          t={t}
        />
      </AuthFrame>
    );
  }

  if (user.must_change_password) {
    return (
      <AuthFrame
        title={t("changePassword")}
        lede={`Required on first login for ${user.username}`}
      >
        <ChangePasswordForm onDone={handlePasswordChanged} onCancel={handleLogout} />
      </AuthFrame>
    );
  }

  const rolePortal = portalForRole(user.role);
  if (!rolePortal) {
    return (
      <AuthFrame title={t("noAccess")} lede={user.role}>
        <button type="button" className="btn ghost" onClick={() => void handleLogout()}>
          {t("logOut")}
        </button>
      </AuthFrame>
    );
  }

  const portal: PortalId | null = rolePortal === "admin" ? adminPortal : rolePortal;
  const landing = portal ? landingFor(portal) : null;
  const aligned = portal ? viewInPortal(view, portal) : false;
  const shownView = aligned ? view : landing?.view ?? view;
  const shownIntent = aligned ? navIntent : landing?.intent ?? {};
  const shownSection = aligned ? activeSection : landing?.section ?? activeSection;

  function enterPortal(next: PortalId) {
    const dest = landingFor(next);
    setAdminPortal(next);
    setView(dest.view);
    setNavIntent(dest.intent);
    setActiveSection(dest.section);
    setNavEpoch((n) => n + 1);
  }

  const opdScreen = shownIntent.opdScreen ?? "bill";
  const portalTitleKey = portal ?? "portalPickerTitle";

  const pageKey = `${shownView}-${navEpoch}`;

  const chromeTrailing = (
    <div className="desk-header-actions">
      <LanguageSwitcher locale={locale} onChange={setLocale} t={t} compact />
      <button type="button" className="btn ghost compact" onClick={() => setHelpOpen(true)}>
        {t("help")}
      </button>
      <button type="button" className="btn ghost compact" onClick={() => void handleLogout()}>
        {t("logOut")}
      </button>
      <ServerIpButton
        conn={conn}
        detail={detail}
        onSave={finishServerSetup}
        onUseLocal={() => finishServerSetup("http://127.0.0.1:8080")}
        onRetry={() => setApiEpoch((n) => n + 1)}
        t={t}
        compact
      />
    </div>
  );

  const pageBody = (
    <>
      {!portal ? <PortalPicker onPick={enterPortal} t={t} /> : null}
      {portal === "settings" && shownView === "settings" ? (
        <SettingsPage
          key={pageKey}
          canManageUsers={hasPermission(permissions, "manage_users")}
          initialTab={shownIntent.settingsTab ?? "hospital"}
          t={t}
        />
      ) : null}
      {portal === "pharmacy" && shownView === "pharmacy" ? (
        <PharmacyPage
          key={pageKey}
          isAdmin={user.role === "Admin"}
          initialScreen={shownIntent.pharmacyScreen ?? "browse"}
        />
      ) : null}
      {portal === "pharmacy" && shownView === "pharmacy_billing" ? (
        <PharmacyBillingPage
          key={pageKey}
          initialMode={shownIntent.billingMode ?? "list"}
        />
      ) : null}
      {portal === "pharmacy" && shownView === "pharmacy_return" ? (
        <PharmacyReturnPage
          key={pageKey}
          initialMode={shownIntent.billingMode ?? "list"}
        />
      ) : null}
      {portal === "pharmacy" && shownView === "pharmacy_transfer" ? (
        <PharmacyTransferPage
          key={pageKey}
          initialMode={shownIntent.billingMode ?? "list"}
        />
      ) : null}
      {portal === "opd" && shownView === "opd" && (opdScreen === "doctors" || opdScreen === "services") ? (
        <section key={pageKey} className="desk-maintenance">
          <div className="tabs" role="tablist" aria-label={t("navMaintenance")}>
            <button
              type="button"
              role="tab"
              className={`tab${opdScreen === "doctors" ? " active" : ""}`}
              aria-selected={opdScreen === "doctors"}
              onClick={() =>
                navigate("opd", { opdScreen: "doctors" }, "opd_maintenance")
              }
            >
              {t("maintenanceDoctors")}
            </button>
            <button
              type="button"
              role="tab"
              className={`tab${opdScreen === "services" ? " active" : ""}`}
              aria-selected={opdScreen === "services"}
              onClick={() =>
                navigate("opd", { opdScreen: "services" }, "opd_maintenance")
              }
            >
              {t("maintenanceServices")}
            </button>
          </div>
          {opdScreen === "doctors" ? <OpdDoctorsPage /> : <OpdServicesPage />}
        </section>
      ) : null}
      {portal === "opd" && shownView === "opd" && opdScreen === "bill" ? (
        <OpdPage key={pageKey} initialMode={shownIntent.billingMode ?? "list"} />
      ) : null}
      {portal === "ot" && shownView === "ot" && shownIntent.otMode === "stock" ? (
        <OtMaintenancePage key={pageKey} />
      ) : null}
      {portal === "ot" && shownView === "ot" && shownIntent.otMode !== "stock" ? (
        <OtPage key={pageKey} />
      ) : null}
    </>
  );

  return (
    <main className="shell shell-wide shell-app shell-desk shell-classic">
      {portal ? (
        <AppNavBar
          portal={portal}
          showBack={rolePortal === "admin"}
          view={shownView}
          navIntent={shownIntent}
          activeSection={shownSection}
          onNavigate={navigate}
          onBack={() => setAdminPortal(null)}
          t={t}
        />
      ) : null}

      <div className="desk-main">
        <div className="app-chrome app-chrome--classic">
          <header className="desk-header">
            <div className="desk-header-brand">
              <img src={brandLogo} alt="" className="brand-logo brand-logo--desk" />
              <h1 className="desk-header-title">{t(portalTitleKey)}</h1>
            </div>
            {chromeTrailing}
          </header>
        </div>

        <div className="app-content">{pageBody}</div>

        {portal ? (
          <DeskStatusBar
            shortcuts={shortcutsForView(shownView, shownIntent, t)}
            username={user.display_name || user.username}
            t={t}
          />
        ) : null}
      </div>

      {helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} t={t} /> : null}
    </main>
  );
}
