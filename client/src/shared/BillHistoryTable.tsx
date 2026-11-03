import { ActionIcon } from "@/shared/ActionIcon";
import { moneyStatusLabel } from "@/shared/BillPayPrint";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";

export type BillHistoryTableRow = {
  id: number;
  /** Stable list key when id is not unique across sections. */
  key?: string;
  voucher: string;
  name: string;
  /** Optional second line under the name (e.g. IPD yesterday voucher). */
  nameDetail?: string;
  /** Open IPD stay room for this chart; omit when not admitted. */
  roomNo?: string;
  status: string | null | undefined;
  printedAt?: string | null;
  collectedCash?: number | null;
  when: string;
  priceMmk: number | null;
  /** Override chip text (e.g. IPD Open / Settled). */
  statusLabel?: string;
  /** Override chip tone: paid | void | printed | ipd | billed | draft. */
  statusTone?: string;
  canPrint?: boolean;
  /** Admin soft-delete (e.g. open IPD stay). */
  canDelete?: boolean;
  /**
   * When the table has onActivate, false keeps this row non-clickable
   * (e.g. IPD ledger deposits mixed with bill charges). Default true.
   */
  canActivate?: boolean;
};

type Props = {
  rows: BillHistoryTableRow[];
  loading?: boolean;
  emptyLabel: string;
  /** Region aria-label; defaults to bill history. */
  ariaLabel?: string;
  /** Highlight the selected row (void / delete select mode). */
  selectedId?: number | null;
  onActivate?: (id: number) => void;
  onPrint?: (id: number) => void;
  onDelete?: (id: number) => void;
  printingId?: number | null;
  busy?: boolean;
  /** Hide the price column (e.g. IPD stays list has no balance). */
  hidePrice?: boolean;
  /** One-shot highlight for a newly posted row (e.g. IPD deposit). */
  flashId?: number | null;
};

function formatBillWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(
  status: string | null | undefined,
  printedAt?: string | null,
  collectedCash?: number | null,
): string {
  const s = (status || "draft").toLowerCase();
  if (s === "paid") {
    if (collectedCash === 0) return "ipd";
    return "paid";
  }
  if (s === "charged") return "ipd";
  if (s === "void") return "void";
  if (s === "deleted") return "deleted";
  if (s === "billed") return "billed";
  if (s === "settled") return "paid";
  if (s === "open" || s === "admitted") return "ipd";
  if (printedAt) return "printed";
  return "draft";
}

export function BillHistoryTable({
  rows,
  loading = false,
  emptyLabel,
  ariaLabel,
  selectedId = null,
  onActivate,
  onPrint,
  onDelete,
  printingId = null,
  busy = false,
  hidePrice = false,
  flashId = null,
}: Props) {
  const { t } = useI18n();
  const showPrint = onPrint != null && rows.some((r) => r.canPrint);
  const showDelete = onDelete != null && rows.some((r) => r.canDelete);
  const showActions = showPrint || showDelete;
  const actionsWide = showPrint && showDelete;
  const wrapMods = [
    showActions ? "bill-history-table-wrap--actions" : "",
    actionsWide ? "bill-history-table-wrap--actions-wide" : "",
    hidePrice ? "bill-history-table-wrap--no-price" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const headMods = [
    showActions ? "bill-history-table-head--actions" : "",
    actionsWide ? "bill-history-table-head--actions-wide" : "",
    hidePrice ? "bill-history-table-head--no-price" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`bill-history-table-wrap${wrapMods ? ` ${wrapMods}` : ""}`}
      role="region"
      aria-label={ariaLabel ?? t("billHistory")}
    >
      <div
        className={`bill-history-table-head${headMods ? ` ${headMods}` : ""}`}
        role="row"
      >
        <span className="bill-history-col bill-history-col--voucher" role="columnheader">
          {t("vouchNo")}
        </span>
        <span className="bill-history-col bill-history-col--name" role="columnheader">
          {t("name")}
        </span>
        <span className="bill-history-col bill-history-col--status" role="columnheader">
          {t("status")}
        </span>
        <span className="bill-history-col bill-history-col--when" role="columnheader">
          {t("dateAndTime")}
        </span>
        {!hidePrice ? (
          <span className="bill-history-col bill-history-col--price" role="columnheader">
            {t("price")}
          </span>
        ) : null}
        {showActions ? (
          <span className="bill-history-col bill-history-col--actions" role="columnheader">
            <span className="visually-hidden">
              {showDelete && !showPrint ? t("delete") : t("print")}
            </span>
          </span>
        ) : null}
      </div>

      {loading ? <p className="hint bill-history-table-msg">{t("loading")}</p> : null}

      {!loading && rows.length === 0 ? (
        <p className="hint bill-history-table-msg empty-row">{emptyLabel}</p>
      ) : null}

      <ul className="bill-history-table-body">
        {rows.map((row) => {
          const tone = row.statusTone ?? statusTone(row.status, row.printedAt, row.collectedCash);
          const label =
            row.statusLabel ?? moneyStatusLabel(row.status, t, row.printedAt, row.collectedCash);
          const selected = selectedId != null && selectedId === row.id;
          const flash = flashId != null && flashId === row.id;
          const clickable = onActivate != null && row.canActivate !== false;
          const rowClass = [
            "bill-history-table-row",
            showActions ? "bill-history-table-row--actions" : "",
            actionsWide ? "bill-history-table-row--actions-wide" : "",
            hidePrice ? "bill-history-table-row--no-price" : "",
            selected ? "bill-history-table-row--selected" : "",
            flash ? "bill-history-table-row--flash" : "",
            clickable ? "bill-history-table-row--clickable" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const priceClass =
            row.priceMmk != null && row.priceMmk < 0
              ? "bill-history-col bill-history-col--price ipd-ledger-amount--charge"
              : "bill-history-col bill-history-col--price";
          const dataCells = (
            <>
              <span className="bill-history-col bill-history-col--voucher" title={row.voucher}>
                {row.voucher || "—"}
              </span>
              <span
                className="bill-history-col bill-history-col--name"
                title={
                  row.roomNo
                    ? `${row.name || "—"} · ${t("billHistoryRoom").replace("{room}", row.roomNo)}`
                    : row.name || undefined
                }
              >
                <span className="bill-history-name-line">
                  <span className="bill-history-name-primary">{row.name || "—"}</span>
                  {row.roomNo ? (
                    <span className="bill-history-room-tag">
                      {t("billHistoryRoom").replace("{room}", row.roomNo)}
                    </span>
                  ) : null}
                </span>
                {row.nameDetail ? (
                  <span className="bill-history-name-detail">{row.nameDetail}</span>
                ) : null}
              </span>
              <span className="bill-history-col bill-history-col--status">
                <span className={`bill-history-status bill-history-status--${tone}`}>{label}</span>
              </span>
              <span className="bill-history-col bill-history-col--when">
                {formatBillWhen(row.when)}
              </span>
              {!hidePrice ? (
                <span className={priceClass}>
                  {row.priceMmk == null ? "—" : `${formatMMK(row.priceMmk)} ${t("mmk")}`}
                </span>
              ) : null}
            </>
          );
          const actionsCell = showActions ? (
            <span className="bill-history-col bill-history-col--actions">
              {row.canPrint && onPrint ? (
                <button
                  type="button"
                  className="btn action bill-history-print-btn"
                  disabled={busy || printingId === row.id}
                  title={t("print")}
                  aria-label={t("print")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrint(row.id);
                  }}
                >
                  <ActionIcon name="print" />
                </button>
              ) : null}
              {row.canDelete && onDelete ? (
                <button
                  type="button"
                  className="btn action danger bill-history-print-btn"
                  disabled={busy}
                  title={t("delete")}
                  aria-label={t("delete")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(row.id);
                  }}
                >
                  <ActionIcon name="trash" />
                </button>
              ) : null}
            </span>
          ) : null;

          return (
            <li key={row.key ?? String(row.id)}>
              {clickable ? (
                <div
                  role="button"
                  tabIndex={0}
                  className={rowClass}
                  onClick={() => onActivate(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onActivate(row.id);
                    }
                  }}
                >
                  {dataCells}
                  {actionsCell}
                </div>
              ) : (
                <div className={rowClass}>
                  {dataCells}
                  {actionsCell}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
