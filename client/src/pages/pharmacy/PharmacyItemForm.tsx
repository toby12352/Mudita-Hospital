import { FormEvent, Fragment, useMemo, useState } from "react";
import {
  PHARMACY_UNITS,
  createPharmacyItem,
  formatPackLevelsPreview,
  itemPackFromRelations,
  packLevelsFromItemPack,
  packPriceSlots,
  relationsFromItemPack,
  sellOuterFromSmallest,
  updatePharmacyItem,
  type PackRelation,
  type PharmacyItem,
} from "@/features/pharmacy/api";
import { DatePicker } from "@/shared/DatePicker";
import { useI18n } from "@/shared/i18n";
import { FormSection } from "@/shared/FormSection";

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

export function PharmacyItemForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: PharmacyItem | null;
  onSaved: (item: PharmacyItem) => void;
  onCancel: () => void;
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

  const [error, setError] = useState<string | null>(null);
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
  const [expiry, setExpiry] = useState("");
  const [quantity, setQuantity] = useState("");
  const [buyOuter, setBuyOuter] = useState(editing ? String(editing.buy_price_mmk) : "");
  const [sellOuter, setSellOuter] = useState(() => {
    if (!editing) return "";
    const pack = {
      pack_l1_qty: editing.pack_l1_qty,
      pack_l1_unit: editing.pack_l1_unit,
      pack_l2_qty: editing.pack_l2_qty,
      pack_l2_unit: editing.pack_l2_unit,
      pack_l3_qty: editing.pack_l3_qty,
      pack_l3_unit: editing.pack_l3_unit,
    };
    return String(sellOuterFromSmallest(pack, editing.sell_price_mmk));
  });
  const [active, setActive] = useState(editing?.active ?? true);

  function unitLabel(u: string): string {
    const key = UNIT_I18N[u];
    return key ? t(key) : u;
  }

  const packResolved = useMemo(() => {
    const done = completedRelations(relations);
    if (done.length === 0) {
      // One-unit item when the table is blank
      if (relations.every(isBlankRelation) && smallestUnit.trim()) {
        return itemPackFromRelations([], smallestUnit);
      }
      return { error: "incomplete" as const };
    }
    return itemPackFromRelations(done, smallestUnit);
  }, [relations, smallestUnit]);

  const packValid = packResolved && !("error" in packResolved);
  const pack = packValid ? packResolved : null;
  const levels = pack ? packLevelsFromItemPack(pack) : null;
  const packPreview = levels ? formatPackLevelsPreview(levels) : "";
  const doneRels = completedRelations(relations);
  const lastChild =
    doneRels.length > 0 ? doneRels[doneRels.length - 1].child.trim() : "";
  const childMatches = doneRels.length === 0 || lastChild === smallestUnit.trim();

  const priceSlots =
    levels && packValid && childMatches
      ? packPriceSlots(levels, Number(buyOuter) || 0, Number(sellOuter) || 0)
      : [];

  const outerUnit = levels?.units[0] || smallestUnit || "Box";

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
    setError(null);
    if (!pack || !levels || !childMatches) {
      setError(t("packChildMustMatch"));
      return;
    }
    const slots = packPriceSlots(levels, Number(buyOuter) || 0, Number(sellOuter) || 0);
    const sellSmallest = slots.length ? slots[slots.length - 1].sell_mmk : 0;
    const buy = Number(buyOuter) || 0;
    setBusy(true);
    try {
      const body = {
        code: code.trim(),
        name: name.trim(),
        dosage: dosage.trim(),
        category: "Other",
        pack_l1_qty: pack.pack_l1_qty,
        pack_l1_unit: pack.pack_l1_unit,
        pack_l2_qty: pack.pack_l2_qty,
        pack_l2_unit: pack.pack_l2_unit,
        pack_l3_qty: pack.pack_l3_qty,
        pack_l3_unit: pack.pack_l3_unit,
        buy_price_mmk: buy,
        sell_price_mmk: sellSmallest,
        active,
      };
      let saved: PharmacyItem;
      if (editing) {
        saved = await updatePharmacyItem(editing.id, body);
      } else {
        const qty = Number(quantity) || 0;
        saved = await createPharmacyItem({
          ...body,
          initial_qty: qty > 0 ? qty : undefined,
          initial_qty_unit: "purchase",
          expiry_date: expiry.trim() || undefined,
        });
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const canSave =
    !busy &&
    packValid &&
    childMatches &&
    buyOuter.trim() !== "" &&
    sellOuter.trim() !== "";

  const secondIsEmpty = relations.length < 2 || isEmptyTrailingRelation(relations[1]);

  return (
    <form className="card-form" onSubmit={submit}>
      {error ? <p className="form-error">{error}</p> : null}

      <FormSection title={t("identity")} titleId="pharmacy-item-identity">
        <div className="field-row cols-3">
          <label className="field">
            <span>{t("idCode")}</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("idCodePlaceholder")}
              required
              disabled={busy || !!editing}
            />
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
            return (
              <div className="packing-rel-row" role="row" key={index}>
                <select
                  value={parentValue}
                  onChange={(e) => {
                    if (parentLocked) return;
                    updateRelation(index, { parent: e.target.value });
                  }}
                  disabled={busy || parentLocked}
                  aria-label={t("packParent")}
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
                  placeholder="0"
                  disabled={busy}
                  aria-label={t("packPacking")}
                />
                <select
                  value={row.child}
                  onChange={(e) => updateRelation(index, { child: e.target.value })}
                  disabled={busy}
                  aria-label={t("packChildUnit")}
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
        {!childMatches && doneRels.length > 0 ? (
          <p className="form-error">{t("packChildMustMatch")}</p>
        ) : null}

        {!editing ? (
          <label className="field field-compact">
            <span>{t("expiry")}</span>
            <DatePicker
              value={expiry}
              onChange={setExpiry}
              disabled={busy}
              placeholder={t("expiryPlaceholder")}
            />
          </label>
        ) : null}
      </FormSection>

      <FormSection title={t("pricing")} titleId="pharmacy-item-pricing">
        {!editing ? (
          <label className="field field-compact">
            <span>
              {t("quantityOfUnit")} ({unitLabel(outerUnit)})
            </span>
            <input
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={t("quantityBoxesPlaceholder")}
              disabled={busy}
            />
          </label>
        ) : null}

        {priceSlots.length > 0 ? (
          <div className="drug-info-price-grid packing-price-grid" aria-label={t("pricing")}>
            <span />
            <span>{t("purPrice")}</span>
            <span>{t("salePrice")}</span>
            {priceSlots.map((slot, i) => (
              <Fragment key={slot.unit}>
                <span>{unitLabel(slot.unit)}</span>
                {i === 0 ? (
                  <input
                    className="price-buy"
                    type="number"
                    min={0}
                    value={buyOuter}
                    onChange={(e) => setBuyOuter(e.target.value)}
                    placeholder={t("buyPricePlaceholder")}
                    disabled={busy}
                    required
                    aria-label={`${t("purPrice")} ${unitLabel(slot.unit)}`}
                  />
                ) : (
                  <span className="price-buy">{slot.buy_mmk.toLocaleString()}</span>
                )}
                {i === 0 ? (
                  <input
                    className="price-sell"
                    type="number"
                    min={0}
                    value={sellOuter}
                    onChange={(e) => setSellOuter(e.target.value)}
                    placeholder={t("sellPricePlaceholder")}
                    disabled={busy}
                    required
                    aria-label={`${t("salePrice")} ${unitLabel(slot.unit)}`}
                  />
                ) : (
                  <span className="price-sell">{slot.sell_mmk.toLocaleString()}</span>
                )}
              </Fragment>
            ))}
          </div>
        ) : doneRels.length > 0 && !childMatches ? (
          <p className="hint">{t("packChildMustMatch")}</p>
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

      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={!canSave}>
          {editing ? t("save") : t("create")}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
