import { useState } from "react";
import type { SettingsTab } from "@/app/types";
import { BackupTab } from "./BackupTab";
import { CategoriesTab } from "./CategoriesTab";
import { DoctorsTab } from "./DoctorsTab";
import { HospitalTab } from "./HospitalTab";
import { TrainingTab } from "./TrainingTab";
import { UsersTab } from "./UsersTab";

export function SettingsPage({
  canManageUsers,
  initialTab = "hospital",
  t,
}: {
  canManageUsers: boolean;
  initialTab?: SettingsTab;
  t: (k: string) => string;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  const items = (
    [
      { id: "hospital" as const, label: t("hospital") },
      { id: "doctors" as const, label: t("doctors") },
      { id: "categories" as const, label: t("categories") },
      ...(canManageUsers ? [{ id: "users" as const, label: t("users") }] : []),
      { id: "backup" as const, label: t("backup") },
      { id: "training" as const, label: t("training") },
    ]
  );

  return (
    <section className="settings-panel">
      <div className="tabs" role="tablist" aria-label={t("settings")}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            id={`settings-tab-${item.id}`}
            role="tab"
            className={`tab${tab === item.id ? " active" : ""}`}
            aria-selected={tab === item.id}
            aria-controls={`settings-panel-${item.id}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "hospital" ? (
        <div
          id="settings-panel-hospital"
          role="tabpanel"
          aria-labelledby="settings-tab-hospital"
        >
          <HospitalTab />
        </div>
      ) : null}
      {tab === "doctors" ? (
        <div
          id="settings-panel-doctors"
          role="tabpanel"
          aria-labelledby="settings-tab-doctors"
        >
          <DoctorsTab />
        </div>
      ) : null}
      {tab === "categories" ? (
        <div
          id="settings-panel-categories"
          role="tabpanel"
          aria-labelledby="settings-tab-categories"
        >
          <CategoriesTab />
        </div>
      ) : null}
      {tab === "users" && canManageUsers ? (
        <div
          id="settings-panel-users"
          role="tabpanel"
          aria-labelledby="settings-tab-users"
        >
          <UsersTab />
        </div>
      ) : null}
      {tab === "backup" ? (
        <div
          id="settings-panel-backup"
          role="tabpanel"
          aria-labelledby="settings-tab-backup"
        >
          <BackupTab />
        </div>
      ) : null}
      {tab === "training" ? (
        <div
          id="settings-panel-training"
          role="tabpanel"
          aria-labelledby="settings-tab-training"
        >
          <TrainingTab t={t} />
        </div>
      ) : null}
    </section>
  );
}
