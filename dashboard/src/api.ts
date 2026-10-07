export type HealthResponse = {
  status: string;
  service: string;
  time: string;
  db: string;
};

const DEFAULT_API_BASE = "http://127.0.0.1:8080";
/** Distinct from clinic client's mudita_token / mudita_api_base */
const TOKEN_KEY = "mudita_dash_token";
const API_BASE_KEY = "mudita_dash_api_base";
const API_CONFIGURED_KEY = "mudita_dash_api_configured";

/** True after the user has completed (or skipped) the Server IP screen once. */
export function isApiConfigured(): boolean {
  return localStorage.getItem(API_CONFIGURED_KEY) === "1";
}

export function getApiBase(): string {
  const stored = localStorage.getItem(API_BASE_KEY);
  if (stored) {
    return stored.replace(/\/$/, "");
  }
  return import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || DEFAULT_API_BASE;
}

/** Persist API base as http://host:port (adds http:// and :8080 when needed). */
export function setApiBase(input: string): string {
  const normalized = normalizeApiBase(input);
  localStorage.setItem(API_BASE_KEY, normalized);
  localStorage.setItem(API_CONFIGURED_KEY, "1");
  return normalized;
}

export function markApiConfigured(): void {
  localStorage.setItem(API_CONFIGURED_KEY, "1");
  if (!localStorage.getItem(API_BASE_KEY)) {
    localStorage.setItem(API_BASE_KEY, getApiBase());
  }
}

export function clearApiBaseConfig(): void {
  localStorage.removeItem(API_BASE_KEY);
  localStorage.removeItem(API_CONFIGURED_KEY);
}

export function normalizeApiBase(input: string): string {
  let s = input.trim().replace(/\/$/, "");
  if (!s) {
    throw new Error("Server address required");
  }
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  try {
    const u = new URL(s);
    if (!u.port) {
      u.port = "8080";
    }
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    throw new Error("Invalid server address");
  }
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${getApiBase()}/api/health`, { signal });
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return res.json() as Promise<HealthResponse>;
}

/** Authenticated JSON fetch. Throws Error with message from API body when possible. */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export { authHeaders, DEFAULT_API_BASE, API_BASE_KEY, TOKEN_KEY };
