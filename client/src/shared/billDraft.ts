import { discountInt } from "@/shared/discount";

/** True when the desk has anything worth saving as a draft. Defaults (cash, 0%, today) do not count. */
export function draftHasContent(parts: {
  texts?: Array<string | null | undefined>;
  /** True when a choice is set (expense category, gender, linked chart, doctor id). */
  flags?: boolean[];
  lineCount?: number;
  discountValue?: string;
}): boolean {
  if ((parts.lineCount ?? 0) > 0) return true;
  if (parts.flags?.some(Boolean)) return true;
  if (parts.texts?.some((t) => String(t ?? "").trim() !== "")) return true;
  if (parts.discountValue != null && discountInt(parts.discountValue) > 0) return true;
  return false;
}
