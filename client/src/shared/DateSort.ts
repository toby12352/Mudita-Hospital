export type DateSortValue = "desc" | "asc";

/** Newest-first vs oldest-first by an ISO/SQLite datetime string (or numeric id fallback). */
export function compareByDateAscDesc(
  aDate: string | null | undefined,
  bDate: string | null | undefined,
  aId: number,
  bId: number,
  sort: DateSortValue,
): number {
  const ta = Date.parse(normalizeDate(aDate)) || 0;
  const tb = Date.parse(normalizeDate(bDate)) || 0;
  if (ta !== tb) {
    return sort === "asc" ? ta - tb : tb - ta;
  }
  return sort === "asc" ? aId - bId : bId - aId;
}

export function sortByDateAscDesc<T>(
  rows: T[],
  sort: DateSortValue,
  getDate: (row: T) => string | null | undefined,
  getId: (row: T) => number,
): T[] {
  return [...rows].sort((a, b) =>
    compareByDateAscDesc(getDate(a), getDate(b), getId(a), getId(b), sort),
  );
}

function normalizeDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
}
