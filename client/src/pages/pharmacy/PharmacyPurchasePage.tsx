import { useEffect, useRef, useState } from "react";
import {
  createPharmacyPurchaseBill,
  findItemByCode,
  formatPackCompact,
  formatPackPreview,
  getPharmacyPurchaseBill,
  listPharmacyItems,
  markPharmacyPurchaseBillPrinted,
  packFromItem,
  payPharmacyPurchaseBill,
  printPharmacyPurchaseBill,
  purgePharmacyPurchaseBill,
  saleUnitsFromPack,
  updatePharmacyPurchaseBill,
  voidPharmacyPurchaseBill,
  type PharmacyItem,
  type PharmacyPurchaseBill,
  type PharmacyPurchaseBillLine,
} from "@/features/pharmacy/api";
import { useClinicActions } from "@/app/clinicActions";
import { AlertDialog } from "@/shared/AlertDialog";
import { BillBtnIcon } from "@/shared/BillBtnIcon";
import { BillLineGrid, type BillLineEntryNode, type BillLineUnitOption } from "@/shared/BillLineGrid";
import {
  BillMarkPaidButton,
  BillPrintButton,
  BillSaveDraftButton,
  moneyStatusLabel,
} from "@/shared/BillPayPrint";
import { BillTotals } from "@/shared/BillTotals";
import { BillDateField, formatUtcAsLocal } from "@/shared/BillDateField";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";
import { useBillActionFeedback, useBillActionPending } from "@/shared/useActionLock";
import {
  PharmacyPurchaseListDialog,
  type PharmacyPurchaseListDialogMode,
} from "@/pages/pharmacy/PharmacyPurchaseListDialog";

type DeskConfirm = "cancel" | "newBill";

type DraftLine = {
  key: string;
  item_id: number;
  code: string;
  description: string;
  qty: number;
  unit: string;
  line_total_mmk: number;
  expiry_date: string;
  packLabel: string;
  packTitle: string;
  units: BillLineUnitOption[];
};

function parseWholeQty(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

function parseNonNegKyat(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0) return "invalid";
  return n;
}

function openSelect(el: HTMLSelectElement | null) {
  if (!el) return;
  el.focus();
  if (typeof el.showPicker !== "function") return;
  window.setTimeout(() => {
    if (!el.isConnected) return;
    try {
      el.showPicker();
    } catch {
      // Focus is enough when showPicker is refused.
    }
  }, 0);
}

function PurchaseEntryRow({
  onAdd,
}: {
  onAdd: (line: {
    item: PharmacyItem;
    qty: number;
    unit: BillLineUnitOption;
    lineTotalMmk: number;
    expiry: string;
  }) => void;
}) {
  const { t } = useI18n();
  const rowRef = useRef<HTMLDivElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLSelectElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const pickedRef = useRef<PharmacyItem | null>(null);
  const unitIdRef = useRef("");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PharmacyItem | null>(null);
  const [qty, setQty] = useState("");
  const [unitId, setUnitId] = useState("");
  const [expiry, setExpiry] = useState("");
  const [price, setPrice] = useState("");

  const units = picked
    ? saleUnitsFromPack(packFromItem(picked), picked.sell_price_mmk).map((u) => ({
        id: u.id,
        label: u.label,
      }))
    : [];
  const packLabel = picked ? formatPackCompact(packFromItem(picked)) : "";
  const packTitle = picked ? formatPackPreview(packFromItem(picked)) : "";

  pickedRef.current = picked;
  unitIdRef.current = unitId;

  useEffect(() => {
    if (!picked) return;
    qtyRef.current?.focus();
  }, [picked]);

  useEffect(() => {
    function needsUnitPick() {
      const item = pickedRef.current;
      if (!item) return false;
      if (unitIdRef.current) return false;
      return saleUnitsFromPack(packFromItem(item), item.sell_price_mmk).length > 0;
    }
    function onPointer(ev: PointerEvent) {
      if (!needsUnitPick()) return;
      const target = ev.target;
      if (target instanceof Node && rowRef.current?.contains(target)) return;
      if (document.activeElement === unitRef.current) return;
      ev.preventDefault();
      openSelect(unitRef.current);
    }
    function onFocusIn(ev: FocusEvent) {
      if (!needsUnitPick()) return;
      const target = ev.target;
      if (target instanceof Node && rowRef.current?.contains(target)) return;
      openSelect(unitRef.current);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  function resetEntry() {
    pickedRef.current = null;
    unitIdRef.current = "";
    setPicked(null);
    setQty("");
    setUnitId("");
    setExpiry("");
    setPrice("");
    setText("");
  }

  function finishQty(raw: string) {
    const item = pickedRef.current;
    if (!item) return;
    const options = saleUnitsFromPack(packFromItem(item), item.sell_price_mmk);
    if (options.length > 0 && !unitIdRef.current) {
      openSelect(unitRef.current);
      return;
    }
    const n = parseWholeQty(raw);
    if (n == null) return;
    expiryRef.current?.focus();
  }

  function chooseUnit(id: string) {
    if (!picked) return;
    if (!id) {
      setUnitId("");
      return;
    }
    setUnitId(id);
    const n = parseWholeQty(qty);
    if (n == null) {
      qtyRef.current?.focus();
      return;
    }
    expiryRef.current?.focus();
  }

  function tryCommit() {
    if (!picked) return;
    const n = parseWholeQty(qty);
    if (n == null) {
      qtyRef.current?.focus();
      return;
    }
    const options = saleUnitsFromPack(packFromItem(picked), picked.sell_price_mmk);
    const chosen = options.find((u) => u.id === unitId);
    if (!chosen) {
      openSelect(unitRef.current);
      return;
    }
    const p = parseNonNegKyat(price);
    if (p === "invalid" || p == null) {
      priceRef.current?.focus();
      return;
    }
    const exp = expiry.trim();
    if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
      expiryRef.current?.focus();
      return;
    }
    onAdd({
      item: picked,
      qty: n,
      unit: { id: chosen.id, label: chosen.label },
      lineTotalMmk: p,
      expiry: exp,
    });
    resetEntry();
    window.requestAnimationFrame(() => {
      rowRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    });
  }

  return (
    <div className="opd-bill-grid-row bill-line-entry" ref={rowRef}>
      <span className="bill-line-cell bill-line-typeahead">
        {picked ? (
          <input
            className="opd-bill-input"
            value={picked.name}
            readOnly
            aria-label={t("medicines")}
            onFocus={() => qtyRef.current?.focus()}
          />
        ) : (
          <Typeahead
            className="bill-line-typeahead"
            value={text}
            onChange={setText}
            ariaLabel={t("medicines")}
            placeholder={t("medicineLabel")}
            loadSuggestions={(q) => listPharmacyItems(q)}
            getKey={(item) => item.id}
            renderOption={(item) => (
              <span>
                {item.code} · {item.name}
              </span>
            )}
            onPick={(item) => {
              setPicked(item);
              setText("");
              setQty("");
              setUnitId("");
              setExpiry("");
              setPrice("");
            }}
            onSubmitWithoutPick={async () => {
              const code = text.trim();
              if (!code) return;
              const item = await findItemByCode(code);
              if (!item) return;
              setPicked(item);
              setText("");
              setQty("");
              setUnitId("");
              setExpiry("");
              setPrice("");
            }}
          />
        )}
      </span>
      <span className="bill-line-pack" title={packTitle || undefined}>
        {picked ? packLabel : null}
      </span>
      <span className="bill-line-cell bill-line-expiry-cell">
        {picked ? (
          <input
            ref={expiryRef}
            className="bill-line-expiry-input"
            type="date"
            value={expiry}
            aria-label={t("expiry")}
            onChange={(e) => setExpiry(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                resetEntry();
                return;
              }
              if (e.key !== "Enter") return;
              e.preventDefault();
              priceRef.current?.focus();
            }}
          />
        ) : null}
      </span>
      <span className="num bill-line-cell">
        <input
          ref={qtyRef}
          className="qty-input"
          value={qty}
          aria-label={t("qty")}
          inputMode="numeric"
          disabled={!picked}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => finishQty(qty)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              resetEntry();
              return;
            }
            if (e.key !== "Enter") return;
            e.preventDefault();
            finishQty(qty);
          }}
        />
      </span>
      <span className="bill-line-cell bill-line-unit">
        {picked && units.length > 0 ? (
          <select
            ref={unitRef}
            className="bill-unit-select"
            value={unitId}
            aria-label={t("unit")}
            onChange={(e) => chooseUnit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              resetEntry();
            }}
          >
            <option value="">{t("unit")}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        ) : null}
      </span>
      <span className="num bill-line-cell">
        <input
          ref={priceRef}
          className="qty-input"
          value={price}
          aria-label={t("purchasePrice")}
          inputMode="numeric"
          disabled={!picked}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              resetEntry();
              return;
            }
            if (e.key !== "Enter") return;
            e.preventDefault();
            tryCommit();
          }}
        />
      </span>
      <span />
    </div>
  );
}

/** Pharmacy desk for receiving stock purchases into MAIN. */
export function PharmacyPurchasePage() {
  const { t } = useI18n();
  const { billPurge } = useClinicActions();
  const lineSeq = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { action: pendingAction, pending, begin, end } = useBillActionPending();
  const { pulse, isOk, isErr } = useBillActionFeedback();
  const [dialog, setDialog] = useState<PharmacyPurchaseListDialogMode | null>(null);
  const [confirm, setConfirm] = useState<DeskConfirm | null>(null);
  const [printAfterPay, setPrintAfterPay] = useState<string | null>(null);

  const [billId, setBillId] = useState<number | null>(null);
  const [billNo, setBillNo] = useState("");
  const [billStatus, setBillStatus] = useState("draft");
  const [printedAt, setPrintedAt] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const isDraft = billStatus === "draft";

  useEffect(() => {
    if (createdAt) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [createdAt]);

  function nextLineKey() {
    lineSeq.current += 1;
    return `pu-${lineSeq.current}`;
  }

  function lineTitle(l: DraftLine): string {
    return l.description;
  }

  function linesFromBill(rows: PharmacyPurchaseBillLine[] | undefined): DraftLine[] {
    return (rows ?? []).map((l) => ({
      key: nextLineKey(),
      item_id: l.item_id,
      code: l.code,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      line_total_mmk: l.line_total_mmk,
      expiry_date: l.expiry_date ?? "",
      packLabel: "",
      packTitle: "",
      units: [{ id: l.unit, label: l.unit }],
    }));
  }

  function resetEditor() {
    setBillId(null);
    setPrintedAt(null);
    setBillNo("");
    setBillStatus("draft");
    setSupplierName("");
    setDescription("");
    setLines([]);
    setCreatedAt(null);
    setError(null);
  }

  function applySavedBill(b: PharmacyPurchaseBill) {
    setBillId(b.id);
    setBillNo(b.bill_no);
    setBillStatus(b.status);
    setPrintedAt(b.printed_at ?? null);
    setSupplierName(b.supplier_name ?? "");
    setDescription(b.description ?? "");
    setCreatedAt(b.created_at);
    setLines(linesFromBill(b.lines));
  }

  async function openBill(id: number) {
    setBusy(true);
    setError(null);
    try {
      const b = await getPharmacyPurchaseBill(id);
      applySavedBill(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed");
    } finally {
      setBusy(false);
    }
  }

  function blockInvalidDraft(): boolean {
    if (lines.length === 0) {
      setError(t("expenseNoLines"));
      return true;
    }
    return false;
  }

  function buildBody() {
    return {
      supplier_name: supplierName.trim(),
      description: description.trim(),
      lines: lines.map((l) => ({
        item_id: l.item_id,
        qty: Math.max(1, Math.floor(Number(l.qty)) || 1),
        unit: l.unit,
        line_total_mmk: Math.max(0, Math.floor(Number(l.line_total_mmk)) || 0),
        ...(l.expiry_date.trim() ? { expiry_date: l.expiry_date.trim() } : {}),
      })),
    };
  }

  async function saveDraft(): Promise<number | null> {
    if (blockInvalidDraft()) return null;
    const body = buildBody();
    const b = billId
      ? await updatePharmacyPurchaseBill(billId, body)
      : await createPharmacyPurchaseBill(body);
    applySavedBill(b);
    return b.id;
  }

  async function doConfirm() {
    if (!isDraft) return;
    if (!begin("saveDraft")) return;
    setBusy(true);
    setError(null);
    try {
      const id = await saveDraft();
      if (id != null) pulse("saveDraft", "ok");
    } catch (e) {
      pulse("saveDraft", "err");
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
      end();
    }
  }

  function paidReceiptPreviewOpts(billNoPaid: string) {
    return {
      title: t("receiptPaidTitle").replace("{bill}", billNoPaid),
      note: t("receiptAlreadyPaidNote"),
    };
  }

  function printedReceiptPreviewOpts(billNoPrinted: string) {
    return {
      title: t("receiptPrintedTitle").replace("{bill}", billNoPrinted),
      note: t("receiptPrintedNote"),
    };
  }

  async function doPrint() {
    if (!begin("print")) return;
    setBusy(true);
    setError(null);
    try {
      let id = billId;
      if (billStatus === "paid" && id) {
        await printPharmacyPurchaseBill(id, paidReceiptPreviewOpts(billNo));
        pulse("print", "ok");
        return;
      }
      if (!isDraft) {
        throw new Error(t("errBillFinished"));
      }
      id = await saveDraft();
      if (id == null) return;
      const stamped = await markPharmacyPurchaseBillPrinted(id);
      applySavedBill(stamped);
      await printPharmacyPurchaseBill(id, printedReceiptPreviewOpts(stamped.bill_no));
      pulse("print", "ok");
    } catch (e) {
      pulse("print", "err");
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
      end();
    }
  }

  async function doMarkPurchased() {
    if (!begin("markPaid")) return;
    setBusy(true);
    setError(null);
    try {
      if (billStatus === "paid") return;
      if (!isDraft) {
        throw new Error(t("errBillFinished"));
      }
      const id = await saveDraft();
      if (id == null) return;
      const paid = await payPharmacyPurchaseBill(id);
      applySavedBill(paid);
      pulse("markPaid", "ok");
      setPrintAfterPay(paid.bill_no);
    } catch (e) {
      pulse("markPaid", "err");
      setError(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
      end();
    }
  }

  async function doVoidSelected(id: number, reason: string) {
    try {
      await voidPharmacyPurchaseBill(id, reason);
      if (billId === id) {
        await openBill(id);
      }
      pulse("void", "ok");
    } catch (e) {
      pulse("void", "err");
      throw e;
    }
  }

  async function doPurgeSelected(id: number) {
    try {
      await purgePharmacyPurchaseBill(id);
      if (billId === id) {
        resetEditor();
      }
      pulse("purge", "ok");
    } catch (e) {
      pulse("purge", "err");
      throw e;
    }
  }

  function doCancel() {
    setConfirm("cancel");
  }

  function doNewBill() {
    const finished = billStatus === "paid" || billStatus === "void";
    if (!finished) {
      const dirty =
        Boolean(supplierName.trim()) ||
        Boolean(description.trim()) ||
        lines.length > 0 ||
        billId != null ||
        Boolean(billNo);
      if (dirty) {
        setConfirm("newBill");
        return;
      }
    }
    resetEditor();
  }

  function runConfirm() {
    if (confirm === "cancel" || confirm === "newBill") {
      setConfirm(null);
      resetEditor();
    }
  }

  function printAfterMarkPaid() {
    setPrintAfterPay(null);
    void doPrint();
  }

  function addLine(args: {
    item: PharmacyItem;
    qty: number;
    unit: BillLineUnitOption;
    lineTotalMmk: number;
    expiry: string;
  }) {
    const pack = packFromItem(args.item);
    setError(null);
    setLines((prev) => [
      ...prev,
      {
        key: nextLineKey(),
        item_id: args.item.id,
        code: args.item.code,
        description: args.item.name,
        qty: args.qty,
        unit: args.unit.id,
        line_total_mmk: args.lineTotalMmk,
        expiry_date: args.expiry,
        packLabel: formatPackCompact(pack),
        packTitle: formatPackPreview(pack),
        units: saleUnitsFromPack(pack, args.item.sell_price_mmk).map((u) => ({
          id: u.id,
          label: u.label,
        })),
      },
    ]);
  }

  function commitLineQty(index: number, qty: number) {
    const n = Math.floor(qty);
    if (!Number.isFinite(n) || n < 1) return false;
    setLines((prev) => {
      const line = prev[index];
      if (!line) return prev;
      const next = [...prev];
      next[index] = { ...line, qty: n };
      return next;
    });
    return true;
  }

  function commitLineUnit(index: number, unitId: string) {
    setLines((prev) => {
      const line = prev[index];
      if (!line) return prev;
      const next = [...prev];
      next[index] = { ...line, unit: unitId };
      return next;
    });
    return true;
  }

  function commitLinePrice(index: number, priceMmk: number | null) {
    if (priceMmk == null || priceMmk < 0) return false;
    setLines((prev) => {
      const line = prev[index];
      if (!line) return prev;
      const next = [...prev];
      next[index] = { ...line, line_total_mmk: priceMmk };
      return next;
    });
    return true;
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
      if (key === "F6") {
        e.preventDefault();
        if (!busy) void doPrint();
        return;
      }
      if (key === "F7") {
        e.preventDefault();
        if (!busy && isDraft) void doMarkPurchased();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shortcut wiring
  }, [
    dialog,
    busy,
    isDraft,
    billId,
    billStatus,
    billNo,
    lines,
    supplierName,
    description,
  ]);

  const total = lines.reduce((sum, l) => sum + l.line_total_mmk, 0);
  const paid = billStatus === "paid" ? total : 0;
  const balance = billStatus === "paid" ? 0 : total;
  const displayWhen = formatUtcAsLocal(createdAt, nowTick);

  const entry: BillLineEntryNode = {
    key: "purchase",
    sourceLabel: t("pharmacyPurchaseBills"),
    sourceIcon: "box",
    node: <PurchaseEntryRow onAdd={addLine} />,
  };

  return (
    <>
      <section className="opd-bill-desk">
        <div className="opd-bill-desk-main">
          <h2 className="opd-bill-desk-title">{t("pharmacyPurchaseBills")}</h2>

          <div className="opd-bill-header">
            <div className="opd-bill-header-col">
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("supplierName")}</span>
                <input
                  className="opd-bill-input"
                  value={supplierName}
                  disabled={!isDraft}
                  aria-label={t("supplierName")}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
              </label>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("remark")}</span>
                <input
                  className="opd-bill-input grow"
                  value={description}
                  disabled={!isDraft}
                  aria-label={t("remark")}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>

            <div className="opd-bill-header-col">
              <BillDateField
                editable={false}
                value=""
                displayWhen={displayWhen}
                onChange={() => {}}
                disabled={busy}
              />
              <div className="opd-bill-field">
                <span className="opd-bill-label">{t("vouNo")}</span>
                <span className="opd-bill-readonly">{billNo || "—"}</span>
              </div>
              <div className="opd-bill-field">
                <span className="opd-bill-label">{t("currency")}</span>
                <span className="opd-bill-readonly">{t("kyats")}</span>
              </div>
              <div className="opd-bill-field">
                <span className="opd-bill-label">{t("status")}</span>
                <span className="opd-bill-readonly">
                  {moneyStatusLabel(billStatus || "draft", t, printedAt)}
                </span>
              </div>
            </div>
          </div>

          <BillLineGrid
            draft={isDraft}
            itemHeader={t("medicines")}
            priceHeader={t("purchasePrice")}
            emptyLabel={t("expenseNoLines")}
            showPackColumn
            showExpiryColumn
            showUnitColumn
            showAmountColumn={false}
            rows={lines.map((l) => ({
              key: l.key,
              title: lineTitle(l),
              qty: l.qty,
              unitId: l.unit,
              units: l.units.length ? l.units : [{ id: l.unit, label: l.unit }],
              packLabel: l.packLabel,
              packTitle: l.packTitle,
              expiryLabel: l.expiry_date || "",
              priceMmk: l.line_total_mmk,
              amountMmk: l.line_total_mmk,
              priceEditable: true,
              removable: true,
            }))}
            onQtyCommit={commitLineQty}
            onUnitChange={commitLineUnit}
            onPriceCommit={commitLinePrice}
            onRemove={removeLine}
            entries={[entry]}
          />

          <div className="opd-bill-footer">
            <div className="opd-bill-footer-left">
              <span className="opd-bill-service-count">
                {t("serviceCount")}: {lines.length}
              </span>
              {!billId ? <span className="opd-bill-new-badge">{t("newBadge")}</span> : null}
            </div>
            <BillTotals
              total={total}
              paid={paid}
              balance={balance}
              discountValue=""
              discountUnit="percent"
              editable={false}
              onDiscountValue={() => {}}
              onDiscountUnit={() => {}}
              note={
                isDraft && balance > 0 ? (
                  <p className="opd-bill-collect-note">{t("markPurchasedCollects")}</p>
                ) : null
              }
            />
          </div>
        </div>

        <aside className="opd-bill-rail" aria-label={t("billActions")}>
          <BillMarkPaidButton
            status={billStatus || "draft"}
            busy={busy}
            pending={pending && pendingAction === "markPaid"}
            success={isOk("markPaid")}
            fail={isErr("markPaid")}
            collectLabel={t("markPurchased")}
            collectSubLabel={t("marksPurchased")}
            onClick={() => void doMarkPurchased()}
          />
          <BillPrintButton
            status={billStatus || "draft"}
            busy={busy}
            pending={pending && pendingAction === "print"}
            success={isOk("print")}
            fail={isErr("print")}
            onClick={() => void doPrint()}
          />
          <BillSaveDraftButton
            busy={busy}
            enabled={isDraft}
            pending={pending && pendingAction === "saveDraft"}
            success={isOk("saveDraft")}
            fail={isErr("saveDraft")}
            onClick={() => void doConfirm()}
          />
          <button
            type="button"
            className="opd-bill-rail-btn"
            disabled={busy}
            onClick={() => setDialog("history")}
            data-guide="bill-history"
          >
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon name="history" />
              <span>{t("history")}</span>
            </span>
            <kbd>F9</kbd>
          </button>
          <button
            type="button"
            className={`opd-bill-rail-btn opd-bill-rail-btn--danger${isErr("void") ? " opd-bill-rail-btn--shake" : ""}`}
            disabled={busy}
            onClick={() => setDialog("delete")}
            data-guide="bill-void"
          >
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon name="trash" success={isOk("void")} />
              <span>{t("vDelete")}</span>
            </span>
            <kbd>^F8</kbd>
          </button>
          {billPurge ? (
            <button
              type="button"
              className={`opd-bill-rail-btn opd-bill-rail-btn--danger${isErr("purge") ? " opd-bill-rail-btn--shake" : ""}`}
              disabled={busy}
              onClick={() => setDialog("purge")}
            >
              <span className="opd-bill-rail-btn-main">
                <BillBtnIcon name="trash" success={isOk("purge")} />
                <span>{t("delete")}</span>
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className="opd-bill-rail-btn"
            disabled={busy}
            onClick={doCancel}
            data-guide="bill-cancel"
          >
            <span>{t("cancel")}</span>
            <kbd>F10</kbd>
          </button>
          <button
            type="button"
            className={`opd-bill-rail-btn${!isDraft ? " opd-bill-rail-btn--accent" : ""}`}
            disabled={busy}
            onClick={doNewBill}
            data-guide="bill-new"
          >
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon name="plus" />
              <span>{t("newPurchase")}</span>
            </span>
            <kbd>F2</kbd>
          </button>
        </aside>

        <AlertDialog message={error ?? ""} onClose={() => setError(null)} />
      </section>

      {dialog ? (
        <PharmacyPurchaseListDialog
          mode={dialog}
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
          title={t("paid")}
          message={t("paidPrintPrompt").replace("{bill}", printAfterPay)}
          confirmLabel={t("print")}
          onClose={() => setPrintAfterPay(null)}
          onConfirm={printAfterMarkPaid}
        />
      ) : null}
    </>
  );
}
