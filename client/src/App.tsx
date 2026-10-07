import { FormEvent, useEffect, useRef, useState } from "react";
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
  hasPermission,
  login,
  logout,
  storeSession,
  type User,
} from "./auth";
import {
  createDoctor,
  createService,
  createUser,
  deactivateDoctor,
  deactivateService,
  fetchHospitalSettings,
  listDoctors,
  listServices,
  listUsers,
  saveHospitalSettings,
  updateDoctor,
  updateService,
  updateUser,
  type Doctor,
  type HospitalSettings,
  type ManagedUser,
  type Service,
} from "./masterData";
import {
  ITEM_CATEGORIES,
  adjustItem,
  createPharmacyItem,
  deactivatePharmacyItem,
  findItemByCode,
  formatItemCode,
  formatLocationLabel,
  formatStockHistoryLine,
  formatStockHistoryReason,
  getPharmacyItem,
  listPharmacyItems,
  listStockMovements,
  restockItem,
  updatePharmacyItem,
  type PharmacyItem,
  type StockMovement,
} from "./pharmacy";
import {
  createOpdBill,
  findOpdItemByCode,
  findOpdServiceByCode,
  formatMMK,
  getOpdBill,
  listOpdBills,
  listOpdDoctors,
  payOpdBill,
  printOpdBill,
  updateOpdBill,
  voidOpdBill,
  type OpdBill,
  type OpdBillLine,
  type OpdDoctor,
} from "./opd";
import {
  createOtBillFromCase,
  createOtCase,
  getOtBill,
  getOtCase,
  issueOtCase,
  listOtCases,
  listOtDoctors,
  payOtBill,
  printOtBill,
  printOtPickList,
  reconcileOtCase,
  updateOtCase,
  voidOtBill,
  type OtBill,
  type OtCase,
  type OtCaseItem,
  type OtDoctor,
} from "./ot";
import {
  createBackup,
  formatBytes,
  listBackups,
  restoreBackup,
  type BackupInfo,
} from "./backup";
import { useI18n } from "./i18n";
import {
  fetchDailyCash,
  fetchLowStock,
  fetchNearExpiry,
  printDailyCash,
  printLowStock,
  printNearExpiry,
  type CashReport,
  type LowStockItem,
  type NearExpiryBatch,
} from "./reports";
import { fetchDemoStatus, resetDemo, seedDemo, type DemoStatus } from "./demo";
import { openCheatSheetPrint } from "./cheatsheet";
import "./App.css";

type ConnState = "checking" | "ok" | "offline";
type View = "home" | "settings" | "pharmacy" | "opd" | "ot" | "reports";
type SettingsTab = "hospital" | "doctors" | "services" | "users" | "backup" | "training";
type PharmacyTab = "items" | "movements";

function App() {
  const { locale, setLocale, t } = useI18n();
  const [conn, setConn] = useState<ConnState>("checking");
  const [detail, setDetail] = useState("Checking API…");
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [permissions, setPermissions] = useState<string[]>([]);
  const [booting, setBooting] = useState(!!getStoredToken());
  const [view, setView] = useState<View>("home");
  const [authError, setAuthError] = useState<string | null>(null);
  const [needsServerSetup, setNeedsServerSetup] = useState(!isApiConfigured());
  const [apiEpoch, setApiEpoch] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

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
        setAuthError("Locked after 15 minutes idle — please sign in again.");
      })();
    });
    return () => watcher.dispose();
  }, [user]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "?" && !(e.shiftKey && e.key === "/")) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      setHelpOpen(true);
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

  const titleKey =
    view === "settings"
      ? "settings"
      : view === "pharmacy"
        ? "pharmacy"
        : view === "opd"
          ? "opd"
          : view === "ot"
            ? "ot"
            : view === "reports"
              ? "reports"
              : "home";

  const canReports =
    hasPermission(permissions, "opd") ||
    hasPermission(permissions, "ot") ||
    hasPermission(permissions, "pharmacy") ||
    hasPermission(permissions, "settings");

  return (
    <main className="shell shell-wide">
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
          <button type="button" className="btn ghost" onClick={() => setHelpOpen(true)}>
            {t("help")}
          </button>
          <button type="button" className="btn ghost" onClick={() => void handleLogout()}>
            {t("logOut")}
          </button>
        </div>
      </header>

      <ServerBadge
        conn={conn}
        detail={detail}
        onChangeServer={openServerSetup}
        onRetry={() => setApiEpoch((n) => n + 1)}
        t={t}
      />

      {view === "home" ? (
        <HomeTiles
          canSettings={hasPermission(permissions, "settings")}
          canPharmacy={hasPermission(permissions, "pharmacy")}
          canOPD={hasPermission(permissions, "opd")}
          canOT={hasPermission(permissions, "ot")}
          canReports={canReports}
          onOpenSettings={() => setView("settings")}
          onOpenPharmacy={() => setView("pharmacy")}
          onOpenOPD={() => setView("opd")}
          onOpenOT={() => setView("ot")}
          onOpenReports={() => setView("reports")}
          onOpenHelp={() => setHelpOpen(true)}
          t={t}
        />
      ) : null}
      {view === "settings" ? (
        <SettingsPanel
          canManageUsers={hasPermission(permissions, "manage_users")}
          onBack={() => setView("home")}
          onChangeServer={openServerSetup}
          t={t}
        />
      ) : null}
      {view === "pharmacy" ? (
        <PharmacyPanel
          isAdmin={user.role === "Admin"}
          onBack={() => setView("home")}
        />
      ) : null}
      {view === "opd" ? <OpdPanel onBack={() => setView("home")} /> : null}
      {view === "ot" ? <OtPanel onBack={() => setView("home")} /> : null}
      {view === "reports" ? (
        <ReportsPanel
          canCash={
            hasPermission(permissions, "opd") ||
            hasPermission(permissions, "ot") ||
            hasPermission(permissions, "settings")
          }
          canStock={
            hasPermission(permissions, "pharmacy") || hasPermission(permissions, "settings")
          }
          onBack={() => setView("home")}
          t={t}
        />
      ) : null}
      {helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} t={t} /> : null}
    </main>
  );
}

function LanguageSwitcher({
  locale,
  onChange,
  t,
  compact,
}: {
  locale: "en" | "my";
  onChange: (l: "en" | "my") => void;
  t: (k: string) => string;
  compact?: boolean;
}) {
  return (
    <div className={`lang-switch ${compact ? "lang-compact" : ""}`} role="group" aria-label={t("language")}>
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

function ServerBadge({
  conn,
  detail,
  onChangeServer,
  onRetry,
  t,
}: {
  conn: ConnState;
  detail: string;
  onChangeServer?: () => void;
  onRetry?: () => void;
  t: (k: string) => string;
}) {
  const label =
    conn === "ok" ? t("serverConnected") : conn === "checking" ? t("checking") : t("serverOffline");
  return (
    <section className={`status-panel status-${conn}`} aria-live="polite">
      <div className="status-dot" aria-hidden="true" />
      <div className="status-body">
        <p className="status-label">{label}</p>
        <p className="status-detail">{detail}</p>
        <p className="status-meta">
          Endpoint: <code>{getApiBase()}</code>
        </p>
        {conn === "offline" || onChangeServer ? (
          <div className="btn-row status-actions">
            {conn === "offline" && onRetry ? (
              <button type="button" className="btn ghost" onClick={onRetry}>
                {t("retry")}
              </button>
            ) : null}
            {onChangeServer ? (
              <button type="button" className="btn ghost" onClick={onChangeServer}>
                {t("changeServerIp")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
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
      <p className="hint">Examples: <code>192.168.1.10</code> or <code>http://192.168.1.10:8080</code></p>
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
      setError(err instanceof Error ? err.message : "Change failed");
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
          required
          disabled={busy}
        />
      </label>
      <label className="field">
        <span>New password</span>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={6}
          required
          disabled={busy}
        />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={6}
          required
          disabled={busy}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void onCancel()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function HomeTiles({
  canSettings,
  canPharmacy,
  canOPD,
  canOT,
  canReports,
  onOpenSettings,
  onOpenPharmacy,
  onOpenOPD,
  onOpenOT,
  onOpenReports,
  onOpenHelp,
  t,
}: {
  canSettings: boolean;
  canPharmacy: boolean;
  canOPD: boolean;
  canOT: boolean;
  canReports: boolean;
  onOpenSettings: () => void;
  onOpenPharmacy: () => void;
  onOpenOPD: () => void;
  onOpenOT: () => void;
  onOpenReports: () => void;
  onOpenHelp: () => void;
  t: (k: string) => string;
}) {
  return (
    <section className="tiles" aria-label="Modules">
      <button
        type="button"
        className="tile"
        disabled={!canOPD}
        onClick={onOpenOPD}
        title={canOPD ? "Open OPD billing" : "Reception / Admin only"}
      >
        <span className="tile-title">{t("opd")}</span>
        <span className="tile-sub">{canOPD ? t("tileOpdSub") : t("noAccess")}</span>
      </button>
      <button
        type="button"
        className="tile"
        disabled={!canOT}
        onClick={onOpenOT}
        title={canOT ? "Open OT case cart" : "Reception / Admin only"}
      >
        <span className="tile-title">{t("ot")}</span>
        <span className="tile-sub">{canOT ? t("tileOtSub") : t("noAccess")}</span>
      </button>
      <button
        type="button"
        className="tile"
        disabled={!canPharmacy}
        onClick={onOpenPharmacy}
        title={canPharmacy ? "Open pharmacy" : "Pharmacy / Admin only"}
      >
        <span className="tile-title">{t("pharmacy")}</span>
        <span className="tile-sub">{canPharmacy ? t("tilePharmacySub") : t("noAccess")}</span>
      </button>
      <button
        type="button"
        className="tile"
        disabled={!canSettings}
        onClick={onOpenSettings}
        title={canSettings ? "Open settings" : "Admin only"}
      >
        <span className="tile-title">{t("settings")}</span>
        <span className="tile-sub">{canSettings ? t("tileSettingsSub") : t("noAccess")}</span>
      </button>
      <button
        type="button"
        className="tile"
        disabled={!canReports}
        onClick={onOpenReports}
        title={canReports ? "Open reports" : t("noAccess")}
      >
        <span className="tile-title">{t("reports")}</span>
        <span className="tile-sub">{canReports ? t("tileReportsSub") : t("noAccess")}</span>
      </button>
      <button type="button" className="tile" onClick={onOpenHelp} title={t("help")}>
        <span className="tile-title">{t("help")}</span>
        <span className="tile-sub">{t("tileHelpSub")}</span>
      </button>
    </section>
  );
}

function OpdPanel({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bills, setBills] = useState<OpdBill[]>([]);
  const [doctors, setDoctors] = useState<OpdDoctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [billId, setBillId] = useState<number | null>(null);
  const [billNo, setBillNo] = useState("");
  const [billStatus, setBillStatus] = useState("draft");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorSuggestOpen, setDoctorSuggestOpen] = useState(false);
  const [doctorHighlight, setDoctorHighlight] = useState(-1);
  const doctorBlurRef = useRef<number | null>(null);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<OpdBillLine[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price_mmk, 0);
  const isDraft = billStatus === "draft";
  const doctorSuggestions = (() => {
    const q = doctorName.trim().toLowerCase();
    if (!q) return doctors.slice(0, 8);
    return doctors
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.specialty || "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  })();

  async function reloadList(search = q, status = statusFilter) {
    setBills(await listOpdBills(search, status));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [billList, docList] = await Promise.all([listOpdBills(""), listOpdDoctors()]);
        if (cancelled) return;
        setBills(billList);
        setDoctors(docList);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetEditor() {
    setBillId(null);
    setBillNo("");
    setBillStatus("draft");
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    setDoctorId("");
    setDoctorName("");
    setDoctorSuggestOpen(false);
    setDoctorHighlight(-1);
    setDescription("");
    setLines([]);
    setCodeInput("");
    setVoidReason("");
    setError(null);
    setOkMsg(null);
  }

  function openNew() {
    resetEditor();
    setMode("edit");
  }

  async function openBill(id: number) {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const b = await getOpdBill(id);
      setBillId(b.id);
      setBillNo(b.bill_no);
      setBillStatus(b.status);
      setPatientName(b.patient_name);
      setPatientPhone(b.patient_phone);
      setPatientAge(b.patient_age_years != null ? String(b.patient_age_years) : "");
      setPatientGender(b.patient_gender);
      setDoctorId(b.doctor_id != null ? String(b.doctor_id) : "");
      setDoctorName(b.doctor_name || "");
      setDoctorSuggestOpen(false);
      setDoctorHighlight(-1);
      setDescription(b.description);
      setLines(
        (b.lines ?? []).map((l) => ({
          ...l,
          line_total_mmk: l.qty * l.unit_price_mmk,
        })),
      );
      setVoidReason("");
      setMode("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed");
    } finally {
      setBusy(false);
    }
  }

  function buildBody() {
    const age = patientAge.trim() ? Number(patientAge) : null;
    return {
      patient_name: patientName.trim(),
      patient_phone: patientPhone.trim(),
      patient_age_years: age != null && Number.isFinite(age) ? age : null,
      patient_gender: patientGender.trim(),
      doctor_id: doctorId ? Number(doctorId) : null,
      doctor_name: doctorName.trim(),
      description: description.trim(),
      save_patient: true,
      lines: lines.map((l, i) => {
        const qty = Math.max(1, Math.floor(Number(l.qty)) || 1);
        return {
          line_type: l.line_type,
          ref_id: l.ref_id ?? null,
          code: l.code,
          description: l.description,
          qty,
          unit_price_mmk: l.unit_price_mmk,
          line_total_mmk: qty * l.unit_price_mmk,
          sort_order: i,
        };
      }),
    };
  }

  function pickDoctor(d: OpdDoctor) {
    setDoctorId(String(d.id));
    setDoctorName(d.name);
    setDoctorSuggestOpen(false);
    setDoctorHighlight(-1);
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const body = buildBody();
      if (!body.patient_name) throw new Error("Patient name required");
      const b = billId ? await updateOpdBill(billId, body) : await createOpdBill(body);
      setBillId(b.id);
      setBillNo(b.bill_no);
      setBillStatus(b.status);
      setLines(
        (b.lines ?? []).map((l) => ({
          ...l,
          line_total_mmk: l.qty * l.unit_price_mmk,
        })),
      );
      setOkMsg(`Saved ${b.bill_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function addByCode() {
    const code = codeInput.trim();
    if (!code) return;
    setError(null);
    try {
      const item = await findOpdItemByCode(code);
      if (item) {
        setLines((prev) => {
          const idx = prev.findIndex(
            (l) => l.line_type === "item" && l.ref_id === item.id,
          );
          if (idx >= 0) {
            const next = [...prev];
            const qty = next[idx].qty + 1;
            next[idx] = {
              ...next[idx],
              qty,
              line_total_mmk: qty * next[idx].unit_price_mmk,
            };
            return next;
          }
          return [
            ...prev,
            {
              line_type: "item",
              ref_id: item.id,
              code: item.code,
              description: item.name,
              qty: 1,
              unit_price_mmk: item.sell_price_mmk,
              line_total_mmk: item.sell_price_mmk,
            },
          ];
        });
        setCodeInput("");
        if (item.stock_main <= 0) {
          setOkMsg(`${item.code} added — stock on hand is 0 (pay will fail until restocked)`);
        }
        return;
      }
      const svc = await findOpdServiceByCode(code);
      if (svc) {
        setLines((prev) => [
          ...prev,
          {
            line_type: "service",
            ref_id: svc.id,
            code: svc.code,
            description: svc.name,
            qty: 1,
            unit_price_mmk: svc.price_mmk,
            line_total_mmk: svc.price_mmk,
          },
        ]);
        setCodeInput("");
        return;
      }
      setError(`No item or service with code “${code}”`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    }
  }

  function addConsultation() {
    const doc = doctors.find((d) => String(d.id) === doctorId);
    if (!doc) {
      setError("Pick a known doctor from suggestions to add consultation fee");
      return;
    }
    setError(null);
    setLines((prev) => [
      ...prev,
      {
        line_type: "consultation",
        ref_id: doc.id,
        code: "CONSULT",
        description: `Consultation — ${doc.name}`,
        qty: 1,
        unit_price_mmk: doc.consultation_mmk,
        line_total_mmk: doc.consultation_mmk,
      },
    ]);
  }

  function updateLineQty(index: number, qtyStr: string) {
    const trimmed = qtyStr.trim();
    const qty = trimmed === "" ? 0 : Math.floor(Number(trimmed));
    if (trimmed !== "" && (!Number.isFinite(qty) || qty < 0)) return;
    setLines((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        qty,
        line_total_mmk: qty * next[index].unit_price_mmk,
      };
      return next;
    });
  }

  function commitLineQty(index: number, raw?: string) {
    setLines((prev) => {
      const next = [...prev];
      const source = raw !== undefined ? raw.trim() : String(next[index].qty);
      let qty = source === "" ? 0 : Math.floor(Number(source));
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      next[index] = {
        ...next[index],
        qty,
        line_total_mmk: qty * next[index].unit_price_mmk,
      };
      return next;
    });
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function payCash() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const body = buildBody();
      if (!body.patient_name) throw new Error("Patient name required");
      if (lines.length === 0) throw new Error("Add at least one line");
      let id = billId;
      if (id) {
        const saved = await updateOpdBill(id, body);
        setLines(
          (saved.lines ?? []).map((l) => ({
            ...l,
            line_total_mmk: l.qty * l.unit_price_mmk,
          })),
        );
      } else {
        const created = await createOpdBill(body);
        id = created.id;
        setBillId(created.id);
        setBillNo(created.bill_no);
        setLines(
          (created.lines ?? []).map((l) => ({
            ...l,
            line_total_mmk: l.qty * l.unit_price_mmk,
          })),
        );
      }
      const b = await payOpdBill(id);
      setBillStatus(b.status);
      setBillNo(b.bill_no);
      setOkMsg(`Paid ${b.bill_no} — ${formatMMK(b.total_mmk)} MMK cash`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVoid() {
    if (!billId) return;
    const reason = voidReason.trim();
    if (!reason) {
      setError("Void reason required");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const b = await voidOpdBill(billId, reason);
      setBillStatus(b.status);
      setOkMsg(`Voided ${b.bill_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Void failed");
    } finally {
      setBusy(false);
    }
  }

  async function doPrint() {
    if (!billId) {
      setError("Save the bill first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await printOpdBill(billId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "list") {
    return (
      <section className="settings-panel">
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={onBack}>
            ← Back
          </button>
          <button type="button" className="btn primary" onClick={openNew}>
            New bill
          </button>
        </div>
        <p className="hint">
          Reception OPD: draft bill → add codes (Enter) → Pay cash (stock deduct) → Print. Void
          restores stock.
        </p>
        <div className="list-toolbar">
          <label className="field grow">
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void reloadList().catch((err) => setError(String(err)));
              }}
              placeholder="Bill no / patient / phone"
            />
          </label>
          <label className="field">
            Status
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                void reloadList(q, e.target.value).catch((err) => setError(String(err)));
              }}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
            </select>
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void reloadList().catch((e) => setError(String(e)))}
          >
            Search
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <ul className="data-list">
          {bills.length === 0 ? <li className="empty-row">No bills yet</li> : null}
          {bills.map((b) => (
            <li key={b.id}>
              <div>
                <p className="row-title">
                  {b.bill_no} · {b.patient_name}
                </p>
                <p className="row-sub">
                  {b.status.toUpperCase()} · {formatMMK(b.total_mmk)} MMK
                  {b.doctor_name ? ` · ${b.doctor_name}` : ""}
                </p>
              </div>
              <button type="button" className="btn ghost" onClick={() => void openBill(b.id)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="settings-panel">
      <div className="btn-row">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setMode("list");
            void reloadList();
          }}
        >
          ← Bills
        </button>
        {billNo ? (
          <span className="hint">
            {billNo} · {billStatus.toUpperCase()}
          </span>
        ) : null}
      </div>

      {!billNo ? <h2 className="section-title">Create New Bill</h2> : null}

      <div className="card-form">
        <div className="field-row">
          <label className="field grow">
            Patient name *
            <input
              value={patientName}
              disabled={!isDraft}
              onChange={(e) => setPatientName(e.target.value)}
              autoFocus
            />
          </label>
          <label className="field">
            Phone
            <input
              value={patientPhone}
              disabled={!isDraft}
              onChange={(e) => setPatientPhone(e.target.value)}
            />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Age
            <input
              value={patientAge}
              disabled={!isDraft}
              inputMode="numeric"
              onChange={(e) => setPatientAge(e.target.value)}
            />
          </label>
          <label className="field">
            Gender
            <select
              value={patientGender}
              disabled={!isDraft}
              onChange={(e) => setPatientGender(e.target.value)}
            >
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <div className="field grow typeahead">
            <span>Doctor</span>
            <input
              value={doctorName}
              disabled={!isDraft}
              autoComplete="off"
              role="combobox"
              aria-expanded={doctorSuggestOpen}
              aria-autocomplete="list"
              aria-controls="opd-doctor-suggestions"
              onChange={(e) => {
                setDoctorName(e.target.value);
                setDoctorId("");
                setDoctorSuggestOpen(true);
                setDoctorHighlight(-1);
              }}
              onFocus={() => {
                if (isDraft) setDoctorSuggestOpen(true);
              }}
              onBlur={() => {
                if (doctorBlurRef.current != null) window.clearTimeout(doctorBlurRef.current);
                doctorBlurRef.current = window.setTimeout(() => {
                  setDoctorSuggestOpen(false);
                }, 150);
              }}
              onKeyDown={(e) => {
                if (!isDraft || !doctorSuggestOpen || doctorSuggestions.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setDoctorHighlight((h) => (h + 1) % doctorSuggestions.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setDoctorHighlight((h) =>
                    h <= 0 ? doctorSuggestions.length - 1 : h - 1,
                  );
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDoctorSuggestOpen(false);
                  return;
                }
                if (e.key === "Enter") {
                  if (doctorHighlight >= 0 && doctorSuggestions[doctorHighlight]) {
                    e.preventDefault();
                    pickDoctor(doctorSuggestions[doctorHighlight]);
                  } else {
                    setDoctorSuggestOpen(false);
                  }
                }
              }}
            />
            {isDraft && doctorSuggestOpen && doctorSuggestions.length > 0 ? (
              <ul
                id="opd-doctor-suggestions"
                className="typeahead-menu"
                role="listbox"
              >
                {doctorSuggestions.map((d, i) => (
                  <li key={d.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === doctorHighlight}
                      className={`typeahead-option${i === doctorHighlight ? " active" : ""}`}
                      onMouseEnter={() => setDoctorHighlight(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (doctorBlurRef.current != null) {
                          window.clearTimeout(doctorBlurRef.current);
                          doctorBlurRef.current = null;
                        }
                        pickDoctor(d);
                      }}
                    >
                      <span className="typeahead-title">{d.name}</span>
                      <span className="typeahead-sub">
                        {d.specialty || "General"} · consult{" "}
                        {formatMMK(d.consultation_mmk)} MMK
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <label className="field">
          Description / note
          <input
            value={description}
            disabled={!isDraft}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {isDraft ? (
          <div className="list-toolbar">
            <label className="field grow">
              Code (item / service) — Enter to add
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addByCode();
                  }
                }}
                placeholder="e.g. PARA500 or DRESS"
                autoComplete="off"
              />
            </label>
            <button type="button" className="btn ghost" onClick={() => void addByCode()}>
              Add
            </button>
            <button type="button" className="btn ghost" onClick={addConsultation}>
              + Consultation
            </button>
          </div>
        ) : null}

        <div className="bill-lines">
          <div className="bill-lines-head">
            <span>Code</span>
            <span>Description</span>
            <span className="num">Qty</span>
            <span className="num">Price</span>
            <span className="num">Amount</span>
            <span />
          </div>
          {lines.length === 0 ? <p className="empty-row">No lines yet</p> : null}
          {lines.map((l, i) => (
            <div key={`${l.code}-${i}`} className="bill-lines-row">
              <span>{l.code || "—"}</span>
              <span>{l.description}</span>
              <span className="num">
                {isDraft ? (
                  <input
                    className="qty-input"
                    value={l.qty < 1 ? "" : l.qty}
                    inputMode="numeric"
                    onChange={(e) => updateLineQty(i, e.target.value)}
                    onBlur={(e) => commitLineQty(i, e.target.value)}
                  />
                ) : (
                  l.qty
                )}
              </span>
              <span className="num">{formatMMK(l.unit_price_mmk)}</span>
              <span className="num">{formatMMK(l.qty * l.unit_price_mmk)}</span>
              <span>
                {isDraft ? (
                  <button type="button" className="btn ghost danger" onClick={() => removeLine(i)}>
                    ×
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        <p className="bill-total">Total: {formatMMK(total)} MMK</p>

        {error ? <p className="form-error">{error}</p> : null}
        {okMsg ? <p className="form-ok">{okMsg}</p> : null}

        <div className="btn-row">
          {isDraft ? (
            <>
              <button type="button" className="btn primary" disabled={busy} onClick={() => void saveDraft()}>
                {busy ? "…" : billId ? "Save" : "Create draft"}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || lines.length === 0}
                onClick={() => void payCash()}
              >
                Pay cash
              </button>
            </>
          ) : null}
          <button type="button" className="btn ghost" disabled={busy || !billId} onClick={() => void doPrint()}>
            Print
          </button>
        </div>

        {billId && billStatus !== "void" ? (
          <div className="nested-form">
            <label className="field">
              Void reason
              <input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Required to void"
              />
            </label>
            <button type="button" className="btn ghost danger" disabled={busy} onClick={() => void doVoid()}>
              Void bill{billStatus === "paid" ? " (restore stock)" : ""}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OtPanel({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<"list" | "case" | "bill">("list");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [cases, setCases] = useState<OtCase[]>([]);
  const [doctors, setDoctors] = useState<OtDoctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [caseId, setCaseId] = useState<number | null>(null);
  const [caseNo, setCaseNo] = useState("");
  const [caseStatus, setCaseStatus] = useState("draft");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OtCaseItem[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [otBillId, setOtBillId] = useState<number | null>(null);

  const [bill, setBill] = useState<OtBill | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const isDraft = caseStatus === "draft";
  const isIssued = caseStatus === "issued";
  const isReconciled = caseStatus === "reconciled";

  async function reloadList(search = q, status = statusFilter) {
    setCases(await listOtCases(search, status));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, d] = await Promise.all([listOtCases("", ""), listOtDoctors()]);
        if (cancelled) return;
        setCases(c);
        setDoctors(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetCaseForm() {
    setCaseId(null);
    setCaseNo("");
    setCaseStatus("draft");
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    setDoctorId("");
    setProcedureName("");
    setNotes("");
    setItems([]);
    setCodeInput("");
    setOtBillId(null);
    setError(null);
    setOkMsg(null);
  }

  function applyCase(c: OtCase) {
    setCaseId(c.id);
    setCaseNo(c.case_no);
    setCaseStatus(c.status);
    setPatientName(c.patient_name);
    setPatientPhone(c.patient_phone);
    setPatientAge(c.patient_age_years != null ? String(c.patient_age_years) : "");
    setPatientGender(c.patient_gender);
    setDoctorId(c.doctor_id != null ? String(c.doctor_id) : "");
    setProcedureName(c.procedure_name);
    setNotes(c.notes);
    setItems(
      (c.items ?? []).map((it) => ({
        ...it,
        qty_used: it.qty_used || 0,
        qty_returned: it.qty_returned || 0,
        qty_wasted: it.qty_wasted || 0,
        qty_kept_on_floor: it.qty_kept_on_floor || 0,
      })),
    );
    setOtBillId(c.ot_bill_id ?? null);
  }

  function openNew() {
    resetCaseForm();
    setMode("case");
  }

  async function openCase(id: number) {
    setBusy(true);
    setError(null);
    try {
      const c = await getOtCase(id);
      applyCase(c);
      setMode("case");
      if (c.ot_bill_id) {
        setOkMsg(`Linked bill id ${c.ot_bill_id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed");
    } finally {
      setBusy(false);
    }
  }

  function buildWrite() {
    const age = patientAge.trim() ? Number(patientAge) : null;
    return {
      patient_name: patientName.trim(),
      patient_phone: patientPhone.trim(),
      patient_age_years: age != null && !Number.isNaN(age) ? age : null,
      patient_gender: patientGender,
      doctor_id: doctorId ? Number(doctorId) : null,
      procedure_name: procedureName.trim(),
      notes: notes.trim(),
      items: items.map((it) => ({
        item_id: it.item_id,
        code: it.code,
        name: it.name,
        sell_price_mmk: it.sell_price_mmk,
        qty_issued: Math.max(1, Math.floor(Number(it.qty_issued)) || 1),
        qty_used: 0,
        qty_returned: 0,
        qty_wasted: 0,
        qty_kept_on_floor: 0,
      })),
    };
  }

  async function addByCode() {
    const code = codeInput.trim();
    if (!code) return;
    setError(null);
    try {
      const item = await findOpdItemByCode(code);
      if (!item) {
        setError(`Unknown item code: ${code}`);
        return;
      }
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.item_id === item.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], qty_issued: next[idx].qty_issued + 1 };
          return next;
        }
        return [
          ...prev,
          {
            item_id: item.id,
            code: item.code,
            name: item.name,
            sell_price_mmk: item.sell_price_mmk,
            qty_issued: 1,
            qty_used: 0,
            qty_returned: 0,
            qty_wasted: 0,
            qty_kept_on_floor: 0,
          },
        ];
      });
      setCodeInput("");
      setOkMsg(`Added ${item.code} (In Stock ${item.stock_main})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    }
  }

  async function saveDraft() {
    if (!patientName.trim()) {
      setError("Patient name required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = buildWrite();
      const c = caseId ? await updateOtCase(caseId, body) : await createOtCase(body);
      applyCase(c);
      setOkMsg(`Saved ${c.case_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function doIssue() {
    if (!patientName.trim()) {
      setError("Patient name required");
      return;
    }
    if (items.length === 0) {
      setError("Add cart items before issue");
      return;
    }
    if (!window.confirm("Issue cart from In Stock → OT_RESERVED? Stock will leave pharmacy.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = buildWrite();
      let id = caseId;
      if (!id) {
        const created = await createOtCase(body);
        applyCase(created);
        id = created.id;
      } else if (caseStatus === "draft") {
        const updated = await updateOtCase(id, body);
        applyCase(updated);
      }
      const c = await issueOtCase(id);
      applyCase(c);
      setOkMsg(`Issued ${c.case_no} — print pick list for OT floor`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Issue failed");
    } finally {
      setBusy(false);
    }
  }

  async function doReconcile() {
    if (!caseId) return;
    for (const it of items) {
      if (!it.id) {
        setError("Reload case before reconcile");
        return;
      }
      const sum = it.qty_used + it.qty_returned + it.qty_wasted + it.qty_kept_on_floor;
      if (sum !== it.qty_issued) {
        setError(`${it.code}: Used+Returned+Wasted+Floor must equal issued (${it.qty_issued})`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const c = await reconcileOtCase(
        caseId,
        items.map((it) => ({
          id: it.id!,
          qty_used: it.qty_used,
          qty_returned: it.qty_returned,
          qty_wasted: it.qty_wasted,
          qty_kept_on_floor: it.qty_kept_on_floor,
        })),
      );
      applyCase(c);
      setOkMsg(`Reconciled ${c.case_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconcile failed");
    } finally {
      setBusy(false);
    }
  }

  const [extraServiceCode, setExtraServiceCode] = useState("");

  async function doCreateBill() {
    if (!caseId) return;
    setBusy(true);
    setError(null);
    try {
      const services: {
        line_type: "service";
        ref_id?: number;
        code: string;
        description: string;
        qty: number;
        unit_price_mmk: number;
        line_total_mmk: number;
      }[] = [];
      const code = extraServiceCode.trim();
      if (code) {
        const svc = await findOpdServiceByCode(code);
        if (!svc) {
          setError(`Unknown service code: ${code}`);
          setBusy(false);
          return;
        }
        services.push({
          line_type: "service",
          ref_id: svc.id,
          code: svc.code,
          description: svc.name,
          qty: 1,
          unit_price_mmk: svc.price_mmk,
          line_total_mmk: svc.price_mmk,
        });
      }
      const b = await createOtBillFromCase(caseId, services);
      setBill(b);
      setOtBillId(b.id);
      setCaseStatus("billed");
      setMode("bill");
      setOkMsg(`Created ${b.bill_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bill create failed");
    } finally {
      setBusy(false);
    }
  }

  async function openBill(id: number) {
    setBusy(true);
    setError(null);
    try {
      const b = await getOtBill(id);
      setBill(b);
      setMode("bill");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bill load failed");
    } finally {
      setBusy(false);
    }
  }

  async function doPayBill() {
    if (!bill) return;
    setBusy(true);
    setError(null);
    try {
      const b = await payOtBill(bill.id);
      setBill(b);
      setOkMsg(`Paid ${b.bill_no}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVoidBill() {
    if (!bill || !voidReason.trim()) {
      setError("Void reason required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const b = await voidOtBill(bill.id, voidReason.trim());
      setBill(b);
      setOkMsg(`Voided ${b.bill_no}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Void failed");
    } finally {
      setBusy(false);
    }
  }

  function setReconcileField(
    index: number,
    field: "qty_used" | "qty_returned" | "qty_wasted" | "qty_kept_on_floor",
    raw: string,
  ) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: n };
      return next;
    });
  }

  function fillAllUsed() {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        qty_used: it.qty_issued,
        qty_returned: 0,
        qty_wasted: 0,
        qty_kept_on_floor: 0,
      })),
    );
  }

  if (mode === "list") {
    return (
      <section className="settings-panel">
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={onBack}>
            ← Back
          </button>
          <button type="button" className="btn primary" onClick={openNew}>
            New case
          </button>
        </div>
        <p className="hint">
          OT case cart: draft → Issue (In Stock→OT_RESERVED) → pick list → Reconcile
          (Used/Returned/Wasted/Floor) → OT bill → Pay cash → Print.
        </p>
        <div className="list-toolbar">
          <label className="field grow">
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void reloadList().catch((err) => setError(String(err)));
              }}
              placeholder="Case no / patient / procedure"
            />
          </label>
          <label className="field">
            Status
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                void reloadList(q, e.target.value).catch((err) => setError(String(err)));
              }}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="reconciled">Reconciled</option>
              <option value="billed">Billed</option>
            </select>
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void reloadList().catch((e) => setError(String(e)))}
          >
            Search
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <ul className="data-list">
          {cases.length === 0 ? <li className="empty-row">No OT cases yet</li> : null}
          {cases.map((c) => (
            <li key={c.id}>
              <div>
                <p className="row-title">
                  {c.case_no} · {c.patient_name}
                </p>
                <p className="row-sub">
                  {c.status.toUpperCase()}
                  {c.procedure_name ? ` · ${c.procedure_name}` : ""}
                  {c.doctor_name ? ` · ${c.doctor_name}` : ""}
                </p>
              </div>
              <div className="btn-row">
                <button type="button" className="btn ghost" onClick={() => void openCase(c.id)}>
                  Open
                </button>
                {c.ot_bill_id ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => void openBill(c.ot_bill_id!)}
                  >
                    Bill
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (mode === "bill" && bill) {
    const billDraft = bill.status === "draft";
    return (
      <section className="settings-panel">
        <div className="btn-row">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setMode("case");
              if (caseId) void openCase(caseId);
            }}
          >
            ← Case
          </button>
          <span className="hint">
            {bill.bill_no} · {bill.status.toUpperCase()} · case {bill.case_no}
          </span>
        </div>
        <div className="card-form">
          <p className="row-title">
            {bill.patient_name}
            {bill.doctor_name ? ` · ${bill.doctor_name}` : ""}
          </p>
          <p className="row-sub">{bill.procedure_name || "OT bill"}</p>
          <div className="bill-lines">
            <div className="bill-lines-head">
              <span>Code</span>
              <span>Description</span>
              <span className="num">Qty</span>
              <span className="num">Price</span>
              <span className="num">Amount</span>
              <span />
            </div>
            {(bill.lines ?? []).map((l) => (
              <div key={l.id ?? `${l.code}-${l.description}`} className="bill-lines-row">
                <span>{l.code || "—"}</span>
                <span>{l.description}</span>
                <span className="num">{l.qty}</span>
                <span className="num">{formatMMK(l.unit_price_mmk)}</span>
                <span className="num">{formatMMK(l.line_total_mmk)}</span>
                <span />
              </div>
            ))}
          </div>
          <p className="bill-total">Total: {formatMMK(bill.total_mmk)} MMK</p>
          {error ? <p className="form-error">{error}</p> : null}
          {okMsg ? <p className="form-ok">{okMsg}</p> : null}
          <div className="btn-row">
            {billDraft ? (
              <button type="button" className="btn primary" disabled={busy} onClick={() => void doPayBill()}>
                Pay cash
              </button>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => void printOtBill(bill.id).catch((e) => setError(String(e)))}
            >
              Print
            </button>
          </div>
          {bill.status !== "void" ? (
            <div className="nested-form">
              <label className="field">
                Void reason
                <input
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Voids bill only — stock already closed at reconcile"
                />
              </label>
              <button type="button" className="btn ghost danger" disabled={busy} onClick={() => void doVoidBill()}>
                Void bill
              </button>
            </div>
          ) : null}
          {billDraft ? (
            <p className="hint">
              Bill includes used cart items + doctor OT fee. Stock was already closed at reconcile —
              pay is cash only.
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="settings-panel">
      <div className="btn-row">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setMode("list");
            void reloadList();
          }}
        >
          ← Cases
        </button>
        {caseNo ? (
          <span className="hint">
            {caseNo} · {caseStatus.toUpperCase()}
          </span>
        ) : null}
      </div>

      {!caseNo ? <h2 className="section-title">Create New Case</h2> : null}

      <div className="card-form">
        <div className="field-row">
          <label className="field grow">
            Patient name *
            <input
              value={patientName}
              disabled={!isDraft}
              onChange={(e) => setPatientName(e.target.value)}
              autoFocus
            />
          </label>
          <label className="field">
            Phone
            <input
              value={patientPhone}
              disabled={!isDraft}
              onChange={(e) => setPatientPhone(e.target.value)}
            />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Age
            <input
              value={patientAge}
              disabled={!isDraft}
              inputMode="numeric"
              onChange={(e) => setPatientAge(e.target.value)}
            />
          </label>
          <label className="field">
            Gender
            <select
              value={patientGender}
              disabled={!isDraft}
              onChange={(e) => setPatientGender(e.target.value)}
            >
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="field grow">
            Doctor (OT fee)
            <select
              value={doctorId}
              disabled={!isDraft}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              <option value="">—</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.specialty ? ` (${d.specialty})` : ""} — OT {formatMMK(d.ot_fee_mmk)} MMK
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Procedure
          <input
            value={procedureName}
            disabled={!isDraft}
            onChange={(e) => setProcedureName(e.target.value)}
            placeholder="e.g. Appendectomy"
          />
        </label>
        <label className="field">
          Notes
          <input value={notes} disabled={!isDraft} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {isDraft ? (
          <div className="list-toolbar">
            <label className="field grow">
              Item code — Enter to add to cart
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addByCode();
                  }
                }}
                placeholder="e.g. PARA500"
                autoComplete="off"
              />
            </label>
            <button type="button" className="btn ghost" onClick={() => void addByCode()}>
              Add
            </button>
          </div>
        ) : null}

        {isIssued ? (
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={fillAllUsed}>
              Fill all Used
            </button>
            <span className="hint">Used + Returned + Wasted + Floor = Issued</span>
          </div>
        ) : null}

        <div className={`bill-lines ${isIssued ? "ot-reconcile" : ""}`}>
          <div className={`bill-lines-head ${isIssued ? "ot-reconcile-head" : ""}`}>
            <span>Code</span>
            <span>Item</span>
            <span className="num">Issued</span>
            {isIssued || isReconciled || caseStatus === "billed" ? (
              <>
                <span className="num">Used</span>
                <span className="num">Ret</span>
                <span className="num">Waste</span>
                <span className="num">Floor</span>
              </>
            ) : (
              <>
                <span className="num">Price</span>
                <span />
              </>
            )}
          </div>
          {items.length === 0 ? <p className="empty-row">No cart items</p> : null}
          {items.map((it, i) => (
            <div key={`${it.item_id}-${i}`} className={`bill-lines-row ${isIssued ? "ot-reconcile-row" : ""}`}>
              <span>{it.code}</span>
              <span>{it.name}</span>
              <span className="num">
                {isDraft ? (
                  <input
                    className="qty-input"
                    value={it.qty_issued < 1 ? "" : it.qty_issued}
                    inputMode="numeric"
                    onChange={(e) => {
                      const trimmed = e.target.value.trim();
                      const n = trimmed === "" ? 0 : Math.floor(Number(trimmed));
                      if (trimmed !== "" && (!Number.isFinite(n) || n < 0)) return;
                      setItems((prev) => {
                        const next = [...prev];
                        next[i] = { ...next[i], qty_issued: n };
                        return next;
                      });
                    }}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      let n = raw === "" ? 0 : Math.floor(Number(raw));
                      if (!Number.isFinite(n) || n < 1) n = 1;
                      setItems((prev) => {
                        const next = [...prev];
                        next[i] = { ...next[i], qty_issued: n };
                        return next;
                      });
                    }}
                  />
                ) : (
                  it.qty_issued
                )}
              </span>
              {isIssued ? (
                <>
                  <span className="num">
                    <input
                      className="qty-input"
                      value={it.qty_used}
                      inputMode="numeric"
                      onChange={(e) => setReconcileField(i, "qty_used", e.target.value)}
                    />
                  </span>
                  <span className="num">
                    <input
                      className="qty-input"
                      value={it.qty_returned}
                      inputMode="numeric"
                      onChange={(e) => setReconcileField(i, "qty_returned", e.target.value)}
                    />
                  </span>
                  <span className="num">
                    <input
                      className="qty-input"
                      value={it.qty_wasted}
                      inputMode="numeric"
                      onChange={(e) => setReconcileField(i, "qty_wasted", e.target.value)}
                    />
                  </span>
                  <span className="num">
                    <input
                      className="qty-input"
                      value={it.qty_kept_on_floor}
                      inputMode="numeric"
                      onChange={(e) => setReconcileField(i, "qty_kept_on_floor", e.target.value)}
                    />
                  </span>
                </>
              ) : isReconciled || caseStatus === "billed" ? (
                <>
                  <span className="num">{it.qty_used}</span>
                  <span className="num">{it.qty_returned}</span>
                  <span className="num">{it.qty_wasted}</span>
                  <span className="num">{it.qty_kept_on_floor}</span>
                </>
              ) : (
                <>
                  <span className="num">{formatMMK(it.sell_price_mmk)}</span>
                  <span>
                    {isDraft ? (
                      <button
                        type="button"
                        className="btn ghost danger"
                        onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {okMsg ? <p className="form-ok">{okMsg}</p> : null}

        <div className="btn-row">
          {isDraft ? (
            <>
              <button type="button" className="btn primary" disabled={busy} onClick={() => void saveDraft()}>
                {busy ? "…" : caseId ? "Save" : "Create draft"}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || items.length === 0}
                onClick={() => void doIssue()}
              >
                Issue from pharmacy
              </button>
            </>
          ) : null}
          {isIssued ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void doReconcile()}>
              Reconcile
            </button>
          ) : null}
          {isReconciled ? (
            <>
              <label className="field">
                Optional service code
                <input
                  value={extraServiceCode}
                  onChange={(e) => setExtraServiceCode(e.target.value)}
                  placeholder="e.g. DRESS"
                />
              </label>
              <button type="button" className="btn primary" disabled={busy} onClick={() => void doCreateBill()}>
                Create OT bill
              </button>
            </>
          ) : null}
          {otBillId ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void openBill(otBillId)}>
              Open bill
            </button>
          ) : null}
          <button
            type="button"
            className="btn ghost"
            disabled={busy || !caseId}
            onClick={() =>
              void printOtPickList(caseId!).catch((e) => setError(e instanceof Error ? e.message : String(e)))
            }
          >
            Print pick list
          </button>
        </div>
      </div>
    </section>
  );
}

function PharmacyPanel({
  isAdmin,
  onBack,
}: {
  isAdmin: boolean;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<PharmacyTab>("items");
  const [screen, setScreen] = useState<"browse" | "form">("browse");
  const [editing, setEditing] = useState<PharmacyItem | null>(null);

  function openCreate() {
    setEditing(null);
    setScreen("form");
  }

  function openEdit(item: PharmacyItem) {
    setEditing(item);
    setScreen("form");
  }

  function backToItems() {
    setEditing(null);
    setTab("items");
    setScreen("browse");
  }

  if (screen === "form") {
    return (
      <section className="settings-panel">
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={backToItems}>
            ← Items
          </button>
        </div>
        <h2 className="section-title">
          {editing ? `Edit item ${formatItemCode(editing.code)}` : "Create New Item"}
        </h2>
        <PharmacyItemForm editing={editing} onSaved={backToItems} onCancel={backToItems} />
      </section>
    );
  }

  return (
    <section className="settings-panel">
      <div className="btn-row">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← Back
        </button>
      </div>
      <p className="hint">
        Pharmacy stock: search items → restock or adjust → item history. Create a new catalog
        item when the code is unknown.
      </p>
      <div className="tabs-bar">
        <nav className="tabs" aria-label="Pharmacy sections">
          {(
            [
              { id: "items" as const, label: "Items" },
              { id: "movements" as const, label: "Item History" },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button type="button" className="btn primary" onClick={openCreate}>
          + Create New Item
        </button>
      </div>
      {tab === "items" ? (
        <PharmacyItemsTab isAdmin={isAdmin} onEdit={openEdit} />
      ) : null}
      {tab === "movements" ? <PharmacyMovementsTab /> : null}
    </section>
  );
}

function PharmacyItemForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: PharmacyItem | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(editing?.code ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState<string>(editing?.category ?? "Tablet");
  const [packSize, setPackSize] = useState(editing ? String(editing.pack_size) : "1");
  const [buy, setBuy] = useState(editing ? String(editing.buy_price_mmk) : "0");
  const [sell, setSell] = useState(editing ? String(editing.sell_price_mmk) : "0");
  const [reorder, setReorder] = useState(editing ? String(editing.reorder_level) : "0");
  const [initialQty, setInitialQty] = useState("0");
  const [batchNo, setBatchNo] = useState("");
  const [expiry, setExpiry] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updatePharmacyItem(editing.id, {
          code: code.trim(),
          name: name.trim(),
          category,
          pack_size: Number(packSize) || 1,
          buy_price_mmk: Number(buy) || 0,
          sell_price_mmk: Number(sell) || 0,
          reorder_level: Number(reorder) || 0,
          active: true,
        });
      } else {
        const qty = Number(initialQty) || 0;
        await createPharmacyItem({
          code: code.trim(),
          name: name.trim(),
          category,
          pack_size: Number(packSize) || 1,
          buy_price_mmk: Number(buy) || 0,
          sell_price_mmk: Number(sell) || 0,
          reorder_level: Number(reorder) || 0,
          initial_qty: qty > 0 ? qty : undefined,
          batch_no: batchNo.trim() || undefined,
          expiry_date: expiry.trim() || undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card-form" onSubmit={(e) => void submit(e)}>
      <div className="field-row">
        <label className="field">
          ID/Code
          <input value={code} onChange={(e) => setCode(e.target.value)} required disabled={busy} />
        </label>
        <label className="field">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={busy}
          placeholder="e.g. Paracetamol 500mg"
        />
      </label>
      <div className="field-row">
        <label className="field">
          Pack size (units/box)
          <input
            type="number"
            min={1}
            value={packSize}
            onChange={(e) => setPackSize(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="field">
          Reorder level
          <input
            type="number"
            min={0}
            value={reorder}
            onChange={(e) => setReorder(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          Buy (MMK)
          <input
            type="number"
            min={0}
            value={buy}
            onChange={(e) => setBuy(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="field">
          Sell (MMK)
          <input
            type="number"
            min={0}
            value={sell}
            onChange={(e) => setSell(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      {!editing ? (
        <>
          <div className="field-row">
            <label className="field">
              Initial qty (In Stock)
              <input
                type="number"
                min={0}
                value={initialQty}
                onChange={(e) => setInitialQty(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="field">
              Batch no
              <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} disabled={busy} />
            </label>
          </div>
          <label className="field">
            Expiry (YYYY-MM-DD)
            <input
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              placeholder="2027-06-01"
              disabled={busy}
            />
          </label>
        </>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : editing ? "Update item" : "Save item"}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PharmacyItemsTab({
  isAdmin,
  onEdit,
}: {
  isAdmin: boolean;
  onEdit: (item: PharmacyItem) => void;
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<PharmacyItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelItem, setPanelItem] = useState<PharmacyItem | null>(null);
  const [panelMode, setPanelMode] = useState<"restock" | "view" | null>(null);
  const [itemMovements, setItemMovements] = useState<StockMovement[]>([]);

  const [restockQty, setRestockQty] = useState("");
  const [restockBatch, setRestockBatch] = useState("");
  const [restockExpiry, setRestockExpiry] = useState("");
  const [restockBuy, setRestockBuy] = useState("");
  const [restockSell, setRestockSell] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [codeLookup, setCodeLookup] = useState("");

  const [suggestions, setSuggestions] = useState<PharmacyItem[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const skipSuggestRef = useRef(false);
  const suggestSeqRef = useRef(0);
  const blurCloseRef = useRef<number | null>(null);

  async function reload(search = q) {
    setList(await listPharmacyItems(search.trim()));
  }

  function clearPanel() {
    setPanelItem(null);
    setPanelMode(null);
    setItemMovements([]);
  }

  function resetRestockFields(item: PharmacyItem) {
    setRestockQty("");
    setRestockBatch("");
    setRestockExpiry("");
    setRestockBuy(String(item.buy_price_mmk));
    setRestockSell(String(item.sell_price_mmk));
    setAdjustDelta("");
    setAdjustReason("");
  }

  async function openRestock(id: number) {
    setBusy(true);
    setError(null);
    try {
      const item = await getPharmacyItem(id);
      resetRestockFields(item);
      setItemMovements([]);
      setPanelItem(item);
      setPanelMode("restock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  async function openView(id: number) {
    setBusy(true);
    setError(null);
    try {
      const [item, movements] = await Promise.all([
        getPharmacyItem(id),
        listStockMovements({ itemId: id }),
      ]);
      setPanelItem(item);
      setItemMovements(movements);
      setPanelMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  function closeSuggestions() {
    setSuggestOpen(false);
    setSuggestions([]);
    setHighlight(-1);
  }

  async function selectSuggestion(item: PharmacyItem) {
    skipSuggestRef.current = true;
    closeSuggestions();
    clearPanel();
    setQ(item.code);
    setError(null);
    setBusy(true);
    try {
      await reload(item.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listPharmacyItems("");
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return;
    }
    const term = q.trim();
    if (!term) {
      closeSuggestions();
      return;
    }
    const seq = ++suggestSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const data = await listPharmacyItems(term);
          if (seq !== suggestSeqRef.current) return;
          const next = data.slice(0, 8);
          setSuggestions(next);
          setSuggestOpen(next.length > 0);
          setHighlight(next.length > 0 ? 0 : -1);
        } catch {
          if (seq !== suggestSeqRef.current) return;
          closeSuggestions();
        }
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  async function onDeactivate(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deactivatePharmacyItem(id);
      if (panelItem?.id === id) clearPanel();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFindByCode() {
    setBusy(true);
    setError(null);
    try {
      const found = await findItemByCode(codeLookup);
      clearPanel();
      if (!found) {
        setError(
          `Unknown ID/Code “${codeLookup.trim()}” — create the item first, then restock.`,
        );
        return;
      }
      setQ(found.code);
      await reload(found.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRestock(e: FormEvent) {
    e.preventDefault();
    if (!panelItem || panelMode !== "restock") return;
    setBusy(true);
    setError(null);
    try {
      const qty = Number(restockQty);
      if (!qty || qty <= 0) throw new Error("Restock qty must be > 0");
      const body: {
        qty: number;
        batch_no?: string;
        expiry_date?: string;
        buy_price_mmk?: number;
        sell_price_mmk?: number;
      } = { qty };
      if (restockBatch.trim()) body.batch_no = restockBatch.trim();
      if (restockExpiry.trim()) body.expiry_date = restockExpiry.trim();
      if (restockBuy.trim() !== "") body.buy_price_mmk = Number(restockBuy) || 0;
      if (restockSell.trim() !== "") body.sell_price_mmk = Number(restockSell) || 0;
      const item = await restockItem(panelItem.id, body);
      resetRestockFields(item);
      setPanelItem(item);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restock failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    if (!panelItem || panelMode !== "restock") return;
    setBusy(true);
    setError(null);
    try {
      const delta = Number(adjustDelta);
      if (!delta) throw new Error("Adjustment qty must be non-zero");
      if (!adjustReason.trim()) throw new Error("Reason required");
      const item = await adjustItem(panelItem.id, {
        qty_delta: delta,
        reason: adjustReason.trim(),
      });
      setPanelItem(item);
      setAdjustDelta("");
      setAdjustReason("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjust failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <div className="card-form">
        <div className="list-toolbar">
          <label className="field grow">
            <span>Quick ID/Code lookup (restock target)</span>
            <input
              value={codeLookup}
              onChange={(e) => setCodeLookup(e.target.value)}
              placeholder="Exact ID/Code"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onFindByCode();
                }
              }}
            />
          </label>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void onFindByCode()}>
            Find
          </button>
        </div>
        <div className="list-toolbar">
          <div className="field grow typeahead">
            <span>Search items</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ID/Code or name"
              autoComplete="off"
              role="combobox"
              aria-expanded={suggestOpen}
              aria-autocomplete="list"
              aria-controls="pharmacy-item-suggestions"
              onFocus={() => {
                if (suggestions.length > 0) setSuggestOpen(true);
              }}
              onBlur={() => {
                if (blurCloseRef.current != null) window.clearTimeout(blurCloseRef.current);
                blurCloseRef.current = window.setTimeout(() => {
                  setSuggestOpen(false);
                }, 150);
              }}
              onKeyDown={(e) => {
                if (suggestOpen && suggestions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlight((h) => (h + 1) % suggestions.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setSuggestOpen(false);
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const pick =
                      highlight >= 0 ? suggestions[highlight] : suggestions[0];
                    if (pick) void selectSuggestion(pick);
                    return;
                  }
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  setSuggestOpen(false);
                  clearPanel();
                  void reload(q).catch((err) =>
                    setError(err instanceof Error ? err.message : "Search failed"),
                  );
                }
              }}
            />
            {suggestOpen && suggestions.length > 0 ? (
              <ul
                id="pharmacy-item-suggestions"
                className="typeahead-menu"
                role="listbox"
              >
                {suggestions.map((item, i) => (
                  <li key={item.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === highlight}
                      className={`typeahead-option${i === highlight ? " active" : ""}${
                        !item.active ? " inactive" : ""
                      }`}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (blurCloseRef.current != null) {
                          window.clearTimeout(blurCloseRef.current);
                          blurCloseRef.current = null;
                        }
                        void selectSuggestion(item);
                      }}
                    >
                      <span className="typeahead-title">
                        {formatItemCode(item.code)} — {item.name}
                        {!item.active ? " (inactive)" : ""}
                      </span>
                      <span className="typeahead-sub">
                        {item.category} · In Stock {item.stock_main.toLocaleString()}
                        {item.low_stock && item.active ? " · low stock" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setSuggestOpen(false);
              clearPanel();
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              );
            }}
          >
            Search
          </button>
        </div>
        {error && !panelItem ? <p className="form-error">{error}</p> : null}
        <ul className="data-list">
          {list.length === 0 ? <li className="empty-row">No items yet</li> : null}
          {list.map((item) => (
            <li key={item.id} className={!item.active ? "inactive" : undefined}>
              <div>
                <p className="row-title">
                  {formatItemCode(item.code)} — {item.name}
                  {!item.active ? " (inactive)" : ""}
                  {item.low_stock && item.active ? (
                    <span className="low-stock"> · low stock</span>
                  ) : null}
                </p>
                <p className="row-sub">
                  {item.category} · In Stock {item.stock_main.toLocaleString()} · sell{" "}
                  {item.sell_price_mmk.toLocaleString()} MMK
                </p>
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void openRestock(item.id)}
                  disabled={busy}
                >
                  Restock
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void openView(item.id)}
                  disabled={busy}
                >
                  View
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onEdit(item)}
                  disabled={busy}
                >
                  Edit
                </button>
                {item.active ? (
                  <button
                    type="button"
                    className="btn ghost danger"
                    onClick={() => void onDeactivate(item.id)}
                    disabled={busy}
                  >
                    Deactivate
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {panelItem && panelMode === "restock" ? (
        <div className="card-form">
          <div className="btn-row">
            <h2 className="section-title">
              Restock · {formatItemCode(panelItem.code)} · In Stock{" "}
              {panelItem.stock_main.toLocaleString()}
            </h2>
            <button type="button" className="btn ghost" onClick={clearPanel} disabled={busy}>
              Close
            </button>
          </div>
          <p className="hint">{panelItem.name}</p>

          <form className="nested-form" onSubmit={(e) => void onRestock(e)}>
            <h3 className="section-title">Restock (PURCHASE)</h3>
            <div className="field-row">
              <label className="field">
                <span>Qty</span>
                <input
                  type="number"
                  min={1}
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span>Batch no</span>
                <input
                  value={restockBatch}
                  onChange={(e) => setRestockBatch(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Expiry</span>
                <input
                  value={restockExpiry}
                  onChange={(e) => setRestockExpiry(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span>Buy / Sell (optional)</span>
                <div className="field-row tight">
                  <input
                    type="number"
                    min={0}
                    value={restockBuy}
                    onChange={(e) => setRestockBuy(e.target.value)}
                    disabled={busy}
                    aria-label="Buy price"
                  />
                  <input
                    type="number"
                    min={0}
                    value={restockSell}
                    onChange={(e) => setRestockSell(e.target.value)}
                    disabled={busy}
                    aria-label="Sell price"
                  />
                </div>
              </label>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" className="btn primary" disabled={busy || !panelItem.active}>
              Restock
            </button>
          </form>

          {isAdmin ? (
            <form className="nested-form" onSubmit={(e) => void onAdjust(e)}>
              <h3 className="section-title">Admin adjust</h3>
              <div className="field-row">
                <label className="field">
                  <span>Qty delta (+/−)</span>
                  <input
                    type="number"
                    value={adjustDelta}
                    onChange={(e) => setAdjustDelta(e.target.value)}
                    required
                    disabled={busy}
                  />
                </label>
                <label className="field">
                  <span>Reason</span>
                  <input
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    required
                    disabled={busy}
                    placeholder="Count correction / damage"
                  />
                </label>
              </div>
              <button type="submit" className="btn ghost" disabled={busy}>
                Apply adjustment
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {panelItem && panelMode === "view" ? (
        <div className="card-form">
          <div className="btn-row">
            <h2 className="section-title">
              {formatItemCode(panelItem.code)} · In Stock{" "}
              {panelItem.stock_main.toLocaleString()}
              {panelItem.stock_by_location?.OT_RESERVED
                ? ` · reserved ${panelItem.stock_by_location.OT_RESERVED.toLocaleString()}`
                : ""}
              {panelItem.stock_by_location?.OT_FLOOR
                ? ` · floor ${panelItem.stock_by_location.OT_FLOOR.toLocaleString()}`
                : ""}
            </h2>
            <button type="button" className="btn ghost" onClick={clearPanel} disabled={busy}>
              Close
            </button>
          </div>
          <p className="hint">
            {panelItem.name} — batches by location (FEFO at In Stock for sale/issue).
          </p>
          <ul className="data-list">
            {(panelItem.batches ?? []).length === 0 ? (
              <li className="empty-row">No batches yet — restock to add stock</li>
            ) : null}
            {(panelItem.batches ?? []).map((b) => (
              <li key={b.id}>
                <div>
                  <p className="row-title">
                    {formatLocationLabel(b.location_code)} · qty {b.qty.toLocaleString()}
                  </p>
                  <p className="row-sub">
                    Batch {b.batch_no || "—"} · expiry {b.expiry_date || "none"}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <h3 className="section-title">Item History</h3>
          <ul className="data-list">
            {itemMovements.length === 0 ? (
              <li className="empty-row">No history for this item</li>
            ) : null}
            {itemMovements.map((m) => {
              const reasonLine = formatStockHistoryReason(m.reason);
              return (
                <li key={m.id}>
                  <div>
                    <p className="row-title">{formatStockHistoryLine(m)}</p>
                    {reasonLine ? <p className="row-sub">{reasonLine}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PharmacyMovementsTab() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<StockMovement[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reload(search = q) {
    setList(await listStockMovements({ q: search.trim() || undefined }));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listStockMovements();
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="settings-stack">
      <div className="card-form">
        <h2 className="section-title">Item History</h2>
        <p className="hint">What changed in stock — restock, sales, OT, adjustments. Newest first.</p>
        <div className="list-toolbar">
          <label className="field grow">
            <span>Filter</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ID/Code, name, or note"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void reload(q).catch((err) =>
                    setError(err instanceof Error ? err.message : "Search failed"),
                  );
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              )
            }
          >
            Search
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <ul className="data-list">
          {list.length === 0 ? <li className="empty-row">No history yet</li> : null}
          {list.map((m) => {
            const reasonLine = formatStockHistoryReason(m.reason);
            return (
              <li key={m.id}>
                <div>
                  <p className="row-title">
                    {formatItemCode(m.item_code)} — {m.item_name}
                  </p>
                  <p className="row-sub">{formatStockHistoryLine(m)}</p>
                  {reasonLine ? <p className="row-sub">{reasonLine}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SettingsPanel({
  canManageUsers,
  onBack,
  onChangeServer,
  t,
}: {
  canManageUsers: boolean;
  onBack: () => void;
  onChangeServer?: () => void;
  t: (k: string) => string;
}) {
  const [tab, setTab] = useState<SettingsTab>("hospital");

  return (
    <section className="settings-panel">
      <div className="btn-row">
        <button type="button" className="btn ghost" onClick={onBack}>
          {t("back")}
        </button>
        {onChangeServer ? (
          <button type="button" className="btn ghost" onClick={onChangeServer}>
            {t("clientServerIp")}
          </button>
        ) : null}
      </div>
      <nav className="tabs" aria-label="Settings sections">
        {(
          [
            { id: "hospital" as const, label: t("hospital") },
            { id: "doctors" as const, label: t("doctors") },
            { id: "services" as const, label: t("services") },
            ...(canManageUsers ? [{ id: "users" as const, label: t("users") }] : []),
            { id: "backup" as const, label: t("backup") },
            { id: "training" as const, label: t("training") },
          ]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "hospital" ? <HospitalTab /> : null}
      {tab === "doctors" ? <DoctorsTab /> : null}
      {tab === "services" ? <ServicesTab /> : null}
      {tab === "users" && canManageUsers ? <UsersTab /> : null}
      {tab === "backup" ? <BackupTab /> : null}
      {tab === "training" ? <TrainingTab t={t} /> : null}
    </section>
  );
}

function BackupTab() {
  const [dir, setDir] = useState("");
  const [list, setList] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    const data = await listBackups();
    setDir(data.backup_dir);
    setList(data.backups);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listBackups();
        if (!cancelled) {
          setDir(data.backup_dir);
          setList(data.backups);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function doBackup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const info = await createBackup();
      setMessage(`Backup created: ${info.name}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  }

  async function doRestore(name: string) {
    if (
      !window.confirm(
        `Restore ${name}?\n\nThis replaces the live database. The API will restart. All clients briefly disconnect.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await restoreBackup(name);
      setMessage(res.message || "Restore queued — wait a few seconds, then Retry connection.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-split">
      <div className="card-form">
        <h2 className="section-title">Database backup</h2>
        <p className="hint">
          Copies <code>mudita.db</code> on the server. Also runs automatically on a schedule.
          Copy files from the backup folder to a USB weekly.
        </p>
        {dir ? (
          <p className="status-meta">
            Server folder: <code>{dir}</code>
          </p>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-ok">{message}</p> : null}
        <button type="button" className="btn primary" disabled={busy} onClick={() => void doBackup()}>
          {busy ? "Working…" : "Backup now"}
        </button>
      </div>
      <div className="card-form">
        <h2 className="section-title">Restore</h2>
        <ul className="data-list">
          {list.length === 0 ? <li className="empty-row">No backups yet</li> : null}
          {list.map((b) => (
            <li key={b.name}>
              <div>
                <p className="row-title">{b.name}</p>
                <p className="row-sub">
                  {formatBytes(b.size_bytes)} · {b.created_at}
                </p>
              </div>
              <button
                type="button"
                className="btn ghost danger"
                disabled={busy}
                onClick={() => void doRestore(b.name)}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TrainingTab({ t }: { t: (k: string) => string }) {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    setStatus(await fetchDemoStatus());
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchDemoStatus();
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function doSeed() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedDemo();
      setMessage(res.message || t("done"));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    if (!window.confirm(t("confirmReset"))) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await resetDemo();
      setMessage(res.message || t("done"));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-form">
      <h2 className="section-title">{t("trainingTitle")}</h2>
      <p className="hint">{t("trainingLede")}</p>
      {status ? (
        <p className="status-meta">
          {t("trainingStatus")}: {status.seeded ? t("seeded") : t("notSeeded")} · items{" "}
          {status.training_items} · OPD {status.training_opd_bills} · doctors{" "}
          {status.training_doctors}
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}
      <div className="btn-row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void doSeed()}>
          {busy ? t("busy") : t("seedTraining")}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void doReset()}>
          {t("resetTraining")}
        </button>
      </div>
    </div>
  );
}

function ReportsPanel({
  canCash,
  canStock,
  onBack,
  t,
}: {
  canCash: boolean;
  canStock: boolean;
  onBack: () => void;
  t: (k: string) => string;
}) {
  type Tab = "cash" | "low" | "expiry";
  const [tab, setTab] = useState<Tab>(canCash ? "cash" : "low");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(90);
  const [cash, setCash] = useState<CashReport | null>(null);
  const [low, setLow] = useState<LowStockItem[]>([]);
  const [expiry, setExpiry] = useState<NearExpiryBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      if (tab === "cash" && canCash) {
        setCash(await fetchDailyCash(date));
      } else if (tab === "low" && canStock) {
        const res = await fetchLowStock();
        setLow(res.items);
      } else if (tab === "expiry" && canStock) {
        const res = await fetchNearExpiry(days);
        setExpiry(res.batches);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function doPrint() {
    setBusy(true);
    setError(null);
    try {
      if (tab === "cash") await printDailyCash(date);
      else if (tab === "low") await printLowStock();
      else await printNearExpiry(days);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel">
      <div className="btn-row">
        <button type="button" className="btn ghost" onClick={onBack}>
          {t("back")}
        </button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void doPrint()}>
          {t("print")}
        </button>
      </div>
      <nav className="tabs" aria-label="Reports">
        {canCash ? (
          <button
            type="button"
            className={`tab ${tab === "cash" ? "active" : ""}`}
            onClick={() => setTab("cash")}
          >
            {t("reportDailyCash")}
          </button>
        ) : null}
        {canStock ? (
          <button
            type="button"
            className={`tab ${tab === "low" ? "active" : ""}`}
            onClick={() => setTab("low")}
          >
            {t("reportLowStock")}
          </button>
        ) : null}
        {canStock ? (
          <button
            type="button"
            className={`tab ${tab === "expiry" ? "active" : ""}`}
            onClick={() => setTab("expiry")}
          >
            {t("reportNearExpiry")}
          </button>
        ) : null}
      </nav>

      {tab === "cash" && canCash ? (
        <div className="btn-row report-filters">
          <label className="field inline-field">
            <span>{t("reportDate")}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
            {t("load")}
          </button>
        </div>
      ) : null}
      {tab === "expiry" && canStock ? (
        <div className="btn-row report-filters">
          <label className="field inline-field">
            <span>{t("daysAhead")}</span>
            <input
              type="number"
              min={1}
              max={730}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 90)}
            />
          </label>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
            {t("load")}
          </button>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      {tab === "cash" && cash ? (
        <div className="report-block">
          <p className="hint">
            {t("opdBills")}: {cash.opd_count} · {formatMMK(cash.opd_total_mmk)} {t("mmk")} ·{" "}
            {t("otBills")}: {cash.ot_count} · {formatMMK(cash.ot_total_mmk)} {t("mmk")} ·{" "}
            <strong>
              {t("grandTotal")}: {formatMMK(cash.grand_total_mmk)} {t("mmk")}
            </strong>
          </p>
          <ul className="data-list">
            {cash.lines.length === 0 ? <li className="empty-row">{t("noPaidBills")}</li> : null}
            {cash.lines.map((line) => (
              <li key={`${line.source}-${line.bill_no}`}>
                <div>
                  <p className="row-title">
                    {line.source} {line.bill_no} · {formatMMK(line.total_mmk)} {t("mmk")}
                  </p>
                  <p className="row-sub">
                    {line.patient} · {line.doctor} · {line.paid_at}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "low" ? (
        <ul className="data-list">
          {low.length === 0 ? <li className="empty-row">{t("noLowStock")}</li> : null}
          {low.map((row) => (
            <li key={row.id}>
              <div>
                <p className="row-title">
                  {row.code} — {row.name}
                </p>
                <p className="row-sub">
                  {t("stock")} {row.stock_main} / {t("reorder")} {row.reorder_level} ·{" "}
                  {t("deficit")} {row.deficit}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "expiry" ? (
        <ul className="data-list">
          {expiry.length === 0 ? <li className="empty-row">{t("noNearExpiry")}</li> : null}
          {expiry.map((row) => (
            <li key={row.batch_id} className={row.days_left < 0 ? "row-warn" : undefined}>
              <div>
                <p className="row-title">
                  {row.code} — {row.name}
                </p>
                <p className="row-sub">
                  {formatLocationLabel(row.location_code)} · {t("expiry")} {row.expiry_date} ·{" "}
                  {t("daysLeft")} {row.days_left} · {t("qty")} {row.qty}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function HelpOverlay({ onClose, t }: { onClose: () => void; t: (k: string) => string }) {
  return (
    <div className="help-overlay" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="help-card">
        <div className="btn-row help-top">
          <h2 id="help-title" className="section-title">
            {t("helpTitle")}
          </h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t("close")}
          </button>
        </div>
        <p className="hint">{t("helpLede")}</p>
        <div className="cheat-preview">
          <h3>OPD</h3>
          <ol>
            <li>Home → OPD → New bill</li>
            <li>Patient + doctor → type code → Enter</li>
            <li>Pay cash → Print</li>
          </ol>
          <h3>OT</h3>
          <ol>
            <li>New case → Issue → print pick list</li>
            <li>Reconcile Used / Returned / Wasted / Floor</li>
            <li>OT bill → Pay → Print</li>
          </ol>
          <h3>Pharmacy</h3>
          <ol>
            <li>Search code → Restock (create item if unknown)</li>
            <li>Reports → Low stock / Near expiry</li>
          </ol>
          <h3>Shortcuts</h3>
          <ul>
            <li>
              <kbd>?</kbd> — this help
            </li>
            <li>EN / မြန်မာ — language (top bar)</li>
            <li>OPD code field — Enter adds line</li>
          </ul>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              try {
                openCheatSheetPrint();
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "Print failed");
              }
            }}
          >
            {t("printCheatSheet")}
          </button>
        </div>
      </div>
    </div>
  );
}

function HospitalTab() {
  const [form, setForm] = useState<HospitalSettings>({
    hospital_name: "",
    address: "",
    phone: "",
    logo_path: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchHospitalSettings();
        if (!cancelled) setForm(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const data = await saveHospitalSettings({
        hospital_name: form.hospital_name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        logo_path: form.logo_path.trim(),
      });
      setForm(data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-split">
      <form className="card-form" onSubmit={(e) => void submit(e)}>
        <h2 className="section-title">Bill header</h2>
        <label className="field">
          <span>Hospital name</span>
          <input
            value={form.hospital_name}
            onChange={(e) => setForm({ ...form, hospital_name: e.target.value })}
            required
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>Address</span>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>Phone</span>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>Logo path (optional file path)</span>
          <input
            value={form.logo_path}
            onChange={(e) => setForm({ ...form, logo_path: e.target.value })}
            placeholder="C:\Mudita\logo.png"
            disabled={busy}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {saved ? <p className="form-ok">Saved</p> : null}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Save hospital settings"}
        </button>
      </form>
      <aside className="bill-preview" aria-label="Bill header preview">
        <p className="preview-label">Preview</p>
        <p className="preview-name">{form.hospital_name || "Hospital name"}</p>
        {form.address ? <p className="preview-line">{form.address}</p> : null}
        {form.phone ? <p className="preview-line">Tel: {form.phone}</p> : null}
        {form.logo_path ? <p className="preview-meta">Logo: {form.logo_path}</p> : null}
      </aside>
    </div>
  );
}

function DoctorsTab() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Doctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [consult, setConsult] = useState("0");
  const [ot, setOt] = useState("0");

  async function reload(search = q) {
    const data = await listDoctors(search.trim());
    setList(data);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listDoctors("");
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function startCreate() {
    setEditing(null);
    setName("");
    setSpecialty("");
    setConsult("0");
    setOt("0");
  }

  function startEdit(d: Doctor) {
    setEditing(d);
    setName(d.name);
    setSpecialty(d.specialty);
    setConsult(String(d.fees.consultation_mmk));
    setOt(String(d.fees.ot_mmk));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        specialty: specialty.trim(),
        consultation_mmk: Number(consult) || 0,
        ot_mmk: Number(ot) || 0,
        active: true,
      };
      if (editing) {
        await updateDoctor(editing.id, body);
      } else {
        await createDoctor(body);
      }
      startCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivate(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deactivateDoctor(id);
      if (editing?.id === id) startCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <form className="card-form" onSubmit={(e) => void submit(e)}>
        <h2 className="section-title">{editing ? `Edit doctor #${editing.id}` : "Add doctor"}</h2>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
        </label>
        <label className="field">
          <span>Specialty</span>
          <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} disabled={busy} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Consultation (MMK)</span>
            <input
              type="number"
              min={0}
              value={consult}
              onChange={(e) => setConsult(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>OT fee (MMK)</span>
            <input type="number" min={0} value={ot} onChange={(e) => setOt(e.target.value)} disabled={busy} />
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : editing ? "Update doctor" : "Add doctor"}
          </button>
          {editing ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={startCreate}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="card-form">
        <div className="list-toolbar">
          <label className="field grow">
            <span>Search doctors</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void reload(q).catch((err) =>
                    setError(err instanceof Error ? err.message : "Search failed"),
                  );
                }
              }}
              placeholder="Name or specialty"
            />
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              )
            }
          >
            Search
          </button>
        </div>
        <ul className="data-list">
          {list.length === 0 ? <li className="empty-row">No doctors yet</li> : null}
          {list.map((d) => (
            <li key={d.id} className={!d.active ? "inactive" : undefined}>
              <div>
                <p className="row-title">
                  {d.name}
                  {!d.active ? " (inactive)" : ""}
                </p>
                <p className="row-sub">
                  {d.specialty || "General"} · Consult {d.fees.consultation_mmk.toLocaleString()} · OT{" "}
                  {d.fees.ot_mmk.toLocaleString()} MMK
                </p>
              </div>
              <div className="btn-row">
                <button type="button" className="btn ghost" onClick={() => startEdit(d)} disabled={busy}>
                  Edit
                </button>
                {d.active ? (
                  <button
                    type="button"
                    className="btn ghost danger"
                    onClick={() => void onDeactivate(d.id)}
                    disabled={busy}
                  >
                    Deactivate
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ServicesTab() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");

  async function reload(search = q) {
    setList(await listServices(search.trim()));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listServices("");
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function startCreate() {
    setEditing(null);
    setCode("");
    setName("");
    setPrice("0");
  }

  function startEdit(s: Service) {
    setEditing(s);
    setCode(s.code);
    setName(s.name);
    setPrice(String(s.price_mmk));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        code: code.trim(),
        name: name.trim(),
        price_mmk: Number(price) || 0,
        active: true,
      };
      if (editing) {
        await updateService(editing.id, body);
      } else {
        await createService(body);
      }
      startCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivate(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deactivateService(id);
      if (editing?.id === id) startCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <form className="card-form" onSubmit={(e) => void submit(e)}>
        <h2 className="section-title">{editing ? `Edit service #${editing.id}` : "Add service"}</h2>
        <div className="field-row">
          <label className="field">
            <span>Code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} required disabled={busy} />
          </label>
          <label className="field">
            <span>Price (MMK)</span>
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={busy}
            placeholder="e.g. Dressing"
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : editing ? "Update service" : "Add service"}
          </button>
          {editing ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={startCreate}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="card-form">
        <div className="list-toolbar">
          <label className="field grow">
            <span>Search services</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Code or name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void reload(q).catch((err) =>
                    setError(err instanceof Error ? err.message : "Search failed"),
                  );
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              )
            }
          >
            Search
          </button>
        </div>
        <ul className="data-list">
          {list.length === 0 ? <li className="empty-row">No services yet</li> : null}
          {list.map((s) => (
            <li key={s.id} className={!s.active ? "inactive" : undefined}>
              <div>
                <p className="row-title">
                  {s.code} — {s.name}
                  {!s.active ? " (inactive)" : ""}
                </p>
                <p className="row-sub">{s.price_mmk.toLocaleString()} MMK · non-stock</p>
              </div>
              <div className="btn-row">
                <button type="button" className="btn ghost" onClick={() => startEdit(s)} disabled={busy}>
                  Edit
                </button>
                {s.active ? (
                  <button
                    type="button"
                    className="btn ghost danger"
                    onClick={() => void onDeactivate(s.id)}
                    disabled={busy}
                  >
                    Deactivate
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function UsersTab() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"Reception" | "Pharmacy">("Reception");
  const [password, setPassword] = useState("");

  async function reload(search = q) {
    setList(await listUsers(search.trim()));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listUsers("");
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createUser({
        username: username.trim(),
        display_name: displayName.trim(),
        role,
        password,
      });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("Reception");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: ManagedUser) {
    setBusy(true);
    setError(null);
    try {
      await updateUser(u.id, { active: !u.active });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <form className="card-form" onSubmit={(e) => void submit(e)}>
        <h2 className="section-title">Create Reception / Pharmacy user</h2>
        <div className="field-row">
          <label className="field">
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as "Reception" | "Pharmacy")} disabled={busy}>
              <option value="Reception">Reception</option>
              <option value="Pharmacy">Pharmacy</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>Temp password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            disabled={busy}
          />
        </label>
        <p className="hint">New users must change password on first login. Reception cannot open this tab.</p>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Create user"}
        </button>
      </form>

      <div className="card-form">
        <div className="list-toolbar">
          <label className="field grow">
            <span>Search users</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Username or name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void reload(q).catch((err) =>
                    setError(err instanceof Error ? err.message : "Search failed"),
                  );
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              )
            }
          >
            Search
          </button>
        </div>
        <ul className="data-list">
          {list.map((u) => (
            <li key={u.id} className={!u.active ? "inactive" : undefined}>
              <div>
                <p className="row-title">
                  {u.username} · {u.role}
                  {!u.active ? " (inactive)" : ""}
                </p>
                <p className="row-sub">
                  {u.display_name}
                  {u.must_change_password ? " · must change password" : ""}
                </p>
              </div>
              {u.role !== "Admin" ? (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void toggleActive(u)}
                >
                  {u.active ? "Deactivate" : "Activate"}
                </button>
              ) : (
                <span className="row-sub">Admin</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;
