import { useEffect, useState } from "react";
import {
  listLabServiceHistory,
  type LabServiceHistoryRow,
} from "@/features/lab/api";
import { ActionIcon } from "@/shared/ActionIcon";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";

function actionLabel(action: string, t: (k: string) => string): string {
  if (action === "create") return t("auditActionCreate");
  if (action === "update") return t("auditActionUpdate");
  if (action === "deactivate") return t("deactivate");
  if (action === "delete") return t("auditActionDelete");
  return action;
}

function formatDetail(row: LabServiceHistoryRow, t: (k: string) => string): string {
  if (!row.detail) return "";
  try {
    const d = JSON.parse(row.detail) as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof d.price_mmk === "number") {
      parts.push(`${formatMMK(d.price_mmk)} ${t("mmk")}`);
    }
    if (d.active === false) parts.push(t("inactive").replace(/[()]/g, "").trim());
    return parts.join(" · ");
  } catch {
    return row.detail;
  }
}

export function LabCatalogHistory({ title }: { title: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [list, setList] = useState<LabServiceHistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reload(search = q) {
    const data = await listLabServiceHistory(search.trim());
    setList(data);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listLabServiceHistory();
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
        {title}
      </h3>
      <p className="hint">{t("catalogHistoryHint")}</p>
      <div className="list-toolbar">
        <label className="field">
          <span>{t("filter")}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("catalogHistoryFilterPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void reload(q).catch((err) =>
                  setError(err instanceof Error ? err.message : "Search failed"),
                );
              }
            }}
          />
        </label>
        <button
          type="button"
          className="btn action"
          onClick={() =>
            void reload(q).catch((err) =>
              setError(err instanceof Error ? err.message : "Search failed"),
            )
          }
        >
          <ActionIcon name="search" />
          {t("search")}
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <ul className="data-list">
        {list.length === 0 ? <li className="empty-row">{t("noHistoryYet")}</li> : null}
        {list.map((row) => {
          const detailLine = formatDetail(row, t);
          const titleLine = row.code
            ? `${row.code} — ${row.name}`
            : row.name || `#${row.entity_id ?? row.id}`;
          return (
            <li key={row.id}>
              <div>
                <p className="row-title">
                  {actionLabel(row.action, t)} · {titleLine}
                </p>
                <p className="row-sub">
                  {row.created_at}
                  {row.actor_username ? ` · ${row.actor_username}` : ""}
                </p>
                {detailLine ? <p className="row-sub">{detailLine}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
