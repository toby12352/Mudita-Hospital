import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  createServiceCategory,
  deleteServiceCategory,
  listServiceCategories,
  updateServiceCategory,
  type ServiceCategory,
} from "@/features/settings/masterData";
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import { ApiError, fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";

export function CategoriesTab() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [list, setList] = useState<ServiceCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ServiceCategory | null>(null);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ServiceCategory | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const nameErrorId = useId();

  async function reload(search = q) {
    setList(await listServiceCategories(search.trim()));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listServiceCategories("");
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function startCreate() {
    setEditing(null);
    setName("");
    setNameError(null);
    setError(null);
  }

  function startEdit(c: ServiceCategory) {
    setEditing(c);
    setName(c.name);
    setNameError(null);
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      const body = { name: name.trim() };
      if (editing) {
        await updateServiceCategory(editing.id, body);
      } else {
        await createServiceCategory(body);
      }
      startCreate();
      await reload();
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
    setBusy(true);
    setError(null);
    try {
      await deleteServiceCategory(c.id);
      setPendingDelete(null);
      if (editing?.id === c.id) startCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <form className="card-form" onSubmit={(e) => void submit(e)}>
        <h2 className="section-title">
          {editing ? `${t("editCategory")} #${editing.id}` : t("addCategory")}
        </h2>
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
          {editing ? (
            <button type="button" className="btn action" disabled={busy} onClick={startCreate}>
              {t("cancelEdit")}
            </button>
          ) : null}
        </div>
      </form>

      <div className="card-form">
        <div className="list-toolbar">
          <Typeahead
            label={t("searchCategories")}
            value={q}
            onChange={setQ}
            placeholder={t("categoryNamePlaceholder")}
            loadSuggestions={async (term) => listServiceCategories(term.trim())}
            getKey={(c) => c.id}
            renderOption={(c) => <span className="typeahead-title">{c.name}</span>}
            onPick={(c) => {
              setQ(c.name);
              void reload(c.name).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              );
            }}
            onSubmitWithoutPick={() =>
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              )
            }
          />
          <button
            type="button"
            className="btn action"
            onClick={() =>
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              )
            }
          >
            <ActionIcon name="search" />
            {t("search")}
          </button>
        </div>
        <ul className="data-list">
          {list.length === 0 ? <li className="empty-row">{t("noCategoriesYet")}</li> : null}
          {list.map((c) => (
            <li key={c.id}>
              <div>
                <p className="row-title">{c.name}</p>
              </div>
              <div className="btn-row">
                <button type="button" className="btn action" onClick={() => startEdit(c)} disabled={busy}>
                  <ActionIcon name="edit" />
                  {t("edit")}
                </button>
                <button
                  type="button"
                  className="btn action danger"
                  onClick={() => setPendingDelete(c)}
                  disabled={busy}
                >
                  <ActionIcon name="trash" />
                  {t("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {pendingDelete ? (
        <AlertDialog
          tone="warning"
          title={t("delete")}
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
    </div>
  );
}
