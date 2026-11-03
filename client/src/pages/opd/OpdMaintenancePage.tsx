import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeskChrome,
  DeskChromePanel,
  DeskChromeTabs,
} from "@/shared/DeskChrome";
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

  const tabs = useMemo(
    () => [
      {
        id: "opd-maintenance-tab-doctors",
        label: t("maintenanceDoctors"),
        controls: "opd-maintenance-panel-doctors",
      },
      {
        id: "opd-maintenance-tab-services",
        label: t("maintenanceServices"),
        controls: "opd-maintenance-panel-services",
      },
    ],
    [t],
  );

  return (
    <DeskChrome>
      {browsing ? (
        <DeskChromeTabs
          ariaLabel={t("navMaintenance")}
          tabs={tabs}
          activeId={
            screen === "doctors"
              ? "opd-maintenance-tab-doctors"
              : "opd-maintenance-tab-services"
          }
          onSelect={(id) =>
            onNavigateScreen(id === "opd-maintenance-tab-doctors" ? "doctors" : "services")
          }
        />
      ) : null}
      {screen === "doctors" ? (
        <DeskChromePanel
          id="opd-maintenance-panel-doctors"
          labelledBy="opd-maintenance-tab-doctors"
        >
          <OpdDoctorsPage onBrowseChange={onBrowseChange} />
        </DeskChromePanel>
      ) : (
        <DeskChromePanel
          id="opd-maintenance-panel-services"
          labelledBy="opd-maintenance-tab-services"
        >
          <OpdServicesPage onBrowseChange={onBrowseChange} />
        </DeskChromePanel>
      )}
    </DeskChrome>
  );
}
