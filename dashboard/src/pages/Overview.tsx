import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { formatMMK } from "../lib/format";

type Props = {
  t: (k: string) => string;
};

const ACCENT = "#1b6bc7";
const OT_BLUE = "#4a90c8";
const MUTED = "#6b7280";
const GRID = "rgba(26, 31, 46, 0.08)";

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
  const chartData = trends.map((p) => ({
    ...p,
    label: p.date.length >= 10 ? p.date.slice(5) : p.date,
  }));
  const hasTrendCash = trends.some((p) => p.grand_total_mmk > 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("overview")}</h2>
          <p className="lede muted">{t("voidsHint")}</p>
        </div>
        <button type="button" className="btn ghost" onClick={() => setEpoch((n) => n + 1)}>
          {t("refresh")}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading && !overview ? <p className="muted">{t("loading")}</p> : null}

      <div className="kpi-strip">
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
            {t("opdCash")} / {t("otCash")}
          </h3>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-opd" style={{ width: `${opdShare}%` }} />
            <div className="bar-ot" style={{ width: `${otShare}%` }} />
          </div>
          <div className="split-opd-ot">
            <p className="muted">
              OPD {opdShare.toFixed(0)}% · {formatMMK(overview.opd_total_mmk)} {t("mmk")}
            </p>
            <p className="muted">
              OT {otShare.toFixed(0)}% · {formatMMK(overview.ot_total_mmk)} {t("mmk")}
            </p>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h3>{t("cashTrend30")}</h3>
        {!hasTrendCash ? (
          <p className="empty-state">{t("noRevenueData")}</p>
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                <Tooltip
                  formatter={(value) => [`${formatMMK(Number(value))} ${t("mmk")}`, ""]}
                  contentStyle={{ borderRadius: 8, borderColor: "rgba(26,31,46,0.12)" }}
                />
                <Bar dataKey="opd_total_mmk" name={t("opdCash")} stackId="cash" fill={ACCENT} />
                <Bar dataKey="ot_total_mmk" name={t("otCash")} stackId="cash" fill={OT_BLUE} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
