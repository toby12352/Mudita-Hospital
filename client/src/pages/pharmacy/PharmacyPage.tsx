import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useClinicActions } from "@/app/clinicActions";
import type { PharmacyScreen } from "@/app/types";
import { getGuideRun, subscribeGuide } from "@/features/guidance/guideControl";
import {
  deletePharmacyItem,
  formatItemCode,
  formatPackCompact,
  getPharmacyItem,
  listPharmacyItems,
  listStockMovements,
  itemStockUnitLabel,
  packFromItem,
  packLevelsFromItemPack,
  packPriceSlots,
  sellOuterFromSmallest,
  updatePharmacyItem,
  type PharmacyItem,
  type StockMovement,
} from "@/features/pharmacy/api";
import { matchesActive, type ActiveFilterValue } from "@/shared/ActiveFilter";
import { ActionIcon } from "@/shared/ActionIcon";
import {
  BillHistoryToolbar,
  type BillHistoryQuery,
  type BillHistoryStatusOption,
} from "@/shared/BillHistoryToolbar";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { sortByDateAscDesc } from "@/shared/DateSort";
import { useI18n } from "@/shared/i18n";
import { StockMovementsHistoryTable } from "@/shared/StockMovementsHistoryTable";
import { CatalogDeleteDialog } from "@/pages/opd/CatalogDeleteDialog";
import { PharmacyItemForm } from "./PharmacyItemForm";
import { PharmacyItemLots } from "./PharmacyItemLots";
import { PharmacyItemsTab, type RestockPriceDraft } from "./PharmacyItemsTab";

const listOpts = { includeInactive: true } as const;

function emptyListQuery(): BillHistoryQuery {
  return { q: "", money: "", category: "", unit: "", from: "", to: "", sort: "desc" };
}

function itemHasUnit(item: PharmacyItem, unit: string): boolean {
  const needle = unit.trim().toLowerCase();
  if (!needle) return true;
  return packLevelsFromItemPack(packFromItem(item)).units.some(
    (u) => u.trim().toLowerCase() === needle,
  );
}

function historyStampDay(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function activeFromMoney(money: string): ActiveFilterValue {
  if (money === "active") return "active";
  if (money === "inactive") return "inactive";
  return "all";
}

export function PharmacyPage({
  initialScreen = "browse",
}: {
  initialScreen?: PharmacyScreen;
}) {
  const { t } = useI18n();
  const { pharmacyUpdate, pharmacyDelete } = useClinicActions();
  const [historyOpen, setHistoryOpen] = useState(initialScreen === "history");
  const [creating, setCreating] = useState(initialScreen === "form" && pharmacyUpdate);
  const [createKey, setCreateKey] = useState(0);
  const [listQuery, setListQuery] = useState<BillHistoryQuery>(emptyListQuery);
  const [list, setList] = useState<PharmacyItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [historyQuery, setHistoryQuery] = useState<BillHistoryQuery>(emptyListQuery);
  const [historyList, setHistoryList] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<PharmacyItem | null>(null);
  const [editing, setEditing] = useState<PharmacyItem | null>(null);
  const overlayHostRef = useRef<HTMLDivElement>(null);
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const returnListFocusIdRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listEpoch, setListEpoch] = useState(0);
  const [detailEpoch, setDetailEpoch] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [restockDraftPrices, setRestockDraftPrices] = useState<RestockPriceDraft | null>(null);
  const [guideLessonId, setGuideLessonId] = useState<string | null>(() => getGuideRun()?.lessonId ?? null);

  const showForm = (creating && pharmacyUpdate) || (editing != null && pharmacyUpdate);
  const showBrowse = !showForm && selectedId == null;
  const showHistory = showBrowse && historyOpen;
  const showList = showBrowse && !historyOpen;
  const selected = list.find((i) => i.id === selectedId) ?? null;
  const infoItem =
    selectedDetail && selected && selectedDetail.id === selected.id
      ? selectedDetail
      : selected;
  const showDetail = !showForm && !historyOpen && infoItem != null;

  const statusOptions = useMemo((): BillHistoryStatusOption[] => {
    return [
      { value: "", label: t("all") },
      { value: "active", label: t("active") },
      { value: "inactive", label: t("notActive") },
    ];
  }, [t]);

  const historyStatusOptions = useMemo((): BillHistoryStatusOption[] => {
    return [
      { value: "", label: t("all") },
      { value: "PURCHASE", label: t("movementPurchase") },
      { value: "SALE", label: t("movementSale") },
      { value: "ADJUST", label: t("movementAdjust") },
      { value: "ISSUE", label: t("movementIssue") },
      { value: "RETURN", label: t("movementReturn") },
      { value: "WASTE", label: t("movementWaste") },
      { value: "TRANSFER", label: t("movementTransfer") },
    ];
  }, [t]);

  const unitOptions = useMemo((): BillHistoryStatusOption[] => {
    const names = new Set<string>();
    for (const item of list) {
      for (const unit of packLevelsFromItemPack(packFromItem(item)).units) {
        const label = unit.trim();
        if (label) names.add(label);
      }
    }
    return [...names]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
  }, [list]);

  function rememberOpener() {
    const el = document.activeElement;
    openerRef.current = el instanceof HTMLElement ? el : null;
  }

  function restoreOpener() {
    const prev = openerRef.current;
    openerRef.current = null;
    if (prev && document.contains(prev)) {
      window.requestAnimationFrame(() => prev.focus());
    }
  }

  async function reloadHistory(search = historyQuery.q) {
    setHistoryLoading(true);
    try {
      const data = await listStockMovements({ q: search.trim() || undefined });
      setHistoryList(data);
      return data;
    } finally {
      setHistoryLoading(false);
    }
  }

  function runHistorySearch(query: BillHistoryQuery) {
    setHistoryQuery(query);
    void reloadHistory(query.q).catch((err) =>
      setError(err instanceof Error ? err.message : "Search failed"),
    );
  }

  async function reload(search = listQuery.q) {
    setListLoading(true);
    try {
      const data = await listPharmacyItems(search.trim(), listOpts);
      setList(data);
      return data;
    } finally {
      setListLoading(false);
    }
  }

  function runListSearch(query: BillHistoryQuery) {
    setListQuery(query);
    void reload(query.q).catch((err) =>
      setError(err instanceof Error ? err.message : "Search failed"),
    );
  }

  useEffect(() => {
    return subscribeGuide(() => {
      setGuideLessonId(getGuideRun()?.lessonId ?? null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listPharmacyItems("", listOpts);
        if (cancelled) return;
        setList(data);
        setListLoading(false);
      } catch (e) {
        if (!cancelled) {
          setListLoading(false);
          setError(e instanceof Error ? e.message : "Load failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listEpoch]);

  useEffect(() => {
    if (showForm || showHistory || selectedId != null) return;
    if (list.length === 0) return;
    if (guideLessonId !== "pharmacy-item") return;
    selectItem(list[0].id);
    // Intentionally only when the tour needs a restock target on the browse list.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- guide open once list is ready
  }, [guideLessonId, list, showForm, showHistory, selectedId]);

  useEffect(() => {
    if (!showForm) return;
    const content = document.querySelector(".app-content");
    if (content instanceof HTMLElement) content.scrollTop = 0;
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>(
          ".pharmacy-item-create-page .card-form input:not([readonly]):not([disabled]), .pharmacy-item-edit-page .card-form input:not([readonly]):not([disabled])",
        )
        ?.focus();
    });
  }, [showForm, creating, editing]);

  useEffect(() => {
    if (!showDetail) return;
    window.requestAnimationFrame(() => detailTitleRef.current?.focus());
  }, [showDetail, selectedId]);

  useEffect(() => {
    if (!showList) return;
    const id = returnListFocusIdRef.current;
    if (id == null) return;
    returnListFocusIdRef.current = null;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-item-row="${id}"]`)?.focus();
    });
  }, [showList, list]);

  useEffect(() => {
    if (selectedId == null || showForm || showHistory) {
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
  }, [selectedId, showForm, showHistory, detailEpoch, listEpoch]);

  useEffect(() => {
    setRestockDraftPrices(null);
  }, [selectedId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (
        document.querySelector(
          ".alert-dialog-overlay, .print-preview-overlay, .drug-setup-restock-overlay",
        )
      ) {
        return;
      }
      if (showForm) {
        e.preventDefault();
        if (creating && editing == null) leaveCreate();
        else closeEdit();
        return;
      }
      if (showHistory) {
        e.preventDefault();
        closeHistory();
        return;
      }
      if (selectedId != null) {
        e.preventDefault();
        backToList();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Escape wiring
  }, [showForm, showHistory, creating, editing, selectedId]);

  const filtered = useMemo(() => {
    const status = activeFromMoney(listQuery.money);
    const from = listQuery.from.trim();
    const to = listQuery.to.trim();
    const unit = listQuery.unit.trim();
    let rows = list.filter((i) => matchesActive(i.active, status));
    if (unit) {
      rows = rows.filter((i) => itemHasUnit(i, unit));
    }
    if (from || to) {
      rows = rows.filter((i) => {
        const day = historyStampDay(i.created_at);
        if (from && day && day < from) return false;
        if (to && day && day > to) return false;
        return true;
      });
    }
    return sortByDateAscDesc(rows, listQuery.sort, (i) => i.created_at, (i) => i.id);
  }, [list, listQuery.money, listQuery.unit, listQuery.from, listQuery.to, listQuery.sort]);

  const filteredHistory = useMemo(() => {
    const movement = historyQuery.money;
    const rows =
      movement === ""
        ? historyList
        : historyList.filter((row) => row.movement_type === movement);
    return sortByDateAscDesc(rows, historyQuery.sort, (row) => row.created_at, (row) => row.id);
  }, [historyList, historyQuery.money, historyQuery.sort]);

  function selectItem(id: number) {
    rememberOpener();
    setHistoryOpen(false);
    setSelectedId(id);
    setCreating(false);
    setEditing(null);
    setRestockDraftPrices(null);
    setError(null);
  }

  function backToList() {
    returnListFocusIdRef.current = selectedId;
    openerRef.current = null;
    setSelectedId(null);
    setSelectedDetail(null);
    setCreating(false);
    setEditing(null);
    setHistoryOpen(false);
    setRestockDraftPrices(null);
    setError(null);
  }

  function openCreate() {
    if (!pharmacyUpdate) return;
    rememberOpener();
    setHistoryOpen(false);
    setSelectedId(null);
    setEditing(null);
    setCreating(true);
    setCreateKey((n) => n + 1);
    setError(null);
  }

  function leaveCreate() {
    setCreating(false);
    setError(null);
    restoreOpener();
  }

  function openHistory() {
    if (historyOpen) {
      closeHistory();
      return;
    }
    setCreating(false);
    setEditing(null);
    setSelectedId(null);
    setSelectedDetail(null);
    setHistoryQuery(emptyListQuery());
    setHistoryOpen(true);
    setError(null);
    void reloadHistory("").catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }

  function closeHistory() {
    setHistoryOpen(false);
    window.requestAnimationFrame(() => historyBtnRef.current?.focus());
  }

  useEffect(() => {
    if (initialScreen !== "history") return;
    void reloadHistory("").catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open history once from initial screen
  }, []);

  async function openEdit(item: PharmacyItem) {
    if (!pharmacyUpdate) return;
    rememberOpener();
    setCreating(false);
    setError(null);
    try {
      const full = await getPharmacyItem(item.id);
      setEditing(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }

  function closeEdit() {
    setEditing(null);
    setError(null);
    restoreOpener();
  }

  function onEditSaved() {
    setEditing(null);
    setListEpoch((n) => n + 1);
    setDetailEpoch((n) => n + 1);
    setError(null);
  }

  async function onCreateSaved(item: PharmacyItem) {
    setError(null);
    setListQuery(emptyListQuery());
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
    const prevIdx = filtered.findIndex((i) => i.id === deletedId);
    const preferId = filtered[prevIdx + 1]?.id ?? filtered[prevIdx - 1]?.id ?? null;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deletePharmacyItem(deletedId);
      setDeleteConfirm(false);
      const data = await listPharmacyItems(listQuery.q.trim(), listOpts);
      setList(data);
      setSelectedId(null);
      setSelectedDetail(null);
      returnListFocusIdRef.current =
        preferId != null && data.some((i) => i.id === preferId) ? preferId : data[0]?.id ?? null;
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
    if (selectedDetail?.id === item.id) {
      setSelectedDetail({ ...selectedDetail, active });
    }
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
        pack_l4_qty: pack.pack_l4_qty,
        pack_l4_unit: pack.pack_l4_unit,
        pack_l5_qty: pack.pack_l5_qty,
        pack_l5_unit: pack.pack_l5_unit,
        pack_l6_qty: pack.pack_l6_qty,
        pack_l6_unit: pack.pack_l6_unit,
        buy_price_mmk: item.buy_price_mmk,
        sell_price_mmk: item.sell_price_mmk,
        active,
      });
    } catch (err) {
      setList((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, active: item.active } : i)),
      );
      if (selectedDetail?.id === item.id) {
        setSelectedDetail({ ...selectedDetail, active: item.active });
      }
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const detailSub = infoItem
    ? [
        formatItemCode(infoItem.code),
        formatPackCompact(packFromItem(infoItem)) || null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <section className="opd-bill-desk opd-bill-desk--history" aria-label={t("drugSetup")}>
      <div className="opd-bill-desk-main">
        {showForm && creating && pharmacyUpdate ? (
          <div className="pharmacy-item-create-page">
            <div className="patient-chart-title-row">
              <h2 id="pharmacy-item-form-title" className="opd-bill-desk-title">
                {t("createNewItemTitle")}
              </h2>
              <DialogCloseButton onClick={leaveCreate} />
            </div>
            <PharmacyItemForm
              key={createKey}
              editing={null}
              existingCodes={list.map((i) => i.code)}
              onSaved={(item) => void onCreateSaved(item)}
            />
          </div>
        ) : null}

        {showForm && editing && pharmacyUpdate ? (
          <div className="pharmacy-item-edit-page">
            <div className="patient-chart-title-row">
              <h2 id="pharmacy-item-form-title" className="opd-bill-desk-title">
                {`${t("editItemTitle")} ${formatItemCode(editing.code)}`}
              </h2>
              <DialogCloseButton onClick={closeEdit} />
            </div>
            <PharmacyItemForm
              editing={editing}
              existingCodes={list.map((i) => i.code)}
              onSaved={() => onEditSaved()}
            />
          </div>
        ) : null}

        {showBrowse ? (
          <>
            <h2 className="opd-bill-desk-title">{t("drugSetup")}</h2>
            <BillHistoryToolbar
              key={showHistory ? "pharmacy-items-history" : "pharmacy-items"}
              searchPlaceholder={t("idCodeOrName")}
              initialRange="all"
              statusOptions={showHistory ? historyStatusOptions : statusOptions}
              statusFieldLabel={showHistory ? t("movementWhat") : t("status")}
              unitOptions={showHistory ? undefined : unitOptions}
              explicitSearch
              hideDateRange={showHistory}
              onSearch={showHistory ? runHistorySearch : runListSearch}
              onInvalidRange={() => setError(t("billHistoryInvalidRange"))}
              trailing={
                <>
                  <button
                    ref={historyBtnRef}
                    type="button"
                    className="btn action"
                    aria-pressed={showHistory}
                    onClick={openHistory}
                  >
                    <ActionIcon name="history" />
                    {t("catalogHistoryLink")}
                  </button>
                  {pharmacyUpdate ? (
                    <button type="button" className="btn action primary" onClick={openCreate}>
                      <ActionIcon name="plus" />
                      {t("createNewItemTitle")}
                    </button>
                  ) : null}
                </>
              }
            />
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            {showHistory ? (
              <StockMovementsHistoryTable
                rows={filteredHistory}
                loading={historyLoading}
                ariaLabel={t("inventoryHistory")}
              />
            ) : (
              <div className="bill-history-table-wrap" role="region" aria-label={t("items")}>
                <div className="bill-history-table-head bill-history-table-head--items" role="row">
                  <span className="bill-history-col bill-history-col--no" role="columnheader">
                    {t("listNo")}
                  </span>
                  <span className="bill-history-col" role="columnheader">
                    {t("idCode")}
                  </span>
                  <span className="bill-history-col bill-history-col--name" role="columnheader">
                    {t("name")}
                  </span>
                  <span className="bill-history-col" role="columnheader">
                    {t("packingSize")}
                  </span>
                  <span className="bill-history-col" role="columnheader">
                    {t("inStock")}
                  </span>
                  <span className="bill-history-col bill-history-col--active" role="columnheader">
                    {t("active")}
                  </span>
                </div>
                {listLoading ? <p className="hint bill-history-table-msg">{t("loading")}</p> : null}
                {!listLoading && filtered.length === 0 ? (
                  <p className="hint bill-history-table-msg empty-row">{t("noItemsYet")}</p>
                ) : null}
                <ul className="bill-history-table-body">
                  {filtered.map((item, index) => {
                    const packLabel = formatPackCompact(packFromItem(item));
                    const stockUnit = itemStockUnitLabel(item);
                    const stockText = `${item.stock_main.toLocaleString()}${
                      stockUnit ? ` ${stockUnit}` : ""
                    }`;
                    const nameLabel = item.active ? item.name : `${item.name} ${t("inactive")}`;
                    return (
                      <li key={item.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          data-item-row={item.id}
                          aria-label={`${formatItemCode(item.code)} · ${nameLabel}`}
                          className={`bill-history-table-row bill-history-table-row--items bill-history-table-row--clickable${
                            !item.active ? " inactive" : ""
                          }`}
                          onClick={() => selectItem(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectItem(item.id);
                            }
                          }}
                        >
                          <span className="bill-history-col bill-history-col--no">{index + 1}</span>
                          <span
                            className="bill-history-col"
                            title={formatItemCode(item.code)}
                          >
                            {formatItemCode(item.code)}
                          </span>
                          <span className="bill-history-col bill-history-col--name" title={item.name}>
                            <span className="bill-history-name-primary">{item.name}</span>
                            {!item.active ? (
                              <span className="bill-history-name-detail">{t("inactive")}</span>
                            ) : null}
                          </span>
                          <span className="bill-history-col" title={packLabel || undefined}>
                            {packLabel || "—"}
                          </span>
                          <span
                            className="bill-history-col"
                            title={
                              item.low_stock
                                ? `${stockText} · ${t("lowStockLabel")}`
                                : stockText
                            }
                          >
                            {stockText}
                            {item.low_stock ? (
                              <span className="bill-history-name-detail">
                                {" "}
                                · {t("lowStockLabel")}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className="bill-history-col bill-history-col--active drug-setup-active-cell"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={item.active}
                              disabled={busyId === item.id || !pharmacyUpdate}
                              aria-label={`${t("active")} ${formatItemCode(item.code)}`}
                              onChange={(e) => void toggleActive(item, e.target.checked)}
                            />
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        ) : null}

        {showDetail && infoItem ? (
          <div ref={overlayHostRef} className="pharmacy-item-detail-page">
            <div className="patient-chart-title-row">
              <div className="patient-chart-title-block">
                <h2 ref={detailTitleRef} tabIndex={-1} className="opd-bill-desk-title">
                  {infoItem.name}
                </h2>
                {detailSub ? <p className="patient-chart-sub">{detailSub}</p> : null}
              </div>
              <DialogCloseButton onClick={backToList} />
            </div>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
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
                stockUnit={itemStockUnitLabel(infoItem)}
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
              overlayHostRef={overlayHostRef}
              onRestockPrices={setRestockDraftPrices}
              onChanged={() => {
                setListEpoch((n) => n + 1);
                setDetailEpoch((n) => n + 1);
              }}
            />
          </div>
        ) : null}
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
