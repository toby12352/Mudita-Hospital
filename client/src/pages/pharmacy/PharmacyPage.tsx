import { Fragment, useEffect, useState } from "react";
import {
  formatItemCode,
  formatPackCompact,
  listPharmacyItems,
  packFromItem,
  packLevelsFromItemPack,
  packPriceSlots,
  sellOuterFromSmallest,
  updatePharmacyItem,
  type PharmacyItem,
} from "@/features/pharmacy/api";
import { useI18n } from "@/shared/i18n";
import { PharmacyItemForm } from "./PharmacyItemForm";
import { PharmacyItemsTab } from "./PharmacyItemsTab";
import { PharmacyMovementsTab } from "./PharmacyMovementsTab";

const listOpts = { includeInactive: true } as const;

export function PharmacyPage({
  isAdmin,
  initialScreen = "browse",
}: {
  isAdmin: boolean;
  initialScreen?: "browse" | "form";
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"items" | "history" | "form">("items");
  const [creating, setCreating] = useState(initialScreen === "form");
  const [createKey, setCreateKey] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterQ, setFilterQ] = useState("");
  const [list, setList] = useState<PharmacyItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<PharmacyItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listEpoch, setListEpoch] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function reload(search = filterQ) {
    const data = await listPharmacyItems(search.trim(), listOpts);
    setList(data);
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listPharmacyItems("", listOpts);
        if (cancelled) return;
        setList(data);
        if (data.length > 0 && selectedId == null) setSelectedId(data[0].id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load
  }, [listEpoch]);

  useEffect(() => {
    if (mode !== "form") return;
    const content = document.querySelector(".app-content");
    if (content instanceof HTMLElement) content.scrollTop = 0;
  }, [mode]);

  const selected = list.find((i) => i.id === selectedId) ?? null;

  function openCreate() {
    setCreating(true);
    setCreateKey((n) => n + 1);
  }

  function closeCreate() {
    setCreating(false);
  }

  function selectItem(id: number) {
    setSelectedId(id);
    setCreating(false);
  }

  function openEdit(item: PharmacyItem) {
    setCreating(false);
    setEditing(item);
    setMode("form");
  }

  function backToItems() {
    setEditing(null);
    setMode("items");
    setListEpoch((n) => n + 1);
  }

  async function onCreateSaved(item: PharmacyItem) {
    setError(null);
    setFilterQ("");
    setCreating(false);
    try {
      const data = await listPharmacyItems("", listOpts);
      setList(data);
      setSelectedId(item.id);
    } catch (err) {
      setList((prev) => {
        if (prev.some((i) => i.id === item.id)) return prev;
        return [item, ...prev];
      });
      setSelectedId(item.id);
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }

  async function toggleActive(item: PharmacyItem, active: boolean) {
    setError(null);
    setBusyId(item.id);
    setList((prev) => prev.map((i) => (i.id === item.id ? { ...i, active } : i)));
    try {
      const pack = packFromItem(item);
      await updatePharmacyItem(item.id, {
        code: item.code,
        name: item.name,
        dosage: item.dosage,
        category: item.category,
        pack_l1_qty: pack.pack_l1_qty,
        pack_l1_unit: pack.pack_l1_unit,
        pack_l2_qty: pack.pack_l2_qty,
        pack_l2_unit: pack.pack_l2_unit,
        pack_l3_qty: pack.pack_l3_qty,
        pack_l3_unit: pack.pack_l3_unit,
        buy_price_mmk: item.buy_price_mmk,
        sell_price_mmk: item.sell_price_mmk,
        active,
      });
    } catch (err) {
      setList((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, active: item.active } : i)),
      );
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  if (mode === "form" && editing) {
    return (
      <section className="drug-setup-form-wrap classic-list-panel">
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={backToItems}>
            {t("backItems")}
          </button>
        </div>
        <h2 className="drug-setup-title">
          {`${t("editItemTitle")} ${formatItemCode(editing.code)}`}
        </h2>
        <PharmacyItemForm
          editing={editing}
          onSaved={() => backToItems()}
          onCancel={backToItems}
        />
      </section>
    );
  }

  if (mode === "history") {
    return (
      <section className="classic-list-panel">
        <div className="drug-setup-title-row">
          <h2 className="drug-setup-title">{t("itemHistory")}</h2>
          <div className="desk-text-links">
            <button type="button" className="desk-text-link" onClick={() => setMode("items")}>
              {t("drugSetup")}
            </button>
          </div>
        </div>
        <PharmacyMovementsTab />
      </section>
    );
  }

  return (
    <section className="drug-setup" aria-label={t("drugSetup")}>
      <div className="drug-setup-list-pane">
        <div className="drug-setup-title-row">
          <h2 className="drug-setup-title">{t("drugSetup")}</h2>
          <div className="tabs">
            <button
              type="button"
              className={`tab${creating ? " active" : ""}`}
              onClick={openCreate}
            >
              {t("newBadge")}
            </button>
            <button
              type="button"
              className={`tab${filterOpen ? " active" : ""}`}
              onClick={() => setFilterOpen((v) => !v)}
            >
              {t("filter")}
            </button>
            <button type="button" className="tab" onClick={() => setMode("history")}>
              {t("itemHistoryLink")}
            </button>
          </div>
        </div>
        <p className="drug-setup-selected" aria-hidden="true" />
        {filterOpen ? (
          <div className="drug-setup-filter">
            <input
              className="drug-info-input"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              placeholder={t("idCodeOrName")}
              aria-label={t("filter")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void reload(filterQ)
                    .then((data) => {
                      if (data[0]) selectItem(data[0].id);
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : "Search failed"));
                }
              }}
            />
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                void reload(filterQ)
                  .then((data) => {
                    if (data[0]) selectItem(data[0].id);
                  })
                  .catch((err) => setError(err instanceof Error ? err.message : "Search failed"))
              }
            >
              {t("search")}
            </button>
          </div>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="drug-setup-table" role="listbox" aria-label={t("items")}>
          <div className="drug-setup-table-head">
            <span>{t("code")}</span>
            <span>{t("drugNameTrade")}</span>
            <span>{t("active")}</span>
          </div>
          {list.length === 0 ? <p className="empty-row">{t("noItemsYet")}</p> : null}
          {list.map((item) => (
            <div
              key={item.id}
              role="option"
              tabIndex={0}
              aria-selected={item.id === selectedId && !creating}
              className={`drug-setup-table-row${
                item.id === selectedId && !creating ? " selected" : ""
              }${!item.active ? " inactive" : ""}`}
              onClick={() => selectItem(item.id)}
              onDoubleClick={() => openEdit(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectItem(item.id);
                }
              }}
            >
              <span>{item.code}</span>
              <span>{item.name}</span>
              <span
                className="drug-setup-active-cell"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={item.active}
                  disabled={busyId === item.id}
                  aria-label={`${t("active")} ${item.code}`}
                  onChange={(e) => void toggleActive(item, e.target.checked)}
                />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="drug-setup-detail-pane">
        {creating ? (
          <>
            <div className="drug-setup-title-row">
              <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
                {t("createNewItemTitle")}
              </h3>
              <button type="button" className="desk-text-link" onClick={closeCreate}>
                {t("cancel")}
              </button>
            </div>
            <PharmacyItemForm
              key={createKey}
              editing={null}
              onSaved={(item) => void onCreateSaved(item)}
              onCancel={closeCreate}
            />
          </>
        ) : (
          <>
            <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
              {t("drugInfo")}
            </h3>
            {selected ? (
              <>
                <div className="drug-info-field">
                  <span className="drug-info-label">{t("brandName")}</span>
                  <span className="drug-info-input">{selected.name}</span>
                </div>
                <div className="drug-info-field">
                  <span className="drug-info-label">{t("dosage")}</span>
                  <span className="drug-info-input">{selected.dosage || "—"}</span>
                </div>
                <div className="drug-info-field">
                  <span className="drug-info-label">{t("packingSize")}</span>
                  <span className="drug-info-input">
                    {formatPackCompact(packFromItem(selected))}
                  </span>
                </div>
                {(() => {
                  const pack = packFromItem(selected);
                  const levels = packLevelsFromItemPack(pack);
                  const slots = packPriceSlots(
                    levels,
                    selected.buy_price_mmk,
                    sellOuterFromSmallest(pack, selected.sell_price_mmk),
                  );
                  return (
                    <div className="drug-info-price-grid" aria-label={t("pricing")}>
                      <span />
                      <span>{t("purPrice")}</span>
                      <span>{t("salePrice")}</span>
                      {slots.map((slot) => (
                        <Fragment key={slot.unit}>
                          <span>{slot.unit}</span>
                          <span className="price-buy">{slot.buy_mmk.toLocaleString()}</span>
                          <span className="price-sell">{slot.sell_mmk.toLocaleString()}</span>
                        </Fragment>
                      ))}
                    </div>
                  );
                })()}
                <div className="btn-row" style={{ marginTop: "0.75rem" }}>
                  <button type="button" className="btn primary" onClick={() => openEdit(selected)}>
                    {t("edit")}
                  </button>
                </div>
                <PharmacyItemsTab
                  isAdmin={isAdmin}
                  onEdit={openEdit}
                  selectedId={selected.id}
                  embedDetail
                  onChanged={() => setListEpoch((n) => n + 1)}
                />
              </>
            ) : (
              <p className="hint">{t("noItemsYet")}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
