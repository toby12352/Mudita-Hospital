/** Cash-bill discount. Matches server applyBillDiscount (half-up kyats). */

export type DiscountUnit = "percent" | "mmk";

export function discountInt(raw: string): number {
  const n = Number(raw.replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** Kyats taken off a cart total. Percent is capped at 100. MMK is capped at the total. */
export function discountKyats(gross: number, raw: string, unit: DiscountUnit): number {
  const value = discountInt(raw);
  if (gross <= 0 || value <= 0) return 0;
  if (unit === "percent") {
    const pct = Math.min(100, value);
    return Math.min(gross, Math.floor((gross * pct + 50) / 100));
  }
  return Math.min(gross, value);
}

export function clampDiscountInput(raw: string, unit: DiscountUnit, gross: number): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return "";
  n = Math.floor(n);
  if (unit === "percent" && n > 100) n = 100;
  if (unit === "mmk" && n > gross) n = Math.max(0, Math.floor(gross));
  if (n <= 0) return "";
  return String(n);
}

export function discountWrite(raw: string, unit: DiscountUnit): {
  discount_value: number;
  discount_unit: DiscountUnit;
} {
  return { discount_value: discountInt(raw), discount_unit: unit };
}

export function discountFieldsFromBill(
  value?: number | null,
  unit?: string | null,
): { value: string; unit: DiscountUnit } {
  return {
    value: value && value > 0 ? String(value) : "",
    unit: unit === "mmk" ? "mmk" : "percent",
  };
}
