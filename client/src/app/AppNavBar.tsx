import { useState, type ReactNode } from "react";
import type { NavIntent, NavSectionId, PortalId, View } from "./types";

const SIDEBAR_KEY = "mudita_sidebar_expanded";

type NavAction =
  | { kind: "navigate"; view: View; intent?: NavIntent }
  | { kind: "back" };

type NavEntry = {
  id: NavSectionId;
  labelKey: string;
  enabled: boolean;
  action: NavAction;
};

function sectionForView(view: View, intent: NavIntent, fallback: NavSectionId): NavSectionId {
  if (view === "opd") {
    const screen = intent.opdScreen ?? "bill";
    if (screen === "doctors" || screen === "services") return "opd_maintenance";
    return "opd";
  }
  if (view === "ot") {
    const mode = intent.otMode ?? "case";
    if (mode === "stock") return "ot_stock";
    return "ot_bill";
  }
  if (view === "pharmacy_billing") return "pharmacy";
  if (view === "pharmacy_return") return "pharmacy_return";
  if (view === "pharmacy_transfer") return "pharmacy_transfer";
  if (view === "pharmacy") return "stock";
  if (view === "settings") return "settings";
  return fallback;
}

function entriesFor(portal: PortalId): NavEntry[] {
  if (portal === "opd") {
    return [
      {
        id: "opd",
        labelKey: "navOpd",
        enabled: true,
        action: {
          kind: "navigate",
          view: "opd",
          intent: { opdScreen: "bill", billingMode: "edit" },
        },
      },
      {
        id: "opd_maintenance",
        labelKey: "navMaintenance",
        enabled: true,
        action: {
          kind: "navigate",
          view: "opd",
          intent: { opdScreen: "doctors" },
        },
      },
    ];
  }
  if (portal === "ot") {
    return [
      {
        id: "ot_bill",
        labelKey: "navOtBill",
        enabled: true,
        action: { kind: "navigate", view: "ot", intent: { otMode: "case" } },
      },
      {
        id: "ot_stock",
        labelKey: "navOtCupboard",
        enabled: true,
        action: { kind: "navigate", view: "ot", intent: { otMode: "stock" } },
      },
    ];
  }
  if (portal === "pharmacy") {
    return [
      {
        id: "pharmacy",
        labelKey: "navSales",
        enabled: true,
        action: {
          kind: "navigate",
          view: "pharmacy_billing",
          intent: { billingMode: "edit" },
        },
      },
      {
        id: "pharmacy_return",
        labelKey: "navReturnIn",
        enabled: true,
        action: {
          kind: "navigate",
          view: "pharmacy_return",
          intent: { billingMode: "edit" },
        },
      },
      {
        id: "pharmacy_transfer",
        labelKey: "navTransferToOt",
        enabled: true,
        action: {
          kind: "navigate",
          view: "pharmacy_transfer",
          intent: { billingMode: "edit" },
        },
      },
      {
        id: "stock",
        labelKey: "navMaintenance",
        enabled: true,
        action: {
          kind: "navigate",
          view: "pharmacy",
          intent: { pharmacyScreen: "browse" },
        },
      },
    ];
  }
  return [
    {
      id: "settings",
      labelKey: "settings",
      enabled: true,
      action: { kind: "navigate", view: "settings", intent: { settingsTab: "hospital" } },
    },
  ];
}

function readExpanded(): boolean {
  return localStorage.getItem(SIDEBAR_KEY) === "1";
}

function writeExpanded(expanded: boolean) {
  localStorage.setItem(SIDEBAR_KEY, expanded ? "1" : "0");
}

export function AppNavBar({
  portal,
  showBack,
  view,
  navIntent,
  activeSection,
  onNavigate,
  onBack,
  t,
}: {
  portal: PortalId;
  showBack: boolean;
  view: View;
  navIntent: NavIntent;
  activeSection: NavSectionId;
  onNavigate: (view: View, intent: NavIntent | undefined, section: NavSectionId) => void;
  onBack: () => void;
  t: (k: string) => string;
}) {
  const [expanded, setExpanded] = useState(readExpanded);
  const currentSection = sectionForView(view, navIntent, activeSection);

  const entries: NavEntry[] = [];
  if (showBack) {
    entries.push({
      id: "portals",
      labelKey: "navBackToPortals",
      enabled: true,
      action: { kind: "back" },
    });
  }
  entries.push(...entriesFor(portal));

  function run(action: NavAction, section: NavSectionId) {
    if (action.kind === "navigate") onNavigate(action.view, action.intent ?? {}, section);
    else onBack();
  }

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      writeExpanded(next);
      return next;
    });
  }

  const toggleLabel = expanded ? t("navCollapse") : t("navExpand");

  return (
    <aside
      className={`desk-sidebar${expanded ? " desk-sidebar--expanded" : ""}`}
      aria-label={t("navMain")}
    >
      <nav className="desk-nav" aria-label={t("navMain")}>
        <ul className="desk-nav-list">
          {entries.map((entry) => {
            const isActive = entry.id === currentSection;
            const label = t(entry.labelKey);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className="desk-nav-btn"
                  aria-current={isActive ? "page" : undefined}
                  disabled={!entry.enabled}
                  title={expanded ? label : undefined}
                  onClick={() => {
                    if (entry.enabled) run(entry.action, entry.id);
                  }}
                >
                  <NavIcon id={entry.id} />
                  <span className="desk-nav-label">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        type="button"
        className="desk-nav-toggle"
        aria-expanded={expanded}
        aria-label={toggleLabel}
        title={expanded ? toggleLabel : undefined}
        onClick={toggleExpanded}
      >
        <ChevronIcon expanded={expanded} />
        <span className="desk-nav-label">{toggleLabel}</span>
      </button>
    </aside>
  );
}

function NavIcon({ id }: { id: NavSectionId }) {
  return (
    <svg
      className="desk-nav-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyphs[id]}
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className="desk-nav-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {expanded ? (
        <path d="M10 3.5 5.5 8 10 12.5" />
      ) : (
        <path d="M6 3.5 10.5 8 6 12.5" />
      )}
    </svg>
  );
}

const glyphs: Record<NavSectionId, ReactNode> = {
  portals: <path d="M7 3.5 3.5 8 7 12.5M3.75 8h8.75" />,
  opd: (
    <>
      <rect x="3.25" y="2.75" width="9.5" height="10.5" rx="1.25" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
    </>
  ),
  opd_maintenance: (
    <>
      <path d="M3 4.5h10M3 8h10M3 11.5h10" />
      <path d="M5.5 4.5v.01M5.5 8v.01M5.5 11.5v.01" />
    </>
  ),
  ot_bill: (
    <>
      <rect x="3.25" y="2.75" width="9.5" height="10.5" rx="1.25" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
    </>
  ),
  ot_stock: (
    <>
      <path d="M2.75 5.5 8 2.75l5.25 2.75L8 8.25 2.75 5.5Z" />
      <path d="M2.75 5.5v5L8 13.25l5.25-2.75v-5" />
      <path d="M8 8.25v5" />
    </>
  ),
  pharmacy: (
    <>
      <path d="M4 3.25h8v9.5H4z" />
      <path d="M6.5 6.25h3M8 4.75v3" />
    </>
  ),
  pharmacy_return: (
    <>
      <path d="M6.4 3.6 3.3 6.2 6.4 8.8" />
      <path d="M4.1 6.2h4.1a4 4 0 1 1 0 5.3" />
    </>
  ),
  pharmacy_transfer: (
    <>
      <path d="M2.75 5.5h7.5M7.5 3.25 10.25 5.5 7.5 7.75" />
      <path d="M13.25 10.5H5.75M8.5 8.25 5.75 10.5 8.5 12.75" />
    </>
  ),
  stock: (
    <>
      <path d="M3 4.5h10M3 8h10M3 11.5h10" />
      <path d="M5.5 4.5v.01M5.5 8v.01M5.5 11.5v.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 2.75v1.5M8 11.75v1.5M2.75 8h1.5M11.75 8h1.5M4.1 4.1l1.05 1.05M10.85 10.85l1.05 1.05M4.1 11.9l1.05-1.05M10.85 5.15l1.05-1.05" />
    </>
  ),
};
