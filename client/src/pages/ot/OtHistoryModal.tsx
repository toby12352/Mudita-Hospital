import { useEffect, useState } from "react";
import { listOtCases, type OtCase } from "@/features/ot/api";
import { useI18n } from "@/shared/i18n";

function sortRecentFirst(rows: OtCase[]): OtCase[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.updated_at || a.created_at) || 0;
    const tb = Date.parse(b.updated_at || b.created_at) || 0;
    return tb - ta;
  });
}

function formatWhen(iso: string): string {
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

export type OtHistoryModalMode = "history" | "delete";

export function OtHistoryModal({
  mode,
  onClose,
  onOpen,
  onVoid,
}: {
  mode: OtHistoryModalMode;
  onClose: () => void;
  onOpen: (id: number) => void;
  onVoid: (caseRow: OtCase, reason: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<OtCase[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("Deleted");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await listOtCases("", "");
        if (!cancelled) setRows(sortRecentFirst(list));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const canVoid = selected != null && selected.ot_bill_id != null && selected.status !== "void";

  async function handleDelete() {
    if (!selected || !canVoid) return;
    const reason = voidReason.trim();
    if (!reason) {
      setError(t("voidReasonRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onVoid(selected, reason);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function handleRowActivate(c: OtCase) {
    if (mode === "history") {
      onOpen(c.id);
      onClose();
      return;
    }
    setSelectedId(c.id);
  }

  return (
    <div
      className="opd-bill-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="opd-bill-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ot-history-dialog-title"
      >
        <div className="opd-bill-dialog-head">
          <h2 id="ot-history-dialog-title" className="opd-bill-dialog-title">
            {mode === "history" ? t("otDeskHistoryTitle") : t("otDeskDeleteTitle")}
          </h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>

        {loading ? <p className="hint">{t("loading")}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        <ul className="opd-bill-dialog-list">
          {!loading && rows.length === 0 ? (
            <li className="empty-row">{t("noOtCasesYet")}</li>
          ) : null}
          {rows.map((c) => {
            const active = selectedId === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={
                    mode === "delete" && active
                      ? "opd-bill-dialog-row opd-bill-dialog-row--selected"
                      : "opd-bill-dialog-row"
                  }
                  onClick={() => handleRowActivate(c)}
                >
                  <span className="opd-bill-dialog-row-main">
                    <span className="row-title">
                      {c.case_no} · {c.patient_name}
                    </span>
                    <span className="row-sub">
                      {c.status.toUpperCase()}
                      {c.procedure_name ? ` · ${c.procedure_name}` : ""}
                      {c.doctor_name ? ` · ${c.doctor_name}` : ""}
                      {c.ot_bill_id ? ` · bill` : ""}
                      {c.updated_at ? ` · ${formatWhen(c.updated_at)}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {mode === "delete" ? (
          <div className="opd-bill-dialog-footer">
            <label className="field grow">
              {t("voidReason")}
              <input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder={t("voidReasonRequired")}
                disabled={busy}
              />
            </label>
            <button
              type="button"
              className="btn ghost danger"
              disabled={busy || !canVoid}
              onClick={() => void handleDelete()}
            >
              {busy ? "…" : t("delete")}
            </button>
          </div>
        ) : (
          <p className="hint">{t("billHistoryHint")}</p>
        )}
      </div>
    </div>
  );
}
