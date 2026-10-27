import { apiFetch, getApiBase } from "@/shared/api";
import { getStoredToken } from "@/shared/auth";
import { fetchAndPreviewPrint } from "@/shared/print";

export type OpdBillLine = {
  id?: number;
  line_type: "service" | "item" | "consultation";
  ref_id?: number | null;
  code: string;
  description: string;
  qty: number;
  unit_price_mmk: number;
  line_total_mmk: number;
  sort_order?: number;
};

export type OpdBill = {
  id: number;
  bill_no: string;
  patient_id?: number | null;
  patient_name: string;
  patient_phone: string;
  patient_age_years?: number | null;
  patient_gender: string;
  doctor_id?: number | null;
  doctor_name: string;
  description: string;
  status: "draft" | "paid" | "void" | string;
  total_mmk: number;
  discount_value?: number;
  discount_unit?: "percent" | "mmk" | string;
  discount_mmk?: number;
  printed_at?: string | null;
  admission_id?: number | null;
  collected_cash?: number;
  paid_at?: string | null;
  voided_at?: string | null;
  void_reason?: string;
  created_at: string;
  updated_at: string;
  lines?: OpdBillLine[];
};

export type OpdDoctor = {
  id: number;
  name: string;
  specialty: string;
  consultation_mmk: number;
};

export type OpdService = {
  id: number;
  code: string;
  name: string;
  price_mmk: number;
};

export type OpdItem = {
  id: number;
  code: string;
  name: string;
  sell_price_mmk: number;
  stock_main: number;
};

export type OpdBillWrite = {
  patient_name: string;
  patient_phone: string;
  patient_age_years?: number | null;
  patient_gender: string;
  doctor_id?: number | null;
  doctor_name?: string;
  description: string;
  lines: OpdBillLine[];
  save_patient?: boolean;
  patient_id?: number | null;
  discount_value?: number;
  discount_unit?: "percent" | "mmk";
};

export async function listOpdDoctors(q = ""): Promise<OpdDoctor[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ doctors: OpdDoctor[] }>(`/api/opd/catalog/doctors${qs}`);
  return res.doctors;
}

export async function listOpdServices(q = ""): Promise<OpdService[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ services: OpdService[] }>(`/api/opd/catalog/services${qs}`);
  return res.services;
}

export async function findOpdServiceByCode(code: string): Promise<OpdService | null> {
  const res = await apiFetch<{ services: OpdService[] }>(
    `/api/opd/catalog/services?code=${encodeURIComponent(code.trim())}`,
  );
  return res.services[0] ?? null;
}

export async function listOpdItems(q = ""): Promise<OpdItem[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ items: OpdItem[] }>(`/api/opd/catalog/items${qs}`);
  return res.items;
}

export async function findOpdItemByCode(code: string): Promise<OpdItem | null> {
  const res = await apiFetch<{ items: OpdItem[] }>(
    `/api/opd/catalog/items?code=${encodeURIComponent(code.trim())}`,
  );
  return res.items[0] ?? null;
}

export async function listOpdBills(
  q = "",
  status = "",
  opts?: { money?: string; from?: string; to?: string; sort?: string },
): Promise<OpdBill[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status.trim()) params.set("status", status.trim());
  if (opts?.money?.trim()) params.set("money", opts.money.trim());
  if (opts?.from?.trim()) params.set("from", opts.from.trim());
  if (opts?.to?.trim()) params.set("to", opts.to.trim());
  if (opts?.sort?.trim()) params.set("sort", opts.sort.trim());
  const qs = params.toString() ? `?${params}` : "";
  const res = await apiFetch<{ bills: OpdBill[] }>(`/api/opd/bills${qs}`);
  return res.bills;
}

export async function getOpdBill(id: number): Promise<OpdBill> {
  return apiFetch<OpdBill>(`/api/opd/bills/${id}`);
}

export async function createOpdBill(body: OpdBillWrite): Promise<OpdBill> {
  return apiFetch<OpdBill>("/api/opd/bills", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateOpdBill(id: number, body: OpdBillWrite): Promise<OpdBill> {
  return apiFetch<OpdBill>(`/api/opd/bills/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function payOpdBill(id: number, admissionId?: number | null): Promise<OpdBill> {
  const body = admissionId != null ? JSON.stringify({ admission_id: admissionId }) : "{}";
  return apiFetch<OpdBill>(`/api/opd/bills/${id}/pay`, { method: "POST", body });
}

export async function markOpdBillPrinted(id: number): Promise<OpdBill> {
  return apiFetch<OpdBill>(`/api/opd/bills/${id}/printed`, { method: "POST", body: "{}" });
}

export async function voidOpdBill(id: number, reason: string): Promise<OpdBill> {
  return apiFetch<OpdBill>(`/api/opd/bills/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** Admin-only. Permanently removes a draft or void bill. */
export async function purgeOpdBill(id: number): Promise<void> {
  await apiFetch(`/api/opd/bills/${id}`, { method: "DELETE" });
}

/** Fetch printable HTML and show in-app receipt preview (no popup). */
export async function printOpdBill(
  id: number,
  opts?: { title?: string; note?: string; onPrinted?: () => void | Promise<void> },
): Promise<void> {
  return fetchAndPreviewPrint(`/api/opd/bills/${id}/print`, getApiBase, getStoredToken, {
    title: opts?.title ?? "OPD receipt",
    note: opts?.note,
    receipt: true,
    onPrinted: opts?.onPrinted,
  });
}

export function lineTotal(qty: number, price: number): number {
  return qty * price;
}
