import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeskChrome,
  DeskChromePanel,
  DeskChromeTabs,
} from "@/shared/DeskChrome";
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

  const tabs = useMemo(
    () => [
      {
        id: "ot-maintenance-tab-inventory",
        label: t("otStockInventory"),
        controls: "ot-maintenance-panel-inventory",
      },
      {
        id: "ot-maintenance-tab-services",
        label: t("maintenanceServices"),
        controls: "ot-maintenance-panel-services",
      },
    ],
    [t],
  );

  return (
    <DeskChrome>
      {browsing ? (
        <DeskChromeTabs
          ariaLabel={t("navOtCupboard")}
          tabs={tabs}
          activeId={
            tab === "inventory"
              ? "ot-maintenance-tab-inventory"
              : "ot-maintenance-tab-services"
          }
          onSelect={(id) =>
            setTab(id === "ot-maintenance-tab-inventory" ? "inventory" : "services")
          }
        />
      ) : null}
      {tab === "inventory" ? (
        <DeskChromePanel
          id="ot-maintenance-panel-inventory"
          labelledBy="ot-maintenance-tab-inventory"
        >
          <OtStockPage onBrowseChange={onBrowseChange} />
        </DeskChromePanel>
      ) : (
        <DeskChromePanel
          id="ot-maintenance-panel-services"
          labelledBy="ot-maintenance-tab-services"
        >
          <OtServicesPage onBrowseChange={onBrowseChange} />
        </DeskChromePanel>
      )}
    </DeskChrome>
  );
}
