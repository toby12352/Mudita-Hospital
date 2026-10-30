import { useEffect, useRef, useState } from "react";
import {
  chargeIpdChargeBill,
  createIpdChargeBill,
  getIpdAdmission,
  getIpdChargeBill,
  markIpdChargeBillPrinted,
  printIpdChargeBill,
  purgeIpdChargeBill,
  updateIpdChargeBill,
  voidIpdChargeBill,
  type IpdAdmission,
  type IpdChargeBill,
  type IpdChargeBillLine,
} from "@/features/ipd/api";
import { PatientChartTypeahead } from "@/features/patients/PatientChartTypeahead";
import { getPatient, type PatientChart } from "@/features/patients/api";
import { useClinicActions } from "@/app/clinicActions";
import { AlertDialog } from "@/shared/AlertDialog";
import { BillBtnIcon } from "@/shared/BillBtnIcon";
import { BillDateField, formatUtcAsLocal } from "@/shared/BillDateField";
import { BillLineGrid, type BillLineEntryNode } from "@/shared/BillLineGrid";
import {
  BillChargeToIpdButton,
  BillPrintButton,
  BillSaveDraftButton,
  moneyStatusLabel,
} from "@/shared/BillPayPrint";
import { BillTotals } from "@/shared/BillTotals";
import {
  discountFieldsFromBill,
  discountKyats,
  discountWrite,
  type DiscountUnit,
} from "@/shared/discount";
import { useI18n } from "@/shared/i18n";
import { useBillActionFeedback, useBillActionPending } from "@/shared/useActionLock";
import {
  IpdChargeBillListDialog,
  type IpdChargeBillListDialogMode,
} from "@/pages/ipd/IpdChargeBillListDialog";

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

function parseAgeYears(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0) return "invalid";
  return n;
}

function IpdFreeTextEntry({
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

/** Free-text charge slip posted onto the chart's open stay. Not desk cash. */
export function IpdChargeBillPage() {
  const { t } = useI18n();
  const { billPurge } = useClinicActions();
  const lineSeq = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { action: pendingAction, pending, begin, end } = useBillActionPending();
  const { pulse, isOk, isErr } = useBillActionFeedback();
  const [dialog, setDialog] = useState<IpdChargeBillListDialogMode | null>(null);
  const [confirm, setConfirm] = useState<DeskConfirm | null>(null);

  const [billId, setBillId] = useState<number | null>(null);
  const [billNo, setBillNo] = useState("");
  const [billStatus, setBillStatus] = useState("draft");
  const [printedAt, setPrintedAt] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [openStay, setOpenStay] = useState<IpdAdmission | null>(null);
  const [stayFor, setStayFor] = useState<number | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discountValue, setDiscountValue] = useState("");
  const [discountUnit, setDiscountUnit] = useState<DiscountUnit>("percent");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const isDraft = billStatus === "draft";
  const identityEditable = isDraft && patientId == null;
  const stayKnown = patientId != null && stayFor === patientId;
  const showCharge = isDraft && openStay != null;
  const showAdmitFirst = isDraft && stayKnown && openStay == null;

  useEffect(() => {
    if (createdAt) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [createdAt]);

  useEffect(() => {
    if (patientId == null) {
      setStayFor(null);
      setOpenStay(null);
      return;
    }
    const id = patientId;
    let cancelled = false;
    setStayFor(null);
    setOpenStay(null);
    (async () => {
      try {
        const patient = await getPatient(id);
        if (cancelled) return;
        const admissionId = patient.open_admission_id ?? null;
        if (admissionId == null) {
          setOpenStay(null);
          setStayFor(id);
          return;
        }
        const admission = await getIpdAdmission(admissionId);
        if (cancelled) return;
        setOpenStay(admission.status === "open" ? admission : null);
        setStayFor(id);
      } catch {
        if (!cancelled) {
          setOpenStay(null);
          setStayFor(id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  function nextLineKey() {
    lineSeq.current += 1;
    return `ipb-${lineSeq.current}`;
  }

  function linesFromBill(rows: IpdChargeBillLine[] | undefined): DraftLine[] {
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
    setPatientId(null);
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    setLines([]);
    setDiscountValue("");
    setDiscountUnit("percent");
    setCreatedAt(null);
    setError(null);
  }

  function applySavedBill(b: IpdChargeBill) {
    setBillId(b.id);
    setBillNo(b.bill_no);
    setBillStatus(b.status);
    setPrintedAt(b.printed_at ?? null);
    setPatientId(b.patient_id ?? null);
    setPatientName(b.patient_name);
    setPatientPhone(b.patient_phone ?? "");
    setPatientAge(b.patient_age_years != null ? String(b.patient_age_years) : "");
    setPatientGender(b.patient_gender ?? "");
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
      const b = await getIpdChargeBill(id);
      applySavedBill(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed");
    } finally {
      setBusy(false);
    }
  }

  function pickPatient(p: PatientChart) {
    setPatientId(p.id);
    setPatientName(p.name);
    setPatientPhone(p.phone || "");
    setPatientAge(p.age_years != null ? String(p.age_years) : "");
    setPatientGender(p.gender || "");
    setError(null);
  }

  function clearPatient() {
    setPatientId(null);
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    focusPatient();
  }

  function blockInvalidDraft(): boolean {
    if (!patientName.trim()) {
      setPatientName("");
      setError(t("errPatientNameRequired"));
      focusPatient();
      return true;
    }
    const age = parseAgeYears(patientAge);
    if (age === "invalid") {
      setError(t("ipdAgeInvalid"));
      return true;
    }
    if (lines.length === 0) {
      setError(t("errAddLine"));
      return true;
    }
    if (lines.some((l) => !l.description.trim())) {
      setError(t("ipdParticularRequired"));
      return true;
    }
    if (lines.some((l) => l.unit_price_mmk == null)) {
      setError(t("ipdLineFeeRequired"));
      return true;
    }
    return false;
  }

  function buildBody() {
    const age = parseAgeYears(patientAge);
    return {
      patient_id: patientId,
      patient_name: patientName.trim(),
      patient_phone: patientPhone.trim(),
      patient_age_years: age === "invalid" ? null : age,
      patient_gender: patientGender,
      ...discountWrite(discountValue, discountUnit),
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
    const b = billId ? await updateIpdChargeBill(billId, body) : await createIpdChargeBill(body);
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

  function slipTitle(no: string) {
    return t("ipdBillPrintTitle").replace("{bill}", no);
  }

  async function doPrint() {
    if (!begin("print")) return;
    setBusy(true);
    setError(null);
    try {
      let id = billId;
      if (billStatus === "charged" && id) {
        await printIpdChargeBill(id, slipTitle(billNo));
        pulse("print", "ok");
        return;
      }
      if (!isDraft) {
        throw new Error(t("errBillFinished"));
      }
      id = await saveDraft();
      if (id == null) return;
      const stamped = await markIpdChargeBillPrinted(id);
      applySavedBill(stamped);
      await printIpdChargeBill(id, slipTitle(stamped.bill_no));
      pulse("print", "ok");
    } catch (e) {
      pulse("print", "err");
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
      end();
    }
  }

  async function doCharge() {
    if (!isDraft || openStay == null) return;
    if (!begin("chargeIpd")) return;
    setBusy(true);
    setError(null);
    try {
      const id = await saveDraft();
      if (id == null) return;
      const charged = await chargeIpdChargeBill(id);
      applySavedBill(charged);
      pulse("chargeIpd", "ok");
    } catch (e) {
      pulse("chargeIpd", "err");
      setError(e instanceof Error ? e.message : "Charge failed");
    } finally {
      setBusy(false);
      end();
    }
  }

  async function doVoidSelected(id: number, reason: string) {
    try {
      await voidIpdChargeBill(id, reason);
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
      await purgeIpdChargeBill(id);
      if (billId === id) {
        resetEditor();
      }
      pulse("purge", "ok");
    } catch (e) {
      pulse("purge", "err");
      throw e;
    }
  }

  function focusPatient() {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[data-focus="bill-patient"]')?.focus();
    });
  }

  function doCancel() {
    setConfirm("cancel");
  }

  function doNewBill() {
    const finished = billStatus === "charged" || billStatus === "void" || billStatus === "deleted";
    if (!finished) {
      const dirty =
        Boolean(patientName.trim()) || lines.length > 0 || billId != null || Boolean(billNo);
      if (dirty) {
        setConfirm("newBill");
        return;
      }
    }
    resetEditor();
    focusPatient();
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
      focusPatient();
    }
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
  }, [
    dialog,
    busy,
    isDraft,
    billId,
    billStatus,
    billNo,
    lines,
    patientId,
    patientName,
    patientPhone,
    patientAge,
    patientGender,
    discountValue,
    discountUnit,
    openStay,
  ]);

  const total = lines.reduce(
    (sum, l) => sum + l.qty * (l.unit_price_mmk == null ? 0 : l.unit_price_mmk),
    0,
  );
  const net = Math.max(0, total - discountKyats(total, discountValue, discountUnit));
  const posted = billStatus === "charged";
  const paid = posted ? net : 0;
  const balance = posted ? 0 : net;
  const displayWhen = formatUtcAsLocal(createdAt, nowTick);
  const idName =
    patientId != null ? `${patientId} / ${patientName}` : patientName;

  const freeTextEntry: BillLineEntryNode = {
    key: "ipd-charge",
    sourceLabel: t("ipdBillTitle"),
    sourceIcon: "clipboard",
    node: (
      <IpdFreeTextEntry
        onAdd={addFreeTextLine}
        onBlankParticular={() => setError(t("ipdParticularRequired"))}
      />
    ),
  };

  return (
    <>
      <section className="opd-bill-desk">
        <div className="opd-bill-desk-main">
          <h2 className="opd-bill-desk-title">{t("ipdBillTitle")}</h2>

          <div className="opd-bill-header">
            <div className="opd-bill-header-col">
              <div className="opd-bill-field opd-bill-field--typeahead">
                <span className="opd-bill-label">{t("idName")}</span>
                {identityEditable ? (
                  <PatientChartTypeahead
                    value={patientName}
                    onChange={(v) => {
                      setPatientName(v);
                      setPatientId(null);
                    }}
                    onPick={pickPatient}
                  />
                ) : (
                  <div className="opd-bill-control">
                    <input
                      className="opd-bill-input"
                      data-focus="bill-patient"
                      value={idName}
                      disabled
                      aria-label={t("patientName")}
                    />
                    {isDraft && patientId != null ? (
                      <button type="button" className="btn action opd-bill-consult" onClick={clearPatient}>
                        {t("clearPatient")}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("phone")}</span>
                <input
                  className="opd-bill-input"
                  value={patientPhone}
                  disabled={!identityEditable}
                  aria-label={t("phone")}
                  onChange={(e) => setPatientPhone(e.target.value)}
                />
              </label>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("age")}</span>
                <span className="opd-bill-control">
                  <input
                    className="opd-bill-input opd-bill-input--narrow"
                    value={patientAge}
                    disabled={!identityEditable}
                    inputMode="numeric"
                    aria-label={t("age")}
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
                  disabled={!identityEditable}
                  aria-label={t("gender")}
                  onChange={(e) => setPatientGender(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="M">{t("genderM")}</option>
                  <option value="F">{t("genderF")}</option>
                  <option value="Other">{t("genderOther")}</option>
                </select>
              </label>
              {openStay ? (
                <>
                  <div className="opd-bill-field">
                    <span className="opd-bill-label">{t("admissionNo")}</span>
                    <span className="opd-bill-readonly">{openStay.admission_no || "—"}</span>
                  </div>
                  <div className="opd-bill-field">
                    <span className="opd-bill-label">{t("roomNo")}</span>
                    <span className="opd-bill-readonly">{openStay.room_no || "—"}</span>
                  </div>
                </>
              ) : null}
              {showAdmitFirst ? (
                <div className="opd-bill-field">
                  <span className="opd-bill-label" />
                  <p className="form-error" role="alert">
                    {t("ipdAdmitFirst")}
                  </p>
                </div>
              ) : null}
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
            itemHeader={t("particular")}
            priceHeader={t("fees")}
            emptyLabel={t("errAddLine")}
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
            />
          </div>
        </div>

        <aside className="opd-bill-rail" aria-label={t("billActions")}>
          {showCharge ? (
            <BillChargeToIpdButton
              busy={busy}
              icon="transfer"
              pending={pending && pendingAction === "chargeIpd"}
              success={isOk("chargeIpd")}
              fail={isErr("chargeIpd")}
              onClick={() => void doCharge()}
            />
          ) : null}
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
        <IpdChargeBillListDialog
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
    </>
  );
}
