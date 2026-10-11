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
            <li>Pay cash → Print</li>
          </ol>
          <h3>OT</h3>
          <ol>
            <li>New case → Issue → print pick list</li>
            <li>Reconcile Used / Returned / Wasted / Floor</li>
            <li>OT bill → Pay → Print</li>
          </ol>
          <h3>Pharmacy</h3>
          <ol>
            <li>Search code → Restock (create item if unknown)</li>
            <li>Reports → Low stock / Near expiry</li>
          </ol>
          <h3>Shortcuts</h3>
          <ul>
            <li>
              <kbd>?</kbd> — this help
            </li>
            <li>EN / မြန်မာ — language (top bar)</li>
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
