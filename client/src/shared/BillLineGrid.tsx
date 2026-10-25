import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActionIcon, type ActionIconName } from "@/shared/ActionIcon";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { Typeahead } from "@/shared/Typeahead";

export type BillLineUnitOption = {
  id: string;
  label: string;
};

export type BillLineGridRow = {
  key: string;
  title: string;
  qty: number;
  unitId?: string | null;
  units?: BillLineUnitOption[];
  /** Compact packing text. Omitted cells stay blank so columns still line up. */
  packLabel?: string;
  /** Longer packing sentence, shown as the cell tooltip. */
  packTitle?: string;
  priceMmk: number | null;
  amountMmk: number;
  /** Qty and unit stay as text (consultation, doctor fee, mixed legacy pack). */
  locked?: boolean;
  /** Qty stays as text while price can still be edited (OT services). */
  qtyLocked?: boolean;
  /** Draft row shows an integer kyat price input. */
  priceEditable?: boolean;
  removable?: boolean;
};

type RowSnapshot = {
  key: string;
  qty: number;
  amountMmk: number;
};

/** Which cart row to bring into view after a rows change, or leave alone. */
export function cartRevealTarget(
  prev: RowSnapshot[],
  next: RowSnapshot[],
): string | "top" | "end" | null {
  if (next.length < prev.length) return null;

  if (next.length === prev.length + 1) {
    const prevKeys = new Set(prev.map((r) => r.key));
    const added = next.filter((r) => !prevKeys.has(r.key));
    // Stick to the bottom of the pane (Pharmacy-style) for a single append.
    if (added.length === 1) return "end";
  }

  if (next.length === prev.length) {
    if (next.length === 0) return null;
    const prevByKey = new Map(prev.map((r) => [r.key, r]));
    if (next.every((r) => prevByKey.has(r.key))) {
      const changed = next.filter((r) => {
        const was = prevByKey.get(r.key)!;
        return was.qty !== r.qty || was.amountMmk !== r.amountMmk;
      });
      if (changed.length === 0) return null;
      if (changed.length === 1) return changed[0].key;
    }
  }

  return "top";
}

function snapshotRows(rows: BillLineGridRow[]): RowSnapshot[] {
  return rows.map((r) => ({ key: r.key, qty: r.qty, amountMmk: r.amountMmk }));
}

function revealRowInPane(container: HTMLElement, rowEl: HTMLElement) {
  const pane = container.getBoundingClientRect();
  const row = rowEl.getBoundingClientRect();
  if (row.top < pane.top) {
    container.scrollTop += row.top - pane.top;
  } else if (row.bottom > pane.bottom) {
    container.scrollTop += row.bottom - pane.bottom;
  }
}

export type BillLineGridEntry<T> = {
  key: string;
  placeholder?: string;
  ariaLabel: string;
  loadSuggestions: (q: string) => Promise<T[]>;
  getKey: (item: T) => string | number;
  renderOption: (item: T) => ReactNode;
  itemTitle: (item: T) => string;
  /** Compact packing text once an item is picked. Omitted leaves the cell blank. */
  packFor?: (item: T) => string;
  /** Longer packing sentence for the entry-row tooltip. */
  packTitleFor?: (item: T) => string;
  /** Empty list skips the unit step and commits on qty Enter or blur. */
  unitsFor: (item: T) => BillLineUnitOption[];
  /** Pick adds the row immediately with qty 1. */
  commitOnPick?: boolean;
  onCommit: (item: T, qty: number, unit: BillLineUnitOption | null) => void;
  /** Enter on an exact code while the suggestion menu is closed. */
  onSubmitCode?: (code: string) => Promise<T | null>;
};

export type BillLineEntryNode = {
  key: string;
  /** Shown on the Add to bill bar (segment or static label). */
  sourceLabel: string;
  sourceIcon?: ActionIconName;
  node: ReactNode;
};

export type BillLineEntryOptions = {
  showUnitColumn: boolean;
  showPackColumn?: boolean;
  sourceLabel: string;
  sourceIcon?: ActionIconName;
};

export function createBillLineEntry<T>(
  entry: BillLineGridEntry<T>,
  options: BillLineEntryOptions,
): BillLineEntryNode {
  return {
    key: entry.key,
    sourceLabel: options.sourceLabel,
    sourceIcon: options.sourceIcon,
    node: (
      <EntryRow
        entry={entry}
        showUnitColumn={options.showUnitColumn}
        showPackColumn={options.showPackColumn ?? false}
      />
    ),
  };
}

type GridProps = {
  draft: boolean;
  showUnitColumn?: boolean;
  showPackColumn?: boolean;
  itemHeader: string;
  priceHeader: string;
  rows: BillLineGridRow[];
  emptyLabel: string;
  /** Return false to reject the edit and restore the previous quantity. */
  onQtyCommit: (index: number, qty: number) => boolean | void;
  onPriceCommit?: (index: number, priceMmk: number | null) => boolean | void;
  onUnitChange?: (index: number, unitId: string) => void;
  onRemove: (index: number) => void;
  entries?: BillLineEntryNode[];
};

function parseWholeQty(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

export function BillLineGrid({
  draft,
  showUnitColumn = false,
  showPackColumn = false,
  itemHeader,
  priceHeader,
  rows,
  emptyLabel,
  onQtyCommit,
  onPriceCommit,
  onUnitChange,
  onRemove,
  entries = [],
}: GridProps) {
  const { t } = useI18n();
  const showEntries = draft && entries.length > 0;
  const gridRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<HTMLDivElement>(null);
  const focusSearchRef = useRef(false);
  const prevSnapRef = useRef<RowSnapshot[] | null>(null);
  const [selectedKey, setSelectedKey] = useState(entries[0]?.key ?? "");
  const gridClass = [
    "opd-bill-grid",
    showUnitColumn ? "opd-bill-grid--units" : "",
    showPackColumn ? "opd-bill-grid--pack" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (entries.length === 0) return;
    if (!entries.some((e) => e.key === selectedKey)) {
      setSelectedKey(entries[0].key);
    }
  }, [entries, selectedKey]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const grid = gridRef.current;
    if (!body || !grid) return;
    const apply = () => {
      const gutter = Math.max(0, body.offsetWidth - body.clientWidth);
      grid.style.setProperty("--bill-scroll-gutter", `${gutter}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const next = snapshotRows(rows);
    const prev = prevSnapRef.current;
    prevSnapRef.current = next;
    if (prev == null) return;

    const target = cartRevealTarget(prev, next);
    const body = bodyRef.current;
    if (!body || target == null) return;
    if (target === "top") {
      body.scrollTop = 0;
      return;
    }
    if (target === "end") {
      body.scrollTop = body.scrollHeight;
      return;
    }
    const rowEl = body.querySelector<HTMLElement>(
      `[data-row-key="${CSS.escape(target)}"]`,
    );
    if (rowEl) revealRowInPane(body, rowEl);
  }, [rows]);

  function focusEntrySearch() {
    entriesRef.current
      ?.querySelector<HTMLInputElement>(".bill-line-typeahead input")
      ?.focus();
  }

  function selectSource(key: string) {
    if (key === selectedKey) {
      focusEntrySearch();
      return;
    }
    focusSearchRef.current = true;
    setSelectedKey(key);
  }

  useLayoutEffect(() => {
    if (!focusSearchRef.current) return;
    focusSearchRef.current = false;
    focusEntrySearch();
  }, [selectedKey]);

  const activeEntry =
    entries.find((e) => e.key === selectedKey) ?? entries[0] ?? null;

  return (
    <div className={gridClass} ref={gridRef}>
      <div className="opd-bill-grid-head">
        <span>{itemHeader}</span>
        {showPackColumn ? <span>{t("packingSize")}</span> : null}
        <span className="num">{t("qty")}</span>
        {showUnitColumn ? <span>{t("unit")}</span> : null}
        <span className="num">{priceHeader}</span>
        <span className="num">{t("amount")}</span>
        <span />
      </div>
      <div className="opd-bill-grid-body" ref={bodyRef}>
        {rows.length === 0 ? <p className="empty-row">{emptyLabel}</p> : null}
        {rows.map((row, index) => (
          <CommittedRow
            key={row.key}
            row={row}
            draft={draft}
            showUnitColumn={showUnitColumn}
            showPackColumn={showPackColumn}
            onQtyCommit={(qty) => onQtyCommit(index, qty)}
            onPriceCommit={
              onPriceCommit ? (price) => onPriceCommit(index, price) : undefined
            }
            onUnitChange={
              onUnitChange ? (unitId) => onUnitChange(index, unitId) : undefined
            }
            onRemove={() => onRemove(index)}
          />
        ))}
      </div>
      {showEntries && activeEntry ? (
        <div className="opd-bill-grid-entries" ref={entriesRef}>
          <AddToBillBar
            entries={entries}
            selectedKey={activeEntry.key}
            onSelect={selectSource}
          />
          {activeEntry.node}
        </div>
      ) : null}
    </div>
  );
}

function AddToBillBar({
  entries,
  selectedKey,
  onSelect,
}: {
  entries: BillLineEntryNode[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const { t } = useI18n();
  const multi = entries.length > 1;

  return (
    <div className="bill-add-bar">
      <span className="bill-add-bar-title">{t("addToBill")}</span>
      {multi ? (
        <div className="bill-add-segments" role="radiogroup" aria-label={t("addToBill")}>
          {entries.map((entry, index) => {
            const selected = entry.key === selectedKey;
            return (
              <button
                key={entry.key}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`bill-add-segment${selected ? " bill-add-segment--on" : ""}`}
                onClick={() => onSelect(entry.key)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const next =
                    e.key === "ArrowRight"
                      ? entries[(index + 1) % entries.length]
                      : entries[(index - 1 + entries.length) % entries.length];
                  onSelect(next.key);
                }}
              >
                {entry.sourceIcon ? <ActionIcon name={entry.sourceIcon} /> : null}
                <span>{entry.sourceLabel}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <span className="bill-add-source">
          {entries[0]?.sourceIcon ? <ActionIcon name={entries[0].sourceIcon} /> : null}
          <span>{entries[0]?.sourceLabel}</span>
        </span>
      )}
    </div>
  );
}

function unitText(row: BillLineGridRow): string {
  const match = row.units?.find((u) => u.id === row.unitId);
  if (match) return match.label;
  return row.unitId?.trim() || "";
}

function CommittedRow({
  row,
  draft,
  showUnitColumn,
  showPackColumn,
  onQtyCommit,
  onPriceCommit,
  onUnitChange,
  onRemove,
}: {
  row: BillLineGridRow;
  draft: boolean;
  showUnitColumn: boolean;
  showPackColumn: boolean;
  onQtyCommit: (qty: number) => boolean | void;
  onPriceCommit?: (priceMmk: number | null) => boolean | void;
  onUnitChange?: (unitId: string) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const editable = draft && !row.locked;
  const qtyEditable = editable && !row.qtyLocked;
  const units = row.units ?? [];
  const canChangeUnit = editable && units.length > 1 && !!onUnitChange;
  const priceEditable = draft && !!row.priceEditable && !!onPriceCommit;

  return (
    <div className="opd-bill-grid-row" data-row-key={row.key}>
      <span className="bill-line-title" title={row.title}>
        {row.title}
      </span>
      {showPackColumn ? (
        <span className="bill-line-pack" title={row.packTitle || row.packLabel || undefined}>
          {row.packLabel ?? ""}
        </span>
      ) : null}
      <span className="num">
        {qtyEditable ? (
          <QtyField qty={row.qty} ariaLabel={t("qty")} onCommit={onQtyCommit} />
        ) : (
          row.qty
        )}
      </span>
      {showUnitColumn ? (
        <span className="bill-line-cell">
          {canChangeUnit ? (
            <select
              className="bill-unit-select"
              aria-label={t("unit")}
              value={row.unitId ?? units[0]?.id ?? ""}
              onChange={(e) => onUnitChange?.(e.target.value)}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          ) : (
            unitText(row)
          )}
        </span>
      ) : null}
      <span className="num">
        {priceEditable ? (
          <PriceField
            priceMmk={row.priceMmk}
            ariaLabel={t("fees")}
            onCommit={onPriceCommit}
          />
        ) : row.priceMmk == null ? (
          ""
        ) : (
          formatMMK(row.priceMmk)
        )}
      </span>
      <span className="num">{row.priceMmk == null ? "" : formatMMK(row.amountMmk)}</span>
      <span>
        {draft && row.removable !== false ? (
          <button type="button" className="btn ghost danger" aria-label={t("delete")} onClick={onRemove}>
            <ActionIcon name="trash" />
          </button>
        ) : null}
      </span>
    </div>
  );
}

function parseNonNegKyat(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0) return "invalid";
  return n;
}

function PriceField({
  priceMmk,
  ariaLabel,
  onCommit,
}: {
  priceMmk: number | null;
  ariaLabel: string;
  onCommit: (priceMmk: number | null) => boolean | void;
}) {
  const [text, setText] = useState(priceMmk == null ? "" : String(priceMmk));
  useEffect(() => {
    setText(priceMmk == null ? "" : String(priceMmk));
  }, [priceMmk]);

  function commit(raw: string) {
    const n = parseNonNegKyat(raw);
    if (n === "invalid") {
      setText(priceMmk == null ? "" : String(priceMmk));
      return;
    }
    if (n === priceMmk) return;
    if (onCommit(n) === false) setText(priceMmk == null ? "" : String(priceMmk));
  }

  return (
    <input
      className="qty-input"
      value={text}
      aria-label={ariaLabel}
      inputMode="numeric"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => commit(text)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        commit(text);
      }}
    />
  );
}

function QtyField({
  qty,
  ariaLabel,
  onCommit,
}: {
  qty: number;
  ariaLabel: string;
  onCommit: (qty: number) => boolean | void;
}) {
  const [text, setText] = useState(qty < 1 ? "" : String(qty));
  useEffect(() => {
    setText(qty < 1 ? "" : String(qty));
  }, [qty]);

  function commit(raw: string) {
    const n = parseWholeQty(raw);
    if (n == null) return;
    if (n === qty) return;
    if (onCommit(n) === false) setText(qty < 1 ? "" : String(qty));
  }

  return (
    <input
      className="qty-input"
      value={text}
      aria-label={ariaLabel}
      inputMode="numeric"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => commit(text)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const n = parseWholeQty(text);
        if (n == null) return;
        commit(text);
      }}
    />
  );
}

function openSelect(el: HTMLSelectElement | null) {
  if (!el) return;
  el.focus();
  if (typeof el.showPicker !== "function") return;
  // After the click that asked for the menu, so that same click does not dismiss it.
  window.setTimeout(() => {
    if (!el.isConnected) return;
    try {
      el.showPicker();
    } catch {
      // Focus is enough when this WebView refuses showPicker outside a direct gesture.
    }
  }, 0);
}

function EntryRow<T>({
  entry,
  showUnitColumn,
  showPackColumn,
}: {
  entry: BillLineGridEntry<T>;
  showUnitColumn: boolean;
  showPackColumn: boolean;
}) {
  const { t } = useI18n();
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLSelectElement>(null);
  const focusSearchRef = useRef(false);
  const submitSeq = useRef(0);
  const pickedRef = useRef<T | null>(null);
  const unitIdRef = useRef("");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<T | null>(null);
  const [qty, setQty] = useState("");
  const [unitId, setUnitId] = useState("");

  const units = picked ? entry.unitsFor(picked) : [];
  const needsUnit = showUnitColumn && units.length > 0;
  const pickedKey = picked ? String(entry.getKey(picked)) : "";
  const packLabel = picked && entry.packFor ? entry.packFor(picked) : "";
  const packTitle = picked && entry.packTitleFor ? entry.packTitleFor(picked) : packLabel;

  pickedRef.current = picked;
  unitIdRef.current = unitId;

  useEffect(() => {
    if (!pickedKey) {
      if (focusSearchRef.current) {
        focusSearchRef.current = false;
        const active = document.activeElement;
        if (active == null || active === document.body) {
          inputRef.current?.focus();
        }
      }
      return;
    }
    if (entry.commitOnPick) return;
    qtyRef.current?.focus();
  }, [pickedKey, entry.commitOnPick]);

  useEffect(() => {
    function needsUnitPick() {
      const item = pickedRef.current;
      if (!item || !showUnitColumn) return false;
      if (unitIdRef.current) return false;
      return entry.unitsFor(item).length > 0;
    }
    function onPointer(ev: PointerEvent) {
      if (!needsUnitPick()) return;
      const target = ev.target;
      if (target instanceof Node && rowRef.current?.contains(target)) return;
      if (document.activeElement === unitRef.current) return;
      ev.preventDefault();
      openSelect(unitRef.current);
    }
    function onFocusIn(ev: FocusEvent) {
      if (!needsUnitPick()) return;
      const target = ev.target;
      if (target instanceof Node && rowRef.current?.contains(target)) return;
      openSelect(unitRef.current);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [entry, showUnitColumn]);

  function resetEntry() {
    focusSearchRef.current = true;
    submitSeq.current += 1;
    pickedRef.current = null;
    unitIdRef.current = "";
    setPicked(null);
    setQty("");
    setText("");
    setUnitId("");
  }

  function commitPicked(item: T, n: number, unit: BillLineUnitOption | null) {
    pickedRef.current = null;
    entry.onCommit(item, n, unit);
    resetEntry();
  }

  function finishQty(raw: string) {
    const item = pickedRef.current;
    if (!item) return;
    const options = entry.unitsFor(item);
    if (showUnitColumn && options.length > 0) {
      const chosen = unitIdRef.current
        ? options.find((u) => u.id === unitIdRef.current)
        : undefined;
      if (!chosen) {
        openSelect(unitRef.current);
        return;
      }
      const n = parseWholeQty(raw);
      if (n == null) return;
      commitPicked(item, n, chosen);
      return;
    }
    const n = parseWholeQty(raw);
    if (n == null) return;
    commitPicked(item, n, options.length === 1 ? options[0] : null);
  }

  function clearPickForEdit(next: string) {
    if (!pickedRef.current) {
      setText(next);
      return;
    }
    submitSeq.current += 1;
    pickedRef.current = null;
    unitIdRef.current = "";
    setPicked(null);
    setQty("");
    setUnitId("");
    setText(next);
  }

  function chooseUnit(id: string) {
    if (!picked) return;
    if (!id) {
      setUnitId("");
      return;
    }
    const options = entry.unitsFor(picked);
    const chosen = options.find((u) => u.id === id);
    if (!chosen) return;
    setUnitId(id);
    const n = parseWholeQty(qty);
    if (n == null) {
      qtyRef.current?.focus();
      return;
    }
    commitPicked(picked, n, chosen);
  }

  async function submitCode() {
    if (!entry.onSubmitCode) return;
    const code = text.trim();
    if (!code) return;
    const seq = ++submitSeq.current;
    const item = await entry.onSubmitCode(code);
    if (seq !== submitSeq.current || !item) return;
    if (entry.commitOnPick) {
      commitPicked(item, 1, null);
      return;
    }
    setPicked(item);
    setQty("");
    setUnitId("");
    setText("");
  }

  return (
    <div
      className="opd-bill-grid-row bill-line-entry"
      ref={rowRef}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (next instanceof Node && rowRef.current?.contains(next)) return;
        if (e.target === qtyRef.current) return;
        finishQty(qtyRef.current?.value ?? "");
      }}
    >
      <span className="bill-line-cell">
        <Typeahead
          inputRef={inputRef}
          className="bill-line-typeahead"
          ariaLabel={entry.ariaLabel}
          value={picked ? entry.itemTitle(picked) : text}
          onChange={clearPickForEdit}
          placeholder={entry.placeholder}
          loadSuggestions={entry.loadSuggestions}
          getKey={entry.getKey}
          renderOption={entry.renderOption}
          onPick={(item) => {
            if (entry.commitOnPick) {
              commitPicked(item, 1, null);
              return;
            }
            setPicked(item);
            setQty("");
            setUnitId("");
            setText("");
          }}
          onSubmitWithoutPick={() => {
            if (entry.commitOnPick) {
              void submitCode();
              return;
            }
            if (pickedRef.current) {
              qtyRef.current?.focus();
              return;
            }
            void submitCode();
          }}
        />
      </span>
      {showPackColumn ? (
        <span className="bill-line-pack" title={packTitle || undefined}>
          {packLabel}
        </span>
      ) : null}
      <span className="num bill-line-cell">
        {entry.commitOnPick ? (
          <span />
        ) : (
        <input
          ref={qtyRef}
          className="qty-input"
          aria-label={t("qty")}
          value={qty}
          disabled={!picked}
          inputMode="numeric"
          onChange={(e) => setQty(e.target.value)}
          onBlur={(e) => {
            if (!pickedRef.current) return;
            const next = e.relatedTarget;
            if (next instanceof Node && unitRef.current?.contains(next)) return;
            if (unitRef.current != null && next === unitRef.current) return;
            if (inputRef.current != null && next === inputRef.current) return;
            finishQty(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              resetEntry();
              return;
            }
            if (e.key !== "Enter") return;
            e.preventDefault();
            finishQty(qty);
          }}
        />
        )}
      </span>
      {showUnitColumn ? (
        <span className="bill-line-cell bill-line-unit">
          {needsUnit ? (
            <select
              ref={unitRef}
              className="bill-unit-select"
              aria-label={t("unit")}
              value={unitId}
              onChange={(e) => chooseUnit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                e.preventDefault();
                resetEntry();
              }}
            >
              <option value="">{t("unit")}</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </select>
          ) : null}
        </span>
      ) : null}
      <span className="num" />
      <span className="num" />
      <span />
    </div>
  );
}
