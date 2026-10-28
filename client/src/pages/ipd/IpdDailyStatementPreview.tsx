import { useEffect, useRef, useState } from "react";
import { fetchIpdStatementHtml } from "@/features/ipd/api";
import { yangonToday } from "@/pages/ipd/ipdStatementDate";
import { DatePicker } from "@/shared/DatePicker";
import { useI18n } from "@/shared/i18n";

export function IpdDailyStatementPreview({
  stayId,
  initialDate,
  title,
  onClose,
}: {
  stayId: number;
  initialDate: string;
  title: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [date, setDate] = useState(initialDate || yangonToday());
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchIpdStatementHtml(stayId, date)
      .then((next) => {
        if (!cancelled) setHtml(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("errGeneric"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stayId, date, t]);

  function printSheet() {
    try {
      frameRef.current?.contentWindow?.focus();
      frameRef.current?.contentWindow?.print();
    } catch {
      /* user can retry */
    }
  }

  return (
    <div
      className="clinic-overlay clinic-overlay--fixed print-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="clinic-overlay-panel print-preview-card print-preview-card--with-aside">
        <div className="print-preview-toolbar">
          <div className="print-preview-heading">
            <h2 className="print-preview-title">{title}</h2>
            {error ? <p className="print-preview-note">{error}</p> : null}
          </div>
          <div className="print-preview-actions">
            <button type="button" className="btn primary" disabled={!html || loading} onClick={printSheet}>
              {t("print")}
            </button>
            <button type="button" className="btn ghost" onClick={onClose}>
              {t("close")}
            </button>
          </div>
        </div>
        <div className="print-preview-body">
          <aside className="print-preview-aside">
            <label className="field field-compact">
              <span>{t("ipdStatementDate")}</span>
              <DatePicker
                value={date}
                onChange={(iso) => {
                  if (iso) setDate(iso);
                }}
              />
            </label>
          </aside>
          <div className="print-preview-frame-wrap" aria-busy={loading}>
            <iframe
              ref={frameRef}
              className="print-preview-iframe"
              title={title}
              sandbox="allow-modals allow-same-origin allow-scripts"
              srcDoc={html}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
