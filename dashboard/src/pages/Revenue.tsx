import { useEffect, useState } from "react";
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
import {
  fetchPharmacyMargin,
  fetchRevenueByDoctor,
  fetchRevenueByService,
  fetchTrends,
  type DoctorRevenueRow,
  type PharmacyMarginReport,
  type RangeDays,
  type ServiceRevenueRow,
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

function shortDate(iso: string): string {
  // YYYY-MM-DD → MM-DD
  return iso.length >= 10 ? iso.slice(5) : iso;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function RevenuePage({ t }: Props) {
  const [days, setDays] = useState<RangeDays>(30);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [doctors, setDoctors] = useState<DoctorRevenueRow[]>([]);
  const [services, setServices] = useState<ServiceRevenueRow[]>([]);
  const [margin, setMargin] = useState<PharmacyMarginReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [tr, dr, sv, mg] = await Promise.all([
          fetchTrends(days),
          fetchRevenueByDoctor(days),
          fetchRevenueByService(days),
          fetchPharmacyMargin(days),
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
  }, [days, epoch, t]);

  const chartData = trends.map((p) => ({
    ...p,
    label: shortDate(p.date),
  }));

  const rangeCash = trends.reduce((s, p) => s + p.grand_total_mmk, 0);
  const rangeBills = trends.reduce((s, p) => s + p.bill_count, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("revenue")}</h2>
          <p className="lede muted">{t("revenueLede")}</p>
        </div>
        <div className="page-actions">
          <div className="range-toggle" role="group" aria-label={t("dateRange")}>
            {([7, 30] as RangeDays[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`btn ghost${days === d ? " active" : ""}`}
                onClick={() => setDays(d)}
              >
                {d === 7 ? t("days7") : t("days30")}
              </button>
            ))}
          </div>
          <button type="button" className="btn ghost" onClick={() => setEpoch((n) => n + 1)}>
            {t("refresh")}
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading && !trends.length && !margin ? <p className="muted">{t("loading")}</p> : null}

      <div className="kpi-strip">
        <KpiMini label={t("cashInRange")} value={formatMMK(rangeCash)} sub={t("mmk")} accent />
        <KpiMini
          label={t("billCount")}
          value={String(rangeBills)}
          sub={rangeBills > 0 ? `${t("avgBill")}: ${formatMMK(Math.round(rangeCash / rangeBills))}` : undefined}
        />
        <KpiMini
          label={t("pharmacyMargin")}
          value={margin ? formatMMK(margin.margin_mmk) : "—"}
          sub={margin ? pct(margin.margin_pct) : undefined}
          accent
        />
        <KpiMini
          label={t("pharmacyCogs")}
          value={margin ? formatMMK(margin.cogs_mmk) : "—"}
          sub={margin ? pct(margin.cogs_pct) : undefined}
        />
      </div>

      <section className="panel">
        <h3>{t("cashTrend")}</h3>
        {chartData.length === 0 || rangeCash === 0 ? (
          <p className="empty-state">{t("noRevenueData")}</p>
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fill: MUTED, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => [`${formatMMK(Number(value))} ${t("mmk")}`, ""]}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{ borderRadius: 8, borderColor: "rgba(26,31,46,0.12)" }}
                />
                <Legend />
                <Bar dataKey="opd_total_mmk" name={t("opdCash")} stackId="cash" fill={ACCENT} radius={[0, 0, 0, 0]} />
                <Bar dataKey="ot_total_mmk" name={t("otCash")} stackId="cash" fill={OT_BLUE} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(value) => [`${formatMMK(Number(value))} ${t("mmk")}`, t("cashInRange")]}
                  contentStyle={{ borderRadius: 8, borderColor: "rgba(26,31,46,0.12)" }}
                />
                <Line
                  type="monotone"
                  dataKey="grand_total_mmk"
                  stroke={ACCENT}
                  strokeWidth={2}
                  dot={false}
                  name={t("cashInRange")}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="split-panels">
        <section className="panel">
          <h3>{t("byDoctor")}</h3>
          {doctors.length === 0 ? (
            <p className="empty-state">{t("noRevenueData")}</p>
          ) : (
            <table className="data-table">
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

        <section className="panel">
          <h3>{t("byService")}</h3>
          {services.length === 0 ? (
            <p className="empty-state">{t("noRevenueData")}</p>
          ) : (
            <table className="data-table">
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
                    <td>{row.line_type}</td>
                    <td className="num">{formatMMK(row.total_mmk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="panel">
        <h3>{t("pharmacyMargin")}</h3>
        <p className="muted estimate-note">{margin?.note ?? t("marginEstimateNote")}</p>
        {margin && margin.revenue_mmk === 0 ? (
          <p className="empty-state">{t("noPharmacySales")}</p>
        ) : margin ? (
          <>
            <div className="kpi-strip tight">
              <KpiMini label={t("pharmacyRevenue")} value={formatMMK(margin.revenue_mmk)} sub={t("mmk")} />
              <KpiMini label={t("pharmacyCogs")} value={formatMMK(margin.cogs_mmk)} sub={pct(margin.cogs_pct)} />
              <KpiMini
                label={t("grossMargin")}
                value={formatMMK(margin.margin_mmk)}
                sub={pct(margin.margin_pct)}
                accent
              />
            </div>
            <h4 className="panel-subhead">{t("topItemsByRevenue")}</h4>
            <table className="data-table">
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
            <h4 className="panel-subhead">{t("topItemsByMargin")}</h4>
            <table className="data-table">
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

function KpiMini({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`kpi-card${accent ? " accent" : ""}`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {sub ? <p className="kpi-sub">{sub}</p> : null}
    </div>
  );
}
