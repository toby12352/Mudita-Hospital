import type { IpdAdmission } from "@/features/ipd/api";

function yangonDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

export function yangonToday(): string {
  return yangonDate(new Date());
}

/** Shift a `YYYY-MM-DD` civil date by whole days. The calendar math stays in UTC. */
export function yangonAddDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  const nextYear = utc.getUTCFullYear();
  const nextMonth = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(utc.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function yangonYesterday(): string {
  return yangonAddDays(yangonToday(), -1);
}

/** Stored ledger timestamps are UTC `YYYY-MM-DD HH:MM:SS`. */
export function utcStampToYangonDate(stamp: string): string | null {
  const match = stamp.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  const utc = new Date(`${match[1]}T${match[2]}Z`);
  if (Number.isNaN(utc.getTime())) return null;
  const iso = yangonDate(utc);
  return iso || null;
}

/**
 * Yesterday when the stay has any ledger line before today, so the morning
 * sheet is the one being sent. Otherwise today, which stays preview-only.
 */
export function defaultIpdStatementDate(stay: IpdAdmission): string {
  const today = yangonToday();
  for (const line of stay.ledger ?? []) {
    const day = utcStampToYangonDate(line.created_at);
    if (day && day < today) return yangonYesterday();
  }
  return today;
}
