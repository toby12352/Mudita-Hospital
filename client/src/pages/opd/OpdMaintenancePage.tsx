import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { OpdDoctorsPage } from "./OpdDoctorsPage";
import { OpdServicesPage } from "./OpdServicesPage";

export type OpdMaintenanceTab = "doctors" | "services";

export function OpdMaintenancePage({
  screen,
  onNavigateScreen,
}: {
  screen: OpdMaintenanceTab;
  onNavigateScreen: (screen: OpdMaintenanceTab) => void;
}) {
  const { t } = useI18n();
  const [browsing, setBrowsing] = useState(true);

  useEffect(() => {
    setBrowsing(true);
  }, [screen]);

  const onBrowseChange = useCallback((next: boolean) => {
    setBrowsing(next);
  }, []);

  return (
    <section className="desk-maintenance">
      {browsing ? (
        <div
          className="desk-maintenance-tabs"
          role="tablist"
          aria-label={t("navMaintenance")}
        >
          <button
            type="button"
            id="opd-maintenance-tab-doctors"
            role="tab"
            className={`desk-maintenance-tab${screen === "doctors" ? " active" : ""}`}
            aria-selected={screen === "doctors"}
            aria-controls="opd-maintenance-panel-doctors"
            onClick={() => onNavigateScreen("doctors")}
          >
            {t("maintenanceDoctors")}
          </button>
          <button
            type="button"
            id="opd-maintenance-tab-services"
            role="tab"
            className={`desk-maintenance-tab${screen === "services" ? " active" : ""}`}
            aria-selected={screen === "services"}
            aria-controls="opd-maintenance-panel-services"
            onClick={() => onNavigateScreen("services")}
          >
            {t("maintenanceServices")}
          </button>
        </div>
      ) : null}
      {screen === "doctors" ? (
        <div
          id="opd-maintenance-panel-doctors"
          role="tabpanel"
          aria-labelledby="opd-maintenance-tab-doctors"
          className="desk-maintenance-panel"
        >
          <OpdDoctorsPage onBrowseChange={onBrowseChange} />
        </div>
      ) : (
        <div
          id="opd-maintenance-panel-services"
          role="tabpanel"
          aria-labelledby="opd-maintenance-tab-services"
          className="desk-maintenance-panel"
        >
          <OpdServicesPage onBrowseChange={onBrowseChange} />
        </div>
      )}
    </section>
  );
}
