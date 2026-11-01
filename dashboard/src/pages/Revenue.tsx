import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getApiBase } from "../api";
import { getStoredToken } from "../auth";
import {
  fetchPharmacyMargin,
  fetchRevenueByDoctor,
  fetchRevenueByService,
  fetchTrends,
  type DashRange,
  type DoctorRevenueRow,
  type PharmacyMarginReport,
  type ServiceRevenueRow,
  type TrendPoint,
} from "../dashboardApi";
import { DatePicker } from "../components/DatePicker";
import { KpiCard } from "../components/kpi/KpiCard";
import { getLocale } from "../i18n";
import { formatMMK } from "../lib/format";
import { downloadPrintCSV, fetchAndPreviewPrint, fetchPrintHTML } from "../print";
import { todayISO } from "../reports";

type Props = {
  t: (k: string) => string;
};

/** Day presets use days=; calendar presets send from/to. */
type RevenuePreset = 7 | 30 | "months4" | "year1";
type PrintKind = "income" | "expense";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const FALLBACK = {
  accent: "#2563eb",
  ot: "#4a90c8",
  pharmacy: "#1f7a4d",
  lab: "#a16207",
  muted: "#6d6d68",
  grid: "rgba(26, 31, 46, 0.08)",
} as const;

function readToken(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function chartColors() {
  return {
    accent: readToken("--accent", FALLBACK.accent),
    ot: readToken("--series-ot", FALLBACK.ot),
    pharmacy: readToken("--series-pharmacy", FALLBACK.pharmacy),
    lab: readToken("--series-lab", FALLBACK.lab),
    muted: readToken("--muted", FALLBACK.muted),
    grid: FALLBACK.grid,
  };
}

function shortDate(iso: string): string {
  // YYYY-MM-DD → MM-DD
  return iso.length >= 10 ? iso.slice(5) : iso;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function shiftISO(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Same-day calendar shift with month-end clamp (matches Go AddDate). */
function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const probe = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const dt = new Date(probe.getFullYear(), probe.getMonth(), day);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function presetWindow(preset: RevenuePreset): { from: string; to: string } {
  const to = todayISO();
  if (preset === "months4") return { to, from: addMonthsISO(to, -4) };
  if (preset === "year1") return { to, from: addMonthsISO(to, -12) };
  return { to, from: shiftISO(to, -(preset - 1)) };
}

function rangeForPreset(preset: RevenuePreset | null, from: string, to: string): DashRange {
  if (preset === 7 || preset === 30) return preset;
  return { from, to };
}

function presetLabel(preset: RevenuePreset, t: (k: string) => string): string {
  if (preset === 7) return t("days7");
  if (preset === 30) return t("days30");
  if (preset === "months4") return t("months4");
  return t("year1");
}

/** Inclusive window. Matches the server cap: more than 366 days between the dates is too long. */
function rangeProblem(from: string, to: string): "errDateOrder" | "errRangeTooLong" | null {
  if (from > to) return "errDateOrder";
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
  if (diff > 366) return "errRangeTooLong";
  return null;
}

function lineTypeLabel(lineType: string, t: (k: string) => string): string {
  if (lineType === "service") return t("service");
  if (lineType === "consultation") return t("consultation");
  if (lineType === "ot_fee") return t("lineTypeOtFee");
  return lineType;
}

type TipEntry = { name?: unknown; value?: unknown };

function StackCashTooltip({
  active,
  payload,
  label,
  t,
}: {
  active?: boolean;
  payload?: readonly TipEntry[];
  label?: unknown;
  t: (k: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(26,31,46,0.12)",
        borderRadius: 8,
        padding: "0.45rem 0.6rem",
        fontSize: 14,
        lineHeight: 1.45,
      }}
    >
      <p style={{ margin: "0 0 0.25rem", fontWeight: 600 }}>{String(label ?? "")}</p>
      {payload.map((entry) => (
        <p key={String(entry.name)} style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>
          {String(entry.name)}: {formatMMK(Number(entry.value))} {t("mmk")}
        </p>
      ))}
    </div>
  );
}

function TotalCashTooltip({
  active,
  payload,
  label,
  t,
}: {
  active?: boolean;
  payload?: readonly TipEntry[];
  label?: unknown;
  t: (k: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(26,31,46,0.12)",
        borderRadius: 8,
        padding: "0.45rem 0.6rem",
        fontSize: 14,
        lineHeight: 1.45,
      }}
    >
      <p style={{ margin: "0 0 0.25rem", fontWeight: 600 }}>{String(label ?? "")}</p>
      <p style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>
        {t("cashInRange")}: {formatMMK(value)} {t("mmk")}
      </p>
    </div>
  );
}

export function RevenuePage({ t }: Props) {
  const fromId = useId();
  const toId = useId();
  const cashTrendTitleId = useId();
  const byDoctorTitleId = useId();
  const byServiceTitleId = useId();
  const pharmacyMarginTitleId = useId();
  const topByRevenueTitleId = useId();
  const topByMarginTitleId = useId();
  const printMenuId = useId();
  const opening = presetWindow(30);
  const [preset, setPreset] = useState<RevenuePreset | null>(30);
  const [from, setFrom] = useState(opening.from);
  const [to, setTo] = useState(opening.to);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [doctors, setDoctors] = useState<DoctorRevenueRow[]>([]);
  const [services, setServices] = useState<ServiceRevenueRow[]>([]);
  const [margin, setMargin] = useState<PharmacyMarginReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const printMenuRef = useRef<HTMLDivElement>(null);
  const printBtnRef = useRef<HTMLButtonElement>(null);
  const menuFocusRef = useRef<"first" | "last">("first");
  const restorePrintFocus = useRef(false);
  const colors = chartColors();

  useEffect(() => {
    if (printing || !restorePrintFocus.current) return;
    restorePrintFocus.current = false;
    printBtnRef.current?.focus();
  }, [printing]);

  useEffect(() => {
    if (!printOpen) return;
    const items = printMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!items || items.length === 0) return;
    const target = menuFocusRef.current === "last" ? items[items.length - 1] : items[0];
    target.focus();
  }, [printOpen]);

  useEffect(() => {
    if (!printOpen) return;
    function onPointerDown(event: MouseEvent) {
      const root = printMenuRef.current;
      if (!root || root.contains(event.target as Node)) return;
      const target = event.target;
      const takesFocus =
        target instanceof Element &&
        target.closest(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) !== null;
      setPrintOpen(false);
      if (!takesFocus) printBtnRef.current?.focus();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const inside = printMenuRef.current?.contains(document.activeElement) ?? false;
      setPrintOpen(false);
      if (inside) printBtnRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [printOpen]);

  function menuItems(): HTMLButtonElement[] {
    return Array.from(printMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  }

  function moveFocusFromPrintButton(backwards: boolean) {
    const btn = printBtnRef.current;
    if (!btn) return;
    const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
      if (el.closest(".print-menu-dropdown")) return false;
      return el.getClientRects().length > 0;
    });
    const index = all.indexOf(btn);
    if (index < 0) {
      btn.focus();
      return;
    }
    const next = all[index + (backwards ? -1 : 1)];
    (next ?? btn).focus();
  }

  function onPrintMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = menuItems();
    const current = items.findIndex((el) => el === document.activeElement);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!printOpen) {
        if (printBtnRef.current?.disabled) return;
        menuFocusRef.current = event.key === "ArrowUp" ? "last" : "first";
        setPrintOpen(true);
        return;
      }
      if (items.length === 0) return;
      const next =
        event.key === "ArrowDown"
          ? current < 0
            ? 0
            : (current + 1) % items.length
          : current < 0
            ? items.length - 1
            : (current - 1 + items.length) % items.length;
      items[next]?.focus();
      return;
    }

    if (!printOpen) return;

    if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setPrintOpen(false);
      printBtnRef.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      setPrintOpen(false);
      moveFocusFromPrintButton(event.shiftKey);
    }
  }

  function applyPreset(next: RevenuePreset) {
    const window = presetWindow(next);
    setPreset(next);
    setFrom(window.from);
    setTo(window.to);
  }

  function applyFrom(iso: string) {
    if (!iso) return;
    setPreset(null);
    setFrom(iso);
  }

  function applyTo(iso: string) {
    if (!iso) return;
    setPreset(null);
    setTo(iso);
  }

  function activeRangeQuery(): string {
    const range = rangeForPreset(preset, from, to);
    if (typeof range === "number") return `days=${range}`;
    return `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  }

  async function handlePrint(kind: PrintKind) {
    setPrintOpen(false);
    printBtnRef.current?.focus();
    const problem = rangeProblem(from, to);
    if (problem) {
      setPrintError(t(problem));
      return;
    }
    setPrintError(null);
    setPrinting(true);
    const title = kind === "income" ? t("printIncomeReport") : t("printExpenseReport");
    const initialLang = getLocale();
    const pathFor = (lang: "en" | "my") =>
      `/api/dashboard/revenue-report/print?${activeRangeQuery()}&kind=${kind}&lang=${lang}`;
    const exportPathFor = (lang: "en" | "my") =>
      `/api/dashboard/revenue-report/export?${activeRangeQuery()}&kind=${kind}&lang=${lang}`;
    try {
      await fetchAndPreviewPrint(pathFor(initialLang), getApiBase, getStoredToken, {
        title,
        receipt: false,
        reportLang: {
          initial: initialLang,
          englishLabel: t("printLangEn"),
          myanmarLabel: t("printLangMy"),
          langGroupLabel: t("printLang"),
          onChange: (lang) => fetchPrintHTML(pathFor(lang), getApiBase, getStoredToken),
        },
        excel: {
          label: t("downloadExcel"),
          download: (lang) =>
            downloadPrintCSV(exportPathFor(lang), getApiBase, getStoredToken),
        },
      });
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : t("error"));
      restorePrintFocus.current = true;
    } finally {
      setPrinting(false);
    }
  }

  async function handlePresentation() {
    setPrintOpen(false);
    printBtnRef.current?.focus();
    const problem = rangeProblem(from, to);
    if (problem) {
      setPrintError(t(problem));
      return;
    }
    setPrintError(null);
    setPrinting(true);
    const initialLang = getLocale();
    const pathFor = (lang: "en" | "my") =>
      `/api/dashboard/revenue-report/presentation?${activeRangeQuery()}&lang=${lang}`;
    try {
      await fetchAndPreviewPrint(pathFor(initialLang), getApiBase, getStoredToken, {
        title: t("printPresentationReport"),
        receipt: false,
        reportLang: {
          initial: initialLang,
          englishLabel: t("printLangEn"),
          myanmarLabel: t("printLangMy"),
          langGroupLabel: t("printLang"),
          onChange: (lang) => fetchPrintHTML(pathFor(lang), getApiBase, getStoredToken),
        },
      });
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : t("error"));
      restorePrintFocus.current = true;
    } finally {
      setPrinting(false);
    }
  }

  useEffect(() => {
    const problem = rangeProblem(from, to);
    if (problem) {
      setError(t(problem));
      setLoading(false);
      return;
    }
    const range = rangeForPreset(preset, from, to);
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [tr, dr, sv, mg] = await Promise.all([
          fetchTrends(range),
          fetchRevenueByDoctor(range),
          fetchRevenueByService(range),
          fetchPharmacyMargin(range),
        ]);
        if (cancelled) return;
        setTrends(tr.points);
        setDoctors(dr.rows);
        setServices(sv.rows);
        setMargin(mg);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preset, from, to, epoch, t]);

  const chartData = trends.map((p) => ({
    ...p,
    label: shortDate(p.date),
  }));

  const rangeCash = trends.reduce((s, p) => s + p.grand_total_mmk, 0);
  const rangeBills = trends.reduce((s, p) => s + p.bill_count, 0);
  const tickInterval = chartData.length > 60 ? Math.ceil(chartData.length / 10) : chartData.length > 31 ? 2 : 0;
  const stackChartLabel = `${t("cashTrend")} — ${t("opdCash")}, ${t("otCash")}, ${t("pharmacyCash")}, ${t("labCash")}`;

  return (
    <div className="page page-frame revenue-page">
      <div className="page-header">
        <p className="lede muted">{t("revenueLede")}</p>
        <div className="page-actions">
          <div className="range-field">
            <label htmlFor={fromId}>{t("rangeFrom")}</label>
            <DatePicker
              id={fromId}
              value={from}
              onChange={applyFrom}
              openCalendarLabel={t("openCalendar")}
              chooseDateLabel={t("chooseDate")}
              previousMonthLabel={t("previousMonth")}
              nextMonthLabel={t("nextMonth")}
            />
          </div>
          <div className="range-field">
            <label htmlFor={toId}>{t("rangeTo")}</label>
            <DatePicker
              id={toId}
              value={to}
              onChange={applyTo}
              openCalendarLabel={t("openCalendar")}
              chooseDateLabel={t("chooseDate")}
              previousMonthLabel={t("previousMonth")}
              nextMonthLabel={t("nextMonth")}
            />
          </div>
          <div className="range-toggle" role="group" aria-label={t("dateRange")}>
            {([7, 30, "months4", "year1"] as RevenuePreset[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`btn ghost${preset === d ? " active" : ""}`}
                aria-pressed={preset === d}
                onClick={() => applyPreset(d)}
              >
                {presetLabel(d, t)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (preset) {
                const window = presetWindow(preset);
                setFrom(window.from);
                setTo(window.to);
              }
              setEpoch((n) => n + 1);
            }}
          >
            {t("refresh")}
          </button>
          <div className="print-menu" ref={printMenuRef} onKeyDown={onPrintMenuKeyDown}>
            <button
              ref={printBtnRef}
              type="button"
              className="btn primary"
              aria-haspopup="menu"
              aria-expanded={printOpen}
              aria-controls={printMenuId}
              aria-label={printing ? t("busy") : t("printMenu")}
              onClick={() => {
                menuFocusRef.current = "first";
                setPrintOpen((open) => !open);
              }}
              disabled={printing || loading}
            >
              {printing ? t("busy") : t("print")}
            </button>
            {printOpen ? (
              <div
                className="print-menu-dropdown"
                id={printMenuId}
                role="menu"
                aria-label={t("printMenu")}
                aria-orientation="vertical"
              >
                <button
                  type="button"
                  className="print-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => void handlePrint("income")}
                >
                  {t("printIncomeReport")}
                </button>
                <button
                  type="button"
                  className="print-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => void handlePrint("expense")}
                >
                  {t("printExpenseReport")}
                </button>
                <button
                  type="button"
                  className="print-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => void handlePresentation()}
                >
                  {t("printPresentationReport")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {printError ? (
        <p className="form-error" role="alert">
          {printError}
        </p>
      ) : null}
      {loading && !trends.length && !margin ? (
        <p className="muted" aria-live="polite">
          {t("loading")}
        </p>
      ) : null}

      <div className="kpi-strip kpi-strip--four" aria-label={t("revenue")}>
        <KpiCard label={t("cashInRange")} value={formatMMK(rangeCash)} sub={t("mmk")} tone="accent" />
        <KpiCard
          label={t("billCount")}
          value={String(rangeBills)}
          sub={rangeBills > 0 ? `${t("avgBill")}: ${formatMMK(Math.round(rangeCash / rangeBills))}` : undefined}
        />
        <KpiCard
          label={t("pharmacyMargin")}
          value={margin ? formatMMK(margin.margin_mmk) : "—"}
          sub={margin ? pct(margin.margin_pct) : undefined}
          tone="accent"
        />
        <KpiCard
          label={t("pharmacyCogs")}
          value={margin ? formatMMK(margin.cogs_mmk) : "—"}
          sub={margin ? pct(margin.cogs_pct) : undefined}
        />
      </div>

        <section className="panel" aria-labelledby={cashTrendTitleId}>
        <h2 id={cashTrendTitleId}>{t("cashTrend")}</h2>
        {chartData.length === 0 || rangeCash === 0 ? (
          <p className="empty-state">{t("noRevenueData")}</p>
        ) : (
          <div className="chart-stack">
            <div className="chart-box" role="img" aria-label={stackChartLabel}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    interval={tickInterval}
                    tick={{ fill: colors.muted, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: colors.muted, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) =>
                      v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)}M`
                        : v >= 1000
                          ? `${Math.round(v / 1000)}k`
                          : String(v)
                    }
                    width={48}
                  />
                  <Tooltip
                    content={(props) => (
                      <StackCashTooltip
                        active={props.active}
                        payload={props.payload}
                        label={props.label}
                        t={t}
                      />
                    )}
                  />
                  <Legend wrapperStyle={{ fontSize: 14 }} />
                  <Bar dataKey="opd_total_mmk" name={t("opdCash")} stackId="cash" fill={colors.accent} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="ot_total_mmk" name={t("otCash")} stackId="cash" fill={colors.ot} />
                  <Bar
                    dataKey="pharmacy_total_mmk"
                    name={t("pharmacyCash")}
                    stackId="cash"
                    fill={colors.pharmacy}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="lab_total_mmk"
                    name={t("labCash")}
                    stackId="cash"
                    fill={colors.lab}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-box" role="img" aria-label={t("cashInRange")}>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    interval={tickInterval}
                    tick={{ fill: colors.muted, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    content={(props) => (
                      <TotalCashTooltip
                        active={props.active}
                        payload={props.payload}
                        label={props.label}
                        t={t}
                      />
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="grand_total_mmk"
                    stroke={colors.accent}
                    strokeWidth={2}
                    dot={false}
                    name={t("cashInRange")}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      <div className="split-panels">
        <section className="panel" aria-labelledby={byDoctorTitleId}>
          <h2 id={byDoctorTitleId}>{t("byDoctor")}</h2>
          {doctors.length === 0 ? (
            <p className="empty-state">{t("noRevenueData")}</p>
          ) : (
            <table className="data-table" aria-labelledby={byDoctorTitleId}>
              <thead>
                <tr>
                  <th>{t("doctor")}</th>
                  <th className="num">{t("billCount")}</th>
                  <th className="num">{t("mmk")}</th>
                </tr>
              </thead>
              <tbody>
                {doctors.slice(0, 20).map((row) => (
                  <tr key={`${row.doctor_id}-${row.doctor_name}`}>
                    <td>{row.doctor_name}</td>
                    <td className="num">{row.bill_count}</td>
                    <td className="num">{formatMMK(row.total_mmk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" aria-labelledby={byServiceTitleId}>
          <h2 id={byServiceTitleId}>{t("byService")}</h2>
          {services.length === 0 ? (
            <p className="empty-state">{t("noRevenueData")}</p>
          ) : (
            <table className="data-table" aria-labelledby={byServiceTitleId}>
              <thead>
                <tr>
                  <th>{t("service")}</th>
                  <th>{t("type")}</th>
                  <th className="num">{t("mmk")}</th>
                </tr>
              </thead>
              <tbody>
                {services.slice(0, 20).map((row) => (
                  <tr key={`${row.line_type}-${row.code}-${row.description}`}>
                    <td>
                      {row.description || row.code || "—"}
                      {row.code ? <span className="muted tiny"> · {row.code}</span> : null}
                    </td>
                    <td>{lineTypeLabel(row.line_type, t)}</td>
                    <td className="num">{formatMMK(row.total_mmk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby={pharmacyMarginTitleId}>
        <h2 id={pharmacyMarginTitleId}>{t("pharmacyMargin")}</h2>
        <p className="muted estimate-note">{margin?.note ?? t("marginEstimateNote")}</p>
        {margin && margin.revenue_mmk === 0 ? (
          <p className="empty-state">{t("noPharmacySales")}</p>
        ) : margin ? (
          <>
            <div className="kpi-strip tight" aria-label={t("pharmacyMargin")}>
              <KpiCard label={t("pharmacyRevenue")} value={formatMMK(margin.revenue_mmk)} sub={t("mmk")} />
              <KpiCard label={t("pharmacyCogs")} value={formatMMK(margin.cogs_mmk)} sub={pct(margin.cogs_pct)} />
              <KpiCard
                label={t("grossMargin")}
                value={formatMMK(margin.margin_mmk)}
                sub={pct(margin.margin_pct)}
                tone="accent"
              />
            </div>
            <h3 className="panel-subhead" id={topByRevenueTitleId}>
              {t("topItemsByRevenue")}
            </h3>
            <table className="data-table" aria-labelledby={topByRevenueTitleId}>
              <thead>
                <tr>
                  <th>{t("item")}</th>
                  <th className="num">{t("qty")}</th>
                  <th className="num">{t("pharmacyRevenue")}</th>
                  <th className="num">{t("grossMargin")}</th>
                </tr>
              </thead>
              <tbody>
                {margin.top_by_revenue.map((row) => (
                  <tr key={`rev-${row.item_id}-${row.code}`}>
                    <td>
                      {row.name}
                      {row.code ? <span className="muted tiny"> · {row.code}</span> : null}
                    </td>
                    <td className="num">{row.qty_sold}</td>
                    <td className="num">{formatMMK(row.revenue_mmk)}</td>
                    <td className="num">{formatMMK(row.margin_mmk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="panel-subhead" id={topByMarginTitleId}>
              {t("topItemsByMargin")}
            </h3>
            <table className="data-table" aria-labelledby={topByMarginTitleId}>
              <thead>
                <tr>
                  <th>{t("item")}</th>
                  <th className="num">{t("qty")}</th>
                  <th className="num">{t("grossMargin")}</th>
                  <th className="num">{t("pharmacyRevenue")}</th>
                </tr>
              </thead>
              <tbody>
                {margin.top_by_margin.map((row) => (
                  <tr key={`mrg-${row.item_id}-${row.code}`}>
                    <td>
                      {row.name}
                      {row.code ? <span className="muted tiny"> · {row.code}</span> : null}
                    </td>
                    <td className="num">{row.qty_sold}</td>
                    <td className="num">{formatMMK(row.margin_mmk)}</td>
                    <td className="num">{formatMMK(row.revenue_mmk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </section>
    </div>
  );
}
