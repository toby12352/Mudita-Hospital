import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertDialog } from "@/shared/AlertDialog";
import { useI18n } from "@/shared/i18n";

export type BillLeaveGuardHandlers = {
  /** True when the cart has lines and the bill was never saved. */
  shouldPrompt: () => boolean;
  /** Persist as draft. Return true on success so leave can continue. */
  save: () => Promise<boolean>;
};

type PendingLeave = () => void | Promise<void>;

type BillLeaveGuardApi = {
  register: (handlers: BillLeaveGuardHandlers) => void;
  unregister: (handlers: BillLeaveGuardHandlers) => void;
  /**
   * Run leave immediately, or open the save-draft dialog first.
   * Returns true when leave already ran; false when a dialog is pending.
   */
  requestLeave: (proceed: PendingLeave) => boolean;
};

const BillLeaveGuardContext = createContext<BillLeaveGuardApi | null>(null);

export function BillLeaveGuardProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const handlersRef = useRef<BillLeaveGuardHandlers | null>(null);
  const bypassRef = useRef(false);
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const [busy, setBusy] = useState(false);

  const register = useCallback((handlers: BillLeaveGuardHandlers) => {
    handlersRef.current = handlers;
  }, []);

  const unregister = useCallback((handlers: BillLeaveGuardHandlers) => {
    if (handlersRef.current === handlers) {
      handlersRef.current = null;
    }
  }, []);

  const runPending = useCallback(async (leave: PendingLeave) => {
    bypassRef.current = true;
    try {
      await leave();
    } finally {
      bypassRef.current = false;
    }
  }, []);

  const requestLeave = useCallback(
    (proceed: PendingLeave): boolean => {
      if (bypassRef.current) {
        void proceed();
        return true;
      }
      const handlers = handlersRef.current;
      if (!handlers?.shouldPrompt()) {
        void proceed();
        return true;
      }
      setPending(() => proceed);
      return false;
    },
    [],
  );

  const stay = useCallback(() => {
    if (busy) return;
    setPending(null);
  }, [busy]);

  const discardAndLeave = useCallback(() => {
    if (busy || !pending) return;
    const leave = pending;
    setPending(null);
    void runPending(leave);
  }, [busy, pending, runPending]);

  const saveAndLeave = useCallback(async () => {
    if (busy || !pending) return;
    const handlers = handlersRef.current;
    const leave = pending;
    if (!handlers) {
      setPending(null);
      void runPending(leave);
      return;
    }
    setBusy(true);
    try {
      const ok = await handlers.save();
      if (!ok) {
        setPending(null);
        return;
      }
      setPending(null);
      await runPending(leave);
    } catch {
      setPending(null);
    } finally {
      setBusy(false);
    }
  }, [busy, pending, runPending]);

  const api = useMemo<BillLeaveGuardApi>(
    () => ({ register, unregister, requestLeave }),
    [register, unregister, requestLeave],
  );

  return (
    <BillLeaveGuardContext.Provider value={api}>
      {children}
      {pending ? (
        <AlertDialog
          tone="save"
          title={t("saveDraft")}
          message={t("confirmLeaveUnsavedBill")}
          confirmLabel={t("saveDraft")}
          discardLabel={t("dontSave")}
          onClose={stay}
          onDiscard={discardAndLeave}
          onConfirm={() => {
            void saveAndLeave();
          }}
          busy={busy}
        />
      ) : null}
    </BillLeaveGuardContext.Provider>
  );
}

export function useBillLeaveGuardApi(): BillLeaveGuardApi {
  const api = useContext(BillLeaveGuardContext);
  if (!api) {
    throw new Error("useBillLeaveGuardApi requires BillLeaveGuardProvider");
  }
  return api;
}

/** Optional: App may call requestLeave without throwing when the provider is missing in tests. */
export function useOptionalBillLeaveGuardApi(): BillLeaveGuardApi | null {
  return useContext(BillLeaveGuardContext);
}

/**
 * While `active` is true, leaving the desk prompts to save the cart as a draft.
 * `save` must keep the page mounted until it resolves.
 */
export function useRegisterBillLeaveGuard(
  active: boolean,
  save: () => Promise<boolean>,
): void {
  const api = useOptionalBillLeaveGuardApi();
  const saveRef = useRef(save);
  saveRef.current = save;
  const activeRef = useRef(active);
  activeRef.current = active;

  const handlersRef = useRef<BillLeaveGuardHandlers>({
    shouldPrompt: () => activeRef.current,
    save: () => saveRef.current(),
  });

  useEffect(() => {
    if (!api) return;
    const handlers = handlersRef.current;
    if (active) {
      api.register(handlers);
      return () => api.unregister(handlers);
    }
    api.unregister(handlers);
    return undefined;
  }, [api, active]);
}
