import { useEffect, useMemo, useState } from "react";
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
import {
  DeskChrome,
  DeskChromePanel,
  DeskChromeTabs,
  type DeskChromeTabItem,
} from "@/shared/DeskChrome";
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

  const tabs = useMemo((): DeskChromeTabItem[] => {
    const items: DeskChromeTabItem[] = [];
    if (canCash) {
      items.push({
        id: "reports-tab-cash",
        label: t("reportDailyCash"),
        controls: "reports-panel-cash",
      });
    }
    if (canStock) {
      items.push({
        id: "reports-tab-low",
        label: t("reportLowStock"),
        controls: "reports-panel-low",
      });
      items.push({
        id: "reports-tab-expiry",
        label: t("reportNearExpiry"),
        controls: "reports-panel-expiry",
      });
    }
    return items;
  }, [canCash, canStock, t]);

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
    <DeskChrome className="reports-desk" aria-busy={busy || undefined}>
      <div className="btn-row reports-desk-actions">
        <button type="button" className="btn ghost" onClick={onBack}>
          {t("back")}
        </button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void doPrint()}>
          {t("print")}
        </button>
      </div>
      <DeskChromeTabs
        ariaLabel={t("reports")}
        tabs={tabs}
        activeId={`reports-tab-${tab}`}
        onSelect={(id) => {
          if (id === "reports-tab-cash") setTab("cash");
          else if (id === "reports-tab-low") setTab("low");
          else setTab("expiry");
        }}
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "cash" && canCash ? (
        <DeskChromePanel id="reports-panel-cash" labelledBy="reports-tab-cash">
          <div className="btn-row report-filters">
            <label className="field inline-field">
              <span>{t("reportDate")}</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
              {t("load")}
            </button>
          </div>
          {cash ? (
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
                {(cash.lab_count ?? 0) > 0 ? (
                  <>
                    {t("labBills")}: {cash.lab_count ?? 0} · {formatMMK(cash.lab_total_mmk ?? 0)} {t("mmk")} ·{" "}
                  </>
                ) : null}
                <strong>
                  {t("cashBalance")}: {formatMMK(cash.cash_total_mmk ?? cash.grand_total_mmk)} {t("mmk")}
                  {" · "}
                  {t("onlineBalance")}: {formatMMK(cash.online_total_mmk ?? 0)} {t("mmk")}
                  {" · "}
                  {t("totalBalance")}: {formatMMK(cash.grand_total_mmk)} {t("mmk")}
                </strong>
              </p>
              <ul className="data-list" aria-label={t("reportDailyCash")}>
                {cash.lines.length === 0 ? <li className="empty-row">{t("noPaidBills")}</li> : null}
                {cash.lines.map((line) => (
                  <li key={`${line.source}-${line.bill_no}`}>
                    <div>
                      <p className="row-title">
                        {line.source} {line.bill_no} · {formatMMK(line.total_mmk)} {t("mmk")} ·{" "}
                        {line.payment_type === "online" ? t("payTypeOnline") : t("payTypeCash")}
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
        </DeskChromePanel>
      ) : null}

      {tab === "low" && canStock ? (
        <DeskChromePanel id="reports-panel-low" labelledBy="reports-tab-low">
          <ul className="data-list" aria-label={t("reportLowStock")}>
            {low.length === 0 ? <li className="empty-row">{t("noLowStock")}</li> : null}
            {low.map((row) => (
              <li key={row.id}>
                <div>
                  <p className="row-title">
                    {row.code} — {row.name}
                    {` · ${t("lowStockLabel")}`}
                  </p>
                  <p className="row-sub">
                    {t("stock")} {row.stock_main} / {t("reorder")} {row.reorder_level} ·{" "}
                    {t("deficit")} {row.deficit}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </DeskChromePanel>
      ) : null}

      {tab === "expiry" && canStock ? (
        <DeskChromePanel id="reports-panel-expiry" labelledBy="reports-tab-expiry">
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
          <ul className="data-list" aria-label={t("reportNearExpiry")}>
            {expiry.length === 0 ? <li className="empty-row">{t("noNearExpiry")}</li> : null}
            {expiry.map((row) => {
              const expired = row.days_left < 0;
              return (
                <li key={row.batch_id} className={expired ? "row-warn" : undefined}>
                  <div>
                    <p className="row-title">
                      {row.code} — {row.name}
                      {expired ? ` · ${t("daysLeft")} ${row.days_left}` : ""}
                    </p>
                    <p className="row-sub">
                      {formatLocationLabel(row.location_code)} · {t("expiry")} {row.expiry_date} ·{" "}
                      {t("daysLeft")} {row.days_left} · {t("qty")} {row.qty}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </DeskChromePanel>
      ) : null}
    </DeskChrome>
  );
}
