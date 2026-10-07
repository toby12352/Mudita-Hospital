import brandLogo from "../../assets/logo.png";
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
};

export function Sidebar({ page, onNavigate, t }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand brand-lockup">
        <img src={brandLogo} alt="" className="brand-logo" />
        <div>
          <p className="eyebrow">{t("brandSub")}</p>
          <h1>{t("brand")}</h1>
        </div>
      </div>
      <ul className="nav-list">
        {NAV.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`nav-item${page === item.id ? " active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              {t(item.labelKey)}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
