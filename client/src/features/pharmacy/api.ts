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
  "Sachet",
  "Pack",
  "Puff",
  "Pairs",
] as const;

export type PharmacyUnit = (typeof PHARMACY_UNITS)[number];

/** Max names in a packing chain (five packing relations). */
export const MAX_PACK_DEPTH = 6;

/** Clinic bill lines send this so the API accepts packs deeper than 3. */
export const PACK_DEPTH_CLIENT = 6;

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
  pack_l4_qty: number;
  pack_l4_unit: string;
  pack_l5_qty: number;
  pack_l5_unit: string;
  pack_l6_qty: number;
  pack_l6_unit: string;
};

export type PackSaleQtys = {
  box_qty: number;
  strip_qty: number;
  tablet_qty: number;
  qty_l4: number;
  qty_l5: number;
  qty_l6: number;
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
    pack_l4_qty: 1,
    pack_l4_unit: "Tablet",
    pack_l5_qty: 1,
    pack_l5_unit: "Tablet",
    pack_l6_qty: 1,
    pack_l6_unit: "Tablet",
  };
}

function padItemPack(p: ItemPack): ItemPack {
  const l1 = (p.pack_l1_unit || "Box").trim() || "Box";
  const l2 = (p.pack_l2_unit || "Strip").trim() || "Strip";
  const l3 = (p.pack_l3_unit || "Tablet").trim() || "Tablet";
  let l4 = (p.pack_l4_unit || "").trim();
  let l5 = (p.pack_l5_unit || "").trim();
  let l6 = (p.pack_l6_unit || "").trim();
  let smallest = l3;
  if (l4) smallest = l4;
  if (l5) smallest = l5;
  if (l6) smallest = l6;
  if (!l4) l4 = smallest;
  if (!l5) l5 = smallest;
  if (!l6) l6 = smallest;
  return {
    pack_l1_qty: 1,
    pack_l1_unit: l1,
    pack_l2_qty: Math.max(1, p.pack_l2_qty || 1),
    pack_l2_unit: l2,
    pack_l3_qty: Math.max(1, p.pack_l3_qty || 1),
    pack_l3_unit: l3,
    pack_l4_qty: Math.max(1, p.pack_l4_qty || 1),
    pack_l4_unit: l4,
    pack_l5_qty: Math.max(1, p.pack_l5_qty || 1),
    pack_l5_unit: l5,
    pack_l6_qty: Math.max(1, p.pack_l6_qty || 1),
    pack_l6_unit: l6,
  };
}

function packSlotQtys(p: ItemPack): number[] {
  const x = padItemPack(p);
  return [x.pack_l1_qty, x.pack_l2_qty, x.pack_l3_qty, x.pack_l4_qty, x.pack_l5_qty, x.pack_l6_qty];
}

function packSlotUnits(p: ItemPack): string[] {
  const x = padItemPack(p);
  return [x.pack_l1_unit, x.pack_l2_unit, x.pack_l3_unit, x.pack_l4_unit, x.pack_l5_unit, x.pack_l6_unit];
}

/** Smallest units inside one outer unit (product of L2…L6). */
export function tabletsPerBox(p: ItemPack): number {
  const qtys = packSlotQtys(p);
  let product = 1;
  for (let i = 1; i < qtys.length; i++) {
    product *= Math.max(1, qtys[i] || 1);
  }
  return Math.max(1, product);
}

/** Factors for stored slots L1…L6 (how many smallest units one of that slot holds). */
export function packSlotFactors(p: ItemPack): number[] {
  const qtys = packSlotQtys(p);
  const factors = new Array<number>(MAX_PACK_DEPTH);
  let factor = 1;
  for (let i = MAX_PACK_DEPTH - 1; i >= 0; i--) {
    factors[i] = factor;
    if (i > 0) factor *= Math.max(1, qtys[i] || 1);
  }
  return factors;
}

export function emptyPackSaleQtys(): PackSaleQtys {
  return { box_qty: 0, strip_qty: 0, tablet_qty: 0, qty_l4: 0, qty_l5: 0, qty_l6: 0 };
}

/** Total smallest units from mixed sale quantities. */
export function totalTablets(
  qtys: PackSaleQtys,
  pack: ItemPack,
): { total: number; error?: string } {
  const slots = [
    Math.max(0, qtys.box_qty || 0),
    Math.max(0, qtys.strip_qty || 0),
    Math.max(0, qtys.tablet_qty || 0),
    Math.max(0, qtys.qty_l4 || 0),
    Math.max(0, qtys.qty_l5 || 0),
    Math.max(0, qtys.qty_l6 || 0),
  ];
  if (slots.every((n) => n === 0)) return { total: 0, error: "quantity required" };
  const factors = packSlotFactors(pack);
  let total = 0;
  for (let i = 0; i < slots.length; i++) {
    total += slots[i] * factors[i];
  }
  return { total };
}

export function lineChargeFromPack(
  qtys: PackSaleQtys,
  pack: ItemPack,
  sellPerTablet: number,
): { total: number; charge: number; error?: string } {
  const { total, error } = totalTablets(qtys, pack);
  if (error) return { total: 0, charge: 0, error };
  const sell = Math.max(0, sellPerTablet || 0);
  const factors = packSlotFactors(pack);
  const slots = [
    Math.max(0, qtys.box_qty || 0),
    Math.max(0, qtys.strip_qty || 0),
    Math.max(0, qtys.tablet_qty || 0),
    Math.max(0, qtys.qty_l4 || 0),
    Math.max(0, qtys.qty_l5 || 0),
    Math.max(0, qtys.qty_l6 || 0),
  ];
  let charge = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] > 0) charge += slots[i] * roundPayableMMK(sell * factors[i]);
  }
  return { total, charge };
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
  if (u === "sachet") return "Sa";
  if (u === "pack") return "Pk";
  if (u === "puff") return "Pf";
  if (u === "pairs") return "Pr";
  return unit.slice(0, 3) || "u";
}

/** Collapse stored pack into visible units, hiding qty-1 same-unit padding. */
export function packLevelsFromItemPack(p: ItemPack): PackLevels {
  const units = packSlotUnits(p);
  const qtys = packSlotQtys(p);
  const keptUnits: string[] = [];
  const keptQtys: number[] = [];
  for (let i = 0; i < MAX_PACK_DEPTH; i++) {
    if (i === 0) {
      keptUnits.push(units[i]);
      continue;
    }
    const prev = keptUnits[keptUnits.length - 1];
    if (qtys[i] === 1 && units[i].toLowerCase() === prev.toLowerCase()) {
      continue;
    }
    keptQtys.push(qtys[i]);
    keptUnits.push(units[i]);
  }
  return { units: keptUnits, qtys: keptQtys };
}

/** Expand visible relations + smallest unit into the stored six-level pack. */
export function itemPackFromRelations(
  relations: PackRelation[],
  smallestUnit: string,
): ItemPack | { error: string } {
  const smallest = smallestUnit.trim();
  if (!smallest) return { error: "smallest unit required" };
  const rows = relations.filter((r) => r.parent.trim() && r.child.trim() && r.packing >= 1);
  if (rows.length > MAX_PACK_DEPTH - 1) {
    return { error: "at most five packing relations" };
  }
  if (rows.length === 0) {
    return {
      pack_l1_qty: 1,
      pack_l1_unit: smallest,
      pack_l2_qty: 1,
      pack_l2_unit: smallest,
      pack_l3_qty: 1,
      pack_l3_unit: smallest,
      pack_l4_qty: 1,
      pack_l4_unit: smallest,
      pack_l5_qty: 1,
      pack_l5_unit: smallest,
      pack_l6_qty: 1,
      pack_l6_unit: smallest,
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
  const names = [rows[0].parent.trim(), ...rows.map((r) => r.child.trim())];
  const seen = new Set<string>();
  for (const n of names) {
    const key = n.toLowerCase();
    if (seen.has(key)) return { error: "pack unit names must be unique in the visible chain" };
    seen.add(key);
  }
  const slotUnits = new Array<string>(MAX_PACK_DEPTH);
  const slotQtys = new Array<number>(MAX_PACK_DEPTH);
  slotUnits[0] = names[0];
  slotQtys[0] = 1;
  for (let i = 0; i < rows.length; i++) {
    slotUnits[i + 1] = rows[i].child.trim();
    slotQtys[i + 1] = Math.max(1, rows[i].packing);
  }
  for (let i = rows.length + 1; i < MAX_PACK_DEPTH; i++) {
    slotUnits[i] = smallest;
    slotQtys[i] = 1;
  }
  return {
    pack_l1_qty: slotQtys[0],
    pack_l1_unit: slotUnits[0],
    pack_l2_qty: slotQtys[1],
    pack_l2_unit: slotUnits[1],
    pack_l3_qty: slotQtys[2],
    pack_l3_unit: slotUnits[2],
    pack_l4_qty: slotQtys[3],
    pack_l4_unit: slotUnits[3],
    pack_l5_qty: slotQtys[4],
    pack_l5_unit: slotUnits[4],
    pack_l6_qty: slotQtys[5],
    pack_l6_unit: slotUnits[5],
  };
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

/** Which stored sale slots are meaningful after collapsing padding. */
export function packBillingSlots(p: ItemPack): {
  showL1: boolean;
  showL2: boolean;
  showL3: boolean;
  showL4: boolean;
  showL5: boolean;
  showL6: boolean;
} {
  const levels = packLevelsFromItemPack(p);
  const padded = padItemPack(p);
  const units = packSlotUnits(padded);
  const visible = new Set(levels.units.map((u) => u.toLowerCase()));
  return {
    showL1: visible.has(units[0].toLowerCase()),
    showL2: visible.has(units[1].toLowerCase()),
    showL3: visible.has(units[2].toLowerCase()),
    showL4: visible.has(units[3].toLowerCase()),
    showL5: visible.has(units[4].toLowerCase()),
    showL6: visible.has(units[5].toLowerCase()),
  };
}

function roundHalfUp(n: number): number {
  return Math.round(n);
}

/**
 * Snap an amount to the nearest multiple of 50 kyat (Myanmar cash notes).
 * Halfway (remainder 25) rounds up. Positive amounts that would round to 0
 * become 50 so a real price never collapses to free.
 */
export function roundPayableMMK(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = 50;
  const rem = n % step;
  let out = rem >= 25 ? n - rem + step : n - rem;
  if (out === 0) return step;
  return out;
}

/** Smallest units inside one of each visible pack unit. e.g. Box×2 Card×10 Tablet → [20, 10, 1]. */
export function unitFactors(levels: PackLevels): number[] {
  const n = levels.units.length;
  if (n === 0) return [];
  const factors = new Array<number>(n);
  let factor = 1;
  for (let i = n - 1; i >= 0; i--) {
    factors[i] = factor;
    if (i > 0) factor *= Math.max(1, levels.qtys[i - 1] || 1);
  }
  return factors;
}

/**
 * Spread a price typed at one unit across every visible unit.
 * The typed unit keeps the integer entered; others round half-up.
 */
export function pricesFromUnit(levels: PackLevels, unitIndex: number, price: number): number[] {
  const factors = unitFactors(levels);
  if (factors.length === 0) return [];
  const anchor = Math.max(0, Math.min(unitIndex, factors.length - 1));
  const anchorFactor = Math.max(1, factors[anchor] || 1);
  const p = Math.max(0, price || 0);
  return factors.map((f, i) =>
    i === anchor ? roundHalfUp(p) : roundHalfUp((p * f) / anchorFactor),
  );
}

/** Sale per smallest unit from outer buy and a markup percent (sale = purchase + %). */
export function sellSmallestFromMarkup(
  buyOuter: number,
  unitsPerOuter: number,
  percent: number,
): number {
  const units = Math.max(1, unitsPerOuter || 1);
  const buy = Math.max(0, buyOuter || 0);
  const pct = Math.max(0, percent || 0);
  return roundHalfUp((buy / units) * (100 + pct) / 100);
}

/** Keep sale ratio when buy changes and markup % is empty. */
export function scaleSellSmallest(
  oldBuyOuter: number,
  newBuyOuter: number,
  oldSellSmallest: number,
): number {
  const oldBuy = Math.max(0, oldBuyOuter || 0);
  const newBuy = Math.max(0, newBuyOuter || 0);
  const oldSell = Math.max(0, oldSellSmallest || 0);
  if (oldBuy <= 0 || oldSell <= 0) return oldSell;
  return roundHalfUp((oldSell * newBuy) / oldBuy);
}

/**
 * Whole markup percent when (sellOuter / buyOuter − 1) × 100 is within 0.05 of an integer.
 * Otherwise null so a rounded price is not shown as a fake percent.
 */
export function impliedMarkupPercent(buyOuter: number, sellOuter: number): number | null {
  const buy = Math.max(0, buyOuter || 0);
  const sell = Math.max(0, sellOuter || 0);
  if (buy <= 0) return null;
  const raw = (sell / buy - 1) * 100;
  if (raw < -0.05) return null;
  const nearest = Math.round(raw);
  if (nearest < 0) return null;
  if (Math.abs(raw - nearest) > 0.05) return null;
  return nearest;
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
  slots.push({
    unit: levels.units[0],
    buy_mmk: roundHalfUp(buy),
    sell_mmk: roundPayableMMK(roundHalfUp(sell)),
  });
  for (let i = 0; i < levels.qtys.length; i++) {
    const q = Math.max(1, levels.qtys[i]);
    buy = buy / q;
    sell = sell / q;
    slots.push({
      unit: levels.units[i + 1],
      buy_mmk: roundHalfUp(buy),
      sell_mmk: roundPayableMMK(roundHalfUp(sell)),
    });
  }
  return slots;
}

/** Outer sale price reconstructed from stored sell-per-smallest. */
export function sellOuterFromSmallest(p: ItemPack, sellPerSmallest: number): number {
  return Math.max(0, sellPerSmallest || 0) * tabletsPerBox(p);
}

/** Which sale qty column holds a chosen pack level. */
export type SaleQtySlot = "box" | "strip" | "tablet" | "l4" | "l5" | "l6";

const SALE_SLOTS: SaleQtySlot[] = ["box", "strip", "tablet", "l4", "l5", "l6"];

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
 * Each visible name maps to its stored slot so a two-level pack still sells
 * the smallest unit as strip when L3 is pass-through padding.
 */
export function saleUnitsFromPack(pack: ItemPack, sellPerSmallest: number): SaleUnit[] {
  const padded = padItemPack(pack);
  const levels = packLevelsFromItemPack(padded);
  const sell = Math.max(0, Math.floor(sellPerSmallest || 0));
  const slotFactors = packSlotFactors(padded);
  const units = packSlotUnits(padded);
  const qtys = packSlotQtys(padded);

  // Map each visible unit to the first matching stored slot (left to right).
  const keptSlots: number[] = [];
  for (let i = 0; i < MAX_PACK_DEPTH; i++) {
    if (i === 0) {
      keptSlots.push(i);
      continue;
    }
    const prevUnit = units[keptSlots[keptSlots.length - 1]];
    if (qtys[i] === 1 && units[i].toLowerCase() === prevUnit.toLowerCase()) {
      continue;
    }
    keptSlots.push(i);
  }

  return levels.units.map((unit, i) => {
    const slotIndex = keptSlots[i] ?? MAX_PACK_DEPTH - 1;
    const factor = slotFactors[slotIndex] ?? 1;
    return {
      id: unit,
      label: unit,
      factor,
      price_mmk: roundPayableMMK(sell * factor),
      slot: SALE_SLOTS[slotIndex] ?? "l6",
    };
  });
}

/** One pack field set; the others zero. */
export function packQtysForSale(unit: SaleUnit, qty: number): PackSaleQtys {
  const n = Math.max(0, Math.floor(qty) || 0);
  const out = emptyPackSaleQtys();
  if (unit.slot === "box") out.box_qty = n;
  else if (unit.slot === "strip") out.strip_qty = n;
  else if (unit.slot === "tablet") out.tablet_qty = n;
  else if (unit.slot === "l4") out.qty_l4 = n;
  else if (unit.slot === "l5") out.qty_l5 = n;
  else out.qty_l6 = n;
  return out;
}

function saleQtyForSlot(line: PackSaleQtys, slot: SaleQtySlot): number {
  if (slot === "box") return line.box_qty ?? 0;
  if (slot === "strip") return line.strip_qty ?? 0;
  if (slot === "tablet") return line.tablet_qty ?? 0;
  if (slot === "l4") return line.qty_l4 ?? 0;
  if (slot === "l5") return line.qty_l5 ?? 0;
  return line.qty_l6 ?? 0;
}

/**
 * How a saved pharmacy line should appear in the grid.
 * Exactly one sale slot is editable in that unit.
 * Two or more stay locked on the smallest-unit qty so a later save does not split them.
 */
export function pharmacyLineSaleView(line: {
  box_qty?: number;
  strip_qty?: number;
  tablet_qty?: number;
  qty_l4?: number;
  qty_l5?: number;
  qty_l6?: number;
  billing_qty: number;
  unit_price_mmk: number;
  pack_l1_qty?: number;
  pack_l1_unit?: string;
  pack_l2_qty?: number;
  pack_l2_unit?: string;
  pack_l3_qty?: number;
  pack_l3_unit?: string;
  pack_l4_qty?: number;
  pack_l4_unit?: string;
  pack_l5_qty?: number;
  pack_l5_unit?: string;
  pack_l6_qty?: number;
  pack_l6_unit?: string;
}): {
  qty: number;
  unitId: string | null;
  units: SaleUnit[];
  priceMmk: number;
  locked: boolean;
} {
  const units = saleUnitsFromPack(packFromItem(line), line.unit_price_mmk);
  const slots: SaleQtySlot[] = [];
  const sale: PackSaleQtys = {
    box_qty: line.box_qty ?? 0,
    strip_qty: line.strip_qty ?? 0,
    tablet_qty: line.tablet_qty ?? 0,
    qty_l4: line.qty_l4 ?? 0,
    qty_l5: line.qty_l5 ?? 0,
    qty_l6: line.qty_l6 ?? 0,
  };
  for (const slot of SALE_SLOTS) {
    if (saleQtyForSlot(sale, slot) > 0) slots.push(slot);
  }
  const smallest = {
    qty: line.billing_qty,
    unitId: null as string | null,
    units: [] as SaleUnit[],
    priceMmk: roundPayableMMK(line.unit_price_mmk),
    locked: slots.length > 1,
  };
  if (slots.length !== 1) return smallest;
  const unit = units.find((u) => u.slot === slots[0]);
  if (!unit) return { ...smallest, locked: true };
  const qty = saleQtyForSlot(sale, slots[0]);
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
  pack_l4_qty?: number;
  pack_l4_unit?: string;
  pack_l5_qty?: number;
  pack_l5_unit?: string;
  pack_l6_qty?: number;
  pack_l6_unit?: string;
}): ItemPack {
  return padItemPack({
    pack_l1_qty: item.pack_l1_qty ?? 1,
    pack_l1_unit: item.pack_l1_unit || "",
    pack_l2_qty: item.pack_l2_qty ?? 1,
    pack_l2_unit: item.pack_l2_unit || "",
    pack_l3_qty: item.pack_l3_qty ?? 1,
    pack_l3_unit: item.pack_l3_unit || "",
    pack_l4_qty: item.pack_l4_qty ?? 1,
    pack_l4_unit: item.pack_l4_unit || "",
    pack_l5_qty: item.pack_l5_qty ?? 1,
    pack_l5_unit: item.pack_l5_unit || "",
    pack_l6_qty: item.pack_l6_qty ?? 1,
    pack_l6_unit: item.pack_l6_unit || "",
  });
}

/** Innermost stored unit name (stock / billing). */
export function packInnermostUnit(p: ItemPack): string {
  return padItemPack(p).pack_l6_unit;
}

/** Label for on-hand / restock "will add" text — prefer stock_unit, then innermost pack. */
export function itemStockUnitLabel(item: {
  stock_unit?: string;
  pack_l6_unit?: string;
  pack_l3_unit?: string;
  billing_unit?: string;
}): string {
  return (
    (item.stock_unit || "").trim() ||
    (item.pack_l6_unit || "").trim() ||
    (item.pack_l3_unit || "").trim() ||
    (item.billing_unit || "").trim() ||
    "units"
  );
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
  pack_l4_qty: number;
  pack_l4_unit: string;
  pack_l5_qty: number;
  pack_l5_unit: string;
  pack_l6_qty: number;
  pack_l6_unit: string;
  purchase_unit: string;
  stock_unit: string;
  billing_unit: string;
  units_per_purchase: number;
  billing_per_stock: number;
  charge_full_stock_unit: boolean;
  buy_price_mmk: number; // per outer unit
  sell_price_mmk: number; // per smallest unit
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
  qty_l4?: number;
  qty_l5?: number;
  qty_l6?: number;
  pack_depth?: number;
  billing_qty: number;
  billing_unit: string;
  stock_qty: number;
  stock_unit: string;
  unit_price_mmk: number;
  line_total_mmk: number;
  sort_order: number;
  /** 1 = free of charge; bill total skips this line. */
  foc?: number;
  /** Joined from the item on read so a reloaded line can name its unit. */
  pack_l1_qty?: number;
  pack_l1_unit?: string;
  pack_l2_qty?: number;
  pack_l2_unit?: string;
  pack_l3_qty?: number;
  pack_l3_unit?: string;
  pack_l4_qty?: number;
  pack_l4_unit?: string;
  pack_l5_qty?: number;
  pack_l5_unit?: string;
  pack_l6_qty?: number;
  pack_l6_unit?: string;
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
  discount_value?: number;
  discount_unit?: "percent" | "mmk" | string;
  discount_mmk?: number;
  printed_at?: string | null;
  admission_id?: number | null;
  collected_cash?: number;
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
  pack_l4_qty: number;
  pack_l4_unit: string;
  pack_l5_qty: number;
  pack_l5_unit: string;
  pack_l6_qty: number;
  pack_l6_unit: string;
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
  patientId?: number | null,
  opts?: { money?: string; from?: string; to?: string; sort?: string },
): Promise<PharmacyBill[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (kind) params.set("kind", kind);
  if (patientId != null) params.set("patient_id", String(patientId));
  if (opts?.money?.trim()) params.set("money", opts.money.trim());
  if (opts?.from?.trim()) params.set("from", opts.from.trim());
  if (opts?.to?.trim()) params.set("to", opts.to.trim());
  if (opts?.sort?.trim()) params.set("sort", opts.sort.trim());
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
  patient_id?: number | null;
  kind?: PharmacyBillKind;
  discount_value?: number;
  discount_unit?: "percent" | "mmk";
  /** Admin-only on create. Yangon wall time as `YYYY-MM-DDTHH:mm`. */
  billed_at?: string;
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
    patient_id?: number | null;
    kind?: PharmacyBillKind;
  },
): Promise<PharmacyBill> {
  return apiFetch<PharmacyBill>(`/api/pharmacy/bills/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function payPharmacyBill(
  id: number,
  charge?: { admission_id?: number; source_bill_id?: number },
): Promise<PharmacyBill> {
  const body =
    charge != null && (charge.admission_id != null || charge.source_bill_id != null)
      ? JSON.stringify(charge)
      : "{}";
  return apiFetch<PharmacyBill>(`/api/pharmacy/bills/${id}/pay`, { method: "POST", body });
}

export async function markPharmacyBillPrinted(id: number): Promise<PharmacyBill> {
  return apiFetch<PharmacyBill>(`/api/pharmacy/bills/${id}/printed`, { method: "POST", body: "{}" });
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

/** Admin-only. Permanently removes a draft or void bill. */
export async function purgePharmacyBill(id: number): Promise<void> {
  await apiFetch(`/api/pharmacy/bills/${id}`, { method: "DELETE" });
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
