import { useCallback, useEffect, useMemo, useState } from "react";
import type { SettingsTab } from "@/app/types";
import { OpdDoctorsPage } from "@/pages/opd/OpdDoctorsPage";
import {
  DeskChrome,
  DeskChromePanel,
  DeskChromeTabs,
  type DeskChromeTabItem,
} from "@/shared/DeskChrome";
import { BackupTab } from "./BackupTab";
import { CategoriesTab } from "./CategoriesTab";
import { HospitalTab } from "./HospitalTab";
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
  const [browsing, setBrowsing] = useState(true);

  const catalogTab = tab === "doctors" || tab === "categories";

  useEffect(() => {
    setBrowsing(true);
  }, [tab]);

  const onBrowseChange = useCallback((next: boolean) => {
    setBrowsing(next);
  }, []);

  const tabs = useMemo((): DeskChromeTabItem[] => {
    const items: DeskChromeTabItem[] = [
      {
        id: "settings-tab-hospital",
        label: t("hospital"),
        controls: "settings-panel-hospital",
      },
      {
        id: "settings-tab-doctors",
        label: t("doctors"),
        controls: "settings-panel-doctors",
      },
      {
        id: "settings-tab-categories",
        label: t("categories"),
        controls: "settings-panel-categories",
      },
    ];
    if (canManageUsers) {
      items.push({
        id: "settings-tab-users",
        label: t("users"),
        controls: "settings-panel-users",
      });
    }
    items.push({
      id: "settings-tab-backup",
      label: t("backup"),
      controls: "settings-panel-backup",
    });
    return items;
  }, [canManageUsers, t]);

  const showTabs = !catalogTab || browsing;
  const activeId = `settings-tab-${tab}`;

  return (
    <DeskChrome className="settings-panel settings-panel--fill">
      {showTabs ? (
        <DeskChromeTabs
          ariaLabel={t("settings")}
          tabs={tabs}
          activeId={activeId}
          onSelect={(id) => {
            const next = id.replace("settings-tab-", "") as SettingsTab;
            setTab(next);
          }}
        />
      ) : null}
      {tab === "hospital" ? (
        <DeskChromePanel id="settings-panel-hospital" labelledBy="settings-tab-hospital">
          <HospitalTab />
        </DeskChromePanel>
      ) : null}
      {tab === "doctors" ? (
        <DeskChromePanel id="settings-panel-doctors" labelledBy="settings-tab-doctors">
          <OpdDoctorsPage onBrowseChange={onBrowseChange} />
        </DeskChromePanel>
      ) : null}
      {tab === "categories" ? (
        <DeskChromePanel id="settings-panel-categories" labelledBy="settings-tab-categories">
          <CategoriesTab onBrowseChange={onBrowseChange} />
        </DeskChromePanel>
      ) : null}
      {tab === "users" && canManageUsers ? (
        <DeskChromePanel id="settings-panel-users" labelledBy="settings-tab-users">
          <UsersTab />
        </DeskChromePanel>
      ) : null}
      {tab === "backup" ? (
        <DeskChromePanel id="settings-panel-backup" labelledBy="settings-tab-backup">
          <BackupTab />
        </DeskChromePanel>
      ) : null}
    </DeskChrome>
  );
}
