import { useEffect, useRef, useState } from "react";
import { startGuide } from "@/features/guidance/guideControl";
import { AlertDialog } from "@/shared/AlertDialog";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { openCheatSheetPrint } from "@/shared/cheatsheet";

/** Lessons are not production-ready; flip to true to show Help lesson buttons again. */
const SHOW_GUIDANCE_LESSONS = false;

function focusableIn(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function HelpOverlay({
  onClose,
  t,
  showBillTour = false,
  showChargeTour = false,
  showPharmacyTour = false,
  showOtTour = false,
  showPatientTour = false,
  showIpdTour = false,
}: {
  onClose: () => void;
  t: (k: string) => string;
  /** Admin, OPD, OT, Pharmacy, and IPD. Patients has no bill rail. */
  showBillTour?: boolean;
  /** Admin, OPD, OT, and Pharmacy. The sale-desk lesson stays off IPD Bill; that button is the stay lesson. */
  showChargeTour?: boolean;
  /** Admin and Pharmacy. IPD does not see Drug Setup, Return in, or Transfer to OT. */
  showPharmacyTour?: boolean;
  /** Admin and OT. */
  showOtTour?: boolean;
  /** Admin and Patients. */
  showPatientTour?: boolean;
  /** Admin and IPD. Stay and discharge are separate lessons. Pharmacy does not see these. */
  showIpdTour?: boolean;
}) {
  const [printError, setPrintError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  return (
    <>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="clinic-overlay clinic-overlay--fixed help-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <div className="clinic-overlay-panel help-card">
          <div className="btn-row help-top">
            <h2 id="help-title" className="section-title">
              {t("helpTitle")}
            </h2>
            <DialogCloseButton onClick={onClose} />
          </div>
          <p className="hint">{t("helpLede")}</p>
          <div className="cheat-preview">
            <h3>{t("helpHSale")}</h3>
            <ol>
              <li>{t("helpSale1")}</li>
              <li>{t("helpSale2")}</li>
              <li>{t("helpSale3")}</li>
              <li>{t("helpSale4")}</li>
              <li>{t("helpSale5")}</li>
              <li>{t("helpSale6")}</li>
              <li>{t("helpSale7")}</li>
              <li>{t("helpSale8")}</li>
            </ol>
            <h3>{t("helpHOpd")}</h3>
            <ol>
              <li>{t("helpOpd1")}</li>
              <li>{t("helpOpd2")}</li>
            </ol>
            <h3>{t("helpHOt")}</h3>
            <ol>
              <li>{t("helpOt1")}</li>
              <li>{t("helpOt2")}</li>
              <li>{t("helpOt3")}</li>
            </ol>
            <h3>{t("helpHPharmacy")}</h3>
            <ol>
              <li>{t("helpPharm1")}</li>
              <li>{t("helpPharm2")}</li>
              <li>{t("helpPharm3")}</li>
              <li>{t("helpPharm4")}</li>
            </ol>
            <h3>{t("helpHPatients")}</h3>
            <ol>
              <li>{t("helpPat1")}</li>
              <li>{t("helpPat2")}</li>
              <li>{t("helpPat3")}</li>
              <li>{t("helpPat4")}</li>
            </ol>
            <h3>{t("helpHShortcuts")}</h3>
            <ul>
              <li>
                <kbd>?</kbd> — {t("helpShortcutHelp")}
              </li>
              <li>
                {t("english")} / {t("myanmar")} — {t("helpShortcutLang")}
              </li>
              <li>
                <kbd>F5</kbd> {t("saveDraft")} · <kbd>F6</kbd> {t("print")} · <kbd>F7</kbd> {t("markPaid")}
              </li>
              <li>{t("helpShortcutCharge")}</li>
              <li>
                <kbd>^F8</kbd> {t("vDelete")} · <kbd>F9</kbd> {t("history")} · <kbd>F10</kbd> {t("cancel")} · <kbd>F2</kbd>{" "}
                {t("newBill")}
              </li>
              <li>{t("helpShortcutF5Reload")}</li>
            </ul>
          </div>
          <div className="btn-row">
            {SHOW_GUIDANCE_LESSONS && showBillTour ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  startGuide("bill-buttons");
                }}
              >
                {t("guideBillButtons")}
              </button>
            ) : null}
            {SHOW_GUIDANCE_LESSONS && showChargeTour ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  startGuide("charge-to-ipd");
                }}
              >
                {t("chargeToIpd")}
              </button>
            ) : null}
            {SHOW_GUIDANCE_LESSONS && showPharmacyTour ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  startGuide("pharmacy-item");
                }}
              >
                {t("drugSetup")}
              </button>
            ) : null}
            {SHOW_GUIDANCE_LESSONS && showPharmacyTour ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  startGuide("pharmacy-return");
                }}
              >
                {t("navReturnIn")}
              </button>
            ) : null}
            {SHOW_GUIDANCE_LESSONS && showPharmacyTour ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  startGuide("pharmacy-transfer");
                }}
              >
                {t("navTransferToOt")}
              </button>
            ) : null}
            {SHOW_GUIDANCE_LESSONS && showOtTour ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  startGuide("ot-cupboard");
                }}
              >
                {t("maintenanceInventory")}
              </button>
            ) : null}
            {SHOW_GUIDANCE_LESSONS && showPatientTour ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  startGuide("patient-chart");
                }}
              >
                {t("navPatients")}
              </button>
            ) : null}
            {SHOW_GUIDANCE_LESSONS && showIpdTour ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  startGuide("ipd-patients");
                }}
              >
                {t("navIpd")}
              </button>
            ) : null}
            {SHOW_GUIDANCE_LESSONS && showIpdTour ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  startGuide("ipd-discharge");
                }}
              >
                {t("ipdDischarge")}
              </button>
            ) : null}
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                try {
                  openCheatSheetPrint();
                } catch (e) {
                  setPrintError(e instanceof Error ? e.message : t("printFailed"));
                }
              }}
            >
              {t("printCheatSheet")}
            </button>
          </div>
        </div>
      </div>
      {printError ? (
        <AlertDialog message={printError} onClose={() => setPrintError(null)} />
      ) : null}
    </>
  );
}
