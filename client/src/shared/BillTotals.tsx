import { useEffect, type ReactNode } from "react";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import {
  clampDiscountInput,
  discountKyats,
  type DiscountUnit,
} from "@/shared/discount";

type Props = {
  total: number;
  paid: number;
  balance: number;
  discountValue: string;
  discountUnit: DiscountUnit;
  editable: boolean;
  onDiscountValue: (value: string) => void;
  onDiscountUnit: (unit: DiscountUnit) => void;
  note?: ReactNode;
};

export function BillTotals({
  total,
  paid,
  balance,
  discountValue,
  discountUnit,
  editable,
  onDiscountValue,
  onDiscountUnit,
  note,
}: Props) {
  const { t } = useI18n();
  const off = discountKyats(total, discountValue, discountUnit);

  useEffect(() => {
    const next = clampDiscountInput(discountValue, discountUnit, total);
    if (next !== discountValue) onDiscountValue(next);
  }, [discountValue, discountUnit, total, onDiscountValue]);

  function setUnit(unit: DiscountUnit) {
    onDiscountUnit(unit);
    onDiscountValue(clampDiscountInput(discountValue, unit, total));
  }

  return (
    <div className="opd-bill-totals">
      <div className="opd-bill-total-row">
        <span>{t("totalLabel")}</span>
        <span>{formatMMK(total)}</span>
      </div>
      <div className="opd-bill-total-row opd-bill-total-row--discount">
        <span>{t("discount")}</span>
        <span className="opd-bill-discount-controls">
          <input
            className="opd-bill-discount-input"
            inputMode="numeric"
            aria-label={t("discount")}
            value={discountValue}
            disabled={!editable}
            onChange={(e) =>
              onDiscountValue(clampDiscountInput(e.target.value, discountUnit, total))
            }
          />
          <select
            className="opd-bill-discount-unit"
            aria-label={t("discountUnit")}
            value={discountUnit}
            disabled={!editable}
            onChange={(e) => setUnit(e.target.value === "mmk" ? "mmk" : "percent")}
          >
            <option value="percent" title={t("percent")}>
              %
            </option>
            <option value="mmk">{t("mmk")}</option>
          </select>
        </span>
        <span className="opd-bill-discount-amount">{formatMMK(off)}</span>
      </div>
      <div className="opd-bill-total-row">
        <span>{t("paid")}</span>
        <span>{formatMMK(paid)}</span>
      </div>
      <div className="opd-bill-total-row opd-bill-total-row--balance">
        <span>{t("balance")}</span>
        <span>{formatMMK(balance)}</span>
      </div>
      {note}
    </div>
  );
}
