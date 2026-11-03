import { useCallback, useEffect, useId, useRef } from "react";
import { notifyUnauthorized } from "@/shared/api";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { useI18n } from "@/shared/i18n";
import { useDelayedFlag } from "@/shared/useActionLock";

export type AlertTone = "check" | "warning" | "success" | "print" | "save" | "door";
/** Optional badge glyph override. Use "trash" on confirms opened from a trash button. */
export type AlertIcon = "trash";

type Props = {
  message: string;
  onClose: () => void;
  /** Default "check". Use "success" for a green tick, "warning" for confirms, "print" after Mark Paid, "save" for leave-draft, "door" for discharge. */
  tone?: AlertTone;
  /** Optional title; defaults by tone. */
  title?: string;
  /** When set, shows Cancel + confirm instead of a single OK. */
  onConfirm?: () => void;
  /** Label for the confirm button (defaults: print → Print, save → Save draft, danger → Delete, else Confirm). */
  confirmLabel?: string;
  /** Label for the single OK button when not confirming (defaults: alertOk). */
  okLabel?: string;
  /** Optional third action (e.g. leave without saving). Cancel / Escape still call onClose. */
  onDiscard?: () => void;
  /** Label for onDiscard (defaults: dontSave). */
  discardLabel?: string;
  /** Hide the Cancel button (leave-draft keeps Escape / × / scrim via onClose). */
  hideCancel?: boolean;
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
  /** Badge glyph; defaults from tone. Pass "trash" when the opener is a trash button. */
  icon?: AlertIcon;
};

function defaultTitle(tone: AlertTone, t: (k: string) => string): string {
  if (tone === "success") return t("transferred");
  if (tone === "warning") return t("alertWarning");
  if (tone === "print") return t("paid");
  if (tone === "save") return t("saveDraft");
  if (tone === "door") return t("confirm");
  return t("alertCheck");
}

function defaultConfirmLabel(
  tone: AlertTone,
  danger: boolean,
  t: (k: string) => string,
): string {
  if (tone === "print") return t("print");
  if (tone === "save") return t("saveDraft");
  if (danger) return t("delete");
  return t("confirm");
}

/** 40px badge glyph for AlertDialog and void step-1 chrome. */
export function AlertBadgeIcon({
  tone,
  icon,
}: {
  tone: AlertTone;
  icon?: AlertIcon;
}) {
  if (icon === "trash") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40">
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--trash-lid"
          d="M9.75 13.5h28.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--trash-handle"
          d="M18.75 13.5V9.75h10.5V13.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--trash-body"
          d="M13.2 13.5l1.65 24.75h18.3L34.8 13.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--trash-lines"
          d="M20.25 21v11.25M27.75 21v11.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

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

  if (tone === "save") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40" className="alert-dialog-save">
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--save"
          d="M12 12h20l6 6v18a2 2 0 01-2 2H12a2 2 0 01-2-2V14a2 2 0 012-2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--save"
          d="M16 12v10h14V12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--save-slot"
          d="M16 36h16v-8H16z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <rect
          className="alert-dialog-save-tab"
          x="28"
          y="14"
          width="5"
          height="6"
          rx="1"
          fill="currentColor"
          opacity="0.28"
        />
      </svg>
    );
  }

  if (tone === "door") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40" className="alert-dialog-door">
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--door-frame"
          d="M12 38V12h16v26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="alert-dialog-draw-path alert-dialog-draw-path--door-leaf"
          d="M28 12l10 3.5V34.5L28 38"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          className="alert-dialog-door-knob"
          cx="34.5"
          cy="25"
          r="1.5"
          fill="currentColor"
        />
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
  okLabel,
  onDiscard,
  discardLabel,
  hideCancel = false,
  danger = false,
  busy = false,
  error = null,
  identity,
  irreversible = false,
  icon,
}: Props) {
  const { t } = useI18n();
  const actionRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const trimmed = message.trim();
  const isConfirm = typeof onConfirm === "function";
  const showDiscard = typeof onDiscard === "function";
  const isSessionExpired = !isConfirm && trimmed === t("errSessionExpired");
  const heading = title?.trim() || defaultTitle(tone, t);
  const actionLabel = confirmLabel?.trim() || defaultConfirmLabel(tone, danger, t);
  const discardActionLabel = discardLabel?.trim() || t("dontSave");
  const singleOkLabel = okLabel?.trim() || (isSessionExpired ? t("logOut") : t("alertOk"));
  const errorText = error?.trim() ?? "";
  const showPending = useDelayedFlag(busy);

  const dismiss = useCallback(() => {
    if (isSessionExpired) notifyUnauthorized();
    onClose();
  }, [isSessionExpired, onClose]);

  useEffect(() => {
    if (!trimmed) return;
    const opener = document.activeElement;
    openerRef.current = opener instanceof HTMLElement ? opener : null;
    actionRef.current?.focus();
    return () => {
      const prev = openerRef.current;
      openerRef.current = null;
      if (prev && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [trimmed, irreversible]);

  useEffect(() => {
    if (!trimmed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      if (e.key === "Escape") {
        dismiss();
        return;
      }
      if (isConfirm) {
        onConfirm?.();
        return;
      }
      dismiss();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [trimmed, dismiss, onConfirm, isConfirm, busy]);

  if (!trimmed) return null;

  const toneClass =
    tone === "success"
      ? " alert-dialog--success"
      : tone === "warning"
        ? " alert-dialog--warning"
        : tone === "print"
          ? " alert-dialog--print"
          : tone === "save"
            ? " alert-dialog--save"
            : tone === "door"
              ? " alert-dialog--door"
              : " alert-dialog--check";
  const irreversibleClass = irreversible ? " alert-dialog--irreversible" : "";

  return (
    <div
      className="clinic-overlay clinic-overlay--fixed alert-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) dismiss();
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
        <DialogCloseButton onClick={dismiss} disabled={busy} />

        <div className="alert-dialog-badge" aria-hidden="true">
          <span className="alert-dialog-badge-glow" />
          <span className="alert-dialog-badge-circle">
            <AlertBadgeIcon tone={tone} icon={icon} />
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
            {hideCancel ? null : (
              <button
                type="button"
                className="alert-dialog-ok"
                onClick={onClose}
                disabled={busy}
              >
                {t("cancel")}
              </button>
            )}
            {showDiscard ? (
              <button
                type="button"
                className="alert-dialog-ok"
                onClick={onDiscard}
                disabled={busy}
              >
                {discardActionLabel}
              </button>
            ) : null}
            <button
              ref={actionRef}
              type="button"
              className={danger ? "btn danger" : "btn primary"}
              onClick={onConfirm}
              disabled={busy}
              aria-busy={showPending || undefined}
            >
              {showPending ? <span className="opd-bill-btn-spinner" aria-hidden="true" /> : null}
              {actionLabel}
            </button>
          </div>
        ) : (
          <button
            ref={actionRef}
            type="button"
            className="alert-dialog-ok"
            onClick={dismiss}
            disabled={busy}
          >
            {singleOkLabel}
          </button>
        )}
      </div>
    </div>
  );
}
