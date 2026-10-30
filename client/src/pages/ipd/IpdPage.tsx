import { useEffect, useRef, useState } from "react";
import {
  admitPatient,
  dischargeIpd,
  fetchIpdCash,
  getIpdAdmission,
  listIpdAdmissions,
  postIpdDeposit,
  printIpdCash,
  printIpdDeposit,
  printIpdStatement,
  updateIpdNotes,
  type IpdAdmission,
  type IpdCashReport,
  type IpdLedgerLine,
} from "@/features/ipd/api";
import type { PatientChart } from "@/features/patients/api";
import { PatientChartTypeahead } from "@/features/patients/PatientChartTypeahead";
import { IpdDailyStatementPreview } from "@/pages/ipd/IpdDailyStatementPreview";
import { defaultIpdStatementDate, utcStampToYangonDate, yangonToday } from "@/pages/ipd/ipdStatementDate";
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import { getStoredUser } from "@/shared/auth";
import { BillBtnIcon } from "@/shared/BillBtnIcon";
import { BillDateField, formatUtcAsLocal, nowDatetimeLocal } from "@/shared/BillDateField";
import { fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { useBillActionPending } from "@/shared/useActionLock";

export function IpdPage() {
  const { t } = useI18n();
  const [stays, setStays] = useState<IpdAdmission[]>([]);
  const [stay, setStay] = useState<IpdAdmission | null>(null);
  const [notes, setNotes] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [roomEditing, setRoomEditing] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [chartId, setChartId] = useState<number | null>(null);
  const [billedAtLocal, setBilledAtLocal] = useState(() => nowDatetimeLocal());
  const isAdmin = getStoredUser()?.role === "Admin";
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [depositAmountError, setDepositAmountError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { action: pendingAction, pending, begin, end } = useBillActionPending();
  const [listStatus, setListStatus] = useState<"open" | "settled">("open");
  const [showCash, setShowCash] = useState(false);
  const [confirmDischarge, setConfirmDischarge] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const patientFieldRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<HTMLInputElement>(null);
  const depositAmountRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const okMsgRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (okMsg?.trim()) revealField(okMsgRef.current);
  }, [okMsg]);

  useEffect(() => {
    setDailyOpen(false);
  }, [stay?.id]);

  function clearFieldErrors() {
    setPatientError(null);
    setDepositAmountError(null);
  }

  function applyApiError(e: unknown) {
    const msg = e instanceof Error ? e.message : t("errGeneric");
    const key = fieldKeyForApiError(e);
    if (key === "patient") {
      setPatientError(msg);
      window.setTimeout(() => revealField(patientFieldRef.current), 0);
      return;
    }
    if (key === "amount") {
      setDepositAmountError(msg);
      window.setTimeout(() => revealField(depositAmountRef.current), 0);
      return;
    }
    if (key === "form") {
      setError(msg);
      window.setTimeout(() => revealField(formErrorRef.current ?? patientFieldRef.current), 0);
      return;
    }
    setError(msg);
    window.setTimeout(() => revealField(formErrorRef.current), 0);
  }

  async function loadStays() {
    setStays(await listIpdAdmissions(listStatus));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listIpdAdmissions(listStatus);
        if (!cancelled) setStays(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("errGeneric"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t, listStatus]);

  function showStay(row: IpdAdmission) {
    setStay(row);
    setNotes(row.notes);
    setRoomNo(row.room_no ?? "");
    setRoomEditing(false);
    setPatientName("");
    setChartId(null);
    setDepositAmount("");
    setDepositNote("");
    setError(null);
    clearFieldErrors();
    setOkMsg(null);
  }

  async function openStay(id: number) {
    setBusy(true);
    setError(null);
    clearFieldErrors();
    setOkMsg(null);
    try {
      showStay(await getIpdAdmission(id));
    } catch (e) {
      applyApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function admit() {
    if (chartId == null) {
      setPatientError(t("errIpdPickPatient"));
      window.setTimeout(() => revealField(patientFieldRef.current), 0);
      return;
    }
    if (!begin("admit")) return;
    setBusy(true);
    setError(null);
    clearFieldErrors();
    setOkMsg(null);
    try {
      const created = await admitPatient(
        chartId,
        isAdmin && billedAtLocal ? { billed_at: billedAtLocal } : undefined,
      );
      showStay(created);
      setBilledAtLocal(nowDatetimeLocal());
      await loadStays();
    } catch (e) {
      applyApiError(e);
    } finally {
      setBusy(false);
      end();
    }
  }

  async function saveNotes() {
    if (!stay) return;
    if (!begin("notes")) return;
    setBusy(true);
    setError(null);
    clearFieldErrors();
    setOkMsg(null);
    try {
      const saved = await updateIpdNotes(stay.id, notes, roomNo);
      showStay(saved);
      setOkMsg(t("saved"));
      await loadStays();
    } catch (e) {
      applyApiError(e);
    } finally {
      setBusy(false);
      end();
    }
  }

  async function takeDeposit() {
    if (!stay) return;
    const amount = parseKyat(depositAmount);
    if (amount == null) {
      setDepositAmountError(t("errIpdAmount"));
      window.setTimeout(() => revealField(depositAmountRef.current), 0);
      return;
    }
    if (!begin("deposit")) return;
    setBusy(true);
    setError(null);
    clearFieldErrors();
    setOkMsg(null);
    try {
      const saved = await postIpdDeposit(stay.id, amount, depositNote);
      setStay(saved);
      setDepositAmount("");
      setDepositNote("");
      setOkMsg(t("saved"));
    } catch (e) {
      applyApiError(e);
    } finally {
      setBusy(false);
      end();
    }
  }

  async function printLedgerLine(line: IpdLedgerLine) {
    if (!stay) return;
    if (!begin("print")) return;
    setBusy(true);
    setError(null);
    try {
      const title =
        line.kind === "deposit"
          ? t("ipdDepositReceipt")
          : line.note.trim() || t("print");
      await printIpdDeposit(stay.id, line.id, title);
    } catch (e) {
      applyApiError(e);
    } finally {
      setBusy(false);
      end();
    }
  }

  async function printStatement() {
    if (!stay) return;
    if (!begin("statement")) return;
    setBusy(true);
    setError(null);
    try {
      await printIpdStatement(stay.id, t("ipdStatement"));
    } catch (e) {
      applyApiError(e);
    } finally {
      setBusy(false);
      end();
    }
  }

  async function dischargeStay() {
    if (!stay || stay.status !== "open") return;
    if (!begin("discharge")) return;
    setBusy(true);
    setError(null);
    clearFieldErrors();
    setOkMsg(null);
    try {
      const saved = await dischargeIpd(stay.id);
      setConfirmDischarge(false);
      setStay(saved);
      setNotes(saved.notes);
      setRoomNo(saved.room_no ?? "");
      setRoomEditing(false);
      setDepositAmount("");
      setDepositNote("");
      setOkMsg(t("ipdDischarged"));
      await loadStays();
    } catch (e) {
      applyApiError(e);
      setConfirmDischarge(false);
    } finally {
      setBusy(false);
      end();
    }
  }

  function refreshAfterDecision() {
    const id = stay?.id;
    if (id == null) return;
    void (async () => {
      try {
        const saved = await getIpdAdmission(id);
        setStay((current) => (current?.id === id ? saved : current));
        setStays(await listIpdAdmissions(listStatus));
      } catch {
        /* the list reloads when they go back */
      }
    })();
  }

  function backToList() {
    setStay(null);
    setShowCash(false);
    setNotes("");
    setRoomNo("");
    setRoomEditing(false);
    setError(null);
    setOkMsg(null);
    void loadStays().catch((e) => setError(e instanceof Error ? e.message : t("errGeneric")));
  }

  if (showCash && !stay) {
    return <IpdCashPanel onBack={() => setShowCash(false)} />;
  }

  return (
    <section className="opd-bill-desk">
      <div className="opd-bill-desk-main">
        <h2 className="opd-bill-desk-title">
          {stay ? stay.admission_no : t("ipdStayTitle")}
        </h2>

        {stay ? (
          <>
            <div className="ipd-stay-fields">
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("idName")}</span>
                <input
                  className="opd-bill-input"
                  value={`${stay.patient.id} / ${stay.patient.name}`}
                  disabled
                />
              </label>
              <label className="opd-bill-field ipd-stay-field-right">
                <span className="opd-bill-label">{t("admissionNo")}</span>
                <input className="opd-bill-input" value={stay.admission_no} disabled />
              </label>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("phone")}</span>
                <input className="opd-bill-input" value={stay.patient.phone} disabled />
              </label>
              <label className="opd-bill-field ipd-stay-field-right">
                <span className="opd-bill-label">{t("ipdAdmittedAt")}</span>
                <input
                  className="opd-bill-input"
                  value={formatUtcAsLocal(stay.admitted_at)}
                  disabled
                />
              </label>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("age")}</span>
                <input
                  className="opd-bill-input"
                  value={stay.patient.age_years != null ? String(stay.patient.age_years) : ""}
                  disabled
                />
              </label>
              <label className="opd-bill-field ipd-stay-field-right">
                <span className="opd-bill-label">{t("status")}</span>
                <input className="opd-bill-input" value={statusLabel(stay.status, t)} disabled />
              </label>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("gender")}</span>
                <input className="opd-bill-input" value={genderLabel(stay.patient.gender, t)} disabled />
              </label>
              <div className="opd-bill-field ipd-stay-field-right">
                <span className="opd-bill-label">{t("roomNo")}</span>
                <div className="opd-bill-control">
                  <input
                    ref={roomRef}
                    className="opd-bill-input"
                    value={roomNo}
                    maxLength={32}
                    disabled={busy || stay.status !== "open" || !roomEditing}
                    aria-label={t("roomNo")}
                    onChange={(e) => setRoomNo(e.target.value)}
                  />
                  {stay.status === "open" && !roomEditing ? (
                    <button
                      type="button"
                      className="btn action opd-bill-consult"
                      disabled={busy}
                      onClick={() => {
                        setRoomEditing(true);
                        window.setTimeout(() => roomRef.current?.focus(), 0);
                      }}
                    >
                      {t("changeRoomNo")}
                    </button>
                  ) : null}
                </div>
              </div>
              {stay.discharged_at ? (
                <label className="opd-bill-field ipd-stay-field-right">
                  <span className="opd-bill-label">{t("ipdDischargedAt")}</span>
                  <input className="opd-bill-input" value={stay.discharged_at} disabled />
                </label>
              ) : null}
              <label className="ipd-stay-notes">
                <span className="opd-bill-label">{t("notes")}</span>
                <textarea
                  className="opd-bill-input"
                  rows={4}
                  value={notes}
                  disabled={busy || stay.status !== "open"}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
            <div className="ipd-stay-summary">
              <p className="ipd-stay-summary-item">
                <span className="ipd-stay-summary-label">{t("ipdRemainingBalance")}:</span>{" "}
                <span className="ipd-stay-summary-amount">
                  {formatMMK(stay.balance_mmk ?? 0)} {t("mmk")}
                </span>
              </p>
              <p className="ipd-stay-summary-item">
                <span className="ipd-stay-summary-label">{t("ipdTotalCharges")}:</span>{" "}
                <span className="ipd-stay-summary-amount">
                  {formatMMK(totalChargesMmk(stay.ledger ?? []))} {t("mmk")}
                </span>
              </p>
            </div>
            <h3 className="ipd-ledger-title">{t("ipdLedger")}</h3>
            <ul className="ipd-ledger-cards">
              {(stay.ledger ?? []).length === 0 ? (
                <li className="ipd-ledger-card ipd-ledger-card--empty">{t("ipdNoLedger")}</li>
              ) : null}
              {(stay.ledger ?? []).map((line) => (
                <li key={line.id} className="ipd-ledger-card">
                  <div>
                    <p className={`row-title${line.amount_mmk < 0 ? " ipd-ledger-amount--charge" : ""}`}>
                      {ledgerKindLabel(line.kind, line.amount_mmk, line.source, t)} ·{" "}
                      {formatMMK(line.amount_mmk)} {t("mmk")}
                    </p>
                    <p className="row-sub">{ledgerSub(line)}</p>
                  </div>
                  {ledgerCanPrint(line) ? (
                    <button
                      type="button"
                      className="btn action"
                      disabled={busy}
                      onClick={() => void printLedgerLine(line)}
                    >
                      <ActionIcon name="print" /> {t("print")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {stay.status === "open" ? (
            <div className="opd-bill-header">
              <div className="opd-bill-header-col">
                <span className="opd-bill-label">{t("ipdDeposit")}</span>
                <label className={`opd-bill-field${depositAmountError ? " is-invalid" : ""}`}>
                  <span className="opd-bill-label">{t("amount")}</span>
                  <input
                    ref={depositAmountRef}
                    className="opd-bill-input"
                    inputMode="numeric"
                    value={depositAmount}
                    disabled={busy || stay.status !== "open"}
                    onChange={(e) => {
                      setDepositAmount(e.target.value);
                      setDepositAmountError(null);
                    }}
                    aria-invalid={depositAmountError ? true : undefined}
                  />
                </label>
                <FieldError>{depositAmountError}</FieldError>
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("note")}</span>
                  <input
                    className="opd-bill-input"
                    value={depositNote}
                    disabled={busy || stay.status !== "open"}
                    onChange={(e) => setDepositNote(e.target.value)}
                  />
                </label>
              </div>
            </div>
            ) : null}
          </>
        ) : (
          <>
            <div
              ref={patientFieldRef}
              className={`opd-bill-field opd-bill-field--typeahead${patientError ? " is-invalid" : ""}`}
            >
              <span className="opd-bill-label">{t("patient")}</span>
              <PatientChartTypeahead
                value={patientName}
                disabled={busy}
                onChange={(value) => {
                  setPatientName(value);
                  setChartId(null);
                  setPatientError(null);
                }}
                onPick={(patient: PatientChart) => {
                  setPatientName(patient.name);
                  setChartId(patient.id);
                  setError(null);
                  setPatientError(null);
                }}
              />
            </div>
            <FieldError>{patientError}</FieldError>
            {isAdmin ? (
              <BillDateField
                editable
                value={billedAtLocal}
                displayWhen={formatUtcAsLocal(null)}
                onChange={setBilledAtLocal}
                disabled={busy}
              />
            ) : null}
            {error && !stay ? (
              <p ref={formErrorRef} className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <ul className="ipd-ledger-cards ipd-stay-list">
              {stays.length === 0 ? (
                <li className="ipd-ledger-card ipd-ledger-card--empty">
                  {listStatus === "open" ? t("ipdNoStays") : t("ipdNoSettled")}
                </li>
              ) : null}
              {stays.map((row) => (
                <li key={row.id} className="ipd-ledger-card">
                  <div>
                    <p className="row-title">
                      {row.admission_no} · {row.patient.name}
                    </p>
                    <p className="row-sub">
                      {t("chartLabel")} {row.patient.id} · {formatUtcAsLocal(row.admitted_at)}
                    </p>
                    {listStatus === "open" ? (
                      <p className="row-sub">{yesterdayStayLine(row, t)}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn action"
                    disabled={busy}
                    onClick={() => void openStay(row.id)}
                  >
                    {t("openChart")}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && stay ? (
          <p ref={formErrorRef} className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {okMsg ? (
          <p ref={okMsgRef} className="form-ok" role="status">
            {okMsg}
          </p>
        ) : null}
      </div>

      <aside className="opd-bill-rail" aria-label={t("ipdStayTitle")}>
        {stay ? (
          <>
            {stay.status === "open" ? (
              <>
                <button
                  type="button"
                  className="opd-bill-rail-btn opd-bill-rail-btn--accent"
                  disabled={busy || parseKyat(depositAmount) == null}
                  data-guide="ipd-take-deposit"
                  aria-busy={(pending && pendingAction === "deposit") || undefined}
                  onClick={() => void takeDeposit()}
                >
                  <span className="opd-bill-rail-btn-main">
                    <BillBtnIcon name="plus" pending={pending && pendingAction === "deposit"} />
                    <span>{t("ipdTakeDeposit")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="opd-bill-rail-btn"
                  disabled={busy}
                  aria-busy={(pending && pendingAction === "notes") || undefined}
                  onClick={() => void saveNotes()}
                >
                  <span className="opd-bill-rail-btn-main">
                    <BillBtnIcon name="check" pending={pending && pendingAction === "notes"} />
                    <span>{t("ipdSaveNotes")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="opd-bill-rail-btn opd-bill-rail-btn--danger"
                  disabled={busy}
                  data-guide="ipd-discharge"
                  onClick={() => setConfirmDischarge(true)}
                >
                  <span className="opd-bill-rail-btn-main">
                    <BillBtnIcon name="check" />
                    <span className="opd-bill-rail-btn-text">
                      <span className="opd-bill-rail-btn-label">{t("ipdDischarge")}</span>
                      <span className="opd-bill-rail-btn-sub">
                        {settlementSub(stay.balance_mmk ?? 0, t)}
                      </span>
                    </span>
                  </span>
                </button>
              </>
            ) : null}
            <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={() => setDailyOpen(true)}>
              <span className="opd-bill-rail-btn-main">
                <BillBtnIcon name="print" />
                <span>{t("ipdPrintDailyStatement")}</span>
              </span>
            </button>
            <button
              type="button"
              className="opd-bill-rail-btn"
              disabled={busy}
              aria-busy={(pending && pendingAction === "statement") || undefined}
              onClick={() => void printStatement()}
            >
              <span className="opd-bill-rail-btn-main">
                <BillBtnIcon name="print" pending={pending && pendingAction === "statement"} />
                <span>{t("ipdPrintStatement")}</span>
              </span>
            </button>
            <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={backToList}>
              <span className="opd-bill-rail-btn-main">
                <BillBtnIcon name="history" />
                <span>{t("ipdBackToList")}</span>
              </span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="opd-bill-rail-btn opd-bill-rail-btn--accent"
              disabled={busy || chartId == null}
              data-guide="ipd-admit"
              aria-busy={(pending && pendingAction === "admit") || undefined}
              onClick={() => void admit()}
            >
              <span className="opd-bill-rail-btn-main">
                <BillBtnIcon name="plus" pending={pending && pendingAction === "admit"} />
                <span>{t("ipdAdmit")}</span>
              </span>
            </button>
            <button
              type="button"
              className="opd-bill-rail-btn"
              disabled={busy}
              onClick={() => {
                setStay(null);
                setShowCash(true);
              }}
            >
              <span className="opd-bill-rail-btn-main">
                <BillBtnIcon name="clipboard" />
                <span>{t("ipdDailyCash")}</span>
              </span>
            </button>
            <button
              type="button"
              className="opd-bill-rail-btn"
              disabled={busy}
              onClick={() => setListStatus((current) => (current === "open" ? "settled" : "open"))}
            >
              <span className="opd-bill-rail-btn-main">
                <BillBtnIcon name="history" />
                <span>{listStatus === "open" ? t("ipdSettledStays") : t("ipdOpenStays")}</span>
              </span>
            </button>
          </>
        )}
      </aside>
      {dailyOpen && stay ? (
        <IpdDailyStatementPreview
          stayId={stay.id}
          stayOpen={stay.status === "open"}
          initialDate={defaultIpdStatementDate(stay)}
          title={t("ipdDailyStatement")}
          onClose={() => setDailyOpen(false)}
          onDecided={refreshAfterDecision}
        />
      ) : null}
      {confirmDischarge ? (
        <AlertDialog
          tone="warning"
          title={t("ipdDischarge")}
          message={dischargeConfirmMessage(stay, t)}
          busy={busy}
          danger
          confirmLabel={t("ipdDischarge")}
          onClose={() => {
            if (!busy) setConfirmDischarge(false);
          }}
          onConfirm={() => void dischargeStay()}
        />
      ) : null}
    </section>
  );
}

function genderLabel(gender: string, t: (key: string) => string): string {
  if (gender === "M") return t("genderM");
  if (gender === "F") return t("genderF");
  if (gender === "Other") return t("genderOther");
  return gender;
}

function yesterdayStayLine(row: IpdAdmission, t: (key: string) => string): string {
  return `${t("ipdYesterday")}: ${voucherStatusLabel(row.yesterday_voucher_status ?? "", row.admitted_at, t)}`;
}

function voucherStatusLabel(status: string, admittedAt: string, t: (key: string) => string): string {
  if (status === "paid") return t("ipdVoucherPaid");
  if (status === "credit") return t("ipdVoucherCarried");
  if (status === "issued") return t("ipdVoucherAwaiting");
  const admitted = utcStampToYangonDate(admittedAt);
  if (!admitted || admitted >= yangonToday()) return t("ipdVoucherStillOpen");
  return t("ipdVoucherAwaiting");
}

function dischargeConfirmMessage(stay: IpdAdmission | null, t: (key: string) => string): string {
  const base = t("confirmIpdDischarge");
  if (stay?.yesterday_voucher_status === "issued") {
    return `${base} ${t("confirmIpdDischargeAwaiting")}`;
  }
  return base;
}

function statusLabel(status: string, t: (key: string) => string): string {
  if (status === "open") return t("ipdStatusOpen");
  if (status === "settled") return t("ipdStatusSettled");
  return status;
}

function ledgerKindLabel(
  kind: string,
  amount: number,
  source: string,
  t: (key: string) => string,
): string {
  if (kind === "deposit") return t("ipdKindDeposit");
  if (kind === "ward") return t("ipdKindWard");
  if (kind === "charge") {
    const charge = amount < 0;
    if (source === "opd") return charge ? t("ipdKindOpdCharge") : t("ipdKindOpdCredit");
    if (source === "lab") return charge ? t("ipdKindLabCharge") : t("ipdKindLabCredit");
    if (source === "ot") return charge ? t("ipdKindOtCharge") : t("ipdKindOtCredit");
    if (source === "pharmacy") return charge ? t("ipdKindPharmacyCharge") : t("ipdKindPharmacyCredit");
    return charge ? t("ipdKindCharge") : t("ipdKindCredit");
  }
  if (kind === "reversal") return t("ipdKindReversal");
  if (kind === "refund") return t("ipdKindRefund");
  if (kind === "collection") return t("ipdKindCollection");
  return kind;
}

function totalChargesMmk(ledger: IpdLedgerLine[]): number {
  let sum = 0;
  for (const line of ledger) {
    if (line.kind === "ward" || line.kind === "charge" || line.kind === "reversal") {
      sum += line.amount_mmk;
    }
  }
  return -sum;
}

function ledgerCanPrint(line: IpdLedgerLine): boolean {
  if (line.kind === "deposit") return true;
  if (line.source_id == null || line.source_id < 1) return false;
  return (
    line.source === "opd" ||
    line.source === "ot" ||
    line.source === "pharmacy" ||
    line.source === "lab"
  );
}

function ledgerSub(line: IpdLedgerLine): string {
  const desk =
    line.kind === "charge"
      ? ""
      : line.source === "opd"
        ? "OPD"
        : line.source === "lab"
          ? "Lab"
        : line.source === "ot"
          ? "OT"
          : line.source === "pharmacy"
            ? "Pharmacy"
            : "";
  return [desk, line.note, line.created_at].filter(Boolean).join(" · ");
}

function settlementSub(balance: number, t: (key: string) => string): string {
  if (balance > 0) return `${t("ipdWillRefund")} · ${formatMMK(balance)}`;
  if (balance < 0) return `${t("ipdWillCollect")} · ${formatMMK(-balance)}`;
  return t("ipdWillZero");
}

function localDay(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function IpdCashPanel({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [date, setDate] = useState(localDay);
  const [report, setReport] = useState<IpdCashReport | null>(null);
  const [busy, setBusy] = useState(false);
  const { pending, begin, end } = useBillActionPending();
  const [error, setError] = useState<string | null>(null);

  async function load(next = date) {
    setBusy(true);
    setError(null);
    try {
      setReport(await fetchIpdCash(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function printCash() {
    if (!begin("dailyCash")) return;
    setBusy(true);
    setError(null);
    try {
      await printIpdCash(date, t("ipdDailyCash"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setBusy(false);
      end();
    }
  }

  useEffect(() => {
    void load(date);
    // The date field loads on the button, matching the desk cash report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="opd-bill-desk">
      <div className="opd-bill-desk-main">
        <h2 className="opd-bill-desk-title">{t("ipdDailyCash")}</h2>
        <div className="btn-row report-filters">
          <label className="field inline-field">
            <span>{t("reportDate")}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
            {t("load")}
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {report ? (
          <>
            <p className="hint">
              {t("ipdKindDeposit")} {formatMMK(report.deposit_mmk)} · {t("ipdKindCollection")}{" "}
              {formatMMK(report.collection_mmk)} · {t("ipdKindRefund")} {formatMMK(report.refund_mmk)} ·{" "}
              {t("ipdNetCash")} {formatMMK(report.net_mmk)} {t("mmk")}
            </p>
            <ul className="data-list">
              {report.lines.length === 0 ? <li className="empty-row">{t("ipdNoLedger")}</li> : null}
              {report.lines.map((line, index) => (
                <li key={`${line.admission_no}-${line.created_at}-${index}`}>
                  <div>
                    <p className="row-title">
                      {ledgerKindLabel(line.kind, line.amount_mmk, "", t)} · {formatMMK(line.amount_mmk)}{" "}
                      {t("mmk")}
                    </p>
                    <p className="row-sub">
                      {line.admission_no} · {line.patient}
                      {line.note ? ` · ${line.note}` : ""} · {line.created_at}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <aside className="opd-bill-rail" aria-label={t("ipdDailyCash")}>
        <button
          type="button"
          className="opd-bill-rail-btn opd-bill-rail-btn--accent"
          disabled={busy || !report}
          aria-busy={pending || undefined}
          onClick={() => void printCash()}
        >
          <span className="opd-bill-rail-btn-main">
            <BillBtnIcon name="print" pending={pending} />
            <span>{t("print")}</span>
          </span>
        </button>
        <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={onBack}>
          <span className="opd-bill-rail-btn-main">
            <BillBtnIcon name="history" />
            <span>{t("ipdBackToList")}</span>
          </span>
        </button>
      </aside>
    </section>
  );
}

function parseKyat(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}
