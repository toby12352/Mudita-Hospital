import { useEffect, useState } from "react";
import {
  admitPatient,
  dischargeIpd,
  fetchIpdCash,
  getIpdAdmission,
  listIpdAdmissions,
  postIpdDeposit,
  postIpdWardCharge,
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
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";

export function IpdPage() {
  const { t } = useI18n();
  const [stays, setStays] = useState<IpdAdmission[]>([]);
  const [stay, setStay] = useState<IpdAdmission | null>(null);
  const [notes, setNotes] = useState("");
  const [patientName, setPatientName] = useState("");
  const [chartId, setChartId] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [wardDescription, setWardDescription] = useState("");
  const [wardAmount, setWardAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listStatus, setListStatus] = useState<"open" | "settled">("open");
  const [showCash, setShowCash] = useState(false);
  const [confirmDischarge, setConfirmDischarge] = useState(false);

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
    setPatientName("");
    setChartId(null);
    setDepositAmount("");
    setDepositNote("");
    setWardDescription("");
    setWardAmount("");
    setError(null);
    setOkMsg(null);
  }

  async function openStay(id: number) {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      showStay(await getIpdAdmission(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function admit() {
    if (chartId == null) {
      setError(t("errIpdPickPatient"));
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const created = await admitPatient(chartId);
      showStay(created);
      await loadStays();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (!stay) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const saved = await updateIpdNotes(stay.id, notes);
      showStay(saved);
      setOkMsg(t("saved"));
      await loadStays();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function takeDeposit() {
    if (!stay) return;
    const amount = parseKyat(depositAmount);
    if (amount == null) {
      setError(t("errIpdAmount"));
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const saved = await postIpdDeposit(stay.id, amount, depositNote);
      setStay(saved);
      setDepositAmount("");
      setDepositNote("");
      setWardDescription("");
      setWardAmount("");
      setOkMsg(t("saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function postWard() {
    if (!stay) return;
    const description = wardDescription.trim();
    const amount = parseKyat(wardAmount);
    if (!description) {
      setError(t("errIpdDescription"));
      return;
    }
    if (amount == null) {
      setError(t("errIpdAmount"));
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const saved = await postIpdWardCharge(stay.id, description, amount);
      setStay(saved);
      setDepositAmount("");
      setDepositNote("");
      setWardDescription("");
      setWardAmount("");
      setOkMsg(t("saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function printLedgerLine(line: IpdLedgerLine) {
    if (!stay) return;
    setBusy(true);
    setError(null);
    try {
      const title =
        line.kind === "deposit"
          ? t("ipdDepositReceipt")
          : line.note.trim() || t("print");
      await printIpdDeposit(stay.id, line.id, title);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function printStatement() {
    if (!stay) return;
    setBusy(true);
    setError(null);
    try {
      await printIpdStatement(stay.id, t("ipdStatement"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function dischargeStay() {
    if (!stay || stay.status !== "open") return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const saved = await dischargeIpd(stay.id);
      setConfirmDischarge(false);
      setStay(saved);
      setNotes(saved.notes);
      setDepositAmount("");
      setDepositNote("");
      setWardDescription("");
      setWardAmount("");
      setOkMsg(t("ipdDischarged"));
      await loadStays();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errGeneric"));
      setConfirmDischarge(false);
    } finally {
      setBusy(false);
    }
  }

  function backToList() {
    setStay(null);
    setShowCash(false);
    setNotes("");
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
            <div className="opd-bill-header">
              <div className="opd-bill-header-col">
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("idName")}</span>
                  <input
                    className="opd-bill-input"
                    value={`${stay.patient.id} / ${stay.patient.name}`}
                    disabled
                  />
                </label>
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("phone")}</span>
                  <input className="opd-bill-input" value={stay.patient.phone} disabled />
                </label>
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("age")}</span>
                  <input
                    className="opd-bill-input"
                    value={stay.patient.age_years != null ? String(stay.patient.age_years) : ""}
                    disabled
                  />
                </label>
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("gender")}</span>
                  <input className="opd-bill-input" value={genderLabel(stay.patient.gender, t)} disabled />
                </label>
              </div>
              <div className="opd-bill-header-col">
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("admissionNo")}</span>
                  <input className="opd-bill-input" value={stay.admission_no} disabled />
                </label>
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("ipdAdmittedAt")}</span>
                  <input className="opd-bill-input" value={stay.admitted_at} disabled />
                </label>
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("status")}</span>
                  <input className="opd-bill-input" value={statusLabel(stay.status, t)} disabled />
                </label>
                {stay.discharged_at ? (
                  <label className="opd-bill-field">
                    <span className="opd-bill-label">{t("ipdDischargedAt")}</span>
                    <input className="opd-bill-input" value={stay.discharged_at} disabled />
                  </label>
                ) : null}
              </div>
            </div>
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("notes")}</span>
              <textarea
                className="opd-bill-input"
                rows={4}
                value={notes}
                disabled={busy || stay.status !== "open"}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="opd-bill-footer">
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("balance")}</span>
                <input
                  className="opd-bill-input"
                  value={`${formatMMK(stay.balance_mmk ?? 0)} ${t("mmk")}`}
                  disabled
                  readOnly
                />
              </label>
              <p className="hint">{t("ipdBalanceHint")}</p>
            </div>
            <span className="opd-bill-label">{t("ipdLedger")}</span>
            <ul className="data-list">
              {(stay.ledger ?? []).length === 0 ? <li className="empty-row">{t("ipdNoLedger")}</li> : null}
              {(stay.ledger ?? []).map((line) => (
                <li key={line.id}>
                  <div>
                    <p className="row-title">
                      {ledgerKindLabel(line.kind, line.amount_mmk, t)} · {formatMMK(line.amount_mmk)} {t("mmk")}
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
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("amount")}</span>
                  <input
                    className="opd-bill-input"
                    inputMode="numeric"
                    value={depositAmount}
                    disabled={busy || stay.status !== "open"}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                </label>
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
              <div className="opd-bill-header-col">
                <span className="opd-bill-label">{t("ipdWardCharge")}</span>
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("description")}</span>
                  <input
                    className="opd-bill-input"
                    value={wardDescription}
                    disabled={busy || stay.status !== "open"}
                    onChange={(e) => setWardDescription(e.target.value)}
                  />
                </label>
                <label className="opd-bill-field">
                  <span className="opd-bill-label">{t("amount")}</span>
                  <input
                    className="opd-bill-input"
                    inputMode="numeric"
                    value={wardAmount}
                    disabled={busy || stay.status !== "open"}
                    onChange={(e) => setWardAmount(e.target.value)}
                  />
                </label>
              </div>
            </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="opd-bill-field opd-bill-field--typeahead">
              <span className="opd-bill-label">{t("patient")}</span>
              <PatientChartTypeahead
                value={patientName}
                disabled={busy}
                onChange={(value) => {
                  setPatientName(value);
                  setChartId(null);
                }}
                onPick={(patient: PatientChart) => {
                  setPatientName(patient.name);
                  setChartId(patient.id);
                  setError(null);
                }}
              />
            </div>
            <ul className="data-list">
              {stays.length === 0 ? (
                <li className="empty-row">{listStatus === "open" ? t("ipdNoStays") : t("ipdNoSettled")}</li>
              ) : null}
              {stays.map((row) => (
                <li key={row.id}>
                  <div>
                    <p className="row-title">
                      {row.admission_no} · {row.patient.name}
                    </p>
                    <p className="row-sub">
                      {t("chartLabel")} {row.patient.id} · {row.admitted_at}
                    </p>
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

        {error ? <p className="form-error">{error}</p> : null}
        {okMsg ? <p className="form-ok">{okMsg}</p> : null}
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
                  onClick={() => void takeDeposit()}
                >
                  <span className="opd-bill-rail-btn-main">
                    <ActionIcon name="plus" />
                    <span>{t("ipdTakeDeposit")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="opd-bill-rail-btn"
                  disabled={busy || wardDescription.trim() === "" || parseKyat(wardAmount) == null}
                  onClick={() => void postWard()}
                >
                  <span className="opd-bill-rail-btn-main">
                    <ActionIcon name="clipboard" />
                    <span>{t("ipdPostWard")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="opd-bill-rail-btn"
                  disabled={busy}
                  onClick={() => void saveNotes()}
                >
                  <span className="opd-bill-rail-btn-main">
                    <ActionIcon name="check" />
                    <span>{t("ipdSaveNotes")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="opd-bill-rail-btn opd-bill-rail-btn--danger"
                  disabled={busy}
                  onClick={() => setConfirmDischarge(true)}
                >
                  <span className="opd-bill-rail-btn-main">
                    <ActionIcon name="check" />
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
            <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={() => void printStatement()}>
              <span className="opd-bill-rail-btn-main">
                <ActionIcon name="print" />
                <span>{t("ipdPrintStatement")}</span>
              </span>
            </button>
            <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={backToList}>
              <span className="opd-bill-rail-btn-main">
                <ActionIcon name="history" />
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
              onClick={() => void admit()}
            >
              <span className="opd-bill-rail-btn-main">
                <ActionIcon name="plus" />
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
                <ActionIcon name="clipboard" />
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
                <ActionIcon name="history" />
                <span>{listStatus === "open" ? t("ipdSettledStays") : t("ipdOpenStays")}</span>
              </span>
            </button>
          </>
        )}
      </aside>
      {confirmDischarge ? (
        <AlertDialog
          tone="warning"
          title={t("ipdDischarge")}
          message={t("confirmIpdDischarge")}
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

function statusLabel(status: string, t: (key: string) => string): string {
  if (status === "open") return t("ipdStatusOpen");
  if (status === "settled") return t("ipdStatusSettled");
  return status;
}

function ledgerKindLabel(kind: string, amount: number, t: (key: string) => string): string {
  if (kind === "deposit") return t("ipdKindDeposit");
  if (kind === "ward") return t("ipdKindWard");
  if (kind === "charge") return amount < 0 ? t("ipdKindCharge") : t("ipdKindCredit");
  if (kind === "reversal") return t("ipdKindReversal");
  if (kind === "refund") return t("ipdKindRefund");
  if (kind === "collection") return t("ipdKindCollection");
  return kind;
}

function ledgerCanPrint(line: IpdLedgerLine): boolean {
  if (line.kind === "deposit") return true;
  if (line.source_id == null || line.source_id < 1) return false;
  return line.source === "opd" || line.source === "ot" || line.source === "pharmacy";
}

function ledgerSub(line: IpdLedgerLine): string {
  const desk =
    line.source === "opd" ? "OPD" : line.source === "ot" ? "OT" : line.source === "pharmacy" ? "Pharmacy" : "";
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
                      {ledgerKindLabel(line.kind, line.amount_mmk, t)} · {formatMMK(line.amount_mmk)} {t("mmk")}
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
          onClick={() => void printIpdCash(date, t("ipdDailyCash"))}
        >
          <span className="opd-bill-rail-btn-main">
            <ActionIcon name="print" />
            <span>{t("print")}</span>
          </span>
        </button>
        <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={onBack}>
          <span className="opd-bill-rail-btn-main">
            <ActionIcon name="history" />
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
