import {
  type FocusEvent as ReactFocusEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  labelPharmacyBatch,
  listPharmacyItems,
  listStockMovements,
  packFromItem,
  packLevelsFromItemPack,
  restockItem,
  saleUnitsFromPack,
  type PharmacyItem,
  type SaleUnit,
  type StockMovement,
} from "@/features/pharmacy/api";
import { ActionIcon } from "@/shared/ActionIcon";
import { DatePicker } from "@/shared/DatePicker";
import { userMessage } from "@/shared/errors";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";
import { PharmacyPriceGrid } from "./PharmacyPriceGrid";

export type RestockPriceDraft = { buy: number; sell: number };

const UNIT_I18N: Record<string, string> = {
  Box: "packUnitBox",
  Carton: "packUnitCarton",
  Bottle: "packUnitBottle",
  Vial: "packUnitVial",
  Ampoule: "packUnitAmpoule",
  Piece: "packUnitPiece",
  Tablet: "packUnitTablet",
  Capsule: "packUnitCapsule",
  Tube: "packUnitTube",
  Cylinder: "packUnitCylinder",
  Bag: "packUnitBag",
  Each: "packUnitEach",
  mL: "packUnitMl",
  g: "packUnitG",
  oz: "packUnitOz",
  Strip: "packUnitStrip",
  Card: "packUnitCard",
};

export function PharmacyItemsTab({
  isAdmin,
  onEdit,
  onDelete,
  deleteBusy = false,
  selectedId = null,
  embedDetail = false,
  onChanged,
  onRestockPrices,
}: {
  isAdmin: boolean;
  onEdit: (item: PharmacyItem) => void;
  onDelete?: () => void;
  deleteBusy?: boolean;
  selectedId?: number | null;
  /** When true, hide the browse list and show restock/batches for selectedId. */
  embedDetail?: boolean;
  onChanged?: () => void;
  /** Live restock price draft so Drug Info can mirror unit conversion. */
  onRestockPrices?: (draft: RestockPriceDraft | null) => void;
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
  const [restockUnitId, setRestockUnitId] = useState("");
  const [restockBatchNo, setRestockBatchNo] = useState("");
  const [restockExpiry, setRestockExpiry] = useState("");
  const [restockBuy, setRestockBuy] = useState(0);
  const [restockSell, setRestockSell] = useState(0);
  const [restockPriceSync, setRestockPriceSync] = useState(0);
  const restockUnitRef = useRef<HTMLSelectElement>(null);
  const adjustUnitRef = useRef<HTMLSelectElement>(null);
  const adjustQtyUnitRowRef = useRef<HTMLDivElement>(null);
  const adjustDeltaRef = useRef("");
  const adjustUnitIdRef = useRef("");
  const panelItemRef = useRef<PharmacyItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustUnitId, setAdjustUnitId] = useState("");
  const [adjustBatchNo, setAdjustBatchNo] = useState("");
  const [adjustExpiry, setAdjustExpiry] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [codeLookup, setCodeLookup] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  adjustDeltaRef.current = adjustDelta;
  adjustUnitIdRef.current = adjustUnitId;
  panelItemRef.current = panelItem;

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

  function restockUnitsFor(item: PharmacyItem): SaleUnit[] {
    return saleUnitsFromPack(packFromItem(item), item.sell_price_mmk || 0);
  }

  function unitLabel(u: string): string {
    const key = UNIT_I18N[u];
    return key ? t(key) : u;
  }

  const restockLevels = useMemo(() => {
    if (!panelItem) return null;
    return packLevelsFromItemPack(packFromItem(panelItem));
  }, [panelItem]);

  useEffect(() => {
    if (!onRestockPrices) return;
    if (panelMode === "restock" && panelItem) {
      onRestockPrices({ buy: restockBuy, sell: restockSell });
    } else {
      onRestockPrices(null);
    }
  }, [onRestockPrices, panelMode, panelItem, restockBuy, restockSell]);

  function resetRestockFields(item: PharmacyItem) {
    setRestockQty("");
    setRestockUnitId("");
    setRestockBatchNo("");
    setRestockExpiry("");
    setRestockBuy(item.buy_price_mmk || 0);
    setRestockSell(item.sell_price_mmk || 0);
    setRestockPriceSync((n) => n + 1);
    setAdjustDelta("");
    setAdjustUnitId("");
    setAdjustBatchNo("");
    setAdjustExpiry("");
    setAdjustReason("");
  }

  function openUnitSelect(el: HTMLSelectElement | null) {
    if (!el) return;
    el.focus();
    if (typeof el.showPicker !== "function") return;
    window.setTimeout(() => {
      if (!el.isConnected) return;
      try {
        el.showPicker();
      } catch {
        // Focus is enough when this WebView refuses showPicker outside a direct gesture.
      }
    }, 0);
  }

  function openRestockUnitSelect() {
    openUnitSelect(restockUnitRef.current);
  }

  function openAdjustUnitSelect() {
    openUnitSelect(adjustUnitRef.current);
  }

  function parseAdjustEntered(raw: string): number | null {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) return null;
    return n;
  }

  function adjustNeedsUnitPick(): boolean {
    const item = panelItemRef.current;
    if (!item) return false;
    if (adjustUnitIdRef.current.trim()) return false;
    if (parseAdjustEntered(adjustDeltaRef.current) == null) return false;
    return restockUnitsFor(item).length > 0;
  }

  function finishAdjustQty() {
    if (!adjustNeedsUnitPick()) return;
    openAdjustUnitSelect();
  }

  function onRestockQtyKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!panelItem) return;
    const units = restockUnitsFor(panelItem);
    if (units.length === 0) return;
    if (restockUnitId.trim()) return;
    openRestockUnitSelect();
  }

  function onAdjustQtyKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    finishAdjustQty();
  }

  function onAdjustQtyBlur(e: ReactFocusEvent<HTMLInputElement>) {
    const next = e.relatedTarget;
    if (next instanceof Node && adjustUnitRef.current?.contains(next)) return;
    if (adjustUnitRef.current != null && next === adjustUnitRef.current) return;
    finishAdjustQty();
  }

  useEffect(() => {
    function isSubmitButton(target: EventTarget | null): boolean {
      return target instanceof Element && target.closest("button[type='submit']") != null;
    }
    function onPointer(ev: PointerEvent) {
      if (!adjustNeedsUnitPick()) return;
      const target = ev.target;
      if (isSubmitButton(target)) return;
      if (target instanceof Node && adjustQtyUnitRowRef.current?.contains(target)) return;
      if (document.activeElement === adjustUnitRef.current) return;
      ev.preventDefault();
      openAdjustUnitSelect();
    }
    function onFocusIn(ev: globalThis.FocusEvent) {
      if (!adjustNeedsUnitPick()) return;
      const target = ev.target;
      if (isSubmitButton(target)) return;
      if (target instanceof Node && adjustQtyUnitRowRef.current?.contains(target)) return;
      openAdjustUnitSelect();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

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
        setPanelMode(null);
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
    setError(null);

    const qty = Number(restockQty);
    const unitKey = restockUnitId.trim();
    const units = restockUnitsFor(panelItem);
    const chosen = unitKey
      ? units.find((u) => u.id.toLowerCase() === unitKey.toLowerCase())
      : undefined;

    setBusy(true);
    try {
      const body: {
        qty: number;
        qty_unit?: string;
        batch_no: string;
        expiry_date: string;
        buy_price_mmk: number;
        sell_price_mmk: number;
      } = {
        qty,
        batch_no: restockBatchNo.trim(),
        expiry_date: restockExpiry.trim(),
        buy_price_mmk: Math.max(0, restockBuy || 0),
        sell_price_mmk: Math.max(0, restockSell || 0),
      };
      if (chosen) body.qty_unit = chosen.id;
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
    setError(null);

    const entered = parseAdjustEntered(adjustDelta);
    if (entered == null) {
      setError(userMessage("Adjustment qty must be non-zero"));
      return;
    }

    const units = restockUnitsFor(panelItem);
    const unitKey = adjustUnitId.trim();
    const chosen = unitKey
      ? units.find((u) => u.id.toLowerCase() === unitKey.toLowerCase())
      : undefined;
    if (units.length > 0 && !chosen) return;

    const factor = chosen?.factor ?? 1;
    const delta = entered * factor;
    if (!delta) {
      setError(userMessage("Adjustment qty must be non-zero"));
      return;
    }

    setBusy(true);
    try {
      const body: {
        qty_delta: number;
        reason: string;
        batch_no?: string;
        expiry_date?: string;
      } = { qty_delta: delta, reason: adjustReason.trim() };
      if (entered > 0) {
        body.batch_no = adjustBatchNo.trim();
        body.expiry_date = adjustExpiry.trim();
      }
      const item = await adjustItem(panelItem.id, body);
      setPanelItem(item);
      setAdjustDelta("");
      setAdjustUnitId("");
      setAdjustBatchNo("");
      setAdjustExpiry("");
      setAdjustReason("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjust failed");
    } finally {
      setBusy(false);
    }
  }

  async function onLabelBatch(batchId: number, batchNo: string, expiry: string) {
    if (!panelItem) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const item = await labelPharmacyBatch(panelItem.id, batchId, {
        batch_no: batchNo.trim(),
        expiry_date: expiry.trim(),
      });
      setPanelItem(item);
      setNotice(t("saved"));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Label failed");
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
            className="btn action"
            disabled={busy || selectedId == null}
            onClick={() => {
              if (selectedId == null) return;
              onEdit(panelItem ?? ({ id: selectedId } as PharmacyItem));
            }}
          >
            <ActionIcon name="edit" />
            {t("edit")}
          </button>
          <button
            type="button"
            className={`btn action${panelMode === "restock" ? " on" : ""}`}
            disabled={busy || selectedId == null}
            onClick={() => selectedId != null && void openRestock(selectedId)}
          >
            <ActionIcon name="box" />
            {t("restock")}
          </button>
          <button
            type="button"
            className={`btn action${panelMode === "view" ? " on" : ""}`}
            disabled={busy || selectedId == null}
            onClick={() => selectedId != null && void openView(selectedId)}
          >
            <ActionIcon name="clipboard" />
            {t("view")}
          </button>
          {onDelete ? (
            <button
              type="button"
              className="btn action danger"
              onClick={onDelete}
              disabled={busy || deleteBusy}
            >
              <ActionIcon name="trash" />
              {t("delete")}
            </button>
          ) : null}
          {panelItem?.active ? (
            <button
              type="button"
              className="btn action danger"
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

            <form className="drug-setup-restock-form" onSubmit={(e) => void onRestock(e)}>
              <div className="drug-setup-panel-form">
                {(() => {
                  const units = restockUnitsFor(panelItem);
                  const chosen = restockUnitId.trim()
                    ? units.find((u) => u.id.toLowerCase() === restockUnitId.trim().toLowerCase())
                    : undefined;
                  const smallest =
                    panelItem.pack_l3_unit || panelItem.stock_unit || "units";
                  return (
                    <>
                      <div className="drug-info-field">
                        <span className="drug-info-label">{t("quantity")}</span>
                        <div className="drug-info-qty-unit">
                          <input
                            className="drug-info-input"
                            type="number"
                            min={0}
                            step={1}
                            value={restockQty}
                            onChange={(e) => setRestockQty(e.target.value)}
                            onKeyDown={onRestockQtyKeyDown}
                            disabled={busy}
                            required
                            aria-label={t("quantity")}
                          />
                          <select
                            ref={restockUnitRef}
                            className="drug-info-input"
                            value={restockUnitId}
                            onChange={(e) => setRestockUnitId(e.target.value)}
                            disabled={busy || units.length === 0}
                            required={Number(restockQty) > 0}
                            aria-label={t("restockUnit")}
                          >
                            <option value="">{t("chooseUnit")}</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="drug-info-field">
                        <span className="drug-info-label">{t("batchNumber")}</span>
                        <input
                          className="drug-info-input"
                          value={restockBatchNo}
                          onChange={(e) => setRestockBatchNo(e.target.value)}
                          disabled={busy}
                        />
                      </div>
                      <div className="drug-info-field">
                        <span className="drug-info-label">{t("expiry")}</span>
                        <DatePicker
                          value={restockExpiry}
                          onChange={setRestockExpiry}
                          disabled={busy}
                        />
                      </div>
                      {chosen && restockQty && Number(restockQty) > 0 ? (
                        <p className="hint">
                          {t("willAdd")} {Number(restockQty) * chosen.factor} {smallest}{" "}
                          {t("toInStock")}
                        </p>
                      ) : null}
                    </>
                  );
                })()}
              </div>
              {restockLevels ? (
                <PharmacyPriceGrid
                  levels={restockLevels}
                  buyOuter={restockBuy}
                  sellSmallest={restockSell}
                  onPrices={(buy, sell) => {
                    setRestockBuy(buy);
                    setRestockSell(sell);
                  }}
                  disabled={busy}
                  unitLabel={unitLabel}
                  syncToken={restockPriceSync}
                />
              ) : null}
              {error ? <p className="form-error">{error}</p> : null}
              <button
                type="submit"
                className="btn primary"
                disabled={busy || !panelItem.active}
              >
                {t("restock")}
              </button>
            </form>

            {isAdmin ? (
              <form className="drug-setup-panel-form" onSubmit={(e) => void onAdjust(e)}>
                <h3 className="drug-setup-title drug-setup-panel-title">{t("adminAdjust")}</h3>
                {(() => {
                  const units = restockUnitsFor(panelItem);
                  const chosen = adjustUnitId.trim()
                    ? units.find((u) => u.id.toLowerCase() === adjustUnitId.trim().toLowerCase())
                    : undefined;
                  const entered = parseAdjustEntered(adjustDelta);
                  const smallest =
                    panelItem.pack_l3_unit || panelItem.stock_unit || "units";
                  return (
                    <>
                      <div className="drug-info-field">
                        <span className="drug-info-label">{t("qtyDelta")}</span>
                        <div className="drug-info-qty-unit" ref={adjustQtyUnitRowRef}>
                          <input
                            className="drug-info-input"
                            type="number"
                            step={1}
                            value={adjustDelta}
                            onChange={(e) => setAdjustDelta(e.target.value)}
                            onKeyDown={onAdjustQtyKeyDown}
                            onBlur={onAdjustQtyBlur}
                            required
                            disabled={busy}
                            aria-label={t("qtyDelta")}
                          />
                          <select
                            ref={adjustUnitRef}
                            className="drug-info-input"
                            value={adjustUnitId}
                            onChange={(e) => setAdjustUnitId(e.target.value)}
                            disabled={busy || units.length === 0}
                            required={units.length > 0}
                            aria-label={t("restockUnit")}
                          >
                            <option value="">{t("chooseUnit")}</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {chosen && entered != null ? (
                          <p className="hint">
                            {entered > 0 ? t("willAdd") : t("willRemove")}{" "}
                            {Math.abs(entered) * chosen.factor} {smallest}{" "}
                            {entered > 0 ? t("toInStock") : t("fromInStock")}
                          </p>
                        ) : null}
                      </div>
                      {entered != null && entered > 0 ? (
                        <>
                          <div className="drug-info-field">
                            <span className="drug-info-label">{t("batchNumber")}</span>
                            <input
                              className="drug-info-input"
                              value={adjustBatchNo}
                              onChange={(e) => setAdjustBatchNo(e.target.value)}
                              disabled={busy}
                            />
                          </div>
                          <div className="drug-info-field">
                            <span className="drug-info-label">{t("expiry")}</span>
                            <DatePicker
                              value={adjustExpiry}
                              onChange={setAdjustExpiry}
                              disabled={busy}
                            />
                          </div>
                        </>
                      ) : null}
                    </>
                  );
                })()}
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
              {(() => {
                const units = restockUnitsFor(panelItem);
                const chosen = restockUnitId.trim()
                  ? units.find((u) => u.id.toLowerCase() === restockUnitId.trim().toLowerCase())
                  : undefined;
                const smallest =
                  panelItem.pack_l3_unit || panelItem.stock_unit || "units";
                return (
                  <>
                    <div className="field-row">
                      <label className="field">
                        <span>{t("quantity")}</span>
                        <div className="drug-info-qty-unit">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={restockQty}
                            onChange={(e) => setRestockQty(e.target.value)}
                            onKeyDown={onRestockQtyKeyDown}
                            disabled={busy}
                            required
                            aria-label={t("quantity")}
                          />
                          <select
                            ref={restockUnitRef}
                            value={restockUnitId}
                            onChange={(e) => setRestockUnitId(e.target.value)}
                            disabled={busy || units.length === 0}
                            required={Number(restockQty) > 0}
                            aria-label={t("restockUnit")}
                          >
                            <option value="">{t("chooseUnit")}</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </label>
                      <label className="field">
                        <span>{t("batchNumber")}</span>
                        <input
                          value={restockBatchNo}
                          onChange={(e) => setRestockBatchNo(e.target.value)}
                          disabled={busy}
                        />
                      </label>
                      <label className="field field-compact">
                        <span>{t("expiry")}</span>
                        <DatePicker
                          value={restockExpiry}
                          onChange={setRestockExpiry}
                          disabled={busy}
                        />
                      </label>
                    </div>
                    {chosen && restockQty && Number(restockQty) > 0 ? (
                      <p className="hint">
                        {t("willAdd")} {Number(restockQty) * chosen.factor} {smallest}{" "}
                        {t("toInStock")}
                      </p>
                    ) : null}
                  </>
                );
              })()}
              {restockLevels ? (
                <PharmacyPriceGrid
                  levels={restockLevels}
                  buyOuter={restockBuy}
                  sellSmallest={restockSell}
                  onPrices={(buy, sell) => {
                    setRestockBuy(buy);
                    setRestockSell(sell);
                  }}
                  disabled={busy}
                  unitLabel={unitLabel}
                  syncToken={restockPriceSync}
                />
              ) : null}
              {error ? <p className="form-error">{error}</p> : null}
              <button
                type="submit"
                className="btn primary"
                disabled={busy || !panelItem.active}
              >
                {t("restock")}
              </button>
            </form>

            {isAdmin ? (
              <form className="nested-form" onSubmit={(e) => void onAdjust(e)}>
                <h3 className="section-title">{t("adminAdjust")}</h3>
                {(() => {
                  const units = restockUnitsFor(panelItem);
                  const chosen = adjustUnitId.trim()
                    ? units.find((u) => u.id.toLowerCase() === adjustUnitId.trim().toLowerCase())
                    : undefined;
                  const entered = parseAdjustEntered(adjustDelta);
                  const smallest =
                    panelItem.pack_l3_unit || panelItem.stock_unit || "units";
                  return (
                    <>
                      <div className="field-row">
                        <label className="field">
                          <span>{t("qtyDelta")}</span>
                          <div className="drug-info-qty-unit" ref={adjustQtyUnitRowRef}>
                            <input
                              type="number"
                              step={1}
                              value={adjustDelta}
                              onChange={(e) => setAdjustDelta(e.target.value)}
                              onKeyDown={onAdjustQtyKeyDown}
                              onBlur={onAdjustQtyBlur}
                              required
                              disabled={busy}
                              aria-label={t("qtyDelta")}
                            />
                            <select
                              ref={adjustUnitRef}
                              value={adjustUnitId}
                              onChange={(e) => setAdjustUnitId(e.target.value)}
                              disabled={busy || units.length === 0}
                              required={units.length > 0}
                              aria-label={t("restockUnit")}
                            >
                              <option value="">{t("chooseUnit")}</option>
                              {units.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {chosen && entered != null ? (
                            <p className="hint">
                              {entered > 0 ? t("willAdd") : t("willRemove")}{" "}
                              {Math.abs(entered) * chosen.factor} {smallest}{" "}
                              {entered > 0 ? t("toInStock") : t("fromInStock")}
                            </p>
                          ) : null}
                        </label>
                        {entered != null && entered > 0 ? (
                          <>
                            <label className="field">
                              <span>{t("batchNumber")}</span>
                              <input
                                value={adjustBatchNo}
                                onChange={(e) => setAdjustBatchNo(e.target.value)}
                                disabled={busy}
                              />
                            </label>
                            <label className="field field-compact">
                              <span>{t("expiry")}</span>
                              <DatePicker
                                value={adjustExpiry}
                                onChange={setAdjustExpiry}
                                disabled={busy}
                              />
                            </label>
                          </>
                        ) : null}
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
                    </>
                  );
                })()}
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
                    {b.location_code === "MAIN" && batchNeedsLabel(b.batch_no, b.expiry_date) ? (
                      <LabelBatchFields
                        batchNo={b.batch_no}
                        expiry={b.expiry_date ?? ""}
                        busy={busy}
                        compact
                        t={t}
                        onSave={(batchNo, expiry) => void onLabelBatch(b.id, batchNo, expiry)}
                      />
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
                  {b.location_code === "MAIN" && batchNeedsLabel(b.batch_no, b.expiry_date) ? (
                    <LabelBatchFields
                      batchNo={b.batch_no}
                      expiry={b.expiry_date ?? ""}
                      busy={busy}
                      t={t}
                      onSave={(batchNo, expiry) => void onLabelBatch(b.id, batchNo, expiry)}
                    />
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

function batchNeedsLabel(batchNo: string, expiry: string | null): boolean {
  return !batchNo.trim() || !expiry;
}

function LabelBatchFields({
  batchNo,
  expiry,
  busy,
  compact = false,
  t,
  onSave,
}: {
  batchNo: string;
  expiry: string;
  busy: boolean;
  compact?: boolean;
  t: (k: string) => string;
  onSave: (batchNo: string, expiry: string) => void;
}) {
  const [no, setNo] = useState(batchNo);
  const [exp, setExp] = useState(expiry);
  return (
    <form
      className={compact ? "drug-setup-send-row" : "btn-row"}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(no, exp);
      }}
    >
      <input
        className={compact ? "drug-info-input" : undefined}
        value={no}
        onChange={(e) => setNo(e.target.value)}
        disabled={busy}
        required
        aria-label={t("batchNumber")}
        placeholder={t("batchNumber")}
      />
      <DatePicker value={exp} onChange={setExp} disabled={busy} required />
      <button type="submit" className="btn ghost" disabled={busy}>
        {t("saveLabel")}
      </button>
    </form>
  );
}
