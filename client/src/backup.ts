import { apiFetch } from "./api";

export type BackupInfo = {
  name: string;
  size_bytes: number;
  created_at: string;
};

export type BackupListResponse = {
  backup_dir: string;
  backups: BackupInfo[];
};

export function listBackups(): Promise<BackupListResponse> {
  return apiFetch<BackupListResponse>("/api/backup");
}

export function createBackup(): Promise<BackupInfo & { backup_dir: string }> {
  return apiFetch("/api/backup", { method: "POST" });
}

export function restoreBackup(name: string): Promise<{ ok: boolean; message: string; name: string }> {
  return apiFetch("/api/backup/restore", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
