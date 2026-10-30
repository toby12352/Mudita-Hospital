import { apiFetch, getApiBase } from "@/shared/api";
import { getStoredToken } from "@/shared/auth";
import { fetchAndPreviewPrint, fetchPrintHtml } from "@/shared/print";

export type IpdPatient = {
  id: number;
  name: string;
  phone: string;
  age_years: number | null;
  gender: string;
};

export type IpdLedgerLine = {
  id: number;
  admission_id: number;
  kind: string;
  amount_mmk: number;
  source: string;
  source_id: number | null;
  note: string;
  actor_user_id: number | null;
  created_at: string;
};

export type IpdAdmission = {
  id: number;
  admission_no: string;
  patient_id: number;
  status: string;
  notes: string;
  room_no: string;
  admitted_at: string;
  discharged_at: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  patient: IpdPatient;
  balance_mmk?: number;
  ledger?: IpdLedgerLine[];
  /** Yesterday's stored voucher: issued, paid, or credit. Blank when none exists. */
  yesterday_voucher_status?: string;
};

export async function listIpdAdmissions(status = "open"): Promise<IpdAdmission[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiFetch<{ admissions: IpdAdmission[] }>(`/api/ipd/admissions${qs}`);
  return res.admissions ?? [];
}

export async function getIpdAdmission(id: number): Promise<IpdAdmission> {
  return apiFetch<IpdAdmission>(`/api/ipd/admissions/${id}`);
}

export async function admitPatient(
  patientId: number,
  opts?: { billed_at?: string },
): Promise<IpdAdmission> {
  const body: { patient_id: number; billed_at?: string } = { patient_id: patientId };
  if (opts?.billed_at) body.billed_at = opts.billed_at;
  return apiFetch<IpdAdmission>("/api/ipd/admissions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateIpdNotes(id: number, notes: string, roomNo: string): Promise<IpdAdmission> {
  return apiFetch<IpdAdmission>(`/api/ipd/admissions/${id}`, {
    method: "PUT",
    body: JSON.stringify({ notes, room_no: roomNo }),
  });
}

export async function postIpdDeposit(id: number, amountMmk: number, note: string): Promise<IpdAdmission> {
  return apiFetch<IpdAdmission>(`/api/ipd/admissions/${id}/deposits`, {
    method: "POST",
    body: JSON.stringify({ amount_mmk: amountMmk, note }),
  });
}

export async function postIpdWardCharge(
  id: number,
  description: string,
  amountMmk: number,
): Promise<IpdAdmission> {
  return apiFetch<IpdAdmission>(`/api/ipd/admissions/${id}/ward-charges`, {
    method: "POST",
    body: JSON.stringify({ description, amount_mmk: amountMmk }),
  });
}

/** Deposit voucher, or OPD/OT/Pharmacy bill charged onto the stay. Does not stamp printed. */
export async function printIpdDeposit(admissionId: number, lineId: number, title: string): Promise<void> {
  return fetchAndPreviewPrint(
    `/api/ipd/admissions/${admissionId}/ledger/${lineId}/print`,
    getApiBase,
    getStoredToken,
    { title, receipt: true },
  );
}

export async function dischargeIpd(id: number): Promise<IpdAdmission> {
  return apiFetch<IpdAdmission>(`/api/ipd/admissions/${id}/discharge`, { method: "POST" });
}

export async function printIpdStatement(id: number, title: string): Promise<void> {
  return fetchAndPreviewPrint(`/api/ipd/admissions/${id}/statement`, getApiBase, getStoredToken, {
    title,
    receipt: false,
  });
}

export async function fetchIpdStatementHtml(id: number, date: string): Promise<string> {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return fetchPrintHtml(`/api/ipd/admissions/${id}/statement${q}`, getApiBase, getStoredToken);
}

export type IpdDayVoucher = {
  id: number;
  admission_id: number;
  civil_date: string;
  status: string;
  closing_mmk: number;
  collection_ledger_id?: number | null;
  can_unpay: boolean;
};

function postIpdDayVoucher(id: number, date: string, action: "issue" | "pay" | "credit" | "unpay"): Promise<IpdDayVoucher> {
  return apiFetch<IpdDayVoucher>(
    `/api/ipd/admissions/${id}/vouchers/${encodeURIComponent(date)}/${action}`,
    { method: "POST" },
  );
}

/** Creates the morning sheet for a closed day. Does not collect cash. */
export function issueIpdDayVoucher(id: number, date: string): Promise<IpdDayVoucher> {
  return postIpdDayVoucher(id, date, "issue");
}

/** Collects a လိုငွေ shortfall, or marks a zero / ပိုငွေ day paid. */
export function payIpdDayVoucher(id: number, date: string): Promise<IpdDayVoucher> {
  return postIpdDayVoucher(id, date, "pay");
}

/** Carries လိုငွေ onto the next sheet. No cash line. */
export function creditIpdDayVoucher(id: number, date: string): Promise<IpdDayVoucher> {
  return postIpdDayVoucher(id, date, "credit");
}

/** Removes this decision's collection while the voucher is still the latest one. */
export function unpayIpdDayVoucher(id: number, date: string): Promise<IpdDayVoucher> {
  return postIpdDayVoucher(id, date, "unpay");
}

export type IpdCashLine = {
  kind: string;
  amount_mmk: number;
  admission_no: string;
  patient: string;
  note: string;
  created_at: string;
};

export type IpdCashReport = {
  date: string;
  deposit_mmk: number;
  collection_mmk: number;
  refund_mmk: number;
  net_mmk: number;
  lines: IpdCashLine[];
};

export async function fetchIpdCash(date: string): Promise<IpdCashReport> {
  return apiFetch<IpdCashReport>(`/api/ipd/daily-cash?date=${encodeURIComponent(date)}`);
}

export async function printIpdCash(date: string, title: string): Promise<void> {
  return fetchAndPreviewPrint(
    `/api/ipd/daily-cash/print?date=${encodeURIComponent(date)}`,
    getApiBase,
    getStoredToken,
    { title, receipt: false },
  );
}

export type IpdChargeBillLine = {
  id?: number;
  description: string;
  qty: number;
  unit_price_mmk: number;
  line_total_mmk: number;
  sort_order?: number;
};

export type IpdChargeBill = {
  id: number;
  bill_no: string;
  patient_id?: number | null;
  patient_name: string;
  patient_phone: string;
  patient_age_years?: number | null;
  patient_gender: string;
  admission_id?: number | null;
  status: string;
  total_mmk: number;
  discount_value: number;
  discount_unit: string;
  discount_mmk: number;
  printed_at?: string | null;
  void_reason?: string;
  created_at: string;
  updated_at: string;
  lines?: IpdChargeBillLine[];
};

export type IpdChargeBillWrite = {
  patient_id: number | null;
  patient_name: string;
  patient_phone: string;
  patient_age_years: number | null;
  patient_gender: string;
  discount_value: number;
  discount_unit: "percent" | "mmk";
  lines: { description: string; qty: number; unit_price_mmk: number }[];
};

export async function listIpdChargeBills(
  q = "",
  status = "",
  opts?: { money?: string; from?: string; to?: string; sort?: string },
): Promise<IpdChargeBill[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  if (opts?.money?.trim()) params.set("money", opts.money.trim());
  if (opts?.from?.trim()) params.set("from", opts.from.trim());
  if (opts?.to?.trim()) params.set("to", opts.to.trim());
  if (opts?.sort?.trim()) params.set("sort", opts.sort.trim());
  const qs = params.toString();
  const res = await apiFetch<{ bills: IpdChargeBill[] }>(
    `/api/ipd/charge-bills${qs ? `?${qs}` : ""}`,
  );
  return res.bills ?? [];
}

export async function getIpdChargeBill(id: number): Promise<IpdChargeBill> {
  return apiFetch<IpdChargeBill>(`/api/ipd/charge-bills/${id}`);
}

export async function createIpdChargeBill(body: IpdChargeBillWrite): Promise<IpdChargeBill> {
  return apiFetch<IpdChargeBill>("/api/ipd/charge-bills", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateIpdChargeBill(
  id: number,
  body: IpdChargeBillWrite,
): Promise<IpdChargeBill> {
  return apiFetch<IpdChargeBill>(`/api/ipd/charge-bills/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function chargeIpdChargeBill(id: number): Promise<IpdChargeBill> {
  return apiFetch<IpdChargeBill>(`/api/ipd/charge-bills/${id}/charge`, {
    method: "POST",
    body: "{}",
  });
}

export async function markIpdChargeBillPrinted(id: number): Promise<IpdChargeBill> {
  return apiFetch<IpdChargeBill>(`/api/ipd/charge-bills/${id}/printed`, {
    method: "POST",
    body: "{}",
  });
}

export async function voidIpdChargeBill(id: number, reason: string): Promise<IpdChargeBill> {
  return apiFetch<IpdChargeBill>(`/api/ipd/charge-bills/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** Admin-only. Permanently removes a draft or void bill. */
export async function purgeIpdChargeBill(id: number): Promise<void> {
  await apiFetch(`/api/ipd/charge-bills/${id}`, { method: "DELETE" });
}

/** A4 charge slip. Not the daily voucher. */
export async function printIpdChargeBill(id: number, title: string): Promise<void> {
  return fetchAndPreviewPrint(`/api/ipd/charge-bills/${id}/print`, getApiBase, getStoredToken, {
    title,
    receipt: false,
  });
}
