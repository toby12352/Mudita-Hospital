import { useEffect, useState } from "react";
import { getApiBase } from "../api";
import { getStoredToken } from "../auth";
import { KpiCard } from "../components/kpi/KpiCard";
import { fetchDailyReport, type DailyReportResponse } from "../dashboardApi";
import { formatMMK } from "../lib/format";
import { fetchAndPreviewPrint } from "../print";
import { todayISO } from "../reports";

type Props = {
  t: (k: string) => string;
};

function shiftDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDelta(n: number): string {
  if (n === 0) return "0";
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatMMK(n)}`;
}

function deltaTone(n: number): "accent" | "warn" | undefined {
  if (n > 0) return "accent";
  if (n < 0) return "warn";
  return undefined;
}

export function DailyReportPage({ t }: Props) {
  const [date, setDate] = useState(() => todayISO());
  const [data, setData] = useState<DailyReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const rep = await fetchDailyReport(date);
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
  }, [date, epoch, t]);

  async function handlePrint() {
    setPrintError(null);
    setPrinting(true);
    try {
      await fetchAndPreviewPrint(
        `/api/reports/daily-cash/print?date=${encodeURIComponent(date)}`,
        getApiBase,
        getStoredToken,
        { title: t("dailyReport"), receipt: false },
      );
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : t("error"));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("dailyReport")}</h2>
          <p className="lede muted">{t("dailyLede")}</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setDate((d) => shiftDate(d, -1))}
          >
            {t("prevDay")}
          </button>
          <label className="date-field">
            <span className="sr-only">{t("pickDate")}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayISO())}
            />
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setDate((d) => shiftDate(d, 1))}
            disabled={date >= todayISO()}
          >
            {t("nextDay")}
          </button>
          <button type="button" className="btn ghost" onClick={() => setDate(todayISO())}>
            {t("today")}
          </button>
          <button type="button" className="btn ghost" onClick={() => setEpoch((n) => n + 1)}>
            {t("refresh")}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void handlePrint()}
            disabled={printing || loading}
          >
            {printing ? t("busy") : t("print")}
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {printError ? <p className="form-error">{printError}</p> : null}
      {loading && !data ? <p className="muted">{t("loading")}</p> : null}

      {data ? (
        <>
          <div className="kpi-strip">
            <KpiCard
              label={t("cashToday")}
              value={formatMMK(data.grand_total_mmk)}
              sub={`${data.bill_count} ${t("billCount").toLowerCase()}`}
              tone="accent"
            />
            <KpiCard
              label={t("vsYesterday")}
              value={formatDelta(data.delta_grand_mmk)}
              sub={`${data.yesterday}: ${formatMMK(data.prev_grand_total_mmk)}`}
              tone={deltaTone(data.delta_grand_mmk)}
            />
            <KpiCard
              label={t("opdCash")}
              value={formatMMK(data.opd_total_mmk)}
              sub={`${formatDelta(data.delta_opd_mmk)} · ${data.opd_count} ${t("billsShort")}`}
            />
            <KpiCard
              label={t("otCash")}
              value={formatMMK(data.ot_total_mmk)}
              sub={`${formatDelta(data.delta_ot_mmk)} · ${data.ot_count} ${t("billsShort")}`}
            />
            <KpiCard
              label={t("voidsToday")}
              value={String(data.voids)}
              sub={t("voidsHint")}
              tone={data.voids > 0 ? "warn" : undefined}
            />
          </div>

          <section className="panel delta-strip">
            <h3>{t("vsYesterday")}</h3>
            <div className="delta-grid">
              <div>
                <p className="kpi-label">{t("cashToday")}</p>
                <p className={`delta-val ${data.delta_grand_mmk < 0 ? "neg" : data.delta_grand_mmk > 0 ? "pos" : ""}`}>
                  {formatDelta(data.delta_grand_mmk)} {t("mmk")}
                </p>
              </div>
              <div>
                <p className="kpi-label">{t("billCount")}</p>
                <p className={`delta-val ${data.delta_bills < 0 ? "neg" : data.delta_bills > 0 ? "pos" : ""}`}>
                  {formatDelta(data.delta_bills)}
                </p>
              </div>
              <div>
                <p className="kpi-label">{t("opdCash")}</p>
                <p className="delta-val">{formatDelta(data.delta_opd_mmk)}</p>
              </div>
              <div>
                <p className="kpi-label">{t("otCash")}</p>
                <p className="delta-val">{formatDelta(data.delta_ot_mmk)}</p>
              </div>
            </div>
          </section>

          <section className="panel">
            <h3>
              {t("paidBills")} — {data.date}
            </h3>
            {data.lines.length ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("source")}</th>
                    <th>{t("bill")}</th>
                    <th>{t("patient")}</th>
                    <th>{t("doctor")}</th>
                    <th>{t("paid")}</th>
                    <th className="num">{t("mmk")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line) => (
                    <tr key={`${line.source}-${line.bill_no}-${line.paid_at}`}>
                      <td>{line.source}</td>
                      <td>{line.bill_no}</td>
                      <td>{line.patient}</td>
                      <td>{line.doctor || "—"}</td>
                      <td>{line.paid_at}</td>
                      <td className="num">{formatMMK(line.total_mmk)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state">{t("noPaidBills")}</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
