import { apiFetch, getApiBase } from "@/shared/api";
import { getStoredToken } from "@/shared/auth";
import { fetchAndPreviewPrint } from "@/shared/print";

export const ITEM_CATEGORIES = [
  "Injection",
  "OPD",
  "OT",
  "Tablet",
  "Syrup",
  "Other",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** Full pharmacy unit list (parent, child, and smallest unit). */
export const PHARMACY_UNITS = [
  "Box",
  "Carton",
  "Bottle",
  "Vial",
  "Ampoule",
  "Piece",
  "Tablet",
  "Capsule",
  "Tube",
  "Cylinder",
  "Bag",
  "Each",
  "mL",
  "g",
  "oz",
  "Strip",
  "Card",
] as const;

export type PharmacyUnit = (typeof PHARMACY_UNITS)[number];

/** @deprecated Prefer PHARMACY_UNITS — kept for callers that still filter by level. */
export const PACK_L1_UNITS = ["Box", "Bottle"] as const;
export const PACK_L2_UNITS = ["Strip", "Card"] as const;
export const PACK_L3_UNITS = ["Tablet", "Capsule", "mL"] as const;

export type PackL1Unit = (typeof PACK_L1_UNITS)[number];
export type PackL2Unit = (typeof PACK_L2_UNITS)[number];
export type PackL3Unit = (typeof PACK_L3_UNITS)[number];

export type ItemPack = {
  pack_l1_qty: number;
  pack_l1_unit: string;
  pack_l2_qty: number;
  pack_l2_unit: string;
  pack_l3_qty: number;
  pack_l3_unit: string;
};

/** One packing relation: parent contains packing of child. */
export type PackRelation = {
  parent: string;
  packing: number;
  child: string;
};

/** Visible pack chain after collapsing pass-through levels. */
export type PackLevels = {
  units: string[];
  /** Qty of next unit inside each unit except the last. Length = units.length - 1. */
  qtys: number[];
};

export type PackPriceSlot = {
  unit: string;
  buy_mmk: number;
  sell_mmk: number;
};

export function defaultItemPack(): ItemPack {
  return {
    pack_l1_qty: 1,
    pack_l1_unit: "Box",
    pack_l2_qty: 10,
    pack_l2_unit: "Strip",
    pack_l3_qty: 10,
    pack_l3_unit: "Tablet",
  };
}

export function tabletsPerBox(p: ItemPack): number {
  return Math.max(1, p.pack_l2_qty || 1) * Math.max(1, p.pack_l3_qty || 1);
}

/** Total L3 units from mixed box/strip/tablet sale quantities. */
export function totalTablets(
  boxQty: number,
  stripQty: number,
  tabletQty: number,
  stripsPerBox: number,
  tabsPerStrip: number,
): { total: number; error?: string } {
  const b = Math.max(0, boxQty || 0);
  const s = Math.max(0, stripQty || 0);
  const t = Math.max(0, tabletQty || 0);
  if (b === 0 && s === 0 && t === 0) return { total: 0, error: "quantity required" };
  const l2 = Math.max(1, stripsPerBox || 1);
  const l3 = Math.max(1, tabsPerStrip || 1);
  return { total: b * l2 * l3 + s * l3 + t };
}

export function lineChargeFromPack(
  boxQty: number,
  stripQty: number,
  tabletQty: number,
  stripsPerBox: number,
  tabsPerStrip: number,
  sellPerTablet: number,
): { total: number; charge: number; error?: string } {
  const { total, error } = totalTablets(boxQty, stripQty, tabletQty, stripsPerBox, tabsPerStrip);
  if (error) return { total: 0, charge: 0, error };
  return { total, charge: total * (sellPerTablet || 0) };
}

function shortUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === "box") return "Bx";
  if (u === "carton") return "Ctn";
  if (u === "strip") return "St";
  if (u === "card") return "Crd";
  if (u === "tablet") return "t";
  if (u === "capsule") return "cap";
  if (u === "ml") return "ml";
  if (u === "bottle") return "Bot";
  if (u === "vial") return "Vial";
  if (u === "ampoule") return "Amp";
  if (u === "piece") return "Pc";
  if (u === "tube") return "Tube";
  if (u === "cylinder") return "Cyl";
  if (u === "bag") return "Bag";
  if (u === "each") return "Ea";
  if (u === "g") return "g";
  if (u === "oz") return "oz";
  return unit.slice(0, 3) || "u";
}

/** Collapse stored 3-level pack into visible units (1–3), hiding pass-through L3. */
export function packLevelsFromItemPack(p: ItemPack): PackLevels {
  const l1 = (p.pack_l1_unit || "Box").trim() || "Box";
  const l2 = (p.pack_l2_unit || "Strip").trim() || "Strip";
  const l3 = (p.pack_l3_unit || "Tablet").trim() || "Tablet";
  const q2 = Math.max(1, p.pack_l2_qty || 1);
  const q3 = Math.max(1, p.pack_l3_qty || 1);

  // Single unit: Tube = Tube (stored as L1=Tube, L2=1 Tube, L3=1 Tube)
  if (l1 === l2 && l2 === l3 && q2 === 1 && q3 === 1) {
    return { units: [l1], qtys: [] };
  }
  // Two units: Box → Tablet (L3 qty 1 and L3 unit matches L2 — pass-through)
  if (q3 === 1 && l2 === l3) {
    return { units: [l1, l2], qtys: [q2] };
  }
  // Two units where L1 equals L2 (odd legacy) — treat as L1 → L3
  if (l1 === l2 && q2 === 1) {
    return { units: [l1, l3], qtys: [q3] };
  }
  return { units: [l1, l2, l3], qtys: [q2, q3] };
}

/** Expand visible relations + smallest unit into the stored three-level pack. */
export function itemPackFromRelations(
  relations: PackRelation[],
  smallestUnit: string,
): ItemPack | { error: string } {
  const smallest = smallestUnit.trim();
  if (!smallest) return { error: "smallest unit required" };
  const rows = relations.filter((r) => r.parent.trim() && r.child.trim() && r.packing >= 1);
  if (rows.length === 0) {
    // One unit only
    return {
      pack_l1_qty: 1,
      pack_l1_unit: smallest,
      pack_l2_qty: 1,
      pack_l2_unit: smallest,
      pack_l3_qty: 1,
      pack_l3_unit: smallest,
    };
  }
  const last = rows[rows.length - 1];
  if (last.child.trim() !== smallest) {
    return { error: "last child must match smallest unit" };
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].parent.trim() !== rows[i - 1].child.trim()) {
      return { error: "pack chain must link parent to previous child" };
    }
  }
  if (rows.length === 1) {
    // Outer → smallest; pass-through L3
    return {
      pack_l1_qty: 1,
      pack_l1_unit: rows[0].parent.trim(),
      pack_l2_qty: Math.max(1, rows[0].packing),
      pack_l2_unit: rows[0].child.trim(),
      pack_l3_qty: 1,
      pack_l3_unit: rows[0].child.trim(),
    };
  }
  if (rows.length === 2) {
    return {
      pack_l1_qty: 1,
      pack_l1_unit: rows[0].parent.trim(),
      pack_l2_qty: Math.max(1, rows[0].packing),
      pack_l2_unit: rows[0].child.trim(),
      pack_l3_qty: Math.max(1, rows[1].packing),
      pack_l3_unit: rows[1].child.trim(),
    };
  }
  return { error: "at most two packing relations" };
}

/** Relations for the packing-size editor, derived from a stored pack. */
export function relationsFromItemPack(p: ItemPack): {
  smallest: string;
  relations: PackRelation[];
} {
  const levels = packLevelsFromItemPack(p);
  const smallest = levels.units[levels.units.length - 1];
  if (levels.units.length === 1) {
    return { smallest, relations: [] };
  }
  const relations: PackRelation[] = [];
  for (let i = 0; i < levels.qtys.length; i++) {
    relations.push({
      parent: levels.units[i],
      packing: levels.qtys[i],
      child: levels.units[i + 1],
    });
  }
  return { smallest, relations };
}

export function formatPackLevelsPreview(levels: PackLevels): string {
  if (levels.units.length === 0) return "";
  if (levels.units.length === 1) return `1 ${levels.units[0]}`;
  const parts: string[] = [];
  for (let i = 0; i < levels.qtys.length; i++) {
    parts.push(`1 ${levels.units[i]} = ${levels.qtys[i]} ${levels.units[i + 1]}`);
  }
  return parts.join(" · ");
}

export function formatPackPreview(p: ItemPack): string {
  return formatPackLevelsPreview(packLevelsFromItemPack(p));
}

/** Compact packing label like 1Bx*10Crd*10t (skips pass-through levels). */
export function formatPackCompact(p: ItemPack): string {
  const levels = packLevelsFromItemPack(p);
  if (levels.units.length === 1) return `1${shortUnit(levels.units[0])}`;
  let out = `1${shortUnit(levels.units[0])}`;
  for (let i = 0; i < levels.qtys.length; i++) {
    out += `*${levels.qtys[i]}${shortUnit(levels.units[i + 1])}`;
  }
  return out;
}

/** Which billing qty inputs are meaningful (hide pass-through strip/tablet). */
export function packBillingSlots(p: ItemPack): {
  showL1: boolean;
  showL2: boolean;
  showL3: boolean;
} {
  const levels = packLevelsFromItemPack(p);
  if (levels.units.length === 1) {
    return { showL1: true, showL2: false, showL3: false };
  }
  if (levels.units.length === 2) {
    // Stored as L1 → L2 with L3 pass-through: show L1 and L2 (L2 is smallest)
    return { showL1: true, showL2: true, showL3: false };
  }
  return { showL1: true, showL2: true, showL3: true };
}

function roundHalfUp(n: number): number {
  return Math.round(n);
}

/**
 * Price rows for each visible unit.
 * buyOuter / sellOuter are prices for the outermost unit; children divide by packing qty.
 * When editing from stored sell_per_smallest, pass sellOuter = sell_per_smallest * unitsPerOuter.
 */
export function packPriceSlots(
  levels: PackLevels,
  buyOuter: number,
  sellOuter: number,
): PackPriceSlot[] {
  if (levels.units.length === 0) return [];
  const slots: PackPriceSlot[] = [];
  let buy = Math.max(0, buyOuter || 0);
  let sell = Math.max(0, sellOuter || 0);
  slots.push({ unit: levels.units[0], buy_mmk: roundHalfUp(buy), sell_mmk: roundHalfUp(sell) });
  for (let i = 0; i < levels.qtys.length; i++) {
    const q = Math.max(1, levels.qtys[i]);
    buy = buy / q;
    sell = sell / q;
    slots.push({
      unit: levels.units[i + 1],
      buy_mmk: roundHalfUp(buy),
      sell_mmk: roundHalfUp(sell),
    });
  }
  return slots;
}

/** Outer sale price reconstructed from stored sell-per-smallest. */
export function sellOuterFromSmallest(p: ItemPack, sellPerSmallest: number): number {
  return Math.max(0, sellPerSmallest || 0) * tabletsPerBox(p);
}

/** Which of box_qty / strip_qty / tablet_qty holds a chosen sale unit. */
export type SaleQtySlot = "box" | "strip" | "tablet";

/** One visible pack level the cashier can sell. Price is per that unit. */
export type SaleUnit = {
  id: string;
  label: string;
  /** Smallest units inside one of this unit. */
  factor: number;
  price_mmk: number;
  slot: SaleQtySlot;
};

/**
 * Visible sale units for a pack.
 * price_mmk = sell-per-smallest × how many smallest units that level contains.
 * Two-level packs put the smallest count in the slot packBillingSlots shows
 * (strip for a pass-through L3, tablet when the stored smallest is L3) so the
 * server total is not counted twice.
 */
export function saleUnitsFromPack(pack: ItemPack, sellPerSmallest: number): SaleUnit[] {
  const levels = packLevelsFromItemPack(pack);
  const sell = Math.max(0, Math.floor(sellPerSmallest || 0));
  const l1 = (pack.pack_l1_unit || "Box").trim() || "Box";
  const l2 = (pack.pack_l2_unit || "Strip").trim() || "Strip";
  const l3 = (pack.pack_l3_unit || "Tablet").trim() || "Tablet";
  const q2 = Math.max(1, pack.pack_l2_qty || 1);
  const q3 = Math.max(1, pack.pack_l3_qty || 1);

  let slots: SaleQtySlot[];
  if (levels.units.length <= 1) {
    slots = ["box"];
  } else if (q3 === 1 && l2 === l3) {
    slots = ["box", "strip"];
  } else if (l1 === l2 && q2 === 1) {
    slots = ["box", "tablet"];
  } else {
    slots = ["box", "strip", "tablet"];
  }

  const factors = new Array<number>(levels.units.length);
  let factor = 1;
  for (let i = levels.units.length - 1; i >= 0; i--) {
    factors[i] = factor;
    if (i > 0) factor *= Math.max(1, levels.qtys[i - 1] || 1);
  }

  return levels.units.map((unit, i) => ({
    id: unit,
    label: unit,
    factor: factors[i] ?? 1,
    price_mmk: sell * (factors[i] ?? 1),
    slot: slots[i] ?? "tablet",
  }));
}

/** One pack field set, the other two zero. */
export function packQtysForSale(
  unit: SaleUnit,
  qty: number,
): { box_qty: number; strip_qty: number; tablet_qty: number } {
  const n = Math.max(0, Math.floor(qty) || 0);
  return {
    box_qty: unit.slot === "box" ? n : 0,
    strip_qty: unit.slot === "strip" ? n : 0,
    tablet_qty: unit.slot === "tablet" ? n : 0,
  };
}

/**
 * How a saved pharmacy line should appear in the grid.
 * Exactly one of box/strip/tablet is editable in that unit.
 * Two or more stay locked on the smallest-unit qty so a later save does not split them.
 */
export function pharmacyLineSaleView(line: {
  box_qty?: number;
  strip_qty?: number;
  tablet_qty?: number;
  billing_qty: number;
  unit_price_mmk: number;
  pack_l1_qty?: number;
  pack_l1_unit?: string;
  pack_l2_qty?: number;
  pack_l2_unit?: string;
  pack_l3_qty?: number;
  pack_l3_unit?: string;
}): {
  qty: number;
  unitId: string | null;
  units: SaleUnit[];
  priceMmk: number;
  locked: boolean;
} {
  const units = saleUnitsFromPack(packFromItem(line), line.unit_price_mmk);
  const slots: SaleQtySlot[] = [];
  if ((line.box_qty ?? 0) > 0) slots.push("box");
  if ((line.strip_qty ?? 0) > 0) slots.push("strip");
  if ((line.tablet_qty ?? 0) > 0) slots.push("tablet");
  const smallest = {
    qty: line.billing_qty,
    unitId: null as string | null,
    units: [] as SaleUnit[],
    priceMmk: line.unit_price_mmk,
    locked: slots.length > 1,
  };
  if (slots.length !== 1) return smallest;
  const unit = units.find((u) => u.slot === slots[0]);
  if (!unit) return { ...smallest, locked: true };
  const qty =
    slots[0] === "box"
      ? (line.box_qty ?? 0)
      : slots[0] === "strip"
        ? (line.strip_qty ?? 0)
        : (line.tablet_qty ?? 0);
  if (qty < 1) return { ...smallest, locked: true };
  return {
    qty,
    unitId: unit.id,
    units,
    priceMmk: unit.price_mmk,
    locked: false,
  };
}

export function packFromItem(item: {
  pack_l1_qty?: number;
  pack_l1_unit?: string;
  pack_l2_qty?: number;
  pack_l2_unit?: string;
  pack_l3_qty?: number;
  pack_l3_unit?: string;
}): ItemPack {
  const d = defaultItemPack();
  return {
    pack_l1_qty: item.pack_l1_qty ?? d.pack_l1_qty,
    pack_l1_unit: item.pack_l1_unit || d.pack_l1_unit,
    pack_l2_qty: item.pack_l2_qty ?? d.pack_l2_qty,
    pack_l2_unit: item.pack_l2_unit || d.pack_l2_unit,
    pack_l3_qty: item.pack_l3_qty ?? d.pack_l3_qty,
    pack_l3_unit: item.pack_l3_unit || d.pack_l3_unit,
  };
}

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

function unitWord(n: number, unit: string): string {
  const u = unit.trim() || "item";
  if (Math.abs(n) === 1) return u;
  if (u === "Piece" || u === "Each") return u === "Each" ? "Each" : "Pieces";
  return u;
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

/** Human line: "+12: Added 12 Vial more on Oct 7, 2026 3:30 PM" */
export function formatStockHistoryLine(
  m: {
    movement_type: string;
    qty_delta: number;
    reason: string;
    location_code: string;
    created_at: string;
  },
  stockUnit = "item",
): string {
  const n = Math.abs(m.qty_delta);
  const signed = `${m.qty_delta > 0 ? "+" : ""}${m.qty_delta}`;
  const items = unitWord(n, stockUnit);
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
  dosage: string;
  pack_size: number;
  pack_l1_qty: number;
  pack_l1_unit: string;
  pack_l2_qty: number;
  pack_l2_unit: string;
  pack_l3_qty: number;
  pack_l3_unit: string;
  purchase_unit: string;
  stock_unit: string;
  billing_unit: string;
  units_per_purchase: number;
  billing_per_stock: number;
  charge_full_stock_unit: boolean;
  buy_price_mmk: number; // per box
  sell_price_mmk: number; // per L3
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
  stock_unit?: string;
};

export type PharmacyBillLine = {
  id?: number;
  item_id: number;
  code: string;
  description: string;
  box_qty?: number;
  strip_qty?: number;
  tablet_qty?: number;
  billing_qty: number;
  billing_unit: string;
  stock_qty: number;
  stock_unit: string;
  unit_price_mmk: number;
  line_total_mmk: number;
  sort_order: number;
  /** Joined from the item on read so a reloaded line can name its unit. */
  pack_l1_qty?: number;
  pack_l1_unit?: string;
  pack_l2_qty?: number;
  pack_l2_unit?: string;
  pack_l3_qty?: number;
  pack_l3_unit?: string;
};

export type PharmacyBill = {
  id: number;
  bill_no: string;
  patient_id?: number | null;
  patient_name: string;
  patient_phone: string;
  patient_age_years?: number | null;
  patient_gender: string;
  description: string;
  status: string;
  total_mmk: number;
  paid_at?: string | null;
  void_reason?: string;
  created_at: string;
  updated_at: string;
  lines?: PharmacyBillLine[];
};

export async function listPharmacyItems(
  q = "",
  opts?: { includeInactive?: boolean },
): Promise<PharmacyItem[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (opts?.includeInactive) params.set("all", "1");
  const qs = params.toString();
  const res = await apiFetch<{ items: PharmacyItem[] }>(
    `/api/pharmacy/items${qs ? `?${qs}` : ""}`,
  );
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

export type PharmacyItemWrite = {
  code: string;
  name: string;
  dosage?: string;
  category?: string;
  pack_l1_qty: number;
  pack_l1_unit: string;
  pack_l2_qty: number;
  pack_l2_unit: string;
  pack_l3_qty: number;
  pack_l3_unit: string;
  buy_price_mmk: number;
  sell_price_mmk: number;
  initial_qty?: number;
  initial_qty_unit?: "purchase" | "stock";
  batch_no?: string;
  expiry_date?: string;
  active?: boolean;
};

export async function createPharmacyItem(body: PharmacyItemWrite): Promise<PharmacyItem> {
  return apiFetch<PharmacyItem>("/api/pharmacy/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updatePharmacyItem(
  id: number,
  body: PharmacyItemWrite & { active: boolean },
): Promise<PharmacyItem> {
  return apiFetch<PharmacyItem>(`/api/pharmacy/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deactivatePharmacyItem(id: number): Promise<void> {
  await apiFetch(`/api/pharmacy/items/${id}`, { method: "DELETE" });
}

/** Hard-delete an unused catalog item. Fails if the item is on a bill or transfer. */
export async function deletePharmacyItem(id: number): Promise<void> {
  await apiFetch(`/api/pharmacy/items/${id}/delete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function restockItem(
  id: number,
  body: {
    qty: number;
    /** Pack unit name (Box, Card, Tablet, …) or legacy purchase | stock. */
    qty_unit?: string;
    batch_no: string;
    expiry_date: string;
    buy_price_mmk?: number;
    sell_price_mmk?: number;
  },
): Promise<PharmacyItem> {
  return apiFetch<PharmacyItem>(`/api/pharmacy/items/${id}/restock`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type StockTransfer = {
  id: number;
  direction: "TO_OT" | "TO_PHARMACY";
  item_id: number;
  pharmacy_batch_id: number;
  ot_batch_id: number;
  batch_no: string;
  expiry_date: string | null;
  qty: number;
  pharmacy_qty: number;
  ot_qty: number;
};

export async function labelPharmacyBatch(
  itemId: number,
  batchId: number,
  body: { batch_no: string; expiry_date: string },
): Promise<PharmacyItem> {
  return apiFetch<PharmacyItem>(`/api/pharmacy/items/${itemId}/batches/${batchId}/label`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function adjustItem(
  id: number,
  body: { qty_delta: number; reason: string; batch_id?: number; batch_no?: string; expiry_date?: string },
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

export type PharmacyBillKind = "sale" | "return" | "transfer";

export async function listPharmacyBills(
  q = "",
  status = "",
  kind?: PharmacyBillKind,
): Promise<PharmacyBill[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (kind) params.set("kind", kind);
  const qs = params.toString() ? `?${params}` : "";
  const res = await apiFetch<{ bills: PharmacyBill[] }>(`/api/pharmacy/bills${qs}`);
  return res.bills;
}

export async function getPharmacyBill(id: number): Promise<PharmacyBill> {
  return apiFetch<PharmacyBill>(`/api/pharmacy/bills/${id}`);
}

export async function createPharmacyBill(body: {
  patient_name: string;
  patient_phone?: string;
  patient_age_years?: number | null;
  patient_gender?: string;
  description?: string;
  lines: PharmacyBillLine[];
  save_patient?: boolean;
  kind?: PharmacyBillKind;
}): Promise<PharmacyBill> {
  return apiFetch<PharmacyBill>("/api/pharmacy/bills", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updatePharmacyBill(
  id: number,
  body: {
    patient_name: string;
    patient_phone?: string;
    patient_age_years?: number | null;
    patient_gender?: string;
    description?: string;
    lines: PharmacyBillLine[];
    save_patient?: boolean;
  },
): Promise<PharmacyBill> {
  return apiFetch<PharmacyBill>(`/api/pharmacy/bills/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function payPharmacyBill(id: number): Promise<PharmacyBill> {
  return apiFetch<PharmacyBill>(`/api/pharmacy/bills/${id}/pay`, { method: "POST", body: "{}" });
}

export async function transferPharmacyBill(id: number): Promise<PharmacyBill> {
  return apiFetch<PharmacyBill>(`/api/pharmacy/bills/${id}/transfer`, { method: "POST", body: "{}" });
}

export async function voidPharmacyBill(id: number, reason: string): Promise<PharmacyBill> {
  return apiFetch<PharmacyBill>(`/api/pharmacy/bills/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function printPharmacyBill(
  id: number,
  opts?: { title?: string; note?: string; onPrinted?: () => void | Promise<void> },
): Promise<void> {
  return fetchAndPreviewPrint(`/api/pharmacy/bills/${id}/print`, getApiBase, getStoredToken, {
    title: opts?.title ?? "Pharmacy receipt",
    note: opts?.note,
    receipt: true,
    onPrinted: opts?.onPrinted,
  });
}
