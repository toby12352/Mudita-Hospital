import { apiFetch, getApiBase } from "./api";

export type Role = "Admin" | "Reception" | "Pharmacy";

export type User = {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  must_change_password: boolean;
  active: boolean;
};

export type LoginResult = {
  token: string;
  expires_at: string;
  user: User;
};

export type MeResult = {
  user: User;
  permissions: string[];
};

const TOKEN_KEY = "mudita_token";
const USER_KEY = "mudita_user";
const IDLE_MS = 15 * 60 * 1000;

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${getApiBase()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Login failed (${res.status})`);
  }
  return body as LoginResult;
}

export async function logout(): Promise<void> {
  const token = getStoredToken();
  if (!token) return;
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // clear local session even if server unreachable
  }
}

export async function fetchMe(): Promise<MeResult> {
  return apiFetch<MeResult>("/api/auth/me");
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<LoginResult> {
  return apiFetch<LoginResult>("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

export function hasPermission(permissions: string[] | null | undefined, perm: string): boolean {
  return !!permissions?.includes(perm);
}

/** Idle lock: call onActivity() on user input; onIdle fires after IDLE_MS. */
export function createIdleWatcher(onIdle: () => void): { onActivity: () => void; dispose: () => void } {
  let timer: number | undefined;

  const reset = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(onIdle, IDLE_MS);
  };

  const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
  for (const e of events) {
    window.addEventListener(e, reset, { passive: true });
  }
  reset();

  return {
    onActivity: reset,
    dispose: () => {
      if (timer !== undefined) window.clearTimeout(timer);
      for (const e of events) {
        window.removeEventListener(e, reset);
      }
    },
  };
}

export { IDLE_MS };
