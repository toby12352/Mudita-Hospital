import { useEffect, useRef, useState } from "react";
import {
  createPharmacyBill,
  findItemByCode,
  getPharmacyBill,
  lineChargeFromPack,
  listPharmacyBills,
  listPharmacyItems,
  itemStockUnitLabel,
  packFromItem,
  packQtysForSale,
  markPharmacyBillPrinted,
  payPharmacyBill,
  pharmacyLineSaleView,
  saleUnitsFromPack,
  printPharmacyBill,
  transferPharmacyBill,
  updatePharmacyBill,
  purgePharmacyBill,
  voidPharmacyBill,
  type PharmacyBill,
  type PharmacyBillKind,
  type PharmacyItem,
} from "@/features/pharmacy/api";
import type { PatientChart } from "@/features/patients/api";
import { useOpenAdmission } from "@/features/patients/useOpenAdmission";
import { getStoredUser } from "@/shared/auth";
import { formatUtcAsLocal, nowDatetimeLocal } from "@/shared/BillDateField";
import {
  discountFieldsFromBill,
  discountWrite,
  type DiscountUnit,
} from "@/shared/discount";
import { AlertDialog } from "@/shared/AlertDialog";
import { userMessage } from "@/shared/errors";
import { useClinicActions } from "@/app/clinicActions";
import { useI18n } from "@/shared/i18n";
import {
  PharmacyBillForm,
  type PharmacyBillLineView,
} from "@/pages/pharmacy/PharmacyBillForm";
import {
  PharmacyBillListDialog,
  type PharmacyBillListDialogMode,
} from "@/pages/pharmacy/PharmacyBillListDialog";

type DeskConfirm = "cancel" | "newBill";

/** Pharmacy Billing always opens the desk form; history replaces the old list. */
export function PharmacyBillingPage({
  initialMode = "edit",
  kind = "sale",
}: {
  initialMode?: "list" | "edit";
  kind?: PharmacyBillKind;
}) {
  const { t } = useI18n();
  const { pharmacyCreate, pharmacyDelete, billPurge } = useClinicActions();
  const isReturn = kind === "return";
  const isTransfer = kind === "transfer";
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<PharmacyBillListDialogMode | null>(
    initialMode === "list" ? "history" : null,
  );
  const [confirm, setConfirm] = useState<DeskConfirm | null>(null);
  const [printAfterPay, setPrintAfterPay] = useState<string | null>(null);

  const [billId, setBillId] = useState<number | null>(null);
  const [billNo, setBillNo] = useState("");
  const [billStatus, setBillStatus] = useState("draft");
  const [printedAt, setPrintedAt] = useState<string | null>(null);
  const [collectedCash, setCollectedCash] = useState<number | null>(null);
  const [chargedSales, setChargedSales] = useState<{ id: number; bill_no: string }[]>([]);
  const [returnSaleId, setReturnSaleId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState("");
  const [linkedChartId, setLinkedChartId] = useState<number | null>(null);
  const patientNameRef = useRef<HTMLInputElement>(null);
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<PharmacyBillLineView[]>([]);
  const [discountValue, setDiscountValue] = useState("");
  const [discountUnit, setDiscountUnit] = useState<DiscountUnit>("percent");
  const [onHandByItemId, setOnHandByItemId] = useState<Record<number, number>>({});
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [billedAtLocal, setBilledAtLocal] = useState(() => nowDatetimeLocal());
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [transferDone, setTransferDone] = useState(false);
  const isAdmin = getStoredUser()?.role === "Admin";
  const dateEditable = isAdmin && billId == null;

  const isDraft = billStatus === "draft";
  const openAdmissionId = useOpenAdmission(isTransfer ? null : linkedChartId);

  useEffect(() => {
    if (createdAt) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [createdAt]);

  useEffect(() => {
    if (!isReturn || openAdmissionId == null || linkedChartId == null) {
      setChargedSales([]);
      return;
    }
    let cancelled = false;
    listPharmacyBills("", "paid", "sale", linkedChartId)
      .then((bills) => {
        if (cancelled) return;
        setChargedSales(
          bills
            .filter(
              (bill) =>
                bill.collected_cash === 0 &&
                bill.admission_id === openAdmissionId &&
                bill.bill_no.startsWith("PH-"),
            )
            .map((bill) => ({ id: bill.id, bill_no: bill.bill_no })),
        );
      })
      .catch(() => {
        if (!cancelled) setChargedSales([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isReturn, openAdmissionId, linkedChartId]);

  useEffect(() => {
    if (chargedSales.length === 0) {
      setReturnSaleId(null);
      return;
    }
    setReturnSaleId((current) =>
      current != null && chargedSales.some((sale) => sale.id === current)
        ? current
        : chargedSales[0].id,
    );
  }, [chargedSales]);

  function resetEditor() {
    setBillId(null);
    setBillNo("");
    setBillStatus("draft");
    setPrintedAt(null);
    setCollectedCash(null);
    setPatientName("");
    setLinkedChartId(null);
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    setDescription("");
    setLines([]);
    setDiscountValue("");
    setDiscountUnit("percent");
    setOnHandByItemId({});
    setCreatedAt(null);
    setBilledAtLocal(nowDatetimeLocal());
    setAwaitingConfirm(false);
    setTransferDone(false);
    setError(null);
    setOkMsg(null);
  }

  function rememberOnHand(id: number, qty: number) {
    setOnHandByItemId((prev) => ({ ...prev, [id]: qty }));
  }

  function refreshOnHand(billLines: { code: string }[]) {
    const codes = [...new Set(billLines.map((l) => l.code.trim()).filter(Boolean))];
    for (const code of codes) {
      void findItemByCode(code).then((item) => {
        if (item) rememberOnHand(item.id, item.stock_main);
      });
    }
  }

  function stockLeftMessage(left: number, unit: string) {
    return t("stockOnlyLeft").replace("{qty}", String(Math.max(0, left))).replace("{unit}", unit);
  }

  function applySavedBill(b: PharmacyBill) {
    setBillId(b.id);
    setBillNo(b.bill_no);
    setBillStatus(b.status);
    setPrintedAt(b.printed_at ?? null);
    setCollectedCash(b.collected_cash ?? null);
    setCreatedAt(b.created_at);
    const next = b.lines ?? [];
    setLines(next);
    refreshOnHand(next);
    const discount = discountFieldsFromBill(b.discount_value, b.discount_unit);
    setDiscountValue(discount.value);
    setDiscountUnit(discount.unit);
  }

  async function openBill(id: number) {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    setTransferDone(false);
    try {
      const b = await getPharmacyBill(id);
      setBillId(b.id);
      setBillNo(b.bill_no);
      setBillStatus(b.status);
      setPrintedAt(b.printed_at ?? null);
      setCollectedCash(b.collected_cash ?? null);
      setPatientName(b.patient_name);
      setLinkedChartId(isTransfer ? null : (b.patient_id ?? null));
      setPatientPhone(b.patient_phone || "");
      setPatientAge(b.patient_age_years != null ? String(b.patient_age_years) : "");
      setPatientGender(b.patient_gender || "");
      setDescription(b.description || "");
      const next = b.lines ?? [];
      setLines(next);
      refreshOnHand(next);
      const discount = discountFieldsFromBill(b.discount_value, b.discount_unit);
      setDiscountValue(discount.value);
      setDiscountUnit(discount.unit);
      setCreatedAt(b.created_at);
      setAwaitingConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  function buildBody() {
    const age = patientAge.trim() ? Number(patientAge) : null;
    const name = isTransfer ? "OT" : patientName.trim();
    return {
      patient_name: name,
      patient_phone: patientPhone.trim(),
      patient_age_years: age != null && !Number.isNaN(age) ? age : null,
      patient_gender: patientGender,
      description: description.trim(),
      lines: lines.map((line) => ({
        item_id: line.item_id,
        code: line.code,
        description: line.description,
        box_qty: line.box_qty ?? 0,
        strip_qty: line.strip_qty ?? 0,
        tablet_qty: line.tablet_qty ?? 0,
        qty_l4: line.qty_l4 ?? 0,
        qty_l5: line.qty_l5 ?? 0,
        qty_l6: line.qty_l6 ?? 0,
        pack_depth: 6,
        billing_qty: line.billing_qty,
        billing_unit: line.billing_unit,
        stock_qty: line.stock_qty,
        stock_unit: line.stock_unit,
        unit_price_mmk: line.unit_price_mmk,
        line_total_mmk: line.line_total_mmk,
        sort_order: line.sort_order,
        foc: !isReturn && !isTransfer && line.foc === 1 ? 1 : 0,
      })),
      save_patient: false,
      ...(!isTransfer && linkedChartId != null ? { patient_id: linkedChartId } : {}),
      kind,
      ...(isTransfer
        ? { discount_value: 0, discount_unit: "percent" as const }
        : discountWrite(discountValue, discountUnit)),
      ...(dateEditable && billedAtLocal ? { billed_at: billedAtLocal } : {}),
    };
  }

  function onPatientName(v: string) {
    setPatientName(v);
    setLinkedChartId(null);
  }

  function pickPatient(p: PatientChart) {
    setLinkedChartId(p.id);
    setPatientName(p.name);
    setPatientPhone(p.phone || "");
    setPatientAge(p.age_years != null ? String(p.age_years) : "");
    setPatientGender(p.gender || "");
  }

  function clearLinkedPatient() {
    setLinkedChartId(null);
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    window.setTimeout(() => patientNameRef.current?.focus(), 0);
  }

  function addLineFromItem(
    item: PharmacyItem,
    qtys: {
      box_qty: number;
      strip_qty: number;
      tablet_qty: number;
      qty_l4: number;
      qty_l5: number;
      qty_l6: number;
    },
    foc = false,
  ) {
    const pack = packFromItem(item);
    const { total: billingQty, charge: lineTotal, error: convErr } = lineChargeFromPack(
      qtys,
      pack,
      item.sell_price_mmk,
    );
    if (convErr) {
      setError(`${item.code}: ${convErr}`);
      return;
    }
    const inner = itemStockUnitLabel({ ...item, pack_l6_unit: pack.pack_l6_unit });
    setLines((prev) => [
      ...prev,
      {
        item_id: item.id,
        code: item.code,
        description: item.name,
        pack_l1_qty: pack.pack_l1_qty,
        pack_l1_unit: pack.pack_l1_unit,
        pack_l2_qty: pack.pack_l2_qty,
        pack_l2_unit: pack.pack_l2_unit,
        pack_l3_qty: pack.pack_l3_qty,
        pack_l3_unit: pack.pack_l3_unit,
        pack_l4_qty: pack.pack_l4_qty,
        pack_l4_unit: pack.pack_l4_unit,
        pack_l5_qty: pack.pack_l5_qty,
        pack_l5_unit: pack.pack_l5_unit,
        pack_l6_qty: pack.pack_l6_qty,
        pack_l6_unit: pack.pack_l6_unit,
        ...qtys,
        pack_depth: 6,
        billing_qty: billingQty,
        billing_unit: inner,
        stock_qty: billingQty,
        stock_unit: inner,
        unit_price_mmk: item.sell_price_mmk,
        line_total_mmk: lineTotal,
        sort_order: prev.length,
        foc: !isReturn && !isTransfer && foc ? 1 : 0,
      },
    ]);
    setError(null);
  }

  function disarm() {
    setAwaitingConfirm(false);
  }

  async function saveDraft(): Promise<PharmacyBill | null> {
    if (!isTransfer && !patientName.trim()) {
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
    if (body.lines.length === 0) throw new Error(userMessage("Add at least one medicine"));
    const b = billId
      ? await updatePharmacyBill(billId, body)
      : await createPharmacyBill(body);
    applySavedBill(b);
    setOkMsg(`${t("saved")} ${b.bill_no}`);
    return b;
  }

  function receiptTitle(billNoPaid: string) {
    if (isReturn) {
      return t("returnReceiptPaidTitle").replace("{bill}", billNoPaid);
    }
    return t("receiptPaidTitle").replace("{bill}", billNoPaid);
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

  function paidReceiptPreviewOpts(billNoPaid: string) {
    return {
      title: receiptTitle(billNoPaid),
      note: isReturn ? t("returnReceiptAlreadyPaidNote") : t("receiptAlreadyPaidNote"),
    };
  }

  function printedReceiptPreviewOpts(billNoPrinted: string) {
    return {
      title: t("receiptPrintedTitle").replace("{bill}", billNoPrinted),
      note: t("receiptPrintedNote"),
    };
  }

  async function doPrint() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      let id = billId;
      if (billStatus === "paid" && id) {
        await printPharmacyBill(id, paidReceiptPreviewOpts(billNo));
        return;
      }
      if (!isDraft) {
        throw new Error(userMessage("Only draft or paid bills can be printed"));
      }
      if (lines.length === 0) throw new Error(userMessage("Add at least one medicine"));
      const saved = await saveDraft();
      if (saved == null) return;
      id = saved.id;
      const stamped = await markPharmacyBillPrinted(id);
      applySavedBill(stamped);
      setOkMsg(t("printedReceiptReady").replace("{bill}", stamped.bill_no));
      await printPharmacyBill(id, printedReceiptPreviewOpts(stamped.bill_no));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
    }
  }

  async function doMarkPaid() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      if (billStatus === "paid") return;
      if (!isDraft) {
        throw new Error(userMessage("Only draft bills can be paid"));
      }
      if (lines.length === 0) throw new Error(userMessage("Add at least one medicine"));
      const saved = await saveDraft();
      if (saved == null) return;
      const paid = await payPharmacyBill(saved.id);
      applySavedBill(paid);
      setOkMsg(
        (isReturn ? t("returnedReceiptReady") : t("paidReceiptReady")).replace(
          "{bill}",
          paid.bill_no,
        ),
      );
      setPrintAfterPay(paid.bill_no);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function doChargeToIpd() {
    if (openAdmissionId == null || isReturn || isTransfer) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      if (billStatus === "paid") return;
      if (!isDraft) throw new Error(userMessage("Only draft bills can be paid"));
      if (lines.length === 0) throw new Error(userMessage("Add at least one medicine"));
      const saved = await saveDraft();
      if (saved == null) return;
      const paid = await payPharmacyBill(saved.id, { admission_id: openAdmissionId });
      applySavedBill(paid);
      setOkMsg(t("chargedToIpdReady").replace("{bill}", paid.bill_no));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function doCreditToIpd() {
    if (openAdmissionId == null || !isReturn || returnSaleId == null) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      if (billStatus === "paid") return;
      if (!isDraft) throw new Error(userMessage("Only draft bills can be paid"));
      if (lines.length === 0) throw new Error(userMessage("Add at least one medicine"));
      const saved = await saveDraft();
      if (saved == null) return;
      const paid = await payPharmacyBill(saved.id, {
        admission_id: openAdmissionId,
        source_bill_id: returnSaleId,
      });
      applySavedBill(paid);
      setOkMsg(t("creditedToIpdReady").replace("{bill}", paid.bill_no));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function doArmTransfer() {
    if (!isTransfer || !isDraft || awaitingConfirm) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    setTransferDone(false);
    try {
      if (lines.length === 0) throw new Error(userMessage("Add at least one medicine"));
      const saved = await saveDraft();
      if (saved == null) return;
      setAwaitingConfirm(true);
      setOkMsg(t("transferArmed").replace("{bill}", saved.bill_no));
    } catch (e) {
      setAwaitingConfirm(false);
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function doConfirmTransfer() {
    if (!isTransfer || !isDraft || !awaitingConfirm || billId == null) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const done = await transferPharmacyBill(billId);
      applySavedBill(done);
      setAwaitingConfirm(false);
      setTransferDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVoidSelected(id: number, reason: string) {
    const b = await voidPharmacyBill(id, reason);
    if (billId === id) {
      await openBill(id);
    }
    setOkMsg(`${t("voided")} ${b.bill_no}`);
  }

  async function doPurgeSelected(id: number) {
    await purgePharmacyBill(id);
    if (billId === id) {
      resetEditor();
    }
    setOkMsg(t("billPurged"));
  }

  function doCancel() {
    setConfirm("cancel");
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
      if (dirty) {
        setConfirm("newBill");
        return;
      }
    }
    resetEditor();
    focusBillPatient();
  }

  function runConfirm() {
    if (confirm === "cancel") {
      setConfirm(null);
      resetEditor();
      return;
    }
    if (confirm === "newBill") {
      setConfirm(null);
      resetEditor();
      focusBillPatient();
    }
  }

  function printAfterMarkPaid() {
    setPrintAfterPay(null);
    void doPrint();
  }

  function otherStockQty(itemId: number, skipIndex: number) {
    return lines.reduce(
      (sum, line, i) => (i !== skipIndex && line.item_id === itemId ? sum + line.stock_qty : sum),
      0,
    );
  }

  function commitNewItem(item: PharmacyItem, qty: number, unitId: string | null, foc = false) {
    disarm();
    const pack = packFromItem(item);
    const units = saleUnitsFromPack(pack, item.sell_price_mmk);
    const chosen = unitId ? units.find((u) => u.id === unitId) : null;
    if (!chosen) {
      setError(`${item.code}: ${t("chooseUnit")}`);
      return;
    }
    rememberOnHand(item.id, item.stock_main);
    if (!isReturn) {
      const demand = qty * chosen.factor;
      const already = otherStockQty(item.id, -1);
      const unit = itemStockUnitLabel({ ...item, pack_l6_unit: pack.pack_l6_unit });
      if (item.stock_main < already + demand) {
        setError(stockLeftMessage(item.stock_main - already, unit));
        return;
      }
    }
    const qtys = packQtysForSale(chosen, qty);
    addLineFromItem(item, qtys, foc);
  }

  function commitLineQty(index: number, qty: number): boolean {
    disarm();
    const line = lines[index];
    if (!line) return false;
    const view = pharmacyLineSaleView(line);
    if (view.locked) return false;
    const unit = view.units.find((u) => u.id === view.unitId);
    const billing = unit ? qty * unit.factor : qty;
    if (!isReturn) {
      const onHand = onHandByItemId[line.item_id];
      const already = otherStockQty(line.item_id, index);
      const stockUnit = itemStockUnitLabel(line);
      if (onHand != null && onHand < already + billing) {
        setError(stockLeftMessage(onHand - already, stockUnit));
        return false;
      }
    }
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const pack = packFromItem(row);
        if (!unit) {
          const qtys = {
            box_qty: 0,
            strip_qty: 0,
            tablet_qty: billing,
            qty_l4: 0,
            qty_l5: 0,
            qty_l6: 0,
          };
          const { charge } = lineChargeFromPack(qtys, pack, row.unit_price_mmk);
          return {
            ...row,
            ...qtys,
            billing_qty: billing,
            stock_qty: billing,
            line_total_mmk: charge,
          };
        }
        const qtys = packQtysForSale(unit, qty);
        const { charge } = lineChargeFromPack(qtys, pack, row.unit_price_mmk);
        return {
          ...row,
          ...qtys,
          billing_qty: billing,
          stock_qty: billing,
          line_total_mmk: charge,
        };
      }),
    );
    setError(null);
    return true;
  }

  function changeLineUnit(index: number, unitId: string) {
    disarm();
    const line = lines[index];
    if (!line) return;
    const view = pharmacyLineSaleView(line);
    if (view.locked) return;
    const unit = view.units.find((u) => u.id === unitId);
    if (!unit) return;
    const billing = view.qty * unit.factor;
    if (!isReturn) {
      const onHand = onHandByItemId[line.item_id];
      const already = otherStockQty(line.item_id, index);
      const stockUnit = itemStockUnitLabel(line);
      if (onHand != null && onHand < already + billing) {
        setError(stockLeftMessage(onHand - already, stockUnit));
        return;
      }
    }
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const qtys = packQtysForSale(unit, view.qty);
        const { charge } = lineChargeFromPack(qtys, packFromItem(row), row.unit_price_mmk);
        return {
          ...row,
          ...qtys,
          billing_qty: billing,
          stock_qty: billing,
          line_total_mmk: charge,
        };
      }),
    );
    setError(null);
  }

  async function lookupItem(code: string): Promise<PharmacyItem | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const found = await findItemByCode(trimmed);
    if (!found || !found.active) {
      setError(`Unknown code “${trimmed}”`);
      return null;
    }
    rememberOnHand(found.id, found.stock_main);
    setError(null);
    return found;
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialog) return;
      if (document.querySelector(".print-preview-overlay")) return;
      if (document.querySelector(".alert-dialog-overlay")) return;

      const key = e.key;
      if (key === "F5") {
        e.preventDefault();
        if (!busy && isDraft && pharmacyCreate) void doConfirm();
        return;
      }
      if (key === "F6") {
        e.preventDefault();
        if (busy || isTransfer) return;
        void doPrint();
        return;
      }
      if (key === "F7") {
        e.preventDefault();
        if (busy) return;
        if (!pharmacyCreate) return;
        if (isTransfer) {
          if (!isDraft) return;
          if (awaitingConfirm) void doConfirmTransfer();
          else void doArmTransfer();
          return;
        }
        if (isDraft) void doMarkPaid();
        return;
      }
      if (key === "F9") {
        e.preventDefault();
        if (!busy) setDialog("history");
        return;
      }
      if (key === "F8" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!busy && pharmacyDelete) setDialog("delete");
        return;
      }
      if (key === "F10") {
        e.preventDefault();
        if (!busy) doCancel();
        return;
      }
      if (key === "F2") {
        e.preventDefault();
        if (!busy && pharmacyCreate) doNewBill();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Intentional: handlers close over latest state each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shortcut wiring
  }, [dialog, busy, isDraft, billId, billStatus, billNo, lines, patientName, linkedChartId, awaitingConfirm, isTransfer, discountValue, discountUnit, pharmacyCreate, pharmacyDelete]);

  const displayWhen = formatUtcAsLocal(createdAt, nowTick);

  return (
    <>
      <PharmacyBillForm
        billId={billId}
        billNo={billNo}
        billStatus={billStatus}
        printedAt={printedAt}
        collectedCash={collectedCash}
        chargedSales={chargedSales}
        returnSaleId={returnSaleId}
        patientId={linkedChartId}
        patientName={patientName}
        patientPhone={patientPhone}
        patientAge={patientAge}
        patientGender={patientGender}
        description={description}
        lines={lines}
        displayWhen={displayWhen}
        dateEditable={dateEditable}
        billedAtLocal={billedAtLocal}
        onBilledAtLocal={setBilledAtLocal}
        busy={busy}
        error={error}
        okMsg={okMsg}
        isDraft={isDraft}
        discountValue={discountValue}
        discountUnit={discountUnit}
        onDiscountValue={setDiscountValue}
        onDiscountUnit={setDiscountUnit}
        kind={kind}
        awaitingConfirm={awaitingConfirm}
        transferDone={transferDone}
        onDismissError={() => setError(null)}
        onDismissTransferDone={() => setTransferDone(false)}
        patientNameRef={patientNameRef}
        onPatientName={onPatientName}
        onPickPatient={pickPatient}
        onClearPatient={clearLinkedPatient}
        onPatientPhone={setPatientPhone}
        onPatientAge={setPatientAge}
        onPatientGender={setPatientGender}
        onDescription={(v) => {
          disarm();
          setDescription(v);
        }}
        onCommitItem={commitNewItem}
        onLookupItem={lookupItem}
        loadItemSuggestions={async (term) => listPharmacyItems(term)}
        onCommitLineQty={commitLineQty}
        onUnitChange={changeLineUnit}
        onRemoveLine={(i) => {
          disarm();
          setLines((prev) => prev.filter((_, j) => j !== i));
        }}
        onClearFoc={(i) => {
          disarm();
          setLines((prev) =>
            prev.map((line, j) => (j === i ? { ...line, foc: 0 } : line)),
          );
        }}
        onPrint={() => void doPrint()}
        onMarkPaid={() => void doMarkPaid()}
        onChargeToIpd={
          isDraft && !isReturn && !isTransfer && openAdmissionId != null
            ? () => void doChargeToIpd()
            : undefined
        }
        onCreditToIpd={
          isDraft && isReturn && openAdmissionId != null && chargedSales.length > 0
            ? () => void doCreditToIpd()
            : undefined
        }
        onReturnSaleId={setReturnSaleId}
        onTransfer={() => void doArmTransfer()}
        onConfirmTransfer={() => void doConfirmTransfer()}
        onConfirm={() => void doConfirm()}
        onHistory={() => setDialog("history")}
        onDelete={() => setDialog("delete")}
        onPurge={billPurge ? () => setDialog("purge") : undefined}
        onCancel={doCancel}
        onNewBill={doNewBill}
      />
      {dialog ? (
        <PharmacyBillListDialog
          mode={dialog}
          kind={kind}
          onClose={() => setDialog(null)}
          onOpen={(id) => void openBill(id)}
          onVoid={doVoidSelected}
          onPurge={doPurgeSelected}
        />
      ) : null}
      {confirm ? (
        <AlertDialog
          tone="warning"
          title={t("clear")}
          message={confirm === "cancel" ? t("confirmCancelBill") : t("confirmNewBill")}
          confirmLabel={t("clear")}
          onClose={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      ) : null}
      {printAfterPay ? (
        <AlertDialog
          tone="print"
          title={isReturn ? t("markReturned") : t("paid")}
          message={(isReturn ? t("returnedPrintPrompt") : t("paidPrintPrompt")).replace(
            "{bill}",
            printAfterPay,
          )}
          confirmLabel={t("print")}
          onClose={() => setPrintAfterPay(null)}
          onConfirm={printAfterMarkPaid}
        />
      ) : null}
    </>
  );
}
