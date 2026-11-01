import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { OtServicesPage } from "./OtServicesPage";
import { OtStockPage } from "./OtStockPage";

type OtMaintenanceTab = "inventory" | "services";

export function OtMaintenancePage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<OtMaintenanceTab>("inventory");
  const [browsing, setBrowsing] = useState(true);

  useEffect(() => {
    setBrowsing(true);
  }, [tab]);

  const onBrowseChange = useCallback((next: boolean) => {
    setBrowsing(next);
  }, []);

  return (
    <section className="desk-maintenance">
      {browsing ? (
        <div
          className="desk-maintenance-tabs"
          role="tablist"
          aria-label={t("navOtCupboard")}
        >
          <button
            type="button"
            id="ot-maintenance-tab-inventory"
            role="tab"
            className={`desk-maintenance-tab${tab === "inventory" ? " active" : ""}`}
            aria-selected={tab === "inventory"}
            aria-controls="ot-maintenance-panel-inventory"
            onClick={() => setTab("inventory")}
          >
            {t("otStockInventory")}
          </button>
          <button
            type="button"
            id="ot-maintenance-tab-services"
            role="tab"
            className={`desk-maintenance-tab${tab === "services" ? " active" : ""}`}
            aria-selected={tab === "services"}
            aria-controls="ot-maintenance-panel-services"
            onClick={() => setTab("services")}
          >
            {t("maintenanceServices")}
          </button>
        </div>
      ) : null}
      {tab === "inventory" ? (
        <div
          id="ot-maintenance-panel-inventory"
          role="tabpanel"
          aria-labelledby="ot-maintenance-tab-inventory"
          className="desk-maintenance-panel"
        >
          <OtStockPage onBrowseChange={onBrowseChange} />
        </div>
      ) : (
        <div
          id="ot-maintenance-panel-services"
          role="tabpanel"
          aria-labelledby="ot-maintenance-tab-services"
          className="desk-maintenance-panel"
        >
          <OtServicesPage onBrowseChange={onBrowseChange} />
        </div>
      )}
    </section>
  );
}
