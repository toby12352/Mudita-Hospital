import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  createExpenseService,
  deactivateExpenseService,
  deleteExpenseService,
  listExpenseServices,
  updateExpenseService,
  type ExpenseService,
} from "@/features/expenses/api";
import { CatalogDeleteDialog } from "@/pages/opd/CatalogDeleteDialog";
import { ActionIcon } from "@/shared/ActionIcon";
import { fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { formatMMK } from "@/shared/format";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";

function parseCatalogPrice(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0) return "invalid";
  return n;
}

function serviceLabel(s: ExpenseService): string {
  return s.code ? `${s.code} — ${s.name}` : s.name;
}

export function ExpensesTab() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [list, setList] = useState<ExpenseService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ExpenseService | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const codeInputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const codeErrorId = useId();
  const [deleteTarget, setDeleteTarget] = useState<ExpenseService | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload(search = q) {
    setList(await listExpenseServices(search.trim()));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listExpenseServices("");
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
    setCode("");
    setName("");
    setPrice("");
  }

  function startEdit(s: ExpenseService) {
    setEditing(s);
    setCode(s.code);
    setName(s.name);
    setPrice(s.price_mmk == null ? "" : String(s.price_mmk));
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
      if (editing) {
        await updateExpenseService(editing.id, body);
      } else {
        await createExpenseService({
          code: body.code,
          name: body.name,
          price_mmk: body.price_mmk,
        });
      }
      startCreate();
      await reload();
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

  async function onDeactivate(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deactivateExpenseService(id);
      if (editing?.id === id) startCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  function openDeleteConfirm(s: ExpenseService) {
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
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteExpenseService(s.id);
      setDeleteTarget(null);
      setDeleteStep(1);
      if (editing?.id === s.id) startCreate();
      await reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <form className="card-form" onSubmit={(e) => void submit(e)}>
        <h2 className="section-title">
          {editing ? `${t("editExpense")} #${editing.id}` : t("addExpense")}
        </h2>
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
          <span>{t("name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
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
        {error ? (
          <p ref={formErrorRef} className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t("saving") : editing ? t("updateExpense") : t("addExpense")}
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
            label={t("searchExpenses")}
            value={q}
            onChange={setQ}
            placeholder={t("codeOrName")}
            loadSuggestions={async (term) => listExpenseServices(term.trim())}
            getKey={(s) => s.id}
            renderOption={(s) => (
              <>
                <span className="typeahead-title">
                  {s.code ? `${s.code} — ${s.name}` : s.name}
                  {!s.active ? ` ${t("inactive")}` : ""}
                </span>
                <span className="typeahead-sub">
                  {s.price_mmk == null ? t("none") : `${formatMMK(s.price_mmk)} ${t("mmk")}`}
                </span>
              </>
            )}
            optionClassName={(s) => (!s.active ? "inactive" : "")}
            onPick={(s) => {
              setQ(s.name);
              void reload(s.name).catch((err) =>
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
          {list.length === 0 ? <li className="empty-row">{t("noExpensesYet")}</li> : null}
          {list.map((s) => (
            <li key={s.id} className={!s.active ? "inactive" : undefined}>
              <div>
                <p className="row-title">
                  {s.name}
                  {!s.active ? ` ${t("inactive")}` : ""}
                </p>
                <p className="row-sub">
                  {s.code || "—"} ·{" "}
                  {s.price_mmk == null ? t("none") : `${formatMMK(s.price_mmk)} ${t("mmk")}`}
                </p>
              </div>
              <div className="btn-row">
                <button type="button" className="btn action" onClick={() => startEdit(s)} disabled={busy}>
                  <ActionIcon name="edit" />
                  {t("edit")}
                </button>
                {s.active ? (
                  <button
                    type="button"
                    className="btn action danger"
                    onClick={() => void onDeactivate(s.id)}
                    disabled={busy}
                  >
                    {t("deactivate")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn action danger"
                  disabled={busy || deleteBusy}
                  onClick={() => openDeleteConfirm(s)}
                >
                  <ActionIcon name="trash" />
                  {t("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
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
    </div>
  );
}
