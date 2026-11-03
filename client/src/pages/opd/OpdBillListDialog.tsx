import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listOpdBills, type OpdBill } from "@/features/opd/api";
import { AlertDialog } from "@/shared/AlertDialog";
import { BillBtnIcon } from "@/shared/BillBtnIcon";
import {
  BillHistoryToolbar,
  billHistoryOrderHintKey,
  type BillHistoryQuery,
  type BillHistoryStatusOption,
  type BillHistorySuggestItem,
} from "@/shared/BillHistoryToolbar";
import { BillHistoryTable } from "@/shared/BillHistoryTable";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { useI18n } from "@/shared/i18n";
import { useActionLock } from "@/shared/useActionLock";

export type OpdBillListDialogMode = "history" | "purge";

type Props = {
  mode: OpdBillListDialogMode;
  onClose: () => void;
  onOpen: (id: number) => void;
  onPurge?: (id: number) => Promise<void>;
};

function listOpts(query: BillHistoryQuery) {
  return {
    money: query.money || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
    sort: query.sort,
    order: query.order,
  };
}

function focusableIn(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function OpdBillListDialog({ mode, onClose, onOpen, onPurge }: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [bills, setBills] = useState<OpdBill[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { tryAcquire, release } = useActionLock();
  const [loading, setLoading] = useState(true);
  const [purgeStep, setPurgeStep] = useState<0 | 1 | 2>(0);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [listQuery, setListQuery] = useState<Pick<BillHistoryQuery, "sort" | "order">>({
    sort: "desc",
    order: "voucher",
  });

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
      setListQuery({ sort: query.sort, order: query.order });
      try {
        let list = await listOpdBills(query.q, "", listOpts(query));
        if (mode === "purge") {
          list = list.filter((b) => b.status === "draft" || b.status === "void");
        }
        setBills(list);
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
      let list = await listOpdBills(q, "", {
        money: filters.money || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        sort: filters.sort,
        order: filters.order,
      });
      if (mode === "purge") {
        list = list.filter((b) => b.status === "draft" || b.status === "void");
      }
      return list.map((b) => ({ id: b.id, voucher: b.bill_no, name: b.patient_name }));
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

  const selected = bills.find((b) => b.id === selectedId) ?? null;
  const canPurge =
    selected != null && (selected.status === "draft" || selected.status === "void");

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

  const title = mode === "history" ? t("billHistory") : t("billPurge");
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
        aria-labelledby="opd-bill-dialog-title"
      >
        <div className="opd-bill-dialog-head">
          <h2 id="opd-bill-dialog-title" className="opd-bill-dialog-title">
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
          voucherSort
        />

        {mode === "purge" ? <p className="hint">{t("billPurgeHint")}</p> : null}

        <BillHistoryTable
          loading={loading}
          emptyLabel={t("noBillsYet")}
          selectedId={selectMode ? selectedId : null}
          onActivate={(id) => {
            if (mode === "history") {
              onOpen(id);
              onClose();
              return;
            }
            setSelectedId(id);
          }}
          rows={bills.map((b) => ({
            id: b.id,
            voucher: b.bill_no,
            name: b.patient_name,
            roomNo: b.ipd_room_no,
            status: b.status,
            printedAt: b.printed_at,
            collectedCash: b.collected_cash,
            when: b.created_at,
            priceMmk: b.total_mmk,
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

        {mode === "history" ? (
          <p className="hint">{t(billHistoryOrderHintKey(listQuery))}</p>
        ) : null}
      </div>
      <AlertDialog message={error ?? ""} onClose={() => setError(null)} />
      {purgeStep > 0 && selected ? (
        <AlertDialog
          tone="warning"
          icon="trash"
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
