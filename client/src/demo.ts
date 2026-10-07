import { apiFetch } from "./api";

export type DemoStatus = {
  training_doctors: number;
  training_services: number;
  training_items: number;
  training_opd_bills: number;
  training_ot_bills: number;
  seeded: boolean;
};

export async function fetchDemoStatus(): Promise<DemoStatus> {
  return apiFetch<DemoStatus>("/api/demo/status");
}

export async function seedDemo(): Promise<{ ok: boolean; message: string; created: Record<string, number> }> {
  return apiFetch("/api/demo/seed", { method: "POST", body: "{}" });
}

export async function resetDemo(): Promise<{ ok: boolean; message: string; created: Record<string, number> }> {
  return apiFetch("/api/demo/reset", { method: "POST", body: "{}" });
}
