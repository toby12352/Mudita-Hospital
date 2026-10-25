import { useEffect, useRef, useState } from "react";
import {
  createOpdBill,
  findOpdServiceByCode,
  getOpdBill,
  listOpdDoctors,
  listOpdServices,
  payOpdBill,
  printOpdBill,
  updateOpdBill,
  voidOpdBill,
  type OpdBillLine,
  type OpdDoctor,
  type OpdService,
} from "@/features/opd/api";
import {
  discountFieldsFromBill,
  discountWrite,
  type DiscountUnit,
} from "@/shared/discount";
import { userMessage } from "@/shared/errors";
import { useI18n } from "@/shared/i18n";
import { OpdBillForm } from "@/pages/opd/OpdBillForm";
import {
  OpdBillListDialog,
  type OpdBillListDialogMode,
} from "@/pages/opd/OpdBillListDialog";

/** OPD Bill always opens the desk form; history replaces the old list. */
export function OpdPage(_props: { initialMode?: "list" | "edit" } = {}) {
  const { t } = useI18n();
  const [doctors, setDoctors] = useState<OpdDoctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<OpdBillListDialogMode | null>(null);

  const [billId, setBillId] = useState<number | null>(null);
  const [billNo, setBillNo] = useState("");
  const [billStatus, setBillStatus] = useState("draft");
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState("");
  const patientNameRef = useRef<HTMLInputElement>(null);
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<OpdBillLine[]>([]);
  const [discountValue, setDiscountValue] = useState("");
  const [discountUnit, setDiscountUnit] = useState<DiscountUnit>("percent");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const isDraft = billStatus === "draft";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const docList = await listOpdDoctors();
        if (!cancelled) setDoctors(docList);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (createdAt) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [createdAt]);

  function resetEditor() {
    setBillId(null);
    setBillNo("");
    setBillStatus("draft");
    setPatientId(null);
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    setDoctorId("");
    setDoctorName("");
    setDescription("");
    setLines([]);
    setDiscountValue("");
    setDiscountUnit("percent");
    setCreatedAt(null);
    setError(null);
    setOkMsg(null);
  }

  async function openBill(id: number) {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const b = await getOpdBill(id);
      setBillId(b.id);
      setBillNo(b.bill_no);
      setBillStatus(b.status);
      setPatientId(b.patient_id ?? null);
      setPatientName(b.patient_name);
      setPatientPhone(b.patient_phone);
      setPatientAge(b.patient_age_years != null ? String(b.patient_age_years) : "");
      setPatientGender(b.patient_gender);
      setDoctorId(b.doctor_id != null ? String(b.doctor_id) : "");
      setDoctorName(b.doctor_name || "");
      setDescription(b.description);
      setCreatedAt(b.created_at);
      setLines(
        (b.lines ?? []).map((l) => ({
          ...l,
          line_total_mmk: l.qty * l.unit_price_mmk,
        })),
      );
      const discount = discountFieldsFromBill(b.discount_value, b.discount_unit);
      setDiscountValue(discount.value);
      setDiscountUnit(discount.unit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed");
    } finally {
      setBusy(false);
    }
  }

  function buildBody() {
    const age = patientAge.trim() ? Number(patientAge) : null;
    return {
      patient_name: patientName.trim(),
      patient_phone: patientPhone.trim(),
      patient_age_years: age != null && Number.isFinite(age) ? age : null,
      patient_gender: patientGender.trim(),
      doctor_id: doctorId ? Number(doctorId) : null,
      doctor_name: doctorName.trim(),
      description: description.trim(),
      save_patient: true,
      ...discountWrite(discountValue, discountUnit),
      lines: lines.map((l, i) => {
        const qty = Math.max(1, Math.floor(Number(l.qty)) || 1);
        return {
          line_type: l.line_type,
          ref_id: l.ref_id ?? null,
          code: l.code,
          description: l.description,
          qty,
          unit_price_mmk: l.unit_price_mmk,
          line_total_mmk: qty * l.unit_price_mmk,
          sort_order: i,
        };
      }),
    };
  }

  function applySavedBill(b: {
    id: number;
    bill_no: string;
    status: string;
    patient_id?: number | null;
    created_at: string;
    lines?: OpdBillLine[];
    discount_value?: number;
    discount_unit?: string;
  }) {
    setBillId(b.id);
    setBillNo(b.bill_no);
    setBillStatus(b.status);
    setPatientId(b.patient_id ?? null);
    setCreatedAt(b.created_at);
    setLines(
      (b.lines ?? []).map((l) => ({
        ...l,
        line_total_mmk: l.qty * l.unit_price_mmk,
      })),
    );
    const discount = discountFieldsFromBill(b.discount_value, b.discount_unit);
    setDiscountValue(discount.value);
    setDiscountUnit(discount.unit);
  }

  function pickDoctor(d: OpdDoctor) {
    setDoctorId(String(d.id));
    setDoctorName(d.name);
  }

  function addOpdService(svc: OpdService, qty: number) {
    const n = Math.max(1, Math.floor(qty) || 1);
    setLines((prev) => [
      ...prev,
      {
        line_type: "service",
        ref_id: svc.id,
        code: svc.code,
        description: svc.name,
        qty: n,
        unit_price_mmk: svc.price_mmk,
        line_total_mmk: n * svc.price_mmk,
      },
    ]);
  }

  async function saveDraft(): Promise<number | null> {
    if (!patientName.trim()) {
      const el = patientNameRef.current;
      if (el && !el.disabled) {
        if (patientName !== "") setPatientName("");
        if (el.value !== "") el.value = "";
        el.reportValidity();
        return null;
      }
      throw new Error(userMessage("Patient name required"));
    }
    const body = buildBody();
    const b = billId ? await updateOpdBill(billId, body) : await createOpdBill(body);
    applySavedBill(b);
    setOkMsg(`${t("saved")} ${b.bill_no}`);
    return b.id;
  }

  async function doConfirm() {
    if (!isDraft) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      await saveDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function receiptPreviewOpts(billNoPaid: string) {
    return {
      title: t("receiptPaidTitle").replace("{bill}", billNoPaid),
      note: t("receiptAlreadyPaidNote"),
    };
  }

  async function doPrint() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      let id = billId;
      if (billStatus === "paid" && id) {
        await printOpdBill(id, receiptPreviewOpts(billNo));
        return;
      }
      if (!isDraft) {
        throw new Error(userMessage("Only draft or paid bills can be printed"));
      }
      if (lines.length === 0) throw new Error(userMessage("Add at least one line"));
      id = await saveDraft();
      if (id == null) return;
      const paid = await payOpdBill(id);
      applySavedBill(paid);
      setOkMsg(t("paidReceiptReady").replace("{bill}", paid.bill_no));
      try {
        await printOpdBill(id, receiptPreviewOpts(paid.bill_no));
      } catch {
        setError(t("receiptFailedReprint").replace("{bill}", paid.bill_no));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVoidSelected(id: number, reason: string) {
    const b = await voidOpdBill(id, reason);
    if (billId === id) {
      await openBill(id);
    }
    setOkMsg(`${t("voided")} ${b.bill_no}`);
  }

  function doCancel() {
    if (!window.confirm(t("confirmCancelBill"))) return;
    resetEditor();
  }

  function focusBillPatient() {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[data-focus="bill-patient"]')?.focus();
    });
  }

  function doNewBill() {
    const finished = billStatus === "paid" || billStatus === "void";
    if (!finished) {
      const dirty =
        Boolean(patientName.trim()) || lines.length > 0 || billId != null || Boolean(billNo);
      if (dirty && !window.confirm(t("confirmNewBill"))) return;
    }
    resetEditor();
    focusBillPatient();
  }

  async function addByCode(code: string): Promise<OpdService | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    setError(null);
    try {
      const svc = await findOpdServiceByCode(trimmed);
      if (svc) return svc;
      setError(`No service with code “${trimmed}” (medicines: use Pharmacy Billing)`);
      return null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      return null;
    }
  }

  async function loadOpdServiceSuggestions(term: string): Promise<OpdService[]> {
    return (await listOpdServices(term)).slice(0, 8);
  }

  function addConsultation() {
    const doc = doctors.find((d) => String(d.id) === doctorId);
    if (!doc) {
      setError("Pick a known doctor from suggestions to add consultation fee");
      return;
    }
    setError(null);
    setLines((prev) => [
      ...prev,
      {
        line_type: "consultation",
        ref_id: doc.id,
        code: "CONSULT",
        description: `Consultation — ${doc.name}`,
        qty: 1,
        unit_price_mmk: doc.consultation_mmk,
        line_total_mmk: doc.consultation_mmk,
      },
    ]);
  }

  function updateLineQty(index: number, qtyStr: string) {
    const trimmed = qtyStr.trim();
    const qty = trimmed === "" ? 0 : Math.floor(Number(trimmed));
    if (trimmed !== "" && (!Number.isFinite(qty) || qty < 0)) return;
    setLines((prev) => {
      const line = prev[index];
      if (!line || line.line_type === "consultation") return prev;
      const next = [...prev];
      next[index] = {
        ...line,
        qty,
        line_total_mmk: qty * line.unit_price_mmk,
      };
      return next;
    });
  }

  function commitLineQty(index: number, qty: number) {
    const n = Math.floor(qty);
    if (!Number.isFinite(n) || n < 1) return;
    updateLineQty(index, String(n));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialog) return;
      if (document.querySelector(".print-preview-overlay")) return;
      if (document.querySelector(".alert-dialog-overlay")) return;

      const key = e.key;
      if (key === "F5") {
        e.preventDefault();
        if (!busy && isDraft) void doConfirm();
        return;
      }
      if (key === "F7") {
        e.preventDefault();
        if (!busy) void doPrint();
        return;
      }
      if (key === "F9") {
        e.preventDefault();
        if (!busy) setDialog("history");
        return;
      }
      if (key === "F8" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!busy) setDialog("delete");
        return;
      }
      if (key === "F10") {
        e.preventDefault();
        if (!busy) doCancel();
        return;
      }
      if (key === "F2") {
        e.preventDefault();
        if (!busy) doNewBill();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Intentional: handlers close over latest state each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shortcut wiring
  }, [dialog, busy, isDraft, billId, billStatus, billNo, lines, patientName, discountValue, discountUnit]);

  const displayWhen = formatDisplayWhen(createdAt, nowTick);

  return (
    <>
      <OpdBillForm
        billId={billId}
        billNo={billNo}
        billStatus={billStatus}
        patientId={patientId}
        patientName={patientName}
        patientPhone={patientPhone}
        patientAge={patientAge}
        patientGender={patientGender}
        doctorId={doctorId}
        doctorName={doctorName}
        description={description}
        lines={lines}
        doctors={doctors}
        displayWhen={displayWhen}
        busy={busy}
        error={error}
        okMsg={okMsg}
        isDraft={isDraft}
        discountValue={discountValue}
        discountUnit={discountUnit}
        onDiscountValue={setDiscountValue}
        onDiscountUnit={setDiscountUnit}
        onDismissError={() => setError(null)}
        patientNameRef={patientNameRef}
        onPatientName={setPatientName}
        onPatientPhone={setPatientPhone}
        onPatientAge={setPatientAge}
        onPatientGender={setPatientGender}
        onDoctorName={setDoctorName}
        onClearDoctorId={() => setDoctorId("")}
        onPickDoctor={pickDoctor}
        onDescription={setDescription}
        onCommitService={(s, qty) => {
          setError(null);
          addOpdService(s, qty);
        }}
        onLookupService={addByCode}
        onAddConsultation={addConsultation}
        loadServiceSuggestions={loadOpdServiceSuggestions}
        onCommitLineQty={commitLineQty}
        onRemoveLine={removeLine}
        onPrint={() => void doPrint()}
        onConfirm={() => void doConfirm()}
        onHistory={() => setDialog("history")}
        onDelete={() => setDialog("delete")}
        onCancel={doCancel}
        onNewBill={doNewBill}
      />
      {dialog ? (
        <OpdBillListDialog
          mode={dialog}
          onClose={() => setDialog(null)}
          onOpen={(id) => void openBill(id)}
          onVoid={doVoidSelected}
        />
      ) : null}
    </>
  );
}

function formatDisplayWhen(createdAt: string | null, nowTick: number): string {
  const d = createdAt
    ? new Date(createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T") + "Z")
    : new Date(nowTick);
  if (Number.isNaN(d.getTime())) return createdAt ?? "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
