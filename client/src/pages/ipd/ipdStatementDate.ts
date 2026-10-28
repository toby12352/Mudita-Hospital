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

/** Stored ledger timestamps are UTC `YYYY-MM-DD HH:MM:SS`. */
export function utcStampToYangonDate(stamp: string): string | null {
  const match = stamp.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  const utc = new Date(`${match[1]}T${match[2]}Z`);
  if (Number.isNaN(utc.getTime())) return null;
  const iso = yangonDate(utc);
  return iso || null;
}

/** Today when the stay has a line today, else the latest line date, else admission. */
export function defaultIpdStatementDate(stay: IpdAdmission): string {
  const today = yangonToday();
  let latest = "";
  for (const line of stay.ledger ?? []) {
    const day = utcStampToYangonDate(line.created_at);
    if (!day) continue;
    if (day === today) return today;
    if (day > latest) latest = day;
  }
  if (latest) return latest;
  return utcStampToYangonDate(stay.admitted_at) ?? today;
}
