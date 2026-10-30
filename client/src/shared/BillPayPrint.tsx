/** Shared Mark Paid / Print controls for OPD, OT, and Pharmacy bill rails. */

import { type ActionIconName } from "@/shared/ActionIcon";
import { BillBtnIcon } from "@/shared/BillBtnIcon";
import { useI18n } from "@/shared/i18n";

export type CollectSideEffect = "none" | "pharmacy" | "ot" | "pharmacy_return";

/** True when Mark Paid (F7) will collect cash / finalize the bill. */
export function collectsOnPay(status: string | null | undefined): boolean {
  const s = (status || "draft").toLowerCase();
  return s !== "paid" && s !== "void" && s !== "deleted";
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
    case "charged":
      return t("chargedToIpdStatus");
    case "void":
      return t("voidStatus");
    case "deleted":
      return t("deletedStatus");
    case "billed":
      return t("billed");
    case "draft":
    default:
      if (printedAt) return t("printedNotPaid");
      return t("draft");
  }
}

function railFeedbackClass(success?: boolean, fail?: boolean): string {
  if (fail) return " opd-bill-rail-btn--shake";
  if (success) return "";
  return "";
}

export function BillMarkPaidButton(props: {
  status: string;
  busy: boolean;
  onClick: () => void;
  /** Override main label when collecting (default: Mark Paid). */
  collectLabel?: string;
  /** Override sub label when collecting (default: Final · locks bill). */
  collectSubLabel?: string;
  /** Delayed in-flight spinner (after ACTION_PENDING_DELAY_MS). */
  pending?: boolean;
  success?: boolean;
  fail?: boolean;
}) {
  const { t } = useI18n();
  const {
    status,
    busy,
    onClick,
    collectLabel,
    collectSubLabel,
    pending = false,
    success = false,
    fail = false,
  } = props;
  const isVoid = status === "void";
  const isPaid = status === "paid";
  const isDeleted = status === "deleted";
  const willCollect = collectsOnPay(status);

  return (
    <button
      type="button"
      className={`opd-bill-rail-btn${willCollect && !isVoid ? " opd-bill-rail-btn--accent" : ""}${railFeedbackClass(success, fail)}`}
      disabled={busy || isVoid || isPaid || isDeleted}
      onClick={onClick}
      aria-busy={pending || undefined}
      data-guide={collectLabel ? "pharmacy-return-mark" : "bill-mark-paid"}
    >
      <span className="opd-bill-rail-btn-main">
        <BillBtnIcon name="check" pending={pending} success={success} />
        <span className="opd-bill-rail-btn-text">
          <span className="opd-bill-rail-btn-label">
            {willCollect
              ? (collectLabel ?? t("markPaid"))
              : isDeleted
                ? t("deletedStatus")
                : t("paid")}
          </span>
          {willCollect ? (
            <span className={`opd-bill-rail-btn-sub${pending ? " opd-bill-rail-btn-sub--pending" : ""}`}>
              {pending ? t("busy") : (collectSubLabel ?? t("marksPaidFinal"))}
            </span>
          ) : null}
        </span>
      </span>
      <kbd>F7</kbd>
      {success ? (
        <span className="visually-hidden" role="status">
          {t("paid")}
        </span>
      ) : null}
    </button>
  );
}

/** Account charge beside Mark Paid. Pay stays the cash action. */
export function BillChargeToIpdButton(props: {
  busy: boolean;
  onClick: () => void;
  label?: string;
  subLabel?: string;
  /** Idle icon. OPD, OT, and Pharmacy keep the clipboard. */
  icon?: ActionIconName;
  pending?: boolean;
  success?: boolean;
  fail?: boolean;
}) {
  const { t } = useI18n();
  const {
    busy,
    onClick,
    label,
    subLabel,
    icon = "clipboard",
    pending = false,
    success = false,
    fail = false,
  } = props;
  return (
    <button
      type="button"
      className={`opd-bill-rail-btn${railFeedbackClass(success, fail)}`}
      disabled={busy}
      onClick={onClick}
      aria-busy={pending || undefined}
      data-guide={label ? undefined : "bill-charge-ipd"}
    >
      <span className="opd-bill-rail-btn-main">
        <BillBtnIcon name={icon} pending={pending} success={success} />
        <span className="opd-bill-rail-btn-text">
          <span className="opd-bill-rail-btn-label">{label ?? t("chargeToIpd")}</span>
          <span className={`opd-bill-rail-btn-sub${pending ? " opd-bill-rail-btn-sub--pending" : ""}`}>
            {pending ? t("busy") : (subLabel ?? t("chargeToIpdSub"))}
          </span>
        </span>
      </span>
      {success ? (
        <span className="visually-hidden" role="status">
          {label ?? t("chargeToIpd")}
        </span>
      ) : null}
    </button>
  );
}

export function BillPrintButton(props: {
  status: string;
  busy: boolean;
  onClick: () => void;
  pending?: boolean;
  success?: boolean;
  fail?: boolean;
}) {
  const { t } = useI18n();
  const { status, busy, onClick, pending = false, success = false, fail = false } = props;
  const isVoid = status === "void";

  return (
    <button
      type="button"
      className={`opd-bill-rail-btn${railFeedbackClass(success, fail)}`}
      disabled={busy || isVoid}
      onClick={onClick}
      aria-busy={pending || undefined}
      data-guide="bill-print"
    >
      <span className="opd-bill-rail-btn-main">
        <BillBtnIcon name="print" pending={pending} success={success} />
        <span className="opd-bill-rail-btn-text">
          <span className="opd-bill-rail-btn-label">{t("print")}</span>
        </span>
      </span>
      <kbd>F6</kbd>
      {success ? (
        <span className="visually-hidden" role="status">
          {t("print")}
        </span>
      ) : null}
    </button>
  );
}

export function BillSaveDraftButton(props: {
  busy: boolean;
  onClick: () => void;
  pending?: boolean;
  success?: boolean;
  fail?: boolean;
  /** When false, button is disabled (e.g. bill no longer draft). Default true. */
  enabled?: boolean;
}) {
  const { t } = useI18n();
  const {
    busy,
    onClick,
    pending = false,
    success = false,
    fail = false,
    enabled = true,
  } = props;

  return (
    <button
      type="button"
      className={`opd-bill-rail-btn${railFeedbackClass(success, fail)}`}
      disabled={busy || !enabled}
      onClick={onClick}
      aria-busy={pending || undefined}
      data-guide="bill-save-draft"
    >
      <span className="opd-bill-rail-btn-main">
        <BillBtnIcon name="check" pending={pending} success={success} />
        <span
          className={`opd-bill-rail-btn-label-swap${success ? " opd-bill-rail-btn-label-swap--saved" : ""}`}
          aria-hidden="true"
        >
          <span className="opd-bill-rail-btn-label-idle">{t("saveDraft")}</span>
          <span className="opd-bill-rail-btn-label-saved">{t("saved")}</span>
        </span>
        <span className="visually-hidden">{success ? t("saved") : t("saveDraft")}</span>
      </span>
      <kbd>F5</kbd>
      {success ? (
        <span className="visually-hidden" role="status">
          {t("saved")}
        </span>
      ) : null}
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
