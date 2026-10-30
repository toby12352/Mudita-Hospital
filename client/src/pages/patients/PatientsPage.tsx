import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  attachPatientBill,
  createPatient,
  deletePatient,
  fetchPatientHistory,
  listPatients,
  printPatientHistoryBill,
  updatePatient,
  type PatientChart,
  type PatientHistory,
  type PatientHistoryBillKind,
  type PatientWrite,
} from "@/features/patients/api";
import { useClinicActions } from "@/app/clinicActions";
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import {
  CatalogDateSortField,
  CatalogFilterButton,
  CatalogFilterPanel,
} from "@/shared/CatalogListFilter";
import {
  BillHistoryTable,
  type BillHistoryTableRow,
} from "@/shared/BillHistoryTable";
import { DatePicker, formatDateDisplay } from "@/shared/DatePicker";
import { sortByDateAscDesc, type DateSortValue } from "@/shared/DateSort";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { FormSection } from "@/shared/FormSection";
import { useI18n } from "@/shared/i18n";

type HistoryRow = BillHistoryTableRow & {
  print?: { kind: PatientHistoryBillKind; billId: number; title: string };
};

type HistoryKindFilter = "all" | "ipd" | "opd" | "lab" | "ot" | "pharmacy" | "addBill";

type DetailTab = "info" | "history";

const HISTORY_KIND_OPTIONS: HistoryKindFilter[] = ["all", "ipd", "opd", "lab", "ot", "pharmacy"];

const emptyHistory: PatientHistory = { opd: [], lab: [], pharmacy: [], ot: [], ipd: [] };

function ageValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function chartBody(
  name: string,
  phone: string,
  age: string,
  gender: string,
  dateOfBirth: string,
  nrc: string,
  fatherMotherName: string,
  notes: string,
): PatientWrite {
  return {
    name: name.trim(),
    phone: phone.trim(),
    age_years: ageValue(age),
    gender: gender.trim(),
    date_of_birth: dateOfBirth.trim(),
    nrc: nrc.trim(),
    father_mother_name: fatherMotherName.trim(),
    notes: notes.trim(),
  };
}

function historyIsEmpty(h: PatientHistory): boolean {
  return h.opd.length === 0 && h.pharmacy.length === 0 && h.ot.length === 0 && h.ipd.length === 0;
}

export function PatientsPage({
  startCreate = false,
  focusId,
  onViewList,
}: {
  startCreate?: boolean;
  focusId?: number;
  onViewList?: (id?: number) => void;
} = {}) {
  const { t } = useI18n();
  const { patientsCreate, patientsUpdate, patientsDelete } = useClinicActions();
  const [creating, setCreating] = useState(() => startCreate && patientsCreate);
  const [editing, setEditing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPanelId = useId();
  const historyKindsLabelId = useId();
  const historySortLabelId = useId();
  const historySortId = useId();
  const [filterQ, setFilterQ] = useState("");
  const [dateSort, setDateSort] = useState<DateSortValue>("desc");
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [historyKind, setHistoryKind] = useState<HistoryKindFilter>("all");
  const [historyDateSort, setHistoryDateSort] = useState<DateSortValue>("desc");
  const [list, setList] = useState<PatientChart[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(focusId ?? null);
  const [createdPatient, setCreatedPatient] = useState<PatientChart | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nrc, setNrc] = useState("");
  const [fatherMotherName, setFatherMotherName] = useState("");
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState<PatientHistory>(emptyHistory);
  const [historyReady, setHistoryReady] = useState(false);
  const [billNo, setBillNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const nameErrorId = useId();
  const [printingKey, setPrintingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PatientChart | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload(search = filterQ) {
    const data = await listPatients(search.trim());
    setList(data);
    return data;
  }

  function runSearch(query: string) {
    void reload(query)
      .then((data) => {
        if (data[0]) selectItem(data[0].id);
        else setSelectedId(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Search failed"));
  }

  function resetFilters() {
    setFilterQ("");
    setDateSort("desc");
    runSearch("");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listPatients("");
        if (cancelled) return;
        setList(data);
        if (creating) return;
        if (focusId != null && data.some((p) => p.id === focusId)) {
          setSelectedId(focusId);
        } else if (data.length > 0 && selectedId == null) {
          setSelectedId(data[0].id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load
  }, []);

  useEffect(() => {
    if (selectedId == null || creating || editing) {
      if (creating || editing) return;
      setHistory(emptyHistory);
      setHistoryReady(false);
      return;
    }
    setHistoryReady(false);
    let cancelled = false;
    (async () => {
      try {
        const h = await fetchPatientHistory(selectedId);
        if (!cancelled) {
          setHistory(h);
          setHistoryReady(true);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setHistory(emptyHistory);
          setHistoryReady(false);
          setError(e instanceof Error ? e.message : "Load failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, creating, editing]);

  const sortedList = useMemo(
    () => sortByDateAscDesc(list, dateSort, (p) => p.updated_at, (p) => p.id),
    [list, dateSort],
  );
  const sortedOpd = useMemo(
    () => sortByDateAscDesc(history.opd, historyDateSort, (row) => row.created_at, (row) => row.id),
    [history.opd, historyDateSort],
  );
  const sortedLab = useMemo(
    () => sortByDateAscDesc(history.lab, historyDateSort, (row) => row.created_at, (row) => row.id),
    [history.lab, historyDateSort],
  );
  const sortedPharmacy = useMemo(
    () =>
      sortByDateAscDesc(
        history.pharmacy,
        historyDateSort,
        (row) => row.created_at,
        (row) => row.id,
      ),
    [history.pharmacy, historyDateSort],
  );
  const sortedOt = useMemo(
    () =>
      sortByDateAscDesc(
        history.ot,
        historyDateSort,
        (row) => row.created_at,
        (row) => row.bill_id ?? 0,
      ),
    [history.ot, historyDateSort],
  );
  const sortedIpd = useMemo(
    () =>
      sortByDateAscDesc(history.ipd, historyDateSort, (row) => row.admitted_at, () => 0),
    [history.ipd, historyDateSort],
  );
  const selected = list.find((p) => p.id === selectedId) ?? null;
  const showForm = (creating && patientsCreate) || (editing && patientsUpdate);
  const genderKnown = gender === "" || gender === "M" || gender === "F" || gender === "Other";

  function fillForm(p: PatientChart | null) {
    if (!p) {
      setName("");
      setPhone("");
      setAge("");
      setGender("");
      setDateOfBirth("");
      setNrc("");
      setFatherMotherName("");
      setNotes("");
      return;
    }
    setName(p.name);
    setPhone(p.phone);
    setAge(p.age_years != null ? String(p.age_years) : "");
    setGender(p.gender);
    setDateOfBirth(p.date_of_birth || "");
    setNrc(p.nrc || "");
    setFatherMotherName(p.father_mother_name || "");
    setNotes(p.notes);
  }

  function closeForm() {
    setCreating(false);
    setEditing(false);
    fillForm(null);
    setError(null);
  }

  function leaveCreatePage() {
    setCreatedPatient(null);
    if (onViewList) {
      onViewList();
      return;
    }
    closeForm();
  }

  function selectItem(id: number) {
    setSelectedId(id);
    setCreating(false);
    setEditing(false);
    fillForm(null);
    setHistory(emptyHistory);
    setHistoryReady(false);
    setBillNo("");
    setHistoryKind("all");
    setError(null);
  }

  function openEdit(p: PatientChart) {
    if (!patientsUpdate) return;
    setCreating(false);
    setEditing(true);
    fillForm(p);
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      const body = chartBody(name, phone, age, gender, dateOfBirth, nrc, fatherMotherName, notes);
      if (editing && selectedId != null) {
        const saved = await updatePatient(selectedId, body);
        setFilterQ("");
        setCreating(false);
        setEditing(false);
        fillForm(null);
        const data = await listPatients("");
        setList(data);
        setSelectedId(saved.id);
        setHistory(await fetchPatientHistory(saved.id));
      } else {
        const saved = await createPatient(body);
        setCreatedPatient(saved);
      }
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

  function viewCreatedPatientList() {
    const id = createdPatient?.id;
    setCreatedPatient(null);
    if (id == null) return;
    if (onViewList) {
      onViewList(id);
      return;
    }
    setFilterQ("");
    setCreating(false);
    setEditing(false);
    fillForm(null);
    void listPatients("")
      .then(async (data) => {
        setList(data);
        setSelectedId(id);
        setHistory(await fetchPatientHistory(id));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }

  async function attachBill() {
    if (selectedId == null) return;
    const bill = billNo.trim();
    if (!bill) {
      setError(t("errBillNoRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await attachPatientBill(selectedId, bill);
      setBillNo("");
      setHistory(await fetchPatientHistory(selectedId));
      setHistoryKind("all");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function printHistoryRow(row: HistoryRow) {
    if (selectedId == null || !row.print) return;
    const printKey = row.key ?? String(row.id);
    setPrintingKey(printKey);
    setError(null);
    try {
      await printPatientHistoryBill(selectedId, row.print.kind, row.print.billId, row.print.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errGeneric"));
    } finally {
      setPrintingKey(null);
    }
  }

  function openDeleteConfirm(p: PatientChart) {
    setDeleteError(null);
    setDeleteStep(1);
    setDeleteTarget(p);
  }

  function closeDeleteConfirm() {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteStep(1);
    setDeleteError(null);
  }

  async function confirmDeletePatient() {
    if (!deleteTarget) return;
    if (deleteStep === 1) {
      setDeleteStep(2);
      setDeleteError(null);
      return;
    }
    const p = deleteTarget;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deletePatient(p.id);
      setDeleteTarget(null);
      setDeleteStep(1);
      if (editing && selectedId === p.id) closeForm();
      const data = await reload();
      if (selectedId === p.id) {
        setSelectedId(data[0]?.id ?? null);
        setHistory(emptyHistory);
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  function genderLabel(value: string): string {
    if (value === "M") return t("genderM");
    if (value === "F") return t("genderF");
    if (value === "Other") return t("genderOther");
    if (!value) return t("genderUnset");
    return value;
  }

  const canDeleteSelected =
    patientsDelete && selected != null && !showForm && historyReady && historyIsEmpty(history);
  const createOnly = creating && patientsCreate && !editing;

  return (
    <section
      className={`drug-setup${createOnly ? " drug-setup--solo" : ""}`}
      aria-label={t("patients")}
    >
      {!createOnly ? (
        <div className="drug-setup-list-pane">
          <div className="drug-setup-heading">
            <h2 className="drug-setup-title">{t("patients")}</h2>
            <div className="tabs">
              <CatalogFilterButton
                open={filterOpen}
                controlsId={filterPanelId}
                onToggle={() => setFilterOpen((v) => !v)}
              />
            </div>
          </div>
          <p className="drug-setup-selected" aria-hidden="true" />
          <CatalogFilterPanel
            id={filterPanelId}
            open={filterOpen}
            query={filterQ}
            onQueryChange={setFilterQ}
            queryPlaceholder={t("patientSearchPlaceholder")}
            searchLabel={t("searchPatients")}
            searchGuide={filterOpen ? "patient-search" : undefined}
            onSearch={() => runSearch(filterQ)}
            dateSort={dateSort}
            onDateSortChange={setDateSort}
            onReset={resetFilters}
          />
          {error && !showForm ? <p className="form-error">{error}</p> : null}
          <div className="drug-setup-table" role="listbox" aria-label={t("patients")}>
            <div className="drug-setup-table-head opd-master-cols">
              <span title={t("name")}>{t("name")}</span>
              <span title={t("fatherMotherName")}>{t("fatherMotherName")}</span>
            </div>
            {sortedList.length === 0 ? <p className="empty-row">{t("noPatientsYet")}</p> : null}
            {sortedList.map((p) => (
              <div
                key={p.id}
                role="option"
                tabIndex={0}
                aria-selected={p.id === selectedId && !creating && !editing}
                className={`drug-setup-table-row opd-master-cols${
                  p.id === selectedId && !creating && !editing ? " selected" : ""
                }`}
                onClick={() => selectItem(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectItem(p.id);
                  }
                }}
              >
                <span title={p.name}>{p.name}</span>
                <span title={p.father_mother_name || "—"}>{p.father_mother_name || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="drug-setup-detail-pane">
        {showForm ? (
          <>
            <div className="drug-setup-title-row">
              <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
                {editing && selectedId != null
                  ? `${t("editPatient")} #${selectedId}`
                  : t("createNewPatientTitle")}
              </h3>
              <DialogCloseButton onClick={createOnly ? leaveCreatePage : closeForm} />
            </div>
            <form
              key={editing && selectedId != null ? `edit-${selectedId}` : "create"}
              className="card-form"
              onSubmit={(e) => void submit(e)}
            >
              <FormSection title={t("patientSectionDemographics")} titleId="patient-demographics">
                <div className="field-row">
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
                    <span>{t("dateOfBirth")}</span>
                    <DatePicker value={dateOfBirth} onChange={setDateOfBirth} disabled={busy} />
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>{t("age")}</span>
                    <input
                      type="number"
                      min={0}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label className="field">
                    <span>{t("gender")}</span>
                    <select value={gender} onChange={(e) => setGender(e.target.value)} disabled={busy}>
                      <option value="">{t("genderUnset")}</option>
                      <option value="M">{t("genderM")}</option>
                      <option value="F">{t("genderF")}</option>
                      <option value="Other">{t("genderOther")}</option>
                      {!genderKnown ? <option value={gender}>{gender}</option> : null}
                    </select>
                  </label>
                </div>
              </FormSection>

              <FormSection
                title={t("patientSectionIdentityContact")}
                titleId="patient-identity-contact"
              >
                <div className="field-row">
                  <label className="field">
                    <span>{t("phone")}</span>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
                  </label>
                  <label className="field">
                    <span>{t("fatherMotherName")}</span>
                    <input
                      value={fatherMotherName}
                      onChange={(e) => setFatherMotherName(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{t("nrc")}</span>
                  <input value={nrc} onChange={(e) => setNrc(e.target.value)} disabled={busy} />
                </label>
              </FormSection>

              <FormSection title={t("patientSectionNotes")} titleId="patient-notes">
                <label className="field">
                  <span>{t("notes")}</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    disabled={busy}
                  />
                </label>
              </FormSection>

              {error ? (
                <p ref={formErrorRef} className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="btn-row">
                <button
                  type="submit"
                  className="btn primary"
                  disabled={busy}
                  data-guide={creating && !editing ? "patient-create" : undefined}
                >
                  {busy ? t("saving") : creating ? t("create") : t("save")}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="tabs patient-detail-tabs" role="tablist" aria-label={t("patients")}>
              <button
                type="button"
                role="tab"
                className={`tab${detailTab === "info" ? " active" : ""}`}
                aria-selected={detailTab === "info"}
                onClick={() => setDetailTab("info")}
              >
                {t("patientInfo")}
              </button>
              <button
                type="button"
                role="tab"
                className={`tab${detailTab === "history" ? " active" : ""}`}
                aria-selected={detailTab === "history"}
                onClick={() => setDetailTab("history")}
              >
                {t("history")}
              </button>
            </div>
            {detailTab === "info" ? (
              selected ? (
                <>
                  <div className="patient-info-detail">
                    <div className="drug-info-fields">
                      <div className="drug-info-field">
                        <span className="drug-info-label">{t("chartLabel")}</span>
                        <span>{selected.id}</span>
                      </div>
                    </div>

                    <div className="patient-info-sections-row">
                      <section
                        className="patient-info-section"
                        aria-labelledby="patient-info-demographics"
                      >
                        <h3 className="form-section-title" id="patient-info-demographics">
                          {t("patientSectionDemographics")}
                        </h3>
                        <div className="drug-info-fields">
                          <div className="drug-info-field">
                            <span className="drug-info-label">{t("name")}</span>
                            <span>{selected.name}</span>
                          </div>
                          <div className="drug-info-field">
                            <span className="drug-info-label">{t("age")}</span>
                            <span>{selected.age_years != null ? selected.age_years : "—"}</span>
                          </div>
                          <div className="drug-info-field">
                            <span className="drug-info-label">{t("gender")}</span>
                            <span>{genderLabel(selected.gender)}</span>
                          </div>
                          <div className="drug-info-field">
                            <span className="drug-info-label">{t("dateOfBirth")}</span>
                            <span>
                              {selected.date_of_birth
                                ? formatDateDisplay(selected.date_of_birth) ||
                                  selected.date_of_birth
                                : "—"}
                            </span>
                          </div>
                        </div>
                      </section>

                      <section
                        className="patient-info-section"
                        aria-labelledby="patient-info-identity-contact"
                      >
                        <h3 className="form-section-title" id="patient-info-identity-contact">
                          {t("patientSectionIdentityContact")}
                        </h3>
                        <div className="drug-info-fields">
                          <div className="drug-info-field">
                            <span className="drug-info-label">{t("phone")}</span>
                            <span>{selected.phone || "—"}</span>
                          </div>
                          <div className="drug-info-field">
                            <span className="drug-info-label">{t("nrc")}</span>
                            <span>{selected.nrc || "—"}</span>
                          </div>
                          <div className="drug-info-field">
                            <span className="drug-info-label">{t("fatherMotherName")}</span>
                            <span>{selected.father_mother_name || "—"}</span>
                          </div>
                        </div>
                      </section>
                    </div>

                    <div className="patient-info-notes">
                      <h3 className="form-section-title" id="patient-info-notes">
                        {t("patientSectionNotes")}
                      </h3>
                      <div className="drug-info-fields">
                        <div className="drug-info-field">
                          <span className="drug-info-label">{t("notes")}</span>
                          <span>{selected.notes || "—"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="btn-row">
                    {patientsUpdate ? (
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
                    {canDeleteSelected ? (
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
                    {patientsDelete && historyReady && !historyIsEmpty(history) ? (
                      <p className="hint" style={{ margin: 0, alignSelf: "center" }}>
                        {t("patientDeleteBlocked")}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="hint">{t("noPatientsYet")}</p>
              )
            ) : selected ? (
              <>
                <div className="patient-history-labels">
                  <span className="drug-info-label" id={historyKindsLabelId}>
                    {t("patientsAllBills")}
                  </span>
                  <span className="drug-info-label" id={historySortLabelId}>
                    {t("sortByDate")}
                  </span>
                </div>
                <div className="patient-history-toolbar">
                  <div
                    className="patient-history-kinds"
                    role="radiogroup"
                    aria-labelledby={historyKindsLabelId}
                  >
                    {HISTORY_KIND_OPTIONS.map((kind) => {
                      const selectedKind = historyKind === kind;
                      const kindLabel =
                        kind === "all"
                          ? t("all")
                          : kind === "ipd"
                            ? t("ipd")
                            : kind === "opd"
                              ? t("opd")
                            : kind === "lab"
                              ? t("lab")
                              : kind === "ot"
                                ? t("ot")
                                : t("pharmacy");
                      return (
                        <button
                          key={kind}
                          type="button"
                          role="radio"
                          aria-checked={selectedKind}
                          aria-pressed={selectedKind}
                          className={`btn action${selectedKind ? " on" : ""}`}
                          onClick={() => setHistoryKind(kind)}
                        >
                          {kindLabel}
                        </button>
                      );
                    })}
                    {patientsUpdate ? (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={historyKind === "addBill"}
                        aria-pressed={historyKind === "addBill"}
                        className={`btn action${historyKind === "addBill" ? " on" : ""}`}
                        onClick={() => setHistoryKind("addBill")}
                      >
                        {t("patientsAddBill")}
                      </button>
                    ) : null}
                  </div>
                  <CatalogDateSortField
                    id={historySortId}
                    value={historyDateSort}
                    onChange={setHistoryDateSort}
                    hideLabel
                    labelledBy={historySortLabelId}
                  />
                </div>
                {historyKind === "addBill" && patientsUpdate ? (
                  <div className="patient-history-attach">
                    <label className="field">
                      <span>{t("patientsAttachBill")}</span>
                      <input
                        value={billNo}
                        onChange={(e) => setBillNo(e.target.value)}
                        disabled={busy}
                        autoFocus
                      />
                    </label>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy || billNo.trim() === ""}
                      data-guide="patient-attach"
                      onClick={() => void attachBill()}
                    >
                      {busy ? t("saving") : t("patientsAttach")}
                    </button>
                  </div>
                ) : null}
                {historyKind === "all" || historyKind === "ipd" ? (
                  <HistoryBlock
                    title={t("ipd")}
                    empty={t("historyNone")}
                    loading={!historyReady}
                    rows={sortedIpd.map((row, index) => ({
                      id: index + 1,
                      key: `ipd-${row.admission_no}-${index}`,
                      voucher: row.admission_no,
                      name: "",
                      status: row.settled ? "settled" : "open",
                      statusLabel: row.settled ? t("ipdStatusSettled") : t("ipdStatusOpen"),
                      statusTone: row.settled ? "paid" : "ipd",
                      when: row.admitted_at,
                      priceMmk: row.balance_mmk,
                    }))}
                  />
                ) : null}
                {historyKind === "all" || historyKind === "opd" ? (
                  <HistoryBlock
                    title={t("opd")}
                    empty={t("historyNone")}
                    loading={!historyReady}
                    printingKey={printingKey}
                    busy={busy}
                    onPrint={(row) => void printHistoryRow(row)}
                    rows={sortedOpd.map((row) => ({
                      id: row.id,
                      key: `opd-${row.id}`,
                      voucher: row.bill_no,
                      name: row.doctor_name || "—",
                      status: row.status,
                      printedAt: row.printed_at,
                      collectedCash: row.collected_cash,
                      when: row.created_at,
                      priceMmk: row.total_mmk,
                      canPrint: true,
                      print: { kind: "opd" as const, billId: row.id, title: row.bill_no },
                    }))}
                  />
                ) : null}
                {historyKind === "all" || historyKind === "lab" ? (
                  <HistoryBlock
                    title={t("lab")}
                    empty={t("historyNone")}
                    loading={!historyReady}
                    rows={sortedLab.map((row) => ({
                      id: row.id,
                      key: `lab-${row.id}`,
                      voucher: row.bill_no,
                      name: row.doctor_name || "—",
                      status: row.status,
                      printedAt: row.printed_at,
                      collectedCash: row.collected_cash,
                      when: row.created_at,
                      priceMmk: row.total_mmk,
                    }))}
                  />
                ) : null}
                {historyKind === "all" || historyKind === "ot" ? (
                  <HistoryBlock
                    title={t("ot")}
                    empty={t("historyNone")}
                    loading={!historyReady}
                    printingKey={printingKey}
                    busy={busy}
                    onPrint={(row) => void printHistoryRow(row)}
                    rows={sortedOt.map((row, index) => {
                      const billId = row.bill_id != null && row.bill_id > 0 ? row.bill_id : 0;
                      return {
                        id: billId > 0 ? billId : -(index + 1),
                        key: `ot-${row.bill_id ?? row.case_no}-${index}`,
                        voucher: row.case_no,
                        name: row.bill_no || "—",
                        status: row.bill_status || row.status,
                        printedAt: row.bill_printed_at,
                        collectedCash: row.bill_collected_cash,
                        when: row.created_at,
                        priceMmk: row.bill_total_mmk ?? null,
                        canPrint: billId > 0,
                        print:
                          billId > 0
                            ? {
                                kind: "ot" as const,
                                billId,
                                title: row.bill_no || row.case_no,
                              }
                            : undefined,
                      };
                    })}
                  />
                ) : null}
                {historyKind === "all" || historyKind === "pharmacy" ? (
                  <HistoryBlock
                    title={t("pharmacy")}
                    empty={t("historyNone")}
                    loading={!historyReady}
                    printingKey={printingKey}
                    busy={busy}
                    onPrint={(row) => void printHistoryRow(row)}
                    rows={sortedPharmacy.map((row) => ({
                      id: row.id,
                      key: `pharmacy-${row.id}`,
                      voucher: row.bill_no,
                      name: "",
                      status: row.status,
                      printedAt: row.printed_at,
                      collectedCash: row.collected_cash,
                      when: row.created_at,
                      priceMmk: row.total_mmk,
                      canPrint: true,
                      print: {
                        kind: "pharmacy" as const,
                        billId: row.id,
                        title: row.bill_no,
                      },
                    }))}
                  />
                ) : null}
              </>
            ) : (
              <p className="hint">{t("noPatientsYet")}</p>
            )}
          </>
        )}
      </div>

      {createdPatient ? (
        <AlertDialog
          tone="success"
          title={t("patientCreatedTitle")}
          message={t("patientCreatedBody").replace("{name}", createdPatient.name)}
          okLabel={t("viewPatientList")}
          onClose={viewCreatedPatientList}
        />
      ) : null}

      {deleteTarget ? (
        <AlertDialog
          key={`patient-delete-${deleteTarget.id}-${deleteStep}`}
          tone="warning"
          title={t("delete")}
          identity={deleteTarget.name}
          message={
            deleteStep === 1
              ? t("confirmDeletePatient")
              : t("confirmDeletePatientFinal").replace("{name}", deleteTarget.name)
          }
          error={deleteError}
          busy={deleteBusy}
          danger
          irreversible
          confirmLabel={deleteStep === 1 ? t("continueAction") : t("delete")}
          onClose={closeDeleteConfirm}
          onConfirm={() => void confirmDeletePatient()}
        />
      ) : null}
    </section>
  );
}

function HistoryBlock({
  title,
  rows,
  empty,
  loading,
  printingKey,
  busy,
  onPrint,
}: {
  title: string;
  rows: HistoryRow[];
  empty: string;
  loading?: boolean;
  printingKey?: string | null;
  busy?: boolean;
  onPrint?: (row: HistoryRow) => void;
}) {
  const printingRow = printingKey
    ? rows.find((row) => (row.key ?? String(row.id)) === printingKey)
    : null;

  return (
    <section className="patient-history-block">
      <h3 className="section-title">{title}</h3>
      <BillHistoryTable
        ariaLabel={title}
        rows={rows}
        loading={loading}
        emptyLabel={empty}
        busy={busy}
        printingId={printingRow?.id ?? null}
        onPrint={
          onPrint
            ? (id) => {
                const row = rows.find((r) => r.id === id && r.print);
                if (row) onPrint(row);
              }
            : undefined
        }
      />
    </section>
  );
}
