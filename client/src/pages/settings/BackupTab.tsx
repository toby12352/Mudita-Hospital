import { useEffect, useState } from "react";
import {
  createBackup,
  formatBytes,
  listBackups,
  restoreBackup,
  type BackupInfo,
} from "@/features/settings/backup";
export function BackupTab() {
  const [dir, setDir] = useState("");
  const [list, setList] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  async function doRestore(name: string) {
    if (
      !window.confirm(
        `Restore ${name}?\n\nThis replaces the live database. The API will restart. All clients briefly disconnect.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await restoreBackup(name);
      setMessage(res.message || "Restore queued — wait a few seconds, then Retry connection.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-split">
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
      <div className="card-form">
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
                className="btn ghost danger"
                disabled={busy}
                onClick={() => void doRestore(b.name)}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
