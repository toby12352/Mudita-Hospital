import { useEffect, useState } from "react";
import {
  createOpdBill,
  findOpdServiceByCode,
  getOpdBill,
  listOpdBills,
  listOpdDoctors,
  listOpdServices,
  payOpdBill,
  printOpdBill,
  updateOpdBill,
  voidOpdBill,
  type OpdBill,
  type OpdBillLine,
  type OpdDoctor,
  type OpdService,
} from "@/features/opd/api";
import { formatMMK } from "@/shared/format";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";
import { FormSection } from "@/shared/FormSection";
export function OpdPage({ initialMode = "list" }: { initialMode?: "list" | "edit" }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"list" | "edit">(initialMode);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bills, setBills] = useState<OpdBill[]>([]);
  const [doctors, setDoctors] = useState<OpdDoctor[]>([]);
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
  const [doctorId, setDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<OpdBillLine[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price_mmk, 0);
  const isDraft = billStatus === "draft";

  async function reloadList(search = q, status = statusFilter) {
    setBills(await listOpdBills(search, status));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [billList, docList] = await Promise.all([listOpdBills(""), listOpdDoctors()]);
        if (cancelled) return;
        setBills(billList);
        setDoctors(docList);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetEditor() {
    setBillId(null);
    setBillNo("");
    setBillStatus("draft");
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setPatientGender("");
    setDoctorId("");
    setDoctorName("");
    setDescription("");
    setLines([]);
    setCodeInput("");
    setVoidReason("");
    setError(null);
    setOkMsg(null);
  }

  function openNew() {
    resetEditor();
    setMode("edit");
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
      setPatientName(b.patient_name);
      setPatientPhone(b.patient_phone);
      setPatientAge(b.patient_age_years != null ? String(b.patient_age_years) : "");
      setPatientGender(b.patient_gender);
      setDoctorId(b.doctor_id != null ? String(b.doctor_id) : "");
      setDoctorName(b.doctor_name || "");
      setDescription(b.description);
      setLines(
        (b.lines ?? []).map((l) => ({
          ...l,
          line_total_mmk: l.qty * l.unit_price_mmk,
        })),
      );
      setVoidReason("");
      setMode("edit");
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

  function pickDoctor(d: OpdDoctor) {
    setDoctorId(String(d.id));
    setDoctorName(d.name);
  }

  function addOpdService(svc: OpdService) {
    setLines((prev) => [
      ...prev,
      {
        line_type: "service",
        ref_id: svc.id,
        code: svc.code,
        description: svc.name,
        qty: 1,
        unit_price_mmk: svc.price_mmk,
        line_total_mmk: svc.price_mmk,
      },
    ]);
    setCodeInput("");
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const body = buildBody();
      if (!body.patient_name) throw new Error("Patient name required");
      const b = billId ? await updateOpdBill(billId, body) : await createOpdBill(body);
      setBillId(b.id);
      setBillNo(b.bill_no);
      setBillStatus(b.status);
      setLines(
        (b.lines ?? []).map((l) => ({
          ...l,
          line_total_mmk: l.qty * l.unit_price_mmk,
        })),
      );
      setOkMsg(`Saved ${b.bill_no}`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function addByCode() {
    const code = codeInput.trim();
    if (!code) return;
    setError(null);
    try {
      const svc = await findOpdServiceByCode(code);
      if (svc) {
        addOpdService(svc);
        return;
      }
      setError(`No service with code “${code}” (medicines: use Pharmacy Billing)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
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
      const next = [...prev];
      next[index] = {
        ...next[index],
        qty,
        line_total_mmk: qty * next[index].unit_price_mmk,
      };
      return next;
    });
  }

  function commitLineQty(index: number, raw?: string) {
    setLines((prev) => {
      const next = [...prev];
      const source = raw !== undefined ? raw.trim() : String(next[index].qty);
      let qty = source === "" ? 0 : Math.floor(Number(source));
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      next[index] = {
        ...next[index],
        qty,
        line_total_mmk: qty * next[index].unit_price_mmk,
      };
      return next;
    });
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function payCash() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const body = buildBody();
      if (!body.patient_name) throw new Error("Patient name required");
      if (lines.length === 0) throw new Error("Add at least one line");
      let id = billId;
      if (id) {
        const saved = await updateOpdBill(id, body);
        setLines(
          (saved.lines ?? []).map((l) => ({
            ...l,
            line_total_mmk: l.qty * l.unit_price_mmk,
          })),
        );
      } else {
        const created = await createOpdBill(body);
        id = created.id;
        setBillId(created.id);
        setBillNo(created.bill_no);
        setLines(
          (created.lines ?? []).map((l) => ({
            ...l,
            line_total_mmk: l.qty * l.unit_price_mmk,
          })),
        );
      }
      const b = await payOpdBill(id);
      setBillStatus(b.status);
      setBillNo(b.bill_no);
      setOkMsg(`Paid ${b.bill_no} — ${formatMMK(b.total_mmk)} MMK cash`);
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVoid() {
    if (!billId) return;
    const reason = voidReason.trim();
    if (!reason) {
      setError("Void reason required");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const b = await voidOpdBill(billId, reason);
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
      await printOpdBill(billId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "list") {
    return (
      <section className="settings-panel">
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={openNew}>
            {t("newBill")}
          </button>
        </div>
        <p className="hint">{t("opdHint")}</p>
        <div className="list-toolbar">
          <Typeahead
            label={t("search")}
            value={q}
            onChange={setQ}
            placeholder={t("searchBillPlaceholder")}
            loadSuggestions={async (term) => listOpdBills(term, statusFilter)}
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
                  {b.doctor_name ? ` · ${b.doctor_name}` : ""}
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

      {!billNo ? <h2 className="section-title">{t("createNewBill")}</h2> : null}

      <div className="card-form">
        <FormSection title={t("patient")} titleId="opd-bill-patient">
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

        <FormSection title={t("visit")} titleId="opd-bill-visit">
          <Typeahead
            label={t("doctor")}
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
                  {d.specialty || t("general")} · {t("consultAbbrev")} {formatMMK(d.consultation_mmk)}{" "}
                  {t("mmk")}
                </span>
              </>
            )}
            onPick={pickDoctor}
          />
          <label className="field">
            {t("descriptionNote")}
            <input
              value={description}
              disabled={!isDraft}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </FormSection>

        <FormSection title={t("services")} titleId="opd-bill-services">
          {isDraft ? (
            <div className="list-toolbar">
              <Typeahead
                label={t("serviceLabel")}
                value={codeInput}
                onChange={setCodeInput}
                placeholder={t("servicePlaceholder")}
                loadSuggestions={loadOpdServiceSuggestions}
                getKey={(s) => s.id}
                renderOption={(s) => (
                  <>
                    <span className="typeahead-title">
                      {s.code} — {s.name}
                    </span>
                    <span className="typeahead-sub">
                      {t("serviceType")} · {formatMMK(s.price_mmk)} {t("mmk")}
                    </span>
                  </>
                )}
                onPick={(s) => {
                  setError(null);
                  addOpdService(s);
                }}
                onSubmitWithoutPick={() => void addByCode()}
              />
              <button type="button" className="btn ghost" onClick={() => void addByCode()}>
                {t("add")}
              </button>
              <button type="button" className="btn ghost" onClick={addConsultation}>
                {t("addConsultation")}
              </button>
            </div>
          ) : null}

          <div className="bill-lines">
            <div className="bill-lines-head">
              <span>{t("code")}</span>
              <span>{t("description")}</span>
              <span className="num">{t("qty")}</span>
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
                  {isDraft ? (
                    <input
                      className="qty-input"
                      value={l.qty < 1 ? "" : l.qty}
                      inputMode="numeric"
                      onChange={(e) => updateLineQty(i, e.target.value)}
                      onBlur={(e) => commitLineQty(i, e.target.value)}
                    />
                  ) : (
                    l.qty
                  )}
                </span>
                <span className="num">{formatMMK(l.unit_price_mmk)}</span>
                <span className="num">{formatMMK(l.qty * l.unit_price_mmk)}</span>
                <span>
                  {isDraft ? (
                    <button type="button" className="btn ghost danger" onClick={() => removeLine(i)}>
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
            <>
              <button type="button" className="btn primary" disabled={busy} onClick={() => void saveDraft()}>
                {busy ? "…" : billId ? t("save") : t("createDraft")}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || lines.length === 0}
                onClick={() => void payCash()}
              >
                {t("payCash")}
              </button>
            </>
          ) : null}
        </div>
        {billId ? (
          <div className="btn-row btn-row-print">
            <button type="button" className="btn print" disabled={busy} onClick={() => void doPrint()}>
              {t("print")}
            </button>
          </div>
        ) : null}

        {billId && billStatus !== "void" ? (
          <div className="nested-form">
            <label className="field">
              {t("voidReason")}
              <input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder={t("voidReasonRequired")}
              />
            </label>
            <button type="button" className="btn ghost danger" disabled={busy} onClick={() => void doVoid()}>
              {billStatus === "paid" ? t("voidBillRestore") : t("voidBill")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
