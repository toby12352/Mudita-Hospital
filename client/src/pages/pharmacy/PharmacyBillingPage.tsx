import { useEffect, useState } from "react";
import {
  createPharmacyBill,
  findItemByCode,
  getPharmacyBill,
  lineChargeFromPack,
  listPharmacyBills,
  listPharmacyItems,
  packFromItem,
  payPharmacyBill,
  printPharmacyBill,
  updatePharmacyBill,
  voidPharmacyBill,
  type PharmacyBill,
  type PharmacyBillLine,
  type PharmacyItem,
} from "@/features/pharmacy/api";
import { formatMMK } from "@/shared/format";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";
import { FormSection } from "@/shared/FormSection";
export function PharmacyBillingPage({
  initialMode = "list",
}: {
  initialMode?: "list" | "edit";
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"list" | "edit">(initialMode);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bills, setBills] = useState<PharmacyBill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [billId, setBillId] = useState<number | null>(null);
  const [billNo, setBillNo] = useState("");
  const [billStatus, setBillStatus] = useState("draft");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<PharmacyBillLine[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [pendingItem, setPendingItem] = useState<PharmacyItem | null>(null);
  const [boxQtyInput, setBoxQtyInput] = useState("");
  const [stripQtyInput, setStripQtyInput] = useState("");
  const [tabletQtyInput, setTabletQtyInput] = useState("");

  const isDraft = billStatus === "draft";
  const total = lines.reduce((s, l) => s + l.line_total_mmk, 0);

  function resetPackQty() {
    setBoxQtyInput("");
    setStripQtyInput("");
    setTabletQtyInput("");
  }

  async function reloadList(search = q, status = statusFilter) {
    setBills(await listPharmacyBills(search, status));
  }

  useEffect(() => {
    void reloadList().catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setBillId(null);
    setBillNo("");
    setBillStatus("draft");
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    setDescription("");
    setLines([]);
    setCodeInput("");
    setPendingItem(null);
    resetPackQty();
    setError(null);
    setOkMsg(null);
    setMode("edit");
  }

  async function openBill(id: number) {
    setBusy(true);
    setError(null);
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
      setLines(b.lines ?? []);
      setPendingItem(null);
      setMode("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  function buildBody() {
    const age = patientAge.trim() ? Number(patientAge) : null;
    return {
      patient_name: patientName.trim(),
      patient_phone: patientPhone.trim(),
      patient_age_years: age != null && !Number.isNaN(age) ? age : null,
      patient_gender: patientGender,
      description: description.trim(),
      lines,
      save_patient: false,
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
    setCodeInput("");
    setPendingItem(null);
    resetPackQty();
    setError(null);
    if (item.stock_main < billingQty) {
      setOkMsg(
        `${item.code}: needs ${billingQty} ${l3} but In Stock is ${item.stock_main}`,
      );
    }
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const body = buildBody();
      if (!body.patient_name) throw new Error("Patient name required");
      if (body.lines.length === 0) throw new Error("Add at least one medicine");
      const b = billId
        ? await updatePharmacyBill(billId, body)
        : await createPharmacyBill(body);
      setBillId(b.id);
      setBillNo(b.bill_no);
      setBillStatus(b.status);
      setLines(b.lines ?? []);
      setOkMsg(`Saved ${b.bill_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function doPay() {
    if (!billId) {
      setError("Save the bill first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const b = await payPharmacyBill(billId);
      setBillStatus(b.status);
      setOkMsg(`Paid ${b.bill_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVoid() {
    if (!billId) return;
    const reason = window.prompt(t("voidReasonPrompt"));
    if (!reason?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const b = await voidPharmacyBill(billId, reason.trim());
      setBillStatus(b.status);
      setOkMsg(`Voided ${b.bill_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Void failed");
    } finally {
      setBusy(false);
    }
  }

  async function doPrint() {
    if (!billId) {
      setError("Save the bill first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await printPharmacyBill(billId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
    }
  }

  const pendingPack = pendingItem ? packFromItem(pendingItem) : null;
  const preview =
    pendingItem && pendingPack
      ? (() => {
          const boxQ = Number(boxQtyInput) || 0;
          const stripQ = Number(stripQtyInput) || 0;
          const tabQ = Number(tabletQtyInput) || 0;
          if (boxQ === 0 && stripQ === 0 && tabQ === 0) return null;
          const { total: tabs, charge, error: err } = lineChargeFromPack(
            boxQ,
            stripQ,
            tabQ,
            pendingPack.pack_l2_qty,
            pendingPack.pack_l3_qty,
            pendingItem.sell_price_mmk,
          );
          if (err) return err;
          const l3 = pendingPack.pack_l3_unit;
          return `${boxQ}×${stripQ}×${tabQ} → ${tabs} ${l3} · ${formatMMK(charge)} MMK`;
        })()
      : null;

  if (mode === "list") {
    return (
      <section className="settings-panel">
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={openNew}>
            {t("newBill")}
          </button>
        </div>
        <p className="hint">{t("pharmacyBillingHint")}</p>
        <div className="list-toolbar">
          <Typeahead
            label={t("search")}
            value={q}
            onChange={setQ}
            placeholder={t("searchBillPlaceholder")}
            loadSuggestions={async (term) => listPharmacyBills(term, statusFilter)}
            getKey={(b) => b.id}
            renderOption={(b) => (
              <>
                <span className="typeahead-title">
                  {b.bill_no} — {b.patient_name}
                </span>
                <span className="typeahead-sub">
                  {b.status.toUpperCase()}
                  {b.patient_phone ? ` · ${b.patient_phone}` : ""}
                </span>
              </>
            )}
            onPick={(b) => {
              setQ(b.bill_no);
              void openBill(b.id);
            }}
            onSubmitWithoutPick={() =>
              void reloadList().catch((err) => setError(String(err)))
            }
          />
          <label className="field">
            {t("status")}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                void reloadList(q, e.target.value).catch((err) => setError(String(err)));
              }}
            >
              <option value="">{t("all")}</option>
              <option value="draft">{t("draft")}</option>
              <option value="paid">{t("paid")}</option>
              <option value="void">{t("voidStatus")}</option>
            </select>
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void reloadList().catch((e) => setError(String(e)))}
          >
            {t("search")}
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <ul className="data-list">
          {bills.length === 0 ? <li className="empty-row">{t("noBillsYet")}</li> : null}
          {bills.map((b) => (
            <li key={b.id}>
              <div>
                <p className="row-title">
                  {b.bill_no} · {b.patient_name}
                </p>
                <p className="row-sub">
                  {b.status.toUpperCase()} · {formatMMK(b.total_mmk)} {t("mmk")}
                </p>
              </div>
              <button type="button" className="btn ghost" onClick={() => void openBill(b.id)}>
                {t("open")}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="settings-panel">
      <div className="btn-row">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setMode("list");
            void reloadList();
          }}
        >
          {t("backBills")}
        </button>
        {billNo ? (
          <span className="hint">
            {billNo} · {billStatus.toUpperCase()}
          </span>
        ) : null}
      </div>

      {!billNo ? <h2 className="section-title">{t("createPharmacyBill")}</h2> : null}

      <div className="card-form">
        <FormSection title={t("patient")} titleId="pharmacy-bill-patient">
          <div className="field-row">
            <label className="field grow">
              {t("patientName")}
              <input
                value={patientName}
                disabled={!isDraft}
                onChange={(e) => setPatientName(e.target.value)}
                autoFocus
              />
            </label>
            <label className="field">
              {t("phone")}
              <input
                value={patientPhone}
                disabled={!isDraft}
                onChange={(e) => setPatientPhone(e.target.value)}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              {t("age")}
              <input
                value={patientAge}
                disabled={!isDraft}
                inputMode="numeric"
                onChange={(e) => setPatientAge(e.target.value)}
              />
            </label>
            <label className="field">
              {t("gender")}
              <select
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
          </div>
          <label className="field">
            {t("note")}
            <input
              value={description}
              disabled={!isDraft}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </FormSection>

        <FormSection title={t("medicines")} titleId="pharmacy-bill-medicines">
          {isDraft ? (
            <>
              <div className="list-toolbar">
                <Typeahead
                  label={t("medicineLabel")}
                  value={codeInput}
                  onChange={(v) => {
                    setCodeInput(v);
                    setPendingItem(null);
                  }}
                  placeholder={t("medicinePlaceholder")}
                  loadSuggestions={async (term) => listPharmacyItems(term)}
                  getKey={(item) => item.id}
                  renderOption={(item) => {
                    const dosage = (item.dosage || "").trim();
                    const l3 = item.pack_l3_unit || item.billing_unit;
                    return (
                      <>
                        <span className="typeahead-title">
                          {item.code} — {item.name}
                          {dosage ? ` (${dosage})` : ""}
                        </span>
                        <span className="typeahead-sub">
                          {t("inStock")} {item.stock_main} {l3} · {formatMMK(item.sell_price_mmk)}{" "}
                          {t("mmk")}/{l3}
                        </span>
                      </>
                    );
                  }}
                  onPick={(item) => {
                    setPendingItem(item);
                    setCodeInput(item.code);
                    resetPackQty();
                    setTabletQtyInput("1");
                    setError(null);
                  }}
                  onSubmitWithoutPick={async () => {
                    const found = await findItemByCode(codeInput);
                    if (!found) {
                      setError(`Unknown code “${codeInput.trim()}”`);
                      return;
                    }
                    setPendingItem(found);
                  }}
                />
              </div>
              <div className="qty-triple">
                <div className="qty-triple-cell">
                  <span className="muted">
                    {pendingPack?.pack_l1_unit || t("packUnitBox")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={boxQtyInput}
                    disabled={!pendingItem}
                    onChange={(e) => setBoxQtyInput(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <span className="qty-triple-star" aria-hidden="true">
                  *
                </span>
                <div className="qty-triple-cell">
                  <span className="muted">
                    {pendingPack?.pack_l2_unit || t("packUnitStrip")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={stripQtyInput}
                    disabled={!pendingItem}
                    onChange={(e) => setStripQtyInput(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <span className="qty-triple-star" aria-hidden="true">
                  *
                </span>
                <div className="qty-triple-cell">
                  <span className="muted">
                    {pendingPack?.pack_l3_unit || t("packUnitTablet")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={tabletQtyInput}
                    disabled={!pendingItem}
                    onChange={(e) => setTabletQtyInput(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!pendingItem}
                  onClick={() => {
                    if (!pendingItem) return;
                    addLineFromItem(
                      pendingItem,
                      Number(boxQtyInput) || 0,
                      Number(stripQtyInput) || 0,
                      Number(tabletQtyInput) || 0,
                    );
                  }}
                >
                  {t("add")}
                </button>
              </div>
              {preview ? <p className="hint">{preview}</p> : null}
            </>
          ) : null}

          <div className="bill-lines pharmacy-bill">
            <div className="bill-lines-head">
              <span>{t("code")}</span>
              <span>{t("description")}</span>
              <span className="num">{t("qty")}</span>
              <span className="num">{t("stock")}</span>
              <span className="num">{t("price")}</span>
              <span className="num">{t("amount")}</span>
              <span />
            </div>
            {lines.length === 0 ? <p className="empty-row">{t("noLinesYet")}</p> : null}
            {lines.map((l, i) => (
              <div key={`${l.code}-${i}`} className="bill-lines-row">
                <span>{l.code || "—"}</span>
                <span>{l.description}</span>
                <span className="num">
                  {(l.box_qty || 0) > 0 || (l.strip_qty || 0) > 0 || (l.tablet_qty || 0) > 0
                    ? `${l.box_qty || 0}*${l.strip_qty || 0}*${l.tablet_qty || 0}`
                    : `${l.billing_qty} ${l.billing_unit}`}
                </span>
                <span className="num">
                  {l.billing_qty} {l.billing_unit}
                </span>
                <span className="num">{formatMMK(l.unit_price_mmk)}</span>
                <span className="num">{formatMMK(l.line_total_mmk)}</span>
                <span>
                  {isDraft ? (
                    <button
                      type="button"
                      className="btn ghost danger"
                      onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>

          <p className="bill-total">
            {t("totalLabel")}: {formatMMK(total)} {t("mmk")}
          </p>
        </FormSection>
        {error ? <p className="form-error">{error}</p> : null}
        {okMsg ? <p className="form-ok">{okMsg}</p> : null}

        <div className="btn-row">
          {isDraft ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void saveDraft()}>
              {busy ? t("saving") : billId ? t("updateDraft") : t("saveDraft")}
            </button>
          ) : null}
          {isDraft && billId ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void doPay()}>
              {t("payCash")}
            </button>
          ) : null}
          {billId && billStatus !== "void" ? (
            <button type="button" className="btn ghost danger" disabled={busy} onClick={() => void doVoid()}>
              {t("voidStatus")}
            </button>
          ) : null}
        </div>
        {billId ? (
          <div className="btn-row btn-row-print">
            <button type="button" className="btn print" disabled={busy} onClick={() => void doPrint()}>
              {t("print")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
