import { apiFetch, getApiBase } from "@/shared/api";
import { getStoredToken } from "@/shared/auth";
import { fetchAndPreviewPrint } from "@/shared/print";

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
  admitted_at: string;
  discharged_at: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  patient: IpdPatient;
  balance_mmk?: number;
  ledger?: IpdLedgerLine[];
};

export async function listIpdAdmissions(status = "open"): Promise<IpdAdmission[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiFetch<{ admissions: IpdAdmission[] }>(`/api/ipd/admissions${qs}`);
  return res.admissions ?? [];
}

export async function getIpdAdmission(id: number): Promise<IpdAdmission> {
  return apiFetch<IpdAdmission>(`/api/ipd/admissions/${id}`);
}

export async function admitPatient(patientId: number): Promise<IpdAdmission> {
  return apiFetch<IpdAdmission>("/api/ipd/admissions", {
    method: "POST",
    body: JSON.stringify({ patient_id: patientId }),
  });
}

export async function updateIpdNotes(id: number, notes: string): Promise<IpdAdmission> {
  return apiFetch<IpdAdmission>(`/api/ipd/admissions/${id}`, {
    method: "PUT",
    body: JSON.stringify({ notes }),
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
