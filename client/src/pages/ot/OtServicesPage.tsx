import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  createOtMasterService,
  deactivateOtMasterService,
  deleteOtMasterService,
  listOtMasterServices,
  listOtServiceHistory,
  updateOtMasterService,
  type OtMasterService,
  type OtServiceHistoryRow,
} from "@/features/ot/api";
import { useClinicActions } from "@/app/clinicActions";
import { matchesActive, type ActiveFilterValue } from "@/shared/ActiveFilter";
import { ActionIcon } from "@/shared/ActionIcon";
import {
  BillHistoryToolbar,
  type BillHistoryQuery,
  type BillHistoryStatusOption,
} from "@/shared/BillHistoryToolbar";
import { CatalogAuditHistoryTable } from "@/shared/CatalogAuditHistoryTable";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { sortByDateAscDesc } from "@/shared/DateSort";
import { fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { CatalogDeleteDialog } from "@/pages/opd/CatalogDeleteDialog";

function parseCatalogPrice(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0) return "invalid";
  return n;
}

function serviceLabel(s: OtMasterService): string {
  return s.code ? `${s.code} — ${s.name}` : s.name;
}

function emptyListQuery(): BillHistoryQuery {
  return { q: "", money: "", category: "", unit: "", from: "", to: "", sort: "desc" };
}

function activeFromMoney(money: string): ActiveFilterValue {
  if (money === "active") return "active";
  if (money === "inactive") return "inactive";
  return "all";
}

export function OtServicesPage({
  onBrowseChange,
}: {
  onBrowseChange?: (browsing: boolean) => void;
} = {}) {
  const { t } = useI18n();
  const { otUpdate, otDelete } = useClinicActions();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [listQuery, setListQuery] = useState<BillHistoryQuery>(emptyListQuery);
  const [list, setList] = useState<OtMasterService[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [historyQuery, setHistoryQuery] = useState<BillHistoryQuery>(emptyListQuery);
  const [historyList, setHistoryList] = useState<OtServiceHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<OtMasterService | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OtMasterService | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const codeInputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const returnListFocusIdRef = useRef<number | null>(null);
  const codeErrorId = useId();
  const formTitleId = useId();

  const showForm = otUpdate && (creating || editing != null);
  const showBrowse = !showForm && selectedId == null;
  const showHistory = showBrowse && historyOpen;
  const showList = showBrowse && !historyOpen;
  const selected = list.find((s) => s.id === selectedId) ?? null;
  const showDetail = !showForm && !historyOpen && selected != null;

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
      { value: "create", label: t("auditActionCreate") },
      { value: "update", label: t("auditActionUpdate") },
      { value: "deactivate", label: t("deactivate") },
      { value: "delete", label: t("auditActionDelete") },
    ];
  }, [t]);

  useEffect(() => {
    onBrowseChange?.(showBrowse);
  }, [showBrowse, onBrowseChange]);

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
      const data = await listOtServiceHistory(search.trim());
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
      const data = await listOtMasterServices(search.trim());
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
    let cancelled = false;
    (async () => {
      try {
        const data = await listOtMasterServices("");
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
  }, []);

  useEffect(() => {
    if (!showForm) return;
    const content = document.querySelector(".app-content");
    if (content instanceof HTMLElement) content.scrollTop = 0;
    window.requestAnimationFrame(() => codeInputRef.current?.focus());
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
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".alert-dialog-overlay, .print-preview-overlay")) return;
      if (showForm) {
        e.preventDefault();
        closeForm();
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
  }, [showForm, showHistory, selectedId]);

  const filtered = useMemo(() => {
    const status = activeFromMoney(listQuery.money);
    return sortByDateAscDesc(
      list.filter((s) => matchesActive(s.active, status)),
      listQuery.sort,
      (s) => s.created_at,
      (s) => s.id,
    );
  }, [list, listQuery.money, listQuery.sort]);

  const filteredHistory = useMemo(() => {
    const action = historyQuery.money;
    const rows =
      action === ""
        ? historyList
        : historyList.filter((row) => row.action === action);
    return sortByDateAscDesc(rows, historyQuery.sort, (row) => row.created_at, (row) => row.id);
  }, [historyList, historyQuery.money, historyQuery.sort]);

  function fillForm(s: OtMasterService | null) {
    if (!s) {
      setCode("");
      setName("");
      setPrice("");
      return;
    }
    setCode(s.code);
    setName(s.name);
    setPrice(s.price_mmk == null ? "" : String(s.price_mmk));
  }

  function selectItem(id: number) {
    rememberOpener();
    setHistoryOpen(false);
    setSelectedId(id);
    setCreating(false);
    setEditing(null);
    fillForm(null);
    setError(null);
  }

  function backToList() {
    returnListFocusIdRef.current = selectedId;
    openerRef.current = null;
    setSelectedId(null);
    setCreating(false);
    setEditing(null);
    setHistoryOpen(false);
    fillForm(null);
    setError(null);
  }

  function openCreate() {
    if (!otUpdate) return;
    rememberOpener();
    setHistoryOpen(false);
    setSelectedId(null);
    setEditing(null);
    fillForm(null);
    setCreating(true);
    setCreateKey((n) => n + 1);
    setError(null);
    setCodeError(null);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    fillForm(null);
    setCodeError(null);
    setError(null);
    restoreOpener();
  }

  function openEdit(s: OtMasterService) {
    if (!otUpdate) return;
    rememberOpener();
    setCreating(false);
    setEditing(s);
    fillForm(s);
    setError(null);
    setCodeError(null);
  }

  function openHistory() {
    if (historyOpen) {
      closeHistory();
      return;
    }
    setCreating(false);
    setEditing(null);
    setSelectedId(null);
    fillForm(null);
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    const priceMmk = parseCatalogPrice(price);
    if (priceMmk === "invalid") {
      setError(t("servicePriceInvalid"));
      window.setTimeout(() => revealField(formErrorRef.current), 0);
      return;
    }
    setBusy(true);
    setError(null);
    setCodeError(null);
    try {
      const body = {
        code: code.trim(),
        name: name.trim(),
        price_mmk: priceMmk,
        active: true,
      };
      const saved = editing
        ? await updateOtMasterService(editing.id, body)
        : await createOtMasterService({
            code: body.code,
            name: body.name,
            price_mmk: body.price_mmk,
          });
      setListQuery(emptyListQuery());
      setCreating(false);
      setEditing(null);
      fillForm(null);
      const data = await listOtMasterServices("");
      setList(data);
      setSelectedId(saved.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (fieldKeyForApiError(err) === "code") {
        setCodeError(t("errCodeExists"));
        window.setTimeout(() => revealField(codeInputRef.current), 0);
      } else {
        setError(msg);
        window.setTimeout(() => revealField(formErrorRef.current), 0);
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: OtMasterService, active: boolean) {
    setError(null);
    setBusyId(s.id);
    setList((prev) => prev.map((row) => (row.id === s.id ? { ...row, active } : row)));
    try {
      await updateOtMasterService(s.id, {
        code: s.code,
        name: s.name,
        price_mmk: s.price_mmk,
        active,
      });
    } catch (err) {
      setList((prev) => prev.map((row) => (row.id === s.id ? { ...row, active: s.active } : row)));
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onDeactivate(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deactivateOtMasterService(id);
      if (editing?.id === id) closeForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  function openDeleteConfirm(s: OtMasterService) {
    setDeleteError(null);
    setDeleteStep(1);
    setDeleteTarget(s);
  }

  function closeDeleteConfirm() {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteStep(1);
    setDeleteError(null);
  }

  async function confirmDeleteService() {
    if (!deleteTarget) return;
    if (deleteStep === 1) {
      setDeleteStep(2);
      setDeleteError(null);
      return;
    }
    const s = deleteTarget;
    const prevIdx = filtered.findIndex((row) => row.id === s.id);
    const preferId = filtered[prevIdx + 1]?.id ?? filtered[prevIdx - 1]?.id ?? null;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteOtMasterService(s.id);
      setDeleteTarget(null);
      setDeleteStep(1);
      if (editing?.id === s.id) {
        setCreating(false);
        setEditing(null);
        fillForm(null);
      }
      const data = await reload();
      setSelectedId(null);
      returnListFocusIdRef.current =
        preferId != null && data.some((row) => row.id === preferId) ? preferId : data[0]?.id ?? null;
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className="opd-bill-desk opd-bill-desk--history" aria-label={t("serviceSetup")}>
      <div className="opd-bill-desk-main">
        {showForm ? (
          <div className="catalog-master-form-page">
            <div className="patient-chart-title-row">
              <h2 id={formTitleId} className="opd-bill-desk-title">
                {editing ? `${t("editService")} #${editing.id}` : t("createNewServiceTitle")}
              </h2>
              <DialogCloseButton onClick={closeForm} />
            </div>
            <form
              key={editing ? `edit-${editing.id}` : `create-${createKey}`}
              className="card-form"
              aria-labelledby={formTitleId}
              onSubmit={(e) => void submit(e)}
            >
              <div className="field-row">
                <label className={`field${codeError ? " is-invalid" : ""}`}>
                  <span>{t("code")}</span>
                  <input
                    ref={codeInputRef}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setCodeError(null);
                    }}
                    disabled={busy}
                    aria-invalid={codeError ? true : undefined}
                    aria-describedby={codeError ? codeErrorId : undefined}
                  />
                  <FieldError id={codeErrorId}>{codeError}</FieldError>
                </label>
                <label className="field">
                  <span>{t("priceMmk")}</span>
                  <input
                    type="number"
                    min={0}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    disabled={busy}
                    placeholder={t("none")}
                  />
                </label>
              </div>
              <label className="field">
                <span>{t("name")}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={busy}
                  placeholder={t("serviceNamePlaceholder")}
                />
              </label>
              {error ? (
                <p ref={formErrorRef} className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="btn-row">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? t("saving") : editing ? t("updateService") : t("addService")}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {showBrowse ? (
          <>
            <h2 className="opd-bill-desk-title">{t("serviceSetup")}</h2>
            <BillHistoryToolbar
              key={showHistory ? "ot-services-history" : "ot-services"}
              searchPlaceholder={
                showHistory ? t("catalogHistoryFilterPlaceholder") : t("codeOrName")
              }
              initialRange="all"
              statusOptions={showHistory ? historyStatusOptions : statusOptions}
              statusFieldLabel={showHistory ? t("auditAction") : t("status")}
              explicitSearch
              hideDateRange
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
                  {otUpdate ? (
                    <button type="button" className="btn action primary" onClick={openCreate}>
                      <ActionIcon name="plus" />
                      {t("createNewServiceTitle")}
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
              <CatalogAuditHistoryTable
                rows={filteredHistory}
                loading={historyLoading}
                ariaLabel={t("serviceHistory")}
              />
            ) : (
              <div
                className="bill-history-table-wrap"
                role="region"
                aria-label={t("maintenanceServices")}
              >
                <div
                  className="bill-history-table-head bill-history-table-head--lab-services"
                  role="row"
                >
                  <span className="bill-history-col bill-history-col--no" role="columnheader">
                    {t("listNo")}
                  </span>
                  <span className="bill-history-col" role="columnheader">
                    {t("code")}
                  </span>
                  <span className="bill-history-col bill-history-col--name" role="columnheader">
                    {t("name")}
                  </span>
                  <span className="bill-history-col" role="columnheader">
                    {t("priceMmk")}
                  </span>
                  <span className="bill-history-col bill-history-col--active" role="columnheader">
                    {t("active")}
                  </span>
                </div>
                {listLoading ? <p className="hint bill-history-table-msg">{t("loading")}</p> : null}
                {!listLoading && filtered.length === 0 ? (
                  <p className="hint bill-history-table-msg empty-row">{t("noServicesYet")}</p>
                ) : null}
                <ul className="bill-history-table-body">
                  {filtered.map((s, index) => {
                    const nameLabel = s.active ? s.name : `${s.name} ${t("inactive")}`;
                    const priceText =
                      s.price_mmk == null ? t("none") : formatMMK(s.price_mmk);
                    return (
                      <li key={s.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          data-item-row={s.id}
                          aria-label={`${s.code || "—"} · ${nameLabel}`}
                          className={`bill-history-table-row bill-history-table-row--lab-services bill-history-table-row--clickable${
                            !s.active ? " inactive" : ""
                          }`}
                          onClick={() => selectItem(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectItem(s.id);
                            }
                          }}
                        >
                          <span className="bill-history-col bill-history-col--no">{index + 1}</span>
                          <span className="bill-history-col" title={s.code || undefined}>
                            {s.code || "—"}
                          </span>
                          <span className="bill-history-col bill-history-col--name" title={s.name}>
                            <span className="bill-history-name-primary">{s.name}</span>
                            {!s.active ? (
                              <span className="bill-history-name-detail">{t("inactive")}</span>
                            ) : null}
                          </span>
                          <span className="bill-history-col">{priceText}</span>
                          <span
                            className="bill-history-col bill-history-col--active drug-setup-active-cell"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={s.active}
                              disabled={busyId === s.id || !otUpdate}
                              aria-label={`${t("active")} ${serviceLabel(s)}`}
                              onChange={(e) => void toggleActive(s, e.target.checked)}
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

        {showDetail && selected ? (
          <div className="catalog-master-detail-page">
            <div className="patient-chart-title-row">
              <div className="patient-chart-title-block">
                <h2 ref={detailTitleRef} tabIndex={-1} className="opd-bill-desk-title">
                  {selected.name}
                </h2>
                {selected.code ? <p className="patient-chart-sub">{selected.code}</p> : null}
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
                <span className="drug-info-label">{t("code")}</span>
                <span className="drug-info-input">{selected.code || "—"}</span>
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("name")}</span>
                <span className="drug-info-input">{selected.name}</span>
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("priceMmk")}</span>
                <span className="drug-info-input">
                  {selected.price_mmk == null
                    ? t("none")
                    : `${formatMMK(selected.price_mmk)} ${t("mmk")}`}
                </span>
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("active")}</span>
                <span className="drug-info-input">
                  {selected.active ? t("active") : t("inactive")}
                </span>
              </div>
            </div>
            <div className="btn-row">
              {otUpdate ? (
                <button
                  type="button"
                  className="btn action"
                  disabled={busy}
                  onClick={() => openEdit(selected)}
                >
                  <ActionIcon name="edit" />
                  {t("edit")}
                </button>
              ) : null}
              {otDelete && selected.active ? (
                <button
                  type="button"
                  className="btn action danger"
                  disabled={busy}
                  onClick={() => void onDeactivate(selected.id)}
                >
                  {t("deactivate")}
                </button>
              ) : null}
              {otDelete ? (
                <button
                  type="button"
                  className="btn action danger"
                  disabled={busy || deleteBusy}
                  onClick={() => openDeleteConfirm(selected)}
                >
                  <ActionIcon name="trash" />
                  {t("delete")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {deleteTarget ? (
        <CatalogDeleteDialog
          identity={serviceLabel(deleteTarget)}
          message={
            deleteStep === 1
              ? t("confirmDeleteService").replace("{name}", serviceLabel(deleteTarget))
              : t("confirmDeleteServiceFinal").replace("{name}", serviceLabel(deleteTarget))
          }
          busy={deleteBusy}
          error={deleteError}
          onCancel={closeDeleteConfirm}
          onConfirm={() => void confirmDeleteService()}
        />
      ) : null}
    </section>
  );
}
