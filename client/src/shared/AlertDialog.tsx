import { useEffect, useId, useRef } from "react";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { useI18n } from "@/shared/i18n";

export type AlertTone = "check" | "warning" | "success" | "print";

type Props = {
  message: string;
  onClose: () => void;
  /** Default "check". Use "success" for a green tick, "warning" for confirms, "print" after Mark Paid. */
  tone?: AlertTone;
  /** Optional title; defaults by tone. */
  title?: string;
  /** When set, shows Cancel + confirm instead of a single OK. */
  onConfirm?: () => void;
  /** Label for the confirm button (defaults: print → Print, danger → Delete, else Confirm). */
  confirmLabel?: string;
  /** Filled red confirm button (delete / restore). */
  danger?: boolean;
  /** Disables buttons and close while an action is in flight. */
  busy?: boolean;
  /** Inline error under the body (failed delete stays in this dialog). */
  error?: string | null;
  /** Optional identity line above the body (catalog / pharmacy delete). */
  identity?: string;
  /** Extra pulse / shake on the warning badge (irreversible deletes). */
  irreversible?: boolean;
};

function defaultTitle(tone: AlertTone, t: (k: string) => string): string {
  if (tone === "success") return t("transferred");
  if (tone === "warning") return t("alertWarning");
  if (tone === "print") return t("paid");
  return t("alertCheck");
}

function defaultConfirmLabel(
  tone: AlertTone,
  danger: boolean,
  t: (k: string) => string,
): string {
  if (tone === "print") return t("print");
  if (danger) return t("delete");
  return t("confirm");
}

function BadgeIcon({ tone }: { tone: AlertTone }) {
  if (tone === "success") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40">
        <path
          className="alert-dialog-draw-path"
          d="M14 24.5l7 7 13-15"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (tone === "warning") {
    return (
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
    );
  }

  if (tone === "print") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40" className="alert-dialog-printer">
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--printer"
          d="M14 18h20v6H14zM12 24h24a3 3 0 013 3v10H9V27a3 3 0 013-3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--printer"
          d="M16 34h16v6H16z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <rect
          className="alert-dialog-printer-paper"
          x="17"
          y="12"
          width="14"
          height="10"
          rx="1"
          fill="currentColor"
          opacity="0.22"
        />
        <circle cx="34" cy="29" r="1.4" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" width="40" height="40">
      <rect
        className="alert-dialog-draw-path alert-dialog-draw-path--check-box"
        x="10"
        y="10"
        width="28"
        height="28"
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
      />
      <path
        className="alert-dialog-draw-path alert-dialog-draw-path--check-mark"
        d="M24 17v10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle className="alert-dialog-check-dot" cx="24" cy="32" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function AlertDialog({
  message,
  onClose,
  tone = "check",
  title,
  onConfirm,
  confirmLabel,
  danger = false,
  busy = false,
  error = null,
  identity,
  irreversible = false,
}: Props) {
  const { t } = useI18n();
  const actionRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const trimmed = message.trim();
  const isConfirm = typeof onConfirm === "function";
  const heading = title?.trim() || defaultTitle(tone, t);
  const actionLabel = confirmLabel?.trim() || defaultConfirmLabel(tone, danger, t);
  const errorText = error?.trim() ?? "";

  useEffect(() => {
    if (!trimmed) return;
    actionRef.current?.focus();
  }, [trimmed, irreversible]);

  useEffect(() => {
    if (!trimmed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (isConfirm) {
        onConfirm?.();
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [trimmed, onClose, onConfirm, isConfirm, busy]);

  if (!trimmed) return null;

  const toneClass =
    tone === "success"
      ? " alert-dialog--success"
      : tone === "warning"
        ? " alert-dialog--warning"
        : tone === "print"
          ? " alert-dialog--print"
          : " alert-dialog--check";
  const irreversibleClass = irreversible ? " alert-dialog--irreversible" : "";

  return (
    <div
      className="clinic-overlay clinic-overlay--fixed alert-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={`clinic-overlay-panel alert-dialog${toneClass}${irreversibleClass}`}
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
            <BadgeIcon tone={tone} />
          </span>
        </div>

        <h2 id={titleId} className="alert-dialog-title">
          {heading}
        </h2>
        {identity?.trim() ? <p className="alert-dialog-identity">{identity.trim()}</p> : null}
        <p id={bodyId} className="alert-dialog-body">
          {trimmed}
        </p>
        {errorText ? <p className="alert-dialog-error">{errorText}</p> : null}

        {isConfirm ? (
          <div className="alert-dialog-actions">
            <button
              type="button"
              className="alert-dialog-ok"
              onClick={onClose}
              disabled={busy}
            >
              {t("cancel")}
            </button>
            <button
              ref={actionRef}
              type="button"
              className={danger ? "btn danger" : "btn primary"}
              onClick={onConfirm}
              disabled={busy}
            >
              {actionLabel}
            </button>
          </div>
        ) : (
          <button
            ref={actionRef}
            type="button"
            className="alert-dialog-ok"
            onClick={onClose}
            disabled={busy}
          >
            {t("alertOk")}
          </button>
        )}
      </div>
    </div>
  );
}
