import { useEffect, useId, useRef, useState } from "react";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Display YYYY/MM/DD from stored YYYY-MM-DD. */
export function formatDateDisplay(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[1]}/${m[2]}/${m[3]}`;
}

/** Parse typed YYYY/MM/DD or YYYY-MM-DD → YYYY-MM-DD, or null. */
export function parseDateInput(raw: string): string | null {
  const t = raw.trim().replace(/\//g, "-");
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

export function DatePicker({
  value,
  onChange,
  disabled,
  id,
  placeholder = "YYYY/MM/DD",
  required = false,
  openCalendarLabel = "Open calendar",
  chooseDateLabel = "Choose date",
  previousMonthLabel = "Previous month",
  nextMonthLabel = "Next month",
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  required?: boolean;
  openCalendarLabel?: string;
  chooseDateLabel?: string;
  previousMonthLabel?: string;
  nextMonthLabel?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const dialogId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const moveFocusInsideRef = useRef(false);
  const suppressOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => formatDateDisplay(value));
  const selected = parseIso(value);
  const today = new Date();
  const [viewY, setViewY] = useState(selected?.y ?? today.getFullYear());
  const [viewM, setViewM] = useState(selected ? selected.m - 1 : today.getMonth());

  useEffect(() => {
    setText(formatDateDisplay(value));
    const p = parseIso(value);
    if (p) {
      setViewY(p.y);
      setViewM(p.m - 1);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    // The text field keeps the caret so a date can be typed. The icon button
    // is what moves focus into the grid.
    if (moveFocusInsideRef.current && popover) {
      const selectedBtn = popover.querySelector<HTMLElement>(".date-picker-cell.selected");
      const firstNav = popover.querySelector<HTMLElement>(".date-picker-nav");
      (selectedBtn ?? firstNav)?.focus();
    }
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        moveFocusInsideRef.current = false;
        setOpen(false);
        // Click outside closes without pulling focus back.
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCalendar(true);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openFrom(el: HTMLElement | null, moveFocusInside: boolean) {
    if (disabled) return;
    returnFocusRef.current = el;
    moveFocusInsideRef.current = moveFocusInside;
    setOpen(true);
  }

  function closeCalendar(restoreFocus: boolean) {
    moveFocusInsideRef.current = false;
    setOpen(false);
    if (!restoreFocus) return;
    const opener = returnFocusRef.current;
    if (!opener || opener === document.activeElement) return;
    // Focusing the text field would reopen the grid. Skip that once.
    if (opener === inputRef.current) suppressOpenRef.current = true;
    opener.focus();
  }

  function commitText(raw: string) {
    const iso = parseDateInput(raw);
    if (iso) {
      onChange(iso);
      setText(formatDateDisplay(iso));
      return;
    }
    // A blank or unreadable value snaps back. Revenue always keeps a real date.
    setText(formatDateDisplay(value));
  }

  function selectDay(day: number) {
    const iso = `${viewY}-${String(viewM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(iso);
    setText(formatDateDisplay(iso));
    closeCalendar(true);
  }

  function shiftMonth(delta: number) {
    let m = viewM + delta;
    let y = viewY;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewM(m);
    setViewY(y);
  }

  const firstDow = new Date(viewY, viewM, 1).getDay();
  const dim = daysInMonth(viewY, viewM);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);

  return (
    <div className="date-picker" ref={rootRef}>
      <div className="date-picker-input-wrap">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className="date-picker-input"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commitText(text)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? dialogId : undefined}
          onFocus={() => {
            if (suppressOpenRef.current) {
              suppressOpenRef.current = false;
              return;
            }
            if (!disabled) openFrom(inputRef.current, false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText(text);
              closeCalendar(false);
            }
          }}
          autoComplete="off"
        />
        <button
          ref={iconRef}
          type="button"
          className="date-picker-icon-btn"
          disabled={disabled}
          aria-label={openCalendarLabel}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? dialogId : undefined}
          onClick={() => {
            if (disabled) return;
            if (open) {
              closeCalendar(false);
              return;
            }
            openFrom(iconRef.current, true);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2zm13 8H4v10h16V10zm0-2V6H4v2h16z"
            />
          </svg>
        </button>
      </div>
      {open && !disabled ? (
        <div
          id={dialogId}
          ref={popoverRef}
          className="date-picker-popover"
          role="dialog"
          aria-label={chooseDateLabel}
        >
          <div className="date-picker-header">
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => shiftMonth(-1)}
              aria-label={previousMonthLabel}
            >
              ‹
            </button>
            <span className="date-picker-month">
              {MONTHS[viewM]} {viewY}
            </span>
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => shiftMonth(1)}
              aria-label={nextMonthLabel}
            >
              ›
            </button>
          </div>
          <div className="date-picker-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="date-picker-grid">
            {cells.map((day, i) =>
              day == null ? (
                <span key={`e-${i}`} className="date-picker-cell empty" />
              ) : (
                (() => {
                  const iso = `${viewY}-${String(viewM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isSelected =
                    selected && selected.y === viewY && selected.m === viewM + 1 && selected.d === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      className={"date-picker-cell" + (isSelected ? " selected" : "")}
                      aria-label={iso}
                      aria-current={isSelected ? "date" : undefined}
                      onClick={() => selectDay(day)}
                    >
                      {day}
                    </button>
                  );
                })()
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
