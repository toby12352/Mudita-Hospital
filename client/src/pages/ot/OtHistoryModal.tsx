import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listOtCases, type OtCase } from "@/features/ot/api";
import { AlertDialog } from "@/shared/AlertDialog";
import { BillBtnIcon } from "@/shared/BillBtnIcon";
import {
  BillHistoryToolbar,
  type BillHistoryQuery,
  type BillHistoryStatusOption,
  type BillHistorySuggestItem,
} from "@/shared/BillHistoryToolbar";
import { BillHistoryTable } from "@/shared/BillHistoryTable";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { useI18n } from "@/shared/i18n";
import { useActionLock } from "@/shared/useActionLock";

/** Cases the admin Delete dialog may remove (no paid bill; no issued/reconciled). */
function isPurgeableOtCase(c: OtCase): boolean {
  if (c.status === "deleted" || c.bill_status === "deleted") return false;
  if (c.status === "issued" || c.status === "reconciled") return false;
  if (c.bill_status === "paid") return false;
  if (c.status === "draft" || c.status === "void") return true;
  if (c.status === "billed") {
    return c.bill_status == null || c.bill_status === "draft" || c.bill_status === "void";
  }
  return false;
}

export type OtHistoryModalMode = "history" | "purge";

function listOpts(query: BillHistoryQuery) {
  return {
    money: query.money || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
    sort: query.sort,
  };
}

function focusableIn(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function OtHistoryModal({
  mode,
  onClose,
  onOpen,
  onPurge,
}: {
  mode: OtHistoryModalMode;
  onClose: () => void;
  onOpen: (id: number) => void;
  onPurge?: (caseId: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [rows, setRows] = useState<OtCase[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { tryAcquire, release } = useActionLock();
  const [loading, setLoading] = useState(true);
  const [purgeStep, setPurgeStep] = useState<0 | 1 | 2>(0);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const statusOptions = useMemo((): BillHistoryStatusOption[] | undefined => {
    if (mode === "history") return undefined;
    return [
      { value: "", label: t("all") },
      { value: "draft", label: t("draft") },
      { value: "void", label: t("voidStatus") },
    ];
  }, [mode, t]);

  const reload = useCallback(
    async (query: BillHistoryQuery) => {
      setLoading(true);
      setError(null);
      setSelectedId(null);
      try {
        let list = await listOtCases(query.q, "", listOpts(query));
        if (mode === "purge") {
          list = list.filter(isPurgeableOtCase);
        }
        setRows(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    },
    [mode],
  );

  const loadSuggestions = useCallback(
    async (q: string, filters: Omit<BillHistoryQuery, "q">): Promise<BillHistorySuggestItem[]> => {
      let list = await listOtCases(q, "", {
        money: filters.money || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        sort: filters.sort,
      });
      if (mode === "purge") {
        list = list.filter(isPurgeableOtCase);
      }
      return list.map((c) => ({ id: c.id, voucher: c.case_no, name: c.patient_name }));
    },
    [mode],
  );

  useEffect(() => {
    const opener = document.activeElement;
    openerRef.current = opener instanceof HTMLElement ? opener : null;
    dialogRef.current?.focus();
    return () => {
      const prev = openerRef.current;
      openerRef.current = null;
      const active = document.activeElement;
      const dialog = dialogRef.current;
      const stillInside = dialog != null && active instanceof Node && dialog.contains(active);
      const nothingFocused =
        active == null || active === document.body || active === document.documentElement;
      if ((stillInside || nothingFocused) && prev && document.contains(prev)) prev.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (document.querySelector(".alert-dialog-overlay, .print-preview-overlay")) return;
      const root = dialogRef.current;
      if (!root) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = focusableIn(root);
      if (focusable.length === 0) return;
      const active = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = active instanceof Node && root.contains(active) && active !== root;
      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const selectedCase = rows.find((r) => r.id === selectedId) ?? null;
  const canPurge = selectedCase != null && isPurgeableOtCase(selectedCase);

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
    if (!tryAcquire()) return;
    setBusy(true);
    setPurgeError(null);
    try {
      await onPurge(selectedCase.id);
      onClose();
    } catch (e) {
      setPurgeError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
      release();
    }
  }

  const title = mode === "history" ? t("otDeskHistoryTitle") : t("billPurge");

  const selectMode = mode === "purge";

  return (
    <div
      className="clinic-overlay clinic-overlay--fixed opd-bill-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && purgeStep === 0) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="clinic-overlay-panel opd-bill-dialog opd-bill-dialog--history"
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

        <BillHistoryToolbar
          searchPlaceholder={t("billHistorySearchPlaceholder")}
          onSearch={(query) => void reload(query)}
          loadSuggestions={loadSuggestions}
          onInvalidRange={() => setError(t("billHistoryInvalidRange"))}
          statusOptions={statusOptions}
        />

        {mode === "purge" ? <p className="hint">{t("billPurgeHint")}</p> : null}

        <BillHistoryTable
          loading={loading}
          emptyLabel={mode === "purge" ? t("noBillsYet") : t("noOtCasesYet")}
          selectedId={selectMode ? selectedId : null}
          onActivate={(id) => {
            if (mode === "history") {
              onOpen(id);
              onClose();
              return;
            }
            setSelectedId(id);
          }}
          rows={rows.map((c) => ({
            id: c.id,
            voucher: c.case_no,
            name: c.patient_name,
            status: c.bill_status ?? c.status,
            printedAt: c.bill_printed_at,
            collectedCash: c.bill_collected_cash,
            when: c.updated_at || c.created_at,
            priceMmk: c.bill_total_mmk ?? null,
          }))}
        />

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
