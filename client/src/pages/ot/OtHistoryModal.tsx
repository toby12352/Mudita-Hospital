import { useCallback, useEffect, useState } from "react";
import { listOtBills, listOtCases, type OtBill, type OtCase } from "@/features/ot/api";
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import {
  BillHistoryToolbar,
  type BillHistoryQuery,
  type BillHistorySuggestItem,
} from "@/shared/BillHistoryToolbar";
import { moneyStatusLabel } from "@/shared/BillPayPrint";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { formatMMK } from "@/shared/format";
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
  onPurge?: (billId: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<OtCase[]>([]);
  const [bills, setBills] = useState<OtBill[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("Voided");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [purgeStep, setPurgeStep] = useState<0 | 1 | 2>(0);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const loadPurgeList = useCallback(async () => {
    const [drafts, voids] = await Promise.all([
      listOtBills("", "draft"),
      listOtBills("", "void"),
    ]);
    const byId = new Map<number, OtBill>();
    for (const b of [...drafts, ...voids]) byId.set(b.id, b);
    return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
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
        if (mode === "purge") {
          const list = await loadPurgeList();
          if (!cancelled) setBills(list);
        } else {
          const list = await listOtCases("", "");
          if (!cancelled) setRows(list);
        }
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
  const selectedBill = bills.find((b) => b.id === selectedId) ?? null;
  const canVoid =
    selectedCase != null && selectedCase.ot_bill_id != null && selectedCase.status !== "void";
  const canPurge =
    selectedBill != null &&
    (selectedBill.status === "draft" || selectedBill.status === "void");

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
    if (!selectedBill || !canPurge || !onPurge) return;
    setPurgeError(null);
    setPurgeStep(1);
  }

  function closePurgeConfirm() {
    if (busy) return;
    setPurgeStep(0);
    setPurgeError(null);
  }

  async function confirmPurge() {
    if (!selectedBill || !onPurge) return;
    if (purgeStep === 1) {
      setPurgeStep(2);
      setPurgeError(null);
      return;
    }
    setBusy(true);
    setPurgeError(null);
    try {
      await onPurge(selectedBill.id);
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

  return (
    <div
      className="opd-bill-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && purgeStep === 0) onClose();
      }}
    >
      <div
        className={`opd-bill-dialog${mode === "history" ? " opd-bill-dialog--history" : ""}`}
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

        {mode === "purge" ? (
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
                      active
                        ? "opd-bill-dialog-row opd-bill-dialog-row--selected"
                        : "opd-bill-dialog-row"
                    }
                    onClick={() => setSelectedId(b.id)}
                  >
                    <span className="opd-bill-dialog-row-main">
                      <span className="row-title">
                        {b.bill_no} · {b.patient_name}
                      </span>
                      <span className="row-sub">
                        {moneyStatusLabel(b.status, t, b.printed_at, b.collected_cash)} ·{" "}
                        {formatMMK(b.total_mmk)} {t("mmk")}
                        {b.case_no ? ` · ${b.case_no}` : ""}
                        {b.created_at ? ` · ${formatWhen(b.created_at)}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
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
        )}

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
      {purgeStep > 0 && selectedBill ? (
        <AlertDialog
          tone="warning"
          title={t("delete")}
          identity={`${selectedBill.bill_no} · ${selectedBill.patient_name}`}
          message={
            purgeStep === 1
              ? t("confirmPurgeBill").replace("{bill}", selectedBill.bill_no)
              : t("confirmPurgeBillFinal").replace("{bill}", selectedBill.bill_no)
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
