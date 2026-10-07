import { apiFetch, getApiBase, TOKEN_KEY } from "./api";

export type MasterItem = {
  id: number;
  code: string;
  name: string;
  category: string;
  buy_price_mmk: number;
  sell_price_mmk: number;
  reorder_level: number;
  active: boolean;
  stock_main: number;
  low_stock: boolean;
};

export type MasterService = {
  id: number;
  code: string;
  name: string;
  price_mmk: number;
  active: boolean;
};

export type MasterDoctor = {
  id: number;
  name: string;
  specialty: string;
  active: boolean;
  fees: { consultation_mmk: number; ot_mmk: number };
};

export type AuditLog = {
  id: number;
  actor_user_id?: number;
  actor_username?: string;
  action: string;
  entity: string;
  entity_id?: number;
  detail?: string;
  created_at: string;
};

export type CsvImportError = { line: number; message: string };

export type CsvImportResult = {
  dry_run: boolean;
  valid: number;
  applied: number;
  errors: CsvImportError[];
  would_ok: boolean;
  status?: string;
};

export async function listMasterItems(q = ""): Promise<MasterItem[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}&all=1` : "?all=1";
  const res = await apiFetch<{ items: MasterItem[] }>(`/api/pharmacy/items${qs}`);
  return res.items;
}

export async function listMasterServices(q = ""): Promise<MasterService[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}&all=1` : "?all=1";
  const res = await apiFetch<{ services: MasterService[] }>(`/api/services${qs}`);
  return res.services;
}

export async function listMasterDoctors(q = ""): Promise<MasterDoctor[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}&all=1` : "?all=1";
  const res = await apiFetch<{ doctors: MasterDoctor[] }>(`/api/doctors${qs}`);
  return res.doctors;
}

export async function bulkUpdateItems(body: {
  reason: string;
  ids: number[];
  buy_price_mmk?: number;
  sell_price_mmk?: number;
  reorder_level?: number;
}): Promise<{ status: string; updated: number }> {
  return apiFetch("/api/dashboard/bulk/items", {
    method: "POST",
    body: JSON.stringify({ confirm: "UPDATE", ...body }),
  });
}

export async function bulkUpdateServices(body: {
  reason: string;
  ids: number[];
  price_mmk: number;
}): Promise<{ status: string; updated: number }> {
  return apiFetch("/api/dashboard/bulk/services", {
    method: "POST",
    body: JSON.stringify({ confirm: "UPDATE", ...body }),
  });
}

export async function bulkUpdateDoctors(body: {
  reason: string;
  ids: number[];
  consultation_mmk?: number;
  ot_mmk?: number;
}): Promise<{ status: string; updated: number }> {
  return apiFetch("/api/dashboard/bulk/doctors", {
    method: "POST",
    body: JSON.stringify({ confirm: "UPDATE", ...body }),
  });
}

export async function fetchAuditLogs(opts?: {
  limit?: number;
  entity?: string;
  action?: string;
  q?: string;
}): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.entity) params.set("entity", opts.entity);
  if (opts?.action) params.set("action", opts.action);
  if (opts?.q) params.set("q", opts.q);
  const q = params.toString() ? `?${params}` : "";
  const res = await apiFetch<{ logs: AuditLog[] }>(`/api/dashboard/audit${q}`);
  return res.logs;
}

export async function importCSV(
  kind: "items" | "services" | "doctors",
  body: { csv: string; dry_run: boolean; reason?: string },
): Promise<CsvImportResult> {
  const payload: Record<string, unknown> = {
    csv: body.csv,
    dry_run: body.dry_run,
  };
  if (!body.dry_run) {
    payload.confirm = "IMPORT";
    payload.reason = body.reason ?? "";
  }
  return apiFetch(`/api/dashboard/import/${kind}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Download CSV export as a browser file (not JSON). */
export async function downloadExportCSV(kind: "items" | "services" | "doctors"): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${getApiBase()}/api/dashboard/export/${kind}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match?.[1] ?? `mudita-${kind}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
