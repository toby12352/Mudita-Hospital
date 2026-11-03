import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  createDoctor,
  deactivateDoctor,
  deleteDoctor,
  listDoctorHistory,
  listDoctors,
  updateDoctor,
  type Doctor,
  type DoctorHistoryRow,
} from "@/features/settings/masterData";
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
import { CatalogDeleteDialog } from "./CatalogDeleteDialog";

function emptyListQuery(): BillHistoryQuery {
  return { q: "", money: "", category: "", unit: "", from: "", to: "", sort: "desc", order: "date" };
}

function activeFromMoney(money: string): ActiveFilterValue {
  if (money === "active") return "active";
  if (money === "inactive") return "inactive";
  return "all";
}

export function OpdDoctorsPage({
  onBrowseChange,
}: {
  onBrowseChange?: (browsing: boolean) => void;
} = {}) {
  const { t } = useI18n();
  const { opdUpdate, opdDelete } = useClinicActions();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [listQuery, setListQuery] = useState<BillHistoryQuery>(emptyListQuery);
  const [list, setList] = useState<Doctor[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [historyQuery, setHistoryQuery] = useState<BillHistoryQuery>(emptyListQuery);
  const [historyList, setHistoryList] = useState<DoctorHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const returnListFocusIdRef = useRef<number | null>(null);
  const nameErrorId = useId();
  const formTitleId = useId();
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [consult, setConsult] = useState("0");
  const [ot, setOt] = useState("0");

  const showForm = opdUpdate && (creating || editing != null);
  const showBrowse = !showForm && selectedId == null;
  const showHistory = showBrowse && historyOpen;
  const showList = showBrowse && !historyOpen;
  const selected = list.find((d) => d.id === selectedId) ?? null;
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

  async function reload(search = listQuery.q) {
    setListLoading(true);
    try {
      const data = await listDoctors(search.trim());
      setList(data);
      return data;
    } finally {
      setListLoading(false);
    }
  }

  async function reloadHistory(search = historyQuery.q) {
    setHistoryLoading(true);
    try {
      const data = await listDoctorHistory(search.trim());
      setHistoryList(data);
      return data;
    } finally {
      setHistoryLoading(false);
    }
  }

  function runListSearch(query: BillHistoryQuery) {
    setListQuery(query);
    void reload(query.q).catch((err) =>
      setError(err instanceof Error ? err.message : "Search failed"),
    );
  }

  function runHistorySearch(query: BillHistoryQuery) {
    setHistoryQuery(query);
    void reloadHistory(query.q).catch((err) =>
      setError(err instanceof Error ? err.message : "Search failed"),
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listDoctors("");
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
    window.requestAnimationFrame(() => nameInputRef.current?.focus());
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
      list.filter((d) => matchesActive(d.active, status)),
      listQuery.sort,
      (d) => d.created_at,
      (d) => d.id,
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

  function fillForm(d: Doctor | null) {
    if (!d) {
      setName("");
      setSpecialty("");
      setConsult("0");
      setOt("0");
      return;
    }
    setName(d.name);
    setSpecialty(d.specialty);
    setConsult(String(d.fees.consultation_mmk));
    setOt(String(d.fees.ot_mmk));
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
    if (!opdUpdate) return;
    rememberOpener();
    setHistoryOpen(false);
    setSelectedId(null);
    setEditing(null);
    fillForm(null);
    setCreating(true);
    setCreateKey((n) => n + 1);
    setError(null);
    setNameError(null);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    fillForm(null);
    setNameError(null);
    setError(null);
    restoreOpener();
  }

  function openEdit(d: Doctor) {
    if (!opdUpdate) return;
    rememberOpener();
    setCreating(false);
    setEditing(d);
    fillForm(d);
    setError(null);
    setNameError(null);
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
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      const body = {
        name: name.trim(),
        specialty: specialty.trim(),
        consultation_mmk: Number(consult) || 0,
        ot_mmk: Number(ot) || 0,
        active: true,
      };
      const saved = editing
        ? await updateDoctor(editing.id, body)
        : await createDoctor(body);
      setListQuery(emptyListQuery());
      setCreating(false);
      setEditing(null);
      fillForm(null);
      const data = await listDoctors("");
      setList(data);
      setSelectedId(saved.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (fieldKeyForApiError(err) === "name") {
        setNameError(msg);
        window.setTimeout(() => revealField(nameInputRef.current), 0);
      } else {
        setError(msg);
        window.setTimeout(() => revealField(formErrorRef.current), 0);
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(d: Doctor, active: boolean) {
    setError(null);
    setBusyId(d.id);
    setList((prev) => prev.map((row) => (row.id === d.id ? { ...row, active } : row)));
    try {
      await updateDoctor(d.id, {
        name: d.name,
        specialty: d.specialty,
        consultation_mmk: d.fees.consultation_mmk,
        ot_mmk: d.fees.ot_mmk,
        active,
      });
    } catch (err) {
      setList((prev) => prev.map((row) => (row.id === d.id ? { ...row, active: d.active } : row)));
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onDeactivate(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deactivateDoctor(id);
      if (editing?.id === id) closeForm();
      const data = await reload();
      if (selectedId === id) {
        const next = data.find((d) => d.id === id) ?? null;
        if (next) setList((prev) => prev.map((row) => (row.id === id ? next : row)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  function openDeleteConfirm(d: Doctor) {
    setDeleteError(null);
    setDeleteStep(1);
    setDeleteTarget(d);
  }

  function closeDeleteConfirm() {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteStep(1);
    setDeleteError(null);
  }

  async function confirmDeleteDoctor() {
    if (!deleteTarget) return;
    if (deleteStep === 1) {
      setDeleteStep(2);
      setDeleteError(null);
      return;
    }
    const d = deleteTarget;
    const prevIdx = filtered.findIndex((row) => row.id === d.id);
    const preferId = filtered[prevIdx + 1]?.id ?? filtered[prevIdx - 1]?.id ?? null;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteDoctor(d.id);
      setDeleteTarget(null);
      setDeleteStep(1);
      if (editing?.id === d.id) {
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
    <section className="opd-bill-desk opd-bill-desk--history" aria-label={t("doctorSetup")}>
      <div className="opd-bill-desk-main">
        {showForm ? (
          <div className="catalog-master-form-page">
            <div className="patient-chart-title-row">
              <h2 id={formTitleId} className="opd-bill-desk-title">
                {editing ? `${t("editDoctor")} #${editing.id}` : t("createNewDoctorTitle")}
              </h2>
              <DialogCloseButton onClick={closeForm} />
            </div>
            <form
              key={editing ? `edit-${editing.id}` : `create-${createKey}`}
              className="card-form"
              aria-labelledby={formTitleId}
              onSubmit={(e) => void submit(e)}
            >
              <label className={`field${nameError ? " is-invalid" : ""}`}>
                <span>{t("name")}</span>
                <input
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError(null);
                  }}
                  required
                  disabled={busy}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? nameErrorId : undefined}
                />
                <FieldError id={nameErrorId}>{nameError}</FieldError>
              </label>
              <label className="field">
                <span>{t("specialty")}</span>
                <input
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  disabled={busy}
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>{t("consultationMmk")}</span>
                  <input
                    type="number"
                    min={0}
                    value={consult}
                    onChange={(e) => setConsult(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="field">
                  <span>{t("otFeeMmk")}</span>
                  <input
                    type="number"
                    min={0}
                    value={ot}
                    onChange={(e) => setOt(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
              {error ? (
                <p ref={formErrorRef} className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="btn-row">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? t("saving") : editing ? t("updateDoctor") : t("addDoctor")}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {showBrowse ? (
          <>
            <h2 className="opd-bill-desk-title">{t("doctorSetup")}</h2>
            <BillHistoryToolbar
              key={showHistory ? "opd-doctors-history" : "opd-doctors"}
              searchPlaceholder={
                showHistory ? t("catalogHistoryFilterPlaceholder") : t("doctorPlaceholder")
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
                  {opdUpdate ? (
                    <button type="button" className="btn action primary" onClick={openCreate}>
                      <ActionIcon name="plus" />
                      {t("createNewDoctorTitle")}
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
                ariaLabel={t("doctorHistory")}
              />
            ) : (
              <div className="bill-history-table-wrap" role="region" aria-label={t("maintenanceDoctors")}>
                <div className="bill-history-table-head bill-history-table-head--doctors" role="row">
                  <span className="bill-history-col bill-history-col--no" role="columnheader">
                    {t("listNo")}
                  </span>
                  <span className="bill-history-col bill-history-col--name" role="columnheader">
                    {t("name")}
                  </span>
                  <span className="bill-history-col" role="columnheader">
                    {t("specialty")}
                  </span>
                  <span className="bill-history-col" role="columnheader">
                    {t("consultationMmk")}
                  </span>
                  <span className="bill-history-col" role="columnheader">
                    {t("otFeeMmk")}
                  </span>
                  <span className="bill-history-col bill-history-col--active" role="columnheader">
                    {t("active")}
                  </span>
                </div>
                {listLoading ? <p className="hint bill-history-table-msg">{t("loading")}</p> : null}
                {!listLoading && filtered.length === 0 ? (
                  <p className="hint bill-history-table-msg empty-row">{t("noDoctorsYet")}</p>
                ) : null}
                <ul className="bill-history-table-body">
                  {filtered.map((d, index) => {
                    const specialtyLabel = d.specialty || t("general");
                    const nameLabel = d.active ? d.name : `${d.name} ${t("inactive")}`;
                    return (
                      <li key={d.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          data-item-row={d.id}
                          aria-label={nameLabel}
                          className={`bill-history-table-row bill-history-table-row--doctors bill-history-table-row--clickable${
                            !d.active ? " inactive" : ""
                          }`}
                          onClick={() => selectItem(d.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectItem(d.id);
                            }
                          }}
                        >
                          <span className="bill-history-col bill-history-col--no">{index + 1}</span>
                          <span className="bill-history-col bill-history-col--name" title={d.name}>
                            <span className="bill-history-name-primary">{d.name}</span>
                            {!d.active ? (
                              <span className="bill-history-name-detail">{t("inactive")}</span>
                            ) : null}
                          </span>
                          <span className="bill-history-col" title={specialtyLabel}>
                            {specialtyLabel}
                          </span>
                          <span className="bill-history-col">
                            {formatMMK(d.fees.consultation_mmk)}
                          </span>
                          <span className="bill-history-col">{formatMMK(d.fees.ot_mmk)}</span>
                          <span
                            className="bill-history-col bill-history-col--active drug-setup-active-cell"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={d.active}
                              disabled={busyId === d.id || !opdUpdate}
                              aria-label={`${t("active")} ${d.name}`}
                              onChange={(e) => void toggleActive(d, e.target.checked)}
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
                <p className="patient-chart-sub">{selected.specialty || t("general")}</p>
              </div>
              <DialogCloseButton onClick={backToList} />
            </div>
            <div className="btn-row">
              {opdUpdate ? (
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
              {opdDelete && selected.active ? (
                <button
                  type="button"
                  className="btn action danger"
                  disabled={busy}
                  onClick={() => void onDeactivate(selected.id)}
                >
                  {t("deactivate")}
                </button>
              ) : null}
              {opdDelete ? (
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
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="drug-info-fields">
              <div className="drug-info-field">
                <span className="drug-info-label">{t("name")}</span>
                <span className="drug-info-input">{selected.name}</span>
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("specialty")}</span>
                <span className="drug-info-input">{selected.specialty || t("general")}</span>
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("consultationMmk")}</span>
                <span className="drug-info-input">
                  {formatMMK(selected.fees.consultation_mmk)} {t("mmk")}
                </span>
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("otFeeMmk")}</span>
                <span className="drug-info-input">
                  {formatMMK(selected.fees.ot_mmk)} {t("mmk")}
                </span>
              </div>
              <div className="drug-info-field">
                <span className="drug-info-label">{t("active")}</span>
                <span className="drug-info-input">
                  {selected.active ? t("active") : t("inactive")}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {deleteTarget ? (
        <CatalogDeleteDialog
          identity={deleteTarget.name}
          message={
            deleteStep === 1
              ? t("confirmDeleteDoctor").replace("{name}", deleteTarget.name)
              : t("confirmDeleteDoctorFinal").replace("{name}", deleteTarget.name)
          }
          busy={deleteBusy}
          error={deleteError}
          onCancel={closeDeleteConfirm}
          onConfirm={() => void confirmDeleteDoctor()}
        />
      ) : null}
    </section>
  );
}
