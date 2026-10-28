import {
  type FocusEvent as ReactFocusEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PHARMACY_UNITS,
  createPharmacyItem,
  formatPackLevelsPreview,
  itemPackFromRelations,
  packLevelsFromItemPack,
  relationsFromItemPack,
  saleUnitsFromPack,
  updatePharmacyItem,
  type PackRelation,
  type PharmacyItem,
  type SaleUnit,
} from "@/features/pharmacy/api";
import { DatePicker } from "@/shared/DatePicker";
import { fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { useI18n } from "@/shared/i18n";
import { FormSection } from "@/shared/FormSection";
import { PharmacyItemLots } from "./PharmacyItemLots";
import { PharmacyPriceGrid } from "./PharmacyPriceGrid";

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
  Sachet: "packUnitSachet",
  Pack: "packUnitPack",
};

function emptyRelation(parent = ""): PackRelation {
  return { parent, packing: 0, child: "" };
}

function completedRelations(rows: PackRelation[]): PackRelation[] {
  return rows.filter((r) => r.parent.trim() && r.child.trim() && r.packing >= 1);
}

function isBlankRelation(r: PackRelation | undefined): boolean {
  if (!r) return true;
  return !r.parent.trim() && !r.child.trim() && (!r.packing || r.packing === 0);
}

/** Second row is "empty" when user has not filled packing/child (parent may be auto-locked). */
function isEmptyTrailingRelation(r: PackRelation | undefined): boolean {
  if (!r) return true;
  return !r.child.trim() && (!r.packing || r.packing === 0);
}

function parseInitialQty(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

export function PharmacyItemForm({
  editing,
  onSaved,
  onCancel,
  existingCodes = [],
}: {
  editing: PharmacyItem | null;
  onSaved: (item: PharmacyItem) => void;
  onCancel: () => void;
  /** Codes already on the loaded list (may be search-filtered). Fast-path only. */
  existingCodes?: string[];
}) {
  const { t } = useI18n();
  const initial = editing
    ? relationsFromItemPack({
        pack_l1_qty: editing.pack_l1_qty,
        pack_l1_unit: editing.pack_l1_unit,
        pack_l2_qty: editing.pack_l2_qty,
        pack_l2_unit: editing.pack_l2_unit,
        pack_l3_qty: editing.pack_l3_qty,
        pack_l3_unit: editing.pack_l3_unit,
      })
    : { smallest: "Tablet", relations: [] as PackRelation[] };

  const [formError, setFormError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(editing?.code ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [dosage, setDosage] = useState(editing?.dosage ?? "");
  const [smallestUnit, setSmallestUnit] = useState(initial.smallest);
  const [relations, setRelations] = useState<PackRelation[]>(() => {
    if (initial.relations.length === 0) return [emptyRelation()];
    if (initial.relations.length === 1) {
      return [...initial.relations, emptyRelation(initial.relations[0].child)];
    }
    return initial.relations.slice(0, 2);
  });
  const [batchNo, setBatchNo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quantityUnitId, setQuantityUnitId] = useState("");
  const [quantityUnitError, setQuantityUnitError] = useState<string | null>(null);
  const [buyOuter, setBuyOuter] = useState(editing?.buy_price_mmk ?? 0);
  const [sellSmallest, setSellSmallest] = useState(editing?.sell_price_mmk ?? 0);
  const [active, setActive] = useState(editing?.active ?? true);

  const codeInputRef = useRef<HTMLInputElement>(null);
  const codeErrorId = useId();
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const pricesErrorRef = useRef<HTMLParagraphElement>(null);
  const packErrorRef = useRef<HTMLParagraphElement>(null);
  const qtyUnitRef = useRef<HTMLSelectElement>(null);
  const qtyUnitRowRef = useRef<HTMLDivElement>(null);
  const quantityRef = useRef("");
  const quantityUnitIdRef = useRef("");
  const initialUnitsRef = useRef<SaleUnit[]>([]);
  const relationsRef = useRef(relations);
  const packingRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const packingParentRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const packingChildRefs = useRef<(HTMLSelectElement | null)[]>([]);

  quantityRef.current = quantity;
  quantityUnitIdRef.current = quantityUnitId;
  relationsRef.current = relations;

  function unitLabel(u: string): string {
    const key = UNIT_I18N[u];
    return key ? t(key) : u;
  }

  const packResolved = useMemo(() => {
    const done = completedRelations(relations);
    if (done.length === 0) {
      // Edit only: keep saving existing one-unit items with a blank relation table.
      if (editing && relations.every(isBlankRelation) && smallestUnit.trim()) {
        return itemPackFromRelations([], smallestUnit);
      }
      return { error: "incomplete" as const };
    }
    return itemPackFromRelations(done, smallestUnit);
  }, [relations, smallestUnit, editing]);

  const packValid = packResolved && !("error" in packResolved);
  const pack = packValid ? packResolved : null;
  const levels = pack ? packLevelsFromItemPack(pack) : null;
  const packPreview = levels ? formatPackLevelsPreview(levels) : "";
  const doneRels = completedRelations(relations);
  const packingRequired = !editing;
  const packingFilled = doneRels.length > 0;
  const lastChild =
    doneRels.length > 0 ? doneRels[doneRels.length - 1].child.trim() : "";
  const childMatches =
    (!packingRequired && doneRels.length === 0) ||
    (doneRels.length > 0 && lastChild === smallestUnit.trim());

  const showPriceGrid = !!(levels && packValid && childMatches);

  const initialUnits = useMemo(() => {
    if (!pack || !childMatches) return [] as SaleUnit[];
    return saleUnitsFromPack(pack, sellSmallest || 0);
  }, [pack, childMatches, sellSmallest]);

  initialUnitsRef.current = initialUnits;

  const chosenInitialUnit = quantityUnitId.trim()
    ? initialUnits.find((u) => u.id.toLowerCase() === quantityUnitId.trim().toLowerCase())
    : undefined;
  const enteredQty = parseInitialQty(quantity);
  const smallestLabel = pack?.pack_l3_unit || smallestUnit || "units";

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

  function openInitialUnitSelect() {
    openUnitSelect(qtyUnitRef.current);
  }

  /** First blank enabled unit on a packing row when packing count is set. */
  function packingUnitTarget(index: number): HTMLSelectElement | null {
    const rows = relationsRef.current;
    const row = rows[index];
    if (!row || (row.packing ?? 0) < 1) return null;
    const parentLocked = index === 1;
    const parentValue = parentLocked ? rows[0]?.child || row.parent : row.parent;
    const parentEl = packingParentRefs.current[index] ?? null;
    const childEl = packingChildRefs.current[index] ?? null;
    if (!parentValue.trim() && parentEl && !parentEl.disabled) return parentEl;
    if (!row.child.trim() && childEl && !childEl.disabled) return childEl;
    return null;
  }

  function firstPackingUnitNeed(): { index: number; el: HTMLSelectElement } | null {
    const rows = relationsRef.current;
    for (let i = 0; i < rows.length; i++) {
      const el = packingUnitTarget(i);
      if (el) return { index: i, el };
    }
    return null;
  }

  function finishPacking(index: number) {
    openUnitSelect(packingUnitTarget(index));
  }

  function onPackingKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    finishPacking(index);
  }

  function onPackingBlur(index: number, e: ReactFocusEvent<HTMLInputElement>) {
    const next = e.relatedTarget;
    const rowEl = packingRowRefs.current[index];
    if (next instanceof Node && rowEl?.contains(next)) return;
    finishPacking(index);
  }

  function initialNeedsUnitPick(): boolean {
    if (quantityUnitIdRef.current.trim()) return false;
    const n = parseInitialQty(quantityRef.current);
    if (n == null || n === 0) return false;
    return initialUnitsRef.current.length > 0;
  }

  function finishInitialQty() {
    if (!initialNeedsUnitPick()) return;
    openInitialUnitSelect();
  }

  function onInitialQtyKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    finishInitialQty();
  }

  function onInitialQtyBlur(e: ReactFocusEvent<HTMLInputElement>) {
    const next = e.relatedTarget;
    if (next instanceof Node && qtyUnitRef.current?.contains(next)) return;
    if (qtyUnitRef.current != null && next === qtyUnitRef.current) return;
    finishInitialQty();
  }

  useEffect(() => {
    function isSubmitButton(target: EventTarget | null): boolean {
      return target instanceof Element && target.closest("button[type='submit']") != null;
    }
    function onPointer(ev: PointerEvent) {
      const packingNeed = firstPackingUnitNeed();
      if (packingNeed) {
        const target = ev.target;
        if (isSubmitButton(target)) return;
        const rowEl = packingRowRefs.current[packingNeed.index];
        if (target instanceof Node && rowEl?.contains(target)) return;
        if (document.activeElement === packingNeed.el) return;
        ev.preventDefault();
        openUnitSelect(packingNeed.el);
        return;
      }
      if (!initialNeedsUnitPick()) return;
      const target = ev.target;
      if (isSubmitButton(target)) return;
      if (target instanceof Node && qtyUnitRowRef.current?.contains(target)) return;
      if (document.activeElement === qtyUnitRef.current) return;
      ev.preventDefault();
      openInitialUnitSelect();
    }
    function onFocusIn(ev: globalThis.FocusEvent) {
      const packingNeed = firstPackingUnitNeed();
      if (packingNeed) {
        const target = ev.target;
        if (isSubmitButton(target)) return;
        const rowEl = packingRowRefs.current[packingNeed.index];
        if (target instanceof Node && rowEl?.contains(target)) return;
        openUnitSelect(packingNeed.el);
        return;
      }
      if (!initialNeedsUnitPick()) return;
      const target = ev.target;
      if (isSubmitButton(target)) return;
      if (target instanceof Node && qtyUnitRowRef.current?.contains(target)) return;
      openInitialUnitSelect();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  function updateRelation(index: number, patch: Partial<PackRelation>) {
    setRelations((prev) => {
      let next = [...prev];
      while (next.length <= index) {
        const prevChild = next.length > 0 ? next[next.length - 1].child : "";
        next.push(emptyRelation(prevChild || ""));
      }
      next[index] = { ...next[index], ...patch };
      if (index === 0 && patch.child !== undefined && next.length > 1) {
        next[1] = { ...next[1], parent: patch.child };
      }
      // Keep at most two rows; ensure a trailing empty row when first is complete
      const firstDone =
        next[0]?.parent.trim() && next[0]?.child.trim() && (next[0]?.packing ?? 0) >= 1;
      if (firstDone && next.length === 1) {
        next = [next[0], emptyRelation(next[0].child)];
      }
      return next.slice(0, 2);
    });
  }

  function removeSecondRelation() {
    setRelations((prev) => {
      if (prev.length < 2) return prev;
      return [prev[0], emptyRelation(prev[0].child)];
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setFormError(null);
    setCodeError(null);
    setQuantityError(null);
    setQuantityUnitError(null);

    const trimmedCode = code.trim();
    let codeFailed = false;
    if (!editing && trimmedCode) {
      const taken = existingCodes.some(
        (c) => c.trim().toLowerCase() === trimmedCode.toLowerCase(),
      );
      if (taken) {
        setCodeError(t("errItemCodeExists"));
        codeFailed = true;
      }
    }

    let packingFailed = false;
    if (packingRequired && !packingFilled) {
      packingFailed = true;
    } else if (!pack || !levels || !childMatches) {
      packingFailed = true;
    }

    let pricesFailed = false;
    if (!editing && !packingFailed && (buyOuter <= 0 || sellSmallest <= 0)) {
      pricesFailed = true;
    }

    let stockQty = 0;
    let quantityFailed = false;
    let quantityUnitFailed = false;
    if (!editing && pack && !packingFailed && !codeFailed) {
      const entered = parseInitialQty(quantity);
      if (entered == null) {
        setQuantityError(t("fieldNeedsFilled"));
        quantityFailed = true;
      } else if (entered > 0) {
        const units = saleUnitsFromPack(pack, sellSmallest || 0);
        const unitKey = quantityUnitId.trim();
        if (units.length > 0) {
          if (!unitKey) {
            setQuantityUnitError(t("fieldNeedsFilled"));
            quantityUnitFailed = true;
          } else {
            const chosen = units.find((u) => u.id.toLowerCase() === unitKey.toLowerCase());
            if (!chosen) {
              setQuantityUnitError(t("fieldNeedsFilled"));
              quantityUnitFailed = true;
            } else {
              stockQty = entered * chosen.factor;
            }
          }
        } else {
          stockQty = entered;
        }
      }
    }

    const localFailed =
      codeFailed || packingFailed || pricesFailed || quantityFailed || quantityUnitFailed;
    if (localFailed) {
      window.setTimeout(() => {
        if (codeFailed) {
          revealField(codeInputRef.current);
          return;
        }
        if (packingFailed) {
          revealField(packingRowRefs.current[0] ?? packErrorRef.current);
          return;
        }
        if (quantityFailed) {
          revealField(quantityInputRef.current);
          return;
        }
        if (quantityUnitFailed) {
          revealField(qtyUnitRef.current ?? qtyUnitRowRef.current);
          openInitialUnitSelect();
          return;
        }
        if (pricesFailed) {
          revealField(pricesErrorRef.current);
        }
      }, 0);
      return;
    }

    if (!pack || !levels) return;

    setBusy(true);
    try {
      const body = {
        code: trimmedCode,
        name: name.trim(),
        dosage: dosage.trim(),
        category: "Other",
        pack_l1_qty: pack.pack_l1_qty,
        pack_l1_unit: pack.pack_l1_unit,
        pack_l2_qty: pack.pack_l2_qty,
        pack_l2_unit: pack.pack_l2_unit,
        pack_l3_qty: pack.pack_l3_qty,
        pack_l3_unit: pack.pack_l3_unit,
        buy_price_mmk: Math.max(0, buyOuter || 0),
        sell_price_mmk: Math.max(0, sellSmallest || 0),
        active,
      };
      let saved: PharmacyItem;
      if (editing) {
        saved = await updatePharmacyItem(editing.id, body);
      } else {
        saved = await createPharmacyItem({
          ...body,
          initial_qty: stockQty > 0 ? stockQty : undefined,
          initial_qty_unit: "stock",
          batch_no: stockQty > 0 ? batchNo.trim() : undefined,
          expiry_date: stockQty > 0 ? expiry.trim() : undefined,
        });
      }
      onSaved(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (fieldKeyForApiError(err) === "code") {
        setCodeError(t("errItemCodeExists"));
        window.setTimeout(() => revealField(codeInputRef.current), 0);
      } else {
        setFormError(msg);
        window.setTimeout(() => revealField(formErrorRef.current), 0);
      }
    } finally {
      setBusy(false);
    }
  }

  const packError =
    attempted && packingRequired && !packingFilled
      ? t("packRequired")
      : attempted && !childMatches && doneRels.length > 0
        ? t("packChildMustMatch")
        : null;
  const pricesError =
    attempted &&
    !editing &&
    packingFilled &&
    childMatches &&
    (buyOuter <= 0 || sellSmallest <= 0)
      ? t("pricesRequired")
      : null;
  const packingRowInvalid = attempted && packingRequired && !packingFilled;

  const secondIsEmpty = relations.length < 2 || isEmptyTrailingRelation(relations[1]);

  return (
    <form className="card-form" onSubmit={submit}>
      <FormSection title={t("identity")} titleId="pharmacy-item-identity">
        <div className="field-row cols-3">
          <label className={`field${codeError ? " is-invalid" : ""}`}>
            <span>{t("idCode")}</span>
            <input
              ref={codeInputRef}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError(null);
              }}
              placeholder={t("idCodePlaceholder")}
              required
              disabled={busy || !!editing}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? codeErrorId : undefined}
            />
            <FieldError id={codeErrorId}>{codeError}</FieldError>
          </label>
          <label className="field">
            <span>{t("name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholderMed")}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>{t("dosage")}</span>
            <input
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              placeholder={t("dosagePlaceholder")}
              disabled={busy}
            />
          </label>
        </div>
      </FormSection>

      <FormSection title={t("packingSize")} titleId="pharmacy-item-packing">
        <label className="field field-compact packing-smallest">
          <span>{t("smallestUnit")}</span>
          <select
            value={smallestUnit}
            onChange={(e) => setSmallestUnit(e.target.value)}
            disabled={busy}
          >
            {PHARMACY_UNITS.map((u) => (
              <option key={u} value={u}>
                {unitLabel(u)}
              </option>
            ))}
          </select>
        </label>

        <div className="packing-rel-table" role="table" aria-label={t("packingSize")}>
          <div className="packing-rel-head" role="row">
            <span role="columnheader">{t("packParent")}</span>
            <span role="columnheader">{t("packPacking")}</span>
            <span role="columnheader">{t("packChildUnit")}</span>
            <span role="columnheader" className="packing-rel-actions" />
          </div>
          {relations.map((row, index) => {
            const parentLocked = index === 1;
            const parentValue = parentLocked ? relations[0]?.child || row.parent : row.parent;
            const markFirstRow = packingRowInvalid && index === 0;
            const markChildMismatch =
              attempted &&
              index === doneRels.length - 1 &&
              doneRels.length > 0 &&
              !childMatches;
            return (
              <div
                className="packing-rel-row"
                role="row"
                key={index}
                ref={(el) => {
                  packingRowRefs.current[index] = el;
                }}
              >
                <select
                  ref={(el) => {
                    packingParentRefs.current[index] = el;
                  }}
                  value={parentValue}
                  onChange={(e) => {
                    if (parentLocked) return;
                    updateRelation(index, { parent: e.target.value });
                  }}
                  disabled={busy || parentLocked}
                  aria-label={t("packParent")}
                  aria-invalid={markFirstRow && !parentValue.trim() ? true : undefined}
                >
                  <option value="">—</option>
                  {PHARMACY_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(u)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={row.packing || ""}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    updateRelation(index, { packing: Number.isFinite(n) ? n : 0 });
                  }}
                  onKeyDown={(e) => onPackingKeyDown(index, e)}
                  onBlur={(e) => onPackingBlur(index, e)}
                  placeholder="0"
                  disabled={busy}
                  aria-label={t("packPacking")}
                  aria-invalid={markFirstRow && !(row.packing >= 1) ? true : undefined}
                />
                <select
                  ref={(el) => {
                    packingChildRefs.current[index] = el;
                  }}
                  value={row.child}
                  onChange={(e) => updateRelation(index, { child: e.target.value })}
                  disabled={busy}
                  aria-label={t("packChildUnit")}
                  aria-invalid={
                    markFirstRow && !row.child.trim()
                      ? true
                      : markChildMismatch
                        ? true
                        : undefined
                  }
                >
                  <option value="">—</option>
                  {PHARMACY_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(u)}
                    </option>
                  ))}
                </select>
                <span className="packing-rel-actions">
                  {index === 1 && !secondIsEmpty ? (
                    <button
                      type="button"
                      className="btn ghost danger packing-rel-remove"
                      onClick={removeSecondRelation}
                      disabled={busy}
                      aria-label={t("packRemoveRelation")}
                      title={t("packRemoveRelation")}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>

        {packPreview ? <p className="hint packing-preview">{packPreview}</p> : null}
        {packError ? (
          <p ref={packErrorRef} className="form-error" role="alert">
            {packError}
          </p>
        ) : null}

        {!editing ? (
          <div className="field-row">
            <label className="field">
              <span>{t("batchNumber")}</span>
              <input
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="field field-compact">
              <span>{t("expiry")}</span>
              <DatePicker
                value={expiry}
                onChange={setExpiry}
                disabled={busy}
                placeholder={t("expiryPlaceholder")}
              />
            </label>
          </div>
        ) : (
          <PharmacyItemLots
            batches={editing.batches}
            stockUnit={editing.stock_unit || editing.pack_l3_unit || ""}
            showOnHand
            onHand={editing.stock_main}
          />
        )}
      </FormSection>

      {!editing ? (
        <FormSection title={t("initialStock")} titleId="pharmacy-item-initial-stock">
          <p className="hint">{t("initialStockDesc")}</p>
          <label
            className={`field${quantityError || quantityUnitError ? " is-invalid" : ""}`}
          >
            <span>{t("quantityOfUnit")}</span>
            <div className="drug-info-qty-unit" ref={qtyUnitRowRef}>
              <input
                ref={quantityInputRef}
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setQuantityError(null);
                  setQuantityUnitError(null);
                }}
                onKeyDown={onInitialQtyKeyDown}
                onBlur={onInitialQtyBlur}
                placeholder={t("quantityBoxesPlaceholder")}
                disabled={busy}
                aria-label={t("quantityOfUnit")}
                aria-invalid={quantityError ? true : undefined}
              />
              <select
                ref={qtyUnitRef}
                value={quantityUnitId}
                onChange={(e) => {
                  setQuantityUnitId(e.target.value);
                  setQuantityUnitError(null);
                }}
                disabled={busy || initialUnits.length === 0}
                aria-label={t("restockUnit")}
                aria-invalid={quantityUnitError ? true : undefined}
              >
                <option value="">{t("chooseUnit")}</option>
                {initialUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <FieldError>{quantityError}</FieldError>
            <FieldError>{quantityUnitError}</FieldError>
            {chosenInitialUnit && enteredQty != null && enteredQty > 0 ? (
              <p className="hint">
                {t("willAdd")} {enteredQty * chosenInitialUnit.factor} {smallestLabel}{" "}
                {t("toInStock")}
              </p>
            ) : null}
          </label>
        </FormSection>
      ) : null}

      <FormSection title={t("pricing")} titleId="pharmacy-item-pricing">
        {showPriceGrid && levels ? (
          <PharmacyPriceGrid
            levels={levels}
            buyOuter={buyOuter}
            sellSmallest={sellSmallest}
            onPrices={(buy, sell) => {
              setBuyOuter(buy);
              setSellSmallest(sell);
            }}
            disabled={busy}
            unitLabel={unitLabel}
            required={!editing}
            syncToken={editing?.id ?? "new"}
          />
        ) : attempted && doneRels.length > 0 && !childMatches ? (
          <p className="hint">{t("packChildMustMatch")}</p>
        ) : null}
        {pricesError ? (
          <p ref={pricesErrorRef} className="form-error" role="alert">
            {pricesError}
          </p>
        ) : null}

        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={busy}
          />
          <span>{t("active")}</span>
        </label>
      </FormSection>

      {formError ? (
        <p ref={formErrorRef} className="form-error" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={busy}>
          {editing ? t("save") : t("create")}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
