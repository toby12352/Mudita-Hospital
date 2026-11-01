import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ActionIcon } from "@/shared/ActionIcon";

export type FilterMenuOption = {
  value: string;
  label: string;
};

type Props = {
  label: string;
  value: string;
  options: FilterMenuOption[];
  onChange: (value: string) => void;
  /** Optional id prefix; defaults to a React useId. */
  id?: string;
};

/**
 * Compact labeled dropdown for filter panels.
 * Button + listbox; keyboard: arrows, Home/End, Enter, Escape, first-letter jump.
 */
export function FilterMenu({ label, value, options, onChange, id }: Props) {
  const reactId = useId();
  const baseId = id ?? reactId;
  const labelId = `${baseId}-label`;
  const listId = `${baseId}-list`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = options.find((opt) => opt.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    window.requestAnimationFrame(() => {
      const item = listRef.current?.querySelector<HTMLElement>(
        `[data-filter-option="${selectedIndex}"]`,
      );
      item?.focus();
    });
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const root = rootRef.current;
      if (!root || !(e.target instanceof Node)) return;
      if (!root.contains(e.target)) setOpen(false);
    }
    function onDocKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onDocKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onDocKey, true);
    };
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function moveActive(next: number) {
    if (options.length === 0) return;
    const clamped = Math.max(0, Math.min(options.length - 1, next));
    setActiveIndex(clamped);
    window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-filter-option="${clamped}"]`)
        ?.focus();
    });
  }

  function onListKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(activeIndex + 1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(activeIndex - 1);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      moveActive(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      moveActive(options.length - 1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) choose(opt.value);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key.length === 1 && /[^\s]/.test(e.key)) {
      const letter = e.key.toLocaleLowerCase();
      const from = activeIndex + 1;
      const match =
        options.findIndex(
          (opt, i) => i >= from && opt.label.toLocaleLowerCase().startsWith(letter),
        ) >= 0
          ? options.findIndex(
              (opt, i) => i >= from && opt.label.toLocaleLowerCase().startsWith(letter),
            )
          : options.findIndex((opt) => opt.label.toLocaleLowerCase().startsWith(letter));
      if (match >= 0) {
        e.preventDefault();
        moveActive(match);
      }
    }
  }

  return (
    <div className="catalog-filter-field catalog-filter-menu" ref={rootRef}>
      <span className="drug-info-label" id={labelId}>
        {label}
      </span>
      <div className="filter-menu">
        <button
          ref={buttonRef}
          type="button"
          className={`filter-menu-trigger${open ? " open" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={labelId}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className="filter-menu-value">{selected?.label ?? ""}</span>
          <span className="filter-menu-chevron" aria-hidden="true">
            <ActionIcon name="chevron" />
          </span>
        </button>
        {open ? (
          <ul
            ref={listRef}
            id={listId}
            className="filter-menu-list"
            role="listbox"
            aria-labelledby={labelId}
            tabIndex={-1}
            onKeyDown={onListKeyDown}
          >
            {options.map((opt, index) => {
              const selectedOpt = opt.value === value;
              const active = index === activeIndex;
              return (
                <li
                  key={opt.value || "all"}
                  id={`${baseId}-opt-${index}`}
                  role="option"
                  tabIndex={active ? 0 : -1}
                  aria-selected={selectedOpt}
                  data-filter-option={index}
                  className={`filter-menu-option${selectedOpt ? " selected" : ""}${
                    active ? " active" : ""
                  }`}
                  onClick={() => choose(opt.value)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="filter-menu-option-label">{opt.label}</span>
                  {selectedOpt ? (
                    <span className="filter-menu-option-check" aria-hidden="true">
                      <ActionIcon name="check" />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
