import { useEffect, useId, useState } from "react";
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

const FALLBACK = {
  accent: "#2563eb",
  warn: "#8a6508",
  danger: "#c62828",
  expiry60: "#6b4fa0",
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
    warn: readToken("--warn", FALLBACK.warn),
    danger: readToken("--danger", FALLBACK.danger),
    // 60-day bar. Old #d4a017 is 2.38:1 on white. A darker gold matches --warn (the 30-day bar).
    expiry60: readToken("--series-ipd", FALLBACK.expiry60),
    muted: readToken("--muted", FALLBACK.muted),
    // No grid token. Same faint stroke Revenue kept.
    grid: FALLBACK.grid,
  };
}

function bucketFill(key: string, colors: ReturnType<typeof chartColors>): string {
  if (key === "expired") return colors.danger;
  if (key === "d30") return colors.warn;
  if (key === "d60") return colors.expiry60;
  if (key === "d90") return colors.accent;
  return colors.accent;
}

function bucketLabel(key: string, fallback: string, t: (k: string) => string): string {
  if (key === "expired") return t("expired");
  if (key === "d30") return `≤ 30 ${t("daysUnit")}`;
  if (key === "d60") return `31–60 ${t("daysUnit")}`;
  if (key === "d90") return `61–90 ${t("daysUnit")}`;
  return fallback;
}

function attentionSub(base: string, warn: boolean, t: (k: string) => string): string {
  return warn ? `${base} · ${t("attentionNeeded")}` : base;
}

type TipEntry = { value?: unknown };

function ExpiryTooltip({
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
        {t("value")}: {formatMMK(value)} {t("mmk")}
      </p>
    </div>
  );
}

function locLabel(code: string, t: (k: string) => string): string {
  if (code === "MAIN") return t("locMain");
  if (code === "OT") return t("locOtCupboard");
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
  const expiryTitleId = useId();
  const locationTitleId = useId();
  const lowTitleId = useId();
  const slowTitleId = useId();
  const colors = chartColors();

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
      chartLabel: bucketLabel(b.key, b.label, t),
    })) ?? [];
  const valueAtRisk = (data?.value_at_risk_mmk ?? 0) > 0;
  const lowStockWarn = (data?.low_stock_count ?? 0) > 0;
  const slowWarn = (data?.slow_mover_count ?? 0) > 0;

  return (
    <div className="page page-frame stock-page">
      <div className="page-header">
        <p className="lede muted">{t("stockLede")}</p>
        <div className="page-actions">
          <div className="range-toggle" role="group" aria-label={t("slowWindow")}>
            {[60, 90, 180].map((d) => (
              <button
                key={d}
                type="button"
                className={`btn ghost${slowDays === d ? " active" : ""}`}
                aria-pressed={slowDays === d}
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
                aria-pressed={cogsDays === d}
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

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && !data ? (
        <p className="muted" aria-live="polite">
          {t("loading")}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="kpi-strip" aria-label={t("stock")}>
            <KpiCard
              label={t("inventoryValue")}
              value={formatMMK(data.total_value_mmk)}
              sub={`${formatMMK(data.total_qty)} ${t("unitsOnHand")}`}
              tone="accent"
            />
            <KpiCard
              label={t("valueAtRisk")}
              value={formatMMK(data.value_at_risk_mmk)}
              sub={attentionSub(
                `${data.near_expiry_count} ${t("batchesNearExpiry")}`,
                valueAtRisk,
                t,
              )}
              tone={valueAtRisk ? "warn" : undefined}
            />
            <KpiCard
              label={t("lowStock")}
              value={String(data.low_stock_count)}
              sub={attentionSub(t("mainVsReorder"), lowStockWarn, t)}
              tone={lowStockWarn ? "warn" : undefined}
            />
            <KpiCard
              label={t("turnsEstimate")}
              value={data.turns_estimate.toFixed(2)}
              sub={`${t("cogs")} ${data.cogs_days} ${t("daysUnit")} · ${formatMMK(data.cogs_period_mmk)}`}
            />
            <KpiCard
              label={t("slowMovers")}
              value={String(data.slow_mover_count)}
              sub={attentionSub(
                `${t("noSaleIn")} ${data.slow_days} ${t("daysUnit")}`,
                slowWarn,
                t,
              )}
              tone={slowWarn ? "warn" : undefined}
            />
          </div>

          <div>
            <p className="muted tiny estimate-note">{data.note}</p>
            <p className="muted tiny estimate-note">{data.turns_note}</p>
          </div>

          <div className="split-panels">
            <section className="panel" aria-labelledby={expiryTitleId}>
              <h2 id={expiryTitleId}>{t("expiryBuckets")}</h2>
              {chartData.some((b) => b.value_mmk > 0 || b.batches > 0) ? (
                <div className="chart-box" style={{ minHeight: 220 }} role="img" aria-label={t("expiryBuckets")}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={colors.grid} vertical={false} />
                      <XAxis dataKey="chartLabel" tick={{ fill: colors.muted, fontSize: 14 }} />
                      <YAxis
                        tick={{ fill: colors.muted, fontSize: 11 }}
                        tickFormatter={(v: number) => formatMMK(v)}
                        width={72}
                      />
                      <Tooltip
                        content={(props) => (
                          <ExpiryTooltip
                            active={props.active}
                            payload={props.payload}
                            label={props.label}
                            t={t}
                          />
                        )}
                      />
                      <Bar dataKey="value_mmk" radius={[4, 4, 0, 0]}>
                        {chartData.map((b) => (
                          <Cell key={b.key} fill={bucketFill(b.key, colors)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="empty-state">{t("noNearExpiry")}</p>
              )}
              <div className="table-scroll">
                <table className="data-table" aria-labelledby={expiryTitleId}>
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
                        <td>{bucketLabel(b.key, b.label, t)}</td>
                        <td className="num">{b.batches}</td>
                        <td className="num">{formatMMK(b.qty)}</td>
                        <td className="num">{formatMMK(b.value_mmk)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel" aria-labelledby={locationTitleId}>
              <h2 id={locationTitleId}>{t("byLocation")}</h2>
              {data.by_location.length ? (
                <div className="table-scroll">
                  <table className="data-table" aria-labelledby={locationTitleId}>
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
                </div>
              ) : (
                <p className="empty-state">{t("noStock")}</p>
              )}
            </section>
          </div>

          <div className="split-panels">
            <section className="panel" aria-labelledby={lowTitleId}>
              <h2 id={lowTitleId}>
                {t("lowStock")} ({data.low_stock_count})
              </h2>
              {data.low_stock.length ? (
                <div className="table-scroll">
                  <table className="data-table" aria-labelledby={lowTitleId}>
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
                </div>
              ) : (
                <p className="empty-state">{t("noLowStock")}</p>
              )}
            </section>

            <section className="panel" aria-labelledby={slowTitleId}>
              <h2 id={slowTitleId}>
                {t("slowMovers")} ({data.slow_mover_count})
              </h2>
              {data.slow_movers.length ? (
                <div className="table-scroll">
                  <table className="data-table" aria-labelledby={slowTitleId}>
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
                                    ? ` (${row.days_since_sale} ${t("daysUnit")})`
                                    : ""
                                }`
                              : t("neverSold")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
