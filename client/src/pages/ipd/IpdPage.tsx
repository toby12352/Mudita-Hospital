import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  admitPatient,
  deleteIpdDeposit,
  dischargeIpd,
  fetchIpdCash,
  getIpdAdmission,
  listIpdAdmissions,
  postIpdDeposit,
  printIpdCash,
  printIpdDeposit,
  printIpdStatement,
  purgeIpdAdmission,
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
import {
  BillHistoryToolbar,
  type BillHistoryQuery,
  type BillHistoryStatusOption,
  type BillHistorySuggestItem,
} from "@/shared/BillHistoryToolbar";
import { BillHistoryTable } from "@/shared/BillHistoryTable";
import { fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { useBillActionPending } from "@/shared/useActionLock";

const DRAFT_ADMISSION_NO = "IPD-000*";

type DraftPatient = {
  id: number;
  name: string;
  phone: string;
  age_years: number | null;
  gender: string;
};

export function IpdPage({ openRecordId }: { openRecordId?: number } = {}) {
  const { t } = useI18n();
  const [allStays, setAllStays] = useState<IpdAdmission[]>([]);
  const [listQuery, setListQuery] = useState<BillHistoryQuery | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [stay, setStay] = useState<IpdAdmission | null>(null);
  const [composing, setComposing] = useState(false);
  const [notes, setNotes] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [roomEditing, setRoomEditing] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [chartId, setChartId] = useState<number | null>(null);
  const [draftPatient, setDraftPatient] = useState<DraftPatient | null>(null);
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
  const [showCash, setShowCash] = useState(false);
  const [cashReport, setCashReport] = useState<IpdCashReport | null>(null);
  const [cashQuery, setCashQuery] = useState<BillHistoryQuery | null>(null);
  const [cashLoading, setCashLoading] = useState(false);
  const [confirmDischarge, setConfirmDischarge] = useState(false);
  const [purgeStayId, setPurgeStayId] = useState<number | null>(null);
  const [deleteDepositTarget, setDeleteDepositTarget] = useState<IpdLedgerLine | null>(null);
  const [deleteDepositStep, setDeleteDepositStep] = useState<1 | 2>(1);
  const [deleteDepositError, setDeleteDepositError] = useState<string | null>(null);
  const [deleteDepositBusy, setDeleteDepositBusy] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [printingLedgerId, setPrintingLedgerId] = useState<number | null>(null);
  const patientFieldRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<HTMLInputElement>(null);
  const depositAmountRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const okMsgRef = useRef<HTMLParagraphElement>(null);
  const listQueryRef = useRef(listQuery);
  listQueryRef.current = listQuery;

  const statusOptions = useMemo(
    (): BillHistoryStatusOption[] => [
      { value: "", label: t("all") },
      { value: "open", label: t("ipdStatusOpen") },
      { value: "settled", label: t("ipdStatusSettled") },
      { value: "deleted", label: t("deletedStatus") },
    ],
    [t],
  );

  const cashStatusOptions = useMemo(
    (): BillHistoryStatusOption[] => [
      { value: "", label: t("all") },
      { value: "deposit", label: t("ipdKindDeposit") },
      { value: "collection", label: t("ipdKindCollection") },
      { value: "refund", label: t("ipdKindRefund") },
    ],
    [t],
  );

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

  const reloadStays = useCallback(
    async (query: BillHistoryQuery) => {
      setListLoading(true);
      setError(null);
      try {
        const status =
          query.money === "open" || query.money === "settled" || query.money === "deleted"
            ? query.money
            : "";
        setAllStays(await listIpdAdmissions(status));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errGeneric"));
      } finally {
        setListLoading(false);
      }
    },
    [t],
  );

  async function refreshList() {
    const q = listQueryRef.current;
    if (q) await reloadStays(q);
    else setAllStays(await listIpdAdmissions("open"));
  }

  const filteredStays = useMemo(() => {
    if (!listQuery) return [];
    const q = listQuery.q.trim().toLowerCase();
    let rows = allStays;
    if (q) {
      rows = rows.filter((row) => {
        const chart = String(row.patient.id);
        return (
          row.admission_no.toLowerCase().includes(q) ||
          row.patient.name.toLowerCase().includes(q) ||
          chart.includes(q)
        );
      });
    }
    if (listQuery.from || listQuery.to) {
      rows = rows.filter((row) => {
        const day = utcStampToYangonDate(row.admitted_at);
        if (!day) return false;
        if (listQuery.from && day < listQuery.from) return false;
        if (listQuery.to && day > listQuery.to) return false;
        return true;
      });
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const cmp = a.admitted_at.localeCompare(b.admitted_at);
      if (cmp !== 0) return listQuery.sort === "asc" ? cmp : -cmp;
      return listQuery.sort === "asc" ? a.id - b.id : b.id - a.id;
    });
    return sorted;
  }, [allStays, listQuery]);

  const loadSuggestions = useCallback(
    async (q: string, filters: Omit<BillHistoryQuery, "q">): Promise<BillHistorySuggestItem[]> => {
      const needle = q.trim().toLowerCase();
      if (!needle) return [];
      let rows = allStays;
      if (filters.money === "open" || filters.money === "settled" || filters.money === "deleted") {
        rows = rows.filter((row) => row.status === filters.money);
      }
      if (filters.from || filters.to) {
        rows = rows.filter((row) => {
          const day = utcStampToYangonDate(row.admitted_at);
          if (!day) return false;
          if (filters.from && day < filters.from) return false;
          if (filters.to && day > filters.to) return false;
          return true;
        });
      }
      return rows
        .filter((row) => {
          const chart = String(row.patient.id);
          return (
            row.admission_no.toLowerCase().includes(needle) ||
            row.patient.name.toLowerCase().includes(needle) ||
            chart.includes(needle)
          );
        })
        .slice(0, 8)
        .map((row) => ({
          id: row.id,
          voucher: row.admission_no,
          name: row.patient.name,
        }));
    },
    [allStays],
  );

  function cashDateFromQuery(query: BillHistoryQuery): string {
    if (query.from.trim()) return query.from.trim();
    if (query.to.trim()) return query.to.trim();
    return localDay();
  }

  const reloadCash = useCallback(
    async (query: BillHistoryQuery) => {
      setCashLoading(true);
      setError(null);
      try {
        setCashReport(await fetchIpdCash(cashDateFromQuery(query)));
      } catch (e) {
        setCashReport(null);
        setError(e instanceof Error ? e.message : t("errGeneric"));
      } finally {
        setCashLoading(false);
      }
    },
    [t],
  );

  const filteredCashLines = useMemo(() => {
    if (!cashReport || !cashQuery) return [];
    const q = cashQuery.q.trim().toLowerCase();
    let rows = cashReport.lines;
    if (cashQuery.money) {
      rows = rows.filter((line) => line.kind === cashQuery.money);
    }
    if (q) {
      rows = rows.filter(
        (line) =>
          line.admission_no.toLowerCase().includes(q) ||
          line.patient.toLowerCase().includes(q) ||
          line.note.toLowerCase().includes(q) ||
          line.kind.toLowerCase().includes(q),
      );
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const cmp = a.created_at.localeCompare(b.created_at);
      return cashQuery.sort === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [cashReport, cashQuery]);

  const loadCashSuggestions = useCallback(
    async (q: string, filters: Omit<BillHistoryQuery, "q">): Promise<BillHistorySuggestItem[]> => {
      const needle = q.trim().toLowerCase();
      if (!needle || !cashReport) return [];
      let rows = cashReport.lines;
      if (filters.money) {
        rows = rows.filter((line) => line.kind === filters.money);
      }
      return rows
        .filter(
          (line) =>
            line.admission_no.toLowerCase().includes(needle) ||
            line.patient.toLowerCase().includes(needle) ||
            line.note.toLowerCase().includes(needle),
        )
        .slice(0, 8)
        .map((line, index) => ({
          id: index + 1,
          voucher: line.admission_no,
          name: line.patient,
        }));
    },
    [cashReport],
  );

  async function printCashReport() {
    if (!cashReport) return;
    if (!begin("dailyCash")) return;
    setBusy(true);
    setError(null);
    try {
      await printIpdCash(cashReport.date, t("ipdDailyCash"));
    } catch (e) {
      applyApiError(e);
    } finally {
      setBusy(false);
      end();
    }
  }

  function toggleCash() {
    if (showCash) {
      setShowCash(false);
      setCashReport(null);
      setCashQuery(null);
      setError(null);
      return;
    }
    setShowCash(true);
    setError(null);
  }

  function showStay(row: IpdAdmission) {
    setStay(row);
    setComposing(false);
    setNotes(row.notes);
    setRoomNo(row.room_no ?? "");
    setRoomEditing(false);
    setPatientName("");
    setChartId(null);
    setDraftPatient(null);
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

  useEffect(() => {
    if (openRecordId != null) void openStay(openRecordId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once on mount from patient chart
  }, []);

  function startCompose() {
    setStay(null);
    setComposing(true);
    setShowCash(false);
    setNotes("");
    setRoomNo("");
    setRoomEditing(false);
    setPatientName("");
    setChartId(null);
    setDraftPatient(null);
    setDepositAmount("");
    setDepositNote("");
    setBilledAtLocal(nowDatetimeLocal());
    setError(null);
    clearFieldErrors();
    setOkMsg(null);
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
      await refreshList();
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
      await refreshList();
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
    setPrintingLedgerId(line.id);
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
      setPrintingLedgerId(null);
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
      await refreshList();
    } catch (e) {
      applyApiError(e);
      setConfirmDischarge(false);
    } finally {
      setBusy(false);
      end();
    }
  }

  async function purgeStay() {
    if (purgeStayId == null || !isAdmin) return;
    const id = purgeStayId;
    if (!begin("purge")) return;
    setBusy(true);
    setError(null);
    try {
      await purgeIpdAdmission(id);
      setPurgeStayId(null);
      if (stay?.id === id) {
        setStay(null);
        setComposing(false);
      }
      await refreshList();
    } catch (e) {
      applyApiError(e);
      setPurgeStayId(null);
    } finally {
      setBusy(false);
      end();
    }
  }

  function openDeleteLedgerLine(line: IpdLedgerLine) {
    if (!isAdmin || !stayOpen) return;
    if (line.kind !== "deposit" && line.kind !== "ward") return;
    setDeleteDepositError(null);
    setDeleteDepositStep(1);
    setDeleteDepositTarget(line);
  }

  function closeDeleteDeposit() {
    if (deleteDepositBusy) return;
    setDeleteDepositTarget(null);
    setDeleteDepositStep(1);
    setDeleteDepositError(null);
  }

  async function confirmDeleteDeposit() {
    if (!stay || !deleteDepositTarget || !isAdmin) return;
    if (deleteDepositStep === 1) {
      setDeleteDepositStep(2);
      setDeleteDepositError(null);
      return;
    }
    const line = deleteDepositTarget;
    setDeleteDepositBusy(true);
    setDeleteDepositError(null);
    setError(null);
    try {
      const saved = await deleteIpdDeposit(stay.id, line.id);
      setDeleteDepositTarget(null);
      setDeleteDepositStep(1);
      setStay(saved);
      setOkMsg(t("saved"));
      await refreshList();
    } catch (e) {
      setDeleteDepositError(e instanceof Error ? e.message : t("errGeneric"));
    } finally {
      setDeleteDepositBusy(false);
    }
  }

  function refreshAfterDecision() {
    const id = stay?.id;
    if (id == null) return;
    void (async () => {
      try {
        const saved = await getIpdAdmission(id);
        setStay((current) => (current?.id === id ? saved : current));
        await refreshList();
      } catch {
        /* the list reloads when they go back */
      }
    })();
  }

  function backToList() {
    setStay(null);
    setComposing(false);
    setShowCash(false);
    setNotes("");
    setRoomNo("");
    setRoomEditing(false);
    setPatientName("");
    setChartId(null);
    setDraftPatient(null);
    setError(null);
    setOkMsg(null);
    clearFieldErrors();
    void refreshList().catch((e) => setError(e instanceof Error ? e.message : t("errGeneric")));
  }

  const onForm = stay != null || composing;
  const stayOpen = stay?.status === "open";
  const canActOnStay = stayOpen;
  const emptyListLabel =
    listQuery?.money === "settled"
      ? t("ipdNoSettled")
      : listQuery?.money === "deleted"
        ? t("ipdNoDeleted")
        : t("ipdNoStays");

  const purgeTarget = purgeStayId != null ? allStays.find((row) => row.id === purgeStayId) : null;

  return (
    <section className={`opd-bill-desk${onForm ? "" : " opd-bill-desk--history"}`}>
      <div className="opd-bill-desk-main">
        <h2 className="opd-bill-desk-title">
          {stay
            ? stay.admission_no
            : composing
              ? DRAFT_ADMISSION_NO
              : showCash
                ? t("ipdDailyCash")
                : t("ipdStayTitle")}
        </h2>

        {!onForm ? (
          <>
            {showCash ? (
              <BillHistoryToolbar
                key="ipd-cash"
                searchPlaceholder={t("ipdStaySearchPlaceholder")}
                initialRange="today"
                statusOptions={cashStatusOptions}
                statusFieldLabel={t("status")}
                onSearch={(query) => {
                  setCashQuery(query);
                  void reloadCash(query);
                }}
                loadSuggestions={loadCashSuggestions}
                onInvalidRange={() => setError(t("billHistoryInvalidRange"))}
                trailing={
                  <>
                    <button
                      type="button"
                      className="btn action on"
                      disabled={busy}
                      aria-pressed={true}
                      onClick={toggleCash}
                    >
                      <ActionIcon name="clipboard" />
                      {t("ipdDailyCash")}
                    </button>
                    <button
                      type="button"
                      className="btn action primary"
                      disabled={busy || !cashReport || cashLoading}
                      aria-busy={(pending && pendingAction === "dailyCash") || undefined}
                      onClick={() => void printCashReport()}
                    >
                      <ActionIcon name="print" />
                      {t("print")}
                    </button>
                  </>
                }
              />
            ) : (
              <BillHistoryToolbar
                key="ipd-stays"
                searchPlaceholder={t("ipdStaySearchPlaceholder")}
                initialRange="all"
                initialMoney="open"
                statusOptions={statusOptions}
                statusFieldLabel={t("status")}
                onSearch={(query) => {
                  setListQuery(query);
                  void reloadStays(query);
                }}
                loadSuggestions={loadSuggestions}
                onInvalidRange={() => setError(t("billHistoryInvalidRange"))}
                trailing={
                  <>
                    <button
                      type="button"
                      className="btn action"
                      disabled={busy}
                      aria-pressed={false}
                      onClick={toggleCash}
                    >
                      <ActionIcon name="clipboard" />
                      {t("ipdDailyCash")}
                    </button>
                    <button
                      type="button"
                      className="btn action primary"
                      disabled={busy}
                      data-guide="ipd-admit"
                      onClick={startCompose}
                    >
                      <ActionIcon name="plus" />
                      {t("ipdAddNewPatient")}
                    </button>
                  </>
                }
              />
            )}
            {error ? (
              <p ref={formErrorRef} className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            {showCash && cashReport ? (
              <p className="hint">
                {t("ipdKindDeposit")} {formatMMK(cashReport.deposit_mmk)} · {t("ipdKindCollection")}{" "}
                {formatMMK(cashReport.collection_mmk)} · {t("ipdKindRefund")}{" "}
                {formatMMK(cashReport.refund_mmk)} · {t("ipdNetCash")} {formatMMK(cashReport.net_mmk)}{" "}
                {t("mmk")}
              </p>
            ) : null}
            {showCash ? (
              <BillHistoryTable
                ariaLabel={t("ipdDailyCash")}
                emptyLabel={t("ipdNoLedger")}
                loading={cashLoading || cashQuery == null}
                busy={busy}
                rows={filteredCashLines.map((line, index) => ({
                  id: index + 1,
                  key: `${line.admission_no}-${line.created_at}-${index}`,
                  voucher: line.admission_no,
                  name: line.patient,
                  nameDetail: line.note.trim() || undefined,
                  status: line.kind,
                  statusLabel: ledgerKindLabel(line.kind, line.amount_mmk, "", t),
                  statusTone: ledgerStatusTone(line.kind, line.amount_mmk),
                  when: line.created_at,
                  priceMmk: line.amount_mmk,
                }))}
              />
            ) : (
              <BillHistoryTable
                ariaLabel={t("ipdStayTitle")}
                emptyLabel={emptyListLabel}
                loading={listLoading || listQuery == null}
                hidePrice
                busy={busy}
                onActivate={(id) => void openStay(id)}
                onDelete={isAdmin ? (id) => setPurgeStayId(id) : undefined}
                rows={filteredStays.map((row) => ({
                  id: row.id,
                  voucher: row.admission_no,
                  name: row.patient.name,
                  nameDetail:
                    row.status === "open" ? yesterdayStayLine(row, t) : undefined,
                  status: row.status,
                  statusLabel: statusLabel(row.status, t),
                  statusTone:
                    row.status === "open" ? "ipd" : row.status === "deleted" ? "deleted" : "paid",
                  when: row.admitted_at,
                  priceMmk: null,
                  canDelete: isAdmin && row.status === "open",
                }))}
              />
            )}
          </>
        ) : stay ? (
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
                    disabled={busy || !stayOpen || !roomEditing}
                    aria-label={t("roomNo")}
                    onChange={(e) => setRoomNo(e.target.value)}
                  />
                  {stayOpen && !roomEditing ? (
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
                  disabled={busy || !stayOpen}
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
            <BillHistoryTable
              ariaLabel={t("ipdLedger")}
              emptyLabel={t("ipdNoLedger")}
              busy={busy || deleteDepositBusy}
              printingId={printingLedgerId}
              onPrint={(id) => {
                const line = (stay.ledger ?? []).find((row) => row.id === id);
                if (line) void printLedgerLine(line);
              }}
              onDelete={
                isAdmin && stayOpen
                  ? (id) => {
                      const line = (stay.ledger ?? []).find((row) => row.id === id);
                      if (line) openDeleteLedgerLine(line);
                    }
                  : undefined
              }
              rows={(stay.ledger ?? []).map((line) => ({
                id: line.id,
                voucher: line.note.trim() || "—",
                name: ledgerKindLabel(line.kind, line.amount_mmk, line.source, t),
                status: line.kind,
                statusLabel: ledgerKindLabel(line.kind, line.amount_mmk, line.source, t),
                statusTone: ledgerStatusTone(line.kind, line.amount_mmk),
                when: line.created_at,
                priceMmk: line.amount_mmk,
                canPrint: ledgerCanPrint(line),
                canDelete:
                  isAdmin && stayOpen && (line.kind === "deposit" || line.kind === "ward"),
              }))}
            />
            {stayOpen ? (
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
                      disabled={busy}
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
                      disabled={busy}
                      onChange={(e) => setDepositNote(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="ipd-stay-fields">
              <div
                ref={patientFieldRef}
                className={`opd-bill-field opd-bill-field--typeahead${patientError ? " is-invalid" : ""}`}
              >
                <span className="opd-bill-label">{t("idName")}</span>
                <PatientChartTypeahead
                  value={patientName}
                  disabled={busy}
                  onChange={(value) => {
                    setPatientName(value);
                    setChartId(null);
                    setDraftPatient(null);
                    setPatientError(null);
                  }}
                  onPick={(patient: PatientChart) => {
                    setPatientName(patient.name);
                    setChartId(patient.id);
                    setDraftPatient({
                      id: patient.id,
                      name: patient.name,
                      phone: patient.phone,
                      age_years: patient.age_years,
                      gender: patient.gender,
                    });
                    setError(null);
                    setPatientError(null);
                  }}
                />
              </div>
              <label className="opd-bill-field ipd-stay-field-right">
                <span className="opd-bill-label">{t("admissionNo")}</span>
                <input className="opd-bill-input" value={DRAFT_ADMISSION_NO} disabled />
              </label>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("phone")}</span>
                <input className="opd-bill-input" value={draftPatient?.phone ?? ""} disabled />
              </label>
              {isAdmin ? (
                <div className="opd-bill-field ipd-stay-field-right">
                  <BillDateField
                    editable
                    value={billedAtLocal}
                    displayWhen={formatUtcAsLocal(null)}
                    onChange={setBilledAtLocal}
                    disabled={busy}
                  />
                </div>
              ) : (
                <label className="opd-bill-field ipd-stay-field-right">
                  <span className="opd-bill-label">{t("ipdAdmittedAt")}</span>
                  <input className="opd-bill-input" value="" disabled />
                </label>
              )}
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("age")}</span>
                <input
                  className="opd-bill-input"
                  value={draftPatient?.age_years != null ? String(draftPatient.age_years) : ""}
                  disabled
                />
              </label>
              <label className="opd-bill-field ipd-stay-field-right">
                <span className="opd-bill-label">{t("status")}</span>
                <input className="opd-bill-input" value="" disabled />
              </label>
              <label className="opd-bill-field">
                <span className="opd-bill-label">{t("gender")}</span>
                <input
                  className="opd-bill-input"
                  value={draftPatient ? genderLabel(draftPatient.gender, t) : ""}
                  disabled
                />
              </label>
              <div className="opd-bill-field ipd-stay-field-right">
                <span className="opd-bill-label">{t("roomNo")}</span>
                <div className="opd-bill-control">
                  <input className="opd-bill-input" value="" disabled aria-label={t("roomNo")} />
                </div>
              </div>
              <label className="ipd-stay-notes">
                <span className="opd-bill-label">{t("notes")}</span>
                <textarea className="opd-bill-input" rows={4} value="" disabled />
              </label>
            </div>
            <FieldError>{patientError}</FieldError>
          </>
        )}

        {error && onForm ? (
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

      {onForm ? (
        <aside className="opd-bill-rail" aria-label={t("ipdStayTitle")}>
          <button
            type="button"
            className="opd-bill-rail-btn opd-bill-rail-btn--accent"
            disabled={busy || stay != null || chartId == null}
            aria-busy={(pending && pendingAction === "admit") || undefined}
            onClick={() => void admit()}
          >
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon name="plus" pending={pending && pendingAction === "admit"} />
              <span className="opd-bill-rail-btn-text">
                <span className="opd-bill-rail-btn-label">{t("ipdAdmit")}</span>
              </span>
            </span>
          </button>
          {canActOnStay ? (
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
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdTakeDeposit")}</span>
                  </span>
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
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdSaveNotes")}</span>
                  </span>
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
          ) : composing ? (
            <>
              <button type="button" className="opd-bill-rail-btn" disabled>
                <span className="opd-bill-rail-btn-main">
                  <BillBtnIcon name="plus" />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdTakeDeposit")}</span>
                  </span>
                </span>
              </button>
              <button type="button" className="opd-bill-rail-btn" disabled>
                <span className="opd-bill-rail-btn-main">
                  <BillBtnIcon name="check" />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdSaveNotes")}</span>
                  </span>
                </span>
              </button>
              <button type="button" className="opd-bill-rail-btn opd-bill-rail-btn--danger" disabled>
                <span className="opd-bill-rail-btn-main">
                  <BillBtnIcon name="check" />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdDischarge")}</span>
                  </span>
                </span>
              </button>
            </>
          ) : null}
          {stay ? (
            <>
              <button
                type="button"
                className="opd-bill-rail-btn"
                disabled={busy}
                onClick={() => setDailyOpen(true)}
              >
                <span className="opd-bill-rail-btn-main">
                  <BillBtnIcon name="print" />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdPrintDailyStatement")}</span>
                  </span>
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
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdPrintStatement")}</span>
                  </span>
                </span>
              </button>
            </>
          ) : (
            <>
              <button type="button" className="opd-bill-rail-btn" disabled>
                <span className="opd-bill-rail-btn-main">
                  <BillBtnIcon name="print" />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdPrintDailyStatement")}</span>
                  </span>
                </span>
              </button>
              <button type="button" className="opd-bill-rail-btn" disabled>
                <span className="opd-bill-rail-btn-main">
                  <BillBtnIcon name="print" />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("ipdPrintStatement")}</span>
                  </span>
                </span>
              </button>
            </>
          )}
          <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={backToList}>
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon name="history" />
              <span className="opd-bill-rail-btn-text">
                <span className="opd-bill-rail-btn-label">{t("ipdBackToList")}</span>
              </span>
            </span>
          </button>
        </aside>
      ) : null}

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
      {purgeStayId != null ? (
        <AlertDialog
          tone="warning"
          title={t("ipdDeleteStay")}
          message={t("confirmIpdDeleteStay").replace(
            "{admission}",
            purgeTarget?.admission_no ?? String(purgeStayId),
          )}
          busy={busy}
          danger
          confirmLabel={t("delete")}
          onClose={() => {
            if (!busy) setPurgeStayId(null);
          }}
          onConfirm={() => void purgeStay()}
        />
      ) : null}
      {deleteDepositTarget ? (
        <AlertDialog
          key={`ledger-delete-${deleteDepositTarget.id}-${deleteDepositStep}`}
          tone="warning"
          title={t("delete")}
          identity={`${ledgerKindLabel(deleteDepositTarget.kind, deleteDepositTarget.amount_mmk, deleteDepositTarget.source, t)} · ${formatMMK(deleteDepositTarget.amount_mmk)} ${t("mmk")}`}
          message={
            deleteDepositStep === 1
              ? t(
                  deleteDepositTarget.kind === "ward"
                    ? "confirmDeleteIpdWard"
                    : "confirmDeleteIpdDeposit",
                ).replace(
                  "{amount}",
                  `${formatMMK(Math.abs(deleteDepositTarget.amount_mmk))} ${t("mmk")}`,
                )
              : t(
                  deleteDepositTarget.kind === "ward"
                    ? "confirmDeleteIpdWardFinal"
                    : "confirmDeleteIpdDepositFinal",
                ).replace(
                  "{amount}",
                  `${formatMMK(Math.abs(deleteDepositTarget.amount_mmk))} ${t("mmk")}`,
                )
          }
          error={deleteDepositError}
          busy={deleteDepositBusy}
          danger
          irreversible={deleteDepositStep === 2}
          confirmLabel={deleteDepositStep === 1 ? t("continueAction") : t("delete")}
          onClose={closeDeleteDeposit}
          onConfirm={() => void confirmDeleteDeposit()}
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
  if (status === "deleted") return t("deletedStatus");
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
    if (source === "ipd") return charge ? t("ipdKindIpdCharge") : t("ipdKindIpdCredit");
    return charge ? t("ipdKindCharge") : t("ipdKindCredit");
  }
  if (kind === "reversal") return t("ipdKindReversal");
  if (kind === "refund") return t("ipdKindRefund");
  if (kind === "collection") return t("ipdKindCollection");
  return kind;
}

function ledgerStatusTone(kind: string, amount: number): string {
  if (kind === "deposit" || kind === "collection") return "paid";
  if (kind === "reversal") return "void";
  if (kind === "refund") return "printed";
  if (kind === "charge" && amount >= 0) return "billed";
  if (kind === "ward" || kind === "charge") return "ipd";
  return "draft";
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
    line.source === "lab" ||
    line.source === "ipd"
  );
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

function parseKyat(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}
