import type { ReactNode } from "react";
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
    <aside className="dash-sidebar">
      <div className="dash-sidebar-logo">
        <img src={brandLogo} alt={t("brand")} />
      </div>
      <nav aria-label={t("navMain")}>
        <ul className="dash-nav">
          {NAV.map((item) => {
            const active = page === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="dash-nav-item"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <NavIcon id={item.id} />
                  <span>{t(item.labelKey)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function NavIcon({ id }: { id: PageId }) {
  return (
    <svg
      className="dash-nav-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyphs[id]}
    </svg>
  );
}

const glyphs: Record<PageId, ReactNode> = {
  overview: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
    </>
  ),
  revenue: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15v-3" />
      <path d="M12 15V8" />
      <path d="M16 15v-5" />
    </>
  ),
  stock: (
    <>
      <path d="M3.5 8 12 4l8.5 4L12 12 3.5 8Z" />
      <path d="M3.5 8v8L12 20l8.5-4V8" />
      <path d="M12 12v8" />
    </>
  ),
  daily: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <path d="M4 9.5h16" />
    </>
  ),
  master: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
      <path d="M8 7v.01" />
      <path d="M8 12v.01" />
      <path d="M8 17v.01" />
    </>
  ),
  audit: (
    <>
      <path d="M8 4h8l2 2v14H6V4h2Z" />
      <path d="M9 11h6" />
      <path d="M9 15h6" />
    </>
  ),
};
