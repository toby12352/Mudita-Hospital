import { useEffect, useState } from "react";
import { fetchAuditLogs, type AuditLog } from "../bulkApi";

type Props = {
  t: (k: string) => string;
};

function shortDetail(detail?: string): string {
  if (!detail) return "—";
  if (detail.length <= 80) return detail;
  return detail.slice(0, 77) + "…";
}

export function AuditPage({ t }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchAuditLogs({
          limit: 150,
          entity: entity || undefined,
          q: q.trim() || undefined,
        });
        if (cancelled) return;
        setLogs(rows);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, epoch, t]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("audit")}</h2>
          <p className="lede muted">{t("auditLede")}</p>
        </div>
        <div className="page-actions">
          <input
            className="input"
            type="search"
            placeholder={t("search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEpoch((n) => n + 1);
            }}
          />
          <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">{t("allEntities")}</option>
            <option value="item">item</option>
            <option value="service">service</option>
            <option value="doctor">doctor</option>
            <option value="user">user</option>
            <option value="bill">bill</option>
            <option value="settings">settings</option>
            <option value="backup">backup</option>
          </select>
          <button type="button" className="btn ghost" onClick={() => setEpoch((n) => n + 1)}>
            {t("refresh")}
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading && logs.length === 0 ? <p className="muted">{t("loading")}</p> : null}

      <div className="panel">
        {logs.length === 0 && !loading ? (
          <p className="empty-state">{t("noAudit")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("when")}</th>
                  <th>{t("actor")}</th>
                  <th>{t("action")}</th>
                  <th>{t("entity")}</th>
                  <th>ID</th>
                  <th>{t("detail")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id}>
                    <td className="nowrap">{row.created_at}</td>
                    <td>{row.actor_username || "—"}</td>
                    <td>
                      <code className="code-chip">{row.action}</code>
                    </td>
                    <td>{row.entity}</td>
                    <td className="num">{row.entity_id ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="linkish"
                        title={row.detail || ""}
                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                      >
                        {expanded === row.id ? row.detail || "—" : shortDetail(row.detail)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
