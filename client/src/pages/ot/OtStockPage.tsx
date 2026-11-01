import {
  FormEvent,
  Fragment,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getGuideRun, subscribeGuide } from "@/features/guidance/guideControl";
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
import {
  BillHistoryToolbar,
  type BillHistoryQuery,
  type BillHistoryStatusOption,
} from "@/shared/BillHistoryToolbar";
import { DatePicker } from "@/shared/DatePicker";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { sortByDateAscDesc } from "@/shared/DateSort";
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

function emptyListQuery(): BillHistoryQuery {
  return { q: "", money: "", category: "", unit: "", from: "", to: "", sort: "desc" };
}

function activeFromMoney(money: string): ActiveFilterValue {
  if (money === "active") return "active";
  if (money === "inactive") return "inactive";
  return "all";
}

export function OtStockPage({
  onBrowseChange,
}: {
  onBrowseChange?: (browsing: boolean) => void;
} = {}) {
  const { t } = useI18n();
  const { otCreate, otUpdate } = useClinicActions();
  const [batches, setBatches] = useState<OtStockBatch[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listQuery, setListQuery] = useState<BillHistoryQuery>(emptyListQuery);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const returnListFocusIdRef = useRef<number | null>(null);
  const [guideLessonId, setGuideLessonId] = useState<string | null>(
    () => getGuideRun()?.lessonId ?? null,
  );
  const [guideStepIndex, setGuideStepIndexState] = useState(
    () => getGuideRun()?.stepIndex ?? 0,
  );

  const items = useMemo(() => groupBatches(batches), [batches]);
  const showList = selectedId == null;
  const showDetail = selectedId != null;

  const statusOptions = useMemo((): BillHistoryStatusOption[] => {
    return [
      { value: "", label: t("all") },
      { value: "active", label: t("active") },
      { value: "inactive", label: t("notActive") },
    ];
  }, [t]);

  const filtered = useMemo(() => {
    const q = listQuery.q.trim().toLowerCase();
    const status = activeFromMoney(listQuery.money);
    const matched = items.filter((it) => {
      if (!matchesActive(it.active, status)) return false;
      if (!q) return true;
      return (
        it.item_code.toLowerCase().includes(q) || it.item_name.toLowerCase().includes(q)
      );
    });
    return sortByDateAscDesc(matched, listQuery.sort, (it) => it.created_at, (it) => it.item_id);
  }, [items, listQuery.q, listQuery.money, listQuery.sort]);

  const selected = items.find((it) => it.item_id === selectedId) ?? null;

  useEffect(() => {
    onBrowseChange?.(showList);
  }, [showList, onBrowseChange]);

  useEffect(() => {
    return subscribeGuide(() => {
      const run = getGuideRun();
      setGuideLessonId(run?.lessonId ?? null);
      setGuideStepIndexState(run?.stepIndex ?? 0);
    });
  }, []);

  function rememberOpener() {
    const el = document.activeElement;
    openerRef.current = el instanceof HTMLElement ? el : null;
  }

  function restoreOpener() {
    const prev = openerRef.current;
    openerRef.current = null;
    if (prev && document.contains(prev)) {
      window.requestAnimationFrame(() => prev.focus());
    }
  }

  async function reload(preferItemId?: number | null) {
    setListLoading(true);
    try {
      const data = await listOtStock();
      setBatches(data);
      const grouped = groupBatches(data);
      const keepId = preferItemId ?? selectedId;
      if (keepId != null && grouped.some((it) => it.item_id === keepId)) {
        setSelectedId(keepId);
        return;
      }
      if (selectedId != null) setSelectedId(null);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listOtStock();
        if (cancelled) return;
        setBatches(data);
        setListLoading(false);
      } catch (e) {
        if (!cancelled) {
          setListLoading(false);
          setError(e instanceof Error ? e.message : "Load failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (guideLessonId !== "ot-cupboard") return;
    // Cupboard step stays on the list; return step needs the record page.
    if (guideStepIndex < 1) {
      if (selectedId != null) {
        setSelectedId(null);
        setError(null);
        setNotice(null);
      }
      return;
    }
    if (selectedId != null) return;
    if (filtered.length === 0) return;
    selectItem(filtered[0].item_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- guide sync list/detail with step
  }, [guideLessonId, guideStepIndex, filtered, selectedId]);

  useEffect(() => {
    if (!showDetail) return;
    window.requestAnimationFrame(() => detailTitleRef.current?.focus());
  }, [showDetail, selectedId]);

  useEffect(() => {
    if (!showList) return;
    const id = returnListFocusIdRef.current;
    if (id == null) return;
    returnListFocusIdRef.current = null;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-item-row="${id}"]`)?.focus();
    });
  }, [showList, filtered]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".alert-dialog-overlay, .print-preview-overlay")) return;
      if (selectedId != null) {
        e.preventDefault();
        backToList();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Escape wiring
  }, [selectedId]);

  function runListSearch(query: BillHistoryQuery) {
    setListQuery(query);
  }

  function selectItem(id: number) {
    rememberOpener();
    setSelectedId(id);
    setError(null);
    setNotice(null);
  }

  function backToList() {
    returnListFocusIdRef.current = selectedId;
    openerRef.current = null;
    setSelectedId(null);
    setError(null);
    setNotice(null);
    restoreOpener();
  }

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
    <section className="opd-bill-desk opd-bill-desk--history" aria-label={t("otStockInventory")}>
      <div className="opd-bill-desk-main">
        {showList ? (
          <>
            <h2 className="opd-bill-desk-title">{t("otStockInventory")}</h2>
            <p className="hint">{t("otStockHint")}</p>
            <BillHistoryToolbar
              key="ot-stock"
              searchPlaceholder={t("idCodeOrName")}
              initialRange="all"
              statusOptions={statusOptions}
              statusFieldLabel={t("status")}
              explicitSearch
              hideDateRange
              onSearch={runListSearch}
              onInvalidRange={() => setError(t("billHistoryInvalidRange"))}
            />
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div
              className="bill-history-table-wrap"
              role="region"
              aria-label={t("cupboardItems")}
              data-guide="ot-cupboard"
            >
              <div
                className="bill-history-table-head bill-history-table-head--ot-stock"
                role="row"
              >
                <span className="bill-history-col bill-history-col--no" role="columnheader">
                  {t("listNo")}
                </span>
                <span className="bill-history-col" role="columnheader">
                  {t("code")}
                </span>
                <span className="bill-history-col bill-history-col--name" role="columnheader">
                  {t("drugNameTrade")}
                </span>
                <span className="bill-history-col" role="columnheader">
                  {t("otOnHand")}
                </span>
              </div>
              {listLoading ? <p className="hint bill-history-table-msg">{t("loading")}</p> : null}
              {!listLoading && filtered.length === 0 ? (
                <p className="hint bill-history-table-msg empty-row">{t("noOtStock")}</p>
              ) : null}
              <ul className="bill-history-table-body">
                {filtered.map((item, index) => {
                  const qtyText = `${item.ot_on_hand.toLocaleString()}${
                    item.stock_unit ? ` ${item.stock_unit}` : ""
                  }`;
                  const nameLabel = item.active
                    ? item.item_name
                    : `${item.item_name} ${t("inactive")}`;
                  return (
                    <li key={item.item_id}>
                      <div
                        role="button"
                        tabIndex={0}
                        data-item-row={item.item_id}
                        aria-label={`${item.item_code} · ${nameLabel}`}
                        className={`bill-history-table-row bill-history-table-row--ot-stock bill-history-table-row--clickable${
                          !item.active ? " inactive" : ""
                        }`}
                        onClick={() => selectItem(item.item_id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectItem(item.item_id);
                          }
                        }}
                      >
                        <span className="bill-history-col bill-history-col--no">{index + 1}</span>
                        <span className="bill-history-col" title={item.item_code}>
                          {item.item_code}
                        </span>
                        <span
                          className="bill-history-col bill-history-col--name"
                          title={nameLabel}
                        >
                          <span className="bill-history-name-primary">{item.item_name}</span>
                          {!item.active ? (
                            <span className="bill-history-name-detail">{t("inactive")}</span>
                          ) : null}
                        </span>
                        <span className="bill-history-col" title={qtyText}>
                          {qtyText}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : null}

        {showDetail && selected ? (
          <div className="catalog-master-detail-page">
            <div className="patient-chart-title-row">
              <div className="patient-chart-title-block">
                <h2 ref={detailTitleRef} tabIndex={-1} className="opd-bill-desk-title">
                  {selected.item_name}
                </h2>
                <p className="patient-chart-sub">
                  {[
                    selected.item_code,
                    formatPackCompact(packFromItem(selected)) || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <DialogCloseButton onClick={backToList} />
            </div>
            {notice ? <p className="form-ok">{notice}</p> : null}
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
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
          </div>
        ) : null}
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
      <button type="submit" className="btn action" disabled={busy} data-guide="ot-return-pharmacy">
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
