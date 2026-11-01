import { useEffect, useRef, useState } from "react";
import {
  creditIpdDayVoucher,
  fetchIpdDayVoucher,
  fetchIpdStatementHtml,
  issueIpdDayVoucher,
  payIpdDayVoucher,
  reopenIpdDayVoucher,
  unpayIpdDayVoucher,
  type IpdDayVoucher,
} from "@/features/ipd/api";
import { yangonAddDays, yangonToday } from "@/pages/ipd/ipdStatementDate";
import { ActionIcon } from "@/shared/ActionIcon";
import { BillBtnIcon } from "@/shared/BillBtnIcon";
import { ApiError } from "@/shared/errors";
import { AlertDialog } from "@/shared/AlertDialog";
import { DatePicker } from "@/shared/DatePicker";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { useActionLock, useDelayedFlag } from "@/shared/useActionLock";

type DaySheetLoad = { voucher: IpdDayVoucher | null; html: string };

// React Strict Mode runs the effect twice. Sharing one request keeps the
// second from issuing while the first still holds the database.
const daySheetLoads = new Map<string, Promise<DaySheetLoad>>();

function loadDaySheet(stayId: number, date: string, stayOpen: boolean): Promise<DaySheetLoad> {
  const key = `${stayId}\n${date}\n${stayOpen ? "1" : "0"}`;
  const existing = daySheetLoads.get(key);
  if (existing) return existing;
  const job = (async () => {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let voucher: IpdDayVoucher | null = null;
        const today = yangonToday();
        if (date <= today) {
          try {
            voucher = await fetchIpdDayVoucher(stayId, date);
          } catch (e: unknown) {
            if (!(e instanceof ApiError) || e.status !== 404) throw e;
            voucher = null;
          }
          // Refresh closing while Awaiting. Do not create a voucher on open —
          // a reopened day stays open until Close the Bill.
          if (stayOpen && voucher?.status === "issued") {
            voucher = await issueIpdDayVoucher(stayId, date);
          }
        }
        const html = await fetchIpdStatementHtml(stayId, date);
        return { voucher, html };
      } catch (e: unknown) {
        last = e;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
    }
    throw last;
  })();
  daySheetLoads.set(key, job);
  void job.finally(() => {
    if (daySheetLoads.get(key) === job) daySheetLoads.delete(key);
  });
  return job;
}

export function IpdDailyStatementPreview({
  stayId,
  stayOpen,
  initialDate,
  title,
  onClose,
  onDecided,
}: {
  stayId: number;
  stayOpen: boolean;
  initialDate: string;
  title: string;
  onClose: () => void;
  /** Reload the stay after issue, pay, carry, or undo so the list and ledger match. */
  onDecided?: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onDecidedRef = useRef(onDecided);
  onDecidedRef.current = onDecided;
  const [date, setDate] = useState(initialDate || yangonToday());
  const [html, setHtml] = useState("");
  const [voucher, setVoucher] = useState<IpdDayVoucher | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "close" | "reopen" | "pay" | "credit" | "unpay" | null
  >(null);
  const [confirmPay, setConfirmPay] = useState(false);
  const { tryAcquire, release } = useActionLock();
  const printPending = useDelayedFlag(printing);
  const decidePending = useDelayedFlag(deciding);
  const tRef = useRef(t);
  tRef.current = t;
  const today = yangonToday();
  const dueMmk = voucher && voucher.closing_mmk < 0 ? -voucher.closing_mmk : 0;
  const canCloseBill =
    stayOpen && date <= today && !loading && !deciding && !voucher;
  const canReopenBill =
    stayOpen &&
    !loading &&
    !deciding &&
    voucher?.status === "issued" &&
    voucher.can_reopen !== false;
  const closeOrReopenDisabled = voucher?.status === "issued" ? !canReopenBill : !canCloseBill;
  const payDisabled =
    !stayOpen || loading || deciding || !voucher || voucher.status === "paid";
  const payLaterDisabled =
    !stayOpen ||
    loading ||
    deciding ||
    !voucher ||
    voucher.status !== "issued" ||
    voucher.closing_mmk >= 0;
  const unpayDisabled =
    !stayOpen ||
    loading ||
    deciding ||
    !voucher ||
    voucher.status !== "paid" ||
    voucher.can_unpay === false;
  const nextDisabled = date >= today;

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
    function focusableIn(root: ParentNode): HTMLElement[] {
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
        ),
      );
    }
    function onKey(e: KeyboardEvent) {
      // This overlay is itself `.print-preview-overlay`; only yield to alerts.
      if (document.querySelector(".alert-dialog-overlay")) return;
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml("");
    setVoucher(null);
    setConfirmPay(false);
    (async () => {
      try {
        const loaded = await loadDaySheet(stayId, date, stayOpen);
        if (cancelled) return;
        setVoucher(loaded.voucher);
        setHtml(loaded.html);
        if (loaded.voucher && date < yangonToday()) onDecidedRef.current?.();
      } catch (e: unknown) {
        if (!cancelled) {
          setVoucher(null);
          setHtml("");
          setError(e instanceof Error ? e.message : tRef.current("errGeneric"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stayId, date, stayOpen]);

  function printSheet() {
    if (!tryAcquire()) return;
    setPrinting(true);
    try {
      frameRef.current?.contentWindow?.focus();
      frameRef.current?.contentWindow?.print();
    } catch {
      /* user can retry */
    } finally {
      setPrinting(false);
      release();
    }
  }

  async function closeBill() {
    if (!tryAcquire()) return;
    setDeciding(true);
    setPendingAction("close");
    setError(null);
    try {
      const next = await issueIpdDayVoucher(stayId, date);
      setVoucher(next);
      setHtml(await fetchIpdStatementHtml(stayId, date));
      onDecidedRef.current?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setDeciding(false);
      setPendingAction(null);
      release();
    }
  }

  async function reopenBill() {
    if (!tryAcquire()) return;
    setDeciding(true);
    setPendingAction("reopen");
    setError(null);
    try {
      await reopenIpdDayVoucher(stayId, date);
      setVoucher(null);
      setHtml(await fetchIpdStatementHtml(stayId, date));
      onDecidedRef.current?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
      if (e instanceof ApiError && /later/i.test(e.raw)) {
        setVoucher((current) => (current ? { ...current, can_reopen: false } : current));
      }
    } finally {
      setDeciding(false);
      setPendingAction(null);
      release();
    }
  }

  async function decide(action: "pay" | "credit" | "unpay") {
    if (!tryAcquire()) return;
    setDeciding(true);
    setPendingAction(action);
    setError(null);
    try {
      const next =
        action === "pay"
          ? await payIpdDayVoucher(stayId, date)
          : action === "credit"
            ? await creditIpdDayVoucher(stayId, date)
            : await unpayIpdDayVoucher(stayId, date);
      setVoucher(next);
      setConfirmPay(false);
      setHtml(await fetchIpdStatementHtml(stayId, date));
      onDecidedRef.current?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
      if (action === "unpay" && e instanceof ApiError && /later/i.test(e.raw)) {
        setVoucher((current) => (current ? { ...current, can_unpay: false } : current));
      }
    } finally {
      setDeciding(false);
      setPendingAction(null);
      release();
    }
  }

  const chip = statusChip(date, today, voucher, loading, t);
  const closeOrReopenPending =
    decidePending && (pendingAction === "close" || pendingAction === "reopen");

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
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
            {error && !confirmPay ? <p className="print-preview-note">{error}</p> : null}
          </div>
          <div className="print-preview-actions">
            {chip ? (
              <span className="ipd-voucher-chip ipd-voucher-chip--toolbar" role="status">
                {chip}
              </span>
            ) : null}
            <button
              type="button"
              className="btn primary"
              disabled={!html || loading || printing || deciding}
              aria-busy={printPending || undefined}
              onClick={printSheet}
            >
              {printPending ? <span className="opd-bill-btn-spinner" aria-hidden="true" /> : null}
              {t("print")}
            </button>
            <button type="button" className="btn ghost" onClick={onClose}>
              {t("close")}
            </button>
          </div>
        </div>
        <div className="print-preview-body">
          <div className="print-preview-frame-wrap" aria-busy={loading}>
            <iframe
              ref={frameRef}
              className="print-preview-iframe"
              title={title}
              sandbox="allow-modals allow-same-origin allow-scripts"
              srcDoc={html}
            />
          </div>
          <aside className="print-preview-aside">
            <label className="field field-compact">
              <span>{t("ipdStatementDate")}</span>
              <div className="ipd-date-stepper">
                <button
                  type="button"
                  className="btn ghost ipd-date-step"
                  aria-label={t("ipdPrevDay")}
                  disabled={loading || deciding}
                  onClick={() => setDate((current) => yangonAddDays(current, -1))}
                >
                  <span className="ipd-date-step-icon ipd-date-step-icon--prev" aria-hidden="true">
                    <ActionIcon name="chevron" />
                  </span>
                </button>
                <DatePicker
                  value={date}
                  onChange={(iso) => {
                    if (iso) setDate(iso);
                  }}
                />
                <button
                  type="button"
                  className="btn ghost ipd-date-step"
                  aria-label={t("ipdNextDay")}
                  disabled={loading || deciding || nextDisabled}
                  onClick={() =>
                    setDate((current) => {
                      const next = yangonAddDays(current, 1);
                      return next > today ? current : next;
                    })
                  }
                >
                  <span className="ipd-date-step-icon ipd-date-step-icon--next" aria-hidden="true">
                    <ActionIcon name="chevron" />
                  </span>
                </button>
              </div>
            </label>
            <div className="ipd-day-actions">
              <button
                type="button"
                className="opd-bill-rail-btn opd-bill-rail-btn--accent"
                disabled={closeOrReopenDisabled}
                aria-busy={closeOrReopenPending || undefined}
                onClick={() => {
                  if (voucher?.status === "issued") void reopenBill();
                  else void closeBill();
                }}
              >
                <span className="opd-bill-rail-btn-main">
                  <BillBtnIcon
                    name="check"
                    pending={closeOrReopenPending}
                  />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">
                      {voucher?.status === "issued" ? t("ipdReopenBill") : t("ipdCloseBill")}
                    </span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="opd-bill-rail-btn opd-bill-rail-btn--accent"
                disabled={payDisabled}
                aria-busy={(decidePending && pendingAction === "pay") || undefined}
                onClick={() => {
                  setError(null);
                  setConfirmPay(true);
                }}
              >
                <span className="opd-bill-rail-btn-main">
                  <BillBtnIcon name="check" pending={decidePending && pendingAction === "pay"} />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdPayThisDay")}</span>
                    {voucher && voucher.status !== "paid" && voucher.closing_mmk < 0 ? (
                      <span className="opd-bill-rail-btn-sub">
                        {t("ipdDueAmount").replace("{amount}", formatMMK(dueMmk))}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="opd-bill-rail-btn"
                disabled={payLaterDisabled}
                aria-busy={(decidePending && pendingAction === "credit") || undefined}
                onClick={() => void decide("credit")}
              >
                <span className="opd-bill-rail-btn-main">
                  <BillBtnIcon name="check" pending={decidePending && pendingAction === "credit"} />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdPayLater")}</span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="opd-bill-rail-btn"
                disabled={unpayDisabled}
                aria-busy={(decidePending && pendingAction === "unpay") || undefined}
                onClick={() => void decide("unpay")}
              >
                <span className="opd-bill-rail-btn-main">
                  <BillBtnIcon name="check" pending={decidePending && pendingAction === "unpay"} />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdMarkUnpaid")}</span>
                  </span>
                </span>
              </button>
            </div>
          </aside>
        </div>
      </div>
      {confirmPay ? (
        <AlertDialog
          tone="warning"
          title={t("ipdPayThisDay")}
          message={t("confirmIpdPayDay").replace("{amount}", formatMMK(dueMmk))}
          error={error}
          busy={deciding}
          confirmLabel={t("ipdPayThisDay")}
          onClose={() => {
            if (!deciding) {
              setConfirmPay(false);
              setError(null);
            }
          }}
          onConfirm={() => void decide("pay")}
        />
      ) : null}
    </div>
  );
}

function statusChip(
  date: string,
  today: string,
  voucher: IpdDayVoucher | null,
  loading: boolean,
  t: (key: string) => string,
): string {
  if (loading && !voucher) return "";
  if (!voucher) {
    return date <= today ? t("ipdVoucherStillOpen") : "";
  }
  if (voucher.status === "paid") return t("ipdVoucherPaid");
  if (voucher.status === "credit") return t("ipdVoucherCarried");
  return t("ipdVoucherAwaiting");
}
