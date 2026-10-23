import { useEffect, useState } from "react";
import {
  fetchDailyCash,
  fetchLowStock,
  fetchNearExpiry,
  printDailyCash,
  printLowStock,
  printNearExpiry,
  type CashReport,
  type LowStockItem,
  type NearExpiryBatch,
} from "@/features/reports/api";
import { formatLocationLabel } from "@/features/pharmacy/api";
import { formatMMK } from "@/shared/format";
export function ReportsPage({
  canCash,
  canStock,
  onBack,
  t,
}: {
  canCash: boolean;
  canStock: boolean;
  onBack: () => void;
  t: (k: string) => string;
}) {
  type Tab = "cash" | "low" | "expiry";
  const [tab, setTab] = useState<Tab>(canCash ? "cash" : "low");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(90);
  const [cash, setCash] = useState<CashReport | null>(null);
  const [low, setLow] = useState<LowStockItem[]>([]);
  const [expiry, setExpiry] = useState<NearExpiryBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      if (tab === "cash" && canCash) {
        setCash(await fetchDailyCash(date));
      } else if (tab === "low" && canStock) {
        const res = await fetchLowStock();
        setLow(res.items);
      } else if (tab === "expiry" && canStock) {
        const res = await fetchNearExpiry(days);
        setExpiry(res.batches);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function doPrint() {
    setBusy(true);
    setError(null);
    try {
      if (tab === "cash") await printDailyCash(date);
      else if (tab === "low") await printLowStock();
      else await printNearExpiry(days);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel">
      <div className="btn-row">
        <button type="button" className="btn ghost" onClick={onBack}>
          {t("back")}
        </button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void doPrint()}>
          {t("print")}
        </button>
      </div>
      <nav className="tabs" aria-label="Reports">
        {canCash ? (
          <button
            type="button"
            className={`tab ${tab === "cash" ? "active" : ""}`}
            onClick={() => setTab("cash")}
          >
            {t("reportDailyCash")}
          </button>
        ) : null}
        {canStock ? (
          <button
            type="button"
            className={`tab ${tab === "low" ? "active" : ""}`}
            onClick={() => setTab("low")}
          >
            {t("reportLowStock")}
          </button>
        ) : null}
        {canStock ? (
          <button
            type="button"
            className={`tab ${tab === "expiry" ? "active" : ""}`}
            onClick={() => setTab("expiry")}
          >
            {t("reportNearExpiry")}
          </button>
        ) : null}
      </nav>

      {tab === "cash" && canCash ? (
        <div className="btn-row report-filters">
          <label className="field inline-field">
            <span>{t("reportDate")}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
            {t("load")}
          </button>
        </div>
      ) : null}
      {tab === "expiry" && canStock ? (
        <div className="btn-row report-filters">
          <label className="field inline-field">
            <span>{t("daysAhead")}</span>
            <input
              type="number"
              min={1}
              max={730}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 90)}
            />
          </label>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
            {t("load")}
          </button>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      {tab === "cash" && cash ? (
        <div className="report-block">
          <p className="hint">
            {cash.opd_count > 0 ? (
              <>
                {t("opdBills")}: {cash.opd_count} · {formatMMK(cash.opd_total_mmk)} {t("mmk")} ·{" "}
              </>
            ) : null}
            {(cash.pharmacy_count ?? 0) > 0 ? (
              <>
                {t("pharmacyBills")}: {cash.pharmacy_count ?? 0} ·{" "}
                {formatMMK(cash.pharmacy_total_mmk ?? 0)} {t("mmk")} ·{" "}
              </>
            ) : null}
            {cash.ot_count > 0 ? (
              <>
                {t("otBills")}: {cash.ot_count} · {formatMMK(cash.ot_total_mmk)} {t("mmk")} ·{" "}
              </>
            ) : null}
            <strong>
              {t("grandTotal")}: {formatMMK(cash.grand_total_mmk)} {t("mmk")}
            </strong>
          </p>
          <ul className="data-list">
            {cash.lines.length === 0 ? <li className="empty-row">{t("noPaidBills")}</li> : null}
            {cash.lines.map((line) => (
              <li key={`${line.source}-${line.bill_no}`}>
                <div>
                  <p className="row-title">
                    {line.source} {line.bill_no} · {formatMMK(line.total_mmk)} {t("mmk")}
                  </p>
                  <p className="row-sub">
                    {line.patient} · {line.doctor} · {line.paid_at}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "low" ? (
        <ul className="data-list">
          {low.length === 0 ? <li className="empty-row">{t("noLowStock")}</li> : null}
          {low.map((row) => (
            <li key={row.id}>
              <div>
                <p className="row-title">
                  {row.code} — {row.name}
                </p>
                <p className="row-sub">
                  {t("stock")} {row.stock_main} / {t("reorder")} {row.reorder_level} ·{" "}
                  {t("deficit")} {row.deficit}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "expiry" ? (
        <ul className="data-list">
          {expiry.length === 0 ? <li className="empty-row">{t("noNearExpiry")}</li> : null}
          {expiry.map((row) => (
            <li key={row.batch_id} className={row.days_left < 0 ? "row-warn" : undefined}>
              <div>
                <p className="row-title">
                  {row.code} — {row.name}
                </p>
                <p className="row-sub">
                  {formatLocationLabel(row.location_code)} · {t("expiry")} {row.expiry_date} ·{" "}
                  {t("daysLeft")} {row.days_left} · {t("qty")} {row.qty}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
