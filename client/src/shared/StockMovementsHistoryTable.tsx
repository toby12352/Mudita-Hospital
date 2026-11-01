import {
  formatHistoryDateTime,
  formatItemCode,
  type StockMovement,
} from "@/features/pharmacy/api";
import { useI18n } from "@/shared/i18n";

export function stockMovementTypeLabel(
  movementType: string,
  t: (k: string) => string,
): string {
  switch (movementType) {
    case "PURCHASE":
      return t("movementPurchase");
    case "SALE":
      return t("movementSale");
    case "ADJUST":
      return t("movementAdjust");
    case "ISSUE":
      return t("movementIssue");
    case "RETURN":
      return t("movementReturn");
    case "WASTE":
      return t("movementWaste");
    case "TRANSFER":
      return t("movementTransfer");
    default:
      return movementType;
  }
}

export function StockMovementsHistoryTable({
  rows,
  loading,
  ariaLabel,
}: {
  rows: StockMovement[];
  loading?: boolean;
  ariaLabel: string;
}) {
  const { t } = useI18n();

  return (
    <div className="bill-history-table-wrap" role="region" aria-label={ariaLabel}>
      <div className="bill-history-table-head bill-history-table-head--stock-moves" role="row">
        <span className="bill-history-col bill-history-col--no" role="columnheader">
          {t("listNo")}
        </span>
        <span className="bill-history-col" role="columnheader">
          {t("dateTime")}
        </span>
        <span className="bill-history-col" role="columnheader">
          {t("idCode")}
        </span>
        <span className="bill-history-col bill-history-col--name" role="columnheader">
          {t("name")}
        </span>
        <span className="bill-history-col" role="columnheader">
          {t("qty")}
        </span>
        <span className="bill-history-col" role="columnheader">
          {t("movementWhat")}
        </span>
      </div>
      {loading ? <p className="hint bill-history-table-msg">{t("loading")}</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="hint bill-history-table-msg empty-row">{t("noHistoryYet")}</p>
      ) : null}
      <ul className="bill-history-table-body">
        {rows.map((m, index) => {
          const unit = (m.stock_unit || "").trim();
          const signed = `${m.qty_delta > 0 ? "+" : ""}${m.qty_delta}`;
          const qtyText = unit ? `${signed} ${unit}` : signed;
          const what = stockMovementTypeLabel(m.movement_type, t);
          const reason = (m.reason || "").trim();
          const code = formatItemCode(m.item_code);
          return (
            <li key={m.id}>
              <div className="bill-history-table-row bill-history-table-row--stock-moves">
                <span className="bill-history-col bill-history-col--no">{index + 1}</span>
                <span className="bill-history-col" title={formatHistoryDateTime(m.created_at)}>
                  {formatHistoryDateTime(m.created_at)}
                </span>
                <span className="bill-history-col" title={code}>
                  {code}
                </span>
                <span className="bill-history-col bill-history-col--name" title={m.item_name}>
                  <span className="bill-history-name-primary">{m.item_name}</span>
                </span>
                <span className="bill-history-col" title={qtyText}>
                  {qtyText}
                </span>
                <span className="bill-history-col" title={reason ? `${what} · ${reason}` : what}>
                  <span className="bill-history-name-primary">{what}</span>
                  {reason ? <span className="bill-history-name-detail">{reason}</span> : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
