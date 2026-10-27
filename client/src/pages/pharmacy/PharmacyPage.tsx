import { Fragment, useEffect, useId, useMemo, useState } from "react";
import { useClinicActions } from "@/app/clinicActions";
import type { PharmacyScreen } from "@/app/types";
import {
  deletePharmacyItem,
  formatItemCode,
  formatPackCompact,
  getPharmacyItem,
  listPharmacyItems,
  packFromItem,
  packLevelsFromItemPack,
  packPriceSlots,
  sellOuterFromSmallest,
  updatePharmacyItem,
  type PharmacyItem,
} from "@/features/pharmacy/api";
import { matchesActive, type ActiveFilterValue } from "@/shared/ActiveFilter";
import { ActionIcon } from "@/shared/ActionIcon";
import { CatalogFilterButton, CatalogFilterPanel } from "@/shared/CatalogListFilter";
import { sortByDateAscDesc, type DateSortValue } from "@/shared/DateSort";
import { useI18n } from "@/shared/i18n";
import { CatalogDeleteDialog } from "@/pages/opd/CatalogDeleteDialog";
import { PharmacyItemForm } from "./PharmacyItemForm";
import { PharmacyItemLots } from "./PharmacyItemLots";
import { PharmacyItemsTab, type RestockPriceDraft } from "./PharmacyItemsTab";
import { PharmacyMovementsTab } from "./PharmacyMovementsTab";

const listOpts = { includeInactive: true } as const;

export function PharmacyPage({
  initialScreen = "browse",
}: {
  initialScreen?: PharmacyScreen;
}) {
  const { t } = useI18n();
  const { pharmacyUpdate, pharmacyDelete } = useClinicActions();
  const [mode, setMode] = useState<"items" | "history" | "form">(
    initialScreen === "history" ? "history" : "items",
  );
  const [creating, setCreating] = useState(initialScreen === "form" && pharmacyUpdate);
  const [createKey, setCreateKey] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPanelId = useId();
  const [filterQ, setFilterQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilterValue>("all");
  const [dateSort, setDateSort] = useState<DateSortValue>("desc");
  const [list, setList] = useState<PharmacyItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<PharmacyItem | null>(null);
  const [editing, setEditing] = useState<PharmacyItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listEpoch, setListEpoch] = useState(0);
  const [detailEpoch, setDetailEpoch] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [restockDraftPrices, setRestockDraftPrices] = useState<RestockPriceDraft | null>(null);

  async function reload(search = filterQ) {
    const data = await listPharmacyItems(search.trim(), listOpts);
    setList(data);
    return data;
  }

  function runSearch(query: string, status = activeFilter) {
    void reload(query)
      .then((data) => {
        const first = data.find((i) => matchesActive(i.active, status));
        if (first) selectItem(first.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Search failed"));
  }

  function resetFilters() {
    setFilterQ("");
    setActiveFilter("all");
    setDateSort("desc");
    runSearch("", "all");
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

  useEffect(() => {
    if (selectedId == null || creating || mode === "form") {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const item = await getPharmacyItem(selectedId);
        if (!cancelled) setSelectedDetail(item);
      } catch (e) {
        if (!cancelled) {
          setSelectedDetail(null);
          setError(e instanceof Error ? e.message : "Load failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, creating, mode, detailEpoch, listEpoch]);

  const filtered = useMemo(
    () =>
      sortByDateAscDesc(
        list.filter((i) => matchesActive(i.active, activeFilter)),
        dateSort,
        (i) => i.created_at,
        (i) => i.id,
      ),
    [list, activeFilter, dateSort],
  );
  const selected = list.find((i) => i.id === selectedId) ?? null;
  const infoItem =
    selectedDetail && selected && selectedDetail.id === selected.id
      ? selectedDetail
      : selected;

  function openCreate() {
    if (!pharmacyUpdate) return;
    setMode("items");
    setCreating(true);
    setCreateKey((n) => n + 1);
  }

  function closeCreate() {
    setCreating(false);
  }

  function selectItem(id: number) {
    setMode("items");
    setSelectedId(id);
    setCreating(false);
    setRestockDraftPrices(null);
  }

  function toggleHistory() {
    if (mode === "history") {
      setMode("items");
      return;
    }
    setCreating(false);
    setMode("history");
  }

  useEffect(() => {
    setRestockDraftPrices(null);
  }, [selectedId]);

  async function openEdit(item: PharmacyItem) {
    if (!pharmacyUpdate) return;
    setCreating(false);
    setError(null);
    try {
      const full = await getPharmacyItem(item.id);
      setEditing(full);
      setMode("form");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
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

  function openDeleteConfirm() {
    setDeleteError(null);
    setDeleteConfirm(true);
  }

  function closeDeleteConfirm() {
    if (deleteBusy) return;
    setDeleteConfirm(false);
    setDeleteError(null);
  }

  async function confirmDeleteItem() {
    if (selectedId == null) return;
    const deletedId = selectedId;
    const prevIdx = list.findIndex((i) => i.id === deletedId);
    const preferId = list[prevIdx + 1]?.id ?? list[prevIdx - 1]?.id ?? null;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deletePharmacyItem(deletedId);
      setDeleteConfirm(false);
      const data = await listPharmacyItems(filterQ.trim(), listOpts);
      setList(data);
      const nextId =
        (preferId != null && data.some((i) => i.id === preferId) ? preferId : null) ??
        data[0]?.id ??
        null;
      setSelectedId(nextId);
      setSelectedDetail(null);
      setListEpoch((n) => n + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
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

  return (
    <section className="drug-setup" aria-label={t("drugSetup")}>
      <div className="drug-setup-list-pane">
        <div className="drug-setup-heading">
          <h2 className="drug-setup-title">{t("drugSetup")}</h2>
          <div className="tabs">
            {pharmacyUpdate ? (
              <button type="button" className="btn action primary" onClick={openCreate}>
                <ActionIcon name="plus" />
                {t("newBadge")}
              </button>
            ) : null}
            <CatalogFilterButton
              open={filterOpen}
              controlsId={filterPanelId}
              onToggle={() => setFilterOpen((v) => !v)}
            />
            <button
              type="button"
              className={`btn action${mode === "history" ? " on" : ""}`}
              onClick={toggleHistory}
            >
              <ActionIcon name="history" />
              {t("catalogHistoryLink")}
            </button>
          </div>
        </div>
        <p className="drug-setup-selected" aria-hidden="true" />
        <CatalogFilterPanel
          id={filterPanelId}
          open={filterOpen}
          query={filterQ}
          onQueryChange={setFilterQ}
          queryPlaceholder={t("idCodeOrName")}
          searchLabel={t("searchItems")}
          onSearch={() => runSearch(filterQ)}
          active={activeFilter}
          onActiveChange={setActiveFilter}
          dateSort={dateSort}
          onDateSortChange={setDateSort}
          onReset={resetFilters}
        />
        {error ? <p className="form-error">{error}</p> : null}
        <div className="drug-setup-table" role="listbox" aria-label={t("items")}>
          <div className="drug-setup-table-head">
            <span title={t("code")}>{t("code")}</span>
            <span title={t("drugNameTrade")}>{t("drugNameTrade")}</span>
            <span>{t("active")}</span>
          </div>
          {filtered.length === 0 ? <p className="empty-row">{t("noItemsYet")}</p> : null}
          {filtered.map((item) => (
            <div
              key={item.id}
              role="option"
              tabIndex={0}
              aria-selected={item.id === selectedId && mode === "items" && !creating}
              className={`drug-setup-table-row${
                item.id === selectedId && mode === "items" && !creating ? " selected" : ""
              }${!item.active ? " inactive" : ""}`}
              onClick={() => selectItem(item.id)}
              onDoubleClick={() => {
                if (pharmacyUpdate) void openEdit(item);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectItem(item.id);
                }
              }}
            >
              <span title={item.code}>{item.code}</span>
              <span title={item.name}>{item.name}</span>
              <span
                className="drug-setup-active-cell"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={item.active}
                  disabled={busyId === item.id || !pharmacyUpdate}
                  aria-label={`${t("active")} ${item.code}`}
                  onChange={(e) => void toggleActive(item, e.target.checked)}
                />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="drug-setup-detail-pane">
        {mode === "history" ? (
          <PharmacyMovementsTab />
        ) : creating && pharmacyUpdate ? (
          <>
            <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
              {t("createNewItemTitle")}
            </h3>
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
            {infoItem ? (
              <>
                <div className="drug-info-fields">
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("brandName")}</span>
                    <span className="drug-info-input">{infoItem.name}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("dosage")}</span>
                    <span className="drug-info-input">{infoItem.dosage || "—"}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("packingSize")}</span>
                    <span className="drug-info-input">
                      {formatPackCompact(packFromItem(infoItem))}
                    </span>
                  </div>
                  <PharmacyItemLots
                    batches={infoItem.batches}
                    stockUnit={infoItem.stock_unit || infoItem.pack_l3_unit || ""}
                    showOnHand
                    onHand={infoItem.stock_main}
                  />
                </div>
                {(() => {
                  const pack = packFromItem(infoItem);
                  const levels = packLevelsFromItemPack(pack);
                  const buyOuter = restockDraftPrices?.buy ?? infoItem.buy_price_mmk;
                  const sellSmallest = restockDraftPrices?.sell ?? infoItem.sell_price_mmk;
                  const slots = packPriceSlots(
                    levels,
                    buyOuter,
                    sellOuterFromSmallest(pack, sellSmallest),
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
                <PharmacyItemsTab
                  onEdit={() => void openEdit(infoItem)}
                  onDelete={pharmacyDelete ? openDeleteConfirm : undefined}
                  deleteBusy={deleteBusy}
                  selectedId={infoItem.id}
                  embedDetail
                  onRestockPrices={setRestockDraftPrices}
                  onChanged={() => {
                    setListEpoch((n) => n + 1);
                    setDetailEpoch((n) => n + 1);
                  }}
                />
              </>
            ) : (
              <p className="hint">{t("noItemsYet")}</p>
            )}
          </>
        )}
      </div>

      {deleteConfirm && infoItem ? (
        <CatalogDeleteDialog
          identity={`${formatItemCode(infoItem.code)} · ${infoItem.name}`}
          message={t("deleteItemConfirm")}
          busy={deleteBusy}
          error={deleteError}
          onCancel={closeDeleteConfirm}
          onConfirm={() => void confirmDeleteItem()}
        />
      ) : null}
    </section>
  );
}
