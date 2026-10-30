import { apiFetch, getApiBase } from "@/shared/api";
import { getStoredToken } from "@/shared/auth";
import { fetchAndPreviewPrint } from "@/shared/print";

export type LabBillLine = {
  id?: number;
  line_type: "service";
  ref_id?: number | null;
  code: string;
  description: string;
  qty: number;
  unit_price_mmk: number;
  line_total_mmk: number;
  sort_order?: number;
  foc?: number;
};

export type LabBill = {
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
  lines?: LabBillLine[];
};

export type LabDoctor = {
  id: number;
  name: string;
  specialty: string;
  consultation_mmk: number;
};

export type LabService = {
  id: number;
  code: string;
  name: string;
  price_mmk: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type LabServiceHistoryRow = {
  id: number;
  actor_username?: string;
  action: string;
  entity_id?: number | null;
  code: string;
  name: string;
  detail?: string | null;
  created_at: string;
};

export type LabBillWrite = {
  patient_name: string;
  patient_phone: string;
  patient_age_years?: number | null;
  patient_gender: string;
  doctor_id?: number | null;
  doctor_name?: string;
  description: string;
  lines: LabBillLine[];
  save_patient?: boolean;
  patient_id?: number | null;
  discount_value?: number;
  discount_unit?: "percent" | "mmk";
  billed_at?: string;
};

export async function listAllLabServices(q = "", all = true): Promise<LabService[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (all) params.set("all", "1");
  const qs = params.toString() ? `?${params}` : "";
  const res = await apiFetch<{ services: LabService[] }>(`/api/lab/services${qs}`);
  return res.services;
}

export async function createLabService(body: {
  code: string;
  name: string;
  price_mmk: number;
}): Promise<LabService> {
  return apiFetch<LabService>("/api/lab/services", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateLabService(
  id: number,
  body: { code: string; name: string; price_mmk: number; active: boolean },
): Promise<LabService> {
  return apiFetch<LabService>(`/api/lab/services/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deactivateLabService(id: number): Promise<void> {
  await apiFetch(`/api/lab/services/${id}`, { method: "DELETE" });
}

export async function deleteLabService(id: number): Promise<void> {
  await apiFetch(`/api/lab/services/${id}/delete`, { method: "POST", body: "{}" });
}

export async function listLabServiceHistory(q = ""): Promise<LabServiceHistoryRow[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const res = await apiFetch<{ history: LabServiceHistoryRow[] }>(
    `/api/lab/services/history${qs}`,
  );
  return res.history;
}

export async function listLabServices(q = ""): Promise<LabService[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ services: LabService[] }>(`/api/lab/catalog/services${qs}`);
  return res.services;
}

export async function findLabServiceByCode(code: string): Promise<LabService | null> {
  const res = await apiFetch<{ services: LabService[] }>(
    `/api/lab/catalog/services?code=${encodeURIComponent(code.trim())}`,
  );
  return res.services[0] ?? null;
}

export async function listLabDoctors(q = ""): Promise<LabDoctor[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ doctors: LabDoctor[] }>(`/api/lab/catalog/doctors${qs}`);
  return res.doctors;
}

export async function listLabBills(
  q = "",
  status = "",
  opts?: { money?: string; from?: string; to?: string; sort?: string },
): Promise<LabBill[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status.trim()) params.set("status", status.trim());
  if (opts?.money?.trim()) params.set("money", opts.money.trim());
  if (opts?.from?.trim()) params.set("from", opts.from.trim());
  if (opts?.to?.trim()) params.set("to", opts.to.trim());
  if (opts?.sort?.trim()) params.set("sort", opts.sort.trim());
  const qs = params.toString() ? `?${params}` : "";
  const res = await apiFetch<{ bills: LabBill[] }>(`/api/lab/bills${qs}`);
  return res.bills;
}

export async function getLabBill(id: number): Promise<LabBill> {
  return apiFetch<LabBill>(`/api/lab/bills/${id}`);
}

export async function createLabBill(body: LabBillWrite): Promise<LabBill> {
  return apiFetch<LabBill>("/api/lab/bills", { method: "POST", body: JSON.stringify(body) });
}

export async function updateLabBill(id: number, body: LabBillWrite): Promise<LabBill> {
  return apiFetch<LabBill>(`/api/lab/bills/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function payLabBill(id: number, admissionId?: number | null): Promise<LabBill> {
  const body = admissionId != null ? JSON.stringify({ admission_id: admissionId }) : "{}";
  return apiFetch<LabBill>(`/api/lab/bills/${id}/pay`, { method: "POST", body });
}

export async function markLabBillPrinted(id: number): Promise<LabBill> {
  return apiFetch<LabBill>(`/api/lab/bills/${id}/printed`, { method: "POST", body: "{}" });
}

export async function voidLabBill(id: number, reason: string): Promise<LabBill> {
  return apiFetch<LabBill>(`/api/lab/bills/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function purgeLabBill(id: number): Promise<void> {
  await apiFetch(`/api/lab/bills/${id}`, { method: "DELETE" });
}

export async function printLabBill(
  id: number,
  opts?: { title?: string; note?: string; onPrinted?: () => void | Promise<void> },
): Promise<void> {
  return fetchAndPreviewPrint(`/api/lab/bills/${id}/print`, getApiBase, getStoredToken, {
    title: opts?.title ?? "Lab receipt",
    note: opts?.note,
    receipt: true,
    onPrinted: opts?.onPrinted,
  });
}
