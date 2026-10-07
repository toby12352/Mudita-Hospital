import { apiFetch } from "./api";
import type { Role } from "./auth";

export type HospitalSettings = {
  hospital_name: string;
  address: string;
  phone: string;
  logo_path: string;
  updated_at?: string;
};

export type DoctorFees = {
  consultation_mmk: number;
  ot_mmk: number;
};

export type Doctor = {
  id: number;
  name: string;
  specialty: string;
  active: boolean;
  fees: DoctorFees;
  created_at?: string;
  updated_at?: string;
};

export type Service = {
  id: number;
  code: string;
  name: string;
  price_mmk: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ManagedUser = {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  must_change_password: boolean;
  active: boolean;
  created_at?: string;
};

export async function fetchHospitalSettings(): Promise<HospitalSettings> {
  return apiFetch<HospitalSettings>("/api/settings");
}

export async function saveHospitalSettings(
  body: Omit<HospitalSettings, "updated_at">,
): Promise<HospitalSettings> {
  return apiFetch<HospitalSettings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function listDoctors(q = ""): Promise<Doctor[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}&all=1` : "?all=1";
  const res = await apiFetch<{ doctors: Doctor[] }>(`/api/doctors${qs}`);
  return res.doctors;
}

export async function createDoctor(body: {
  name: string;
  specialty: string;
  consultation_mmk: number;
  ot_mmk: number;
}): Promise<Doctor> {
  return apiFetch<Doctor>("/api/doctors", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateDoctor(
  id: number,
  body: {
    name: string;
    specialty: string;
    consultation_mmk: number;
    ot_mmk: number;
    active: boolean;
  },
): Promise<Doctor> {
  return apiFetch<Doctor>(`/api/doctors/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deactivateDoctor(id: number): Promise<void> {
  await apiFetch(`/api/doctors/${id}`, { method: "DELETE" });
}

export async function listServices(q = ""): Promise<Service[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}&all=1` : "?all=1";
  const res = await apiFetch<{ services: Service[] }>(`/api/services${qs}`);
  return res.services;
}

export async function createService(body: {
  code: string;
  name: string;
  price_mmk: number;
}): Promise<Service> {
  return apiFetch<Service>("/api/services", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateService(
  id: number,
  body: { code: string; name: string; price_mmk: number; active: boolean },
): Promise<Service> {
  return apiFetch<Service>(`/api/services/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deactivateService(id: number): Promise<void> {
  await apiFetch(`/api/services/${id}`, { method: "DELETE" });
}

export async function listUsers(q = ""): Promise<ManagedUser[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ users: ManagedUser[] }>(`/api/users${qs}`);
  return res.users;
}

export async function createUser(body: {
  username: string;
  display_name: string;
  role: "Reception" | "Pharmacy";
  password: string;
}): Promise<ManagedUser> {
  return apiFetch<ManagedUser>("/api/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateUser(
  id: number,
  body: {
    display_name?: string;
    role?: "Reception" | "Pharmacy" | "Admin";
    active?: boolean;
    password?: string;
  },
): Promise<ManagedUser> {
  return apiFetch<ManagedUser>(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
