import { useEffect, useRef, useState } from "react";
import {
  creditIpdDayVoucher,
  fetchIpdStatementHtml,
  issueIpdDayVoucher,
  payIpdDayVoucher,
  unpayIpdDayVoucher,
  type IpdDayVoucher,
} from "@/features/ipd/api";
import { yangonToday } from "@/pages/ipd/ipdStatementDate";
import { ActionIcon } from "@/shared/ActionIcon";
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
        if (stayOpen && date < yangonToday()) {
          voucher = await issueIpdDayVoucher(stayId, date);
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
  const [confirmPay, setConfirmPay] = useState(false);
  const { tryAcquire, release } = useActionLock();
  const printPending = useDelayedFlag(printing);
  const decidePending = useDelayedFlag(deciding);
  const tRef = useRef(t);
  tRef.current = t;
  const today = yangonToday();
  const dayClosed = date < today;
  const dueMmk = voucher && voucher.closing_mmk < 0 ? -voucher.closing_mmk : 0;
  const payDisabled =
    !stayOpen || !dayClosed || loading || deciding || !voucher || voucher.status === "paid";
  const showPayLater =
    stayOpen && dayClosed && voucher?.status === "issued" && voucher.closing_mmk < 0;
  const showUnpay = stayOpen && dayClosed && voucher?.status === "paid" && voucher.can_unpay !== false;

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
    setHtml("");
    setVoucher(null);
    setConfirmPay(false);
    (async () => {
      try {
        const loaded = await loadDaySheet(stayId, date, stayOpen);
        if (cancelled) return;
        setVoucher(loaded.voucher);
        setHtml(loaded.html);
        if (loaded.voucher) onDecidedRef.current?.();
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

  async function decide(action: "pay" | "credit" | "unpay") {
    if (!tryAcquire()) return;
    setDeciding(true);
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
      release();
    }
  }

  const chip = statusChip(date, today, voucher, loading, t);

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
            {error && !confirmPay ? <p className="print-preview-note">{error}</p> : null}
          </div>
          <div className="print-preview-actions">
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
            {chip ? (
              <p className="ipd-voucher-chip" role="status">
                {chip}
              </p>
            ) : null}
            {stayOpen ? (
              <div className="ipd-day-actions">
                <button
                  type="button"
                  className="btn action primary ipd-day-action"
                  disabled={payDisabled}
                  aria-busy={(decidePending && confirmPay) || undefined}
                  onClick={() => {
                    setError(null);
                    setConfirmPay(true);
                  }}
                >
                  <ActionIcon name="check" />
                  <span className="ipd-day-action-text">
                    <span>{t("ipdPayThisDay")}</span>
                    {voucher && voucher.status !== "paid" && voucher.closing_mmk < 0 ? (
                      <span className="ipd-day-action-sub">
                        {t("ipdDueAmount").replace("{amount}", formatMMK(dueMmk))}
                      </span>
                    ) : null}
                  </span>
                </button>
                {showPayLater ? (
                  <button
                    type="button"
                    className="btn action ipd-day-action"
                    disabled={deciding || loading}
                    aria-busy={decidePending || undefined}
                    onClick={() => void decide("credit")}
                  >
                    {t("ipdPayLater")}
                  </button>
                ) : null}
                {showUnpay ? (
                  <button
                    type="button"
                    className="btn action ipd-day-action"
                    disabled={deciding || loading}
                    aria-busy={decidePending || undefined}
                    onClick={() => void decide("unpay")}
                  >
                    {t("ipdMarkUnpaid")}
                  </button>
                ) : null}
              </div>
            ) : null}
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
  if (date >= today) return t("ipdVoucherStillOpen");
  if (loading && !voucher) return "";
  if (!voucher) return "";
  if (voucher.status === "paid") return t("ipdVoucherPaid");
  if (voucher.status === "credit") return t("ipdVoucherCarried");
  return t("ipdVoucherAwaiting");
}
