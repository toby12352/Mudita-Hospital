import type { StockTransfer } from "@/features/pharmacy/api";
import { apiFetch, getApiBase } from "@/shared/api";
import { getStoredToken } from "@/shared/auth";
import { fetchAndPreviewPrint } from "@/shared/print";

export type OtStockBatch = {
  id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  stock_unit: string;
  dosage: string;
  buy_price_mmk: number;
  sell_price_mmk: number;
  pack_l1_qty: number;
  pack_l1_unit: string;
  pack_l2_qty: number;
  pack_l2_unit: string;
  pack_l3_qty: number;
  pack_l3_unit: string;
  batch_no: string;
  expiry_date: string | null;
  qty: number;
};

export async function listOtStock(): Promise<OtStockBatch[]> {
  const res = await apiFetch<{ batches: OtStockBatch[] }>("/api/ot/stock");
  return res.batches ?? [];
}

export async function labelOtBatch(
  batchId: number,
  body: { batch_no: string; expiry_date: string },
): Promise<{ id: number; batch_no: string; expiry_date: string; qty: number }> {
  return apiFetch(`/api/ot/stock/${batchId}/label`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function returnOtStock(batchId: number, qty: number): Promise<StockTransfer> {
  return apiFetch<StockTransfer>(`/api/ot/stock/${batchId}/return`, {
    method: "POST",
    body: JSON.stringify({ qty }),
  });
}

export type OtCatalogItem = {
  id: number;
  code: string;
  name: string;
  sell_price_mmk: number;
  stock_unit: string;
  ot_on_hand: number;
  pack_l1_qty: number;
  pack_l1_unit: string;
  pack_l2_qty: number;
  pack_l2_unit: string;
  pack_l3_qty: number;
  pack_l3_unit: string;
};

export async function listOtCatalogItems(q = ""): Promise<OtCatalogItem[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const res = await apiFetch<{ items: OtCatalogItem[] }>(`/api/ot/catalog/items${qs}`);
  return res.items ?? [];
}

export async function findOtCatalogItem(code: string): Promise<OtCatalogItem | null> {
  const res = await apiFetch<{ items: OtCatalogItem[] }>(
    `/api/ot/catalog/items?code=${encodeURIComponent(code.trim())}`,
  );
  return res.items?.[0] ?? null;
}

export type OtService = {
  id: number;
  code: string;
  name: string;
  price_mmk: number | null;
};

export type OtMasterService = {
  id: number;
  code: string;
  name: string;
  price_mmk: number | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type OtServiceWrite = {
  code: string;
  name: string;
  price_mmk: number | null;
  active?: boolean;
};

export async function listOtMasterServices(q = ""): Promise<OtMasterService[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}&all=1` : "?all=1";
  const res = await apiFetch<{ services: OtMasterService[] }>(`/api/ot/services${qs}`);
  return res.services ?? [];
}

export async function createOtMasterService(body: OtServiceWrite): Promise<OtMasterService> {
  return apiFetch<OtMasterService>("/api/ot/services", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateOtMasterService(
  id: number,
  body: OtServiceWrite,
): Promise<OtMasterService> {
  return apiFetch<OtMasterService>(`/api/ot/services/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deactivateOtMasterService(id: number): Promise<void> {
  await apiFetch(`/api/ot/services/${id}`, { method: "DELETE" });
}

export async function deleteOtMasterService(id: number): Promise<void> {
  await apiFetch(`/api/ot/services/${id}/delete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type OtServiceHistoryRow = {
  id: number;
  actor_username?: string;
  action: string;
  entity_id?: number;
  code: string;
  name: string;
  detail?: string;
  created_at: string;
};

export async function listOtServiceHistory(q = ""): Promise<OtServiceHistoryRow[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ history: OtServiceHistoryRow[] }>(`/api/ot/services/history${qs}`);
  return res.history ?? [];
}

export async function listOtServices(q = ""): Promise<OtService[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const res = await apiFetch<{ services: OtService[] }>(`/api/ot/catalog/services${qs}`);
  return res.services ?? [];
}

export async function findOtServiceByCode(code: string): Promise<OtService | null> {
  const res = await apiFetch<{ services: OtService[] }>(
    `/api/ot/catalog/services?code=${encodeURIComponent(code.trim())}`,
  );
  return res.services?.[0] ?? null;
}

export type OtCaseItem = {
  id?: number;
  item_id: number;
  code: string;
  name: string;
  sell_price_mmk: number;
  qty_issued: number;
  /** Chosen sale count. 0 when the line has no unit (legacy stock qty). */
  sale_qty?: number;
  sale_unit?: string;
  qty_used: number;
  qty_returned: number;
  qty_wasted: number;
  qty_kept_on_floor: number;
  sort_order?: number;
  pack_l1_qty?: number;
  pack_l1_unit?: string;
  pack_l2_qty?: number;
  pack_l2_unit?: string;
  pack_l3_qty?: number;
  pack_l3_unit?: string;
};

/** Draft cart service line. unit_price_mmk is the case charge (null until typed). */
export type OtCaseService = {
  id?: number;
  ref_id: number;
  code: string;
  description: string;
  unit_price_mmk: number | null;
  sort_order?: number;
};

export type OtCase = {
  id: number;
  case_no: string;
  patient_id?: number | null;
  patient_name: string;
  patient_phone: string;
  patient_age_years?: number | null;
  patient_gender: string;
  doctor_id?: number | null;
  doctor_name: string;
  procedure_name: string;
  notes: string;
  discount_value?: number;
  discount_unit?: "percent" | "mmk" | string;
  status: "draft" | "issued" | "reconciled" | "billed" | "void" | string;
  issued_at?: string | null;
  reconciled_at?: string | null;
  ot_bill_id?: number | null;
  bill_status?: string | null;
  bill_printed_at?: string | null;
  bill_collected_cash?: number | null;
  created_at: string;
  updated_at: string;
  items?: OtCaseItem[];
  services?: OtCaseService[];
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
  lines?: OtBillLine[];
};

export type OtCaseWrite = {
  patient_id?: number | null;
  patient_name: string;
  patient_phone: string;
  patient_age_years?: number | null;
  patient_gender: string;
  doctor_id?: number | null;
  doctor_name?: string;
  procedure_name: string;
  notes: string;
  items: OtCaseItem[];
  services: OtCaseService[];
  discount_value?: number;
  discount_unit?: "percent" | "mmk";
};

export async function listOtDoctors(q = ""): Promise<OtDoctor[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ doctors: OtDoctor[] }>(`/api/ot/catalog/doctors${qs}`);
  return res.doctors;
}

export async function listOtCases(
  q = "",
  status = "",
  opts?: { money?: string; from?: string; to?: string; sort?: string },
): Promise<OtCase[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status.trim()) params.set("status", status.trim());
  if (opts?.money?.trim()) params.set("money", opts.money.trim());
  if (opts?.from?.trim()) params.set("from", opts.from.trim());
  if (opts?.to?.trim()) params.set("to", opts.to.trim());
  if (opts?.sort?.trim()) params.set("sort", opts.sort.trim());
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

export async function createOtBillFromCase(
  caseId: number,
  services: OtBillLine[] = [],
  discount?: { discount_value: number; discount_unit: "percent" | "mmk" },
): Promise<OtBill> {
  return apiFetch<OtBill>(`/api/ot/cases/${caseId}/bill`, {
    method: "POST",
    body: JSON.stringify({
      services,
      discount_value: discount?.discount_value ?? 0,
      discount_unit: discount?.discount_unit ?? "percent",
    }),
  });
}

export async function updateOtBill(
  id: number,
  services: OtBillLine[],
  discount?: { discount_value: number; discount_unit: "percent" | "mmk" },
): Promise<OtBill> {
  return apiFetch<OtBill>(`/api/ot/bills/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      lines: services,
      discount_value: discount?.discount_value ?? 0,
      discount_unit: discount?.discount_unit ?? "percent",
    }),
  });
}

export async function listOtBills(q = "", status = ""): Promise<OtBill[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status.trim()) params.set("status", status.trim());
  const qs = params.toString() ? `?${params}` : "";
  const res = await apiFetch<{ bills: OtBill[] }>(`/api/ot/bills${qs}`);
  return res.bills;
}

export async function getOtBill(id: number): Promise<OtBill> {
  return apiFetch<OtBill>(`/api/ot/bills/${id}`);
}

export async function payOtBill(id: number, admissionId?: number | null): Promise<OtBill> {
  const body = admissionId != null ? JSON.stringify({ admission_id: admissionId }) : "{}";
  return apiFetch<OtBill>(`/api/ot/bills/${id}/pay`, { method: "POST", body });
}

export async function markOtBillPrinted(id: number): Promise<OtBill> {
  return apiFetch<OtBill>(`/api/ot/bills/${id}/printed`, { method: "POST", body: "{}" });
}

export async function voidOtBill(id: number, reason: string): Promise<OtBill> {
  return apiFetch<OtBill>(`/api/ot/bills/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** Admin-only. Permanently removes a draft or void bill. Keeps the OT case. */
export async function purgeOtBill(id: number): Promise<void> {
  await apiFetch(`/api/ot/bills/${id}`, { method: "DELETE" });
}

async function printHtml(
  path: string,
  opts: {
    title: string;
    note?: string;
    receipt?: boolean;
    onPrinted?: () => void | Promise<void>;
  },
): Promise<void> {
  return fetchAndPreviewPrint(path, getApiBase, getStoredToken, opts);
}

export async function printOtPickList(caseId: number): Promise<void> {
  return printHtml(`/api/ot/cases/${caseId}/pick-list`, {
    title: "OT pick list",
    receipt: false,
  });
}

export async function printOtBill(
  billId: number,
  opts?: { title?: string; note?: string; onPrinted?: () => void | Promise<void> },
): Promise<void> {
  return printHtml(`/api/ot/bills/${billId}/print`, {
    title: opts?.title ?? "OT receipt",
    note: opts?.note,
    receipt: true,
    onPrinted: opts?.onPrinted,
  });
}
