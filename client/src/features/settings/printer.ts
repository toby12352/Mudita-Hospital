import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/shared/printerPrefs";

/** Printers installed on this Windows PC (Tauri only). */
export async function listInstalledPrinters(): Promise<string[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<string[]>("list_printers");
}
