import type { ReactNode } from "react";
import type { PageId } from "../../nav";

const NAV: { id: PageId; labelKey: string }[] = [
  { id: "overview", labelKey: "overview" },
  { id: "revenue", labelKey: "revenue" },
  { id: "stock", labelKey: "stock" },
  { id: "daily", labelKey: "dailyReport" },
  { id: "master", labelKey: "masterData" },
  { id: "audit", labelKey: "audit" },
];

type Props = {
  page: PageId;
  onNavigate: (p: PageId) => void;
  t: (k: string) => string;
  trailing?: ReactNode;
};

export function RadioBar({ page, onNavigate, t, trailing }: Props) {
  return (
    <nav className="desk-radio-bar" aria-label={t("navMain")}>
      <div className="desk-radio-items" role="radiogroup" aria-label={t("navMain")}>
        {NAV.map((item) => {
          const isActive = page === item.id;
          return (
            <label key={item.id} className={`desk-radio-item${isActive ? " active" : ""}`}>
              <input
                type="radio"
                name="dash-nav"
                checked={isActive}
                onChange={() => onNavigate(item.id)}
              />
              <span className="desk-radio-label">{t(item.labelKey)}</span>
            </label>
          );
        })}
      </div>
      {trailing ? <div className="desk-radio-trailing">{trailing}</div> : null}
    </nav>
  );
}
