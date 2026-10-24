import { FormEvent, useEffect, useState } from "react";
import {
  createDoctor,
  deactivateDoctor,
  listDoctors,
  updateDoctor,
  type Doctor,
} from "@/features/settings/masterData";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { OpdCatalogHistory } from "./OpdCatalogHistory";

export function OpdDoctorsPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"items" | "history">("items");
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterQ, setFilterQ] = useState("");
  const [list, setList] = useState<Doctor[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [consult, setConsult] = useState("0");
  const [ot, setOt] = useState("0");

  async function reload(search = filterQ) {
    const data = await listDoctors(search.trim());
    setList(data);
    return data;
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

  const selected = list.find((d) => d.id === selectedId) ?? null;
  const showForm = creating || editing != null;

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

  function openEdit(d: Doctor) {
    setCreating(false);
    setEditing(d);
    fillForm(d);
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

  if (mode === "history") {
    return (
      <OpdCatalogHistory
        entity="doctor"
        title={t("doctorHistory")}
        backLabel={t("doctorSetup")}
        onBack={() => setMode("items")}
      />
    );
  }

  return (
    <section className="drug-setup" aria-label={t("doctorSetup")}>
      <div className="drug-setup-list-pane">
        <div className="drug-setup-title-row">
          <h2 className="drug-setup-title">{t("doctorSetup")}</h2>
          <div className="tabs">
            <button
              type="button"
              className={`tab${creating ? " active" : ""}`}
              onClick={openCreate}
            >
              {t("newBadge")}
            </button>
            <button
              type="button"
              className={`tab${filterOpen ? " active" : ""}`}
              onClick={() => setFilterOpen((v) => !v)}
            >
              {t("filter")}
            </button>
            <button type="button" className="tab" onClick={() => setMode("history")}>
              {t("catalogHistoryLink")}
            </button>
          </div>
        </div>
        <p className="drug-setup-selected" aria-hidden="true" />
        {filterOpen ? (
          <div className="drug-setup-filter">
            <input
              className="drug-info-input"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              placeholder={t("doctorPlaceholder")}
              aria-label={t("filter")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void reload(filterQ)
                    .then((data) => {
                      if (data[0]) selectItem(data[0].id);
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : "Search failed"));
                }
              }}
            />
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                void reload(filterQ)
                  .then((data) => {
                    if (data[0]) selectItem(data[0].id);
                  })
                  .catch((err) => setError(err instanceof Error ? err.message : "Search failed"))
              }
            >
              {t("search")}
            </button>
          </div>
        ) : null}
        {error && !showForm ? <p className="form-error">{error}</p> : null}
        <div className="drug-setup-table" role="listbox" aria-label={t("maintenanceDoctors")}>
          <div className="drug-setup-table-head opd-master-cols">
            <span>{t("name")}</span>
            <span>{t("specialty")}</span>
          </div>
          {list.length === 0 ? <p className="empty-row">{t("noDoctorsYet")}</p> : null}
          {list.map((d) => (
            <div
              key={d.id}
              role="option"
              tabIndex={0}
              aria-selected={d.id === selectedId && !creating && editing == null}
              className={`drug-setup-table-row opd-master-cols${
                d.id === selectedId && !creating && editing == null ? " selected" : ""
              }${!d.active ? " inactive" : ""}`}
              onClick={() => selectItem(d.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectItem(d.id);
                }
              }}
            >
              <span>{d.name}</span>
              <span>{d.specialty || t("general")}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="drug-setup-detail-pane">
        {showForm ? (
          <>
            <div className="drug-setup-title-row">
              <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
                {editing ? `${t("editDoctor")} #${editing.id}` : t("createNewDoctorTitle")}
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
                <div className="btn-row drug-setup-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => openEdit(selected)}
                  >
                    {t("edit")}
                  </button>
                  {selected.active ? (
                    <button
                      type="button"
                      className="btn ghost danger"
                      disabled={busy}
                      onClick={() => void onDeactivate(selected.id)}
                    >
                      {t("deactivate")}
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
    </section>
  );
}
