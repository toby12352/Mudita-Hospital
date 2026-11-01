import { useEffect, useId, useRef, useState } from "react";
import { AlertDialog } from "@/shared/AlertDialog";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { useI18n } from "@/shared/i18n";
import { useActionLock, useDelayedFlag } from "@/shared/useActionLock";

type Props = {
  billNo: string;
  identityName: string;
  /** Default reason text shown in the first step. */
  defaultReason: string;
  onClose: () => void;
  onVoid: (reason: string) => Promise<void>;
};

function focusableIn(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function VoidBillConfirm({
  billNo,
  identityName,
  defaultReason,
  onClose,
  onVoid,
}: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const bodyId = useId();
  const reasonId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [step, setStep] = useState<1 | 2>(1);
  const [voidReason, setVoidReason] = useState(defaultReason);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { tryAcquire, release } = useActionLock();
  const showPending = useDelayedFlag(busy);

  const identity = [billNo, identityName.trim()].filter(Boolean).join(" · ");
  const message =
    step === 1
      ? t("confirmVoidBill").replace("{bill}", billNo)
      : t("confirmVoidBillFinal").replace("{bill}", billNo);

  useEffect(() => {
    const opener = document.activeElement;
    openerRef.current = opener instanceof HTMLElement ? opener : null;
    reasonRef.current?.focus();
    reasonRef.current?.select();
    return () => {
      const prev = openerRef.current;
      openerRef.current = null;
      if (prev && document.contains(prev)) prev.focus();
    };
  }, []);

  useEffect(() => {
    if (step !== 1) return;
    function onKey(e: KeyboardEvent) {
      if (document.querySelector(".print-preview-overlay")) return;
      const root = dialogRef.current;
      if (!root) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!busy) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = focusableIn(root);
      if (focusable.length === 0) return;
      const active = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = active instanceof Node && root.contains(active) && active !== root;
      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [step, busy]);

  function advanceToFinal() {
    const reason = voidReason.trim();
    if (!reason) {
      setError(t("voidReasonRequired"));
      reasonRef.current?.focus();
      return;
    }
    setError(null);
    setStep(2);
  }

  function backToReason() {
    if (busy) return;
    setError(null);
    setStep(1);
  }

  async function confirmVoid() {
    const reason = voidReason.trim();
    if (!reason) {
      setError(t("voidReasonRequired"));
      setStep(1);
      return;
    }
    if (!tryAcquire()) return;
    setBusy(true);
    setError(null);
    try {
      await onVoid(reason);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Void failed");
    } finally {
      setBusy(false);
      release();
    }
  }

  if (step === 2) {
    return (
      <AlertDialog
        tone="warning"
        title={t("voidBill")}
        identity={identity}
        message={message}
        error={error}
        busy={busy}
        danger
        irreversible
        confirmLabel={t("voidStatus")}
        onClose={backToReason}
        onConfirm={() => void confirmVoid()}
      />
    );
  }

  return (
    <div
      className="clinic-overlay clinic-overlay--fixed alert-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="clinic-overlay-panel alert-dialog alert-dialog--warning"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        aria-busy={busy || undefined}
      >
        <DialogCloseButton onClick={onClose} disabled={busy} />

        <div className="alert-dialog-badge" aria-hidden="true">
          <span className="alert-dialog-badge-glow" />
          <span className="alert-dialog-badge-circle">
            <svg viewBox="0 0 48 48" width="40" height="40">
              <path
                className="alert-dialog-draw-path alert-dialog-draw-path--warn"
                d="M24 10l16 28H8z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                className="alert-dialog-draw-path alert-dialog-draw-path--warn-mark"
                d="M24 20v8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle className="alert-dialog-warn-dot" cx="24" cy="33" r="1.6" fill="currentColor" />
            </svg>
          </span>
        </div>

        <h2 id={titleId} className="alert-dialog-title">
          {t("voidBill")}
        </h2>
        {identity ? <p className="alert-dialog-identity">{identity}</p> : null}
        <p id={bodyId} className="alert-dialog-body">
          {message}
        </p>

        <label className="field grow void-bill-reason" htmlFor={reasonId}>
          {t("voidReason")}
          <input
            ref={reasonRef}
            id={reasonId}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder={t("voidReasonRequired")}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                advanceToFinal();
              }
            }}
          />
        </label>

        {error ? <p className="alert-dialog-error">{error}</p> : null}

        <div className="alert-dialog-actions">
          <button type="button" className="alert-dialog-ok" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={advanceToFinal}
            disabled={busy}
            aria-busy={showPending || undefined}
          >
            {showPending ? <span className="opd-bill-btn-spinner" aria-hidden="true" /> : null}
            {t("voidStatus")}
          </button>
        </div>
      </div>
    </div>
  );
}
