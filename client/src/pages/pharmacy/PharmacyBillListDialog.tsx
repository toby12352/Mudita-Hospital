import { useEffect, useState } from "react";
import {
  listPharmacyBills,
  type PharmacyBill,
  type PharmacyBillKind,
} from "@/features/pharmacy/api";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";

export type PharmacyBillListDialogMode = "history" | "delete";

type Props = {
  mode: PharmacyBillListDialogMode;
  kind?: PharmacyBillKind;
  onClose: () => void;
  onOpen: (id: number) => void;
  onVoid: (id: number, reason: string) => Promise<void>;
};

export function PharmacyBillListDialog({
  mode,
  kind = "sale",
  onClose,
  onOpen,
  onVoid,
}: Props) {
  const { t } = useI18n();
  const [bills, setBills] = useState<PharmacyBill[]>([]);
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
        const list = await listPharmacyBills("", "", kind);
        if (!cancelled) setBills(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

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

  const selected = bills.find((b) => b.id === selectedId) ?? null;
  const canVoid = selected != null && selected.status !== "void";

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
      await onVoid(selected.id, reason);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function handleRowActivate(b: PharmacyBill) {
    if (mode === "history") {
      onOpen(b.id);
      onClose();
      return;
    }
    setSelectedId(b.id);
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
        aria-labelledby="pharmacy-bill-dialog-title"
      >
        <div className="opd-bill-dialog-head">
          <h2 id="pharmacy-bill-dialog-title" className="opd-bill-dialog-title">
            {mode === "history" ? t("billHistory") : t("billDelete")}
          </h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>

        {loading ? <p className="hint">{t("loading")}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        <ul className="opd-bill-dialog-list">
          {!loading && bills.length === 0 ? (
            <li className="empty-row">{t("noBillsYet")}</li>
          ) : null}
          {bills.map((b) => {
            const active = selectedId === b.id;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className={
                    mode === "delete" && active
                      ? "opd-bill-dialog-row opd-bill-dialog-row--selected"
                      : "opd-bill-dialog-row"
                  }
                  onClick={() => handleRowActivate(b)}
                >
                  <span className="opd-bill-dialog-row-main">
                    <span className="row-title">
                      {b.bill_no} · {b.patient_name}
                    </span>
                    <span className="row-sub">
                      {b.status.toUpperCase()} · {formatMMK(b.total_mmk)} {t("mmk")}
                      {b.created_at ? ` · ${formatBillWhen(b.created_at)}` : ""}
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

function formatBillWhen(iso: string): string {
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
