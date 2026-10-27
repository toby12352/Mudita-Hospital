import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import {
  createOtMasterService,
  deactivateOtMasterService,
  deleteOtMasterService,
  listOtMasterServices,
  updateOtMasterService,
  type OtMasterService,
} from "@/features/ot/api";
import { useClinicActions } from "@/app/clinicActions";
import { matchesActive, type ActiveFilterValue } from "@/shared/ActiveFilter";
import { ActionIcon } from "@/shared/ActionIcon";
import { CatalogFilterButton, CatalogFilterPanel } from "@/shared/CatalogListFilter";
import { sortByDateAscDesc, type DateSortValue } from "@/shared/DateSort";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { CatalogDeleteDialog } from "@/pages/opd/CatalogDeleteDialog";
import { OtCatalogHistory } from "./OtCatalogHistory";

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

export function OtServicesPage() {
  const { t } = useI18n();
  const { otUpdate, otDelete } = useClinicActions();
  const [mode, setMode] = useState<"items" | "history">("items");
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPanelId = useId();
  const [filterQ, setFilterQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilterValue>("all");
  const [dateSort, setDateSort] = useState<DateSortValue>("desc");
  const [list, setList] = useState<OtMasterService[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<OtMasterService | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OtMasterService | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  async function reload(search = filterQ) {
    const data = await listOtMasterServices(search.trim());
    setList(data);
    return data;
  }

  function runSearch(query: string, status = activeFilter) {
    void reload(query)
      .then((data) => {
        const first = data.find((s) => matchesActive(s.active, status));
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
        const data = await listOtMasterServices("");
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
  }, []);

  const filtered = useMemo(
    () =>
      sortByDateAscDesc(
        list.filter((s) => matchesActive(s.active, activeFilter)),
        dateSort,
        (s) => s.created_at,
        (s) => s.id,
      ),
    [list, activeFilter, dateSort],
  );
  const selected = list.find((s) => s.id === selectedId) ?? null;
  const showForm = otUpdate && (creating || editing != null);

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

  function openCreate() {
    if (!otUpdate) return;
    setMode("items");
    setEditing(null);
    fillForm(null);
    setCreating(true);
    setCreateKey((n) => n + 1);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    fillForm(null);
  }

  function selectItem(id: number) {
    setMode("items");
    setSelectedId(id);
    setCreating(false);
    setEditing(null);
    fillForm(null);
  }

  function openEdit(s: OtMasterService) {
    if (!otUpdate) return;
    setMode("items");
    setCreating(false);
    setEditing(s);
    fillForm(s);
  }

  function toggleHistory() {
    if (mode === "history") {
      setMode("items");
      return;
    }
    closeForm();
    setMode("history");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const priceMmk = parseCatalogPrice(price);
    if (priceMmk === "invalid") {
      setError(t("servicePriceInvalid"));
      return;
    }
    setBusy(true);
    setError(null);
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
      setFilterQ("");
      setCreating(false);
      setEditing(null);
      fillForm(null);
      const data = await listOtMasterServices("");
      setList(data);
      setSelectedId(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivate(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deactivateOtMasterService(id);
      if (editing?.id === id) closeForm();
      const data = await reload();
      if (selectedId === id) {
        const next = data.find((s) => s.id === id) ?? data[0] ?? null;
        setSelectedId(next?.id ?? null);
      }
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
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteOtMasterService(s.id);
      setDeleteTarget(null);
      setDeleteStep(1);
      if (editing?.id === s.id) closeForm();
      const data = await reload();
      if (selectedId === s.id) {
        setSelectedId(data[0]?.id ?? null);
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className="drug-setup" aria-label={t("serviceSetup")}>
      <div className="drug-setup-list-pane">
        <div className="drug-setup-heading">
          <h2 className="drug-setup-title">{t("serviceSetup")}</h2>
          <div className="tabs">
            {otUpdate ? (
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
          queryPlaceholder={t("codeOrName")}
          searchLabel={t("searchServices")}
          onSearch={() => runSearch(filterQ)}
          active={activeFilter}
          onActiveChange={setActiveFilter}
          dateSort={dateSort}
          onDateSortChange={setDateSort}
          onReset={resetFilters}
        />
        {error && !showForm ? <p className="form-error">{error}</p> : null}
        <div className="drug-setup-table" role="listbox" aria-label={t("maintenanceServices")}>
          <div className="drug-setup-table-head opd-service-cols">
            <span title={t("code")}>{t("code")}</span>
            <span title={t("name")}>{t("name")}</span>
          </div>
          {filtered.length === 0 ? <p className="empty-row">{t("noServicesYet")}</p> : null}
          {filtered.map((s) => (
            <div
              key={s.id}
              role="option"
              tabIndex={0}
              aria-selected={
                s.id === selectedId && mode === "items" && !creating && editing == null
              }
              className={`drug-setup-table-row opd-service-cols${
                s.id === selectedId && mode === "items" && !creating && editing == null
                  ? " selected"
                  : ""
              }${!s.active ? " inactive" : ""}`}
              onClick={() => selectItem(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectItem(s.id);
                }
              }}
            >
              <span title={s.code}>{s.code || "—"}</span>
              <span title={s.name}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="drug-setup-detail-pane">
        {mode === "history" ? (
          <OtCatalogHistory title={t("serviceHistory")} />
        ) : showForm ? (
          <>
            <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
              {editing ? `${t("editService")} #${editing.id}` : t("createNewServiceTitle")}
            </h3>
            <form
              key={editing ? `edit-${editing.id}` : `create-${createKey}`}
              className="card-form"
              onSubmit={(e) => void submit(e)}
            >
              <div className="field-row">
                <label className="field">
                  <span>{t("code")}</span>
                  <input value={code} onChange={(e) => setCode(e.target.value)} disabled={busy} />
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
              {error ? <p className="form-error">{error}</p> : null}
              <div className="btn-row">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? t("saving") : editing ? t("updateService") : t("addService")}
                </button>
                <button type="button" className="btn ghost" onClick={closeForm} disabled={busy}>
                  {t("cancel")}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
              {t("serviceInfo")}
            </h3>
            {selected ? (
              <>
                <div className="drug-info-fields">
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("code")}</span>
                    <span>{selected.code || "—"}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("name")}</span>
                    <span>{selected.name}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("priceMmk")}</span>
                    <span>
                      {selected.price_mmk == null
                        ? t("none")
                        : `${formatMMK(selected.price_mmk)} ${t("mmk")}`}
                    </span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("active")}</span>
                    <span>{selected.active ? t("active") : t("inactive")}</span>
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
              </>
            ) : (
              <p className="hint">{t("noServicesYet")}</p>
            )}
          </>
        )}
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
