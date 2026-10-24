/** Shared Pay & print / Reprint control for OPD, OT, and Pharmacy bill rails. */

import { ActionIcon } from "@/shared/ActionIcon";
import { useI18n } from "@/shared/i18n";

export type CollectSideEffect = "none" | "pharmacy" | "ot" | "pharmacy_return";

/** True when F7 will mark the bill paid (draft / new / billed case without paid bill). */
export function collectsOnPrint(status: string | null | undefined): boolean {
  const s = (status || "draft").toLowerCase();
  return s !== "paid" && s !== "void";
}

export function moneyStatusLabel(
  status: string | null | undefined,
  t: (k: string) => string,
): string {
  switch ((status || "draft").toLowerCase()) {
    case "paid":
      return t("paid");
    case "void":
      return t("voidStatus");
    case "billed":
      return t("billed");
    case "draft":
    default:
      return t("draft");
  }
}

export function BillPayPrintButton(props: {
  status: string;
  busy: boolean;
  onClick: () => void;
  /** When collecting, override the main label (default: Pay & print). */
  collectLabel?: string;
  /** When collecting, override the sub label (default: Marks paid). */
  collectSubLabel?: string;
}) {
  const { t } = useI18n();
  const { status, busy, onClick, collectLabel, collectSubLabel } = props;
  const isVoid = status === "void";
  const willCollect = collectsOnPrint(status);

  return (
    <button
      type="button"
      className={`opd-bill-rail-btn${willCollect && !isVoid ? " opd-bill-rail-btn--accent" : ""}`}
      disabled={busy || isVoid}
      onClick={onClick}
    >
      <span className="opd-bill-rail-btn-main">
        <ActionIcon name="print" />
        <span className="opd-bill-rail-btn-text">
          <span className="opd-bill-rail-btn-label">
            {willCollect ? (collectLabel ?? t("payAndPrint")) : t("reprint")}
          </span>
          {willCollect ? (
            <span className="opd-bill-rail-btn-sub">{collectSubLabel ?? t("marksPaid")}</span>
          ) : null}
        </span>
      </span>
      <kbd>F7</kbd>
    </button>
  );
}

export function BillCollectNote(props: {
  status: string;
  balance: number;
  sideEffect?: CollectSideEffect;
}) {
  const { t } = useI18n();
  const { status, balance, sideEffect = "none" } = props;
  if (!collectsOnPrint(status) || balance <= 0) return null;

  if (sideEffect === "pharmacy_return") {
    return (
      <p className="opd-bill-collect-note">
        {t("returnPrintRefunds")}
        {` ${t("pharmacyStockCreditedOnReturn")}`}
      </p>
    );
  }

  let extra = "";
  if (sideEffect === "pharmacy") extra = ` ${t("pharmacyStockDeductedOnPay")}`;
  if (sideEffect === "ot") extra = ` ${t("otCupboardDeductedOnPay")}`;

  return (
    <p className="opd-bill-collect-note">
      {t("payPrintCollects")}
      {extra}
    </p>
  );
}
