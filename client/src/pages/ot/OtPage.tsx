import { useEffect, useState } from "react";
import {
  createOtBillFromCase,
  createOtCase,
  getOtBill,
  getOtCase,
  issueOtCase,
  listOtCases,
  listOtDoctors,
  payOtBill,
  printOtBill,
  printOtPickList,
  reconcileOtCase,
  updateOtCase,
  voidOtBill,
  type OtBill,
  type OtCase,
  type OtCaseItem,
  type OtDoctor,
} from "@/features/ot/api";
import {
  findItemByCode,
  listPharmacyItems,
  type PharmacyItem,
} from "@/features/pharmacy/api";
import {
  findOpdServiceByCode,
  listOpdServices,
} from "@/features/opd/api";
import { formatMMK } from "@/shared/format";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";
import { FormSection } from "@/shared/FormSection";
export function OtPage({ initialMode = "list" }: { initialMode?: "list" | "case" }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"list" | "case" | "bill">(initialMode);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [cases, setCases] = useState<OtCase[]>([]);
  const [doctors, setDoctors] = useState<OtDoctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [caseId, setCaseId] = useState<number | null>(null);
  const [caseNo, setCaseNo] = useState("");
  const [caseStatus, setCaseStatus] = useState("draft");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OtCaseItem[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [otBillId, setOtBillId] = useState<number | null>(null);

  const [bill, setBill] = useState<OtBill | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const isDraft = caseStatus === "draft";
  const isIssued = caseStatus === "issued";
  const isReconciled = caseStatus === "reconciled";

  async function reloadList(search = q, status = statusFilter) {
    setCases(await listOtCases(search, status));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, d] = await Promise.all([listOtCases("", ""), listOtDoctors()]);
        if (cancelled) return;
        setCases(c);
        setDoctors(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setProcedureName("");
    setNotes("");
    setItems([]);
    setCodeInput("");
    setOtBillId(null);
    setError(null);
    setOkMsg(null);
  }

  function applyCase(c: OtCase) {
    setCaseId(c.id);
    setCaseNo(c.case_no);
    setCaseStatus(c.status);
    setPatientName(c.patient_name);
    setPatientPhone(c.patient_phone);
    setPatientAge(c.patient_age_years != null ? String(c.patient_age_years) : "");
    setPatientGender(c.patient_gender);
    setDoctorId(c.doctor_id != null ? String(c.doctor_id) : "");
    setDoctorName(c.doctor_name || "");
    setProcedureName(c.procedure_name);
    setNotes(c.notes);
    setItems(
      (c.items ?? []).map((it) => ({
        ...it,
        qty_used: it.qty_used || 0,
        qty_returned: it.qty_returned || 0,
        qty_wasted: it.qty_wasted || 0,
        qty_kept_on_floor: it.qty_kept_on_floor || 0,
      })),
    );
    setOtBillId(c.ot_bill_id ?? null);
  }

  function openNew() {
    resetCaseForm();
    setMode("case");
  }

  async function openCase(id: number) {
    setBusy(true);
    setError(null);
    try {
      const c = await getOtCase(id);
      applyCase(c);
      setMode("case");
      if (c.ot_bill_id) {
        setOkMsg(`Linked bill id ${c.ot_bill_id}`);
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
      items: items.map((it) => ({
        item_id: it.item_id,
        code: it.code,
        name: it.name,
        sell_price_mmk: it.sell_price_mmk,
        qty_issued: Math.max(1, Math.floor(Number(it.qty_issued)) || 1),
        qty_used: 0,
        qty_returned: 0,
        qty_wasted: 0,
        qty_kept_on_floor: 0,
      })),
    };
  }

  function addOtItem(item: PharmacyItem) {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.item_id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty_issued: next[idx].qty_issued + 1 };
        return next;
      }
      return [
        ...prev,
        {
          item_id: item.id,
          code: item.code,
          name: item.name,
          sell_price_mmk: item.sell_price_mmk,
          qty_issued: 1,
          qty_used: 0,
          qty_returned: 0,
          qty_wasted: 0,
          qty_kept_on_floor: 0,
        },
      ];
    });
    setCodeInput("");
    setOkMsg(
      `Added ${item.code} (In Stock ${item.stock_main} ${item.stock_unit || "units"})`,
    );
  }

  async function addByCode() {
    const code = codeInput.trim();
    if (!code) return;
    setError(null);
    try {
      const item = await findItemByCode(code);
      if (!item) {
        setError(`Unknown item code: ${code}`);
        return;
      }
      addOtItem(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    }
  }

  async function saveDraft() {
    if (!patientName.trim()) {
      setError("Patient name required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = buildWrite();
      const c = caseId ? await updateOtCase(caseId, body) : await createOtCase(body);
      applyCase(c);
      setOkMsg(`Saved ${c.case_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function doIssue() {
    if (!patientName.trim()) {
      setError("Patient name required");
      return;
    }
    if (items.length === 0) {
      setError("Add cart items before issue");
      return;
    }
    if (!window.confirm("Issue cart from In Stock → OT_RESERVED? Stock will leave pharmacy.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = buildWrite();
      let id = caseId;
      if (!id) {
        const created = await createOtCase(body);
        applyCase(created);
        id = created.id;
      } else if (caseStatus === "draft") {
        const updated = await updateOtCase(id, body);
        applyCase(updated);
      }
      const c = await issueOtCase(id);
      applyCase(c);
      setOkMsg(`Issued ${c.case_no} — print pick list for OT floor`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Issue failed");
    } finally {
      setBusy(false);
    }
  }

  async function doReconcile() {
    if (!caseId) return;
    for (const it of items) {
      if (!it.id) {
        setError("Reload case before reconcile");
        return;
      }
      const sum = it.qty_used + it.qty_returned + it.qty_wasted + it.qty_kept_on_floor;
      if (sum !== it.qty_issued) {
        setError(`${it.code}: Used+Returned+Wasted+Floor must equal issued (${it.qty_issued})`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const c = await reconcileOtCase(
        caseId,
        items.map((it) => ({
          id: it.id!,
          qty_used: it.qty_used,
          qty_returned: it.qty_returned,
          qty_wasted: it.qty_wasted,
          qty_kept_on_floor: it.qty_kept_on_floor,
        })),
      );
      applyCase(c);
      setOkMsg(`Reconciled ${c.case_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconcile failed");
    } finally {
      setBusy(false);
    }
  }

  const [extraServiceCode, setExtraServiceCode] = useState("");

  async function doCreateBill() {
    if (!caseId) return;
    setBusy(true);
    setError(null);
    try {
      const services: {
        line_type: "service";
        ref_id?: number;
        code: string;
        description: string;
        qty: number;
        unit_price_mmk: number;
        line_total_mmk: number;
      }[] = [];
      const code = extraServiceCode.trim();
      if (code) {
        const svc = await findOpdServiceByCode(code);
        if (!svc) {
          setError(`Unknown service code: ${code}`);
          setBusy(false);
          return;
        }
        services.push({
          line_type: "service",
          ref_id: svc.id,
          code: svc.code,
          description: svc.name,
          qty: 1,
          unit_price_mmk: svc.price_mmk,
          line_total_mmk: svc.price_mmk,
        });
      }
      const b = await createOtBillFromCase(caseId, services);
      setBill(b);
      setOtBillId(b.id);
      setCaseStatus("billed");
      setMode("bill");
      setOkMsg(`Created ${b.bill_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bill create failed");
    } finally {
      setBusy(false);
    }
  }

  async function openBill(id: number) {
    setBusy(true);
    setError(null);
    try {
      const b = await getOtBill(id);
      setBill(b);
      setMode("bill");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bill load failed");
    } finally {
      setBusy(false);
    }
  }

  async function doPayBill() {
    if (!bill) return;
    setBusy(true);
    setError(null);
    try {
      const b = await payOtBill(bill.id);
      setBill(b);
      setOkMsg(`Paid ${b.bill_no}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVoidBill() {
    if (!bill || !voidReason.trim()) {
      setError("Void reason required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const b = await voidOtBill(bill.id, voidReason.trim());
      setBill(b);
      setOkMsg(`Voided ${b.bill_no}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Void failed");
    } finally {
      setBusy(false);
    }
  }

  function setReconcileField(
    index: number,
    field: "qty_used" | "qty_returned" | "qty_wasted" | "qty_kept_on_floor",
    raw: string,
  ) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: n };
      return next;
    });
  }

  function fillAllUsed() {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        qty_used: it.qty_issued,
        qty_returned: 0,
        qty_wasted: 0,
        qty_kept_on_floor: 0,
      })),
    );
  }

  if (mode === "list") {
    return (
      <section className="settings-panel">
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={openNew}>
            {t("newCase")}
          </button>
        </div>
        <p className="hint">{t("otHint")}</p>
        <div className="list-toolbar">
          <Typeahead
            label={t("search")}
            value={q}
            onChange={setQ}
            placeholder={t("searchCasePlaceholder")}
            loadSuggestions={async (term) => listOtCases(term, statusFilter)}
            getKey={(c) => c.id}
            renderOption={(c) => (
              <>
                <span className="typeahead-title">
                  {c.case_no} — {c.patient_name}
                </span>
                <span className="typeahead-sub">
                  {c.status.toUpperCase()}
                  {c.procedure_name ? ` · ${c.procedure_name}` : ""}
                </span>
              </>
            )}
            onPick={(c) => {
              setQ(c.case_no);
              void openCase(c.id);
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
              <option value="issued">{t("issued")}</option>
              <option value="reconciled">{t("reconciled")}</option>
              <option value="billed">{t("billed")}</option>
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
          {cases.length === 0 ? <li className="empty-row">{t("noOtCasesYet")}</li> : null}
          {cases.map((c) => (
            <li key={c.id}>
              <div>
                <p className="row-title">
                  {c.case_no} · {c.patient_name}
                </p>
                <p className="row-sub">
                  {c.status.toUpperCase()}
                  {c.procedure_name ? ` · ${c.procedure_name}` : ""}
                  {c.doctor_name ? ` · ${c.doctor_name}` : ""}
                </p>
              </div>
              <div className="btn-row">
                <button type="button" className="btn ghost" onClick={() => void openCase(c.id)}>
                  {t("open")}
                </button>
                {c.ot_bill_id ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => void openBill(c.ot_bill_id!)}
                  >
                    {t("bill")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (mode === "bill" && bill) {
    const billDraft = bill.status === "draft";
    return (
      <section className="settings-panel">
        <div className="btn-row">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setMode("case");
              if (caseId) void openCase(caseId);
            }}
          >
            {t("backCase")}
          </button>
          <span className="hint">
            {bill.bill_no} · {bill.status.toUpperCase()} · case {bill.case_no}
          </span>
        </div>
        <div className="card-form">
          <p className="row-title">
            {bill.patient_name}
            {bill.doctor_name ? ` · ${bill.doctor_name}` : ""}
          </p>
          <p className="row-sub">{bill.procedure_name || t("otBillTitle")}</p>
          <div className="bill-lines">
            <div className="bill-lines-head">
              <span>{t("code")}</span>
              <span>{t("description")}</span>
              <span className="num">{t("qty")}</span>
              <span className="num">{t("price")}</span>
              <span className="num">{t("amount")}</span>
              <span />
            </div>
            {(bill.lines ?? []).map((l) => (
              <div key={l.id ?? `${l.code}-${l.description}`} className="bill-lines-row">
                <span>{l.code || "—"}</span>
                <span>{l.description}</span>
                <span className="num">{l.qty}</span>
                <span className="num">{formatMMK(l.unit_price_mmk)}</span>
                <span className="num">{formatMMK(l.line_total_mmk)}</span>
                <span />
              </div>
            ))}
          </div>
          <p className="bill-total">
            {t("totalLabel")}: {formatMMK(bill.total_mmk)} {t("mmk")}
          </p>
          {error ? <p className="form-error">{error}</p> : null}
          {okMsg ? <p className="form-ok">{okMsg}</p> : null}
          <div className="btn-row">
            {billDraft ? (
              <button type="button" className="btn primary" disabled={busy} onClick={() => void doPayBill()}>
                {t("payCash")}
              </button>
            ) : null}
          </div>
          <div className="btn-row btn-row-print">
            <button
              type="button"
              className="btn print"
              disabled={busy}
              onClick={() => void printOtBill(bill.id).catch((e) => setError(String(e)))}
            >
              {t("print")}
            </button>
          </div>
          {bill.status !== "void" ? (
            <div className="nested-form">
              <label className="field">
                {t("voidReason")}
                <input
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder={t("voidOtPlaceholder")}
                />
              </label>
              <button type="button" className="btn ghost danger" disabled={busy} onClick={() => void doVoidBill()}>
                {t("voidBill")}
              </button>
            </div>
          ) : null}
          {billDraft ? <p className="hint">{t("otBillPayHint")}</p> : null}
        </div>
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
          {t("backCases")}
        </button>
        {caseNo ? (
          <span className="hint">
            {caseNo} · {caseStatus.toUpperCase()}
          </span>
        ) : null}
      </div>

      {!caseNo ? <h2 className="section-title">{t("createNewCase")}</h2> : null}

      <div className="card-form">
        <FormSection title={t("patient")} titleId="ot-case-patient">
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
        </FormSection>

        <FormSection title={t("caseSection")} titleId="ot-case-details">
          <Typeahead
            label={t("doctorOtFee")}
            value={doctorName}
            disabled={!isDraft}
            placeholder={t("doctorPlaceholder")}
            onChange={(v) => {
              setDoctorName(v);
              setDoctorId("");
            }}
            loadSuggestions={async (term) => {
              const q = term.trim().toLowerCase();
              if (!q) return doctors.slice(0, 8);
              return doctors
                .filter(
                  (d) =>
                    d.name.toLowerCase().includes(q) ||
                    (d.specialty || "").toLowerCase().includes(q),
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
          <label className="field">
            {t("procedure")}
            <input
              value={procedureName}
              disabled={!isDraft}
              onChange={(e) => setProcedureName(e.target.value)}
              placeholder={t("procedurePlaceholder")}
            />
          </label>
          <label className="field">
            {t("notes")}
            <input value={notes} disabled={!isDraft} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </FormSection>

        <FormSection title={t("pharmacyItems")} titleId="ot-case-items">
          {isDraft ? (
            <div className="list-toolbar">
              <Typeahead
                label={t("pharmacyItemLabel")}
                value={codeInput}
                onChange={setCodeInput}
                placeholder={t("pharmacyItemPlaceholder")}
                loadSuggestions={async (term) => listPharmacyItems(term)}
                getKey={(item) => item.id}
                renderOption={(item) => (
                  <>
                    <span className="typeahead-title">
                      {item.code} — {item.name}
                    </span>
                    <span className="typeahead-sub">
                      {item.stock_unit || t("item")} · {formatMMK(item.sell_price_mmk)} {t("mmk")} ·{" "}
                      {t("inStock")} {item.stock_main.toLocaleString()} {item.stock_unit || ""}
                    </span>
                  </>
                )}
                onPick={(item) => {
                  setError(null);
                  addOtItem(item);
                }}
                onSubmitWithoutPick={() => void addByCode()}
              />
              <button type="button" className="btn ghost" onClick={() => void addByCode()}>
                {t("add")}
              </button>
            </div>
          ) : null}

          {isIssued ? (
            <div className="btn-row">
              <button type="button" className="btn ghost" onClick={fillAllUsed}>
                {t("fillAllUsed")}
              </button>
              <span className="hint">{t("reconcileBalanceHint")}</span>
            </div>
          ) : null}

          <div className={`bill-lines ${isIssued ? "ot-reconcile" : ""}`}>
            <div className={`bill-lines-head ${isIssued ? "ot-reconcile-head" : ""}`}>
              <span>{t("code")}</span>
              <span>{t("item")}</span>
              <span className="num">{t("issuedQty")}</span>
              {isIssued || isReconciled || caseStatus === "billed" ? (
                <>
                  <span className="num">{t("used")}</span>
                  <span className="num">{t("ret")}</span>
                  <span className="num">{t("waste")}</span>
                  <span className="num">{t("floor")}</span>
                </>
              ) : (
                <>
                  <span className="num">{t("price")}</span>
                  <span />
                </>
              )}
            </div>
            {items.length === 0 ? <p className="empty-row">{t("noCartItems")}</p> : null}
            {items.map((it, i) => (
              <div key={`${it.item_id}-${i}`} className={`bill-lines-row ${isIssued ? "ot-reconcile-row" : ""}`}>
                <span>{it.code}</span>
                <span>{it.name}</span>
                <span className="num">
                  {isDraft ? (
                    <input
                      className="qty-input"
                      value={it.qty_issued < 1 ? "" : it.qty_issued}
                      inputMode="numeric"
                      onChange={(e) => {
                        const trimmed = e.target.value.trim();
                        const n = trimmed === "" ? 0 : Math.floor(Number(trimmed));
                        if (trimmed !== "" && (!Number.isFinite(n) || n < 0)) return;
                        setItems((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], qty_issued: n };
                          return next;
                        });
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        let n = raw === "" ? 0 : Math.floor(Number(raw));
                        if (!Number.isFinite(n) || n < 1) n = 1;
                        setItems((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], qty_issued: n };
                          return next;
                        });
                      }}
                    />
                  ) : (
                    it.qty_issued
                  )}
                </span>
                {isIssued ? (
                  <>
                    <span className="num">
                      <input
                        className="qty-input"
                        value={it.qty_used}
                        inputMode="numeric"
                        onChange={(e) => setReconcileField(i, "qty_used", e.target.value)}
                      />
                    </span>
                    <span className="num">
                      <input
                        className="qty-input"
                        value={it.qty_returned}
                        inputMode="numeric"
                        onChange={(e) => setReconcileField(i, "qty_returned", e.target.value)}
                      />
                    </span>
                    <span className="num">
                      <input
                        className="qty-input"
                        value={it.qty_wasted}
                        inputMode="numeric"
                        onChange={(e) => setReconcileField(i, "qty_wasted", e.target.value)}
                      />
                    </span>
                    <span className="num">
                      <input
                        className="qty-input"
                        value={it.qty_kept_on_floor}
                        inputMode="numeric"
                        onChange={(e) => setReconcileField(i, "qty_kept_on_floor", e.target.value)}
                      />
                    </span>
                  </>
                ) : isReconciled || caseStatus === "billed" ? (
                  <>
                    <span className="num">{it.qty_used}</span>
                    <span className="num">{it.qty_returned}</span>
                    <span className="num">{it.qty_wasted}</span>
                    <span className="num">{it.qty_kept_on_floor}</span>
                  </>
                ) : (
                  <>
                    <span className="num">{formatMMK(it.sell_price_mmk)}</span>
                    <span>
                      {isDraft ? (
                        <button
                          type="button"
                          className="btn ghost danger"
                          onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </FormSection>

        {error ? <p className="form-error">{error}</p> : null}
        {okMsg ? <p className="form-ok">{okMsg}</p> : null}

        <div className="btn-row">
          {isDraft ? (
            <>
              <button type="button" className="btn primary" disabled={busy} onClick={() => void saveDraft()}>
                {busy ? "…" : caseId ? t("save") : t("createDraft")}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || items.length === 0}
                onClick={() => void doIssue()}
              >
                {t("issueFromPharmacy")}
              </button>
            </>
          ) : null}
          {isIssued ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void doReconcile()}>
              {t("reconcile")}
            </button>
          ) : null}
          {isReconciled ? (
            <>
              <Typeahead
                label={t("optionalService")}
                value={extraServiceCode}
                onChange={setExtraServiceCode}
                placeholder={t("optionalServicePlaceholder")}
                loadSuggestions={async (term) => listOpdServices(term)}
                getKey={(svc) => svc.id}
                renderOption={(svc) => (
                  <>
                    <span className="typeahead-title">
                      {svc.code} — {svc.name}
                    </span>
                    <span className="typeahead-sub">
                      {t("serviceType")} · {formatMMK(svc.price_mmk)} {t("mmk")}
                    </span>
                  </>
                )}
                onPick={(svc) => setExtraServiceCode(svc.code)}
              />
              <button type="button" className="btn primary" disabled={busy} onClick={() => void doCreateBill()}>
                {t("createOtBill")}
              </button>
            </>
          ) : null}
          {otBillId ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void openBill(otBillId)}>
              {t("openBill")}
            </button>
          ) : null}
          <button
            type="button"
            className="btn ghost"
            disabled={busy || !caseId}
            onClick={() =>
              void printOtPickList(caseId!).catch((e) => setError(e instanceof Error ? e.message : String(e)))
            }
          >
            {t("printPickList")}
          </button>
        </div>
      </div>
    </section>
  );
}
