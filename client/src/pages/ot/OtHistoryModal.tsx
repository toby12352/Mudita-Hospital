import { useCallback, useEffect, useState } from "react";
import { listOtCases, type OtCase } from "@/features/ot/api";
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import {
  BillHistoryToolbar,
  type BillHistoryQuery,
  type BillHistorySuggestItem,
} from "@/shared/BillHistoryToolbar";
import { moneyStatusLabel } from "@/shared/BillPayPrint";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { useI18n } from "@/shared/i18n";

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

/** Cases the admin Delete dialog may remove (no paid bill; no issued/reconciled). */
function isPurgeableOtCase(c: OtCase): boolean {
  if (c.status === "issued" || c.status === "reconciled") return false;
  if (c.bill_status === "paid") return false;
  if (c.status === "draft" || c.status === "void") return true;
  if (c.status === "billed") {
    return c.bill_status == null || c.bill_status === "draft" || c.bill_status === "void";
  }
  return false;
}

export type OtHistoryModalMode = "history" | "delete" | "purge";

export function OtHistoryModal({
  mode,
  onClose,
  onOpen,
  onVoid,
  onPurge,
}: {
  mode: OtHistoryModalMode;
  onClose: () => void;
  onOpen: (id: number) => void;
  onVoid: (caseRow: OtCase, reason: string) => Promise<void>;
  onPurge?: (caseId: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<OtCase[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("Voided");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [purgeStep, setPurgeStep] = useState<0 | 1 | 2>(0);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const loadPurgeList = useCallback(async () => {
    const list = await listOtCases("", "");
    return list
      .filter(isPurgeableOtCase)
      .sort((a, b) => {
        const aAt = a.updated_at || a.created_at;
        const bAt = b.updated_at || b.created_at;
        return aAt < bAt ? 1 : -1;
      });
  }, []);

  const reload = useCallback(async (query: BillHistoryQuery) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listOtCases(query.q, "", {
        money: query.money || undefined,
        from: query.from || undefined,
        to: query.to || undefined,
        sort: query.sort,
      });
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSuggestions = useCallback(
    async (q: string, filters: Omit<BillHistoryQuery, "q">): Promise<BillHistorySuggestItem[]> => {
      const list = await listOtCases(q, "", {
        money: filters.money || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        sort: filters.sort,
      });
      return list.map((c) => ({ id: c.id, voucher: c.case_no, name: c.patient_name }));
    },
    [],
  );

  useEffect(() => {
    if (mode === "history") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = mode === "purge" ? await loadPurgeList() : await listOtCases("", "");
        if (!cancelled) setRows(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, loadPurgeList]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".alert-dialog-overlay")) return;
      e.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedCase = rows.find((r) => r.id === selectedId) ?? null;
  const canVoid =
    selectedCase != null && selectedCase.ot_bill_id != null && selectedCase.status !== "void";
  const canPurge = selectedCase != null && isPurgeableOtCase(selectedCase);

  async function handleDelete() {
    if (!selectedCase || !canVoid) return;
    const reason = voidReason.trim();
    if (!reason) {
      setError(t("voidReasonRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onVoid(selectedCase, reason);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function openPurgeConfirm() {
    if (!selectedCase || !canPurge || !onPurge) return;
    setPurgeError(null);
    setPurgeStep(1);
  }

  function closePurgeConfirm() {
    if (busy) return;
    setPurgeStep(0);
    setPurgeError(null);
  }

  async function confirmPurge() {
    if (!selectedCase || !onPurge) return;
    if (purgeStep === 1) {
      setPurgeStep(2);
      setPurgeError(null);
      return;
    }
    setBusy(true);
    setPurgeError(null);
    try {
      await onPurge(selectedCase.id);
      onClose();
    } catch (e) {
      setPurgeError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function handleCaseActivate(c: OtCase) {
    if (mode === "history") {
      onOpen(c.id);
      onClose();
      return;
    }
    setSelectedId(c.id);
  }

  const title =
    mode === "history"
      ? t("otDeskHistoryTitle")
      : mode === "purge"
        ? t("billPurge")
        : t("otDeskDeleteTitle");

  const selectMode = mode === "delete" || mode === "purge";

  return (
    <div
      className="clinic-overlay clinic-overlay--fixed opd-bill-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && purgeStep === 0) onClose();
      }}
    >
      <div
        className={`clinic-overlay-panel opd-bill-dialog${mode === "history" ? " opd-bill-dialog--history" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ot-history-dialog-title"
      >
        <div className="opd-bill-dialog-head">
          <h2 id="ot-history-dialog-title" className="opd-bill-dialog-title">
            {title}
          </h2>
          <DialogCloseButton onClick={onClose} />
        </div>

        {mode === "history" ? (
          <BillHistoryToolbar
            searchPlaceholder={t("billHistorySearchPlaceholder")}
            onSearch={(query) => void reload(query)}
            loadSuggestions={loadSuggestions}
            onInvalidRange={() => setError(t("billHistoryInvalidRange"))}
          />
        ) : null}

        {mode === "purge" ? <p className="hint">{t("billPurgeHint")}</p> : null}

        {loading ? <p className="hint">{t("loading")}</p> : null}

        <ul className="opd-bill-dialog-list">
          {!loading && rows.length === 0 ? (
            <li className="empty-row">{mode === "purge" ? t("noBillsYet") : t("noOtCasesYet")}</li>
          ) : null}
          {rows.map((c) => {
            const active = selectedId === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={
                    selectMode && active
                      ? "opd-bill-dialog-row opd-bill-dialog-row--selected"
                      : "opd-bill-dialog-row"
                  }
                  onClick={() => handleCaseActivate(c)}
                >
                  <span className="opd-bill-dialog-row-main">
                    <span className="row-title">
                      {c.case_no} · {c.patient_name}
                    </span>
                    <span className="row-sub">
                      {moneyStatusLabel(
                        c.bill_status ?? c.status,
                        t,
                        c.bill_printed_at,
                        c.bill_collected_cash,
                      )}
                      {c.procedure_name ? ` · ${c.procedure_name}` : ""}
                      {c.doctor_name ? ` · ${c.doctor_name}` : ""}
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
              className="btn action danger"
              disabled={busy || !canVoid}
              onClick={() => void handleDelete()}
            >
              <ActionIcon name="trash" />
              {busy ? "…" : t("voidStatus")}
            </button>
          </div>
        ) : null}

        {mode === "purge" ? (
          <div className="opd-bill-dialog-footer">
            <button
              type="button"
              className="btn action danger"
              disabled={busy || !canPurge}
              onClick={openPurgeConfirm}
            >
              <ActionIcon name="trash" />
              {t("delete")}
            </button>
          </div>
        ) : null}

        {mode === "history" ? <p className="hint">{t("billHistoryHint")}</p> : null}
      </div>
      <AlertDialog message={error ?? ""} onClose={() => setError(null)} />
      {purgeStep > 0 && selectedCase ? (
        <AlertDialog
          tone="warning"
          title={t("delete")}
          identity={`${selectedCase.case_no} · ${selectedCase.patient_name}`}
          message={
            purgeStep === 1
              ? t("confirmPurgeBill").replace("{bill}", selectedCase.case_no)
              : t("confirmPurgeBillFinal").replace("{bill}", selectedCase.case_no)
          }
          error={purgeError}
          busy={busy}
          danger
          irreversible={purgeStep === 2}
          confirmLabel={t("delete")}
          onClose={closePurgeConfirm}
          onConfirm={() => void confirmPurge()}
        />
      ) : null}
    </div>
  );
}
