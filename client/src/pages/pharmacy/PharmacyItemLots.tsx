import {
  formatLocationLabel,
  type ItemBatch,
} from "@/features/pharmacy/api";
import { useI18n } from "@/shared/i18n";

/** Read-only lot list for Drug Info and Edit (same fields as New collects). */
export function PharmacyItemLots({
  batches,
  stockUnit = "",
  showOnHand,
  onHand,
}: {
  batches: ItemBatch[] | undefined;
  stockUnit?: string;
  showOnHand?: boolean;
  onHand?: number;
}) {
  const { t } = useI18n();
  const lots = (batches ?? []).filter((b) => b.qty > 0);

  return (
    <div className="pharmacy-item-lots">
      {showOnHand ? (
        <div className="drug-info-field">
          <span className="drug-info-label">{t("inStock")}</span>
          <span className="drug-info-input">
            {(onHand ?? 0).toLocaleString()}
            {stockUnit ? ` ${stockUnit}` : ""}
          </span>
        </div>
      ) : null}
      <div className="drug-setup-table drug-setup-batch-table pharmacy-item-lots-table" role="list">
        <div className="drug-setup-batch-head pharmacy-item-lots-head">
          <span>{t("batchNumber")}</span>
          <span>{t("qty")}</span>
          <span>{t("expiry")}</span>
        </div>
        {lots.length === 0 ? <p className="empty-row">{t("noBatchesYet")}</p> : null}
        {lots.map((b) => (
          <div key={b.id} className="drug-setup-batch-row pharmacy-item-lots-row" role="listitem">
            <span>
              {formatLocationLabel(b.location_code)} · {b.batch_no.trim() || t("none")}
            </span>
            <span>{b.qty.toLocaleString()}</span>
            <span>{b.expiry_date || t("none")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
