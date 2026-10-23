import { FormEvent, useEffect, useState } from "react";
import {
  adjustItem,
  deactivatePharmacyItem,
  findItemByCode,
  formatItemCode,
  formatLocationLabel,
  formatPackPreview,
  formatStockHistoryLine,
  formatStockHistoryReason,
  getPharmacyItem,
  listPharmacyItems,
  listStockMovements,
  packFromItem,
  restockItem,
  transferBatchToOt,
  type PharmacyItem,
  type StockMovement,
} from "@/features/pharmacy/api";
import { DatePicker } from "@/shared/DatePicker";
import { userMessage } from "@/shared/errors";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";
export function PharmacyItemsTab({
  isAdmin,
  onEdit,
  selectedId = null,
  embedDetail = false,
  onChanged,
}: {
  isAdmin: boolean;
  onEdit: (item: PharmacyItem) => void;
  selectedId?: number | null;
  /** When true, hide the browse list and show restock/batches for selectedId. */
  embedDetail?: boolean;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [list, setList] = useState<PharmacyItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelItem, setPanelItem] = useState<PharmacyItem | null>(null);
  const [panelMode, setPanelMode] = useState<"restock" | "view" | null>(null);
  const [itemMovements, setItemMovements] = useState<StockMovement[]>([]);

  const [restockQty, setRestockQty] = useState("");
  const [restockExpiry, setRestockExpiry] = useState("");
  const [restockBuy, setRestockBuy] = useState("");
  const [restockSell, setRestockSell] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [codeLookup, setCodeLookup] = useState("");
  const [sendQty, setSendQty] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function reload(search = q) {
    setList(await listPharmacyItems(search.trim(), { includeInactive: true }));
    onChanged?.();
  }

  function clearPanel() {
    setPanelItem(null);
    setPanelMode(null);
    setItemMovements([]);
    setNotice(null);
  }

  function resetRestockFields(item: PharmacyItem) {
    setRestockQty("");
    setRestockExpiry("");
    setRestockBuy(String(item.buy_price_mmk || 0));
    setRestockSell(String(item.sell_price_mmk || 0));
    setAdjustDelta("");
    setAdjustReason("");
  }

  async function openRestock(id: number) {
    setBusy(true);
    setError(null);
    try {
      const item = await getPharmacyItem(id);
      resetRestockFields(item);
      setItemMovements([]);
      setPanelItem(item);
      setPanelMode("restock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  async function openView(id: number) {
    setBusy(true);
    setError(null);
    try {
      const [item, movements] = await Promise.all([
        getPharmacyItem(id),
        listStockMovements({ itemId: id }),
      ]);
      setPanelItem(item);
      setItemMovements(movements);
      setSendQty({});
      setNotice(null);
      setPanelMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  async function selectSearchItem(item: PharmacyItem) {
    clearPanel();
    setQ(item.code);
    setError(null);
    setBusy(true);
    try {
      await reload(item.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function selectLookupItem(item: PharmacyItem) {
    setCodeLookup(item.code);
    setError(null);
    setBusy(true);
    try {
      clearPanel();
      setQ(item.code);
      await reload(item.code);
      await openRestock(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (embedDetail) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await listPharmacyItems("", { includeInactive: true });
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embedDetail]);

  useEffect(() => {
    if (!embedDetail || selectedId == null) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const item = await getPharmacyItem(selectedId);
        if (cancelled) return;
        resetRestockFields(item);
        setItemMovements([]);
        setPanelItem(item);
        setPanelMode("restock");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load detail when selection changes
  }, [embedDetail, selectedId]);

  async function onDeactivate(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deactivatePharmacyItem(id);
      if (panelItem?.id === id) clearPanel();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFindByCode() {
    setBusy(true);
    setError(null);
    try {
      const found = await findItemByCode(codeLookup);
      clearPanel();
      if (!found) {
        setError(
          `Unknown ID/Code “${codeLookup.trim()}” — create the item first, then restock.`,
        );
        return;
      }
      setQ(found.code);
      await reload(found.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRestock(e: FormEvent) {
    e.preventDefault();
    if (!panelItem || panelMode !== "restock") return;
    setBusy(true);
    setError(null);
    try {
      const qty = Number(restockQty);
      if (!qty || qty <= 0) throw new Error(userMessage("Restock qty must be > 0"));
      const body: {
        qty: number;
        qty_unit?: "purchase" | "stock";
        expiry_date?: string;
        buy_price_mmk?: number;
        sell_price_mmk?: number;
      } = { qty, qty_unit: "purchase" };
      if (restockExpiry.trim()) body.expiry_date = restockExpiry.trim();
      if (restockBuy.trim() !== "") body.buy_price_mmk = Number(restockBuy) || 0;
      if (restockSell.trim() !== "") body.sell_price_mmk = Number(restockSell) || 0;
      const item = await restockItem(panelItem.id, body);
      resetRestockFields(item);
      setPanelItem(item);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restock failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    if (!panelItem || panelMode !== "restock") return;
    setBusy(true);
    setError(null);
    try {
      const delta = Number(adjustDelta);
      if (!delta) throw new Error(userMessage("Adjustment qty must be non-zero"));
      if (!adjustReason.trim()) throw new Error(userMessage("Reason required"));
      const item = await adjustItem(panelItem.id, {
        qty_delta: delta,
        reason: adjustReason.trim(),
      });
      setPanelItem(item);
      setAdjustDelta("");
      setAdjustReason("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjust failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSendToOt(e: FormEvent, batchId: number, onHand: number) {
    e.preventDefault();
    if (!panelItem) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const qty = Number(sendQty[batchId]);
      if (!qty || qty <= 0) throw new Error(t("qtyMustBePositive"));
      if (qty > onHand) throw new Error(t("qtyExceedsMain"));
      const result = await transferBatchToOt(batchId, qty);
      setSendQty((prev) => ({ ...prev, [batchId]: "" }));
      setNotice(
        `${t("sentToOt")}: ${result.qty.toLocaleString()}. ${t("otOnHand")} ${result.ot_qty.toLocaleString()}. ${t("inStock")} ${result.pharmacy_qty.toLocaleString()}.`,
      );
      const [item, movements] = await Promise.all([
        getPharmacyItem(panelItem.id),
        listStockMovements({ itemId: panelItem.id }),
      ]);
      setPanelItem(item);
      setItemMovements(movements);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  function renderPharmacyOption(item: PharmacyItem) {
    const dosage = (item.dosage || "").trim();
    return (
      <>
        <span className="typeahead-title">
          {formatItemCode(item.code)} — {item.name}
          {dosage ? ` (${dosage})` : ""}
          {!item.active ? ` ${t("inactive")}` : ""}
        </span>
        <span className="typeahead-sub">
          {t("inStock")} {item.stock_main.toLocaleString()} {item.pack_l3_unit || item.stock_unit || ""}
          {item.low_stock && item.active ? ` · ${t("lowStockLabel")}` : ""}
        </span>
      </>
    );
  }

  return (
    <div className={embedDetail ? "drug-setup-actions" : "settings-stack"}>
      {!embedDetail ? (
      <div className="card-form">
        <div className="list-toolbar">
          <Typeahead
            label={t("quickLookup")}
            value={codeLookup}
            onChange={setCodeLookup}
            placeholder={t("codeOrName")}
            loadSuggestions={async (term) =>
              listPharmacyItems(term, { includeInactive: true })
            }
            getKey={(item) => item.id}
            renderOption={renderPharmacyOption}
            optionClassName={(item) => (!item.active ? "inactive" : "")}
            onPick={(item) => void selectLookupItem(item)}
            onSubmitWithoutPick={() => void onFindByCode()}
          />
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void onFindByCode()}>
            {t("find")}
          </button>
        </div>
        <div className="list-toolbar">
          <Typeahead
            label={t("searchItems")}
            value={q}
            onChange={setQ}
            placeholder={t("idCodeOrName")}
            loadSuggestions={async (term) =>
              listPharmacyItems(term, { includeInactive: true })
            }
            getKey={(item) => item.id}
            renderOption={renderPharmacyOption}
            optionClassName={(item) => (!item.active ? "inactive" : "")}
            onPick={(item) => void selectSearchItem(item)}
            onSubmitWithoutPick={() => {
              clearPanel();
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              );
            }}
          />
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              clearPanel();
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              );
            }}
          >
            {t("search")}
          </button>
        </div>
        {error && !panelItem ? <p className="form-error">{error}</p> : null}
        <ul className="data-list">
          {list.length === 0 ? <li className="empty-row">{t("noItemsYet")}</li> : null}
          {list.map((item) => (
            <li key={item.id} className={!item.active ? "inactive" : undefined}>
              <div>
                <p className="row-title">
                  {formatItemCode(item.code)} — {item.name}
                  {!item.active ? ` ${t("inactive")}` : ""}
                  {item.low_stock && item.active ? (
                    <span className="low-stock"> · {t("lowStockLabel")}</span>
                  ) : null}
                </p>
                <p className="row-sub">
                  {(item.dosage || "").trim() ? `${item.dosage} · ` : ""}
                  {t("inStock")} {item.stock_main.toLocaleString()}{" "}
                  {item.pack_l3_unit || item.stock_unit || "units"} · {t("sellAbbrev")}{" "}
                  {item.sell_price_mmk.toLocaleString()} {t("mmk")}/
                  {item.pack_l3_unit || item.billing_unit || "unit"}
                </p>
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void openRestock(item.id)}
                  disabled={busy}
                >
                  {t("restock")}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void openView(item.id)}
                  disabled={busy}
                >
                  {t("view")}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onEdit(item)}
                  disabled={busy}
                >
                  {t("edit")}
                </button>
                {item.active ? (
                  <button
                    type="button"
                    className="btn ghost danger"
                    onClick={() => void onDeactivate(item.id)}
                    disabled={busy}
                  >
                    {t("deactivate")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
      ) : (
        <div className="btn-row drug-setup-action-row">
          <button
            type="button"
            className={`btn ghost${panelMode === "restock" ? " primary" : ""}`}
            disabled={busy || selectedId == null}
            onClick={() => selectedId != null && void openRestock(selectedId)}
          >
            {t("restock")}
          </button>
          <button
            type="button"
            className={`btn ghost${panelMode === "view" ? " primary" : ""}`}
            disabled={busy || selectedId == null}
            onClick={() => selectedId != null && void openView(selectedId)}
          >
            {t("view")}
          </button>
          {panelItem?.active ? (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => panelItem && void onDeactivate(panelItem.id)}
              disabled={busy}
            >
              {t("deactivate")}
            </button>
          ) : null}
        </div>
      )}

      {panelItem && panelMode === "restock" ? (
        embedDetail ? (
          <div className="drug-setup-panel">
            <div className="drug-setup-title-row">
              <h3 className="drug-setup-title drug-setup-panel-title">
                {t("restock")} · {formatItemCode(panelItem.code)} · {t("inStock")}{" "}
                {panelItem.stock_main.toLocaleString()} {panelItem.stock_unit || ""}
              </h3>
              <button
                type="button"
                className="desk-text-link"
                onClick={clearPanel}
                disabled={busy}
              >
                {t("close")}
              </button>
            </div>
            <p className="hint">
              {panelItem.name}
              {(panelItem.dosage || "").trim() ? ` · ${panelItem.dosage}` : ""} ·{" "}
              {formatPackPreview(packFromItem(panelItem))}
            </p>

            <form className="drug-setup-panel-form" onSubmit={(e) => void onRestock(e)}>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("quantityBoxes")}</span>
                <input
                  className="drug-info-input"
                  type="number"
                  min={1}
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("expiry")}</span>
                <DatePicker value={restockExpiry} onChange={setRestockExpiry} disabled={busy} />
              </div>
              {restockQty && Number(restockQty) > 0 ? (
                <p className="hint">
                  {t("willAdd")}{" "}
                  {Number(restockQty) *
                    Math.max(1, panelItem.units_per_purchase || panelItem.pack_size || 1)}{" "}
                  {panelItem.pack_l3_unit || panelItem.stock_unit || "units"} {t("toInStock")}
                </p>
              ) : null}
              <div className="drug-info-field">
                <span className="drug-info-label">{t("buyPricePerBox")}</span>
                <input
                  className="drug-info-input price-buy"
                  type="number"
                  min={0}
                  value={restockBuy}
                  onChange={(e) => setRestockBuy(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("sellPricePerTablet")}</span>
                <input
                  className="drug-info-input price-sell"
                  type="number"
                  min={0}
                  value={restockSell}
                  onChange={(e) => setRestockSell(e.target.value)}
                  disabled={busy}
                />
              </div>
              {error ? <p className="form-error">{error}</p> : null}
              <button type="submit" className="btn primary" disabled={busy || !panelItem.active}>
                {t("restock")}
              </button>
            </form>

            {isAdmin ? (
              <form className="drug-setup-panel-form" onSubmit={(e) => void onAdjust(e)}>
                <h3 className="drug-setup-title drug-setup-panel-title">{t("adminAdjust")}</h3>
                <div className="drug-info-field">
                  <span className="drug-info-label">{t("qtyDelta")}</span>
                  <input
                    className="drug-info-input"
                    type="number"
                    value={adjustDelta}
                    onChange={(e) => setAdjustDelta(e.target.value)}
                    required
                    disabled={busy}
                  />
                </div>
                <div className="drug-info-field">
                  <span className="drug-info-label">{t("reason")}</span>
                  <input
                    className="drug-info-input"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    required
                    disabled={busy}
                    placeholder={t("reasonPlaceholder")}
                  />
                </div>
                <button type="submit" className="btn ghost" disabled={busy}>
                  {t("applyAdjustment")}
                </button>
              </form>
            ) : null}
          </div>
        ) : (
          <div className="card-form">
            <div className="btn-row">
              <h2 className="section-title">
                {t("restock")} · {formatItemCode(panelItem.code)} · {t("inStock")}{" "}
                {panelItem.stock_main.toLocaleString()} {panelItem.stock_unit || ""}
              </h2>
              <button type="button" className="btn ghost" onClick={clearPanel} disabled={busy}>
                {t("close")}
              </button>
            </div>
            <p className="hint">
              {panelItem.name}
              {(panelItem.dosage || "").trim() ? ` · ${panelItem.dosage}` : ""} ·{" "}
              {formatPackPreview(packFromItem(panelItem))}
            </p>

            <form className="nested-form" onSubmit={(e) => void onRestock(e)}>
              <h3 className="section-title">{t("restock")}</h3>
              <div className="field-row">
                <label className="field">
                  <span>{t("quantityBoxes")}</span>
                  <input
                    type="number"
                    min={1}
                    value={restockQty}
                    onChange={(e) => setRestockQty(e.target.value)}
                    required
                    disabled={busy}
                  />
                </label>
                <label className="field field-compact">
                  <span>{t("expiry")}</span>
                  <DatePicker value={restockExpiry} onChange={setRestockExpiry} disabled={busy} />
                </label>
              </div>
              {restockQty && Number(restockQty) > 0 ? (
                <p className="hint">
                  {t("willAdd")}{" "}
                  {Number(restockQty) *
                    Math.max(1, panelItem.units_per_purchase || panelItem.pack_size || 1)}{" "}
                  {panelItem.pack_l3_unit || panelItem.stock_unit || "units"} {t("toInStock")}
                </p>
              ) : null}
              <div className="field-row">
                <label className="field">
                  <span>{t("buyPricePerBox")}</span>
                  <input
                    type="number"
                    min={0}
                    value={restockBuy}
                    onChange={(e) => setRestockBuy(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="field">
                  <span>{t("sellPricePerTablet")}</span>
                  <input
                    type="number"
                    min={0}
                    value={restockSell}
                    onChange={(e) => setRestockSell(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
              {error ? <p className="form-error">{error}</p> : null}
              <button type="submit" className="btn primary" disabled={busy || !panelItem.active}>
                {t("restock")}
              </button>
            </form>

            {isAdmin ? (
              <form className="nested-form" onSubmit={(e) => void onAdjust(e)}>
                <h3 className="section-title">{t("adminAdjust")}</h3>
                <div className="field-row">
                  <label className="field">
                    <span>{t("qtyDelta")}</span>
                    <input
                      type="number"
                      value={adjustDelta}
                      onChange={(e) => setAdjustDelta(e.target.value)}
                      required
                      disabled={busy}
                    />
                  </label>
                  <label className="field">
                    <span>{t("reason")}</span>
                    <input
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      required
                      disabled={busy}
                      placeholder={t("reasonPlaceholder")}
                    />
                  </label>
                </div>
                <button type="submit" className="btn ghost" disabled={busy}>
                  {t("applyAdjustment")}
                </button>
              </form>
            ) : null}
          </div>
        )
      ) : null}

      {panelItem && panelMode === "view" ? (
        embedDetail ? (
          <div className="drug-setup-panel">
            <div className="drug-setup-title-row">
              <h3 className="drug-setup-title drug-setup-panel-title">
                {formatItemCode(panelItem.code)} · {t("inStock")}{" "}
                {panelItem.stock_main.toLocaleString()}
                {panelItem.stock_by_location?.OT_RESERVED
                  ? ` · ${t("reserved")} ${panelItem.stock_by_location.OT_RESERVED.toLocaleString()}`
                  : ""}
                {panelItem.stock_by_location?.OT_FLOOR
                  ? ` · ${t("floorStock")} ${panelItem.stock_by_location.OT_FLOOR.toLocaleString()}`
                  : ""}
              </h3>
              <button
                type="button"
                className="desk-text-link"
                onClick={clearPanel}
                disabled={busy}
              >
                {t("close")}
              </button>
            </div>
            <p className="hint">{t("batchSendHint")}</p>
            {notice ? <p className="form-ok">{notice}</p> : null}
            {error ? <p className="form-error">{error}</p> : null}
            <div className="drug-setup-table drug-setup-batch-table" role="list">
              <div className="drug-setup-batch-head">
                <span>{t("batch")}</span>
                <span>{t("qty")}</span>
                <span>{t("expiry")}</span>
                <span />
              </div>
              {(panelItem.batches ?? []).length === 0 ? (
                <p className="empty-row">{t("noBatchesYet")}</p>
              ) : null}
              {(panelItem.batches ?? []).map((b) => (
                <div key={b.id} className="drug-setup-batch-row" role="listitem">
                  <span>
                    {formatLocationLabel(b.location_code)} · {b.batch_no || "—"}
                  </span>
                  <span>{b.qty.toLocaleString()}</span>
                  <span>{b.expiry_date || t("none")}</span>
                  <span>
                    {b.location_code === "MAIN" && b.qty > 0 ? (
                      <form
                        className="drug-setup-send-row"
                        onSubmit={(e) => void onSendToOt(e, b.id, b.qty)}
                      >
                        <input
                          className="drug-info-input"
                          type="number"
                          min={1}
                          max={b.qty}
                          value={sendQty[b.id] ?? ""}
                          onChange={(e) =>
                            setSendQty((prev) => ({ ...prev, [b.id]: e.target.value }))
                          }
                          disabled={busy}
                          required
                          aria-label={t("qtyToSend")}
                        />
                        <button type="submit" className="btn ghost" disabled={busy}>
                          {t("sendToOt")}
                        </button>
                      </form>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>

            <h3 className="drug-setup-title drug-setup-panel-title">{t("itemHistory")}</h3>
            <div className="drug-setup-table drug-setup-history-table" role="list">
              <div className="drug-setup-history-head">
                <span>{t("itemHistory")}</span>
              </div>
              {itemMovements.length === 0 ? (
                <p className="empty-row">No history for this item</p>
              ) : null}
              {itemMovements.map((m) => {
                const reasonLine = formatStockHistoryReason(m.reason);
                return (
                  <div key={m.id} className="drug-setup-history-row" role="listitem">
                    <p className="row-title">
                      {formatStockHistoryLine(m, panelItem.stock_unit || m.stock_unit || "item")}
                    </p>
                    {reasonLine ? <p className="row-sub">{reasonLine}</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card-form">
            <div className="btn-row">
              <h2 className="section-title">
                {formatItemCode(panelItem.code)} · {t("inStock")}{" "}
                {panelItem.stock_main.toLocaleString()}
                {panelItem.stock_by_location?.OT_RESERVED
                  ? ` · ${t("reserved")} ${panelItem.stock_by_location.OT_RESERVED.toLocaleString()}`
                  : ""}
                {panelItem.stock_by_location?.OT_FLOOR
                  ? ` · ${t("floorStock")} ${panelItem.stock_by_location.OT_FLOOR.toLocaleString()}`
                  : ""}
              </h2>
              <button type="button" className="btn ghost" onClick={clearPanel} disabled={busy}>
                {t("close")}
              </button>
            </div>
            <p className="hint">{t("batchSendHint")}</p>
            {notice ? <p className="form-ok">{notice}</p> : null}
            {error ? <p className="form-error">{error}</p> : null}
            <ul className="data-list">
              {(panelItem.batches ?? []).length === 0 ? (
                <li className="empty-row">{t("noBatchesYet")}</li>
              ) : null}
              {(panelItem.batches ?? []).map((b) => (
                <li key={b.id}>
                  <div>
                    <p className="row-title">
                      {formatLocationLabel(b.location_code)} · {t("qty")} {b.qty.toLocaleString()}
                    </p>
                    <p className="row-sub">
                      {t("batch")} {b.batch_no || "—"} · {t("expiry")} {b.expiry_date || t("none")}
                    </p>
                  </div>
                  {b.location_code === "MAIN" && b.qty > 0 ? (
                    <form className="btn-row" onSubmit={(e) => void onSendToOt(e, b.id, b.qty)}>
                      <label className="field field-compact">
                        <span>{t("qtyToSend")}</span>
                        <input
                          type="number"
                          min={1}
                          max={b.qty}
                          value={sendQty[b.id] ?? ""}
                          onChange={(e) =>
                            setSendQty((prev) => ({ ...prev, [b.id]: e.target.value }))
                          }
                          disabled={busy}
                          required
                        />
                      </label>
                      <button type="submit" className="btn ghost" disabled={busy}>
                        {t("sendToOt")}
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>

            <h3 className="section-title">{t("itemHistory")}</h3>
            <ul className="data-list">
              {itemMovements.length === 0 ? (
                <li className="empty-row">No history for this item</li>
              ) : null}
              {itemMovements.map((m) => {
                const reasonLine = formatStockHistoryReason(m.reason);
                return (
                  <li key={m.id}>
                    <div>
                      <p className="row-title">
                        {formatStockHistoryLine(m, panelItem.stock_unit || m.stock_unit || "item")}
                      </p>
                      {reasonLine ? <p className="row-sub">{reasonLine}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
