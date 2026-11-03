import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createPatientTimelineNote,
  fetchPatientTimelineNotes,
  updatePatientTimelineNote,
  type PatientTimelineNote,
} from "@/features/patients/api";
import { ActionIcon } from "@/shared/ActionIcon";
import { getStoredUser } from "@/shared/auth";
import { formatDateDisplay } from "@/shared/DatePicker";
import { useI18n } from "@/shared/i18n";

export type TimelineVisitKind = "ipd" | "opd" | "ot" | "pharmacy" | "lab";

export type TimelineVisit = {
  key: string;
  kind: TimelineVisitKind;
  when: string;
  voucher: string;
  label: string;
  openId?: number;
  clickable: boolean;
};

type TimelineEntry =
  | { sortKey: string; day: string; kind: "note"; note: PatientTimelineNote }
  | { sortKey: string; day: string; kind: "visit"; visit: TimelineVisit };

type DayGroup = {
  day: string;
  entries: TimelineEntry[];
};

function stampDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function formatTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDayHeading(day: string): string {
  const display = formatDateDisplay(day);
  if (!display) return day;
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return display;
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} · ${display}`;
}

function noteEdited(note: PatientTimelineNote): boolean {
  const created = note.created_at.trim();
  const updated = note.updated_at.trim();
  return Boolean(created && updated && updated !== created);
}

function kindTone(kind: TimelineVisitKind | "note"): string {
  if (kind === "note") return "draft";
  if (kind === "ipd") return "ipd";
  if (kind === "opd") return "billed";
  if (kind === "ot") return "printed";
  if (kind === "pharmacy") return "paid";
  return "billed";
}

export function PatientTimeline({
  patientId,
  visits,
  visitsReady,
  canUpdate,
  onOpenVisit,
  onError,
}: {
  patientId: number;
  visits: TimelineVisit[];
  visitsReady: boolean;
  canUpdate: boolean;
  onOpenVisit: (visit: TimelineVisit) => void;
  onError: (message: string | null) => void;
}) {
  const { t } = useI18n();
  const currentUser = getStoredUser();
  const [notes, setNotes] = useState<PatientTimelineNote[]>([]);
  const [notesReady, setNotesReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const composerToggleRef = useRef<HTMLButtonElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const composerPanelId = "patient-timeline-composer-panel";

  const kindLabel = useCallback(
    (kind: TimelineVisitKind | "note") => {
      if (kind === "note") return t("patientTimelineNote");
      if (kind === "ipd") return t("ipd");
      if (kind === "opd") return t("opd");
      if (kind === "ot") return t("ot");
      if (kind === "pharmacy") return t("pharmacy");
      return t("lab");
    },
    [t],
  );

  const loadNotes = useCallback(async () => {
    setNotesReady(false);
    try {
      const list = await fetchPatientTimelineNotes(patientId);
      setNotes(list);
      setNotesReady(true);
      onError(null);
    } catch (err) {
      setNotes([]);
      setNotesReady(true);
      onError(err instanceof Error ? err.message : t("errGeneric"));
    }
  }, [onError, patientId, t]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const groups = useMemo((): DayGroup[] => {
    const entries: TimelineEntry[] = [];
    for (const note of notes) {
      const day = stampDay(note.created_at);
      entries.push({
        sortKey: note.created_at || `note-${note.id}`,
        day,
        kind: "note",
        note,
      });
    }
    for (const visit of visits) {
      const day = stampDay(visit.when);
      entries.push({
        sortKey: visit.when || visit.key,
        day,
        kind: "visit",
        visit,
      });
    }
    entries.sort((a, b) => {
      if (a.sortKey === b.sortKey) return 0;
      return a.sortKey < b.sortKey ? 1 : -1;
    });

    const byDay = new Map<string, TimelineEntry[]>();
    const dayOrder: string[] = [];
    for (const entry of entries) {
      const day = entry.day || "unknown";
      if (!byDay.has(day)) {
        byDay.set(day, []);
        dayOrder.push(day);
      }
      byDay.get(day)!.push(entry);
    }
    dayOrder.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    return dayOrder.map((day) => ({ day, entries: byDay.get(day) ?? [] }));
  }, [notes, visits]);

  function openComposer() {
    setComposerOpen(true);
    requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
  }

  function closeComposer(returnFocus = true) {
    setComposerOpen(false);
    if (returnFocus) {
      requestAnimationFrame(() => {
        composerToggleRef.current?.focus();
      });
    }
  }

  function toggleComposer() {
    if (composerOpen) {
      closeComposer();
    } else {
      openComposer();
    }
  }

  function onComposerKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape" || !composerOpen) return;
    e.preventDefault();
    e.stopPropagation();
    closeComposer();
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    onError(null);
    try {
      const created = await createPatientTimelineNote(patientId, body);
      setNotes((prev) => [created, ...prev.filter((n) => n.id !== created.id)]);
      setDraft("");
      closeComposer();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(note: PatientTimelineNote) {
    setEditingId(note.id);
    setEditDraft(note.body);
    onError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (editingId == null || busy) return;
    const body = editDraft.trim();
    if (!body) return;
    setBusy(true);
    onError(null);
    try {
      const updated = await updatePatientTimelineNote(patientId, editingId, body);
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      cancelEdit();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const ready = notesReady && visitsReady;
  const empty = ready && groups.length === 0;

  return (
    <div className="patient-timeline">
      {canUpdate ? (
        <div className="patient-timeline-composer" onKeyDown={onComposerKeyDown}>
          <button
            ref={composerToggleRef}
            type="button"
            className={`btn action${composerOpen ? " on" : ""}`}
            aria-expanded={composerOpen}
            aria-controls={composerPanelId}
            disabled={busy}
            onClick={toggleComposer}
          >
            <ActionIcon name="plus" />
            {t("patientTimelineAddNote")}
          </button>
          <form
            id={composerPanelId}
            className={`patient-timeline-composer-panel${
              composerOpen ? " patient-timeline-composer-panel--open" : ""
            }`}
            onSubmit={(e) => void onAdd(e)}
            inert={composerOpen ? undefined : true}
            aria-hidden={composerOpen ? undefined : true}
          >
            <div className="patient-timeline-composer-panel-inner">
              <label className="field">
                <span>{t("note")}</span>
                <textarea
                  ref={composerTextareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  disabled={busy}
                  placeholder={t("patientTimelineNotePlaceholder")}
                />
              </label>
              <div className="btn-row">
                <button
                  type="submit"
                  className="btn primary"
                  disabled={busy || draft.trim() === ""}
                >
                  {busy && editingId == null ? t("saving") : t("save")}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {!ready ? <p className="hint">{t("loading")}</p> : null}
      {empty ? <p className="hint">{t("patientTimelineEmpty")}</p> : null}

      {ready && !empty ? (
        <ol className="patient-timeline-days">
          {groups.map((group) => (
            <li key={group.day} className="patient-timeline-day">
              <h3 className="patient-timeline-day-title">
                {group.day === "unknown" ? "—" : formatDayHeading(group.day)}
              </h3>
              <ol className="patient-timeline-entries">
                {group.entries.map((entry) => {
                  if (entry.kind === "note") {
                    const note = entry.note;
                    const canEdit =
                      canUpdate &&
                      currentUser != null &&
                      note.author_user_id != null &&
                      note.author_user_id === currentUser.id;
                    const editing = editingId === note.id;
                    return (
                      <li key={`note-${note.id}`} className="patient-timeline-entry">
                        <div className="patient-timeline-entry-meta">
                          <span className="patient-timeline-entry-time">
                            {formatTime(note.created_at)}
                            {note.author_name ? ` · ${note.author_name}` : ""}
                            {noteEdited(note)
                              ? ` · ${t("patientTimelineEdited")} ${formatTime(note.updated_at)}`
                              : ""}
                          </span>
                          <span
                            className={`bill-history-status bill-history-status--${kindTone("note")}`}
                          >
                            {kindLabel("note")}
                          </span>
                        </div>
                        {editing ? (
                          <form
                            className="patient-timeline-edit"
                            onSubmit={(e) => void saveEdit(e)}
                          >
                            <label className="field">
                              <span>{t("note")}</span>
                              <textarea
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                rows={3}
                                disabled={busy}
                                autoFocus
                              />
                            </label>
                            <div className="btn-row">
                              <button
                                type="submit"
                                className="btn primary"
                                disabled={busy || editDraft.trim() === ""}
                              >
                                {busy ? t("saving") : t("save")}
                              </button>
                              <button
                                type="button"
                                className="btn action"
                                disabled={busy}
                                onClick={cancelEdit}
                              >
                                {t("cancel")}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <p className="patient-timeline-entry-body">{note.body}</p>
                            {canEdit ? (
                              <div className="btn-row">
                                <button
                                  type="button"
                                  className="btn action"
                                  disabled={busy}
                                  onClick={() => startEdit(note)}
                                >
                                  {t("edit")}
                                </button>
                              </div>
                            ) : null}
                          </>
                        )}
                      </li>
                    );
                  }

                  const visit = entry.visit;
                  const rowClass = [
                    "patient-timeline-entry",
                    visit.clickable ? "patient-timeline-entry--clickable" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <li key={visit.key} className={rowClass}>
                      {visit.clickable ? (
                        <button
                          type="button"
                          className="patient-timeline-visit-btn"
                          onClick={() => onOpenVisit(visit)}
                        >
                          <span className="patient-timeline-entry-meta">
                            <span className="patient-timeline-entry-time">
                              {formatTime(visit.when)}
                            </span>
                            <span
                              className={`bill-history-status bill-history-status--${kindTone(visit.kind)}`}
                            >
                              {kindLabel(visit.kind)}
                            </span>
                          </span>
                          <span className="patient-timeline-entry-body">
                            <span className="patient-timeline-visit-voucher">{visit.voucher}</span>
                            {visit.label ? (
                              <span className="patient-timeline-visit-label">{visit.label}</span>
                            ) : null}
                          </span>
                        </button>
                      ) : (
                        <>
                          <div className="patient-timeline-entry-meta">
                            <span className="patient-timeline-entry-time">
                              {formatTime(visit.when)}
                            </span>
                            <span
                              className={`bill-history-status bill-history-status--${kindTone(visit.kind)}`}
                            >
                              {kindLabel(visit.kind)}
                            </span>
                          </div>
                          <p className="patient-timeline-entry-body">
                            <span className="patient-timeline-visit-voucher">{visit.voucher}</span>
                            {visit.label ? (
                              <span className="patient-timeline-visit-label">{visit.label}</span>
                            ) : null}
                          </p>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
