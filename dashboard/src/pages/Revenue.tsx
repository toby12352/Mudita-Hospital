import { useEffect, useId, useState } from "react";
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
  type DashRange,
  type DoctorRevenueRow,
  type PharmacyMarginReport,
  type RangeDays,
  type ServiceRevenueRow,
  type TrendPoint,
} from "../dashboardApi";
import { DatePicker } from "../components/DatePicker";
import { formatMMK } from "../lib/format";
import { todayISO } from "../reports";

type Props = {
  t: (k: string) => string;
};

const ACCENT = "#1b6bc7";
const OT_BLUE = "#4a90c8";
const PHARM = "#1f7a4d";
const MUTED = "#6b7280";
const GRID = "rgba(26, 31, 46, 0.08)";

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

function presetWindow(days: RangeDays): { from: string; to: string } {
  const to = todayISO();
  return { to, from: shiftISO(to, -(days - 1)) };
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

export function RevenuePage({ t }: Props) {
  const fromId = useId();
  const toId = useId();
  const opening = presetWindow(30);
  const [preset, setPreset] = useState<RangeDays | null>(30);
  const [from, setFrom] = useState(opening.from);
  const [to, setTo] = useState(opening.to);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [doctors, setDoctors] = useState<DoctorRevenueRow[]>([]);
  const [services, setServices] = useState<ServiceRevenueRow[]>([]);
  const [margin, setMargin] = useState<PharmacyMarginReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);

  function applyPreset(days: RangeDays) {
    const window = presetWindow(days);
    setPreset(days);
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

  useEffect(() => {
    const problem = rangeProblem(from, to);
    if (problem) {
      setError(t(problem));
      setLoading(false);
      return;
    }
    const range: DashRange = preset ?? { from, to };
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

  return (
    <div className="page page-frame">
      <div className="page-header">
        <p className="lede muted">{t("revenueLede")}</p>
        <div className="page-actions">
          <div className="range-field">
            <label htmlFor={fromId}>{t("rangeFrom")}</label>
            <DatePicker id={fromId} value={from} onChange={applyFrom} />
          </div>
          <div className="range-field">
            <label htmlFor={toId}>{t("rangeTo")}</label>
            <DatePicker id={toId} value={to} onChange={applyTo} />
          </div>
          <div className="range-toggle" role="group" aria-label={t("dateRange")}>
            {([7, 30] as RangeDays[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`btn ghost${preset === d ? " active" : ""}`}
                onClick={() => applyPreset(d)}
              >
                {d === 7 ? t("days7") : t("days30")}
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
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading && !trends.length && !margin ? <p className="muted">{t("loading")}</p> : null}

      <div className="kpi-strip kpi-strip--four">
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
          <div className="chart-box chart-stack">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" interval={tickInterval} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
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
                <Bar dataKey="ot_total_mmk" name={t("otCash")} stackId="cash" fill={OT_BLUE} />
                <Bar
                  dataKey="pharmacy_total_mmk"
                  name={t("pharmacyCash")}
                  stackId="cash"
                  fill={PHARM}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" interval={tickInterval} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
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
