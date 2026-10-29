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
};

type Props = {
  rows: BillHistoryTableRow[];
  loading?: boolean;
  emptyLabel: string;
  /** Region aria-label; defaults to bill history. */
  ariaLabel?: string;
  onActivate?: (id: number) => void;
  onPrint?: (id: number) => void;
  printingId?: number | null;
  busy?: boolean;
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
  if (s === "void") return "void";
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
  onActivate,
  onPrint,
  printingId = null,
  busy = false,
}: Props) {
  const { t } = useI18n();
  const showActions = onPrint != null && rows.some((r) => r.canPrint);

  return (
    <div
      className={`bill-history-table-wrap${showActions ? " bill-history-table-wrap--actions" : ""}`}
      role="region"
      aria-label={ariaLabel ?? t("billHistory")}
    >
      <div
        className={`bill-history-table-head${showActions ? " bill-history-table-head--actions" : ""}`}
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
        <span className="bill-history-col bill-history-col--price" role="columnheader">
          {t("price")}
        </span>
        {showActions ? (
          <span className="bill-history-col bill-history-col--actions" role="columnheader">
            <span className="visually-hidden">{t("print")}</span>
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
          const rowClass = `bill-history-table-row${showActions ? " bill-history-table-row--actions" : ""}`;
          const cells = (
            <>
              <span className="bill-history-col bill-history-col--voucher" title={row.voucher}>
                {row.voucher}
              </span>
              <span className="bill-history-col bill-history-col--name" title={row.name || undefined}>
                {row.name || "—"}
              </span>
              <span className="bill-history-col bill-history-col--status">
                <span className={`bill-history-status bill-history-status--${tone}`}>{label}</span>
              </span>
              <span className="bill-history-col bill-history-col--when">
                {formatBillWhen(row.when)}
              </span>
              <span className="bill-history-col bill-history-col--price">
                {row.priceMmk == null ? "—" : `${formatMMK(row.priceMmk)} ${t("mmk")}`}
              </span>
              {showActions ? (
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
                </span>
              ) : null}
            </>
          );

          return (
            <li key={row.key ?? String(row.id)}>
              {onActivate ? (
                <button type="button" className={rowClass} onClick={() => onActivate(row.id)}>
                  {cells}
                </button>
              ) : (
                <div className={rowClass}>{cells}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
