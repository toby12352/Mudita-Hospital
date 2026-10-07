import { FormEvent, useEffect, useState } from "react";
import brandLogo from "./assets/logo.png";
import {
  fetchHealth,
  getApiBase,
  isApiConfigured,
  markApiConfigured,
  setApiBase,
} from "./api";
import {
  changePassword,
  clearSession,
  createIdleWatcher,
  fetchMe,
  getStoredToken,
  getStoredUser,
  isDashboardAdmin,
  login,
  logout,
  storeSession,
  type User,
} from "./auth";
import { ServerBadge, type ConnState } from "./components/layout/ServerBadge";
import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { useI18n } from "./i18n";
import { PAGE_TITLE_KEY, type PageId } from "./nav";
import { AuditPage } from "./pages/Audit";
import { DailyReportPage } from "./pages/DailyReport";
import { MasterDataPage } from "./pages/MasterData";
import { OverviewPage } from "./pages/Overview";
import { RevenuePage } from "./pages/Revenue";
import { StockPage } from "./pages/Stock";
import "./theme.css";

function App() {
  const { locale, setLocale, t } = useI18n();
  const [conn, setConn] = useState<ConnState>("checking");
  const [detail, setDetail] = useState("Checking API…");
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [permissions, setPermissions] = useState<string[]>([]);
  const [booting, setBooting] = useState(!!getStoredToken());
  const [page, setPage] = useState<PageId>("overview");
  const [authError, setAuthError] = useState<string | null>(null);
  const [needsServerSetup, setNeedsServerSetup] = useState(!isApiConfigured());
  const [apiEpoch, setApiEpoch] = useState(0);

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
        if (!isDashboardAdmin(me.user, me.permissions)) {
          clearSession();
          setUser(null);
          setPermissions([]);
          setAuthError(t("adminOnly"));
          return;
        }
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
  }, [t]);

  useEffect(() => {
    if (!user || user.must_change_password) return;
    const watcher = createIdleWatcher(() => {
      void (async () => {
        await logout();
        clearSession();
        setUser(null);
        setPermissions([]);
        setPage("overview");
        setAuthError("Locked after 15 minutes idle — please sign in again.");
      })();
    });
    return () => watcher.dispose();
  }, [user]);

  async function handleLogin(username: string, password: string) {
    setAuthError(null);
    const result = await login(username, password);
    storeSession(result.token, result.user);

    // Non-Admin: reject immediately (password-change path also blocked).
    if (result.user.role !== "Admin") {
      try {
        await logout();
      } finally {
        clearSession();
        setUser(null);
        setPermissions([]);
      }
      throw new Error(t("adminOnly"));
    }

    if (result.user.must_change_password) {
      setUser(result.user);
      setPermissions([]);
      return;
    }

    try {
      const me = await fetchMe();
      if (!isDashboardAdmin(me.user, me.permissions)) {
        await logout();
        clearSession();
        setUser(null);
        setPermissions([]);
        throw new Error(t("adminOnly"));
      }
      storeSession(result.token, me.user);
      setUser(me.user);
      setPermissions(me.permissions);
    } catch (err) {
      clearSession();
      setUser(null);
      setPermissions([]);
      throw err instanceof Error ? err : new Error(t("adminOnly"));
    }
  }

  async function handleLogout() {
    await logout();
    clearSession();
    setUser(null);
    setPermissions([]);
    setPage("overview");
    setAuthError(null);
  }

  async function handlePasswordChanged(result: { token: string; user: User }) {
    storeSession(result.token, result.user);
    setUser(result.user);
    const me = await fetchMe();
    if (!isDashboardAdmin(me.user, me.permissions)) {
      await logout();
      clearSession();
      setUser(null);
      setPermissions([]);
      setAuthError(t("adminOnly"));
      return;
    }
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
        <ServerBadge
          conn={conn}
          detail={detail}
          onChangeServer={openServerSetup}
          onRetry={() => setApiEpoch((n) => n + 1)}
          t={t}
        />
        <LoginForm
          onSubmit={handleLogin}
          error={authError}
          disabled={conn === "offline"}
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

  // silence unused — permissions reserved for future page gates
  void permissions;

  return (
    <div className="app-frame">
      <Sidebar page={page} onNavigate={setPage} t={t} />
      <div className="app-main">
        <Topbar
          title={t(PAGE_TITLE_KEY[page])}
          user={user}
          locale={locale}
          onLocale={setLocale}
          onLogout={() => void handleLogout()}
          conn={conn}
          detail={detail}
          onChangeServer={openServerSetup}
          onRetry={() => setApiEpoch((n) => n + 1)}
          t={t}
        />
        {page === "overview" ? <OverviewPage t={t} /> : null}
        {page === "revenue" ? <RevenuePage t={t} /> : null}
        {page === "stock" ? <StockPage t={t} /> : null}
        {page === "daily" ? <DailyReportPage t={t} /> : null}
        {page === "master" ? <MasterDataPage t={t} /> : null}
        {page === "audit" ? <AuditPage t={t} /> : null}
      </div>
    </div>
  );
}

function LanguageSwitcher({
  locale,
  onChange,
  t,
}: {
  locale: "en" | "my";
  onChange: (l: "en" | "my") => void;
  t: (k: string) => string;
}) {
  return (
    <div className="lang-switch" role="group" aria-label={t("language")}>
      <button
        type="button"
        className={`btn ghost ${locale === "en" ? "lang-active" : ""}`}
        onClick={() => onChange("en")}
      >
        {t("english")}
      </button>
      <button
        type="button"
        className={`btn ghost ${locale === "my" ? "lang-active" : ""}`}
        onClick={() => onChange("my")}
      >
        {t("myanmar")}
      </button>
    </div>
  );
}

function ServerSetupForm({
  initial,
  onSave,
  onUseLocal,
}: {
  initial: string;
  onSave: (base: string) => void;
  onUseLocal: () => void;
}) {
  const [value, setValue] = useState(() => {
    try {
      const u = new URL(initial);
      return u.hostname === "127.0.0.1" || u.hostname === "localhost" ? "" : u.hostname;
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    try {
      const base = setApiBase(value.trim());
      const res = await fetch(`${base}/api/health`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Health check failed (${res.status})`);
      const health = (await res.json()) as { status?: string; db?: string };
      if (health.status !== "ok") throw new Error("API not ready");
      markApiConfigured();
      setHint(`Connected to ${base}`);
      onSave(base);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Timed out reaching server"
            : err.message
          : "Cannot reach server";
      setError(`${msg}. You can still save and retry from Sign in.`);
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  }

  function saveAnyway() {
    try {
      const base = setApiBase(value.trim());
      onSave(base);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid address");
    }
  }

  return (
    <form className="card-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>Server IP or address</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="192.168.1.10"
          autoFocus
          disabled={busy}
          required
        />
      </label>
      <p className="hint">
        Examples: <code>192.168.1.10</code> or <code>http://192.168.1.10:8080</code>
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {hint ? <p className="form-ok">{hint}</p> : null}
      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={busy || !value.trim()}>
          {busy ? "Testing…" : "Save & test"}
        </button>
        {error ? (
          <button type="button" className="btn ghost" onClick={saveAnyway} disabled={busy}>
            Save anyway
          </button>
        ) : null}
        <button type="button" className="btn ghost" onClick={onUseLocal} disabled={busy}>
          This PC (127.0.0.1)
        </button>
      </div>
    </form>
  );
}

function LoginForm({
  onSubmit,
  error,
  disabled,
  t,
}: {
  onSubmit: (username: string, password: string) => Promise<void>;
  error: string | null;
  disabled?: boolean;
  t: (k: string) => string;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    try {
      await onSubmit(username.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  const showError = localError || error;

  return (
    <form className="card-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>{t("username")}</span>
        <input
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy || disabled}
          required
        />
      </label>
      <label className="field">
        <span>{t("password")}</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy || disabled}
          required
        />
      </label>
      {showError ? <p className="form-error">{showError}</p> : null}
      <button type="submit" className="btn primary" disabled={busy || disabled}>
        {busy ? t("signingIn") : t("signIn")}
      </button>
      <p className="hint">{t("loginHint")}</p>
    </form>
  );
}

function ChangePasswordForm({
  onDone,
  onCancel,
}: {
  onDone: (result: { token: string; user: User }) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await changePassword(current, next);
      await onDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>Current password</span>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={busy}
          required
        />
      </label>
      <label className="field">
        <span>New password</span>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          disabled={busy}
          required
          minLength={8}
        />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          required
          minLength={8}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
        <button type="button" className="btn ghost" onClick={() => void onCancel()} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default App;
