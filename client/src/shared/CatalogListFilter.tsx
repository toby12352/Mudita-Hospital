import type { ReactNode } from "react";
import { ActionIcon } from "@/shared/ActionIcon";
import { type ActiveFilterValue } from "@/shared/ActiveFilter";
import { type DateSortValue } from "@/shared/DateSort";
import { useI18n } from "@/shared/i18n";

const STATUS_OPTIONS: ActiveFilterValue[] = ["all", "active", "inactive"];
const DATE_SORT_OPTIONS: DateSortValue[] = ["desc", "asc"];

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
  hideLabel = false,
  labelledBy,
}: {
  id: string;
  value: DateSortValue;
  onChange: (value: DateSortValue) => void;
  /** When true, omit the built-in label (use a sibling label via labelledBy). */
  hideLabel?: boolean;
  labelledBy?: string;
}) {
  const { t } = useI18n();
  const labelId = `${id}-date-sort-label`;
  const labels: Record<DateSortValue, string> = {
    desc: t("sortNewest"),
    asc: t("sortOldest"),
  };
  const groupLabelledBy = labelledBy ?? (hideLabel ? undefined : labelId);

  return (
    <div className={`catalog-filter-field${hideLabel ? " catalog-filter-field--control-only" : ""}`}>
      {hideLabel ? null : (
        <span className="drug-info-label" id={labelId}>
          {t("sortByDate")}
        </span>
      )}
      <div className="catalog-filter-segment" role="radiogroup" aria-labelledby={groupLabelledBy}>
        {DATE_SORT_OPTIONS.map((opt) => (
          <label key={opt}>
            <input
              type="radio"
              name={`${id}-date-sort`}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            <span>{labels[opt]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function CatalogFilterPanel({
  id,
  open,
  query,
  onQueryChange,
  queryPlaceholder,
  searchLabel,
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
  onSearch: () => void;
  /** Omit both to hide the active/inactive radios (e.g. patient charts). */
  active?: ActiveFilterValue;
  onActiveChange?: (value: ActiveFilterValue) => void;
  onReset: () => void;
  category?: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
  };
  dateSort?: DateSortValue;
  onDateSortChange?: (value: DateSortValue) => void;
}) {
  const { t } = useI18n();
  const searchId = `${id}-search`;
  const statusLabelId = `${id}-status-label`;
  const categoryId = `${id}-category`;
  const showStatus = active != null && typeof onActiveChange === "function";
  const showDateSort = dateSort != null && typeof onDateSortChange === "function";
  const statusLabels: Record<ActiveFilterValue, string> = {
    all: t("all"),
    active: t("active"),
    inactive: t("notActive"),
  };

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
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </div>
          {showStatus ? (
            <div className="catalog-filter-field">
              <span className="drug-info-label" id={statusLabelId}>
                {t("status")}
              </span>
              <div className="catalog-filter-segment" role="radiogroup" aria-labelledby={statusLabelId}>
                {STATUS_OPTIONS.map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`${id}-status`}
                      value={value}
                      checked={active === value}
                      onChange={() => onActiveChange(value)}
                    />
                    <span>{statusLabels[value]}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {category ? (
            <div className="catalog-filter-field">
              <label className="drug-info-label" htmlFor={categoryId}>
                {category.label}
              </label>
              <select
                id={categoryId}
                className="drug-info-input"
                value={category.value}
                onChange={(e) => category.onChange(e.target.value)}
              >
                {category.children}
              </select>
            </div>
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
