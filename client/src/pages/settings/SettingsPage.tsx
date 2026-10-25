import { useState } from "react";
import type { SettingsTab } from "@/app/types";
import { BackupTab } from "./BackupTab";
import { CategoriesTab } from "./CategoriesTab";
import { DoctorsTab } from "./DoctorsTab";
import { HospitalTab } from "./HospitalTab";
import { ServicesTab } from "./ServicesTab";
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

  return (
    <section className="settings-panel">
      <nav className="tabs" aria-label="Settings sections">
        {(
          [
            { id: "hospital" as const, label: t("hospital") },
            { id: "doctors" as const, label: t("doctors") },
            { id: "services" as const, label: t("services") },
            { id: "categories" as const, label: t("categories") },
            ...(canManageUsers ? [{ id: "users" as const, label: t("users") }] : []),
            { id: "backup" as const, label: t("backup") },
            { id: "training" as const, label: t("training") },
          ]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "hospital" ? <HospitalTab /> : null}
      {tab === "doctors" ? <DoctorsTab /> : null}
      {tab === "services" ? <ServicesTab /> : null}
      {tab === "categories" ? <CategoriesTab /> : null}
      {tab === "users" && canManageUsers ? <UsersTab /> : null}
      {tab === "backup" ? <BackupTab /> : null}
      {tab === "training" ? <TrainingTab t={t} /> : null}
    </section>
  );
}
