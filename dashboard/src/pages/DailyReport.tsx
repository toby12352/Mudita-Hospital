import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { getApiBase } from "../api";
import { getStoredToken } from "../auth";
import { KpiCard } from "../components/kpi/KpiCard";
import { fetchDailyReport, type DailyReportResponse } from "../dashboardApi";
import { formatDelta, formatMMK } from "../lib/format";
import { fetchAndPreviewPrint, fetchPrintHTML, openPrintPreview, type BillDetailScope } from "../print";
import { todayISO } from "../reports";

type PrintKind = "income" | "expense" | "details" | "overall";

type Props = {
  t: (k: string) => string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

// Expense payments are stored negative; the report shows money spent as positive.
function expenseDisplayMMK(amount: number): number {
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
      return t("opdPortal");
    case "ot":
      return t("otPortal");
    case "lab":
      return t("labPortal");
    case "ipd":
      return t("ipdPortal");
    case "pharmacy":
      return t("pharmacyPortal");
    case "expense":
      return t("expensePortal");
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
  const printBtnRef = useRef<HTMLButtonElement>(null);
  const menuFocusRef = useRef<"first" | "last">("first");
  const restorePrintFocus = useRef(false);
  const printMenuId = useId();
  const vsYesterdayId = useId();
  const paidBillsId = useId();
  const ipdGainsId = useId();
  const ipdLinesId = useId();
  const ipdStaysId = useId();
  const expensesId = useId();

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

  async function handlePrint(kind: PrintKind) {
    setPrintOpen(false);
    printBtnRef.current?.focus();
    setPrintError(null);
    setPrinting(true);
    const titles: Record<PrintKind, string> = {
      income: t("printIncomeReport"),
      expense: t("printExpenseReport"),
      details: t("printAllBillDetails"),
      overall: t("printOverallDailyReport"),
    };
    try {
      if (kind === "details") {
        const reportDate = date;
        openPrintPreview("", {
          title: titles.details,
          billDetail: {
            placeholder: t("billDetailSelectType"),
            income: t("billDetailIncome"),
            expenses: t("billDetailExpenses"),
            all: t("billDetailAll"),
            prompt: t("billDetailPrompt"),
            load: (scope: BillDetailScope) =>
              fetchPrintHTML(
                `/api/dashboard/daily-report/print?date=${encodeURIComponent(reportDate)}&kind=details&scope=${scope}`,
                getApiBase,
                getStoredToken,
              ),
          },
        });
        return;
      }
      await fetchAndPreviewPrint(
        `/api/dashboard/daily-report/print?date=${encodeURIComponent(date)}&kind=${kind}`,
        getApiBase,
        getStoredToken,
        { title: titles[kind], receipt: false },
      );
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : t("error"));
      restorePrintFocus.current = true;
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="page page-frame daily-page">
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
                  onClick={() => void handlePrint("details")}
                >
                  {t("printAllBillDetails")}
                </button>
                <button
                  type="button"
                  className="print-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => void handlePrint("overall")}
                >
                  {t("printOverallDailyReport")}
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
      {loading && !data ? (
        <p className="muted" aria-live="polite">
          {t("loading")}
        </p>
      ) : null}

      {data ? (
        <>
          <section className="panel" aria-label={t("netCash")}>
            <div className="kpi-strip">
              <KpiCard label={t("totalIncome")} value={formatDelta(data.income_mmk ?? 0)} />
              <KpiCard
                label={t("totalExpenses")}
                value={formatMMK(expenseDisplayMMK(data.expense_mmk ?? 0))}
              />
              <KpiCard
                label={t("netCash")}
                value={formatDelta(data.net_cash_mmk ?? 0)}
                sub={t("netCashHint")}
                tone={deltaTone(data.net_cash_mmk ?? 0)}
              />
            </div>
          </section>

          <div className="kpi-strip" role="region" aria-label={t("dailyReport")}>
            <KpiCard
              label={t("cashBalance")}
              value={formatMMK(data.cash_total_mmk ?? data.grand_total_mmk)}
              tone="accent"
            />
            <KpiCard
              label={t("onlineBalance")}
              value={formatMMK(data.online_total_mmk ?? 0)}
            />
            <KpiCard
              label={t("totalBalance")}
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
              sub={
                data.voids > 0 ? `${t("voidsHint")} · ${t("attentionNeeded")}` : t("voidsHint")
              }
              tone={data.voids > 0 ? "warn" : undefined}
            />
          </div>

          <section className="panel delta-strip" aria-labelledby={vsYesterdayId}>
            <h2 id={vsYesterdayId}>{t("vsYesterday")}</h2>
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

          <section className="panel" aria-labelledby={paidBillsId}>
            <h2 id={paidBillsId}>
              {t("paidBills")} — {data.date}
            </h2>
            {data.lines.length ? (
              <div className="table-scroll">
                <table className="data-table" aria-labelledby={paidBillsId}>
                  <thead>
                    <tr>
                      <th>{t("source")}</th>
                      <th>{t("bill")}</th>
                      <th>{t("patient")}</th>
                      <th>{t("doctor")}</th>
                      <th>{t("payType")}</th>
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
                        <td>
                          {line.payment_type === "online" ? t("payTypeOnline") : t("payTypeCash")}
                        </td>
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

          <section className="panel" aria-labelledby={ipdGainsId}>
            <h2 id={ipdGainsId}>
              {t("ipdGains")} — {data.date}
            </h2>
            <p className="muted">
              {t("ipdGainsHint")} · {formatMMK(data.ipd_earned_mmk ?? 0)} {t("mmk")}
            </p>
            {(data.ipd_earned_lines ?? []).length ? (
              <div className="table-scroll">
                <table className="data-table" aria-labelledby={ipdGainsId}>
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

          <section className="panel" aria-labelledby={ipdLinesId}>
            <h2 id={ipdLinesId}>
              {t("ipdLines")} — {data.date}
            </h2>
            <p className="muted">
              {t("ipdCashHint")} · {formatMMK(data.ipd_cash_mmk ?? 0)} {t("mmk")}
            </p>
            {(data.ipd_lines ?? []).length ? (
              <div className="table-scroll">
                <table className="data-table" aria-labelledby={ipdLinesId}>
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

          <section className="panel" aria-labelledby={ipdStaysId}>
            <h2 id={ipdStaysId}>
              {t("ipdOpenStays")} — {data.date}
            </h2>
            <p className="muted">
              {t("ipdHeldForPatients")} {formatMMK(data.ipd_owed_to_patients_mmk ?? 0)} ·{" "}
              {t("ipdOwedByPatients")} {formatMMK(data.ipd_owed_by_patients_mmk ?? 0)}
            </p>
            {(data.ipd_open_stays ?? []).length ? (
              <div className="table-scroll">
                <table className="data-table" aria-labelledby={ipdStaysId}>
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

          <section className="panel" aria-labelledby={expensesId}>
            <h2 id={expensesId}>
              {t("expenseLines")} — {data.date}
            </h2>
            {(data.expense_lines ?? []).length ? (
              <div className="table-scroll">
                <table className="data-table" aria-labelledby={expensesId}>
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
                        <td className="num">{formatMMK(expenseDisplayMMK(line.amount_mmk ?? 0))}</td>
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
