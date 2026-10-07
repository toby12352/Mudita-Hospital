import { apiFetch, getApiBase } from "./api";
import { getStoredToken } from "./auth";
import { formatMMK } from "./opd";
import { fetchAndPreviewPrint } from "./print";

export type OtCaseItem = {
  id?: number;
  item_id: number;
  code: string;
  name: string;
  sell_price_mmk: number;
  qty_issued: number;
  qty_used: number;
  qty_returned: number;
  qty_wasted: number;
  qty_kept_on_floor: number;
  sort_order?: number;
};

export type OtCase = {
  id: number;
  case_no: string;
  patient_name: string;
  patient_phone: string;
  patient_age_years?: number | null;
  patient_gender: string;
  doctor_id?: number | null;
  doctor_name: string;
  procedure_name: string;
  notes: string;
  status: "draft" | "issued" | "reconciled" | "billed" | "void" | string;
  issued_at?: string | null;
  reconciled_at?: string | null;
  ot_bill_id?: number | null;
  created_at: string;
  updated_at: string;
  items?: OtCaseItem[];
  doctor_ot_fee_mmk?: number;
};

export type OtDoctor = {
  id: number;
  name: string;
  specialty: string;
  ot_fee_mmk: number;
};

export type OtBillLine = {
  id?: number;
  line_type: "service" | "item" | "ot_fee";
  ref_id?: number | null;
  code: string;
  description: string;
  qty: number;
  unit_price_mmk: number;
  line_total_mmk: number;
  sort_order?: number;
};

export type OtBill = {
  id: number;
  bill_no: string;
  case_id: number;
  case_no: string;
  patient_name: string;
  patient_phone: string;
  patient_age_years?: number | null;
  patient_gender: string;
  doctor_id?: number | null;
  doctor_name: string;
  procedure_name: string;
  status: "draft" | "paid" | "void" | string;
  total_mmk: number;
  paid_at?: string | null;
  voided_at?: string | null;
  void_reason?: string;
  created_at: string;
  updated_at: string;
  lines?: OtBillLine[];
};

export type OtCaseWrite = {
  patient_name: string;
  patient_phone: string;
  patient_age_years?: number | null;
  patient_gender: string;
  doctor_id?: number | null;
  procedure_name: string;
  notes: string;
  items: OtCaseItem[];
};

export { formatMMK };

export async function listOtDoctors(q = ""): Promise<OtDoctor[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ doctors: OtDoctor[] }>(`/api/ot/catalog/doctors${qs}`);
  return res.doctors;
}

export async function listOtCases(q = "", status = ""): Promise<OtCase[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status.trim()) params.set("status", status.trim());
  const qs = params.toString() ? `?${params}` : "";
  const res = await apiFetch<{ cases: OtCase[] }>(`/api/ot/cases${qs}`);
  return res.cases;
}

export async function getOtCase(id: number): Promise<OtCase> {
  return apiFetch<OtCase>(`/api/ot/cases/${id}`);
}

export async function createOtCase(body: OtCaseWrite): Promise<OtCase> {
  return apiFetch<OtCase>("/api/ot/cases", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateOtCase(id: number, body: OtCaseWrite): Promise<OtCase> {
  return apiFetch<OtCase>(`/api/ot/cases/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function issueOtCase(id: number): Promise<OtCase> {
  return apiFetch<OtCase>(`/api/ot/cases/${id}/issue`, { method: "POST", body: "{}" });
}

export async function reconcileOtCase(
  id: number,
  items: {
    id: number;
    qty_used: number;
    qty_returned: number;
    qty_wasted: number;
    qty_kept_on_floor: number;
  }[],
): Promise<OtCase> {
  return apiFetch<OtCase>(`/api/ot/cases/${id}/reconcile`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function createOtBillFromCase(
  caseId: number,
  services: OtBillLine[] = [],
): Promise<OtBill> {
  return apiFetch<OtBill>(`/api/ot/cases/${caseId}/bill`, {
    method: "POST",
    body: JSON.stringify({ services }),
  });
}

export async function getOtBill(id: number): Promise<OtBill> {
  return apiFetch<OtBill>(`/api/ot/bills/${id}`);
}

export async function payOtBill(id: number): Promise<OtBill> {
  return apiFetch<OtBill>(`/api/ot/bills/${id}/pay`, { method: "POST", body: "{}" });
}

export async function voidOtBill(id: number, reason: string): Promise<OtBill> {
  return apiFetch<OtBill>(`/api/ot/bills/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

async function printHtml(
  path: string,
  opts: { title: string; receipt?: boolean },
): Promise<void> {
  return fetchAndPreviewPrint(path, getApiBase, getStoredToken, opts);
}

export async function printOtPickList(caseId: number): Promise<void> {
  return printHtml(`/api/ot/cases/${caseId}/pick-list`, {
    title: "OT pick list",
    receipt: false,
  });
}

export async function printOtBill(billId: number): Promise<void> {
  return printHtml(`/api/ot/bills/${billId}/print`, {
    title: "OT receipt",
    receipt: true,
  });
}
