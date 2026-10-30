import { apiFetch, getApiBase } from "@/shared/api";
import { getStoredToken } from "@/shared/auth";
import { fetchAndPreviewPrint } from "@/shared/print";

export type ExpensePortal = "opd" | "ot" | "ipd" | "pharmacy";

export type ExpenseBillLine = {
  id?: number;
  ref_id?: number | null;
  code: string;
  description: string;
  qty: number;
  unit_price_mmk: number;
  line_total_mmk: number;
  sort_order?: number;
};

export type ExpenseBill = {
  id: number;
  bill_no: string;
  portal: ExpensePortal;
  name: string;
  description: string;
  status: string;
  total_mmk: number;
  discount_value: number;
  discount_unit: string;
  discount_mmk: number;
  paid_at?: string | null;
  printed_at?: string | null;
  void_reason?: string;
  created_at: string;
  updated_at: string;
  lines?: ExpenseBillLine[];
};

export type ExpenseBillWrite = {
  portal: ExpensePortal;
  name: string;
  description: string;
  discount_value: number;
  discount_unit: "percent" | "mmk";
  lines: { description: string; qty: number; unit_price_mmk: number }[];
  /** Admin-only on create. Yangon wall time as `YYYY-MM-DDTHH:mm`. */
  billed_at?: string;
};

export async function listExpenseBills(
  portal: ExpensePortal,
  q = "",
  status = "",
  opts?: { money?: string; from?: string; to?: string; sort?: string },
): Promise<ExpenseBill[]> {
  const params = new URLSearchParams({ portal });
  if (q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  if (opts?.money?.trim()) params.set("money", opts.money.trim());
  if (opts?.from?.trim()) params.set("from", opts.from.trim());
  if (opts?.to?.trim()) params.set("to", opts.to.trim());
  if (opts?.sort?.trim()) params.set("sort", opts.sort.trim());
  const res = await apiFetch<{ bills: ExpenseBill[] }>(`/api/expenses/bills?${params}`);
  return res.bills ?? [];
}

export async function getExpenseBill(id: number): Promise<ExpenseBill> {
  return apiFetch<ExpenseBill>(`/api/expenses/bills/${id}`);
}

export async function createExpenseBill(body: ExpenseBillWrite): Promise<ExpenseBill> {
  return apiFetch<ExpenseBill>("/api/expenses/bills", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateExpenseBill(id: number, body: ExpenseBillWrite): Promise<ExpenseBill> {
  return apiFetch<ExpenseBill>(`/api/expenses/bills/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function payExpenseBill(id: number): Promise<ExpenseBill> {
  return apiFetch<ExpenseBill>(`/api/expenses/bills/${id}/pay`, {
    method: "POST",
    body: "{}",
  });
}

export async function markExpenseBillPrinted(id: number): Promise<ExpenseBill> {
  return apiFetch<ExpenseBill>(`/api/expenses/bills/${id}/printed`, {
    method: "POST",
    body: "{}",
  });
}

export async function voidExpenseBill(id: number, reason: string): Promise<ExpenseBill> {
  return apiFetch<ExpenseBill>(`/api/expenses/bills/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** Admin-only. Permanently removes a draft or void bill. */
export async function purgeExpenseBill(id: number): Promise<void> {
  await apiFetch(`/api/expenses/bills/${id}`, { method: "DELETE" });
}

/** Fetch the server HTML receipt and open the in-app preview. */
export async function printExpenseBill(
  id: number,
  opts?: { title?: string; note?: string },
): Promise<void> {
  return fetchAndPreviewPrint(`/api/expenses/bills/${id}/print`, getApiBase, getStoredToken, {
    title: opts?.title ?? "Expense receipt",
    note: opts?.note,
    receipt: true,
  });
}
