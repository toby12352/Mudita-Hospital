/** Persistent clinic UI zoom (Ctrl/Cmd + / − / 0). */

const SCALE_KEY = "mudita_ui_scale";
const MIN = 0.85;
const MAX = 1.4;
const STEP = 0.05;
const DEFAULT = 1;

export function getUiScale(): number {
  const raw = localStorage.getItem(SCALE_KEY);
  if (raw == null) return DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT;
  return clamp(n);
}

export function setUiScale(scale: number): number {
  const next = clamp(scale);
  localStorage.setItem(SCALE_KEY, String(next));
  applyUiScale(next);
  return next;
}

export function applyUiScale(scale: number = getUiScale()): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.zoom = String(clamp(scale));
}

export function bumpUiScale(delta: number): number {
  return setUiScale(getUiScale() + delta);
}

export function resetUiScale(): number {
  return setUiScale(DEFAULT);
}

export function zoomIn(): number {
  return bumpUiScale(STEP);
}

export function zoomOut(): number {
  return bumpUiScale(-STEP);
}

function clamp(n: number): number {
  const stepped = Math.round(n / STEP) * STEP;
  return Math.min(MAX, Math.max(MIN, Number(stepped.toFixed(2))));
}

if (typeof document !== "undefined") {
  applyUiScale(getUiScale());
}
