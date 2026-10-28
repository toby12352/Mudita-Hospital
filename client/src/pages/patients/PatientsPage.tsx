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
import { CatalogFilterButton, CatalogFilterPanel } from "@/shared/CatalogListFilter";
import { sortByDateAscDesc, type DateSortValue } from "@/shared/DateSort";
import { fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";

type HistoryRow = {
  key: string;
  label: string;
  print?: { kind: PatientHistoryBillKind; billId: number; title: string };
};

const emptyHistory: PatientHistory = { opd: [], pharmacy: [], ot: [], ipd: [] };

function ageValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function chartBody(name: string, phone: string, age: string, gender: string, notes: string): PatientWrite {
  return {
    name: name.trim(),
    phone: phone.trim(),
    age_years: ageValue(age),
    gender: gender.trim(),
    notes: notes.trim(),
  };
}

function historyIsEmpty(h: PatientHistory): boolean {
  return h.opd.length === 0 && h.pharmacy.length === 0 && h.ot.length === 0 && h.ipd.length === 0;
}

export function PatientsPage() {
  const { t } = useI18n();
  const { patientsCreate, patientsUpdate, patientsDelete } = useClinicActions();
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPanelId = useId();
  const [filterQ, setFilterQ] = useState("");
  const [dateSort, setDateSort] = useState<DateSortValue>("desc");
  const [list, setList] = useState<PatientChart[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
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
  const selected = list.find((p) => p.id === selectedId) ?? null;
  const showForm = (creating && patientsCreate) || (editing && patientsUpdate);
  const genderKnown = gender === "" || gender === "M" || gender === "F" || gender === "Other";

  function fillForm(p: PatientChart | null) {
    if (!p) {
      setName("");
      setPhone("");
      setAge("");
      setGender("");
      setNotes("");
      return;
    }
    setName(p.name);
    setPhone(p.phone);
    setAge(p.age_years != null ? String(p.age_years) : "");
    setGender(p.gender);
    setNotes(p.notes);
  }

  function openCreate() {
    if (!patientsCreate) return;
    setEditing(false);
    fillForm(null);
    setCreating(true);
    setCreateKey((n) => n + 1);
    setBillNo("");
    setError(null);
  }

  function closeForm() {
    setCreating(false);
    setEditing(false);
    fillForm(null);
    setError(null);
  }

  function selectItem(id: number) {
    setSelectedId(id);
    setCreating(false);
    setEditing(false);
    fillForm(null);
    setHistory(emptyHistory);
    setHistoryReady(false);
    setBillNo("");
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
      const body = chartBody(name, phone, age, gender, notes);
      const saved =
        editing && selectedId != null
          ? await updatePatient(selectedId, body)
          : await createPatient(body);
      setFilterQ("");
      setCreating(false);
      setEditing(false);
      fillForm(null);
      const data = await listPatients("");
      setList(data);
      setSelectedId(saved.id);
      setHistory(await fetchPatientHistory(saved.id));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function printHistoryRow(row: HistoryRow) {
    if (selectedId == null || !row.print) return;
    setPrintingKey(row.key);
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

  return (
    <section className="drug-setup" aria-label={t("patients")}>
      <div className="drug-setup-list-pane">
        <div className="drug-setup-heading">
          <h2 className="drug-setup-title">{t("patients")}</h2>
          <div className="tabs">
            {patientsCreate ? (
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
          onSearch={() => runSearch(filterQ)}
          dateSort={dateSort}
          onDateSortChange={setDateSort}
          onReset={resetFilters}
        />
        {error && !showForm ? <p className="form-error">{error}</p> : null}
        <div className="drug-setup-table" role="listbox" aria-label={t("patients")}>
          <div className="drug-setup-table-head opd-master-cols">
            <span title={t("name")}>{t("name")}</span>
            <span title={t("phone")}>{t("phone")}</span>
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
              <span title={p.phone || "—"}>{p.phone || "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="drug-setup-detail-pane">
        {showForm ? (
          <>
            <div className="drug-setup-title-row">
              <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
                {editing && selectedId != null
                  ? `${t("editPatient")} #${selectedId}`
                  : t("createNewPatientTitle")}
              </h3>
              <button type="button" className="desk-text-link" onClick={closeForm}>
                {t("cancel")}
              </button>
            </div>
            <form
              key={editing && selectedId != null ? `edit-${selectedId}` : `create-${createKey}`}
              className="card-form"
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
              <div className="field-row">
                <label className="field">
                  <span>{t("phone")}</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
                </label>
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
              </div>
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
              <label className="field">
                <span>{t("notes")}</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  disabled={busy}
                />
              </label>
              {error ? (
                <p ref={formErrorRef} className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="btn-row">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? t("saving") : t("save")}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
              {t("patientInfo")}
            </h3>
            {selected ? (
              <>
                <div className="drug-info-fields">
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("chartLabel")}</span>
                    <span>{selected.id}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("name")}</span>
                    <span>{selected.name}</span>
                  </div>
                  <div className="drug-info-field">
                    <span className="drug-info-label">{t("phone")}</span>
                    <span>{selected.phone || "—"}</span>
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
                    <span className="drug-info-label">{t("notes")}</span>
                    <span>{selected.notes || "—"}</span>
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

                <h3 className="section-title" style={{ marginTop: "1rem" }}>
                  {t("history")}
                </h3>
                <p className="hint">{t("patientsHistoryHint")}</p>
                <HistoryBlock
                  title={t("opd")}
                  empty={t("historyNone")}
                  printingKey={printingKey}
                  busy={busy}
                  onPrint={(row) => void printHistoryRow(row)}
                  rows={history.opd.map((row) => ({
                    key: `opd-${row.id}`,
                    label: [
                      row.bill_no,
                      row.status,
                      formatMMK(row.total_mmk),
                      row.doctor_name,
                      row.created_at,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    print: { kind: "opd" as const, billId: row.id, title: row.bill_no },
                  }))}
                />
                <HistoryBlock
                  title={t("pharmacy")}
                  empty={t("historyNone")}
                  printingKey={printingKey}
                  busy={busy}
                  onPrint={(row) => void printHistoryRow(row)}
                  rows={history.pharmacy.map((row) => ({
                    key: `pharmacy-${row.id}`,
                    label: [row.bill_no, row.status, formatMMK(row.total_mmk), row.created_at]
                      .filter(Boolean)
                      .join(" · "),
                    print: { kind: "pharmacy" as const, billId: row.id, title: row.bill_no },
                  }))}
                />
                <HistoryBlock
                  title={t("ot")}
                  empty={t("historyNone")}
                  printingKey={printingKey}
                  busy={busy}
                  onPrint={(row) => void printHistoryRow(row)}
                  rows={history.ot.map((row, index) => ({
                    key: `ot-${row.bill_id ?? row.case_no}-${index}`,
                    label: [row.case_no, row.status, row.bill_no, row.bill_status, row.created_at]
                      .filter(Boolean)
                      .join(" · "),
                    print:
                      row.bill_id != null && row.bill_id > 0
                        ? { kind: "ot" as const, billId: row.bill_id, title: row.bill_no || row.case_no }
                        : undefined,
                  }))}
                />
                <HistoryBlock
                  title={t("ipd")}
                  empty={t("historyNone")}
                  rows={history.ipd.map((row, index) => ({
                    key: `ipd-${row.admission_no}-${index}`,
                    label: [
                      row.admission_no,
                      row.settled ? t("ipdStatusSettled") : t("ipdStatusOpen"),
                      `${formatMMK(row.balance_mmk)} ${t("mmk")}`,
                      row.admitted_at,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                />
                {patientsUpdate ? (
                  <>
                    <label className="field">
                      <span>{t("patientsAttachBill")}</span>
                      <input value={billNo} onChange={(e) => setBillNo(e.target.value)} disabled={busy} />
                    </label>
                    <p className="hint">{t("patientsAttachHint")}</p>
                    <button
                      type="button"
                      className="btn action"
                      disabled={busy || billNo.trim() === ""}
                      onClick={() => void attachBill()}
                    >
                      <ActionIcon name="clipboard" /> {t("patientsAttach")}
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              <p className="hint">{t("noPatientsYet")}</p>
            )}
          </>
        )}
      </div>

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
  printingKey,
  busy,
  onPrint,
}: {
  title: string;
  rows: HistoryRow[];
  empty: string;
  printingKey?: string | null;
  busy?: boolean;
  onPrint?: (row: HistoryRow) => void;
}) {
  const { t } = useI18n();
  return (
    <section>
      <h3 className="section-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="empty-row">{empty}</p>
      ) : (
        <ul className="data-list">
          {rows.map((row) => (
            <li key={row.key}>
              <p className="row-title">{row.label}</p>
              {row.print && onPrint ? (
                <button
                  type="button"
                  className="btn action"
                  disabled={busy || printingKey === row.key}
                  onClick={() => onPrint(row)}
                >
                  <ActionIcon name="print" />
                  {t("print")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
