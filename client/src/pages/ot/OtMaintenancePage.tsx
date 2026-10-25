import { useState } from "react";
import { useI18n } from "@/shared/i18n";
import { OtServicesPage } from "./OtServicesPage";
import { OtStockPage } from "./OtStockPage";

type OtMaintenanceTab = "inventory" | "services";

export function OtMaintenancePage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<OtMaintenanceTab>("inventory");

  return (
    <section className="desk-maintenance">
      <div className="tabs" role="tablist" aria-label={t("navOtCupboard")}>
        <button
          type="button"
          role="tab"
          className={`tab${tab === "inventory" ? " active" : ""}`}
          aria-selected={tab === "inventory"}
          onClick={() => setTab("inventory")}
        >
          {t("maintenanceInventory")}
        </button>
        <button
          type="button"
          role="tab"
          className={`tab${tab === "services" ? " active" : ""}`}
          aria-selected={tab === "services"}
          onClick={() => setTab("services")}
        >
          {t("maintenanceServices")}
        </button>
      </div>
      {tab === "inventory" ? <OtStockPage /> : <OtServicesPage />}
    </section>
  );
}
