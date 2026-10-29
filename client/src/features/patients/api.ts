import { apiFetch, getApiBase } from "@/shared/api";
import { getStoredToken } from "@/shared/auth";
import { fetchAndPreviewPrint } from "@/shared/print";

export type PatientChart = {
  id: number;
  name: string;
  phone: string;
  age_years: number | null;
  gender: string;
  date_of_birth: string;
  nrc: string;
  father_mother_name: string;
  notes: string;
  updated_at: string;
  open_admission_id?: number | null;
};

export type PatientWrite = {
  name: string;
  phone: string;
  age_years: number | null;
  gender: string;
  date_of_birth: string;
  nrc: string;
  father_mother_name: string;
  notes: string;
};

export type PatientHistoryBillKind = "opd" | "pharmacy" | "ot";

export type PatientHistoryOpd = {
  id: number;
  bill_no: string;
  status: string;
  total_mmk: number;
  created_at: string;
  doctor_name: string;
  printed_at?: string | null;
  collected_cash?: number | null;
};

export type PatientHistoryPharmacy = {
  id: number;
  bill_no: string;
  status: string;
  total_mmk: number;
  created_at: string;
  printed_at?: string | null;
  collected_cash?: number | null;
};

export type PatientHistoryOt = {
  case_no: string;
  status: string;
  bill_id?: number;
  bill_no: string;
  bill_status: string;
  bill_total_mmk?: number | null;
  bill_printed_at?: string | null;
  bill_collected_cash?: number | null;
  created_at: string;
};

export type PatientHistoryIpd = {
  admission_no: string;
  status: string;
  admitted_at: string;
  balance_mmk: number;
  settled: boolean;
};

export type PatientHistory = {
  opd: PatientHistoryOpd[];
  pharmacy: PatientHistoryPharmacy[];
  ot: PatientHistoryOt[];
  ipd: PatientHistoryIpd[];
};

export async function getPatient(id: number): Promise<PatientChart> {
  return apiFetch<PatientChart>(`/api/patients/${id}`);
}

export async function listPatients(q = ""): Promise<PatientChart[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ patients: PatientChart[] }>(`/api/patients${qs}`);
  return res.patients ?? [];
}

export async function createPatient(body: PatientWrite): Promise<PatientChart> {
  return apiFetch<PatientChart>("/api/patients", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updatePatient(id: number, body: PatientWrite): Promise<PatientChart> {
  return apiFetch<PatientChart>(`/api/patients/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** Admin-only. Server refuses charts that have any linked voucher or IPD stay. */
export async function deletePatient(id: number): Promise<void> {
  await apiFetch(`/api/patients/${id}`, { method: "DELETE" });
}

export async function fetchPatientHistory(id: number): Promise<PatientHistory> {
  return apiFetch<PatientHistory>(`/api/patients/${id}/history`);
}

export async function attachPatientBill(id: number, billNo: string): Promise<void> {
  await apiFetch(`/api/patients/${id}/attach`, {
    method: "POST",
    body: JSON.stringify({ bill_no: billNo }),
  });
}

/** Open receipt preview for a bill already on this chart. Does not stamp printed. */
export async function printPatientHistoryBill(
  chartId: number,
  kind: PatientHistoryBillKind,
  billId: number,
  title: string,
): Promise<void> {
  return fetchAndPreviewPrint(
    `/api/patients/${chartId}/bills/${kind}/${billId}/print`,
    getApiBase,
    getStoredToken,
    // OT patient bills are A4; OPD/Pharmacy stay thermal (narrow preview).
    { title, receipt: kind !== "ot" },
  );
}
