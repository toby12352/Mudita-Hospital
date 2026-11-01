import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
import type { ClinicModule } from "@/app/portal";
import type { NavSectionId, View } from "@/app/types";
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import { moneyStatusLabel } from "@/shared/BillPayPrint";
import {
  BillHistoryTable,
  type BillHistoryTableRow,
} from "@/shared/BillHistoryTable";
import {
  BillHistoryToolbar,
  type BillHistoryQuery,
  type BillHistoryStatusOption,
  type BillHistorySuggestItem,
} from "@/shared/BillHistoryToolbar";
import { DatePicker, formatDateDisplay } from "@/shared/DatePicker";
import { sortByDateAscDesc } from "@/shared/DateSort";
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { FormSection } from "@/shared/FormSection";
import { useI18n } from "@/shared/i18n";

type HistoryKind = "ipd" | "opd" | "ot" | "pharmacy" | "lab";

type HistoryRow = BillHistoryTableRow & {
  kind: HistoryKind;
  /** Real bill / case / admission id for desk open. */
  openId?: number;
  print?: { kind: PatientHistoryBillKind; billId: number; title: string };
};

type DetailTab = "info" | "history";

type OpenRecordTarget = {
  view: View;
  section: NavSectionId;
  openRecordId: number;
};

function historyStampDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function emptyHistoryQuery(): BillHistoryQuery {
  return { q: "", money: "", category: "", unit: "", from: "", to: "", sort: "desc" };
}

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

function historyHasStay(h: PatientHistory): boolean {
  return h.ipd.length > 0;
}

export function PatientsPage({
  startCreate = false,
  focusId,
  onViewList,
  canReadModule,
  onOpenRecord,
}: {
  startCreate?: boolean;
  focusId?: number;
  onViewList?: (id?: number) => void;
  canReadModule?: (module: ClinicModule) => boolean;
  onOpenRecord?: (target: OpenRecordTarget) => void;
} = {}) {
  const { t } = useI18n();
  const { patientsCreate, patientsUpdate, patientsDelete } = useClinicActions();
  const [creating, setCreating] = useState(() => startCreate && patientsCreate);
  const [editing, setEditing] = useState(false);
  const [listQuery, setListQuery] = useState<BillHistoryQuery>(emptyHistoryQuery);
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [historyQuery, setHistoryQuery] = useState<BillHistoryQuery>(emptyHistoryQuery);
  const [attachOpen, setAttachOpen] = useState(false);
  const [list, setList] = useState<PatientChart[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
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
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const returnListFocusIdRef = useRef<number | null>(null);
  const nameErrorId = useId();
  const [printingKey, setPrintingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PatientChart | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      const data = await listPatients(search.trim());
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
        const data = await listPatients("");
        if (cancelled) return;
        setList(data);
        setListLoading(false);
        if (creating) return;
        if (focusId != null && data.some((p) => p.id === focusId)) {
          setSelectedId(focusId);
        }
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

  const filteredList = useMemo(() => {
    const from = listQuery.from.trim();
    const to = listQuery.to.trim();
    let rows = list;
    if (from || to) {
      rows = rows.filter((p) => {
        const day = historyStampDay(p.updated_at);
        if (from && day && day < from) return false;
        if (to && day && day > to) return false;
        return true;
      });
    }
    return sortByDateAscDesc(rows, listQuery.sort, (p) => p.updated_at, (p) => p.id);
  }, [list, listQuery.from, listQuery.to, listQuery.sort]);

  const historyKindOptions = useMemo((): BillHistoryStatusOption[] => {
    return [
      { value: "", label: t("all") },
      { value: "ipd", label: t("ipd") },
      { value: "opd", label: t("opd") },
      { value: "ot", label: t("ot") },
      { value: "pharmacy", label: t("pharmacy") },
      { value: "lab", label: t("lab") },
    ];
  }, [t]);

  const kindLabel = useCallback(
    (kind: HistoryKind) => {
      if (kind === "ipd") return t("ipd");
      if (kind === "opd") return t("opd");
      if (kind === "ot") return t("ot");
      if (kind === "pharmacy") return t("pharmacy");
      return t("lab");
    },
    [t],
  );

  const allHistoryRows = useMemo((): HistoryRow[] => {
    const rows: HistoryRow[] = [];
    let nextId = 1;

    for (const [index, row] of history.ipd.entries()) {
      rows.push({
        id: nextId++,
        key: `ipd-${row.admission_no}-${index}`,
        kind: "ipd",
        openId: row.id != null && row.id > 0 ? row.id : undefined,
        voucher: row.admission_no,
        name: "",
        status: row.settled ? "settled" : "open",
        statusLabel: row.settled ? t("ipdStatusSettled") : t("ipdStatusOpen"),
        statusTone: row.settled ? "paid" : "ipd",
        when: row.admitted_at,
        priceMmk: row.balance_mmk,
      });
    }
    for (const row of history.opd) {
      rows.push({
        id: nextId++,
        key: `opd-${row.id}`,
        kind: "opd",
        openId: row.id,
        voucher: row.bill_no,
        name: row.doctor_name || "—",
        status: row.status,
        printedAt: row.printed_at,
        collectedCash: row.collected_cash,
        when: row.created_at,
        priceMmk: row.total_mmk,
        canPrint: true,
        print: { kind: "opd", billId: row.id, title: row.bill_no },
      });
    }
    for (const row of history.ot) {
      const billId = row.bill_id != null && row.bill_id > 0 ? row.bill_id : 0;
      rows.push({
        id: nextId++,
        key: `ot-${row.id ?? row.bill_id ?? row.case_no}`,
        kind: "ot",
        openId: row.id != null && row.id > 0 ? row.id : undefined,
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
            ? { kind: "ot", billId, title: row.bill_no || row.case_no }
            : undefined,
      });
    }
    for (const row of history.pharmacy) {
      rows.push({
        id: nextId++,
        key: `pharmacy-${row.id}`,
        kind: "pharmacy",
        openId: row.id,
        voucher: row.bill_no,
        name: "",
        status: row.status,
        printedAt: row.printed_at,
        collectedCash: row.collected_cash,
        when: row.created_at,
        priceMmk: row.total_mmk,
        canPrint: true,
        print: { kind: "pharmacy", billId: row.id, title: row.bill_no },
      });
    }
    for (const row of history.lab) {
      rows.push({
        id: nextId++,
        key: `lab-${row.id}`,
        kind: "lab",
        openId: row.id,
        voucher: row.bill_no,
        name: row.doctor_name || "—",
        status: row.status,
        printedAt: row.printed_at,
        collectedCash: row.collected_cash,
        when: row.created_at,
        priceMmk: row.total_mmk,
      });
    }
    return rows;
  }, [history, t]);

  const filteredHistoryRows = useMemo(() => {
    const q = historyQuery.q.trim().toLowerCase();
    const kind = historyQuery.money;
    const from = historyQuery.from.trim();
    const to = historyQuery.to.trim();

    let rows = allHistoryRows.filter((row) => {
      if (kind && row.kind !== kind) return false;
      const day = historyStampDay(row.when);
      if (from && day && day < from) return false;
      if (to && day && day > to) return false;
      if (!q) return true;
      const statusText = (
        row.statusLabel ??
        moneyStatusLabel(row.status, t, row.printedAt, row.collectedCash)
      ).toLowerCase();
      const haystack = [row.voucher, row.name, statusText, kindLabel(row.kind)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    rows = sortByDateAscDesc(rows, historyQuery.sort, (row) => row.when, (row) => row.id);

    const showKindPrefix = !kind;
    return rows.map((row) => ({
      ...row,
      name: showKindPrefix
        ? `${kindLabel(row.kind)}${row.name && row.name !== "—" ? ` · ${row.name}` : ""}`
        : row.name,
    }));
  }, [allHistoryRows, historyQuery, kindLabel, t]);

  const selected = list.find((p) => p.id === selectedId) ?? null;
  const showForm = (creating && patientsCreate) || (editing && patientsUpdate);
  const genderKnown = gender === "" || gender === "M" || gender === "F" || gender === "Other";
  const showList = !showForm && selectedId == null;

  useEffect(() => {
    if (!showForm) return;
    window.requestAnimationFrame(() => nameInputRef.current?.focus());
  }, [showForm, creating, editing, selectedId]);

  useEffect(() => {
    if (showForm || selectedId == null) return;
    window.requestAnimationFrame(() => detailTitleRef.current?.focus());
  }, [selectedId, showForm]);

  useEffect(() => {
    if (!showList) return;
    const id = returnListFocusIdRef.current;
    if (id == null) return;
    returnListFocusIdRef.current = null;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-patient-row="${id}"]`)?.focus();
    });
  }, [showList, filteredList]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".alert-dialog-overlay, .print-preview-overlay")) return;
      if (showForm) {
        e.preventDefault();
        if (creating && !editing) leaveCreatePage();
        else closeForm();
        return;
      }
      if (selectedId != null) {
        e.preventDefault();
        backToList();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // Intentional: handlers close over latest leave/close helpers each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Escape wiring
  }, [showForm, creating, editing, selectedId]);

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
    restoreOpener();
  }

  function backToList() {
    returnListFocusIdRef.current = selectedId;
    openerRef.current = null;
    setSelectedId(null);
    setCreating(false);
    setEditing(false);
    fillForm(null);
    setDetailTab("info");
    setAttachOpen(false);
    setBillNo("");
    setHistory(emptyHistory);
    setHistoryReady(false);
    setHistoryQuery(emptyHistoryQuery());
    setError(null);
    if (onViewList) onViewList();
  }

  function leaveCreatePage() {
    setCreatedPatient(null);
    if (onViewList) {
      openerRef.current = null;
      onViewList();
      return;
    }
    closeForm();
  }

  function selectItem(id: number) {
    rememberOpener();
    setSelectedId(id);
    setCreating(false);
    setEditing(false);
    fillForm(null);
    setDetailTab("info");
    setHistory(emptyHistory);
    setHistoryReady(false);
    setBillNo("");
    setAttachOpen(false);
    setHistoryQuery(emptyHistoryQuery());
    setError(null);
  }

  function startCreateForm() {
    if (!patientsCreate) return;
    rememberOpener();
    setSelectedId(null);
    setCreating(true);
    setEditing(false);
    fillForm(null);
    setError(null);
  }

  function openEdit(p: PatientChart) {
    if (!patientsUpdate) return;
    rememberOpener();
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
        openerRef.current = null;
        setCreating(false);
        setEditing(false);
        fillForm(null);
        const data = await listPatients(listQuery.q.trim());
        setList(data);
        setSelectedId(saved.id);
        setHistory(await fetchPatientHistory(saved.id));
        setHistoryReady(true);
      } else {
        const saved = await createPatient(body);
        openerRef.current = null;
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
    setCreating(false);
    setEditing(false);
    fillForm(null);
    void listPatients("")
      .then(async (data) => {
        setList(data);
        setSelectedId(id);
        setDetailTab("info");
        setHistory(await fetchPatientHistory(id));
        setHistoryReady(true);
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
      setAttachOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const loadHistorySuggestions = useCallback(
    async (q: string, filters: Omit<BillHistoryQuery, "q">): Promise<BillHistorySuggestItem[]> => {
      const needle = q.trim().toLowerCase();
      const kind = filters.money;
      const from = filters.from.trim();
      const to = filters.to.trim();
      return allHistoryRows
        .filter((row) => {
          if (kind && row.kind !== kind) return false;
          const day = historyStampDay(row.when);
          if (from && day && day < from) return false;
          if (to && day && day > to) return false;
          if (!needle) return true;
          const statusText = (
            row.statusLabel ??
            moneyStatusLabel(row.status, t, row.printedAt, row.collectedCash)
          ).toLowerCase();
          const haystack = [row.voucher, row.name, statusText, kindLabel(row.kind)]
            .join(" ")
            .toLowerCase();
          return haystack.includes(needle);
        })
        .slice(0, 8)
        .map((row) => ({
          id: row.id,
          voucher: row.voucher,
          name: `${kindLabel(row.kind)}${row.name && row.name !== "—" ? ` · ${row.name}` : ""}`,
        }));
    },
    [allHistoryRows, kindLabel, t],
  );

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

  function openHistoryRecord(row: HistoryRow) {
    if (row.openId == null || row.openId <= 0 || !onOpenRecord || !canReadModule) return;

    let module: ClinicModule;
    let target: OpenRecordTarget;

    if (row.kind === "opd") {
      module = "opd";
      target = { view: "opd", section: "opd", openRecordId: row.openId };
    } else if (row.kind === "lab") {
      module = "lab";
      target = { view: "lab", section: "lab", openRecordId: row.openId };
    } else if (row.kind === "ot") {
      module = "ot";
      target = { view: "ot", section: "ot_bill", openRecordId: row.openId };
    } else if (row.kind === "ipd") {
      module = "ipd";
      target = { view: "ipd", section: "ipd", openRecordId: row.openId };
    } else if (row.kind === "pharmacy") {
      module = "pharmacy";
      const isReturn = row.voucher.trim().toUpperCase().startsWith("RT-");
      target = isReturn
        ? { view: "pharmacy_return", section: "pharmacy_return", openRecordId: row.openId }
        : { view: "pharmacy_billing", section: "pharmacy", openRecordId: row.openId };
    } else {
      return;
    }

    if (!canReadModule(module)) {
      setError(t("noAccess"));
      return;
    }
    setError(null);
    onOpenRecord(target);
  }

  function historyRowClickable(row: HistoryRow): boolean {
    if (row.openId == null || row.openId <= 0 || !onOpenRecord || !canReadModule) return false;
    if (row.kind === "opd") return canReadModule("opd");
    if (row.kind === "lab") return canReadModule("lab");
    if (row.kind === "ot") return canReadModule("ot");
    if (row.kind === "ipd") return canReadModule("ipd");
    if (row.kind === "pharmacy") return canReadModule("pharmacy");
    return false;
  }

  const historyActivate = filteredHistoryRows.some(historyRowClickable)
    ? (id: number) => {
        const row = filteredHistoryRows.find((r) => r.id === id);
        if (row) openHistoryRecord(row);
      }
    : undefined;

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
      await reload();
      if (selectedId === p.id) {
        setSelectedId(null);
        setEditing(false);
        fillForm(null);
        setHistory(emptyHistory);
        setHistoryReady(false);
        if (onViewList) onViewList();
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
    patientsDelete && selected != null && !showForm && historyReady && !historyHasStay(history);

  const formTitle =
    editing && selectedId != null
      ? `${t("editPatient")} #${selectedId}`
      : t("createNewPatientTitle");

  const detailSub = selected
    ? [
        `${t("chartLabel")} #${selected.id}`,
        selected.phone || null,
        selected.date_of_birth
          ? formatDateDisplay(selected.date_of_birth) || selected.date_of_birth
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <section className="opd-bill-desk opd-bill-desk--history" aria-label={t("patients")}>
      <div className="opd-bill-desk-main">
        {showForm ? (
          <>
            <div className="patient-chart-title-row">
              <h2 id="patient-form-title" className="opd-bill-desk-title">
                {formTitle}
              </h2>
              <DialogCloseButton onClick={creating && !editing ? leaveCreatePage : closeForm} />
            </div>
            <form
              key={editing && selectedId != null ? `edit-${selectedId}` : "create"}
              className="card-form"
              aria-labelledby="patient-form-title"
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
        ) : null}

        {showList ? (
          <>
            <h2 className="opd-bill-desk-title">{t("patients")}</h2>
            <BillHistoryToolbar
              key="patient-charts"
              searchPlaceholder={t("patientSearchPlaceholder")}
              initialRange="all"
              hideStatus
              searchGuide="patient-search"
              explicitSearch
              onSearch={runListSearch}
              onInvalidRange={() => setError(t("billHistoryInvalidRange"))}
              trailing={
                patientsCreate ? (
                  <button
                    type="button"
                    className="btn action primary"
                    disabled={busy}
                    data-guide="patient-create"
                    onClick={startCreateForm}
                  >
                    <ActionIcon name="plus" />
                    {t("createNewPatientRecord")}
                  </button>
                ) : null
              }
            />
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div
              className="bill-history-table-wrap"
              role="region"
              aria-label={t("patients")}
            >
              <div className="bill-history-table-head bill-history-table-head--charts" role="row">
                <span className="bill-history-col bill-history-col--name" role="columnheader">
                  {t("name")}
                </span>
                <span className="bill-history-col" role="columnheader">
                  {t("fatherMotherName")}
                </span>
                <span className="bill-history-col" role="columnheader">
                  {t("phone")}
                </span>
                <span className="bill-history-col" role="columnheader">
                  {t("dateOfBirth")}
                </span>
              </div>
              {listLoading ? <p className="hint bill-history-table-msg">{t("loading")}</p> : null}
              {!listLoading && filteredList.length === 0 ? (
                <p className="hint bill-history-table-msg empty-row">{t("noPatientsYet")}</p>
              ) : null}
              <ul className="bill-history-table-body">
                {filteredList.map((p) => {
                  const dob = p.date_of_birth
                    ? formatDateDisplay(p.date_of_birth) || p.date_of_birth
                    : "—";
                  return (
                    <li key={p.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        data-patient-row={p.id}
                        aria-label={`${p.name} · ${t("chartLabel")} #${p.id}`}
                        className="bill-history-table-row bill-history-table-row--charts bill-history-table-row--clickable"
                        onClick={() => selectItem(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectItem(p.id);
                          }
                        }}
                      >
                        <span
                          className="bill-history-col bill-history-col--name"
                          title={p.name}
                        >
                          <span className="bill-history-name-primary">{p.name}</span>
                          <span className="bill-history-name-detail">
                            {t("chartLabel")} #{p.id}
                          </span>
                        </span>
                        <span
                          className="bill-history-col"
                          title={p.father_mother_name || undefined}
                        >
                          {p.father_mother_name || "—"}
                        </span>
                        <span className="bill-history-col" title={p.phone || undefined}>
                          {p.phone || "—"}
                        </span>
                        <span className="bill-history-col bill-history-col--when">{dob}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : null}

        {!showForm && selected ? (
          <>
            <div className="patient-chart-title-row">
              <div className="patient-chart-title-block">
                <h2
                  ref={detailTitleRef}
                  tabIndex={-1}
                  className="opd-bill-desk-title"
                >
                  {selected.name}
                </h2>
                {detailSub ? <p className="patient-chart-sub">{detailSub}</p> : null}
              </div>
              <DialogCloseButton onClick={backToList} />
            </div>
            <div className="tabs patient-detail-tabs" role="tablist" aria-label={selected.name}>
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
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            {detailTab === "info" ? (
              <>
                <div className="patient-info-detail">
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

                  <div className="patient-info-notes" aria-labelledby="patient-info-notes">
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
                  {patientsDelete && historyReady && historyHasStay(history) ? (
                    <p className="hint" style={{ margin: 0, alignSelf: "center" }}>
                      {t("patientDeleteBlocked")}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <BillHistoryToolbar
                  key={selected.id}
                  searchPlaceholder={t("billHistorySearchPlaceholder")}
                  initialRange="all"
                  statusOptions={historyKindOptions}
                  statusFieldLabel={t("patientsAllBills")}
                  onSearch={setHistoryQuery}
                  loadSuggestions={loadHistorySuggestions}
                  onInvalidRange={() => setError(t("billHistoryInvalidRange"))}
                  trailing={
                    patientsUpdate ? (
                      <button
                        type="button"
                        className={`btn action${attachOpen ? " on" : ""}`}
                        aria-pressed={attachOpen}
                        onClick={() => setAttachOpen((v) => !v)}
                      >
                        {t("patientsAddBill")}
                      </button>
                    ) : null
                  }
                />
                {attachOpen && patientsUpdate ? (
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
                ) : (
                  <BillHistoryTable
                    ariaLabel={t("patientsAllBills")}
                    rows={filteredHistoryRows}
                    loading={!historyReady}
                    emptyLabel={t("historyNone")}
                    busy={busy}
                    onActivate={historyActivate}
                    printingId={
                      printingKey
                        ? (filteredHistoryRows.find(
                            (row) => (row.key ?? String(row.id)) === printingKey,
                          )?.id ?? null)
                        : null
                    }
                    onPrint={(id) => {
                      const row = filteredHistoryRows.find((r) => r.id === id && r.print);
                      if (row) void printHistoryRow(row);
                    }}
                  />
                )}
              </>
            )}
          </>
        ) : null}
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
