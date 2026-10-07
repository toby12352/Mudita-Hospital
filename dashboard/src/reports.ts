import { apiFetch } from "./api";

export type CashLine = {
  source: string;
  bill_no: string;
  patient: string;
  doctor: string;
  total_mmk: number;
  paid_at: string;
  paid_by_name: string;
};

export type CashReport = {
  date: string;
  opd_count: number;
  opd_total_mmk: number;
  ot_count: number;
  ot_total_mmk: number;
  grand_total_mmk: number;
  lines: CashLine[];
};

export type LowStockItem = {
  id: number;
  code: string;
  name: string;
  category: string;
  stock_main: number;
  reorder_level: number;
  deficit: number;
};

export type NearExpiryBatch = {
  batch_id: number;
  item_id: number;
  code: string;
  name: string;
  location_code: string;
  batch_no: string;
  expiry_date: string;
  qty: number;
  days_left: number;
};

export async function fetchDailyCash(date: string): Promise<CashReport> {
  return apiFetch<CashReport>(`/api/reports/daily-cash?date=${encodeURIComponent(date)}`);
}

export async function fetchLowStock(): Promise<{ items: LowStockItem[]; count: number }> {
  return apiFetch(`/api/reports/low-stock`);
}

export async function fetchNearExpiry(
  days: number,
): Promise<{ days: number; batches: NearExpiryBatch[]; count: number }> {
  return apiFetch(`/api/reports/near-expiry?days=${days}`);
}

/** Local calendar date YYYY-MM-DD */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
