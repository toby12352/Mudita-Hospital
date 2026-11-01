import { useEffect, useRef, useState } from "react";
import { getApiBase } from "@/shared/api";
import { ServerSetupForm } from "./ServerSetupForm";
import type { ConnState } from "./types";

export function ServerIpButton({
  conn,
  detail,
  onSave,
  onUseLocal,
  onRetry,
  t,
  compact,
}: {
  conn: ConnState;
  detail: string;
  onSave: (base: string) => void;
  onUseLocal: () => void;
  onRetry: () => void;
  t: (k: string) => string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef(false);

  const label =
    conn === "ok" ? t("serverConnected") : conn === "checking" ? t("checking") : t("serverOffline");

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        returnFocusRef.current = false;
        setOpen(false);
        setEditing(false);
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        returnFocusRef.current = true;
        setOpen(false);
        setEditing(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const pop = popoverRef.current;
    const focusable = pop?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])");
    if (focusable) focusable.focus({ focusVisible: true });
    else pop?.focus();
    return () => {
      if (!returnFocusRef.current) return;
      returnFocusRef.current = false;
      const opener = buttonRef.current;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  function handleSave(base: string) {
    onSave(base);
    returnFocusRef.current = true;
    setEditing(false);
    setOpen(false);
  }

  function handleUseLocal() {
    onUseLocal();
    returnFocusRef.current = true;
    setEditing(false);
    setOpen(false);
  }

  return (
    <div className={`server-ip${open ? " open" : ""}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`btn ghost server-ip-btn${compact ? " compact" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            returnFocusRef.current = true;
            setEditing(false);
            setOpen(false);
            return;
          }
          setOpen(true);
        }}
      >
        <span className={`status-dot status-dot-inline status-${conn}`} aria-hidden="true" />
        {t("serverIp")}
        <span className="visually-hidden">{label}</span>
      </button>
      {open ? (
        <div
          ref={popoverRef}
          className="server-ip-popover"
          role="dialog"
          aria-label={t("serverIp")}
          tabIndex={-1}
        >
          {editing ? (
            <ServerSetupForm
              initial={getApiBase()}
              onSave={handleSave}
              onUseLocal={handleUseLocal}
            />
          ) : (
            <>
              <div className={`server-ip-status status-${conn}`}>
                <span className="status-dot status-dot-inline" aria-hidden="true" />
                <div className="status-body">
                  <p className="status-label">{label}</p>
                  <p className="status-detail">{detail}</p>
                  <p className="status-meta">
                    {t("serverEndpoint")} <code>{getApiBase()}</code>
                  </p>
                </div>
              </div>
              <div className="btn-row status-actions">
                {conn === "offline" ? (
                  <button type="button" className="btn ghost" onClick={onRetry}>
                    {t("retry")}
                  </button>
                ) : null}
                <button type="button" className="btn ghost" onClick={() => setEditing(true)}>
                  {t("changeServerIp")}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
