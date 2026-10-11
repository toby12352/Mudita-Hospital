import { useState } from "react";
import { formatItemCode, type PharmacyItem } from "@/features/pharmacy/api";
import { useI18n } from "@/shared/i18n";
import type { PharmacyTab } from "@/app/types";
import { PharmacyItemForm } from "./PharmacyItemForm";
import { PharmacyItemsTab } from "./PharmacyItemsTab";
import { PharmacyMovementsTab } from "./PharmacyMovementsTab";
export function PharmacyPage({
  isAdmin,
  initialScreen = "browse",
}: {
  isAdmin: boolean;
  initialScreen?: "browse" | "form";
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<PharmacyTab>("items");
  const [screen, setScreen] = useState<"browse" | "form">(initialScreen);
  const [editing, setEditing] = useState<PharmacyItem | null>(null);

  function openCreate() {
    setEditing(null);
    setScreen("form");
  }

  function openEdit(item: PharmacyItem) {
    setEditing(item);
    setScreen("form");
  }

  function backToItems() {
    setEditing(null);
    setTab("items");
    setScreen("browse");
  }

  if (screen === "form") {
    return (
      <section className="settings-panel">
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={backToItems}>
            {t("backItems")}
          </button>
        </div>
        <h2 className="section-title">
          {editing
            ? `${t("editItemTitle")} ${formatItemCode(editing.code)}`
            : t("createNewItemTitle")}
        </h2>
        <PharmacyItemForm editing={editing} onSaved={backToItems} onCancel={backToItems} />
      </section>
    );
  }

  return (
    <section className="settings-panel">
      <p className="hint">{t("pharmacyStockHint")}</p>
      <div className="tabs-bar">
        <nav className="tabs" aria-label="Pharmacy sections">
          {(
            [
              { id: "items" as const, labelKey: "items" },
              { id: "movements" as const, labelKey: "itemHistory" },
            ] as const
          ).map((tabDef) => (
            <button
              key={tabDef.id}
              type="button"
              className={`tab ${tab === tabDef.id ? "active" : ""}`}
              onClick={() => setTab(tabDef.id)}
            >
              {t(tabDef.labelKey)}
            </button>
          ))}
        </nav>
        <button type="button" className="btn primary" onClick={openCreate}>
          {t("createNewItemBtn")}
        </button>
      </div>
      {tab === "items" ? (
        <PharmacyItemsTab isAdmin={isAdmin} onEdit={openEdit} />
      ) : null}
      {tab === "movements" ? <PharmacyMovementsTab /> : null}
    </section>
  );
}
