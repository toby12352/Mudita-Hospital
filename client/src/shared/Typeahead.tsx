import {
  ReactNode,
  Ref,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { applyMenuPlacement, revealOptionInMenu } from "@/shared/menuPlacement";

export type TypeaheadProps<T> = {
  value: string;
  onChange: (value: string) => void;
  loadSuggestions: (q: string) => Promise<T[]>;
  getKey: (item: T) => string | number;
  renderOption: (item: T) => ReactNode;
  onPick: (item: T) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Minimum characters before fetching (default 1; values below 1 are treated as 1). */
  minChars?: number;
  maxResults?: number;
  debounceMs?: number;
  /** Enter when the menu is closed, or Escape-cleared Enter fallback. */
  onSubmitWithoutPick?: () => void;
  optionClassName?: (item: T) => string;
  className?: string;
  autoComplete?: string;
  /** Focus the text box from a parent (the next blank bill row). */
  inputRef?: Ref<HTMLInputElement>;
  /** Accessible name when `label` is omitted (inside a grid cell). */
  ariaLabel?: string;
  autoFocus?: boolean;
  /** Desk shortcut target, for example `bill-patient`. */
  dataFocus?: string;
  /** Guided tour target, for example `patient-search`. */
  dataGuide?: string;
  required?: boolean;
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (ref == null) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as { current: T | null }).current = value;
}

export function Typeahead<T>({
  value,
  onChange,
  loadSuggestions,
  getKey,
  renderOption,
  onPick,
  label,
  placeholder,
  disabled = false,
  minChars = 1,
  maxResults = 8,
  debounceMs = 250,
  onSubmitWithoutPick,
  optionClassName,
  className,
  autoComplete = "off",
  inputRef,
  ariaLabel,
  autoFocus = false,
  dataFocus,
  dataGuide,
  required = false,
}: TypeaheadProps<T>) {
  const listId = useId();
  const effectiveMinChars = Math.max(1, minChars);
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const skipSuggestRef = useRef(false);
  const suggestSeqRef = useRef(0);
  const blurCloseRef = useRef<number | null>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);

  function closeSuggestions() {
    setOpen(false);
    setSuggestions([]);
    setHighlight(-1);
  }

  function pick(item: T) {
    skipSuggestRef.current = true;
    closeSuggestions();
    onPick(item);
  }

  useEffect(() => {
    if (disabled) {
      closeSuggestions();
      return;
    }
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return;
    }
    const term = value.trim();
    if (term.length < effectiveMinChars) {
      closeSuggestions();
      return;
    }
    const seq = ++suggestSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const data = await loadSuggestions(term);
          if (seq !== suggestSeqRef.current) return;
          const next = data.slice(0, maxResults);
          setSuggestions(next);
          setOpen(next.length > 0);
          setHighlight(next.length > 0 ? 0 : -1);
        } catch {
          if (seq !== suggestSeqRef.current) return;
          closeSuggestions();
        }
      })();
    }, debounceMs);
    return () => window.clearTimeout(timer);
    // loadSuggestions intentionally omitted — callers pass stable or inline loaders;
    // re-run only when the typed value / disabled / limits change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, disabled, effectiveMinChars, maxResults, debounceMs]);

  useLayoutEffect(() => {
    if (!open) return;
    const input = localInputRef.current;
    const menu = menuRef.current;
    if (!input || !menu) return;

    function place() {
      const anchor = localInputRef.current;
      const list = menuRef.current;
      if (!anchor || !list) return;
      applyMenuPlacement(anchor, list);
    }

    place();
    window.addEventListener("resize", place);
    const scrollParents: (Element | Window)[] = [window];
    let node: HTMLElement | null = input.parentElement;
    while (node) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden") {
        node.addEventListener("scroll", place, { passive: true });
        scrollParents.push(node);
      }
      node = node.parentElement;
    }
    return () => {
      window.removeEventListener("resize", place);
      for (const parent of scrollParents) {
        if (parent === window) continue;
        parent.removeEventListener("scroll", place);
      }
    };
  }, [open, suggestions.length]);

  useLayoutEffect(() => {
    if (!open || highlight < 0) return;
    const menu = menuRef.current;
    if (!menu) return;
    const option = menu.querySelector<HTMLElement>('[aria-selected="true"]');
    if (option) revealOptionInMenu(menu, option);
  }, [highlight, open, suggestions]);

  return (
    <div className={`field grow typeahead${className ? ` ${className}` : ""}`}>
      {label ? <span>{label}</span> : null}
      <input
        ref={(el) => {
          localInputRef.current = el;
          assignRef(inputRef, el);
        }}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required={required}
        data-focus={dataFocus}
        data-guide={dataGuide}
        aria-label={label ? undefined : ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (disabled) return;
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          if (blurCloseRef.current != null) window.clearTimeout(blurCloseRef.current);
          blurCloseRef.current = window.setTimeout(() => {
            setOpen(false);
          }, 150);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (open && suggestions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % suggestions.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const chosen =
                highlight >= 0 ? suggestions[highlight] : suggestions[0];
              if (chosen) pick(chosen);
              return;
            }
          }
          if (e.key === "Enter") {
            e.preventDefault();
            setOpen(false);
            onSubmitWithoutPick?.();
          }
        }}
      />
      {open && suggestions.length > 0 ? (
        <ul id={listId} ref={menuRef} className="typeahead-menu" role="listbox">
          {suggestions.map((item, i) => {
            const extra = optionClassName?.(item) ?? "";
            return (
              <li key={getKey(item)} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  className={`typeahead-option${i === highlight ? " active" : ""}${
                    extra ? ` ${extra}` : ""
                  }`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    if (blurCloseRef.current != null) {
                      window.clearTimeout(blurCloseRef.current);
                      blurCloseRef.current = null;
                    }
                    pick(item);
                  }}
                >
                  {renderOption(item)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
