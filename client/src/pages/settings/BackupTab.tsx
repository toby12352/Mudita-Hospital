import { useEffect, useState } from "react";
import {
  createBackup,
  formatBytes,
  listBackups,
  restoreBackup,
  type BackupInfo,
} from "@/features/settings/backup";
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import { useI18n } from "@/shared/i18n";

export function BackupTab() {
  const { t } = useI18n();
  const [dir, setDir] = useState("");
  const [list, setList] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);

  async function reload() {
    const data = await listBackups();
    setDir(data.backup_dir);
    setList(data.backups);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listBackups();
        if (!cancelled) {
          setDir(data.backup_dir);
          setList(data.backups);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function doBackup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const info = await createBackup();
      setMessage(`Backup created: ${info.name}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  }

  async function doRestore() {
    const name = pendingRestore;
    if (!name) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await restoreBackup(name);
      setPendingRestore(null);
      setMessage(res.message || "Restore queued — wait a few seconds, then Retry connection.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
      setPendingRestore(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-split settings-backup">
      <div className="card-form">
        <h2 className="section-title">Database backup</h2>
        <p className="hint">
          Copies <code>mudita.db</code> on the server. Also runs automatically on a schedule.
          Copy files from the backup folder to a USB weekly.
        </p>
        {dir ? (
          <p className="status-meta">
            Server folder: <code>{dir}</code>
          </p>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-ok">{message}</p> : null}
        <button type="button" className="btn primary" disabled={busy} onClick={() => void doBackup()}>
          {busy ? "Working…" : "Backup now"}
        </button>
      </div>
      <div className="card-form settings-backup-restore">
        <h2 className="section-title">Restore</h2>
        <ul className="data-list">
          {list.length === 0 ? <li className="empty-row">No backups yet</li> : null}
          {list.map((b) => (
            <li key={b.name}>
              <div>
                <p className="row-title">{b.name}</p>
                <p className="row-sub">
                  {formatBytes(b.size_bytes)} · {b.created_at}
                </p>
              </div>
              <button
                type="button"
                className="btn action danger"
                disabled={busy}
                onClick={() => setPendingRestore(b.name)}
              >
                <ActionIcon name="undo" />
                {t("restore")}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {pendingRestore ? (
        <AlertDialog
          tone="warning"
          title={t("restore")}
          message={t("confirmRestoreBackup").replace("{name}", pendingRestore)}
          busy={busy}
          danger
          confirmLabel={t("restore")}
          onClose={() => {
            if (!busy) setPendingRestore(null);
          }}
          onConfirm={() => void doRestore()}
        />
      ) : null}
    </div>
  );
}
