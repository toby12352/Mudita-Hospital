import { useEffect, useRef, useState } from "react";
import {
  createOtBillFromCase,
  createOtCase,
  findOtCatalogItem,
  findOtServiceByCode,
  getOtBill,
  getOtCase,
  listOtCatalogItems,
  listOtDoctors,
  listOtServices,
  payOtBill,
  printOtBill,
  updateOtBill,
  updateOtCase,
  voidOtBill,
  type OtBill,
  type OtCase,
  type OtCaseItem,
  type OtCatalogItem,
  type OtDoctor,
  type OtService,
} from "@/features/ot/api";
import {
  formatPackCompact,
  formatPackPreview,
  packFromItem,
  roundPayableMMK,
  saleUnitsFromPack,
  type SaleUnit,
} from "@/features/pharmacy/api";
import { ActionIcon } from "@/shared/ActionIcon";
import { BillTotals } from "@/shared/BillTotals";
import {
  discountFieldsFromBill,
  discountKyats,
  discountWrite,
  type DiscountUnit,
} from "@/shared/discount";
import { AlertDialog } from "@/shared/AlertDialog";
import { BillLineGrid, createBillLineEntry, type BillLineGridRow } from "@/shared/BillLineGrid";
import { BillCollectNote, BillPayPrintButton, moneyStatusLabel } from "@/shared/BillPayPrint";
import { userMessage } from "@/shared/errors";
import { formatMMK } from "@/shared/format";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";
import { OtHistoryModal, type OtHistoryModalMode } from "./OtHistoryModal";

/** Client-only cart order. Not sent to the API. */
type OtDraftItem = OtCaseItem & { seq: number };

type OtServiceLine = {
  seq: number;
  ref_id: number;
  code: string;
  description: string;
  qty: number;
  unit_price_mmk: number | null;
};

type OtServiceLineFields = Omit<OtServiceLine, "seq">;

function servicesFromBill(b: OtBill): OtServiceLineFields[] {
  return (b.lines ?? [])
    .filter((l) => l.line_type === "service" && l.ref_id)
    .map((l) => ({
      ref_id: l.ref_id as number,
      code: l.code,
      description: l.description,
      qty: l.qty,
      unit_price_mmk: l.unit_price_mmk,
    }));
}

export function OtPage() {
  const { t } = useI18n();
  const [doctors, setDoctors] = useState<OtDoctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<OtHistoryModalMode | null>(null);

  const [caseId, setCaseId] = useState<number | null>(null);
  const [caseNo, setCaseNo] = useState("");
  const [caseStatus, setCaseStatus] = useState("draft");
  const [patientName, setPatientName] = useState("");
  const patientNameRef = useRef<HTMLInputElement>(null);
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorFeeMmk, setDoctorFeeMmk] = useState(0);
  const [procedureName, setProcedureName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OtDraftItem[]>([]);
  const [onHandByItemId, setOnHandByItemId] = useState<Record<number, number>>({});
  const [services, setServices] = useState<OtServiceLine[]>([]);
  const [otBillId, setOtBillId] = useState<number | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  /** Next client cart seq. Not persisted. */
  const nextSeqRef = useRef(1);
  const servicesRef = useRef(services);
  servicesRef.current = services;

  const [bill, setBill] = useState<OtBill | null>(null);
  const [discountValue, setDiscountValue] = useState("");
  const [discountUnit, setDiscountUnit] = useState<DiscountUnit>("percent");

  const isDraft = caseStatus === "draft";

  function takeSeq() {
    return nextSeqRef.current++;
  }

  function stampServiceSeqs(lines: OtServiceLineFields[]): OtServiceLine[] {
    return lines.map((s) => ({ ...s, seq: takeSeq() }));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await listOtDoctors();
        if (cancelled) return;
        setDoctors(d);
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

  function resetCaseForm() {
    setCaseId(null);
    setCaseNo("");
    setCaseStatus("draft");
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    setDoctorId("");
    setDoctorName("");
    setDoctorFeeMmk(0);
    setProcedureName("");
    setNotes("");
    nextSeqRef.current = 1;
    setItems([]);
    setOnHandByItemId({});
    setServices([]);
    setOtBillId(null);
    setBill(null);
    setDiscountValue("");
    setDiscountUnit("percent");
    setCreatedAt(null);
    setError(null);
    setOkMsg(null);
  }

  function rememberOtOnHand(id: number, qty: number) {
    setOnHandByItemId((prev) => ({ ...prev, [id]: qty }));
  }

  function refreshOtOnHand(caseItems: { code: string }[]) {
    const codes = [...new Set(caseItems.map((it) => it.code.trim()).filter(Boolean))];
    for (const code of codes) {
      void findOtCatalogItem(code).then((item) => {
        if (item) rememberOtOnHand(item.id, item.ot_on_hand);
      });
    }
  }

  function stockLeftMessage(left: number, unit: string) {
    return t("stockOnlyLeft").replace("{qty}", String(Math.max(0, left))).replace("{unit}", unit);
  }

  /**
   * Reload case header and cupboard lines.
   * `serviceFields` undefined keeps the current draft services (renumbered after items).
   * Pass [] to clear, or bill service fields to replace.
   */
  function applyCase(c: OtCase, serviceFields?: OtServiceLineFields[]) {
    setCaseId(c.id);
    setCaseNo(c.case_no);
    setCaseStatus(c.status);
    setPatientName(c.patient_name);
    setPatientPhone(c.patient_phone);
    setPatientAge(c.patient_age_years != null ? String(c.patient_age_years) : "");
    setPatientGender(c.patient_gender);
    setDoctorId(c.doctor_id != null ? String(c.doctor_id) : "");
    setDoctorName(c.doctor_name || "");
    setDoctorFeeMmk(c.doctor_ot_fee_mmk ?? 0);
    setProcedureName(c.procedure_name);
    setNotes(c.notes);
    nextSeqRef.current = 1;
    const nextItems = (c.items ?? []).map((it) => ({
      ...it,
      seq: takeSeq(),
      qty_used: it.qty_used || 0,
      qty_returned: it.qty_returned || 0,
      qty_wasted: it.qty_wasted || 0,
      qty_kept_on_floor: it.qty_kept_on_floor || 0,
    }));
    setItems(nextItems);
    const keep =
      serviceFields === undefined
        ? servicesRef.current.map(({ seq: _seq, ...rest }) => rest)
        : serviceFields;
    setServices(stampServiceSeqs(keep));
    refreshOtOnHand(nextItems);
    setOtBillId(c.ot_bill_id ?? null);
    setCreatedAt(c.created_at || null);
    if (!c.ot_bill_id) {
      const discount = discountFieldsFromBill(c.discount_value, c.discount_unit);
      setDiscountValue(discount.value);
      setDiscountUnit(discount.unit);
    }
  }

  async function openCase(id: number) {
    setBusy(true);
    setError(null);
    try {
      const c = await getOtCase(id);
      if (c.ot_bill_id) {
        const b = await getOtBill(c.ot_bill_id);
        applyCase(c, servicesFromBill(b));
        setBill(b);
        const discount = discountFieldsFromBill(b.discount_value, b.discount_unit);
        setDiscountValue(discount.value);
        setDiscountUnit(discount.unit);
      } else {
        applyCase(c, []);
        setBill(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed");
    } finally {
      setBusy(false);
    }
  }

  function pickOtDoctor(d: OtDoctor) {
    setDoctorId(String(d.id));
    setDoctorName(d.name);
    setDoctorFeeMmk(d.ot_fee_mmk);
  }

  function buildWrite() {
    const age = patientAge.trim() ? Number(patientAge) : null;
    return {
      patient_name: patientName.trim(),
      patient_phone: patientPhone.trim(),
      patient_age_years: age != null && !Number.isNaN(age) ? age : null,
      patient_gender: patientGender,
      doctor_id: doctorId ? Number(doctorId) : null,
      doctor_name: doctorName.trim(),
      procedure_name: procedureName.trim(),
      notes: notes.trim(),
      ...discountWrite(discountValue, discountUnit),
      items: items.map((it) => ({
        item_id: it.item_id,
        code: it.code,
        name: it.name,
        sell_price_mmk: it.sell_price_mmk,
        qty_issued: Math.max(1, Math.floor(Number(it.qty_issued)) || 1),
        sale_qty: it.sale_unit ? Math.max(1, Math.floor(Number(it.sale_qty)) || 1) : 0,
        sale_unit: (it.sale_unit || "").trim(),
        qty_used: 0,
        qty_returned: 0,
        qty_wasted: 0,
        qty_kept_on_floor: 0,
      })),
    };
  }

  function otherIssued(itemId: number, skipIndex: number) {
    return items.reduce(
      (sum, row, i) => (i !== skipIndex && row.item_id === itemId ? sum + row.qty_issued : sum),
      0,
    );
  }

  function addOtItem(item: OtCatalogItem, qty: number, unit: SaleUnit | null) {
    const units = saleUnitsFromPack(packFromItem(item), item.sell_price_mmk);
    const chosen = unit ?? (units.length === 1 ? units[0] : null);
    if (!chosen && units.length > 0) {
      setError(`${item.code}: ${t("chooseUnit")}`);
      return;
    }
    const saleUnit = chosen?.id ?? "";
    const factor = chosen?.factor ?? 1;
    const stockQty = qty * factor;
    const already = otherIssued(item.id, -1);
    const stockUnit = item.stock_unit || packFromItem(item).pack_l3_unit || t("item");
    if (item.ot_on_hand < already + stockQty) {
      setError(stockLeftMessage(item.ot_on_hand - already, stockUnit));
      return;
    }
    rememberOtOnHand(item.id, item.ot_on_hand);
    const seq = takeSeq();
    setItems((prev) => [
      ...prev,
      {
        seq,
        item_id: item.id,
        code: item.code,
        name: item.name,
        sell_price_mmk: item.sell_price_mmk,
        qty_issued: stockQty,
        sale_qty: saleUnit ? qty : 0,
        sale_unit: saleUnit,
        pack_l1_qty: item.pack_l1_qty,
        pack_l1_unit: item.pack_l1_unit,
        pack_l2_qty: item.pack_l2_qty,
        pack_l2_unit: item.pack_l2_unit,
        pack_l3_qty: item.pack_l3_qty,
        pack_l3_unit: item.pack_l3_unit,
        qty_used: 0,
        qty_returned: 0,
        qty_wasted: 0,
        qty_kept_on_floor: 0,
      },
    ]);
    setError(null);
  }

  function addOtService(svc: OtService) {
    const seq = takeSeq();
    setServices((prev) => [
      ...prev,
      {
        seq,
        ref_id: svc.id,
        code: svc.code,
        description: svc.name,
        qty: 1,
        unit_price_mmk: svc.price_mmk,
      },
    ]);
    setError(null);
  }

  async function lookupOtItem(code: string): Promise<OtCatalogItem | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    try {
      const item = await findOtCatalogItem(trimmed);
      if (!item) {
        setError(`Unknown item code: ${trimmed}`);
        return null;
      }
      rememberOtOnHand(item.id, item.ot_on_hand);
      setError(null);
      return item;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      return null;
    }
  }

  async function lookupOtService(code: string): Promise<OtService | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    try {
      const svc = await findOtServiceByCode(trimmed);
      if (!svc) {
        setError(`Unknown service code: ${trimmed}`);
        return null;
      }
      setError(null);
      return svc;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      return null;
    }
  }

  function commitOtItemQty(index: number, qty: number): boolean {
    const it = items[index];
    if (!it) return false;
    let nextIssued = qty;
    if (it.sale_unit) {
      const units = saleUnitsFromPack(packFromItem(it), it.sell_price_mmk);
      const unit = units.find((u) => u.id.toLowerCase() === it.sale_unit!.toLowerCase());
      const factor =
        unit?.factor ?? (it.sale_qty && it.sale_qty > 0 ? it.qty_issued / it.sale_qty : 1);
      nextIssued = qty * factor;
    }
    const onHand = onHandByItemId[it.item_id];
    const already = otherIssued(it.item_id, index);
    if (onHand != null && onHand < already + nextIssued) {
      const stockUnit = it.pack_l3_unit || packFromItem(it).pack_l3_unit || t("item");
      setError(stockLeftMessage(onHand - already, stockUnit));
      return false;
    }
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        if (!row.sale_unit) return { ...row, qty_issued: qty };
        const units = saleUnitsFromPack(packFromItem(row), row.sell_price_mmk);
        const unit = units.find((u) => u.id.toLowerCase() === row.sale_unit!.toLowerCase());
        const factor =
          unit?.factor ?? (row.sale_qty && row.sale_qty > 0 ? row.qty_issued / row.sale_qty : 1);
        return { ...row, sale_qty: qty, qty_issued: qty * factor };
      }),
    );
    setError(null);
    return true;
  }

  function changeOtItemUnit(index: number, unitId: string) {
    const it = items[index];
    if (!it) return;
    const units = saleUnitsFromPack(packFromItem(it), it.sell_price_mmk);
    const unit = units.find((u) => u.id === unitId);
    if (!unit) return;
    const saleQty = it.sale_qty && it.sale_qty > 0 ? it.sale_qty : Math.max(1, it.qty_issued);
    const nextIssued = saleQty * unit.factor;
    const onHand = onHandByItemId[it.item_id];
    const already = otherIssued(it.item_id, index);
    if (onHand != null && onHand < already + nextIssued) {
      const stockUnit = it.pack_l3_unit || packFromItem(it).pack_l3_unit || t("item");
      setError(stockLeftMessage(onHand - already, stockUnit));
      return;
    }
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        return {
          ...row,
          sale_unit: unit.id,
          sale_qty: saleQty,
          qty_issued: nextIssued,
        };
      }),
    );
    setError(null);
  }

  function blockMissingPatientName(): boolean {
    if (patientName.trim()) return false;
    const el = patientNameRef.current;
    if (el && !el.disabled) {
      if (patientName !== "") setPatientName("");
      if (el.value !== "") el.value = "";
      el.reportValidity();
      return true;
    }
    setError("Patient name required");
    return true;
  }

  async function saveDraft() {
    if (blockMissingPatientName()) return;
    setBusy(true);
    setError(null);
    try {
      const body = buildWrite();
      const c = caseId ? await updateOtCase(caseId, body) : await createOtCase(body);
      applyCase(c);
      setOkMsg(`${t("saved")} ${c.case_no}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function ensureBillReady(): Promise<OtBill | null> {
    if (blockMissingPatientName()) return null;
    const body = buildWrite();
    let id = caseId;
    let status = caseStatus;
    if (!id) {
      const created = await createOtCase(body);
      applyCase(created);
      id = created.id;
      status = created.status;
    } else if (status === "draft") {
      const updated = await updateOtCase(id, body);
      applyCase(updated);
      status = updated.status;
    }

    if (otBillId && bill?.id === otBillId && bill.status !== "draft") {
      return bill;
    }

    if (services.some((s) => s.unit_price_mmk == null)) {
      setError(t("servicePriceRequired"));
      return null;
    }
    const serviceLines = services.map((s) => ({
      line_type: "service" as const,
      ref_id: s.ref_id,
      code: s.code,
      description: s.description,
      qty: 1,
      unit_price_mmk: s.unit_price_mmk as number,
      line_total_mmk: s.unit_price_mmk as number,
    }));
    const discount = discountWrite(discountValue, discountUnit);

    if (otBillId) {
      const existing = bill?.id === otBillId ? bill : await getOtBill(otBillId);
      if (existing.status !== "draft") {
        setBill(existing);
        return existing;
      }
      const updated = await updateOtBill(otBillId, serviceLines, discount);
      setBill(updated);
      setServices(stampServiceSeqs(servicesFromBill(updated)));
      return updated;
    }

    const b = await createOtBillFromCase(id!, serviceLines, discount);
    setBill(b);
    setServices(stampServiceSeqs(servicesFromBill(b)));
    setOtBillId(b.id);
    setCaseStatus("billed");
    setOkMsg(`${t("saved")} ${b.bill_no}`);
    return b;
  }

  function receiptPreviewOpts(billNoPaid: string) {
    return {
      title: t("receiptPaidTitle").replace("{bill}", billNoPaid),
      note: t("receiptAlreadyPaidNote"),
    };
  }

  async function doPrintAndPay() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const b = await ensureBillReady();
      if (!b) return;
      const billId = b.id;
      if (b.status === "paid") {
        await printOtBill(billId, receiptPreviewOpts(b.bill_no));
        return;
      }
      if (b.status !== "draft") {
        throw new Error(userMessage("Only draft or paid bills can be printed"));
      }
      const paid = await payOtBill(billId);
      setBill(paid);
      setOkMsg(t("paidReceiptReady").replace("{bill}", paid.bill_no));
      try {
        await printOtBill(billId, receiptPreviewOpts(paid.bill_no));
      } catch {
        setError(t("receiptFailedReprint").replace("{bill}", paid.bill_no));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
    }
  }

  function doCancelForm() {
    if (!window.confirm(t("otDeskCancelConfirm"))) return;
    resetCaseForm();
  }

  function focusBillPatient() {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[data-focus="bill-patient"]')?.focus();
    });
  }

  function doNewBill() {
    const finished = caseStatus === "billed";
    if (!finished) {
      const dirty =
        Boolean(patientName.trim()) ||
        items.length > 0 ||
        services.length > 0 ||
        caseId != null ||
        Boolean(caseNo);
      if (dirty && !window.confirm(t("confirmNewBill"))) return;
    }
    resetCaseForm();
    focusBillPatient();
  }

  async function voidFromHistory(c: OtCase, reason: string) {
    if (!c.ot_bill_id) {
      throw new Error("No bill to void");
    }
    const b = await voidOtBill(c.ot_bill_id, reason);
    setOkMsg(t("voidOtDone").replace("{bill}", b.bill_no));
    if (otBillId === c.ot_bill_id) {
      setBill(b);
      setCaseStatus("draft");
      setOtBillId(null);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialog) return;
      if (document.querySelector(".print-preview-overlay")) return;
      if (document.querySelector(".alert-dialog-overlay")) return;
      const key = e.key;
      if (key === "F5") {
        e.preventDefault();
        if (!busy && isDraft) void saveDraft();
        return;
      }
      if (key === "F7") {
        e.preventDefault();
        if (!busy) void doPrintAndPay();
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
        if (!busy) doCancelForm();
        return;
      }
      if (key === "F2") {
        e.preventDefault();
        if (!busy) doNewBill();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- desk shortcuts
  }, [dialog, busy, isDraft, caseId, caseNo, caseStatus, patientName, items, services, otBillId, bill, discountValue, discountUnit]);

  const itemsTotal = items.reduce((sum, it) => {
    const units = saleUnitsFromPack(packFromItem(it), it.sell_price_mmk);
    const chosen = it.sale_unit
      ? units.find((u) => u.id.toLowerCase() === it.sale_unit!.toLowerCase())
      : undefined;
    const saleQty = it.sale_qty ?? 0;
    if (chosen && saleQty > 0) {
      return sum + chosen.price_mmk * saleQty;
    }
    return sum + roundPayableMMK(it.sell_price_mmk) * Math.max(0, it.qty_issued);
  }, 0);
  const servicesTotal = services.reduce(
    (sum, s) => sum + (s.unit_price_mmk == null ? 0 : s.unit_price_mmk),
    0,
  );
  const liveGross = itemsTotal + servicesTotal + doctorFeeMmk;
  const grossTotal = bill ? bill.total_mmk + (bill.discount_mmk ?? 0) : liveGross;
  const discountOff = bill && bill.status !== "draft"
    ? (bill.discount_mmk ?? 0)
    : discountKyats(grossTotal, discountValue, discountUnit);
  const netTotal = Math.max(0, grossTotal - discountOff);
  const paidAmount = bill?.status === "paid" ? netTotal : 0;
  const balanceAmount = Math.max(0, netTotal - paidAmount);
  const discountEditable = bill ? bill.status === "draft" : isDraft;
  const displayWhen = formatDisplayWhen(createdAt, nowTick);

  const otKinds: Array<
    { kind: "item"; index: number } | { kind: "service"; index: number } | { kind: "fee" }
  > = [];
  const otRows: BillLineGridRow[] = [];
  const cartOrder: Array<
    { kind: "item"; index: number; seq: number } | { kind: "service"; index: number; seq: number }
  > = [
    ...items.map((it, index) => ({ kind: "item" as const, index, seq: it.seq })),
    ...services.map((s, index) => ({ kind: "service" as const, index, seq: s.seq })),
  ].sort((a, b) => a.seq - b.seq);

  for (const entry of cartOrder) {
    if (entry.kind === "item") {
      const it = items[entry.index];
      const units = saleUnitsFromPack(packFromItem(it), it.sell_price_mmk);
      const chosen = it.sale_unit
        ? units.find((u) => u.id.toLowerCase() === it.sale_unit!.toLowerCase())
        : undefined;
      const saleQty = it.sale_qty ?? 0;
      const qty = it.sale_unit && saleQty > 0 ? saleQty : it.qty_issued;
      const price = chosen
        ? chosen.price_mmk
        : roundPayableMMK(it.sell_price_mmk);
      const amount =
        chosen && saleQty > 0
          ? chosen.price_mmk * saleQty
          : price * Math.max(0, it.qty_issued);
      const pack = packFromItem(it);
      otKinds.push({ kind: "item", index: entry.index });
      otRows.push({
        key: `item-${it.seq}`,
        title: `${it.code} — ${it.name}`,
        packLabel: formatPackCompact(pack),
        packTitle: formatPackPreview(pack),
        qty,
        unitId: chosen?.id ?? (it.sale_unit || null),
        units: chosen
          ? units.map((u) => ({ id: u.id, label: u.label }))
          : it.sale_unit
            ? [{ id: it.sale_unit, label: it.sale_unit }]
            : [],
        priceMmk: price,
        amountMmk: amount,
        removable: true,
      });
    } else {
      const s = services[entry.index];
      otKinds.push({ kind: "service", index: entry.index });
      otRows.push({
        key: `svc-${s.seq}`,
        title: s.code ? `${s.code} — ${s.description}` : s.description,
        qty: 1,
        priceMmk: s.unit_price_mmk,
        amountMmk: s.unit_price_mmk ?? 0,
        qtyLocked: true,
        priceEditable: true,
        removable: true,
      });
    }
  }
  if (doctorFeeMmk > 0) {
    otKinds.push({ kind: "fee" });
    otRows.push({
      key: "ot-fee",
      title: doctorName ? `${t("doctorOtFee")} — ${doctorName}` : t("doctorOtFee"),
      qty: 1,
      priceMmk: doctorFeeMmk,
      amountMmk: doctorFeeMmk,
      locked: true,
      removable: false,
    });
  }

  return (
    <>
      <section className="opd-bill-desk">
        <div className="opd-bill-desk-main">
          <h2 className="opd-bill-desk-title">{t("otBillTitle")}</h2>

          <div className="opd-bill-header">
            <div className="opd-bill-header-col">
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("idName")}</span>
                <input
                  ref={patientNameRef}
                  className="opd-bill-input grow"
                  data-focus="bill-patient"
                  value={patientName}
                  disabled={!isDraft}
                  required={isDraft}
                  onChange={(e) => setPatientName(e.target.value)}
                  autoFocus
                  aria-label={t("patientName")}
                />
              </label>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("phone")}</span>
                <input
                  className="opd-bill-input"
                  value={patientPhone}
                  disabled={!isDraft}
                  onChange={(e) => setPatientPhone(e.target.value)}
                />
              </label>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("age")}</span>
                <span className="opd-bill-control">
                  <input
                    className="opd-bill-input opd-bill-input--narrow"
                    value={patientAge}
                    disabled={!isDraft}
                    inputMode="numeric"
                    onChange={(e) => setPatientAge(e.target.value)}
                  />
                  <span className="opd-bill-unit">{t("ageYearsShort")}</span>
                </span>
              </label>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("gender")}</span>
                <select
                  className="opd-bill-input"
                  value={patientGender}
                  disabled={!isDraft}
                  onChange={(e) => setPatientGender(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="M">{t("genderM")}</option>
                  <option value="F">{t("genderF")}</option>
                  <option value="Other">{t("genderOther")}</option>
                </select>
              </label>
              <div className="opd-bill-field opd-bill-field--typeahead">
                <span className="opd-bill-label">{t("doctor")}</span>
                <Typeahead
                  label=""
                  value={doctorName}
                  disabled={!isDraft}
                  placeholder={t("doctorPlaceholder")}
                  onChange={(v) => {
                    setDoctorName(v);
                    setDoctorId("");
                    setDoctorFeeMmk(0);
                  }}
                  loadSuggestions={async (term) => {
                    const qq = term.trim().toLowerCase();
                    if (!qq) return doctors.slice(0, 8);
                    return doctors
                      .filter(
                        (d) =>
                          d.name.toLowerCase().includes(qq) ||
                          (d.specialty || "").toLowerCase().includes(qq),
                      )
                      .slice(0, 8);
                  }}
                  getKey={(d) => d.id}
                  renderOption={(d) => (
                    <>
                      <span className="typeahead-title">{d.name}</span>
                      <span className="typeahead-sub">
                        {d.specialty || t("general")} · OT {formatMMK(d.ot_fee_mmk)} {t("mmk")}
                      </span>
                    </>
                  )}
                  onPick={pickOtDoctor}
                />
              </div>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("remark")}</span>
                <input
                  className="opd-bill-input grow"
                  value={notes}
                  disabled={!isDraft}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>

            <div className="opd-bill-header-col">
              <div className="opd-bill-field">
                <span className="opd-bill-label">{t("dateTime")}</span>
                <span className="opd-bill-readonly">{displayWhen}</span>
              </div>
              <div className="opd-bill-field">
                <span className="opd-bill-label">{t("vouNo")}</span>
                <span className="opd-bill-readonly">{caseNo || "—"}</span>
              </div>
              <div className="opd-bill-field">
                <span className="opd-bill-label">{t("currency")}</span>
                <span className="opd-bill-readonly">{t("kyats")}</span>
              </div>
              <div className="opd-bill-field">
                <span className="opd-bill-label">{t("procedure")}</span>
                <input
                  className="opd-bill-input grow"
                  value={procedureName}
                  disabled={!isDraft}
                  onChange={(e) => setProcedureName(e.target.value)}
                  placeholder={t("procedurePlaceholder")}
                />
              </div>
              <div className="opd-bill-field">
                <span className="opd-bill-label">{t("status")}</span>
                <span className="opd-bill-readonly">
                  {moneyStatusLabel(bill?.status ?? caseStatus, t)}
                </span>
              </div>
              {bill?.bill_no ? (
                <div className="opd-bill-field">
                  <span className="opd-bill-label">{t("bill")}</span>
                  <span className="opd-bill-readonly">{bill.bill_no}</span>
                </div>
              ) : null}
            </div>
          </div>

          <BillLineGrid
            draft={isDraft}
            showUnitColumn
            showPackColumn
            itemHeader={t("particular")}
            priceHeader={t("fees")}
            emptyLabel={t("noCartItems")}
            rows={otRows}
            onQtyCommit={(index, qty) => {
              const kind = otKinds[index];
              if (!kind || kind.kind === "fee" || kind.kind === "service") return false;
              if (kind.kind === "item") return commitOtItemQty(kind.index, qty);
              return false;
            }}
            onPriceCommit={(index, priceMmk) => {
              const kind = otKinds[index];
              if (!kind || kind.kind !== "service") return false;
              setServices((prev) =>
                prev.map((s, i) => (i === kind.index ? { ...s, unit_price_mmk: priceMmk } : s)),
              );
              return true;
            }}
            onUnitChange={(index, unitId) => {
              const kind = otKinds[index];
              if (!kind || kind.kind !== "item") return;
              changeOtItemUnit(kind.index, unitId);
            }}
            onRemove={(index) => {
              const kind = otKinds[index];
              if (!kind || kind.kind === "fee") return;
              if (kind.kind === "item") {
                setItems((prev) => prev.filter((_, i) => i !== kind.index));
              } else {
                setServices((prev) => prev.filter((_, i) => i !== kind.index));
              }
            }}
            entries={[
              createBillLineEntry<OtCatalogItem>(
                {
                  key: "cupboard",
                  placeholder: t("pharmacyItemPlaceholder"),
                  ariaLabel: t("cupboardItemLabel"),
                  loadSuggestions: async (term) => listOtCatalogItems(term),
                  getKey: (item) => item.id,
                  itemTitle: (item) => `${item.code} — ${item.name}`,
                  renderOption: (item) => (
                    <>
                      <span className="typeahead-title">
                        {item.code} — {item.name}
                      </span>
                      <span className="typeahead-sub">
                        {item.stock_unit || t("item")} · {formatMMK(item.sell_price_mmk)} {t("mmk")} ·{" "}
                        {t("otOnHand")} {item.ot_on_hand.toLocaleString()} {item.stock_unit || ""}
                      </span>
                    </>
                  ),
                  unitsFor: (item) =>
                    saleUnitsFromPack(packFromItem(item), item.sell_price_mmk).map((u) => ({
                      id: u.id,
                      label: u.label,
                    })),
                  packFor: (item) => formatPackCompact(packFromItem(item)),
                  packTitleFor: (item) => formatPackPreview(packFromItem(item)),
                  onCommit: (item, qty, unit) => {
                    const units = saleUnitsFromPack(packFromItem(item), item.sell_price_mmk);
                    addOtItem(
                      item,
                      qty,
                      unit ? (units.find((u) => u.id === unit.id) ?? null) : null,
                    );
                  },
                  onSubmitCode: lookupOtItem,
                },
                {
                  showUnitColumn: true,
                  showPackColumn: true,
                  sourceLabel: t("otInventory"),
                  sourceIcon: "box",
                },
              ),
              createBillLineEntry<OtService>(
                {
                  key: "service",
                  placeholder: t("optionalServicePlaceholder"),
                  ariaLabel: t("optionalService"),
                  loadSuggestions: async (term) => listOtServices(term),
                  getKey: (svc) => svc.id,
                  itemTitle: (svc) => (svc.code ? `${svc.code} — ${svc.name}` : svc.name),
                  renderOption: (svc) => (
                    <>
                      <span className="typeahead-title">
                        {svc.code ? `${svc.code} — ${svc.name}` : svc.name}
                      </span>
                      <span className="typeahead-sub">
                        {t("serviceType")}
                        {svc.price_mmk == null
                          ? ""
                          : ` · ${formatMMK(svc.price_mmk)} ${t("mmk")}`}
                      </span>
                    </>
                  ),
                  unitsFor: () => [],
                  commitOnPick: true,
                  onCommit: (svc) => addOtService(svc),
                  onSubmitCode: lookupOtService,
                },
                {
                  showUnitColumn: true,
                  showPackColumn: true,
                  sourceLabel: t("otServices"),
                  sourceIcon: "clipboard",
                },
              ),
            ]}
          />

          <div className="opd-bill-footer">
            <div className="opd-bill-footer-left">
              <span className="opd-bill-service-count">
                {t("serviceCount")}: {items.length + services.length}
              </span>
              {!caseId ? <span className="opd-bill-new-badge">{t("newBadge")}</span> : null}
            </div>
            <BillTotals
              total={grossTotal}
              paid={paidAmount}
              balance={balanceAmount}
              discountValue={discountValue}
              discountUnit={discountUnit}
              editable={discountEditable}
              onDiscountValue={setDiscountValue}
              onDiscountUnit={setDiscountUnit}
              note={
                <BillCollectNote
                  status={bill?.status ?? "draft"}
                  balance={balanceAmount}
                  sideEffect="ot"
                />
              }
            />
          </div>

          {okMsg ? <p className="form-ok">{okMsg}</p> : null}
        </div>

        <aside className="opd-bill-rail" aria-label={t("billActions")}>
          <BillPayPrintButton
            status={bill?.status ?? "draft"}
            busy={busy}
            onClick={() => void doPrintAndPay()}
          />
          <button
            type="button"
            className="opd-bill-rail-btn"
            disabled={busy || !isDraft}
            onClick={() => void saveDraft()}
          >
            <span className="opd-bill-rail-btn-main">
              <ActionIcon name="check" />
              <span>{t("saveDraft")}</span>
            </span>
            <kbd>F5</kbd>
          </button>
          <button
            type="button"
            className="opd-bill-rail-btn"
            disabled={busy}
            onClick={() => setDialog("history")}
          >
            <span className="opd-bill-rail-btn-main">
              <ActionIcon name="history" />
              <span>{t("history")}</span>
            </span>
            <kbd>F9</kbd>
          </button>
          <button
            type="button"
            className="opd-bill-rail-btn opd-bill-rail-btn--danger"
            disabled={busy}
            onClick={() => setDialog("delete")}
          >
            <span className="opd-bill-rail-btn-main">
              <ActionIcon name="trash" />
              <span>{t("vDelete")}</span>
            </span>
            <kbd>^F8</kbd>
          </button>
          <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={doCancelForm}>
            <span>{t("cancel")}</span>
            <kbd>F10</kbd>
          </button>
          <button
            type="button"
            className={`opd-bill-rail-btn${!isDraft ? " opd-bill-rail-btn--accent" : ""}`}
            disabled={busy}
            onClick={doNewBill}
          >
            <span className="opd-bill-rail-btn-main">
              <ActionIcon name="plus" />
              <span>{t("newBill")}</span>
            </span>
            <kbd>F2</kbd>
          </button>
        </aside>

        <AlertDialog message={error ?? ""} onClose={() => setError(null)} />
      </section>

      {dialog ? (
        <OtHistoryModal
          mode={dialog}
          onClose={() => setDialog(null)}
          onOpen={(id) => void openCase(id)}
          onVoid={voidFromHistory}
        />
      ) : null}
    </>
  );
}

function formatDisplayWhen(createdAt: string | null, nowTick: number): string {
  const d = createdAt
    ? new Date(createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T") + "Z")
    : new Date(nowTick);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
