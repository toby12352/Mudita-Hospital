import type { NavIntent, NavSectionId, PortalId, View } from "./types";

type NavAction =
  | { kind: "navigate"; view: View; intent?: NavIntent }
  | { kind: "back" };

type RadioEntry = {
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
    if (mode === "list") return "ot_history";
    if (mode === "stock") return "ot_stock";
    return "ot_bill";
  }
  if (view === "pharmacy_billing") return "pharmacy";
  if (view === "pharmacy") return "stock";
  if (view === "settings") return "settings";
  return fallback;
}

function entriesFor(portal: PortalId): RadioEntry[] {
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
        id: "ot_history",
        labelKey: "navOtHistory",
        enabled: true,
        action: { kind: "navigate", view: "ot", intent: { otMode: "list" } },
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
  const currentSection = sectionForView(view, navIntent, activeSection);

  const entries: RadioEntry[] = [];
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

  return (
    <nav className="desk-radio-bar" aria-label={t("navMain")}>
      <div className="desk-radio-items" role="radiogroup" aria-label={t("navMain")}>
        {entries.map((entry) => {
          const isActive = entry.id === currentSection;
          return (
            <label
              key={entry.id}
              className={`desk-radio-item${isActive ? " active" : ""}`}
            >
              <input
                type="radio"
                name={`desk-nav-${portal}`}
                checked={isActive}
                disabled={!entry.enabled}
                onChange={() => {
                  if (entry.enabled) run(entry.action, entry.id);
                }}
              />
              <span className="desk-radio-label">{t(entry.labelKey)}</span>
            </label>
          );
        })}
      </div>
    </nav>
  );
}
