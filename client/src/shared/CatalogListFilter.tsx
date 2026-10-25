import type { ReactNode } from "react";
import { ActionIcon } from "@/shared/ActionIcon";
import { type ActiveFilterValue } from "@/shared/ActiveFilter";
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
}: {
  id: string;
  open: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  queryPlaceholder: string;
  searchLabel: string;
  onSearch: () => void;
  active: ActiveFilterValue;
  onActiveChange: (value: ActiveFilterValue) => void;
  onReset: () => void;
  category?: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
  };
}) {
  const { t } = useI18n();
  const searchId = `${id}-search`;
  const statusLabelId = `${id}-status-label`;
  const categoryId = `${id}-category`;
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
