/** Per-computer default printer (not stored on the hospital server). */

const DEFAULT_PRINTER_KEY = "mudita_default_printer";

export function getDefaultPrinter(): string {
  return (localStorage.getItem(DEFAULT_PRINTER_KEY) ?? "").trim();
}

export function setDefaultPrinter(name: string): void {
  const trimmed = name.trim();
  if (trimmed) {
    localStorage.setItem(DEFAULT_PRINTER_KEY, trimmed);
  } else {
    localStorage.removeItem(DEFAULT_PRINTER_KEY);
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
