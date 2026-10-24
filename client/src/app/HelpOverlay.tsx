import { openCheatSheetPrint } from "@/shared/cheatsheet";

export function HelpOverlay({ onClose, t }: { onClose: () => void; t: (k: string) => string }) {
  return (
    <div className="help-overlay" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="help-card">
        <div className="btn-row help-top">
          <h2 id="help-title" className="section-title">
            {t("helpTitle")}
          </h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t("close")}
          </button>
        </div>
        <p className="hint">{t("helpLede")}</p>
        <div className="cheat-preview">
          <h3>OPD</h3>
          <ol>
            <li>Home → OPD → New bill</li>
            <li>Patient + doctor → type code → Enter</li>
            <li>Save draft (F5) or Pay &amp; print (F7: marks paid + receipt)</li>
          </ol>
          <h3>OT</h3>
          <ol>
            <li>Pharmacy: Transfer to OT, then Confirm transfer. Saleable stock moves. Batch and expiry are optional</li>
            <li>OT bill uses cupboard on hand → Pay &amp; print (F7; qty drops)</li>
            <li>Return unused qty to pharmacy. Void puts paid qty back</li>
          </ol>
          <h3>Pharmacy</h3>
          <ol>
            <li>Billing: add medicines → Save draft (F5) or Pay &amp; print (F7; stock deducts)</li>
            <li>Return in: add returned medicines → Return &amp; print (F7; stock back into MAIN; cash nets refund)</li>
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
              <kbd>F5</kbd> Save draft · <kbd>F7</kbd> Pay &amp; print
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
                window.alert(e instanceof Error ? e.message : "Print failed");
              }
            }}
          >
            {t("printCheatSheet")}
          </button>
        </div>
      </div>
    </div>
  );
}
