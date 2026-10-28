import { apiFetch, getApiBase } from "@/shared/api";
import { getStoredToken } from "@/shared/auth";
import { fetchAndPreviewPrint } from "@/shared/print";

export type ExpensePortal = "opd" | "ot" | "ipd" | "pharmacy";

export type ExpenseService = {
  id: number;
  code: string;
  name: string;
  price_mmk: number | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ExpenseCatalogService = {
  id: number;
  code: string;
  name: string;
  price_mmk: number | null;
};

export type ExpenseServiceWrite = {
  code: string;
  name: string;
  price_mmk: number | null;
  active?: boolean;
};

export async function listExpenseServices(q = ""): Promise<ExpenseService[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}&all=1` : "?all=1";
  const res = await apiFetch<{ services: ExpenseService[] }>(`/api/expenses/services${qs}`);
  return res.services ?? [];
}

export async function createExpenseService(body: ExpenseServiceWrite): Promise<ExpenseService> {
  return apiFetch<ExpenseService>("/api/expenses/services", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateExpenseService(
  id: number,
  body: ExpenseServiceWrite,
): Promise<ExpenseService> {
  return apiFetch<ExpenseService>(`/api/expenses/services/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deactivateExpenseService(id: number): Promise<void> {
  await apiFetch(`/api/expenses/services/${id}`, { method: "DELETE" });
}

export async function deleteExpenseService(id: number): Promise<void> {
  await apiFetch(`/api/expenses/services/${id}/delete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Active catalog rows for the expense-bill typeahead. */
export async function listExpenseCatalog(q = ""): Promise<ExpenseCatalogService[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const res = await apiFetch<{ services: ExpenseCatalogService[] }>(
    `/api/expenses/catalog/services${qs}`,
  );
  return res.services ?? [];
}

export async function findExpenseCatalogByCode(code: string): Promise<ExpenseCatalogService | null> {
  const res = await apiFetch<{ services: ExpenseCatalogService[] }>(
    `/api/expenses/catalog/services?code=${encodeURIComponent(code.trim())}`,
  );
  return res.services?.[0] ?? null;
}

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
  lines: { ref_id: number; qty: number; unit_price_mmk: number }[];
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
