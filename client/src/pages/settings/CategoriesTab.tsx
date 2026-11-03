import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  createServiceCategory,
  deleteServiceCategory,
  listServiceCategories,
  updateServiceCategory,
  type ServiceCategory,
} from "@/features/settings/masterData";
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import {
  BillHistoryToolbar,
  type BillHistoryQuery,
  type BillHistoryStatusOption,
} from "@/shared/BillHistoryToolbar";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { sortByDateAscDesc } from "@/shared/DateSort";
import { ApiError, fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { useI18n } from "@/shared/i18n";

function emptyListQuery(): BillHistoryQuery {
  return { q: "", money: "", category: "", unit: "", from: "", to: "", sort: "desc", order: "date" };
}

export function CategoriesTab({
  onBrowseChange,
}: {
  onBrowseChange?: (browsing: boolean) => void;
} = {}) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [listQuery, setListQuery] = useState<BillHistoryQuery>(emptyListQuery);
  const [list, setList] = useState<ServiceCategory[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ServiceCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ServiceCategory | null>(null);
  const [name, setName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const returnListFocusIdRef = useRef<number | null>(null);
  const nameErrorId = useId();
  const formTitleId = useId();

  const showForm = creating || editing != null;
  const showBrowse = !showForm && selectedId == null;
  const showList = showBrowse;
  const selected = list.find((c) => c.id === selectedId) ?? null;
  const showDetail = !showForm && selected != null;

  const statusOptions = useMemo((): BillHistoryStatusOption[] => {
    return [{ value: "", label: t("all") }];
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
      const data = await listServiceCategories(search.trim());
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
        const data = await listServiceCategories("");
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
      if (pendingDelete) return;
      if (showForm) {
        e.preventDefault();
        closeForm();
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
  }, [showForm, selectedId, pendingDelete]);

  const filtered = useMemo(() => {
    return sortByDateAscDesc(
      list,
      listQuery.sort,
      (c) => c.created_at ?? "",
      (c) => c.id,
    );
  }, [list, listQuery.sort]);

  function fillForm(c: ServiceCategory | null) {
    setName(c ? c.name : "");
  }

  function selectItem(id: number) {
    rememberOpener();
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
    fillForm(null);
    setError(null);
  }

  function openCreate() {
    rememberOpener();
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

  function openEdit(c: ServiceCategory) {
    rememberOpener();
    setCreating(false);
    setEditing(c);
    fillForm(c);
    setError(null);
    setNameError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      const body = { name: name.trim() };
      const saved = editing
        ? await updateServiceCategory(editing.id, body)
        : await createServiceCategory(body);
      setListQuery(emptyListQuery());
      setCreating(false);
      setEditing(null);
      fillForm(null);
      const data = await listServiceCategories("");
      setList(data);
      setSelectedId(saved.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (fieldKeyForApiError(err) === "name") {
        const duplicate =
          err instanceof ApiError &&
          err.raw.trim().toLowerCase() === "category name already exists";
        setNameError(duplicate ? t("errCategoryNameExists") : msg);
        window.setTimeout(() => revealField(nameInputRef.current), 0);
      } else {
        setError(msg);
        window.setTimeout(() => revealField(formErrorRef.current), 0);
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const c = pendingDelete;
    if (!c) return;
    const prevIdx = filtered.findIndex((row) => row.id === c.id);
    const preferId = filtered[prevIdx + 1]?.id ?? filtered[prevIdx - 1]?.id ?? null;
    setBusy(true);
    setError(null);
    try {
      await deleteServiceCategory(c.id);
      setPendingDelete(null);
      if (editing?.id === c.id) {
        setCreating(false);
        setEditing(null);
        fillForm(null);
      }
      const data = await reload();
      setSelectedId(null);
      returnListFocusIdRef.current =
        preferId != null && data.some((row) => row.id === preferId) ? preferId : data[0]?.id ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      const inUse =
        err instanceof ApiError && err.raw.trim().toLowerCase() === "category still in use";
      setError(inUse ? t("errCategoryInUse") : msg);
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="opd-bill-desk opd-bill-desk--history" aria-label={t("categories")}>
      <div className="opd-bill-desk-main">
        {showForm ? (
          <div className="catalog-master-form-page">
            <div className="patient-chart-title-row">
              <h2 id={formTitleId} className="opd-bill-desk-title">
                {editing ? `${t("editCategory")} #${editing.id}` : t("createNewCategoryTitle")}
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
                  placeholder={t("categoryNamePlaceholder")}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? nameErrorId : undefined}
                />
                <FieldError id={nameErrorId}>{nameError}</FieldError>
              </label>
              {error ? (
                <p ref={formErrorRef} className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="btn-row">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? t("saving") : editing ? t("updateCategory") : t("addCategory")}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {showBrowse ? (
          <>
            <h2 className="opd-bill-desk-title">{t("categories")}</h2>
            <BillHistoryToolbar
              key="settings-categories"
              searchPlaceholder={t("categoryNamePlaceholder")}
              initialRange="all"
              statusOptions={statusOptions}
              statusFieldLabel={t("status")}
              explicitSearch
              hideDateRange
              onSearch={runListSearch}
              onInvalidRange={() => setError(t("billHistoryInvalidRange"))}
              trailing={
                <button type="button" className="btn action primary" onClick={openCreate}>
                  <ActionIcon name="plus" />
                  {t("createNewCategoryTitle")}
                </button>
              }
            />
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="bill-history-table-wrap" role="region" aria-label={t("categories")}>
              <div
                className="bill-history-table-head bill-history-table-head--categories"
                role="row"
              >
                <span className="bill-history-col bill-history-col--no" role="columnheader">
                  {t("listNo")}
                </span>
                <span className="bill-history-col bill-history-col--name" role="columnheader">
                  {t("name")}
                </span>
              </div>
              {listLoading ? <p className="hint bill-history-table-msg">{t("loading")}</p> : null}
              {!listLoading && filtered.length === 0 ? (
                <p className="hint bill-history-table-msg empty-row">{t("noCategoriesYet")}</p>
              ) : null}
              <ul className="bill-history-table-body">
                {filtered.map((c, index) => (
                  <li key={c.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      data-item-row={c.id}
                      aria-label={c.name}
                      className="bill-history-table-row bill-history-table-row--categories bill-history-table-row--clickable"
                      onClick={() => selectItem(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectItem(c.id);
                        }
                      }}
                    >
                      <span className="bill-history-col bill-history-col--no">{index + 1}</span>
                      <span className="bill-history-col bill-history-col--name" title={c.name}>
                        <span className="bill-history-name-primary">{c.name}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        {showDetail && selected ? (
          <div className="catalog-master-detail-page">
            <div className="patient-chart-title-row">
              <div className="patient-chart-title-block">
                <h2 ref={detailTitleRef} tabIndex={-1} className="opd-bill-desk-title">
                  {selected.name}
                </h2>
              </div>
              <DialogCloseButton onClick={backToList} />
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn action"
                disabled={busy}
                onClick={() => openEdit(selected)}
              >
                <ActionIcon name="edit" />
                {t("edit")}
              </button>
              <button
                type="button"
                className="btn action danger"
                disabled={busy}
                onClick={() => setPendingDelete(selected)}
              >
                <ActionIcon name="trash" />
                {t("delete")}
              </button>
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
            </div>
          </div>
        ) : null}
      </div>

      {pendingDelete ? (
        <AlertDialog
          tone="warning"
          icon="trash"
          title={t("delete")}
          identity={pendingDelete.name}
          message={t("confirmDeleteCategory").replace("{name}", pendingDelete.name)}
          busy={busy}
          danger
          confirmLabel={t("delete")}
          onClose={() => {
            if (!busy) setPendingDelete(null);
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </section>
  );
}
