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
    <div className="page page-frame audit-page">
      <div className="page-header">
        <p className="lede muted">{t("auditLede")}</p>
        <div className="page-actions">
          <label htmlFor="audit-search">{t("search")}</label>
          <input
            id="audit-search"
            className="input"
            type="search"
            placeholder={t("search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEpoch((n) => n + 1);
            }}
          />
          <label htmlFor="audit-entity">{t("entity")}</label>
          <select
            id="audit-entity"
            className="input"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            <option value="">{t("allEntities")}</option>
            <option value="item">{t("item")}</option>
            <option value="service">{t("service")}</option>
            <option value="doctor">{t("doctor")}</option>
            <option value="user">{t("user")}</option>
            <option value="bill">{t("bill")}</option>
            <option value="settings">{t("settings")}</option>
            <option value="backup">{t("backup")}</option>
          </select>
          <button type="button" className="btn ghost" onClick={() => setEpoch((n) => n + 1)}>
            {t("refresh")}
          </button>
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && logs.length === 0 ? (
        <p className="muted" aria-live="polite">
          {t("loading")}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="audit-list-title">
        <h2 id="audit-list-title">{t("audit")}</h2>
        {logs.length === 0 && !loading ? (
          <p className="empty-state">{t("noAudit")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table" aria-labelledby="audit-list-title">
              <thead>
                <tr>
                  <th>{t("when")}</th>
                  <th>{t("actor")}</th>
                  <th>{t("action")}</th>
                  <th>{t("entity")}</th>
                  <th className="num">{t("idLabel")}</th>
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
                        aria-expanded={expanded === row.id}
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
      </section>
    </div>
  );
}
