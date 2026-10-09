import { apiFetch, getApiBase } from "./api";
import { getStoredToken } from "./auth";
import { fetchAndPreviewPrint } from "./print";

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
  pharmacy_count: number;
  pharmacy_total_mmk: number;
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

async function printReport(path: string, title: string): Promise<void> {
  return fetchAndPreviewPrint(path, getApiBase, getStoredToken, {
    title,
    receipt: false,
  });
}

export function printDailyCash(date: string): Promise<void> {
  return printReport(
    `/api/reports/daily-cash/print?date=${encodeURIComponent(date)}`,
    "Daily cash",
  );
}

export function printLowStock(): Promise<void> {
  return printReport(`/api/reports/low-stock/print`, "Low stock");
}

export function printNearExpiry(days: number): Promise<void> {
  return printReport(`/api/reports/near-expiry/print?days=${days}`, "Near expiry");
}
