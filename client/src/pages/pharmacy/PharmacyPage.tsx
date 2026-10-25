import { Fragment, useEffect, useId, useMemo, useState } from "react";
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
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { useI18n } from "@/shared/i18n";
import { PharmacyItemForm } from "./PharmacyItemForm";
import { PharmacyItemLots } from "./PharmacyItemLots";
import { PharmacyItemsTab, type RestockPriceDraft } from "./PharmacyItemsTab";
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
  const filterPanelId = useId();
  const [filterQ, setFilterQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilterValue>("all");
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
    () => list.filter((i) => matchesActive(i.active, activeFilter)),
    [list, activeFilter],
  );
  const selected = list.find((i) => i.id === selectedId) ?? null;
  const infoItem =
    selectedDetail && selected && selectedDetail.id === selected.id
      ? selectedDetail
      : selected;

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
    setRestockDraftPrices(null);
  }

  useEffect(() => {
    setRestockDraftPrices(null);
  }, [selectedId]);

  async function openEdit(item: PharmacyItem) {
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

  useEffect(() => {
    if (!deleteConfirm) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDeleteConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close while dialog open
  }, [deleteConfirm, deleteBusy]);

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
            <button type="button" className="btn action primary" onClick={openCreate}>
              <ActionIcon name="plus" />
              {t("newBadge")}
            </button>
            <CatalogFilterButton
              open={filterOpen}
              controlsId={filterPanelId}
              onToggle={() => setFilterOpen((v) => !v)}
            />
            <button type="button" className="btn action" onClick={() => setMode("history")}>
              <ActionIcon name="history" />
              {t("itemHistoryLink")}
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
              aria-selected={item.id === selectedId && !creating}
              className={`drug-setup-table-row${
                item.id === selectedId && !creating ? " selected" : ""
              }${!item.active ? " inactive" : ""}`}
              onClick={() => selectItem(item.id)}
              onDoubleClick={() => void openEdit(item)}
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
                  isAdmin={isAdmin}
                  onEdit={() => void openEdit(infoItem)}
                  onDelete={openDeleteConfirm}
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
        <div
          className="opd-bill-dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteConfirm();
          }}
        >
          <div
            className="opd-bill-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-item-dialog-title"
          >
            <div className="opd-bill-dialog-head">
              <h2 id="delete-item-dialog-title" className="opd-bill-dialog-title">
                {t("delete")}
              </h2>
              <DialogCloseButton onClick={closeDeleteConfirm} disabled={deleteBusy} />
            </div>
            <p className="hint">
              {formatItemCode(infoItem.code)} · {infoItem.name}
            </p>
            <p>{t("deleteItemConfirm")}</p>
            {deleteError ? <p className="form-error">{deleteError}</p> : null}
            <div className="btn-row" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn ghost"
                onClick={closeDeleteConfirm}
                disabled={deleteBusy}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => void confirmDeleteItem()}
                disabled={deleteBusy}
              >
                {t("delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
