import { FormEvent, useState } from "react";
import {
  PACK_L2_UNITS,
  PACK_L3_UNITS,
  createPharmacyItem,
  defaultItemPack,
  formatPackPreview,
  packFromItem,
  updatePharmacyItem,
  type PharmacyItem,
} from "@/features/pharmacy/api";
import { DatePicker } from "@/shared/DatePicker";
import { useI18n } from "@/shared/i18n";
import { FormSection } from "@/shared/FormSection";

export function PharmacyItemForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: PharmacyItem | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const initialPack = editing ? packFromItem(editing) : defaultItemPack();
  const packL1Unit = editing?.pack_l1_unit || "Box";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(editing?.code ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [dosage, setDosage] = useState(editing?.dosage ?? "");
  const [packL2Qty, setPackL2Qty] = useState(
    editing ? String(initialPack.pack_l2_qty) : "",
  );
  const [packL2Unit, setPackL2Unit] = useState(initialPack.pack_l2_unit);
  const [packL3Qty, setPackL3Qty] = useState(
    editing ? String(initialPack.pack_l3_qty) : "",
  );
  const [packL3Unit, setPackL3Unit] = useState(initialPack.pack_l3_unit);
  const [expiry, setExpiry] = useState("");
  const [quantity, setQuantity] = useState("");
  const [buy, setBuy] = useState(editing ? String(editing.buy_price_mmk) : "");
  const [sell, setSell] = useState(editing ? String(editing.sell_price_mmk) : "");

  const packPreview = formatPackPreview({
    pack_l1_qty: 1,
    pack_l1_unit: packL1Unit,
    pack_l2_qty: Math.max(1, Number(packL2Qty) || 1),
    pack_l2_unit: packL2Unit,
    pack_l3_qty: Math.max(1, Number(packL3Qty) || 1),
    pack_l3_unit: packL3Unit,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = {
        code: code.trim(),
        name: name.trim(),
        dosage: dosage.trim(),
        category: "Other",
        pack_l1_qty: 1,
        pack_l1_unit: packL1Unit,
        pack_l2_qty: Math.max(1, Number(packL2Qty) || 1),
        pack_l2_unit: packL2Unit,
        pack_l3_qty: Math.max(1, Number(packL3Qty) || 1),
        pack_l3_unit: packL3Unit,
        buy_price_mmk: Number(buy) || 0,
        sell_price_mmk: Number(sell) || 0,
      };
      if (editing) {
        await updatePharmacyItem(editing.id, { ...body, active: true });
      } else {
        const qty = Number(quantity) || 0;
        await createPharmacyItem({
          ...body,
          initial_qty: qty > 0 ? qty : undefined,
          initial_qty_unit: "purchase",
          expiry_date: expiry.trim() || undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

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

      <FormSection title={t("package")} titleId="pharmacy-item-package">
        <div className="field-row pack-size-row">
          <div className="field pack-size-group">
            <span>{t("packUnitStrip")}</span>
            <div className="pack-size-controls">
              <input
                type="number"
                min={1}
                value={packL2Qty}
                onChange={(e) => setPackL2Qty(e.target.value)}
                placeholder={t("packQtyPlaceholder")}
                disabled={busy}
                required
                aria-label={t("packUnitStrip")}
              />
              <select
                value={packL2Unit}
                onChange={(e) => setPackL2Unit(e.target.value)}
                disabled={busy}
                aria-label={t("unit")}
              >
                {PACK_L2_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u === "Strip" ? t("packUnitStrip") : t("packUnitCard")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <span className="pack-star" aria-hidden="true">
            x
          </span>
          <div className="field pack-size-group">
            <span>{t("packUnitTablet")}</span>
            <div className="pack-size-controls">
              <input
                type="number"
                min={1}
                value={packL3Qty}
                onChange={(e) => setPackL3Qty(e.target.value)}
                placeholder={t("packQtyPlaceholder")}
                disabled={busy}
                required
                aria-label={t("packUnitTablet")}
              />
              <select
                value={packL3Unit}
                onChange={(e) => setPackL3Unit(e.target.value)}
                disabled={busy}
                aria-label={t("unit")}
              >
                {PACK_L3_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u === "Tablet"
                      ? t("packUnitTablet")
                      : u === "Capsule"
                        ? t("packUnitCapsule")
                        : t("packUnitMl")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <p className="hint">{packPreview}</p>
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

      <FormSection title={t("quantityAndPrice")} titleId="pharmacy-item-qty-price">
        <div className="field-row cols-3">
          {!editing ? (
            <label className="field">
              <span>{t("quantityBoxes")}</span>
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
          <label className="field">
            <span>{t("buyPricePerBox")}</span>
            <input
              type="number"
              min={0}
              value={buy}
              onChange={(e) => setBuy(e.target.value)}
              placeholder={t("buyPricePlaceholder")}
              disabled={busy}
              required
            />
          </label>
          <label className="field">
            <span>{t("sellPricePerTablet")}</span>
            <input
              type="number"
              min={0}
              value={sell}
              onChange={(e) => setSell(e.target.value)}
              placeholder={t("sellPricePlaceholder")}
              disabled={busy}
              required
            />
          </label>
        </div>
      </FormSection>

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
