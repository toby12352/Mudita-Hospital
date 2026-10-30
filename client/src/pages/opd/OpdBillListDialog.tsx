import { useCallback, useEffect, useState } from "react";
import { listOpdBills, type OpdBill } from "@/features/opd/api";
import { AlertDialog } from "@/shared/AlertDialog";
import { BillBtnIcon } from "@/shared/BillBtnIcon";
import {
  BillHistoryToolbar,
  type BillHistoryQuery,
  type BillHistorySuggestItem,
} from "@/shared/BillHistoryToolbar";
import { BillHistoryTable } from "@/shared/BillHistoryTable";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { moneyStatusLabel } from "@/shared/BillPayPrint";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { useActionLock, useDelayedFlag } from "@/shared/useActionLock";

export type OpdBillListDialogMode = "history" | "delete" | "purge";

type Props = {
  mode: OpdBillListDialogMode;
  onClose: () => void;
  onOpen: (id: number) => void;
  onVoid: (id: number, reason: string) => Promise<void>;
  onPurge?: (id: number) => Promise<void>;
};

export function OpdBillListDialog({ mode, onClose, onOpen, onVoid, onPurge }: Props) {
  const { t } = useI18n();
  const [bills, setBills] = useState<OpdBill[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("Deleted");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { tryAcquire, release } = useActionLock();
  const voidPending = useDelayedFlag(busy);
  const [loading, setLoading] = useState(true);
  const [purgeStep, setPurgeStep] = useState<0 | 1 | 2>(0);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const loadPurgeList = useCallback(async () => {
    const [drafts, voids] = await Promise.all([
      listOpdBills("", "draft"),
      listOpdBills("", "void"),
    ]);
    const byId = new Map<number, OpdBill>();
    for (const b of [...drafts, ...voids]) byId.set(b.id, b);
    return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, []);

  const reload = useCallback(async (query: BillHistoryQuery) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listOpdBills(query.q, "", {
        money: query.money || undefined,
        from: query.from || undefined,
        to: query.to || undefined,
        sort: query.sort,
      });
      setBills(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSuggestions = useCallback(
    async (q: string, filters: Omit<BillHistoryQuery, "q">): Promise<BillHistorySuggestItem[]> => {
      const list = await listOpdBills(q, "", {
        money: filters.money || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        sort: filters.sort,
      });
      return list.map((b) => ({ id: b.id, voucher: b.bill_no, name: b.patient_name }));
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
        const list =
          mode === "purge"
            ? await loadPurgeList()
            : (await listOpdBills("")).filter((b) => b.status !== "deleted");
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

  const selected = bills.find((b) => b.id === selectedId) ?? null;
  const canVoid =
    selected != null && selected.status !== "void" && selected.status !== "deleted";
  const canPurge =
    selected != null && (selected.status === "draft" || selected.status === "void");

  async function handleDelete() {
    if (!selected || !canVoid) return;
    const reason = voidReason.trim();
    if (!reason) {
      setError(t("voidReasonRequired"));
      return;
    }
    if (!tryAcquire()) return;
    setBusy(true);
    setError(null);
    try {
      await onVoid(selected.id, reason);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
      release();
    }
  }

  function openPurgeConfirm() {
    if (!selected || !canPurge || !onPurge) return;
    setPurgeError(null);
    setPurgeStep(1);
  }

  function closePurgeConfirm() {
    if (busy) return;
    setPurgeStep(0);
    setPurgeError(null);
  }

  async function confirmPurge() {
    if (!selected || !onPurge) return;
    if (purgeStep === 1) {
      setPurgeStep(2);
      setPurgeError(null);
      return;
    }
    if (!tryAcquire()) return;
    setBusy(true);
    setPurgeError(null);
    try {
      await onPurge(selected.id);
      onClose();
    } catch (e) {
      setPurgeError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
      release();
    }
  }

  function handleRowActivate(b: OpdBill) {
    if (mode === "history") {
      onOpen(b.id);
      onClose();
      return;
    }
    setSelectedId(b.id);
  }

  const title =
    mode === "history" ? t("billHistory") : mode === "purge" ? t("billPurge") : t("billDelete");

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
        aria-labelledby="opd-bill-dialog-title"
      >
        <div className="opd-bill-dialog-head">
          <h2 id="opd-bill-dialog-title" className="opd-bill-dialog-title">
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

        {mode === "history" ? (
          <BillHistoryTable
            loading={loading}
            emptyLabel={t("noBillsYet")}
            onActivate={(id) => {
              onOpen(id);
              onClose();
            }}
            rows={bills.map((b) => ({
              id: b.id,
              voucher: b.bill_no,
              name: b.patient_name,
              status: b.status,
              printedAt: b.printed_at,
              collectedCash: b.collected_cash,
              when: b.created_at,
              priceMmk: b.total_mmk,
            }))}
          />
        ) : (
          <>
            {loading ? <p className="hint">{t("loading")}</p> : null}
            <ul className="opd-bill-dialog-list">
              {!loading && bills.length === 0 ? (
                <li className="empty-row">{t("noBillsYet")}</li>
              ) : null}
              {bills.map((b) => {
                const active = selectedId === b.id;
                const selectMode = mode === "delete" || mode === "purge";
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      className={
                        selectMode && active
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
                          {moneyStatusLabel(b.status, t, b.printed_at, b.collected_cash)} ·{" "}
                          {formatMMK(b.total_mmk)} {t("mmk")}
                          {b.doctor_name ? ` · ${b.doctor_name}` : ""}
                          {b.created_at ? ` · ${formatBillWhen(b.created_at)}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
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
              aria-busy={voidPending || undefined}
              onClick={() => void handleDelete()}
            >
              <BillBtnIcon name="trash" pending={voidPending} />
              {t("delete")}
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
              <BillBtnIcon name="trash" />
              {t("delete")}
            </button>
          </div>
        ) : null}

        {mode === "history" ? <p className="hint">{t("billHistoryHint")}</p> : null}
      </div>
      <AlertDialog message={error ?? ""} onClose={() => setError(null)} />
      {purgeStep > 0 && selected ? (
        <AlertDialog
          tone="warning"
          title={t("delete")}
          identity={`${selected.bill_no} · ${selected.patient_name}`}
          message={
            purgeStep === 1
              ? t("confirmPurgeBill").replace("{bill}", selected.bill_no)
              : t("confirmPurgeBillFinal").replace("{bill}", selected.bill_no)
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
