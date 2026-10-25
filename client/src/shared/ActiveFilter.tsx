export type ActiveFilterValue = "all" | "active" | "inactive";

export function matchesActive(active: boolean, filter: ActiveFilterValue): boolean {
  if (filter === "all") return true;
  if (filter === "active") return active;
  return !active;
}
