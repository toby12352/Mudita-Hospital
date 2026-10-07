import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "../components/kpi/KpiCard";
import {
  fetchStockHealth,
  type RangeDays,
  type StockHealthReport,
} from "../dashboardApi";
import { formatMMK } from "../lib/format";

type Props = {
  t: (k: string) => string;
};

const ACCENT = "#1b6bc7";
const WARN = "#c47a00";
const DANGER = "#c62828";
const MUTED = "#6b7280";
const GRID = "rgba(26, 31, 46, 0.08)";
const BUCKET_COLORS: Record<string, string> = {
  expired: DANGER,
  d30: WARN,
  d60: "#d4a017",
  d90: ACCENT,
};

function locLabel(code: string, t: (k: string) => string): string {
  if (code === "MAIN") return t("locMain");
  if (code === "OT_RESERVED") return t("locOtReserved");
  if (code === "OT_FLOOR") return t("locOtFloor");
  return code;
}

export function StockPage({ t }: Props) {
  const [slowDays, setSlowDays] = useState(90);
  const [cogsDays, setCogsDays] = useState<RangeDays>(30);
  const [data, setData] = useState<StockHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rep = await fetchStockHealth({ slowDays, cogsDays });
        if (cancelled) return;
        setData(rep);
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
  }, [slowDays, cogsDays, epoch, t]);

  const chartData =
    data?.expiry_buckets.map((b) => ({
      ...b,
      chartLabel: b.key === "expired" ? t("expired") : b.label,
    })) ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("stock")}</h2>
          <p className="lede muted">{t("stockLede")}</p>
        </div>
        <div className="page-actions">
          <div className="range-toggle" role="group" aria-label={t("slowWindow")}>
            {[60, 90, 180].map((d) => (
              <button
                key={d}
                type="button"
                className={`btn ghost${slowDays === d ? " active" : ""}`}
                onClick={() => setSlowDays(d)}
              >
                {d === 60 ? t("slow60") : d === 90 ? t("slow90") : t("slow180")}
              </button>
            ))}
          </div>
          <div className="range-toggle" role="group" aria-label={t("cogsWindow")}>
            {([7, 30] as RangeDays[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`btn ghost${cogsDays === d ? " active" : ""}`}
                onClick={() => setCogsDays(d)}
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
      {loading && !data ? <p className="muted">{t("loading")}</p> : null}

      {data ? (
        <>
          <div className="kpi-strip">
            <KpiCard
              label={t("inventoryValue")}
              value={formatMMK(data.total_value_mmk)}
              sub={`${formatMMK(data.total_qty)} ${t("unitsOnHand")}`}
              tone="accent"
            />
            <KpiCard
              label={t("valueAtRisk")}
              value={formatMMK(data.value_at_risk_mmk)}
              sub={`${data.near_expiry_count} ${t("batchesNearExpiry")}`}
              tone={data.value_at_risk_mmk > 0 ? "warn" : undefined}
            />
            <KpiCard
              label={t("lowStock")}
              value={String(data.low_stock_count)}
              sub={t("mainVsReorder")}
              tone={data.low_stock_count > 0 ? "warn" : undefined}
            />
            <KpiCard
              label={t("turnsEstimate")}
              value={data.turns_estimate.toFixed(2)}
              sub={`${t("cogs")} ${data.cogs_days}d · ${formatMMK(data.cogs_period_mmk)}`}
            />
            <KpiCard
              label={t("slowMovers")}
              value={String(data.slow_mover_count)}
              sub={`${t("noSaleIn")} ${data.slow_days}d`}
              tone={data.slow_mover_count > 0 ? "warn" : undefined}
            />
          </div>

          <p className="muted tiny estimate-note">{data.note}</p>
          <p className="muted tiny estimate-note">{data.turns_note}</p>

          <div className="split-panels">
            <section className="panel">
              <h3>{t("expiryBuckets")}</h3>
              {chartData.some((b) => b.value_mmk > 0 || b.batches > 0) ? (
                <div className="chart-box" style={{ minHeight: 220 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="chartLabel" tick={{ fill: MUTED, fontSize: 12 }} />
                      <YAxis
                        tick={{ fill: MUTED, fontSize: 11 }}
                        tickFormatter={(v: number) => formatMMK(v)}
                        width={72}
                      />
                      <Tooltip
                        formatter={(value) => [
                          `${formatMMK(Number(value ?? 0))} ${t("mmk")}`,
                          t("value"),
                        ]}
                        labelFormatter={(label) => String(label)}
                      />
                      <Bar dataKey="value_mmk" radius={[4, 4, 0, 0]}>
                        {chartData.map((b) => (
                          <Cell key={b.key} fill={BUCKET_COLORS[b.key] ?? ACCENT} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="empty-state">{t("noNearExpiry")}</p>
              )}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("bucket")}</th>
                    <th className="num">{t("batches")}</th>
                    <th className="num">{t("qty")}</th>
                    <th className="num">{t("value")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.expiry_buckets.map((b) => (
                    <tr key={b.key}>
                      <td>{b.key === "expired" ? t("expired") : b.label}</td>
                      <td className="num">{b.batches}</td>
                      <td className="num">{formatMMK(b.qty)}</td>
                      <td className="num">{formatMMK(b.value_mmk)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="panel">
              <h3>{t("byLocation")}</h3>
              {data.by_location.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("location")}</th>
                      <th className="num">{t("qty")}</th>
                      <th className="num">{t("value")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_location.map((row) => (
                      <tr key={row.location_code}>
                        <td>{locLabel(row.location_code, t)}</td>
                        <td className="num">{formatMMK(row.qty)}</td>
                        <td className="num">{formatMMK(row.value_mmk)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty-state">{t("noStock")}</p>
              )}
            </section>
          </div>

          <div className="split-panels">
            <section className="panel">
              <h3>
                {t("lowStock")} ({data.low_stock_count})
              </h3>
              {data.low_stock.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("item")}</th>
                      <th className="num">{t("onHand")}</th>
                      <th className="num">{t("reorder")}</th>
                      <th className="num">{t("deficit")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.low_stock.slice(0, 25).map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className="code-chip">{row.code}</span> {row.name}
                        </td>
                        <td className="num">{row.stock_main}</td>
                        <td className="num">{row.reorder_level}</td>
                        <td className="num">{row.deficit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty-state">{t("noLowStock")}</p>
              )}
            </section>

            <section className="panel">
              <h3>
                {t("slowMovers")} ({data.slow_mover_count})
              </h3>
              {data.slow_movers.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("item")}</th>
                      <th className="num">{t("qty")}</th>
                      <th className="num">{t("value")}</th>
                      <th>{t("lastSale")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.slow_movers.map((row) => (
                      <tr key={row.item_id}>
                        <td>
                          <span className="code-chip">{row.code}</span> {row.name}
                        </td>
                        <td className="num">{formatMMK(row.qty_on_hand)}</td>
                        <td className="num">{formatMMK(row.value_mmk)}</td>
                        <td>
                          {row.last_sale_date
                            ? `${row.last_sale_date}${
                                row.days_since_sale != null
                                  ? ` (${row.days_since_sale}d)`
                                  : ""
                              }`
                            : t("neverSold")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty-state">{t("noSlowMovers")}</p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
