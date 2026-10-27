import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CatalogDateSortField, CatalogFilterButton } from "@/shared/CatalogListFilter";
import { ActionIcon } from "@/shared/ActionIcon";
import { type DateSortValue } from "@/shared/DateSort";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";

export type BillHistoryMoney = "" | "paid" | "void" | "draft" | "printed_not_paid";

export type BillHistoryQuery = {
  q: string;
  money: BillHistoryMoney;
  from: string;
  to: string;
  sort: DateSortValue;
};

export type BillHistorySuggestItem = {
  id: number;
  voucher: string;
  name: string;
};

const MONEY_OPTIONS: BillHistoryMoney[] = ["", "paid", "void", "draft", "printed_not_paid"];

const emptyQuery = (): BillHistoryQuery => ({
  q: "",
  money: "",
  from: "",
  to: "",
  sort: "desc",
});

type Props = {
  searchPlaceholder: string;
  /** Called on mount and whenever search / filter should reload the list. */
  onSearch: (query: BillHistoryQuery) => void;
  /** Typeahead suggestions; filters are the current money/from/to/sort (not q). */
  loadSuggestions: (
    q: string,
    filters: Omit<BillHistoryQuery, "q">,
  ) => Promise<BillHistorySuggestItem[]>;
  onInvalidRange: () => void;
};

export function BillHistoryToolbar({
  searchPlaceholder,
  onSearch,
  loadSuggestions,
  onInvalidRange,
}: Props) {
  const { t } = useI18n();
  const filterPanelId = useId();
  const [queryText, setQueryText] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [money, setMoney] = useState<BillHistoryMoney>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<DateSortValue>("desc");
  const filtersRef = useRef({ money, from, to, sort });
  filtersRef.current = { money, from, to, sort };
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const onInvalidRangeRef = useRef(onInvalidRange);
  onInvalidRangeRef.current = onInvalidRange;

  const buildQuery = useCallback(
    (
      q: string,
      nextMoney = money,
      nextFrom = from,
      nextTo = to,
      nextSort = sort,
    ): BillHistoryQuery => ({
      q: q.trim(),
      money: nextMoney,
      from: nextFrom.trim(),
      to: nextTo.trim(),
      sort: nextSort,
    }),
    [money, from, to, sort],
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
    nextSort = sort,
  ) {
    if (rangeInvalid(nextFrom, nextTo)) {
      onInvalidRangeRef.current();
      return;
    }
    onSearchRef.current(buildQuery(q, nextMoney, nextFrom, nextTo, nextSort));
  }

  useEffect(() => {
    onSearchRef.current(emptyQuery());
  }, []);

  const loadSuggest = useCallback(
    async (q: string) => {
      const f = filtersRef.current;
      return loadSuggestions(q, {
        money: f.money,
        from: f.from,
        to: f.to,
        sort: f.sort,
      });
    },
    [loadSuggestions],
  );

  const statusLabels: Record<BillHistoryMoney, string> = {
    "": t("all"),
    paid: t("paid"),
    void: t("voidStatus"),
    draft: t("draft"),
    printed_not_paid: t("printedNotPaid"),
  };

  const statusLabelId = `${filterPanelId}-status-label`;
  const fromId = `${filterPanelId}-from`;
  const toId = `${filterPanelId}-to`;

  return (
    <div className="bill-history-toolbar">
      <div className="bill-history-toolbar-row">
        <Typeahead<BillHistorySuggestItem>
          className="bill-history-search"
          value={queryText}
          onChange={setQueryText}
          placeholder={searchPlaceholder}
          ariaLabel={searchPlaceholder}
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
            apply(item.voucher);
          }}
          onSubmitWithoutPick={() => apply(queryText)}
        />
        <CatalogFilterButton
          open={filterOpen}
          controlsId={filterPanelId}
          onToggle={() => setFilterOpen((v) => !v)}
        />
      </div>

      <div className={`catalog-filter-wrap${filterOpen ? " open" : ""}`}>
        <div className="catalog-filter-clip">
          <div
            id={filterPanelId}
            className="catalog-filter"
            inert={filterOpen ? undefined : true}
            aria-hidden={filterOpen ? undefined : true}
          >
            <div className="bill-history-date-row">
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
                    apply(queryText, money, next, to, sort);
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
                    apply(queryText, money, from, next, sort);
                  }}
                />
              </div>
            </div>
            <div className="catalog-filter-field">
              <span className="drug-info-label" id={statusLabelId}>
                {t("status")}
              </span>
              <div className="catalog-filter-segment" role="radiogroup" aria-labelledby={statusLabelId}>
                {MONEY_OPTIONS.map((value) => (
                  <label key={value || "all"}>
                    <input
                      type="radio"
                      name={`${filterPanelId}-money`}
                      value={value}
                      checked={money === value}
                      onChange={() => {
                        setMoney(value);
                        apply(queryText, value, from, to, sort);
                      }}
                    />
                    <span>{statusLabels[value]}</span>
                  </label>
                ))}
              </div>
            </div>
            <CatalogDateSortField
              id={filterPanelId}
              value={sort}
              onChange={(next) => {
                setSort(next);
                apply(queryText, money, from, to, next);
              }}
            />
            <div className="catalog-filter-actions">
              <button
                type="button"
                className="btn action"
                onClick={() => {
                  setQueryText("");
                  setMoney("");
                  setFrom("");
                  setTo("");
                  setSort("desc");
                  onSearchRef.current(emptyQuery());
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
