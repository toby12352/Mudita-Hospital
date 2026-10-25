import { useEffect } from "react";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { useI18n } from "@/shared/i18n";

type Props = {
  identity: string;
  message: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Same chrome as pharmacy drug delete; pages own step / API state. */
export function CatalogDeleteDialog({
  identity,
  message,
  busy,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useI18n();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <div
      className="opd-bill-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="opd-bill-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-delete-dialog-title"
      >
        <div className="opd-bill-dialog-head">
          <h2 id="catalog-delete-dialog-title" className="opd-bill-dialog-title">
            {t("delete")}
          </h2>
          <DialogCloseButton onClick={onCancel} disabled={busy} />
        </div>
        <p className="hint">{identity}</p>
        <p>{message}</p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className="btn danger" onClick={onConfirm} disabled={busy}>
            {t("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
