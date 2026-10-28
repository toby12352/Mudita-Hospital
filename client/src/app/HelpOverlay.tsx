import { useState } from "react";
import { AlertDialog } from "@/shared/AlertDialog";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { openCheatSheetPrint } from "@/shared/cheatsheet";

export function HelpOverlay({ onClose, t }: { onClose: () => void; t: (k: string) => string }) {
  const [printError, setPrintError] = useState<string | null>(null);

  return (
    <>
      <div
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
            <h3>OPD</h3>
            <ol>
              <li>Home → OPD → New bill</li>
              <li>Patient + doctor → type code → Enter</li>
              <li>Save draft (F5), Print (F6: still editable), or Mark Paid (F7: locks bill)</li>
            </ol>
            <h3>OT</h3>
            <ol>
              <li>Pharmacy: Transfer to OT, then Confirm transfer. Saleable stock moves. Batch and expiry are optional</li>
              <li>OT bill uses cupboard on hand → Print (F6) or Mark Paid (F7; qty drops, locks)</li>
              <li>Return unused qty to pharmacy. Void puts paid qty back</li>
            </ol>
            <h3>Pharmacy</h3>
            <ol>
              <li>Billing: add medicines → Save draft (F5), Print (F6), or Mark Paid (F7; stock deducts)</li>
              <li>Return in: Print (F6) or Mark returned (F7; stock back into MAIN; cash nets refund)</li>
              <li>Transfer to OT: add medicines → Transfer, then Confirm transfer. Saleable stock moves. Batch and expiry are optional</li>
              <li>Stock: Search code → Restock (create item if unknown). Low stock / near expiry are MAIN only</li>
            </ol>
            <h3>Shortcuts</h3>
            <ul>
              <li>
                <kbd>?</kbd> — this help
              </li>
              <li>EN / မြန်မာ — language (top bar)</li>
              <li>
                <kbd>F5</kbd> Save draft · <kbd>F6</kbd> Print · <kbd>F7</kbd> Mark Paid
              </li>
              <li>OPD code field — Enter adds line</li>
            </ul>
          </div>
          <div className="btn-row">
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
