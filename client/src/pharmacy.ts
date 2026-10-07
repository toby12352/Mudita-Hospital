import { apiFetch } from "./api";

export const ITEM_CATEGORIES = [
  "Injection",
  "OPD",
  "OT",
  "Tablet",
  "Syrup",
  "Other",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** User-facing label for stock location codes (API still uses MAIN, etc.). */
export function formatLocationLabel(code: string): string {
  if (code === "MAIN") return "In Stock";
  return code;
}

/** Display item ID/Code with a leading #. */
export function formatItemCode(code: string): string {
  const c = code.trim();
  if (!c) return "—";
  return c.startsWith("#") ? c : `#${c}`;
}

function parseHistoryDate(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const s = Number(m[6] || 0);
    if (m[7]) {
      const iso = t.includes("T") ? t : t.replace(" ", "T");
      const parsed = new Date(iso);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return new Date(y, mo, d, h, mi, s);
  }
  const parsed = new Date(t);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** e.g. Oct 7, 2026 3:30 PM */
export function formatHistoryDateTime(raw: string): string {
  const d = parseHistoryDate(raw);
  if (!d) return raw.trim() || "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function itemWord(qty: number): string {
  return Math.abs(qty) === 1 ? "item" : "items";
}

function damageVerb(reason: string): string | null {
  const r = reason.toLowerCase();
  if (/\bdamaged?\b/.test(r)) return "damaged";
  if (/\bbroken\b/.test(r)) return "broken";
  if (/\bspoil(?:ed)?\b/.test(r)) return "spoiled";
  if (/\bwaste[sd]?\b/.test(r)) return "wasted";
  if (/\blost\b/.test(r)) return "lost";
  if (/\bexpired\b/.test(r)) return "expired";
  return null;
}

/** Human line: "+12: Added 12 items more on Oct 7, 2026 3:30 PM" (reason shown separately). */
export function formatStockHistoryLine(m: {
  movement_type: string;
  qty_delta: number;
  reason: string;
  location_code: string;
  created_at: string;
}): string {
  const n = Math.abs(m.qty_delta);
  const signed = `${m.qty_delta > 0 ? "+" : ""}${m.qty_delta}`;
  const items = itemWord(n);
  const when = formatHistoryDateTime(m.created_at);
  const reason = (m.reason || "").trim();

  let sentence: string;
  switch (m.movement_type) {
    case "PURCHASE":
      sentence = `Added ${n} ${items} more`;
      break;
    case "SALE":
      sentence =
        m.qty_delta > 0
          ? `Returned ${n} ${items} from a voided sale`
          : `Sold ${n} ${items} to patient`;
      break;
    case "ADJUST": {
      const damaged = m.qty_delta < 0 ? damageVerb(reason) : null;
      if (damaged) {
        sentence = `${n} ${items} were ${damaged}`;
      } else if (m.qty_delta > 0) {
        sentence = `Added ${n} ${items} more`;
      } else {
        sentence = `Removed ${n} ${items}`;
      }
      break;
    }
    case "ISSUE":
      sentence =
        m.qty_delta < 0
          ? `Issued ${n} ${items} for OT`
          : `Recorded ${n} ${items} for OT`;
      break;
    case "RETURN":
      sentence =
        m.qty_delta > 0
          ? `Returned ${n} ${items} to stock`
          : `Took ${n} ${items} back from reserved`;
      break;
    case "WASTE":
      sentence = `${n} ${items} were wasted`;
      break;
    case "TRANSFER":
      if (m.location_code === "OT_RESERVED" && m.qty_delta > 0) {
        sentence = `Moved ${n} ${items} to OT reserved`;
      } else if (m.location_code === "OT_FLOOR" && m.qty_delta > 0) {
        sentence = `Moved ${n} ${items} to OT floor`;
      } else if (m.qty_delta < 0) {
        sentence = `Moved ${n} ${items} out of ${formatLocationLabel(m.location_code)}`;
      } else {
        sentence = `Moved ${n} ${items} to ${formatLocationLabel(m.location_code)}`;
      }
      break;
    default:
      sentence = `${m.movement_type}: ${n} ${items}`;
  }

  return `${signed}: ${sentence} on ${when}`;
}

/** Second line when a reason/comment exists: "Reason: Expired" */
export function formatStockHistoryReason(reason: string): string | null {
  const r = reason.trim();
  return r ? `Reason: ${r}` : null;
}

export type ItemBatch = {
  id: number;
  item_id: number;
  location_code: string;
  batch_no: string;
  expiry_date: string | null;
  qty: number;
  created_at?: string;
  updated_at?: string;
};

export type PharmacyItem = {
  id: number;
  code: string;
  name: string;
  category: ItemCategory | string;
  pack_size: number;
  buy_price_mmk: number;
  sell_price_mmk: number;
  reorder_level: number;
  active: boolean;
  stock_main: number;
  low_stock: boolean;
  created_at?: string;
  updated_at?: string;
  batches?: ItemBatch[];
  stock_by_location?: Record<string, number>;
};

export type StockMovement = {
  id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  batch_id: number | null;
  location_code: string;
  movement_type: string;
  qty_delta: number;
  reason: string;
  actor_user_id: number | null;
  created_at: string;
};

export async function listPharmacyItems(q = ""): Promise<PharmacyItem[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}&all=1` : "?all=1";
  const res = await apiFetch<{ items: PharmacyItem[] }>(`/api/pharmacy/items${qs}`);
  return res.items;
}

export async function findItemByCode(code: string): Promise<PharmacyItem | null> {
  const res = await apiFetch<{ items: PharmacyItem[] }>(
    `/api/pharmacy/items?code=${encodeURIComponent(code.trim())}`,
  );
  return res.items[0] ?? null;
}

export async function getPharmacyItem(id: number): Promise<PharmacyItem> {
  return apiFetch<PharmacyItem>(`/api/pharmacy/items/${id}`);
}

export async function createPharmacyItem(body: {
  code: string;
  name: string;
  category: string;
  pack_size: number;
  buy_price_mmk: number;
  sell_price_mmk: number;
  reorder_level: number;
  initial_qty?: number;
  batch_no?: string;
  expiry_date?: string;
}): Promise<PharmacyItem> {
  return apiFetch<PharmacyItem>("/api/pharmacy/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updatePharmacyItem(
  id: number,
  body: {
    code: string;
    name: string;
    category: string;
    pack_size: number;
    buy_price_mmk: number;
    sell_price_mmk: number;
    reorder_level: number;
    active: boolean;
  },
): Promise<PharmacyItem> {
  return apiFetch<PharmacyItem>(`/api/pharmacy/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deactivatePharmacyItem(id: number): Promise<void> {
  await apiFetch(`/api/pharmacy/items/${id}`, { method: "DELETE" });
}

export async function restockItem(
  id: number,
  body: {
    qty: number;
    batch_no?: string;
    expiry_date?: string;
    buy_price_mmk?: number;
    sell_price_mmk?: number;
  },
): Promise<PharmacyItem> {
  return apiFetch<PharmacyItem>(`/api/pharmacy/items/${id}/restock`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function adjustItem(
  id: number,
  body: { qty_delta: number; reason: string; batch_id?: number },
): Promise<PharmacyItem> {
  return apiFetch<PharmacyItem>(`/api/pharmacy/items/${id}/adjust`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listStockMovements(opts?: {
  itemId?: number;
  q?: string;
}): Promise<StockMovement[]> {
  const params = new URLSearchParams();
  if (opts?.itemId != null) params.set("item_id", String(opts.itemId));
  if (opts?.q) params.set("q", opts.q);
  const qs = params.toString() ? `?${params}` : "";
  const res = await apiFetch<{ movements: StockMovement[] }>(`/api/pharmacy/movements${qs}`);
  return res.movements;
}
