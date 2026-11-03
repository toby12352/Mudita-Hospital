import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { CatalogFilterButton } from "@/shared/CatalogListFilter";
import { ActionIcon } from "@/shared/ActionIcon";
import { type DateSortValue } from "@/shared/DateSort";
import { FilterMenu, type FilterMenuOption } from "@/shared/FilterMenu";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";

export type BillHistoryMoney = "" | "paid" | "void" | "draft" | "printed_not_paid" | "deleted";

export type BillHistoryStatusOption = {
  value: string;
  label: string;
};

export type BillHistoryOrder = "date" | "voucher";

/** Menu value: a direction, or blank Select sort (billing desks with voucherSort). */
export type BillHistorySortChoice = DateSortValue | "";

export type BillHistoryQuery = {
  q: string;
  /** Money status on bill desks, or a custom filter value (e.g. patient category). */
  money: string;
  /** Optional desk category (e.g. expense bill portal). Empty means every category. */
  category: string;
  /** Optional packing unit (pharmacy maintenance). Empty means every unit. */
  unit: string;
  from: string;
  to: string;
  sort: DateSortValue;
  /** Active list order: by created date, or by voucher number. */
  order: BillHistoryOrder;
};

/** Caption key for history list order (billing desks with voucherSort). */
export function billHistoryOrderHintKey(
  query: Pick<BillHistoryQuery, "sort" | "order">,
): "billHistoryHint" | "billHistoryHintOldest" | "billHistoryHintVoucherDesc" | "billHistoryHintVoucherAsc" {
  if (query.order === "voucher") {
    return query.sort === "asc" ? "billHistoryHintVoucherAsc" : "billHistoryHintVoucherDesc";
  }
  return query.sort === "asc" ? "billHistoryHintOldest" : "billHistoryHint";
}

export type BillHistorySuggestItem = {
  id: number;
  voucher: string;
  name: string;
};

export type BillHistoryInitialRange = "today" | "all";

const MONEY_OPTIONS: BillHistoryMoney[] = ["", "paid", "void", "draft", "printed_not_paid", "deleted"];

/** Clinic PC calendar day (yyyy-mm-dd). Matches the Yangon civil day the API filters on. */
function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const emptyQuery = (voucherDefault = false): BillHistoryQuery => ({
  q: "",
  money: "",
  category: "",
  unit: "",
  from: "",
  to: "",
  sort: "desc",
  order: voucherDefault ? "voucher" : "date",
});

/** History opens on today. Clearing both dates (Reset) shows every bill. */
function todayQuery(voucherDefault = false): BillHistoryQuery {
  const today = localToday();
  return { ...emptyQuery(voucherDefault), from: today, to: today };
}

function initialQuery(
  range: BillHistoryInitialRange,
  initialMoney = "",
  voucherDefault = false,
): BillHistoryQuery {
  const base = range === "all" ? emptyQuery(voucherDefault) : todayQuery(voucherDefault);
  return { ...base, money: initialMoney };
}

type Props = {
  searchPlaceholder: string;
  /** Called on mount and whenever search / filter should reload the list. */
  onSearch: (query: BillHistoryQuery) => void;
  /**
   * Typeahead suggestions; filters are the current money/category/unit/from/to/sort/order (not q).
   * Unused when `explicitSearch` is set.
   */
  loadSuggestions?: (
    q: string,
    filters: Omit<BillHistoryQuery, "q">,
  ) => Promise<BillHistorySuggestItem[]>;
  onInvalidRange: () => void;
  /** Date range on first open. Defaults to today (bill desks). Use "all" for patient chart. */
  initialRange?: BillHistoryInitialRange;
  /** Status radio selected on first open. Defaults to All (""). Use "open" for IPD stays. */
  initialMoney?: string;
  /**
   * Status / category options in the filter panel.
   * Defaults to bill money statuses (All / Paid / Void / Draft / Printed — Not Paid / Deleted).
   */
  statusOptions?: BillHistoryStatusOption[];
  /** Label above the status menu. Defaults to Status. */
  statusFieldLabel?: string;
  /** Hide status / category menu (e.g. patient chart list). */
  hideStatus?: boolean;
  /**
   * Optional category dropdown in the filter panel (e.g. expense desk portals, OPD services).
   * When omitted, the category control is hidden and query.category stays "".
   */
  categoryOptions?: BillHistoryStatusOption[];
  /**
   * Optional packing-unit dropdown (pharmacy maintenance).
   * When omitted, the unit control is hidden and query.unit stays "".
   */
  unitOptions?: BillHistoryStatusOption[];
  /**
   * Show Ascend/Descend voucher sort and default history to voucher Descend
   * (billing history desks only).
   */
  voucherSort?: boolean;
  /** Guided tour target on the search field. */
  searchGuide?: string;
  /**
   * When set, picking a suggestion calls this instead of running search with the voucher.
   * Enter with no pick still runs onSearch.
   */
  onPickSuggestion?: (item: BillHistorySuggestItem) => void;
  /**
   * Plain search field. Typing does not open suggestions; Enter or the
   * toolbar Search button runs onSearch. The Search button is always shown,
   * including when this flag is off and the field stays a typeahead.
   */
  explicitSearch?: boolean;
  /**
   * Hide From / To date fields in the filter panel (catalog maintenance desks).
   * Query.from and query.to stay empty; bill desks keep the date row.
   */
  hideDateRange?: boolean;
  /** Extra control beside the filter button (e.g. +Add Bill). */
  trailing?: ReactNode;
};

export function BillHistoryToolbar({
  searchPlaceholder,
  onSearch,
  loadSuggestions,
  onInvalidRange,
  initialRange = "today",
  initialMoney = "",
  statusOptions,
  statusFieldLabel,
  hideStatus = false,
  categoryOptions,
  unitOptions,
  voucherSort = false,
  searchGuide,
  onPickSuggestion,
  explicitSearch = false,
  hideDateRange = false,
  trailing,
}: Props) {
  const { t } = useI18n();
  const filterPanelId = useId();
  const [queryText, setQueryText] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [money, setMoney] = useState(initialMoney);
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [from, setFrom] = useState(() => (initialRange === "all" ? "" : localToday()));
  const [to, setTo] = useState(() => (initialRange === "all" ? "" : localToday()));
  /** With voucherSort, only one menu holds a direction; the other is Select sort (""). */
  const [dateSort, setDateSort] = useState<BillHistorySortChoice>(voucherSort ? "" : "desc");
  const [voucherDir, setVoucherDir] = useState<BillHistorySortChoice>(voucherSort ? "desc" : "desc");
  const [order, setOrder] = useState<BillHistoryOrder>(voucherSort ? "voucher" : "date");
  const activeSort: DateSortValue =
    order === "voucher" ? voucherDir || "desc" : dateSort || "desc";
  const filtersRef = useRef({
    money,
    category,
    unit,
    from,
    to,
    sort: activeSort,
    order,
  });
  filtersRef.current = {
    money,
    category,
    unit,
    from,
    to,
    sort: activeSort,
    order,
  };
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const onInvalidRangeRef = useRef(onInvalidRange);
  onInvalidRangeRef.current = onInvalidRange;
  const initialRangeRef = useRef(initialRange);
  const initialMoneyRef = useRef(initialMoney);
  const voucherSortRef = useRef(voucherSort);

  const defaultMoneyLabels: Record<BillHistoryMoney, string> = {
    "": t("all"),
    paid: t("paid"),
    void: t("voidStatus"),
    draft: t("draft"),
    printed_not_paid: t("printedNotPaid"),
    deleted: t("deletedStatus"),
  };

  const resolvedStatusOptions: FilterMenuOption[] =
    statusOptions ??
    MONEY_OPTIONS.map((value) => ({
      value,
      label: defaultMoneyLabels[value],
    }));

  const selectSortOption: FilterMenuOption = { value: "", label: t("selectSort") };
  const sortOptions: FilterMenuOption[] = voucherSort
    ? [selectSortOption, { value: "desc", label: t("sortNewest") }, { value: "asc", label: t("sortOldest") }]
    : [
        { value: "desc", label: t("sortNewest") },
        { value: "asc", label: t("sortOldest") },
      ];

  const voucherOptions: FilterMenuOption[] = [
    selectSortOption,
    { value: "asc", label: t("sortAscend") },
    { value: "desc", label: t("sortDescend") },
  ];

  const buildQuery = useCallback(
    (
      q: string,
      nextMoney = money,
      nextFrom = from,
      nextTo = to,
      nextSort = activeSort,
      nextCategory = category,
      nextUnit = unit,
      nextOrder = order,
    ): BillHistoryQuery => ({
      q: q.trim(),
      money: nextMoney,
      category: nextCategory,
      unit: nextUnit,
      from: nextFrom.trim(),
      to: nextTo.trim(),
      sort: nextSort,
      order: nextOrder,
    }),
    [money, category, unit, from, to, activeSort, order],
  );

  function rangeInvalid(nextFrom: string, nextTo: string): boolean {
    const f = nextFrom.trim();
    const tDate = nextTo.trim();
    return f !== "" && tDate !== "" && f > tDate;
  }

  function apply(
    q: string,
    nextMoney = money,
    nextFrom = from,
    nextTo = to,
    nextSort = activeSort,
    nextCategory = category,
    nextUnit = unit,
    nextOrder = order,
  ) {
    if (rangeInvalid(nextFrom, nextTo)) {
      onInvalidRangeRef.current();
      return;
    }
    onSearchRef.current(
      buildQuery(q, nextMoney, nextFrom, nextTo, nextSort, nextCategory, nextUnit, nextOrder),
    );
  }

  useEffect(() => {
    onSearchRef.current(
      initialQuery(
        initialRangeRef.current,
        initialMoneyRef.current,
        voucherSortRef.current,
      ),
    );
  }, []);

  const loadSuggest = useCallback(
    async (q: string) => {
      if (!loadSuggestions) return [];
      const f = filtersRef.current;
      return loadSuggestions(q, {
        money: f.money,
        category: f.category,
        unit: f.unit,
        from: f.from,
        to: f.to,
        sort: f.sort,
        order: f.order,
      });
    },
    [loadSuggestions],
  );

  const fromId = `${filterPanelId}-from`;
  const toId = `${filterPanelId}-to`;
  const fieldLabel = statusFieldLabel ?? t("status");
  const showCategory = categoryOptions != null;
  const showUnit = unitOptions != null;
  const categoryMenuOptions: FilterMenuOption[] = showCategory
    ? [{ value: "", label: t("all") }, ...categoryOptions]
    : [];
  const unitMenuOptions: FilterMenuOption[] = showUnit
    ? [{ value: "", label: t("all") }, ...unitOptions]
    : [];

  return (
    <div className="bill-history-toolbar">
      <div className="bill-history-toolbar-row">
        {explicitSearch ? (
          <label className="field grow bill-history-search">
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              autoComplete="off"
              data-guide={searchGuide}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply(queryText);
                }
              }}
            />
          </label>
        ) : (
          <Typeahead<BillHistorySuggestItem>
            className="bill-history-search"
            value={queryText}
            onChange={setQueryText}
            placeholder={searchPlaceholder}
            ariaLabel={searchPlaceholder}
            dataGuide={searchGuide}
            loadSuggestions={loadSuggest}
            getKey={(item) => item.id}
            maxResults={8}
            renderOption={(item) => (
              <>
                <span className="typeahead-title">{item.voucher}</span>
                <span className="typeahead-sub">{item.name}</span>
              </>
            )}
            onPick={(item) => {
              setQueryText(item.voucher);
              if (onPickSuggestion) {
                onPickSuggestion(item);
                return;
              }
              apply(item.voucher);
            }}
            onSubmitWithoutPick={() => apply(queryText)}
          />
        )}
        <button type="button" className="btn action" onClick={() => apply(queryText)}>
          <ActionIcon name="search" />
          {t("search")}
        </button>
        <CatalogFilterButton
          open={filterOpen}
          controlsId={filterPanelId}
          onToggle={() => setFilterOpen((v) => !v)}
        />
        {trailing}
      </div>

      <div className={`catalog-filter-wrap${filterOpen ? " open" : ""}`}>
        <div className="catalog-filter-clip">
          <div
            id={filterPanelId}
            className="catalog-filter"
            inert={filterOpen ? undefined : true}
            aria-hidden={filterOpen ? undefined : true}
          >
            {hideDateRange ? null : (
              <>
                <div className="catalog-filter-field">
                  <label className="drug-info-label" htmlFor={fromId}>
                    {t("billHistoryFrom")}
                  </label>
                  <input
                    id={fromId}
                    type="date"
                    className="drug-info-input"
                    value={from}
                    onChange={(e) => {
                      const next = e.target.value;
                      setFrom(next);
                      apply(queryText, money, next, to, activeSort, category, unit, order);
                    }}
                  />
                </div>
                <div className="catalog-filter-field">
                  <label className="drug-info-label" htmlFor={toId}>
                    {t("billHistoryTo")}
                  </label>
                  <input
                    id={toId}
                    type="date"
                    className="drug-info-input"
                    value={to}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTo(next);
                      apply(queryText, money, from, next, activeSort, category, unit, order);
                    }}
                  />
                </div>
              </>
            )}
            {!hideStatus ? (
              <FilterMenu
                id={`${filterPanelId}-status`}
                label={fieldLabel}
                value={money}
                options={resolvedStatusOptions}
                onChange={(next) => {
                  setMoney(next);
                  apply(queryText, next, from, to, activeSort, category, unit, order);
                }}
              />
            ) : null}
            {showCategory ? (
              <FilterMenu
                id={`${filterPanelId}-category`}
                label={t("category")}
                value={category}
                options={categoryMenuOptions}
                onChange={(next) => {
                  setCategory(next);
                  apply(queryText, money, from, to, activeSort, next, unit, order);
                }}
              />
            ) : null}
            {showUnit ? (
              <FilterMenu
                id={`${filterPanelId}-unit`}
                label={t("unit")}
                value={unit}
                options={unitMenuOptions}
                onChange={(next) => {
                  setUnit(next);
                  apply(queryText, money, from, to, activeSort, category, next, order);
                }}
              />
            ) : null}
            <FilterMenu
              id={`${filterPanelId}-sort`}
              label={t("sortByDate")}
              value={dateSort}
              options={sortOptions}
              onChange={(next) => {
                if (voucherSort) {
                  if (next === "") {
                    // Clearing the active date sort restores voucher Descend.
                    setDateSort("");
                    setVoucherDir("desc");
                    setOrder("voucher");
                    apply(queryText, money, from, to, "desc", category, unit, "voucher");
                    return;
                  }
                  const nextSort: DateSortValue = next === "asc" ? "asc" : "desc";
                  setDateSort(nextSort);
                  setVoucherDir("");
                  setOrder("date");
                  apply(queryText, money, from, to, nextSort, category, unit, "date");
                  return;
                }
                const nextSort: DateSortValue = next === "asc" ? "asc" : "desc";
                setDateSort(nextSort);
                setOrder("date");
                apply(queryText, money, from, to, nextSort, category, unit, "date");
              }}
            />
            {voucherSort ? (
              <FilterMenu
                id={`${filterPanelId}-voucher-sort`}
                label={t("sortByVoucher")}
                value={voucherDir}
                options={voucherOptions}
                onChange={(next) => {
                  if (next === "") {
                    // Clearing voucher sort restores the open default (voucher Descend).
                    setDateSort("");
                    setVoucherDir("desc");
                    setOrder("voucher");
                    apply(queryText, money, from, to, "desc", category, unit, "voucher");
                    return;
                  }
                  const nextSort: DateSortValue = next === "asc" ? "asc" : "desc";
                  setVoucherDir(nextSort);
                  setDateSort("");
                  setOrder("voucher");
                  apply(queryText, money, from, to, nextSort, category, unit, "voucher");
                }}
              />
            ) : null}
            <div className="catalog-filter-actions">
              <button
                type="button"
                className="btn action"
                onClick={() => {
                  setQueryText("");
                  setMoney("");
                  setCategory("");
                  setUnit("");
                  setFrom("");
                  setTo("");
                  setDateSort(voucherSort ? "" : "desc");
                  setVoucherDir("desc");
                  setOrder(voucherSort ? "voucher" : "date");
                  onSearchRef.current(emptyQuery(voucherSort));
                }}
              >
                {t("reset")}
              </button>
              <button
                type="button"
                className="btn action primary"
                onClick={() => apply(queryText)}
              >
                <ActionIcon name="search" />
                {t("search")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
