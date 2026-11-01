import { ActionIcon } from "@/shared/ActionIcon";
import { type ActiveFilterValue } from "@/shared/ActiveFilter";
import { type DateSortValue } from "@/shared/DateSort";
import { FilterMenu, type FilterMenuOption } from "@/shared/FilterMenu";
import { useI18n } from "@/shared/i18n";

const STATUS_OPTIONS: ActiveFilterValue[] = ["all", "active", "inactive"];

export function CatalogFilterButton({
  open,
  controlsId,
  onToggle,
}: {
  open: boolean;
  controlsId: string;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`btn action${open ? " on" : ""}`}
      aria-expanded={open}
      aria-controls={controlsId}
      onClick={onToggle}
    >
      <ActionIcon name="sliders" />
      {t("filter")}
      <span className="catalog-filter-chevron">
        <ActionIcon name="chevron" />
      </span>
    </button>
  );
}

export function CatalogDateSortField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: DateSortValue;
  onChange: (value: DateSortValue) => void;
  /** Kept for call-site compatibility; label is always shown on the menu. */
  hideLabel?: boolean;
  labelledBy?: string;
}) {
  const { t } = useI18n();
  const options: FilterMenuOption[] = [
    { value: "desc", label: t("sortNewest") },
    { value: "asc", label: t("sortOldest") },
  ];

  return (
    <FilterMenu
      id={`${id}-date-sort`}
      label={t("sortByDate")}
      value={value}
      options={options}
      onChange={(next) => onChange(next === "asc" ? "asc" : "desc")}
    />
  );
}

export function CatalogFilterPanel({
  id,
  open,
  query,
  onQueryChange,
  queryPlaceholder,
  searchLabel,
  searchGuide,
  onSearch,
  active,
  onActiveChange,
  onReset,
  category,
  dateSort,
  onDateSortChange,
}: {
  id: string;
  open: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  queryPlaceholder: string;
  searchLabel: string;
  /** Set only while this field is the patient-search tour target. */
  searchGuide?: string;
  onSearch: () => void;
  /** Omit both to hide the active/inactive menu (e.g. patient charts). */
  active?: ActiveFilterValue;
  onActiveChange?: (value: ActiveFilterValue) => void;
  onReset: () => void;
  category?: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: FilterMenuOption[];
  };
  dateSort?: DateSortValue;
  onDateSortChange?: (value: DateSortValue) => void;
}) {
  const { t } = useI18n();
  const searchId = `${id}-search`;
  const showStatus = active != null && typeof onActiveChange === "function";
  const showDateSort = dateSort != null && typeof onDateSortChange === "function";
  const statusLabels: Record<ActiveFilterValue, string> = {
    all: t("all"),
    active: t("active"),
    inactive: t("notActive"),
  };
  const statusOptions: FilterMenuOption[] = STATUS_OPTIONS.map((value) => ({
    value,
    label: statusLabels[value],
  }));

  return (
    <div className={`catalog-filter-wrap${open ? " open" : ""}`}>
      <div className="catalog-filter-clip">
        <div
          id={id}
          className="catalog-filter"
          inert={open ? undefined : true}
          aria-hidden={open ? undefined : true}
        >
          <div className="catalog-filter-field">
            <label className="drug-info-label" htmlFor={searchId}>
              {searchLabel}
            </label>
            <input
              id={searchId}
              className="drug-info-input"
              value={query}
              placeholder={queryPlaceholder}
              data-guide={searchGuide}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </div>
          {showStatus ? (
            <FilterMenu
              id={`${id}-status`}
              label={t("status")}
              value={active}
              options={statusOptions}
              onChange={(next) => {
                const value = STATUS_OPTIONS.includes(next as ActiveFilterValue)
                  ? (next as ActiveFilterValue)
                  : "all";
                onActiveChange(value);
              }}
            />
          ) : null}
          {category ? (
            <FilterMenu
              id={`${id}-category`}
              label={category.label}
              value={category.value}
              options={category.options}
              onChange={category.onChange}
            />
          ) : null}
          {showDateSort ? (
            <CatalogDateSortField id={id} value={dateSort} onChange={onDateSortChange} />
          ) : null}
          <div className="catalog-filter-actions">
            <button type="button" className="btn action" onClick={onReset}>
              {t("reset")}
            </button>
            <button type="button" className="btn action primary" onClick={onSearch}>
              <ActionIcon name="search" />
              {t("search")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
