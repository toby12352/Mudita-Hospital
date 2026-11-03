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
import type { ClinicModule } from "@/app/portal";
import type { NavSectionId, View } from "@/app/types";
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
import { DialogCloseButton } from "@/shared/DialogCloseButton";
import { fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { formatMMK } from "@/shared/format";
import { DeskChrome } from "@/shared/DeskChrome";
import { useI18n } from "@/shared/i18n";
import { useBillActionFeedback, useBillActionPending } from "@/shared/useActionLock";

const DRAFT_ADMISSION_NO = "IPD-000*";

type DraftPatient = {
  id: number;
  name: string;
  phone: string;
  age_years: number | null;
  gender: string;
};

type OpenRecordTarget = {
  view: View;
  section: NavSectionId;
  openRecordId: number;
};

export function IpdPatientsPage({
  openRecordId,
  canReadModule,
  onOpenRecord,
}: {
  openRecordId?: number;
  canReadModule?: (module: ClinicModule) => boolean;
  onOpenRecord?: (target: OpenRecordTarget) => void;
} = {}) {
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
  const [depositPanelOpen, setDepositPanelOpen] = useState(false);
  const [depositPanelPos, setDepositPanelPos] = useState<{
    top: number;
    right: number;
    maxWidth: number;
  }>({
    top: 0,
    right: 0,
    maxWidth: 288,
  });
  const [flashLedgerId, setFlashLedgerId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [depositAmountError, setDepositAmountError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { action: pendingAction, pending, begin, end } = useBillActionPending();
  const { pulse, isOk, isErr } = useBillActionFeedback();
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
  const deskRef = useRef<HTMLElement>(null);
  const patientFieldRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<HTMLInputElement>(null);
  const depositAmountRef = useRef<HTMLInputElement>(null);
  const depositBtnRef = useRef<HTMLButtonElement>(null);
  const depositPanelRef = useRef<HTMLDivElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
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
    setDailyOpen(false);
  }, [stay?.id]);

  useEffect(() => {
    if (stay?.status !== "open") {
      setDepositPanelOpen(false);
      setDepositAmount("");
      setDepositNote("");
      setDepositAmountError(null);
    }
  }, [stay?.id, stay?.status]);

  function placeDepositPanel() {
    const btn = depositBtnRef.current;
    const desk = deskRef.current;
    const rail = btn?.closest(".opd-bill-rail") as HTMLElement | null;
    if (!btn || !desk || !rail) return;
    const gap = 8;
    const margin = 8;
    const deskRect = desk.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const panelH = depositPanelRef.current?.offsetHeight ?? 0;
    const right = rail.offsetWidth + gap;
    const available = Math.max(160, desk.clientWidth - right - margin);
    const maxWidth = Math.min(288, available);
    let top = btnRect.top - deskRect.top;
    const maxTop = Math.max(margin, desk.clientHeight - panelH - margin);
    if (top > maxTop) top = maxTop;
    if (top < margin) top = margin;
    setDepositPanelPos({ top, right, maxWidth });
  }

  useEffect(() => {
    if (!depositPanelOpen) return;
    placeDepositPanel();
    window.requestAnimationFrame(placeDepositPanel);
    function onDocKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeDepositPanel();
    }
    function onDocPointer(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (depositPanelRef.current?.contains(target)) return;
      if (depositBtnRef.current?.contains(target)) return;
      closeDepositPanel();
    }
    window.addEventListener("resize", placeDepositPanel);
    window.addEventListener("scroll", placeDepositPanel, true);
    document.addEventListener("keydown", onDocKey, true);
    document.addEventListener("mousedown", onDocPointer);
    window.setTimeout(() => revealField(depositAmountRef.current), 0);
    return () => {
      window.removeEventListener("resize", placeDepositPanel);
      window.removeEventListener("scroll", placeDepositPanel, true);
      document.removeEventListener("keydown", onDocKey, true);
      document.removeEventListener("mousedown", onDocPointer);
    };
  }, [depositPanelOpen]);

  function clearFieldErrors() {
    setPatientError(null);
    setDepositAmountError(null);
  }

  function openDepositPanel() {
    placeDepositPanel();
    setDepositAmountError(null);
    setDepositPanelOpen(true);
  }

  function closeDepositPanel() {
    setDepositPanelOpen(false);
    setDepositAmountError(null);
    window.setTimeout(() => depositBtnRef.current?.focus(), 0);
  }

  function toggleDepositPanel() {
    if (depositPanelOpen) closeDepositPanel();
    else openDepositPanel();
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
  }

  async function openStay(id: number) {
    setBusy(true);
    setError(null);
    clearFieldErrors();
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
    try {
      const created = await admitPatient(
        chartId,
        isAdmin && billedAtLocal ? { billed_at: billedAtLocal } : undefined,
      );
      showStay(created);
      setBilledAtLocal(nowDatetimeLocal());
      await refreshList();
      pulse("admit", "ok");
    } catch (e) {
      applyApiError(e);
      pulse("admit", "err");
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
    try {
      const saved = await updateIpdNotes(stay.id, notes, roomNo);
      showStay(saved);
      await refreshList();
      pulse("notes", "ok");
    } catch (e) {
      applyApiError(e);
      pulse("notes", "err");
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
    try {
      const saved = await postIpdDeposit(stay.id, amount, depositNote);
      const newestDeposit = (saved.ledger ?? [])
        .filter((line) => line.kind === "deposit")
        .reduce<IpdLedgerLine | null>((best, line) => (best == null || line.id > best.id ? line : best), null);
      setStay(saved);
      setDepositAmount("");
      setDepositNote("");
      setDepositPanelOpen(false);
      if (newestDeposit) {
        setFlashLedgerId(newestDeposit.id);
        window.setTimeout(() => setFlashLedgerId((id) => (id === newestDeposit.id ? null : id)), 220);
      }
      window.setTimeout(() => depositBtnRef.current?.focus(), 0);
      pulse("deposit", "ok");
    } catch (e) {
      applyApiError(e);
      pulse("deposit", "err");
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
      pulse("print", "ok");
    } catch (e) {
      applyApiError(e);
      pulse("print", "err");
    } finally {
      setBusy(false);
      setPrintingLedgerId(null);
      end();
    }
  }

  function latestDepositLine(): IpdLedgerLine | null {
    const deposits = (stay?.ledger ?? []).filter((line) => line.kind === "deposit");
    if (deposits.length === 0) return null;
    return deposits.reduce((best, line) => (line.id > best.id ? line : best));
  }

  async function printDepositFee() {
    const line = latestDepositLine();
    if (!stay || !line) return;
    await printLedgerLine(line);
  }

  async function printStatement() {
    if (!stay) return;
    if (!begin("statement")) return;
    setBusy(true);
    setError(null);
    try {
      await printIpdStatement(stay.id, t("ipdStatement"));
      pulse("statement", "ok");
    } catch (e) {
      applyApiError(e);
      pulse("statement", "err");
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
    try {
      const saved = await dischargeIpd(stay.id);
      setConfirmDischarge(false);
      setStay(saved);
      setNotes(saved.notes);
      setRoomNo(saved.room_no ?? "");
      setRoomEditing(false);
      setDepositAmount("");
      setDepositNote("");
      await refreshList();
      pulse("discharge", "ok");
    } catch (e) {
      applyApiError(e);
      setConfirmDischarge(false);
      pulse("discharge", "err");
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
      pulse("purge", "ok");
    } catch (e) {
      applyApiError(e);
      setPurgeStayId(null);
      pulse("purge", "err");
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
    setDepositPanelOpen(false);
    setDepositAmount("");
    setDepositNote("");
    setFlashLedgerId(null);
    setError(null);
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
  const depositParsed = parseKyat(depositAmount);
  const depositAfterBalance =
    stay != null && depositParsed != null ? (stay.balance_mmk ?? 0) + depositParsed : null;

  return (
    <DeskChrome>
      <section
      ref={deskRef}
      className={`opd-bill-desk${onForm ? "" : " opd-bill-desk--history"}`}
    >
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
              flashId={flashLedgerId}
              onActivate={
                (stay.ledger ?? []).some((line) => ledgerBillClickable(line, canReadModule, onOpenRecord))
                  ? (id) => {
                      const line = (stay.ledger ?? []).find((row) => row.id === id);
                      if (line) openLedgerBill(line, canReadModule, onOpenRecord, setError, t);
                    }
                  : undefined
              }
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
                canActivate: ledgerBillClickable(line, canReadModule, onOpenRecord),
              }))}
            />
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
      </div>

      {onForm ? (
        <aside className="opd-bill-rail ipd-stay-rail" aria-label={t("ipdStayTitle")}>
          <button
            type="button"
            className={`opd-bill-rail-btn${stay == null ? " opd-bill-rail-btn--accent" : ""}${isErr("admit") ? " opd-bill-rail-btn--shake" : ""}`}
            disabled={busy || stay != null || chartId == null}
            aria-busy={(pending && pendingAction === "admit") || undefined}
            onClick={() => void admit()}
          >
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon
                name="plus"
                pending={pending && pendingAction === "admit"}
                success={isOk("admit")}
              />
              <span className="opd-bill-rail-btn-text">
                <span className="opd-bill-rail-btn-label">{t("ipdAdmit")}</span>
              </span>
            </span>
          </button>
          <button
            ref={depositBtnRef}
            type="button"
            className={`opd-bill-rail-btn${canActOnStay ? " opd-bill-rail-btn--accent" : ""}${isErr("deposit") ? " opd-bill-rail-btn--shake" : ""}`}
            disabled={busy || !canActOnStay}
            data-guide="ipd-take-deposit"
            aria-expanded={depositPanelOpen}
            aria-controls="ipd-deposit-panel"
            aria-busy={(pending && pendingAction === "deposit") || undefined}
            onClick={() => toggleDepositPanel()}
          >
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon
                name="plus"
                pending={pending && pendingAction === "deposit"}
                success={isOk("deposit")}
              />
              <span className="opd-bill-rail-btn-text">
                <span className="opd-bill-rail-btn-label">{t("ipdTakeDeposit")}</span>
              </span>
            </span>
          </button>
          <button
            type="button"
            className={`opd-bill-rail-btn${isErr("notes") ? " opd-bill-rail-btn--shake" : ""}`}
            disabled={busy || !canActOnStay}
            aria-busy={(pending && pendingAction === "notes") || undefined}
            onClick={() => void saveNotes()}
          >
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon
                name="check"
                pending={pending && pendingAction === "notes"}
                success={isOk("notes")}
              />
              <span
                className={`opd-bill-rail-btn-label-swap${isOk("notes") ? " opd-bill-rail-btn-label-swap--saved" : ""}`}
                aria-hidden="true"
              >
                <span className="opd-bill-rail-btn-label-idle">{t("ipdSaveNotes")}</span>
                <span className="opd-bill-rail-btn-label-saved">{t("saved")}</span>
              </span>
              <span className="visually-hidden">{isOk("notes") ? t("saved") : t("ipdSaveNotes")}</span>
            </span>
          </button>
          <button
            type="button"
            className={`opd-bill-rail-btn opd-bill-rail-btn--danger${isErr("discharge") ? " opd-bill-rail-btn--shake" : ""}`}
            disabled={busy || !canActOnStay}
            data-guide="ipd-discharge"
            aria-busy={(pending && pendingAction === "discharge") || undefined}
            onClick={() => setConfirmDischarge(true)}
          >
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon
                name="check"
                pending={pending && pendingAction === "discharge"}
                success={isOk("discharge")}
              />
              <span className="opd-bill-rail-btn-text">
                <span className="opd-bill-rail-btn-label">{t("ipdDischarge")}</span>
                {stay ? (
                  <span className="opd-bill-rail-btn-sub">
                    {settlementSub(stay.balance_mmk ?? 0, t)}
                  </span>
                ) : null}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={`opd-bill-rail-btn${isErr("print") ? " opd-bill-rail-btn--shake" : ""}`}
            disabled={busy || stay == null || latestDepositLine() == null}
            aria-busy={(pending && pendingAction === "print") || undefined}
            onClick={() => void printDepositFee()}
          >
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon
                name="print"
                pending={pending && pendingAction === "print"}
                success={isOk("print")}
              />
              <span className="opd-bill-rail-btn-text">
                <span className="opd-bill-rail-btn-label">{t("ipdPrintDepositFee")}</span>
              </span>
            </span>
          </button>
          <button
            type="button"
            className="opd-bill-rail-btn"
            disabled={busy || stay == null}
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
            className={`opd-bill-rail-btn${isErr("statement") ? " opd-bill-rail-btn--shake" : ""}`}
            disabled={busy || stay == null}
            aria-busy={(pending && pendingAction === "statement") || undefined}
            onClick={() => void printStatement()}
          >
            <span className="opd-bill-rail-btn-main">
              <BillBtnIcon
                name="print"
                pending={pending && pendingAction === "statement"}
                success={isOk("statement")}
              />
              <span className="opd-bill-rail-btn-text">
                <span className="opd-bill-rail-btn-label">{t("ipdPrintStatement")}</span>
              </span>
            </span>
          </button>
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

      {depositPanelOpen && canActOnStay && stay ? (
        <div
          ref={depositPanelRef}
          id="ipd-deposit-panel"
          className="ipd-deposit-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ipd-deposit-panel-title"
          style={{
            top: depositPanelPos.top,
            right: depositPanelPos.right,
            maxWidth: depositPanelPos.maxWidth,
          }}
        >
          <div className="ipd-deposit-panel-head">
            <h3 id="ipd-deposit-panel-title" className="ipd-deposit-panel-title">
              {t("ipdTakeDeposit")}
            </h3>
            <DialogCloseButton onClick={closeDepositPanel} disabled={busy} />
          </div>
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (depositParsed != null && !busy) void takeDeposit();
                }
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (depositParsed != null && !busy) void takeDeposit();
                }
              }}
            />
          </label>
          {depositAfterBalance != null ? (
            <p className="ipd-deposit-preview" role="status">
              <span className="ipd-deposit-preview-label">{t("ipdBalanceAfter")}</span>{" "}
              <span className="ipd-deposit-preview-value">
                {settlementSub(depositAfterBalance, t)}
              </span>
            </p>
          ) : null}
          <div className="ipd-deposit-panel-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || depositParsed == null}
              aria-busy={(pending && pendingAction === "deposit") || undefined}
              onClick={() => void takeDeposit()}
            >
              {t("ipdTakeDeposit")}
            </button>
          </div>
        </div>
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
          tone="door"
          title={t("ipdDischarge")}
          message={dischargeConfirmMessage(stay, t)}
          busy={busy}
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
          icon="trash"
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
          icon="trash"
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
    </DeskChrome>
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

function ledgerBillTarget(line: IpdLedgerLine): OpenRecordTarget | null {
  if (line.kind !== "charge" && line.kind !== "reversal") return null;
  if (line.source_id == null || line.source_id < 1) return null;
  const openRecordId = line.source_id;
  if (line.source === "opd") return { view: "opd", section: "opd", openRecordId };
  if (line.source === "lab") return { view: "lab", section: "lab", openRecordId };
  if (line.source === "ot") return { view: "ot", section: "ot_bill", openRecordId };
  if (line.source === "ipd") return { view: "ipd_bill", section: "ipd_bill", openRecordId };
  if (line.source === "pharmacy") {
    const isReturn = line.note.trim().toUpperCase().startsWith("RT-");
    return isReturn
      ? { view: "pharmacy_return", section: "pharmacy_return", openRecordId }
      : { view: "pharmacy_billing", section: "pharmacy", openRecordId };
  }
  return null;
}

function ledgerBillModule(line: IpdLedgerLine): ClinicModule | null {
  if (line.source === "opd") return "opd";
  if (line.source === "lab") return "lab";
  if (line.source === "ot") return "ot";
  if (line.source === "pharmacy") return "pharmacy";
  if (line.source === "ipd") return "ipd";
  return null;
}

function ledgerBillClickable(
  line: IpdLedgerLine,
  canReadModule?: (module: ClinicModule) => boolean,
  onOpenRecord?: (target: OpenRecordTarget) => void,
): boolean {
  if (!onOpenRecord || !canReadModule) return false;
  const target = ledgerBillTarget(line);
  const module = ledgerBillModule(line);
  if (target == null || module == null) return false;
  return canReadModule(module);
}

function openLedgerBill(
  line: IpdLedgerLine,
  canReadModule: ((module: ClinicModule) => boolean) | undefined,
  onOpenRecord: ((target: OpenRecordTarget) => void) | undefined,
  setError: (msg: string | null) => void,
  t: (key: string) => string,
): void {
  if (!onOpenRecord || !canReadModule) return;
  const target = ledgerBillTarget(line);
  const module = ledgerBillModule(line);
  if (target == null || module == null) return;
  if (!canReadModule(module)) {
    setError(t("noAccess"));
    return;
  }
  setError(null);
  onOpenRecord(target);
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
