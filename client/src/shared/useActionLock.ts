import { useCallback, useEffect, useRef, useState } from "react";

/** Delay before showing a spinner so fast LAN calls do not flash. */
export const ACTION_PENDING_DELAY_MS = 180;

/** Save-draft label morph + drawn check duration. */
export const ACTION_OK_FLASH_MS = 1200;

/** Drawn check duration for print / charge / void / confirm. */
export const ACTION_TICK_FLASH_MS = 1000;

/** Fail shake + danger border flash. */
export const ACTION_ERR_SHAKE_MS = 400;

/**
 * Synchronous in-flight lock for billing actions.
 * Blocks double-submit before React commits `disabled={busy}`.
 */
export function useActionLock() {
  const locked = useRef(false);

  const tryAcquire = useCallback((): boolean => {
    if (locked.current) return false;
    locked.current = true;
    return true;
  }, []);

  const release = useCallback(() => {
    locked.current = false;
  }, []);

  const isLocked = useCallback(() => locked.current, []);

  return { tryAcquire, release, isLocked };
}

/**
 * Becomes true only if `active` stays true longer than `delayMs`.
 * Clears immediately when `active` goes false.
 */
export function useDelayedFlag(active: boolean, delayMs = ACTION_PENDING_DELAY_MS): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!active) {
      setDelayed(false);
      return;
    }
    const id = window.setTimeout(() => setDelayed(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);

  return delayed;
}

export type BillActionKind =
  | "markPaid"
  | "chargeIpd"
  | "print"
  | "saveDraft"
  | "transfer"
  | "confirmTransfer"
  | "deposit"
  | "ward"
  | "notes"
  | "discharge"
  | "admit"
  | "statement"
  | "dailyCash"
  | "void"
  | "purge"
  | null;

/**
 * Tracks which rail / dialog action is in flight and exposes a delayed
 * pending flag for spinner UI.
 */
export function useBillActionPending() {
  const { tryAcquire, release, isLocked } = useActionLock();
  const [action, setAction] = useState<BillActionKind>(null);
  const pending = useDelayedFlag(action != null);

  const begin = useCallback(
    (kind: NonNullable<BillActionKind>): boolean => {
      if (!tryAcquire()) return false;
      setAction(kind);
      return true;
    },
    [tryAcquire],
  );

  const end = useCallback(() => {
    setAction(null);
    release();
  }, [release]);

  return { action, pending, begin, end, isLocked };
}

export type BillFeedback = {
  action: NonNullable<BillActionKind>;
  kind: "ok" | "err";
} | null;

/**
 * Brief in-button ok / err flash after a rail action settles.
 * Save draft uses ACTION_OK_FLASH_MS; other oks use ACTION_TICK_FLASH_MS;
 * errors use ACTION_ERR_SHAKE_MS.
 */
export function useBillActionFeedback() {
  const [feedback, setFeedback] = useState<BillFeedback>(null);
  const timer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const pulse = useCallback(
    (action: NonNullable<BillActionKind>, kind: "ok" | "err") => {
      clearTimer();
      setFeedback({ action, kind });
      const ms =
        kind === "err"
          ? ACTION_ERR_SHAKE_MS
          : action === "saveDraft"
            ? ACTION_OK_FLASH_MS
            : ACTION_TICK_FLASH_MS;
      timer.current = window.setTimeout(() => {
        setFeedback(null);
        timer.current = null;
      }, ms);
    },
    [clearTimer],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const isOk = useCallback(
    (kind: NonNullable<BillActionKind>) => feedback?.action === kind && feedback.kind === "ok",
    [feedback],
  );
  const isErr = useCallback(
    (kind: NonNullable<BillActionKind>) => feedback?.action === kind && feedback.kind === "err",
    [feedback],
  );

  return { feedback, pulse, isOk, isErr };
}
