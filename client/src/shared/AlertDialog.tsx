import { useEffect, useId, useRef } from "react";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { useI18n } from "@/shared/i18n";

type Props = {
  message: string;
  onClose: () => void;
  /** Default "check" (warning). Use "success" for a green tick confirmation. */
  tone?: "check" | "success";
  /** Optional title; defaults to alertCheck / transferred by tone. */
  title?: string;
};

export function AlertDialog({ message, onClose, tone = "check", title }: Props) {
  const { t } = useI18n();
  const okRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const trimmed = message.trim();
  const heading = title?.trim() || (tone === "success" ? t("transferred") : t("alertCheck"));

  useEffect(() => {
    if (!trimmed) return;
    okRef.current?.focus();
  }, [trimmed]);

  useEffect(() => {
    if (!trimmed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [trimmed, onClose]);

  if (!trimmed) return null;

  return (
    <div
      className="alert-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`alert-dialog${tone === "success" ? " alert-dialog--success" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <DialogCloseButton onClick={onClose} />

        <div className="alert-dialog-badge" aria-hidden="true">
          <span className="alert-dialog-badge-glow" />
          <span className="alert-dialog-badge-circle">
            {tone === "success" ? (
              <svg viewBox="0 0 48 48" width="40" height="40">
                <path
                  className="alert-dialog-check-path"
                  d="M14 24.5l7 7 13-15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 48 48" width="40" height="40">
                <rect
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
                  d="M24 17v10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="24" cy="32" r="1.6" fill="currentColor" />
              </svg>
            )}
          </span>
        </div>

        <h2 id={titleId} className="alert-dialog-title">
          {heading}
        </h2>
        <p id={bodyId} className="alert-dialog-body">
          {trimmed}
        </p>

        <button
          ref={okRef}
          type="button"
          className="alert-dialog-ok"
          onClick={onClose}
        >
          {t("alertOk")}
        </button>
      </div>
    </div>
  );
}
