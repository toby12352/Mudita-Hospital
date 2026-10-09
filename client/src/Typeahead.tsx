import { ReactNode, useEffect, useId, useRef, useState } from "react";

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
};

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
}: TypeaheadProps<T>) {
  const listId = useId();
  const effectiveMinChars = Math.max(1, minChars);
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const skipSuggestRef = useRef(false);
  const suggestSeqRef = useRef(0);
  const blurCloseRef = useRef<number | null>(null);

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

  return (
    <div className={`field grow typeahead${className ? ` ${className}` : ""}`}>
      {label ? <span>{label}</span> : null}
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
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
        <ul id={listId} className="typeahead-menu" role="listbox">
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
