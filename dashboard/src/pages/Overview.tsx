import { useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertChip } from "../components/kpi/AlertChip";
import { KpiCard } from "../components/kpi/KpiCard";
import {
  fetchDashOverview,
  fetchTrends,
  type DashOverview,
  type TrendPoint,
} from "../dashboardApi";
import { formatDelta, formatMMK } from "../lib/format";

type Props = {
  t: (k: string) => string;
};

const FALLBACK = {
  accent: "#2563eb",
  ot: "#4a90c8",
  pharmacy: "#1f7a4d",
  lab: "#a16207",
  ipd: "#6b4fa0",
  ink: "#1c1c1c",
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
    ipd: readToken("--series-ipd", FALLBACK.ipd),
    ink: readToken("--ink", FALLBACK.ink),
    muted: readToken("--muted", FALLBACK.muted),
    grid: FALLBACK.grid,
  };
}

type TipPayload = { payload?: TrendPoint & { label?: string } };

function CashTrendTooltip({
  active,
  payload,
  t,
}: {
  active?: boolean;
  payload?: readonly TipPayload[];
  t: (k: string) => string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const lines: [string, string][] = [
    [t("opdCash"), formatMMK(row.opd_total_mmk ?? 0)],
    [t("otCash"), formatMMK(row.ot_total_mmk ?? 0)],
    [t("pharmacyCash"), formatMMK(row.pharmacy_total_mmk ?? 0)],
    [t("labCash"), formatMMK(row.lab_total_mmk ?? 0)],
    [t("ipdCash"), formatMMK(row.ipd_cash_mmk ?? 0)],
    [t("totalExpenses"), formatDelta(row.expense_mmk ?? 0)],
    [t("netCash"), formatDelta(row.net_cash_mmk ?? 0)],
  ];
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
      <p style={{ margin: "0 0 0.25rem", fontWeight: 600 }}>{row.label ?? row.date}</p>
      {lines.map(([name, value]) => (
        <p key={name} style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>
          {name}: {value} {t("mmk")}
        </p>
      ))}
    </div>
  );
}

function netTone(n: number): "accent" | "warn" | "default" {
  if (n > 0) return "accent";
  if (n < 0) return "warn";
  return "default";
}

function alertLabel(base: string, count: number | string | undefined, needsAttention: boolean, t: (k: string) => string) {
  const value = count ?? "—";
  if (needsAttention) return `${base}: ${value} — ${t("attentionNeeded")}`;
  return `${base}: ${value}`;
}

export function OverviewPage({ t }: Props) {
  const [overview, setOverview] = useState<DashOverview | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const colors = chartColors();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [ov, tr] = await Promise.all([fetchDashOverview(), fetchTrends(30)]);
        if (cancelled) return;
        setOverview(ov);
        setTrends(tr.points);
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
  }, [epoch, t]);

  const total = overview?.grand_total_mmk ?? 0;
  const opdShare = total > 0 && overview ? (overview.opd_total_mmk / total) * 100 : 0;
  const otShare = total > 0 && overview ? (overview.ot_total_mmk / total) * 100 : 0;
  const pharmacyShare =
    total > 0 && overview ? ((overview.pharmacy_total_mmk ?? 0) / total) * 100 : 0;
  const income = overview?.income_mmk ?? 0;
  const expense = overview?.expense_mmk ?? 0;
  const net = overview?.net_cash_mmk ?? 0;
  const chartData = trends.map((p) => ({
    ...p,
    ipd_cash_mmk: p.ipd_cash_mmk ?? 0,
    income_mmk: p.income_mmk ?? 0,
    expense_mmk: p.expense_mmk ?? 0,
    net_cash_mmk: p.net_cash_mmk ?? 0,
    label: p.date.length >= 10 ? p.date.slice(5) : p.date,
  }));
  const hasTrendCash = chartData.some(
    (p) =>
      (p.grand_total_mmk ?? 0) !== 0 ||
      p.ipd_cash_mmk !== 0 ||
      p.expense_mmk !== 0 ||
      p.net_cash_mmk !== 0,
  );
  const lowStockWarn = Boolean(overview && overview.low_stock_count > 0);
  const nearExpiryWarn = Boolean(overview && overview.near_expiry_count > 0);
  const voidsWarn = Boolean(overview && overview.voids_today > 0);
  const nearExpiryDays = overview?.near_expiry_days ?? 60;
  const nearExpirySub = [
    `≤ ${nearExpiryDays} ${t("daysUnit")}`,
    nearExpiryWarn ? t("attentionNeeded") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="page page-frame">
      <div className="page-header">
        <p className="lede muted">{t("voidsHint")}</p>
        <div className="page-actions">
          <button type="button" className="btn ghost" onClick={() => setEpoch((n) => n + 1)}>
            {t("refresh")}
          </button>
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && !overview ? (
        <p className="muted" aria-live="polite">
          {t("loading")}
        </p>
      ) : null}

      <section className="panel" aria-label={t("netCash")}>
        <div className="kpi-strip">
          <KpiCard
            label={t("totalIncome")}
            value={overview ? formatDelta(income) : "—"}
          />
          <KpiCard
            label={t("totalExpenses")}
            value={overview ? formatDelta(expense) : "—"}
          />
          <KpiCard
            label={t("netCash")}
            value={overview ? formatDelta(net) : "—"}
            sub={t("netCashHint")}
            tone={overview ? netTone(net) : "default"}
          />
        </div>
      </section>

      <div className="kpi-strip kpi-strip--seven" aria-label={t("overview")}>
        <KpiCard
          label={t("cashBalance")}
          value={overview ? formatMMK(overview.cash_total_mmk ?? overview.grand_total_mmk) : "—"}
          sub={t("mmk")}
          tone="accent"
        />
        <KpiCard
          label={t("onlineBalance")}
          value={overview ? formatMMK(overview.online_total_mmk ?? 0) : "—"}
          sub={t("mmk")}
        />
        <KpiCard
          label={t("totalBalance")}
          value={overview ? formatMMK(overview.grand_total_mmk) : "—"}
          sub={t("mmk")}
          tone="accent"
        />
        <KpiCard
          label={t("opdCash")}
          value={overview ? formatMMK(overview.opd_total_mmk) : "—"}
          sub={overview ? `${overview.opd_count} ${t("bill").toLowerCase()}` : undefined}
        />
        <KpiCard
          label={t("otCash")}
          value={overview ? formatMMK(overview.ot_total_mmk) : "—"}
          sub={overview ? `${overview.ot_count} ${t("bill").toLowerCase()}` : undefined}
        />
        <KpiCard
          label={t("pharmacyCash")}
          value={overview ? formatMMK(overview.pharmacy_total_mmk ?? 0) : "—"}
          sub={overview ? `${overview.pharmacy_count ?? 0} ${t("bill").toLowerCase()}` : undefined}
        />
        <KpiCard
          label={t("labCash")}
          value={overview ? formatMMK(overview.lab_total_mmk ?? 0) : "—"}
          sub={overview ? `${overview.lab_count ?? 0} ${t("bill").toLowerCase()}` : undefined}
        />
        <KpiCard
          label={t("ipdCash")}
          value={overview ? formatMMK(overview.ipd_cash_mmk ?? 0) : "—"}
          sub={t("ipdCashHint")}
        />
        <KpiCard
          label={t("billCount")}
          value={overview ? String(overview.bill_count) : "—"}
          sub={
            overview && overview.bill_count > 0
              ? `${t("avgBill")}: ${formatMMK(overview.avg_bill_mmk)}`
              : undefined
          }
        />
        <KpiCard
          label={t("lowStock")}
          value={overview ? String(overview.low_stock_count) : "—"}
          sub={lowStockWarn ? t("attentionNeeded") : undefined}
          tone={lowStockWarn ? "warn" : "default"}
        />
        <KpiCard
          label={t("nearExpiry")}
          value={overview ? String(overview.near_expiry_count) : "—"}
          sub={nearExpirySub}
          tone={nearExpiryWarn ? "danger" : "default"}
        />
      </div>

      <div className="alert-row" aria-label={t("alerts")}>
        <AlertChip
          label={alertLabel(t("lowStock"), overview?.low_stock_count, lowStockWarn, t)}
          tone={lowStockWarn ? "warn" : "ok"}
        />
        <AlertChip
          label={alertLabel(t("nearExpiry"), overview?.near_expiry_count, nearExpiryWarn, t)}
          tone={nearExpiryWarn ? "danger" : "ok"}
        />
        <AlertChip
          label={alertLabel(t("voidsToday"), overview?.voids_today, voidsWarn, t)}
          tone={voidsWarn ? "warn" : "ok"}
        />
      </div>

      {overview && total > 0 ? (
        <section className="panel" aria-labelledby="overview-cash-share-title">
          <h3 id="overview-cash-share-title">{t("cashShare")}</h3>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-opd" style={{ width: `${opdShare}%` }} />
            <div className="bar-ot" style={{ width: `${otShare}%` }} />
            <div className="bar-pharmacy" style={{ width: `${pharmacyShare}%` }} />
          </div>
          <div className="split-opd-ot">
            <p className="muted">
              {t("opdCash")} {opdShare.toFixed(0)}% · {formatMMK(overview.opd_total_mmk)} {t("mmk")}
            </p>
            <p className="muted">
              {t("otCash")} {otShare.toFixed(0)}% · {formatMMK(overview.ot_total_mmk)} {t("mmk")}
            </p>
            <p className="muted">
              {t("pharmacyCash")} {pharmacyShare.toFixed(0)}% ·{" "}
              {formatMMK(overview.pharmacy_total_mmk ?? 0)} {t("mmk")}
            </p>
          </div>
          <p className="muted">
            {t("ipdCash")} {formatDelta(overview.ipd_cash_mmk ?? 0)} · {t("totalExpenses")}{" "}
            {formatDelta(expense)} · {t("netCash")} {formatDelta(net)}
          </p>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="overview-cash-trend-title">
        <h3 id="overview-cash-trend-title">{t("cashTrend30")}</h3>
        {!hasTrendCash ? (
          <p className="empty-state">{t("noRevenueData")}</p>
        ) : (
          <div className="chart-box" role="img" aria-label={t("cashTrend30")}>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis
                  dataKey="label"
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
                    <CashTrendTooltip active={props.active} payload={props.payload} t={t} />
                  )}
                />
                <Bar dataKey="opd_total_mmk" name={t("opdCash")} stackId="cash" fill={colors.accent} />
                <Bar dataKey="ot_total_mmk" name={t("otCash")} stackId="cash" fill={colors.ot} />
                <Bar
                  dataKey="pharmacy_total_mmk"
                  name={t("pharmacyCash")}
                  stackId="cash"
                  fill={colors.pharmacy}
                />
                <Bar dataKey="lab_total_mmk" name={t("labCash")} stackId="cash" fill={colors.lab} />
                <Bar
                  dataKey="ipd_cash_mmk"
                  name={t("ipdCash")}
                  stackId="cash"
                  fill={colors.ipd}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="net_cash_mmk"
                  name={t("netCash")}
                  stroke={colors.ink}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
