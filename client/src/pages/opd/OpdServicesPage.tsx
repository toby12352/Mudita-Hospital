import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import {
  createService,
  deactivateService,
  deleteService,
  listServiceCategories,
  listServices,
  updateService,
  type Service,
  type ServiceCategory,
} from "@/features/settings/masterData";
import { matchesActive, type ActiveFilterValue } from "@/shared/ActiveFilter";
import { ActionIcon } from "@/shared/ActionIcon";
import { CatalogFilterButton, CatalogFilterPanel } from "@/shared/CatalogListFilter";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { ServiceCategoryField } from "@/shared/ServiceCategoryField";
import { CatalogDeleteDialog } from "./CatalogDeleteDialog";
import { OpdCatalogHistory } from "./OpdCatalogHistory";

export function OpdServicesPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"items" | "history">("items");
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPanelId = useId();
  const [filterQ, setFilterQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilterValue>("all");
  const [list, setList] = useState<Service[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Service | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");

  async function reload(search = filterQ) {
    const data = await listServices(search.trim());
    setList(data);
    return data;
  }

  function runSearch(query: string, status = activeFilter, category = categoryFilter) {
    void reload(query)
      .then((data) => {
        const first = data.find(
          (s) => matchesActive(s.active, status) && matchesCategory(s, category),
        );
        if (first) selectItem(first.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Search failed"));
  }

  function resetFilters() {
    setFilterQ("");
    setActiveFilter("all");
    setCategoryFilter("all");
    runSearch("", "all", "all");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, cats] = await Promise.all([listServices(""), listServiceCategories("")]);
        if (cancelled) return;
        setList(data);
        setCategories(cats);
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
    () => list.filter((s) => matchesActive(s.active, activeFilter) && matchesCategory(s, categoryFilter)),
    [list, activeFilter, categoryFilter],
  );
  const selected = list.find((s) => s.id === selectedId) ?? null;
  const showForm = creating || editing != null;

  function fillForm(s: Service | null) {
    if (!s) {
      setCode("");
      setName("");
      setPrice("0");
      setCategoryId("");
      return;
    }
    setCode(s.code);
    setName(s.name);
    setPrice(String(s.price_mmk));
    setCategoryId(s.category_id != null ? String(s.category_id) : "");
  }

  function openCreate() {
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
    setSelectedId(id);
    setCreating(false);
    setEditing(null);
    fillForm(null);
  }

  function openEdit(s: Service) {
    setCreating(false);
    setEditing(s);
    fillForm(s);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        code: code.trim(),
        name: name.trim(),
        price_mmk: Number(price) || 0,
        active: true,
        category_id: categoryId ? Number(categoryId) : null,
      };
      const saved = editing
        ? await updateService(editing.id, body)
        : await createService({
            code: body.code,
            name: body.name,
            price_mmk: body.price_mmk,
            category_id: body.category_id,
          });
      setFilterQ("");
      setCreating(false);
      setEditing(null);
      fillForm(null);
      const data = await listServices("");
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
      await deactivateService(id);
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

  function openDeleteConfirm(s: Service) {
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
      await deleteService(s.id);
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

  if (mode === "history") {
    return (
      <OpdCatalogHistory
        entity="service"
        title={t("serviceHistory")}
        backLabel={t("serviceSetup")}
        onBack={() => setMode("items")}
      />
    );
  }

  return (
    <section className="drug-setup" aria-label={t("serviceSetup")}>
      <div className="drug-setup-list-pane">
        <div className="drug-setup-title-row">
          <h2 className="drug-setup-title">{t("serviceSetup")}</h2>
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
          onReset={resetFilters}
          category={{
            label: t("category"),
            value: categoryFilter,
            onChange: setCategoryFilter,
            children: (
              <>
                <option value="all">{t("allCategories")}</option>
                <option value="none">{t("uncategorized")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </>
            ),
          }}
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
              aria-selected={s.id === selectedId && !creating && editing == null}
              className={`drug-setup-table-row opd-service-cols${
                s.id === selectedId && !creating && editing == null ? " selected" : ""
              }${!s.active ? " inactive" : ""}`}
              onClick={() => selectItem(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectItem(s.id);
                }
              }}
            >
              <span title={s.code}>{s.code}</span>
              <span title={s.name}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="drug-setup-detail-pane">
        {showForm ? (
          <>
            <div className="drug-setup-title-row">
              <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
                {editing ? `${t("editService")} #${editing.id}` : t("createNewServiceTitle")}
              </h3>
              <button type="button" className="desk-text-link" onClick={closeForm}>
                {t("cancel")}
              </button>
            </div>
            <form
              key={editing ? `edit-${editing.id}` : `create-${createKey}`}
              className="card-form"
              onSubmit={(e) => void submit(e)}
            >
              <div className="field-row">
                <label className="field">
                  <span>{t("code")}</span>
                  <input value={code} onChange={(e) => setCode(e.target.value)} required disabled={busy} />
                </label>
                <label className="field">
                  <span>{t("priceMmk")}</span>
                  <input
                    type="number"
                    min={0}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    disabled={busy}
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
              <ServiceCategoryField
                value={categoryId}
                categories={categories}
                onChange={setCategoryId}
                disabled={busy}
              />
              {error ? <p className="form-error">{error}</p> : null}
              <div className="btn-row">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? t("saving") : editing ? t("updateService") : t("addService")}
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
                    <span>{selected.code}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("name")}</span>
                    <span>{selected.name}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("category")}</span>
                    <span>{selected.category_name || t("uncategorized")}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("priceMmk")}</span>
                    <span>
                      {formatMMK(selected.price_mmk)} {t("mmk")}
                    </span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("active")}</span>
                    <span>{selected.active ? t("active") : t("inactive")}</span>
                  </div>
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
                  {selected.active ? (
                    <button
                      type="button"
                      className="btn action danger"
                      disabled={busy}
                      onClick={() => void onDeactivate(selected.id)}
                    >
                      {t("deactivate")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn action danger"
                    disabled={busy || deleteBusy}
                    onClick={() => openDeleteConfirm(selected)}
                  >
                    <ActionIcon name="trash" />
                    {t("delete")}
                  </button>
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
          identity={`${deleteTarget.code} · ${deleteTarget.name}`}
          message={
            deleteStep === 1
              ? t("confirmDeleteService").replace(
                  "{name}",
                  `${deleteTarget.code} — ${deleteTarget.name}`,
                )
              : t("confirmDeleteServiceFinal").replace(
                  "{name}",
                  `${deleteTarget.code} — ${deleteTarget.name}`,
                )
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

function matchesCategory(service: Service, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "none") return service.category_id == null;
  return String(service.category_id) === filter;
}
