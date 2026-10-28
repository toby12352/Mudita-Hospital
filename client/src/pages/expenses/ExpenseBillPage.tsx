import { useEffect, useRef, useState } from "react";
import {
  createExpenseBill,
  findExpenseCatalogByCode,
  getExpenseBill,
  listExpenseCatalog,
  markExpenseBillPrinted,
  payExpenseBill,
  printExpenseBill,
  purgeExpenseBill,
  updateExpenseBill,
  voidExpenseBill,
  type ExpenseBill,
  type ExpenseBillLine,
  type ExpenseCatalogService,
  type ExpensePortal,
} from "@/features/expenses/api";
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import { BillLineGrid, createBillLineEntry } from "@/shared/BillLineGrid";
import {
  BillCollectNote,
  BillMarkPaidButton,
  BillPrintButton,
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
import { revealField } from "@/shared/FieldError";
import { formatMMK } from "@/shared/format";
import { useClinicActions } from "@/app/clinicActions";
import { useI18n } from "@/shared/i18n";
import {
  ExpenseBillListDialog,
  type ExpenseBillListDialogMode,
} from "@/pages/expenses/ExpenseBillListDialog";

type DeskConfirm = "cancel" | "newBill";

type DraftLine = {
  key: string;
  ref_id: number;
  code: string;
  description: string;
  qty: number;
  unit_price_mmk: number | null;
};

/** One expense desk for OPD, OT, IPD, and Pharmacy. Lists only this portal. */
export function ExpenseBillPage({ portal }: { portal: ExpensePortal }) {
  const { t } = useI18n();
  const { billPurge } = useClinicActions();
  const nameRef = useRef<HTMLInputElement>(null);
  const okMsgRef = useRef<HTMLParagraphElement>(null);
  const lineSeq = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (okMsg?.trim()) revealField(okMsgRef.current);
  }, [okMsg]);
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
      ref_id: l.ref_id ?? 0,
      code: l.code,
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
    setOkMsg(null);
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
    setOkMsg(null);
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
        ref_id: l.ref_id,
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
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      let id = billId;
      if (billStatus === "paid" && id) {
        await printExpenseBill(id, paidReceiptPreviewOpts(billNo));
        return;
      }
      if (!isDraft) {
        throw new Error(t("errBillFinished"));
      }
      id = await saveDraft();
      if (id == null) return;
      const stamped = await markExpenseBillPrinted(id);
      applySavedBill(stamped);
      setOkMsg(t("printedReceiptReady").replace("{bill}", stamped.bill_no));
      await printExpenseBill(id, printedReceiptPreviewOpts(stamped.bill_no));
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
        throw new Error(t("errBillFinished"));
      }
      const id = await saveDraft();
      if (id == null) return;
      const paid = await payExpenseBill(id);
      applySavedBill(paid);
      setOkMsg(t("paidReceiptReady").replace("{bill}", paid.bill_no));
      setPrintAfterPay(paid.bill_no);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVoidSelected(id: number, reason: string) {
    const b = await voidExpenseBill(id, reason);
    if (billId === id) {
      await openBill(id);
    }
    setOkMsg(`${t("voided")} ${b.bill_no}`);
  }

  async function doPurgeSelected(id: number) {
    await purgeExpenseBill(id);
    if (billId === id) {
      resetEditor();
    }
    setOkMsg(t("billPurged"));
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

  function addCatalogLine(svc: ExpenseCatalogService) {
    setError(null);
    setLines((prev) => [
      ...prev,
      {
        key: nextLineKey(),
        ref_id: svc.id,
        code: svc.code,
        description: svc.name,
        qty: 1,
        unit_price_mmk: svc.price_mmk,
      },
    ]);
  }

  async function lookupByCode(code: string): Promise<ExpenseCatalogService | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    setError(null);
    try {
      const svc = await findExpenseCatalogByCode(trimmed);
      if (svc) return svc;
      setError(t("expenseCodeNotFound").replace("{code}", trimmed));
      return null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      return null;
    }
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
              title: l.code ? `${l.code} — ${l.description}` : l.description,
              qty: l.qty,
              priceMmk: l.unit_price_mmk,
              amountMmk: l.unit_price_mmk == null ? 0 : l.qty * l.unit_price_mmk,
              priceEditable: true,
              removable: true,
            }))}
            onQtyCommit={commitLineQty}
            onPriceCommit={commitLinePrice}
            onRemove={removeLine}
            entries={[
              createBillLineEntry<ExpenseCatalogService>(
                {
                  key: "expense",
                  placeholder: t("optionalServicePlaceholder"),
                  ariaLabel: t("expenses"),
                  loadSuggestions: async (term) => (await listExpenseCatalog(term)).slice(0, 8),
                  getKey: (s) => s.id,
                  itemTitle: (s) => (s.code ? `${s.code} — ${s.name}` : s.name),
                  renderOption: (s) => (
                    <>
                      <span className="typeahead-title">
                        {s.code ? `${s.code} — ${s.name}` : s.name}
                      </span>
                      <span className="typeahead-sub">
                        {t("serviceType")}
                        {s.price_mmk == null ? "" : ` · ${formatMMK(s.price_mmk)} ${t("mmk")}`}
                      </span>
                    </>
                  ),
                  unitsFor: () => [],
                  commitOnPick: true,
                  onCommit: (s) => addCatalogLine(s),
                  onSubmitCode: lookupByCode,
                },
                {
                  showUnitColumn: false,
                  sourceLabel: t("expenses"),
                  sourceIcon: "clipboard",
                },
              ),
            ]}
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

          {okMsg ? (
            <p ref={okMsgRef} className="form-ok" role="status">
              {okMsg}
            </p>
          ) : null}
        </div>

        <aside className="opd-bill-rail" aria-label={t("billActions")}>
          <BillMarkPaidButton status={billStatus || "draft"} busy={busy} onClick={() => void doMarkPaid()} />
          <BillPrintButton status={billStatus || "draft"} busy={busy} onClick={() => void doPrint()} />
          <button
            type="button"
            className="opd-bill-rail-btn"
            disabled={busy || !isDraft}
            onClick={() => void doConfirm()}
          >
            <span className="opd-bill-rail-btn-main">
              <ActionIcon name="check" />
              <span>{t("saveDraft")}</span>
            </span>
            <kbd>F5</kbd>
          </button>
          <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={() => setDialog("history")}>
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
          {billPurge ? (
            <button
              type="button"
              className="opd-bill-rail-btn opd-bill-rail-btn--danger"
              disabled={busy}
              onClick={() => setDialog("purge")}
            >
              <span className="opd-bill-rail-btn-main">
                <ActionIcon name="trash" />
                <span>{t("delete")}</span>
              </span>
            </button>
          ) : null}
          <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={doCancel}>
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

