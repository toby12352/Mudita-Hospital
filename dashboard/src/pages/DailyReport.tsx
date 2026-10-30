import { useEffect, useId, useRef, useState } from "react";
import { getApiBase } from "../api";
import { getStoredToken } from "../auth";
import { KpiCard } from "../components/kpi/KpiCard";
import { fetchDailyReport, type DailyReportResponse } from "../dashboardApi";
import { formatDelta, formatMMK } from "../lib/format";
import { fetchAndPreviewPrint } from "../print";
import { todayISO } from "../reports";

type PrintKind = "income" | "expense" | "overall";

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

function deltaTone(n: number): "accent" | "warn" | "default" {
  if (n > 0) return "accent";
  if (n < 0) return "warn";
  return "default";
}

function deltaClass(n: number): string {
  if (n > 0) return "delta-val pos";
  if (n < 0) return "delta-val neg";
  return "delta-val";
}

// Charge lines are stored negative. Cash lines (deposit, collection, refund)
// are already signed as income, the same way the epoch rule books them.
function earnedLineMMK(kind: string, amount: number): number {
  if (kind === "deposit" || kind === "collection" || kind === "refund") {
    return amount;
  }
  return -amount;
}

function kindLabel(kind: string, t: (k: string) => string): string {
  if (
    kind === "deposit" ||
    kind === "collection" ||
    kind === "refund" ||
    kind === "ward" ||
    kind === "charge" ||
    kind === "reversal"
  ) {
    return t(kind);
  }
  return kind;
}

function portalLabel(portal: string, t: (k: string) => string): string {
  switch (portal) {
    case "opd":
      return "OPD";
    case "ot":
      return "OT";
    case "lab":
      return "Lab";
    case "ipd":
      return "IPD";
    case "pharmacy":
      return t("pharmacyPortal");
    default:
      return portal;
  }
}

export function DailyReportPage({ t }: Props) {
  const [date, setDate] = useState(() => todayISO());
  const [data, setData] = useState<DailyReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const printMenuRef = useRef<HTMLDivElement>(null);
  const printMenuId = useId();

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

  useEffect(() => {
    if (!printOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!printMenuRef.current?.contains(event.target as Node)) {
        setPrintOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPrintOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [printOpen]);

  async function handlePrint(kind: PrintKind) {
    setPrintOpen(false);
    setPrintError(null);
    setPrinting(true);
    const titles: Record<PrintKind, string> = {
      income: t("printIncomeReport"),
      expense: t("printExpenseReport"),
      overall: t("printOverallDailyReport"),
    };
    try {
      await fetchAndPreviewPrint(
        `/api/dashboard/daily-report/print?date=${encodeURIComponent(date)}&kind=${kind}`,
        getApiBase,
        getStoredToken,
        { title: titles[kind], receipt: false },
      );
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : t("error"));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="page page-frame">
      <div className="page-header">
        <p className="lede muted">{t("dailyLede")}</p>
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
          <div className="print-menu" ref={printMenuRef}>
            <button
              type="button"
              className="btn primary"
              aria-haspopup="menu"
              aria-expanded={printOpen}
              aria-controls={printMenuId}
              aria-label={t("printMenu")}
              onClick={() => setPrintOpen((open) => !open)}
              disabled={printing || loading}
            >
              {printing ? t("busy") : t("print")}
            </button>
            {printOpen ? (
              <div className="print-menu-dropdown" id={printMenuId} role="menu" aria-label={t("printMenu")}>
                <button
                  type="button"
                  className="print-menu-item"
                  role="menuitem"
                  onClick={() => void handlePrint("income")}
                >
                  {t("printIncomeReport")}
                </button>
                <button
                  type="button"
                  className="print-menu-item"
                  role="menuitem"
                  onClick={() => void handlePrint("expense")}
                >
                  {t("printExpenseReport")}
                </button>
                <button
                  type="button"
                  className="print-menu-item"
                  role="menuitem"
                  onClick={() => void handlePrint("overall")}
                >
                  {t("printOverallDailyReport")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {printError ? <p className="form-error">{printError}</p> : null}
      {loading && !data ? <p className="muted">{t("loading")}</p> : null}

      {data ? (
        <>
          <section className="panel">
            <div className="kpi-strip">
              <KpiCard label={t("totalIncome")} value={formatDelta(data.income_mmk ?? 0)} />
              <KpiCard label={t("totalExpenses")} value={formatDelta(data.expense_mmk ?? 0)} />
              <KpiCard
                label={t("netCash")}
                value={formatDelta(data.net_cash_mmk ?? 0)}
                sub={t("netCashHint")}
                tone={deltaTone(data.net_cash_mmk ?? 0)}
              />
            </div>
          </section>

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
              label={t("pharmacyCash")}
              value={formatMMK(data.pharmacy_total_mmk ?? 0)}
              sub={`${formatDelta(data.delta_pharmacy_mmk ?? 0)} · ${data.pharmacy_count ?? 0} ${t("billsShort")}`}
            />
            <KpiCard
              label={t("labCash")}
              value={formatMMK(data.lab_total_mmk ?? 0)}
              sub={`${formatDelta(data.delta_lab_mmk ?? 0)} · ${data.lab_count ?? 0} ${t("billsShort")}`}
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
                <p className={deltaClass(data.delta_grand_mmk)}>
                  {formatDelta(data.delta_grand_mmk)} {t("mmk")}
                </p>
              </div>
              <div>
                <p className="kpi-label">{t("billCount")}</p>
                <p className={deltaClass(data.delta_bills)}>{formatDelta(data.delta_bills)}</p>
              </div>
              <div>
                <p className="kpi-label">{t("opdCash")}</p>
                <p className="delta-val">{formatDelta(data.delta_opd_mmk)}</p>
              </div>
              <div>
                <p className="kpi-label">{t("otCash")}</p>
                <p className="delta-val">{formatDelta(data.delta_ot_mmk)}</p>
              </div>
              <div>
                <p className="kpi-label">{t("pharmacyCash")}</p>
                <p className="delta-val">{formatDelta(data.delta_pharmacy_mmk ?? 0)}</p>
              </div>
              <div>
                <p className="kpi-label">{t("labCash")}</p>
                <p className="delta-val">{formatDelta(data.delta_lab_mmk ?? 0)}</p>
              </div>
              <div>
                <p className="kpi-label">{t("totalIncome")}</p>
                <p className={deltaClass(data.delta_income_mmk ?? 0)}>
                  {formatDelta(data.delta_income_mmk ?? 0)}
                </p>
              </div>
              <div>
                <p className="kpi-label">{t("totalExpenses")}</p>
                <p className={deltaClass(data.delta_expense_mmk ?? 0)}>
                  {formatDelta(data.delta_expense_mmk ?? 0)}
                </p>
              </div>
              <div>
                <p className="kpi-label">{t("netCash")}</p>
                <p className={deltaClass(data.delta_net_cash_mmk ?? 0)}>
                  {formatDelta(data.delta_net_cash_mmk ?? 0)}
                </p>
              </div>
            </div>
          </section>

          <section className="panel">
            <h3>
              {t("paidBills")} — {data.date}
            </h3>
            {data.lines.length ? (
              <div className="table-scroll">
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
                    {data.lines.map((line, i) => (
                      <tr key={`${line.source}-${line.bill_no}-${line.paid_at}-${i}`}>
                        <td>
                          {line.source}
                          {line.reversal ? ` ${t("reversal")}` : ""}
                        </td>
                        <td>{line.bill_no}</td>
                        <td>{line.patient}</td>
                        <td>{line.doctor || "—"}</td>
                        <td>{line.paid_at}</td>
                        <td className="num">{formatMMK(line.total_mmk)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">{t("noPaidBills")}</p>
            )}
          </section>

          <section className="panel">
            <h3>
              {t("ipdGains")} — {data.date}
            </h3>
            <p className="muted">
              {t("ipdGainsHint")} · {formatMMK(data.ipd_earned_mmk ?? 0)} {t("mmk")}
            </p>
            {(data.ipd_earned_lines ?? []).length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("kind")}</th>
                      <th>{t("admission")}</th>
                      <th>{t("patient")}</th>
                      <th className="num">{t("mmk")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.ipd_earned_lines ?? []).map((line, i) => (
                      <tr key={`earn-${line.kind}-${line.admission_no}-${line.created_at}-${i}`}>
                        <td>{kindLabel(line.kind, t)}</td>
                        <td>{line.admission_no}</td>
                        <td>{line.patient}</td>
                        <td className="num">{formatDelta(earnedLineMMK(line.kind, line.amount_mmk ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">{t("noIpdGains")}</p>
            )}
          </section>

          <section className="panel">
            <h3>
              {t("ipdLines")} — {data.date}
            </h3>
            <p className="muted">
              {t("ipdCashHint")} · {formatMMK(data.ipd_cash_mmk ?? 0)} {t("mmk")}
            </p>
            {(data.ipd_lines ?? []).length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("kind")}</th>
                      <th>{t("admission")}</th>
                      <th>{t("patient")}</th>
                      <th className="num">{t("mmk")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.ipd_lines ?? []).map((line, i) => (
                      <tr key={`${line.kind}-${line.admission_no}-${line.created_at}-${i}`}>
                        <td>{kindLabel(line.kind, t)}</td>
                        <td>{line.admission_no}</td>
                        <td>{line.patient}</td>
                        <td className="num">{formatDelta(line.amount_mmk ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">{t("noIpdLines")}</p>
            )}
          </section>

          <section className="panel">
            <h3>
              {t("ipdOpenStays")} — {data.date}
            </h3>
            <p className="muted">
              {t("ipdHeldForPatients")} {formatMMK(data.ipd_owed_to_patients_mmk ?? 0)} ·{" "}
              {t("ipdOwedByPatients")} {formatMMK(data.ipd_owed_by_patients_mmk ?? 0)}
            </p>
            {(data.ipd_open_stays ?? []).length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("admission")}</th>
                      <th>{t("patient")}</th>
                      <th className="num">{t("balance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.ipd_open_stays ?? []).map((stay, i) => (
                      <tr key={`stay-${stay.admission_no}-${i}`}>
                        <td>{stay.admission_no}</td>
                        <td>{stay.patient}</td>
                        <td className="num">{formatDelta(stay.balance_mmk ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">{t("noIpdOpenStays")}</p>
            )}
          </section>

          <section className="panel">
            <h3>
              {t("expenseLines")} — {data.date}
            </h3>
            {(data.expense_lines ?? []).length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("bill")}</th>
                      <th>{t("portal")}</th>
                      <th>{t("payee")}</th>
                      <th>{t("paid")}</th>
                      <th className="num">{t("mmk")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.expense_lines ?? []).map((line, i) => (
                      <tr key={`${line.bill_no}-${line.paid_at}-${i}`}>
                        <td>{line.bill_no}</td>
                        <td>{portalLabel(line.portal, t)}</td>
                        <td>{line.name}</td>
                        <td>{line.paid_at}</td>
                        <td className="num">{formatDelta(line.amount_mmk ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">{t("noExpenseLines")}</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
