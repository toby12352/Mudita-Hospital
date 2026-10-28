import { ApiError, userMessage } from "@/shared/errors";

export type HealthResponse = {
  status: string;
  service: string;
  time: string;
  db: string;
};

const DEFAULT_API_BASE = "http://127.0.0.1:8080";
const TOKEN_KEY = "mudita_token";
const API_BASE_KEY = "mudita_api_base";
const API_CONFIGURED_KEY = "mudita_api_configured";

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
    throw new Error(userMessage("Server address required"));
  }
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  try {
    const u = new URL(s);
    if (!u.port) {
      u.port = "8080";
    }
    // Drop trailing slash / path — API base is origin only.
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    throw new Error(userMessage("Invalid server address"));
  }
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Fetch /api/health. Returns the JSON body even when HTTP is 503 (DB down),
 * so the UI can show a records message instead of “unreachable”.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let res: Response;
  try {
    res = await fetch(`${getApiBase()}/api/health`, { signal });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") {
      throw new ApiError(userMessage("Failed to fetch"), "Failed to fetch", 0);
    }
    throw new ApiError(
      userMessage(err instanceof Error ? err.message : "Failed to fetch"),
      err instanceof Error ? err.message : "Failed to fetch",
      0,
    );
  }
  const body = (await res.json().catch(() => null)) as HealthResponse | null;
  if (body && typeof body.status === "string" && typeof body.db === "string") {
    return body;
  }
  const raw = `Health check failed (${res.status})`;
  throw new ApiError(userMessage(raw, res.status), raw, res.status);
}

/** Authenticated JSON fetch. Throws ApiError with a plain-language message. */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Failed to fetch";
    throw new ApiError(userMessage(raw), raw, 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = (body as { error?: string }).error || `Request failed (${res.status})`;
    throw new ApiError(userMessage(raw, res.status), raw, res.status);
  }
  return body as T;
}

export { authHeaders, DEFAULT_API_BASE, API_BASE_KEY };
