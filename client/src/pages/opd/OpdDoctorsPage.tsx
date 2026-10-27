import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import {
  createDoctor,
  deactivateDoctor,
  deleteDoctor,
  listDoctors,
  updateDoctor,
  type Doctor,
} from "@/features/settings/masterData";
import { useClinicActions } from "@/app/clinicActions";
import { matchesActive, type ActiveFilterValue } from "@/shared/ActiveFilter";
import { ActionIcon } from "@/shared/ActionIcon";
import { CatalogFilterButton, CatalogFilterPanel } from "@/shared/CatalogListFilter";
import { sortByDateAscDesc, type DateSortValue } from "@/shared/DateSort";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { CatalogDeleteDialog } from "./CatalogDeleteDialog";
import { OpdCatalogHistory } from "./OpdCatalogHistory";

export function OpdDoctorsPage() {
  const { t } = useI18n();
  const { opdUpdate, opdDelete } = useClinicActions();
  const [mode, setMode] = useState<"items" | "history">("items");
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPanelId = useId();
  const [filterQ, setFilterQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilterValue>("all");
  const [dateSort, setDateSort] = useState<DateSortValue>("desc");
  const [list, setList] = useState<Doctor[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [consult, setConsult] = useState("0");
  const [ot, setOt] = useState("0");

  async function reload(search = filterQ) {
    const data = await listDoctors(search.trim());
    setList(data);
    return data;
  }

  function runSearch(query: string, status = activeFilter) {
    void reload(query)
      .then((data) => {
        const first = data.find((d) => matchesActive(d.active, status));
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
        const data = await listDoctors("");
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
        list.filter((d) => matchesActive(d.active, activeFilter)),
        dateSort,
        (d) => d.created_at,
        (d) => d.id,
      ),
    [list, activeFilter, dateSort],
  );
  const selected = list.find((d) => d.id === selectedId) ?? null;
  const showForm = opdUpdate && (creating || editing != null);

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

  function openCreate() {
    if (!opdUpdate) return;
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

  function openEdit(d: Doctor) {
    if (!opdUpdate) return;
    setMode("items");
    setCreating(false);
    setEditing(d);
    fillForm(d);
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
    setBusy(true);
    setError(null);
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
      setFilterQ("");
      setCreating(false);
      setEditing(null);
      fillForm(null);
      const data = await listDoctors("");
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
      await deactivateDoctor(id);
      if (editing?.id === id) closeForm();
      const data = await reload();
      if (selectedId === id) {
        const next = data.find((d) => d.id === id) ?? data[0] ?? null;
        setSelectedId(next?.id ?? null);
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
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteDoctor(d.id);
      setDeleteTarget(null);
      setDeleteStep(1);
      if (editing?.id === d.id) closeForm();
      const data = await reload();
      if (selectedId === d.id) {
        setSelectedId(data[0]?.id ?? null);
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className="drug-setup" aria-label={t("doctorSetup")}>
      <div className="drug-setup-list-pane">
        <div className="drug-setup-heading">
          <h2 className="drug-setup-title">{t("doctorSetup")}</h2>
          <div className="tabs">
            {opdUpdate ? (
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
          queryPlaceholder={t("doctorPlaceholder")}
          searchLabel={t("searchDoctors")}
          onSearch={() => runSearch(filterQ)}
          active={activeFilter}
          onActiveChange={setActiveFilter}
          dateSort={dateSort}
          onDateSortChange={setDateSort}
          onReset={resetFilters}
        />
        {error && !showForm ? <p className="form-error">{error}</p> : null}
        <div className="drug-setup-table" role="listbox" aria-label={t("maintenanceDoctors")}>
          <div className="drug-setup-table-head opd-master-cols">
            <span title={t("name")}>{t("name")}</span>
            <span title={t("specialty")}>{t("specialty")}</span>
          </div>
          {filtered.length === 0 ? <p className="empty-row">{t("noDoctorsYet")}</p> : null}
          {filtered.map((d) => (
            <div
              key={d.id}
              role="option"
              tabIndex={0}
              aria-selected={
                d.id === selectedId && mode === "items" && !creating && editing == null
              }
              className={`drug-setup-table-row opd-master-cols${
                d.id === selectedId && mode === "items" && !creating && editing == null
                  ? " selected"
                  : ""
              }${!d.active ? " inactive" : ""}`}
              onClick={() => selectItem(d.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectItem(d.id);
                }
              }}
            >
              <span title={d.name}>{d.name}</span>
              <span title={d.specialty || t("general")}>{d.specialty || t("general")}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="drug-setup-detail-pane">
        {mode === "history" ? (
          <OpdCatalogHistory entity="doctor" title={t("doctorHistory")} />
        ) : showForm ? (
          <>
            <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
              {editing ? `${t("editDoctor")} #${editing.id}` : t("createNewDoctorTitle")}
            </h3>
            <form
              key={editing ? `edit-${editing.id}` : `create-${createKey}`}
              className="card-form"
              onSubmit={(e) => void submit(e)}
            >
              <label className="field">
                <span>{t("name")}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
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
              {error ? <p className="form-error">{error}</p> : null}
              <div className="btn-row">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? t("saving") : editing ? t("updateDoctor") : t("addDoctor")}
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
              {t("doctorInfo")}
            </h3>
            {selected ? (
              <>
                <div className="drug-info-fields">
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("name")}</span>
                    <span>{selected.name}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("specialty")}</span>
                    <span>{selected.specialty || t("general")}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("consultationMmk")}</span>
                    <span>
                      {formatMMK(selected.fees.consultation_mmk)} {t("mmk")}
                    </span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("otFeeMmk")}</span>
                    <span>
                      {formatMMK(selected.fees.ot_mmk)} {t("mmk")}
                    </span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("active")}</span>
                    <span>{selected.active ? t("active") : t("inactive")}</span>
                  </div>
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
              </>
            ) : (
              <p className="hint">{t("noDoctorsYet")}</p>
            )}
          </>
        )}
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
