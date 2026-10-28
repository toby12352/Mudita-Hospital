import {
  FormEvent,
  Fragment,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { labelOtBatch, listOtStock, returnOtStock, type OtStockBatch } from "@/features/ot/api";
import {
  formatPackCompact,
  packFromItem,
  packLevelsFromItemPack,
  packPriceSlots,
  saleUnitsFromPack,
  sellOuterFromSmallest,
  type ItemPack,
} from "@/features/pharmacy/api";
import { useClinicActions } from "@/app/clinicActions";
import { ActionIcon } from "@/shared/ActionIcon";
import { matchesActive, type ActiveFilterValue } from "@/shared/ActiveFilter";
import { CatalogFilterButton, CatalogFilterPanel } from "@/shared/CatalogListFilter";
import { DatePicker } from "@/shared/DatePicker";
import { sortByDateAscDesc, type DateSortValue } from "@/shared/DateSort";
import { useI18n } from "@/shared/i18n";

type CupboardItem = {
  item_id: number;
  item_code: string;
  item_name: string;
  stock_unit: string;
  dosage: string;
  buy_price_mmk: number;
  sell_price_mmk: number;
  pack_l1_qty: number;
  pack_l1_unit: string;
  pack_l2_qty: number;
  pack_l2_unit: string;
  pack_l3_qty: number;
  pack_l3_unit: string;
  pack_l4_qty: number;
  pack_l4_unit: string;
  pack_l5_qty: number;
  pack_l5_unit: string;
  pack_l6_qty: number;
  pack_l6_unit: string;
  active: boolean;
  created_at: string;
  ot_on_hand: number;
  batches: OtStockBatch[];
};

function groupBatches(batches: OtStockBatch[]): CupboardItem[] {
  const byId = new Map<number, CupboardItem>();
  for (const b of batches) {
    const existing = byId.get(b.item_id);
    if (existing) {
      existing.ot_on_hand += b.qty;
      existing.batches.push(b);
      continue;
    }
    byId.set(b.item_id, {
      item_id: b.item_id,
      item_code: b.item_code,
      item_name: b.item_name,
      stock_unit: b.stock_unit,
      dosage: b.dosage ?? "",
      buy_price_mmk: b.buy_price_mmk ?? 0,
      sell_price_mmk: b.sell_price_mmk ?? 0,
      pack_l1_qty: b.pack_l1_qty ?? 1,
      pack_l1_unit: b.pack_l1_unit || "Box",
      pack_l2_qty: b.pack_l2_qty ?? 1,
      pack_l2_unit: b.pack_l2_unit || "Strip",
      pack_l3_qty: b.pack_l3_qty ?? 1,
      pack_l3_unit: b.pack_l3_unit || "Tablet",
      pack_l4_qty: b.pack_l4_qty ?? 1,
      pack_l4_unit: b.pack_l4_unit || b.pack_l3_unit || "Tablet",
      pack_l5_qty: b.pack_l5_qty ?? 1,
      pack_l5_unit: b.pack_l5_unit || b.pack_l3_unit || "Tablet",
      pack_l6_qty: b.pack_l6_qty ?? 1,
      pack_l6_unit: b.pack_l6_unit || b.pack_l3_unit || "Tablet",
      active: b.active !== false,
      created_at: b.created_at ?? "",
      ot_on_hand: b.qty,
      batches: [b],
    });
  }
  return Array.from(byId.values());
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

export function OtStockPage() {
  const { t } = useI18n();
  const { otCreate, otUpdate } = useClinicActions();
  const [batches, setBatches] = useState<OtStockBatch[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPanelId = useId();
  const [filterQ, setFilterQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilterValue>("all");
  const [dateSort, setDateSort] = useState<DateSortValue>("desc");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => groupBatches(batches), [batches]);

  const filtered = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    const matched = items.filter((it) => {
      if (!matchesActive(it.active, activeFilter)) return false;
      if (!q) return true;
      return (
        it.item_code.toLowerCase().includes(q) || it.item_name.toLowerCase().includes(q)
      );
    });
    return sortByDateAscDesc(matched, dateSort, (it) => it.created_at, (it) => it.item_id);
  }, [items, filterQ, activeFilter, dateSort]);

  const activeId =
    filtered.length === 0
      ? null
      : filtered.some((it) => it.item_id === selectedId)
        ? selectedId
        : filtered[0].item_id;
  const selected = filtered.find((it) => it.item_id === activeId) ?? null;

  function resetFilters() {
    setFilterQ("");
    setActiveFilter("all");
    setDateSort("desc");
  }

  async function reload(preferItemId?: number | null) {
    const data = await listOtStock();
    setBatches(data);
    const grouped = groupBatches(data);
    const keepId = preferItemId ?? selectedId;
    if (keepId != null && grouped.some((it) => it.item_id === keepId)) {
      setSelectedId(keepId);
      return;
    }
    setSelectedId(grouped[0]?.item_id ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listOtStock();
        if (cancelled) return;
        setBatches(data);
        const grouped = groupBatches(data);
        setSelectedId(grouped[0]?.item_id ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeId !== selectedId) setSelectedId(activeId);
  }, [activeId, selectedId]);

  async function onLabel(e: FormEvent, batch: OtStockBatch, batchNo: string, expiry: string) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await labelOtBatch(batch.id, { batch_no: batchNo.trim(), expiry_date: expiry.trim() });
      setNotice(t("saved"));
      await reload(batch.item_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Label failed");
    } finally {
      setBusy(false);
    }
  }

  async function onReturn(
    e: FormEvent,
    batch: OtStockBatch,
    enteredQty: string,
    unitId: string,
    pack: ItemPack,
  ): Promise<"ok" | "need-unit" | "error"> {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const entered = Number(enteredQty);
    if (!entered || entered <= 0) {
      setError(t("qtyMustBePositive"));
      return "error";
    }

    const units = saleUnitsFromPack(pack, selected?.sell_price_mmk ?? 0);
    const unitKey = unitId.trim();
    const chosen = unitKey
      ? units.find((u) => u.id.toLowerCase() === unitKey.toLowerCase())
      : undefined;
    if (units.length > 0 && !chosen) return "need-unit";

    const qty = entered * (chosen?.factor ?? 1);
    if (qty > batch.qty) {
      setError(t("qtyExceedsOt"));
      return "error";
    }

    setBusy(true);
    try {
      const result = await returnOtStock(batch.id, qty);
      setNotice(
        `${t("returnedToPharmacy")}: ${result.qty.toLocaleString()}. ${t("otOnHand")} ${result.ot_qty.toLocaleString()}. ${t("inStock")} ${result.pharmacy_qty.toLocaleString()}.`,
      );
      await reload(batch.item_id);
      return "ok";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Return failed");
      return "error";
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="drug-setup" aria-label={t("maintenanceInventory")}>
      <div className="drug-setup-list-pane">
        <div className="drug-setup-title-row">
          <h2 className="drug-setup-title">{t("maintenanceInventory")}</h2>
        </div>
        <p className="hint">{t("otStockHint")}</p>
        <div className="drug-setup-filter">
          <input
            className="drug-info-input"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            placeholder={t("idCodeOrName")}
            aria-label={t("search")}
          />
          <CatalogFilterButton
            open={filterOpen}
            controlsId={filterPanelId}
            onToggle={() => setFilterOpen((v) => !v)}
          />
        </div>
        <CatalogFilterPanel
          id={filterPanelId}
          open={filterOpen}
          query={filterQ}
          onQueryChange={setFilterQ}
          queryPlaceholder={t("idCodeOrName")}
          searchLabel={t("searchItems")}
          onSearch={() => setFilterOpen(false)}
          active={activeFilter}
          onActiveChange={setActiveFilter}
          dateSort={dateSort}
          onDateSortChange={setDateSort}
          onReset={resetFilters}
        />
        {error && !selected ? <p className="form-error">{error}</p> : null}
        <div className="drug-setup-table" role="listbox" aria-label={t("cupboardItems")}>
          <div className="drug-setup-table-head ot-cupboard-cols">
            <span title={t("code")}>{t("code")}</span>
            <span title={t("drugNameTrade")}>{t("drugNameTrade")}</span>
            <span title={t("qty")}>{t("qty")}</span>
          </div>
          {filtered.length === 0 ? <p className="empty-row">{t("noOtStock")}</p> : null}
          {filtered.map((item) => {
            const qtyText = `${item.ot_on_hand.toLocaleString()}${
              item.stock_unit ? ` ${item.stock_unit}` : ""
            }`;
            return (
              <div
                key={item.item_id}
                role="option"
                tabIndex={0}
                aria-selected={item.item_id === activeId}
                className={`drug-setup-table-row ot-cupboard-cols${
                  item.item_id === activeId ? " selected" : ""
                }`}
                onClick={() => setSelectedId(item.item_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(item.item_id);
                  }
                }}
              >
                <span title={item.item_code}>{item.item_code}</span>
                <span title={item.item_name}>{item.item_name}</span>
                <span title={qtyText}>{qtyText}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="drug-setup-detail-pane">
        <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
          {t("drugInfo")}
        </h3>
        {notice ? <p className="form-ok">{notice}</p> : null}
        {error && selected ? <p className="form-error">{error}</p> : null}
        {selected ? (
          <>
            <div className="drug-info-fields">
              <div className="drug-info-field">
                <span className="drug-info-label">{t("brandName")}</span>
                <span className="drug-info-input">{selected.item_name}</span>
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("dosage")}</span>
                <span className="drug-info-input">{selected.dosage.trim() || "—"}</span>
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("packingSize")}</span>
                <span className="drug-info-input">
                  {formatPackCompact(packFromItem(selected))}
                </span>
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("otOnHand")}</span>
                <span className="drug-info-input">
                  {selected.ot_on_hand.toLocaleString()}
                  {selected.stock_unit ? ` ${selected.stock_unit}` : ""}
                </span>
              </div>
            </div>
            {(() => {
              const pack = packFromItem(selected);
              const levels = packLevelsFromItemPack(pack);
              const slots = packPriceSlots(
                levels,
                selected.buy_price_mmk,
                sellOuterFromSmallest(pack, selected.sell_price_mmk),
              );
              return (
                <div className="drug-info-price-grid" aria-label={t("pricing")}>
                  <span />
                  <span>{t("purPrice")}</span>
                  <span>{t("salePrice")}</span>
                  {slots.map((slot) => (
                    <Fragment key={slot.unit}>
                      <span>{slot.unit}</span>
                      <span className="price-buy">{slot.buy_mmk.toLocaleString()}</span>
                      <span className="price-sell">{slot.sell_mmk.toLocaleString()}</span>
                    </Fragment>
                  ))}
                </div>
              );
            })()}

            <div className="ot-cupboard-batches" role="list" aria-label={t("batch")}>
              <div className="drug-setup-batch-head ot-cupboard-batch-head">
                <span>{t("batchNumber")}</span>
                <span>{t("qty")}</span>
                <span>{t("expiry")}</span>
                <span>{t("returnToPharmacy")}</span>
              </div>
              {selected.batches.map((batch) => (
                <div key={batch.id} className="ot-cupboard-batch-block" role="listitem">
                  <div className="drug-setup-batch-row ot-cupboard-batch-row">
                    <span>{batch.batch_no.trim() || t("none")}</span>
                    <span>{batch.qty.toLocaleString()}</span>
                    <span>{batch.expiry_date || t("none")}</span>
                    {otCreate ? (
                      <OtReturnFields
                        pack={packFromItem(selected)}
                        sellPrice={selected.sell_price_mmk}
                        busy={busy}
                        t={t}
                        onReturn={(ev, qty, unitId) =>
                          onReturn(ev, batch, qty, unitId, packFromItem(selected))
                        }
                      />
                    ) : (
                      <span />
                    )}
                  </div>
                  {otUpdate && (!batch.batch_no.trim() || !batch.expiry_date) ? (
                    <OtLabelFields
                      batchNo={batch.batch_no}
                      expiry={batch.expiry_date ?? ""}
                      busy={busy}
                      t={t}
                      onSave={(batchNo, expiry, ev) => void onLabel(ev, batch, batchNo, expiry)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="hint">{t("noOtStock")}</p>
        )}
      </div>
    </section>
  );
}

function OtReturnFields({
  pack,
  sellPrice,
  busy,
  t,
  onReturn,
}: {
  pack: ItemPack;
  sellPrice: number;
  busy: boolean;
  t: (k: string) => string;
  onReturn: (
    e: FormEvent,
    qty: string,
    unitId: string,
  ) => Promise<"ok" | "need-unit" | "error">;
}) {
  const [qty, setQty] = useState("");
  const [unitId, setUnitId] = useState("");
  const unitRef = useRef<HTMLSelectElement>(null);
  const qtyUnitRowRef = useRef<HTMLDivElement>(null);
  const units = saleUnitsFromPack(pack, sellPrice || 0);

  function needsUnitPick(): boolean {
    if (unitId.trim()) return false;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return false;
    return units.length > 0;
  }

  function finishQty() {
    if (!needsUnitPick()) return;
    openUnitSelect(unitRef.current);
  }

  function onQtyKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    finishQty();
  }

  function onQtyBlur(e: ReactFocusEvent<HTMLInputElement>) {
    const next = e.relatedTarget;
    if (next instanceof Node && qtyUnitRowRef.current?.contains(next)) return;
    if (unitRef.current != null && next === unitRef.current) return;
    finishQty();
  }

  return (
    <form
      className="ot-stock-return"
      onSubmit={(e) => {
        void (async () => {
          const result = await onReturn(e, qty, unitId);
          if (result === "need-unit") {
            openUnitSelect(unitRef.current);
            return;
          }
          if (result === "ok") {
            setQty("");
            setUnitId("");
          }
        })();
      }}
    >
      <div className="drug-info-qty-unit" ref={qtyUnitRowRef}>
        <input
          className="drug-info-input"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={onQtyKeyDown}
          onBlur={onQtyBlur}
          disabled={busy}
          required
          aria-label={t("qtyToReturn")}
          placeholder={t("qty")}
        />
        <select
          ref={unitRef}
          className="drug-info-input"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          disabled={busy || units.length === 0}
          required={Number(qty) > 0}
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
      <button type="submit" className="btn action" disabled={busy}>
        <ActionIcon name="undo" />
        {t("returnToPharmacy")}
      </button>
    </form>
  );
}

function OtLabelFields({
  batchNo,
  expiry,
  busy,
  t,
  onSave,
}: {
  batchNo: string;
  expiry: string;
  busy: boolean;
  t: (k: string) => string;
  onSave: (batchNo: string, expiry: string, e: FormEvent) => void;
}) {
  const [no, setNo] = useState(batchNo);
  const [exp, setExp] = useState(expiry);
  return (
    <form className="ot-stock-return ot-cupboard-label" onSubmit={(e) => onSave(no, exp, e)}>
      <label className="field field-compact">
        <span>{t("batchNumber")}</span>
        <input value={no} onChange={(e) => setNo(e.target.value)} disabled={busy} required />
      </label>
      <label className="field field-compact">
        <span>{t("expiry")}</span>
        <DatePicker value={exp} onChange={setExp} disabled={busy} required />
      </label>
      <button type="submit" className="btn action" disabled={busy}>
        <ActionIcon name="check" />
        {t("saveLabel")}
      </button>
    </form>
  );
}
