/** Shared Mark Paid / Print controls for OPD, OT, and Pharmacy bill rails. */

import { ActionIcon } from "@/shared/ActionIcon";
import { useI18n } from "@/shared/i18n";

export type CollectSideEffect = "none" | "pharmacy" | "ot" | "pharmacy_return";

/** True when Mark Paid (F7) will collect cash / finalize the bill. */
export function collectsOnPay(status: string | null | undefined): boolean {
  const s = (status || "draft").toLowerCase();
  return s !== "paid" && s !== "void";
}

/** @deprecated Prefer collectsOnPay — Print no longer marks paid. */
export function collectsOnPrint(status: string | null | undefined): boolean {
  return collectsOnPay(status);
}

export function moneyStatusLabel(
  status: string | null | undefined,
  t: (k: string) => string,
  printedAt?: string | null,
  collectedCash?: number | null,
): string {
  switch ((status || "draft").toLowerCase()) {
    case "paid":
      if (collectedCash === 0) return t("chargedToIpdStatus");
      return t("paid");
    case "void":
      return t("voidStatus");
    case "billed":
      return t("billed");
    case "draft":
    default:
      if (printedAt) return t("printedNotPaid");
      return t("draft");
  }
}

export function BillMarkPaidButton(props: {
  status: string;
  busy: boolean;
  onClick: () => void;
  /** Override main label when collecting (default: Mark Paid). */
  collectLabel?: string;
  /** Override sub label when collecting (default: Final · locks bill). */
  collectSubLabel?: string;
}) {
  const { t } = useI18n();
  const { status, busy, onClick, collectLabel, collectSubLabel } = props;
  const isVoid = status === "void";
  const isPaid = status === "paid";
  const willCollect = collectsOnPay(status);

  return (
    <button
      type="button"
      className={`opd-bill-rail-btn${willCollect && !isVoid ? " opd-bill-rail-btn--accent" : ""}`}
      disabled={busy || isVoid || isPaid}
      onClick={onClick}
      data-guide={collectLabel ? "pharmacy-return-mark" : "bill-mark-paid"}
    >
      <span className="opd-bill-rail-btn-main">
        <ActionIcon name="check" />
        <span className="opd-bill-rail-btn-text">
          <span className="opd-bill-rail-btn-label">
            {willCollect ? (collectLabel ?? t("markPaid")) : t("paid")}
          </span>
          {willCollect ? (
            <span className="opd-bill-rail-btn-sub">{collectSubLabel ?? t("marksPaidFinal")}</span>
          ) : null}
        </span>
      </span>
      <kbd>F7</kbd>
    </button>
  );
}

/** Account charge beside Mark Paid. Pay stays the cash action. */
export function BillChargeToIpdButton(props: {
  busy: boolean;
  onClick: () => void;
  label?: string;
  subLabel?: string;
}) {
  const { t } = useI18n();
  const { busy, onClick, label, subLabel } = props;
  return (
    <button
      type="button"
      className="opd-bill-rail-btn"
      disabled={busy}
      onClick={onClick}
      data-guide={label ? undefined : "bill-charge-ipd"}
    >
      <span className="opd-bill-rail-btn-main">
        <ActionIcon name="clipboard" />
        <span className="opd-bill-rail-btn-text">
          <span className="opd-bill-rail-btn-label">{label ?? t("chargeToIpd")}</span>
          <span className="opd-bill-rail-btn-sub">{subLabel ?? t("chargeToIpdSub")}</span>
        </span>
      </span>
    </button>
  );
}

export function BillPrintButton(props: {
  status: string;
  busy: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const { status, busy, onClick } = props;
  const isVoid = status === "void";

  return (
    <button
      type="button"
      className="opd-bill-rail-btn"
      disabled={busy || isVoid}
      onClick={onClick}
      data-guide="bill-print"
    >
      <span className="opd-bill-rail-btn-main">
        <ActionIcon name="print" />
        <span className="opd-bill-rail-btn-text">
          <span className="opd-bill-rail-btn-label">{t("print")}</span>
        </span>
      </span>
      <kbd>F6</kbd>
    </button>
  );
}

/** @deprecated Prefer BillMarkPaidButton + BillPrintButton. */
export function BillPayPrintButton(props: {
  status: string;
  busy: boolean;
  onClick: () => void;
  collectLabel?: string;
  collectSubLabel?: string;
}) {
  return (
    <BillMarkPaidButton
      status={props.status}
      busy={props.busy}
      onClick={props.onClick}
      collectLabel={props.collectLabel}
      collectSubLabel={props.collectSubLabel}
    />
  );
}

export function BillCollectNote(props: {
  status: string;
  balance: number;
  sideEffect?: CollectSideEffect;
}) {
  const { t } = useI18n();
  const { status, balance, sideEffect = "none" } = props;
  if (!collectsOnPay(status) || balance <= 0) return null;

  if (sideEffect === "pharmacy_return") {
    return (
      <p className="opd-bill-collect-note">
        {t("markReturnedCollects")}
        {` ${t("pharmacyStockCreditedOnReturn")}`}
      </p>
    );
  }

  let extra = "";
  if (sideEffect === "pharmacy") extra = ` ${t("pharmacyStockDeductedOnPay")}`;
  if (sideEffect === "ot") extra = ` ${t("otCupboardDeductedOnPay")}`;

  return (
    <p className="opd-bill-collect-note">
      {t("markPaidCollects")}
      {extra}
    </p>
  );
}
