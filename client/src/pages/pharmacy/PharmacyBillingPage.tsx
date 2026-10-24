import { useEffect, useState } from "react";
import {
  createPharmacyBill,
  findItemByCode,
  getPharmacyBill,
  lineChargeFromPack,
  listPharmacyItems,
  packFromItem,
  packQtysForSale,
  payPharmacyBill,
  pharmacyLineSaleView,
  saleUnitsFromPack,
  printPharmacyBill,
  transferPharmacyBill,
  updatePharmacyBill,
  voidPharmacyBill,
  type PharmacyBill,
  type PharmacyBillKind,
  type PharmacyItem,
} from "@/features/pharmacy/api";
import { userMessage } from "@/shared/errors";
import { useI18n } from "@/shared/i18n";
import {
  PharmacyBillForm,
  type PharmacyBillLineView,
} from "@/pages/pharmacy/PharmacyBillForm";
import {
  PharmacyBillListDialog,
  type PharmacyBillListDialogMode,
} from "@/pages/pharmacy/PharmacyBillListDialog";

/** Pharmacy Billing always opens the desk form; history replaces the old list. */
export function PharmacyBillingPage({
  initialMode = "edit",
  kind = "sale",
}: {
  initialMode?: "list" | "edit";
  kind?: PharmacyBillKind;
}) {
  const { t } = useI18n();
  const isReturn = kind === "return";
  const isTransfer = kind === "transfer";
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<PharmacyBillListDialogMode | null>(
    initialMode === "list" ? "history" : null,
  );

  const [billId, setBillId] = useState<number | null>(null);
  const [billNo, setBillNo] = useState("");
  const [billStatus, setBillStatus] = useState("draft");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<PharmacyBillLineView[]>([]);
  const [onHandByItemId, setOnHandByItemId] = useState<Record<number, number>>({});
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const isDraft = billStatus === "draft";

  useEffect(() => {
    if (createdAt) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [createdAt]);

  function resetEditor() {
    setBillId(null);
    setBillNo("");
    setBillStatus("draft");
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    setDescription("");
    setLines([]);
    setOnHandByItemId({});
    setCreatedAt(null);
    setAwaitingConfirm(false);
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
    setCreatedAt(b.created_at);
    const next = b.lines ?? [];
    setLines(next);
    refreshOnHand(next);
  }

  async function openBill(id: number) {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const b = await getPharmacyBill(id);
      setBillId(b.id);
      setBillNo(b.bill_no);
      setBillStatus(b.status);
      setPatientName(b.patient_name);
      setPatientPhone(b.patient_phone || "");
      setPatientAge(b.patient_age_years != null ? String(b.patient_age_years) : "");
      setPatientGender(b.patient_gender || "");
      setDescription(b.description || "");
      const next = b.lines ?? [];
      setLines(next);
      refreshOnHand(next);
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
        billing_qty: line.billing_qty,
        billing_unit: line.billing_unit,
        stock_qty: line.stock_qty,
        stock_unit: line.stock_unit,
        unit_price_mmk: line.unit_price_mmk,
        line_total_mmk: line.line_total_mmk,
        sort_order: line.sort_order,
      })),
      save_patient: false,
      kind,
    };
  }

  function addLineFromItem(item: PharmacyItem, boxQty: number, stripQty: number, tabletQty: number) {
    const pack = packFromItem(item);
    const { total: billingQty, charge: lineTotal, error: convErr } = lineChargeFromPack(
      boxQty,
      stripQty,
      tabletQty,
      pack.pack_l2_qty,
      pack.pack_l3_qty,
      item.sell_price_mmk,
    );
    if (convErr) {
      setError(`${item.code}: ${convErr}`);
      return;
    }
    const l3 = pack.pack_l3_unit || item.billing_unit || "Tablet";
    setLines((prev) => [
      ...prev,
      {
        item_id: item.id,
        code: item.code,
        description: item.name,
        pack_l1_qty: item.pack_l1_qty,
        pack_l1_unit: item.pack_l1_unit,
        pack_l2_qty: item.pack_l2_qty,
        pack_l2_unit: item.pack_l2_unit,
        pack_l3_qty: item.pack_l3_qty,
        pack_l3_unit: item.pack_l3_unit,
        box_qty: boxQty,
        strip_qty: stripQty,
        tablet_qty: tabletQty,
        billing_qty: billingQty,
        billing_unit: l3,
        stock_qty: billingQty,
        stock_unit: l3,
        unit_price_mmk: item.sell_price_mmk,
        line_total_mmk: lineTotal,
        sort_order: prev.length,
      },
    ]);
    setError(null);
  }

  function disarm() {
    setAwaitingConfirm(false);
  }

  async function saveDraft(): Promise<PharmacyBill | null> {
    const body = buildBody();
    if (!isTransfer && !body.patient_name) throw new Error(userMessage("Patient name required"));
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

  function receiptPreviewOpts(billNoPaid: string) {
    return {
      title: receiptTitle(billNoPaid),
      note: isReturn ? t("returnReceiptAlreadyPaidNote") : t("receiptAlreadyPaidNote"),
    };
  }

  async function doPrint() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      let id = billId;
      if (billStatus === "paid" && id) {
        await printPharmacyBill(id, receiptPreviewOpts(billNo));
        return;
      }
      if (!isDraft) {
        throw new Error(userMessage("Only draft or paid bills can be printed"));
      }
      if (lines.length === 0) throw new Error(userMessage("Add at least one medicine"));
      const saved = await saveDraft();
      if (saved == null) throw new Error(userMessage("Save failed"));
      id = saved.id;
      const paid = await payPharmacyBill(id);
      applySavedBill(paid);
      setOkMsg(
        (isReturn ? t("returnedReceiptReady") : t("paidReceiptReady")).replace(
          "{bill}",
          paid.bill_no,
        ),
      );
      try {
        await printPharmacyBill(id, receiptPreviewOpts(paid.bill_no));
      } catch {
        setError(t("receiptFailedReprint").replace("{bill}", paid.bill_no));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
    }
  }

  async function doArmTransfer() {
    if (!isTransfer || !isDraft || awaitingConfirm) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      if (lines.length === 0) throw new Error(userMessage("Add at least one medicine"));
      const saved = await saveDraft();
      if (saved == null) throw new Error(userMessage("Save failed"));
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
      setOkMsg(t("transferredReady").replace("{bill}", done.bill_no));
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

  function otherStockQty(itemId: number, skipIndex: number) {
    return lines.reduce(
      (sum, line, i) => (i !== skipIndex && line.item_id === itemId ? sum + line.stock_qty : sum),
      0,
    );
  }

  function commitNewItem(item: PharmacyItem, qty: number, unitId: string | null) {
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
      const unit = pack.pack_l3_unit || item.billing_unit || "Tablet";
      if (item.stock_main < already + demand) {
        setError(stockLeftMessage(item.stock_main - already, unit));
        return;
      }
    }
    const qtys = packQtysForSale(chosen, qty);
    addLineFromItem(item, qtys.box_qty, qtys.strip_qty, qtys.tablet_qty);
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
      const stockUnit = line.stock_unit || line.pack_l3_unit || "Tablet";
      if (onHand != null && onHand < already + billing) {
        setError(stockLeftMessage(onHand - already, stockUnit));
        return false;
      }
    }
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        if (!unit) {
          return {
            ...row,
            box_qty: 0,
            strip_qty: 0,
            tablet_qty: billing,
            billing_qty: billing,
            stock_qty: billing,
            line_total_mmk: billing * row.unit_price_mmk,
          };
        }
        return {
          ...row,
          ...packQtysForSale(unit, qty),
          billing_qty: billing,
          stock_qty: billing,
          line_total_mmk: billing * row.unit_price_mmk,
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
      const stockUnit = line.stock_unit || line.pack_l3_unit || "Tablet";
      if (onHand != null && onHand < already + billing) {
        setError(stockLeftMessage(onHand - already, stockUnit));
        return;
      }
    }
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        return {
          ...row,
          ...packQtysForSale(unit, view.qty),
          billing_qty: billing,
          stock_qty: billing,
          line_total_mmk: billing * row.unit_price_mmk,
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

      const key = e.key;
      if (key === "F5") {
        e.preventDefault();
        if (!busy && isDraft) void doConfirm();
        return;
      }
      if (key === "F7") {
        e.preventDefault();
        if (busy) return;
        if (isTransfer) {
          if (!isDraft) return;
          if (awaitingConfirm) void doConfirmTransfer();
          else void doArmTransfer();
          return;
        }
        void doPrint();
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
  }, [dialog, busy, isDraft, billId, billStatus, billNo, lines, patientName, awaitingConfirm, isTransfer]);

  const displayWhen = formatDisplayWhen(createdAt, nowTick);

  return (
    <>
      <PharmacyBillForm
        billId={billId}
        billNo={billNo}
        billStatus={billStatus}
        patientName={patientName}
        patientPhone={patientPhone}
        patientAge={patientAge}
        patientGender={patientGender}
        description={description}
        lines={lines}
        displayWhen={displayWhen}
        busy={busy}
        error={error}
        okMsg={okMsg}
        isDraft={isDraft}
        kind={kind}
        awaitingConfirm={awaitingConfirm}
        onPatientName={setPatientName}
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
        onPrint={() => void doPrint()}
        onTransfer={() => void doArmTransfer()}
        onConfirmTransfer={() => void doConfirmTransfer()}
        onConfirm={() => void doConfirm()}
        onHistory={() => setDialog("history")}
        onDelete={() => setDialog("delete")}
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
