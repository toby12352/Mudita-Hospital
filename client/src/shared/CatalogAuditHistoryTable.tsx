import { formatHistoryDateTime } from "@/features/pharmacy/api";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";

export type CatalogAuditHistoryRow = {
  id: number;
  actor_username?: string;
  action: string;
  entity_id?: number | null;
  code?: string;
  name: string;
  detail?: string | null;
  created_at: string;
};

export function catalogAuditActionLabel(
  action: string,
  t: (k: string) => string,
): string {
  if (action === "create") return t("auditActionCreate");
  if (action === "update") return t("auditActionUpdate");
  if (action === "deactivate") return t("deactivate");
  if (action === "delete") return t("auditActionDelete");
  return action;
}

export function formatCatalogAuditDetail(
  detail: string | null | undefined,
  t: (k: string) => string,
): string {
  if (!detail) return "";
  try {
    const d = JSON.parse(detail) as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof d.consultation_mmk === "number") {
      parts.push(`${t("consultAbbrev")} ${formatMMK(d.consultation_mmk)} ${t("mmk")}`);
    }
    if (typeof d.ot_mmk === "number") {
      parts.push(`OT ${formatMMK(d.ot_mmk)} ${t("mmk")}`);
    }
    if (typeof d.price_mmk === "number") {
      parts.push(`${formatMMK(d.price_mmk)} ${t("mmk")}`);
    }
    if (d.active === false) parts.push(t("inactive").replace(/[()]/g, "").trim());
    return parts.join(" · ");
  } catch {
    return detail;
  }
}

export function CatalogAuditHistoryTable({
  rows,
  loading,
  ariaLabel,
}: {
  rows: CatalogAuditHistoryRow[];
  loading?: boolean;
  ariaLabel: string;
}) {
  const { t } = useI18n();

  return (
    <div className="bill-history-table-wrap" role="region" aria-label={ariaLabel}>
      <div className="bill-history-table-head bill-history-table-head--catalog-audit" role="row">
        <span className="bill-history-col bill-history-col--no" role="columnheader">
          {t("listNo")}
        </span>
        <span className="bill-history-col" role="columnheader">
          {t("dateTime")}
        </span>
        <span className="bill-history-col" role="columnheader">
          {t("auditAction")}
        </span>
        <span className="bill-history-col bill-history-col--name" role="columnheader">
          {t("name")}
        </span>
        <span className="bill-history-col" role="columnheader">
          {t("auditChange")}
        </span>
        <span className="bill-history-col" role="columnheader">
          {t("username")}
        </span>
      </div>
      {loading ? <p className="hint bill-history-table-msg">{t("loading")}</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="hint bill-history-table-msg empty-row">{t("noHistoryYet")}</p>
      ) : null}
      <ul className="bill-history-table-body">
        {rows.map((row, index) => {
          const detailLine = formatCatalogAuditDetail(row.detail, t);
          const nameLine = row.name || `#${row.entity_id ?? row.id}`;
          const codeLine = row.code?.trim() || "";
          return (
            <li key={row.id}>
              <div className="bill-history-table-row bill-history-table-row--catalog-audit">
                <span className="bill-history-col bill-history-col--no">{index + 1}</span>
                <span className="bill-history-col" title={formatHistoryDateTime(row.created_at)}>
                  {formatHistoryDateTime(row.created_at)}
                </span>
                <span className="bill-history-col" title={catalogAuditActionLabel(row.action, t)}>
                  {catalogAuditActionLabel(row.action, t)}
                </span>
                <span className="bill-history-col bill-history-col--name" title={nameLine}>
                  <span className="bill-history-name-primary">{nameLine}</span>
                  {codeLine ? (
                    <span className="bill-history-name-detail">{codeLine}</span>
                  ) : null}
                </span>
                <span className="bill-history-col" title={detailLine || undefined}>
                  {detailLine || "—"}
                </span>
                <span className="bill-history-col" title={row.actor_username || undefined}>
                  {row.actor_username || "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
