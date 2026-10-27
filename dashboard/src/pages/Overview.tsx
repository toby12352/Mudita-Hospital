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

const ACCENT = "#1b6bc7";
const OT_BLUE = "#4a90c8";
const PHARM = "#1f7a4d";
const IPD = "#6b4fa0";
const NET = "#1c1c1c";
const MUTED = "#6b7280";
const GRID = "rgba(26, 31, 46, 0.08)";

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
        fontSize: 12,
      }}
    >
      <p style={{ margin: "0 0 0.25rem" }}>{row.label ?? row.date}</p>
      {lines.map(([name, value]) => (
        <p key={name} style={{ margin: 0 }}>
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

export function OverviewPage({ t }: Props) {
  const [overview, setOverview] = useState<DashOverview | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);

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

      {error ? <p className="form-error">{error}</p> : null}
      {loading && !overview ? <p className="muted">{t("loading")}</p> : null}

      <section className="panel">
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

      <div className="kpi-strip kpi-strip--seven">
        <KpiCard
          label={t("cashToday")}
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
          tone={overview && overview.low_stock_count > 0 ? "warn" : "default"}
        />
        <KpiCard
          label={t("nearExpiry")}
          value={overview ? String(overview.near_expiry_count) : "—"}
          sub={overview ? `≤ ${overview.near_expiry_days} days` : "≤ 60 days"}
          tone={overview && overview.near_expiry_count > 0 ? "danger" : "default"}
        />
      </div>

      <div className="alert-row" aria-label={t("alerts")}>
        <AlertChip
          label={`${t("lowStock")}: ${overview?.low_stock_count ?? "—"}`}
          tone={overview && overview.low_stock_count > 0 ? "warn" : "ok"}
        />
        <AlertChip
          label={`${t("nearExpiry")}: ${overview?.near_expiry_count ?? "—"}`}
          tone={overview && overview.near_expiry_count > 0 ? "danger" : "ok"}
        />
        <AlertChip
          label={`${t("voidsToday")}: ${overview?.voids_today ?? "—"}`}
          tone={overview && overview.voids_today > 0 ? "warn" : "ok"}
        />
      </div>

      {overview && total > 0 ? (
        <section className="panel">
          <h3>
            {t("opdCash")} / {t("otCash")} / {t("pharmacyCash")}
          </h3>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-opd" style={{ width: `${opdShare}%` }} />
            <div className="bar-ot" style={{ width: `${otShare}%` }} />
            <div className="bar-pharmacy" style={{ width: `${pharmacyShare}%` }} />
          </div>
          <div className="split-opd-ot">
            <p className="muted">
              OPD {opdShare.toFixed(0)}% · {formatMMK(overview.opd_total_mmk)} {t("mmk")}
            </p>
            <p className="muted">
              OT {otShare.toFixed(0)}% · {formatMMK(overview.ot_total_mmk)} {t("mmk")}
            </p>
            <p className="muted">
              Pharmacy {pharmacyShare.toFixed(0)}% · {formatMMK(overview.pharmacy_total_mmk ?? 0)} {t("mmk")}
            </p>
          </div>
          <p className="muted">
            {t("ipdCash")} {formatDelta(overview.ipd_cash_mmk ?? 0)} · {t("totalExpenses")}{" "}
            {formatDelta(expense)} · {t("netCash")} {formatDelta(net)}
          </p>
        </section>
      ) : null}

      <section className="panel">
        <h3>{t("cashTrend30")}</h3>
        {!hasTrendCash ? (
          <p className="empty-state">{t("noRevenueData")}</p>
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fill: MUTED, fontSize: 11 }}
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
                <Tooltip content={(props) => <CashTrendTooltip active={props.active} payload={props.payload} t={t} />} />
                <Bar dataKey="opd_total_mmk" name={t("opdCash")} stackId="cash" fill={ACCENT} />
                <Bar dataKey="ot_total_mmk" name={t("otCash")} stackId="cash" fill={OT_BLUE} />
                <Bar dataKey="pharmacy_total_mmk" name={t("pharmacyCash")} stackId="cash" fill={PHARM} />
                <Bar
                  dataKey="ipd_cash_mmk"
                  name={t("ipdCash")}
                  stackId="cash"
                  fill={IPD}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="net_cash_mmk"
                  name={t("netCash")}
                  stroke={NET}
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
