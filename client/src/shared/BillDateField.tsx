import { useI18n } from "@/shared/i18n";

/** Local wall time for `<input type="datetime-local">` (no seconds, no Z). */
export function nowDatetimeLocal(from: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}T${pad(from.getHours())}:${pad(from.getMinutes())}`;
}

/** Format a stored UTC `YYYY-MM-DD HH:MM:SS` (or ISO) as local date/time text. */
export function formatUtcAsLocal(createdAt: string | null | undefined, nowTick?: number): string {
  const d = createdAt
    ? new Date(createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T") + "Z")
    : new Date(nowTick ?? Date.now());
  if (Number.isNaN(d.getTime())) return createdAt ?? "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Props = {
  /** Admin + unsaved new bill/admission only. */
  editable: boolean;
  /** `datetime-local` value when editable. */
  value: string;
  /** Read-only display text when not editable. */
  displayWhen: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/** Bill / admission date: live read-only clock for staff; Admin picker on new records. */
export function BillDateField(props: Props) {
  const { t } = useI18n();
  const { editable, value, displayWhen, onChange, disabled } = props;

  if (!editable) {
    return (
      <div className="opd-bill-field">
        <span className="opd-bill-label">{t("dateTime")}</span>
        <span className="opd-bill-readonly">{displayWhen}</span>
      </div>
    );
  }

  return (
    <label className="opd-bill-field">
      <span className="opd-bill-label">{t("dateTime")}</span>
      <input
        type="datetime-local"
        className="opd-bill-input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("dateTime")}
      />
    </label>
  );
}
