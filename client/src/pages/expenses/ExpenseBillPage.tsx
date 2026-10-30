import { useEffect, useRef, useState } from "react";
import {
  createExpenseBill,
  getExpenseBill,
  markExpenseBillPrinted,
  payExpenseBill,
  printExpenseBill,
  purgeExpenseBill,
  updateExpenseBill,
  voidExpenseBill,
  type ExpenseBill,
  type ExpenseBillLine,
  type ExpensePortal,
} from "@/features/expenses/api";
import { AlertDialog } from "@/shared/AlertDialog";
import { BillBtnIcon } from "@/shared/BillBtnIcon";
import { BillLineGrid, type BillLineEntryNode } from "@/shared/BillLineGrid";
import {
  BillCollectNote,
  BillMarkPaidButton,
  BillPrintButton,
  BillSaveDraftButton,
  moneyStatusLabel,
} from "@/shared/BillPayPrint";
import { getStoredUser } from "@/shared/auth";
import { BillDateField, formatUtcAsLocal, nowDatetimeLocal } from "@/shared/BillDateField";
import { BillTotals } from "@/shared/BillTotals";
import {
  discountFieldsFromBill,
  discountKyats,
  discountWrite,
  type DiscountUnit,
} from "@/shared/discount";
import { useClinicActions } from "@/app/clinicActions";
import { useI18n } from "@/shared/i18n";
import { useBillActionFeedback, useBillActionPending } from "@/shared/useActionLock";
import {
  ExpenseBillListDialog,
  type ExpenseBillListDialogMode,
} from "@/pages/expenses/ExpenseBillListDialog";

type DeskConfirm = "cancel" | "newBill";

type DraftLine = {
  key: string;
  description: string;
  qty: number;
  unit_price_mmk: number | null;
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

function ExpenseFreeTextEntry({
  onAdd,
  onBlankParticular,
}: {
  onAdd: (description: string, qty: number, unitPriceMmk: number) => void;
  onBlankParticular: () => void;
}) {
  const { t } = useI18n();
  const particularRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const [particular, setParticular] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  function resetAndFocus() {
    setParticular("");
    setQty("1");
    setPrice("");
    window.requestAnimationFrame(() => particularRef.current?.focus());
  }

  function tryCommit() {
    const desc = particular.trim();
    if (!desc) {
      onBlankParticular();
      particularRef.current?.focus();
      return;
    }
    const n = parseWholeQty(qty);
    if (n == null) {
      qtyRef.current?.focus();
      return;
    }
    const p = parseNonNegKyat(price);
    if (p === "invalid" || p == null) {
      priceRef.current?.focus();
      return;
    }
    onAdd(desc, n, p);
    resetAndFocus();
  }

  return (
    <div className="opd-bill-grid-row bill-line-entry">
      <span className="bill-line-cell bill-line-typeahead">
        <input
          ref={particularRef}
          className="opd-bill-input"
          value={particular}
          aria-label={t("particular")}
          placeholder={t("particular")}
          onChange={(e) => setParticular(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            qtyRef.current?.focus();
          }}
        />
      </span>
      <span className="num bill-line-cell">
        <input
          ref={qtyRef}
          className="qty-input"
          value={qty}
          aria-label={t("qty")}
          inputMode="numeric"
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              resetAndFocus();
              return;
            }
            if (e.key !== "Enter") return;
            e.preventDefault();
            priceRef.current?.focus();
          }}
        />
      </span>
      <span className="num bill-line-cell">
        <input
          ref={priceRef}
          className="qty-input"
          value={price}
          aria-label={t("fees")}
          inputMode="numeric"
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              resetAndFocus();
              return;
            }
            if (e.key !== "Enter") return;
            e.preventDefault();
            tryCommit();
          }}
        />
      </span>
      <span className="num" />
      <span />
    </div>
  );
}

/** One expense desk for OPD, OT, IPD, and Pharmacy. Lists only this portal. */
export function ExpenseBillPage({ portal }: { portal: ExpensePortal }) {
  const { t } = useI18n();
  const { billPurge } = useClinicActions();
  const nameRef = useRef<HTMLInputElement>(null);
  const lineSeq = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { action: pendingAction, pending, begin, end } = useBillActionPending();
  const { pulse, isOk, isErr } = useBillActionFeedback();
  const [dialog, setDialog] = useState<ExpenseBillListDialogMode | null>(null);
  const [confirm, setConfirm] = useState<DeskConfirm | null>(null);
  const [printAfterPay, setPrintAfterPay] = useState<string | null>(null);

  const [billId, setBillId] = useState<number | null>(null);
  const [billNo, setBillNo] = useState("");
  const [billStatus, setBillStatus] = useState("draft");
  const [printedAt, setPrintedAt] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discountValue, setDiscountValue] = useState("");
  const [discountUnit, setDiscountUnit] = useState<DiscountUnit>("percent");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [billedAtLocal, setBilledAtLocal] = useState(() => nowDatetimeLocal());
  const isAdmin = getStoredUser()?.role === "Admin";
  const dateEditable = isAdmin && billId == null;

  const isDraft = billStatus === "draft";

  useEffect(() => {
    if (createdAt) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [createdAt]);

  function nextLineKey() {
    lineSeq.current += 1;
    return `exp-${lineSeq.current}`;
  }

  function linesFromBill(rows: ExpenseBillLine[] | undefined): DraftLine[] {
    return (rows ?? []).map((l) => ({
      key: nextLineKey(),
      description: l.description,
      qty: l.qty,
      unit_price_mmk: l.unit_price_mmk,
    }));
  }

  function resetEditor() {
    setBillId(null);
    setPrintedAt(null);
    setBillNo("");
    setBillStatus("draft");
    setName("");
    setDescription("");
    setLines([]);
    setDiscountValue("");
    setDiscountUnit("percent");
    setCreatedAt(null);
    setBilledAtLocal(nowDatetimeLocal());
    setError(null);
  }

  function applySavedBill(b: ExpenseBill) {
    setBillId(b.id);
    setBillNo(b.bill_no);
    setBillStatus(b.status);
    setPrintedAt(b.printed_at ?? null);
    setName(b.name);
    setDescription(b.description ?? "");
    setCreatedAt(b.created_at);
    setLines(linesFromBill(b.lines));
    const discount = discountFieldsFromBill(b.discount_value, b.discount_unit);
    setDiscountValue(discount.value);
    setDiscountUnit(discount.unit);
  }

  async function openBill(id: number) {
    setBusy(true);
    setError(null);
    try {
      const b = await getExpenseBill(id);
      applySavedBill(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed");
    } finally {
      setBusy(false);
    }
  }

  function blockInvalidDraft(): boolean {
    if (!name.trim()) {
      if (name !== "") setName("");
      setError(t("expenseNameRequired"));
      nameRef.current?.focus();
      return true;
    }
    if (lines.length === 0) {
      setError(t("expenseNoLines"));
      return true;
    }
    if (lines.some((l) => !l.description.trim())) {
      setError(t("expenseParticularRequired"));
      return true;
    }
    if (lines.some((l) => l.unit_price_mmk == null)) {
      setError(t("servicePriceRequired"));
      return true;
    }
    return false;
  }

  function buildBody() {
    return {
      portal,
      name: name.trim(),
      description: description.trim(),
      ...discountWrite(discountValue, discountUnit),
      ...(dateEditable && billedAtLocal ? { billed_at: billedAtLocal } : {}),
      lines: lines.map((l) => ({
        description: l.description.trim(),
        qty: Math.max(1, Math.floor(Number(l.qty)) || 1),
        unit_price_mmk: l.unit_price_mmk as number,
      })),
    };
  }

  async function saveDraft(): Promise<number | null> {
    if (blockInvalidDraft()) return null;
    const body = buildBody();
    const b = billId ? await updateExpenseBill(billId, body) : await createExpenseBill(body);
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
        await printExpenseBill(id, paidReceiptPreviewOpts(billNo));
        pulse("print", "ok");
        return;
      }
      if (!isDraft) {
        throw new Error(t("errBillFinished"));
      }
      id = await saveDraft();
      if (id == null) return;
      const stamped = await markExpenseBillPrinted(id);
      applySavedBill(stamped);
      await printExpenseBill(id, printedReceiptPreviewOpts(stamped.bill_no));
      pulse("print", "ok");
    } catch (e) {
      pulse("print", "err");
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
      end();
    }
  }

  async function doMarkPaid() {
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
      const paid = await payExpenseBill(id);
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
      await voidExpenseBill(id, reason);
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
      await purgeExpenseBill(id);
      if (billId === id) {
        resetEditor();
      }
      pulse("purge", "ok");
    } catch (e) {
      pulse("purge", "err");
      throw e;
    }
  }

  function focusName() {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[data-focus="expense-name"]')?.focus();
    });
  }

  function doCancel() {
    setConfirm("cancel");
  }

  function doNewBill() {
    const finished = billStatus === "paid" || billStatus === "void";
    if (!finished) {
      const dirty = Boolean(name.trim()) || lines.length > 0 || billId != null || Boolean(billNo);
      if (dirty) {
        setConfirm("newBill");
        return;
      }
    }
    resetEditor();
    focusName();
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
      focusName();
    }
  }

  function printAfterMarkPaid() {
    setPrintAfterPay(null);
    void doPrint();
  }

  function addFreeTextLine(description: string, qty: number, unitPriceMmk: number) {
    setError(null);
    setLines((prev) => [
      ...prev,
      {
        key: nextLineKey(),
        description,
        qty,
        unit_price_mmk: unitPriceMmk,
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

  function commitLinePrice(index: number, priceMmk: number | null) {
    setLines((prev) => {
      const line = prev[index];
      if (!line) return prev;
      const next = [...prev];
      next[index] = { ...line, unit_price_mmk: priceMmk };
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
        if (!busy && isDraft) void doMarkPaid();
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
  }, [dialog, busy, isDraft, billId, billStatus, billNo, lines, name, description, discountValue, discountUnit, portal]);

  const total = lines.reduce(
    (sum, l) => sum + l.qty * (l.unit_price_mmk == null ? 0 : l.unit_price_mmk),
    0,
  );
  const net = Math.max(0, total - discountKyats(total, discountValue, discountUnit));
  const paid = billStatus === "paid" ? net : 0;
  const balance = billStatus === "paid" ? 0 : net;
  const displayWhen = formatUtcAsLocal(createdAt, nowTick);

  const freeTextEntry: BillLineEntryNode = {
    key: "expense",
    sourceLabel: t("expenses"),
    sourceIcon: "clipboard",
    node: (
      <ExpenseFreeTextEntry
        onAdd={addFreeTextLine}
        onBlankParticular={() => setError(t("expenseParticularRequired"))}
      />
    ),
  };

  return (
    <>
      <section className="opd-bill-desk">
        <div className="opd-bill-desk-main">
          <h2 className="opd-bill-desk-title">{t("expenseBillTitle")}</h2>

          <div className="opd-bill-header">
            <div className="opd-bill-header-col">
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("name")}</span>
                <input
                  ref={nameRef}
                  className="opd-bill-input"
                  data-focus="expense-name"
                  value={name}
                  required
                  disabled={!isDraft}
                  aria-label={t("name")}
                  onChange={(e) => setName(e.target.value)}
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
                editable={dateEditable}
                value={billedAtLocal}
                displayWhen={displayWhen}
                onChange={setBilledAtLocal}
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
            itemHeader={t("particular")}
            priceHeader={t("fees")}
            emptyLabel={t("expenseNoLines")}
            rows={lines.map((l) => ({
              key: l.key,
              title: l.description,
              qty: l.qty,
              priceMmk: l.unit_price_mmk,
              amountMmk: l.unit_price_mmk == null ? 0 : l.qty * l.unit_price_mmk,
              priceEditable: true,
              removable: true,
            }))}
            onQtyCommit={commitLineQty}
            onPriceCommit={commitLinePrice}
            onRemove={removeLine}
            entries={[freeTextEntry]}
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
              discountValue={discountValue}
              discountUnit={discountUnit}
              editable={isDraft}
              onDiscountValue={setDiscountValue}
              onDiscountUnit={setDiscountUnit}
              note={<BillCollectNote status={billStatus || "draft"} balance={balance} />}
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
            onClick={() => void doMarkPaid()}
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
          <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={() => setDialog("history")} data-guide="bill-history">
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
          <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={doCancel} data-guide="bill-cancel">
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
              <span>{t("newBill")}</span>
            </span>
            <kbd>F2</kbd>
          </button>
        </aside>

        <AlertDialog message={error ?? ""} onClose={() => setError(null)} />
      </section>

      {dialog ? (
        <ExpenseBillListDialog
          portal={portal}
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
