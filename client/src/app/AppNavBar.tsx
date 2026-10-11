import { useEffect, useRef, useState } from "react";
import type { NavIntent, View } from "./types";

export type NavSectionId =
  | "home"
  | "registration"
  | "opd"
  | "ot"
  | "pharmacy"
  | "maintenance"
  | "settings";

type NavAction =
  | { kind: "navigate"; view: View; intent?: NavIntent }
  | { kind: "help" }
  | { kind: "logout" };

type MenuItem = {
  id: string;
  labelKey: string;
  action: NavAction;
  enabled: boolean;
};

type NavEntry = {
  id: NavSectionId;
  labelKey: string;
  enabled: boolean;
  /** Direct click destination (Home, or section default e.g. create-bill). */
  action?: NavAction;
  items?: MenuItem[];
};

function sectionForView(view: View, fallback: NavSectionId): NavSectionId {
  if (view === "home") return "home";
  if (view === "opd") return "opd";
  if (view === "ot") return "ot";
  if (view === "pharmacy_billing") return "pharmacy";
  if (view === "pharmacy") {
    if (fallback === "registration" || fallback === "maintenance") return fallback;
    return "maintenance";
  }
  if (view === "settings") {
    if (fallback === "registration" || fallback === "maintenance" || fallback === "settings") {
      return fallback;
    }
    return "settings";
  }
  return fallback;
}

function menuItemActive(
  item: MenuItem,
  view: View,
  intent: NavIntent,
  sectionActive: boolean,
): boolean {
  if (!sectionActive || item.action.kind !== "navigate") return false;
  const a = item.action;
  if (a.view !== view) return false;
  if (view === "settings") {
    return (a.intent?.settingsTab ?? "hospital") === (intent.settingsTab ?? "hospital");
  }
  if (view === "pharmacy") {
    return (a.intent?.pharmacyScreen ?? "browse") === (intent.pharmacyScreen ?? "browse");
  }
  if (view === "opd" || view === "pharmacy_billing") {
    return (a.intent?.billingMode ?? "list") === (intent.billingMode ?? "list");
  }
  if (view === "ot") {
    return (a.intent?.otMode ?? "list") === (intent.otMode ?? "list");
  }
  return true;
}

export function AppNavBar({
  view,
  navIntent,
  activeSection,
  canSettings,
  canPharmacy,
  canOPD,
  canOT,
  onNavigate,
  onHelp,
  onLogout,
  t,
}: {
  view: View;
  navIntent: NavIntent;
  activeSection: NavSectionId;
  canSettings: boolean;
  canPharmacy: boolean;
  canOPD: boolean;
  canOT: boolean;
  onNavigate: (view: View, intent: NavIntent | undefined, section: NavSectionId) => void;
  onHelp: () => void;
  onLogout: () => void;
  t: (k: string) => string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const currentSection = sectionForView(view, activeSection);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenId(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenId(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const entries: NavEntry[] = [
    {
      id: "home",
      labelKey: "home",
      enabled: true,
      action: { kind: "navigate", view: "home" },
    },
    {
      id: "registration",
      labelKey: "navRegistration",
      enabled: canSettings || canPharmacy,
      items: [
        {
          id: "reg-doctor",
          labelKey: "navDoctorRegistration",
          enabled: canSettings,
          action: { kind: "navigate", view: "settings", intent: { settingsTab: "doctors" } },
        },
        {
          id: "reg-opd-svc",
          labelKey: "navOpdServiceRegistration",
          enabled: canSettings,
          action: { kind: "navigate", view: "settings", intent: { settingsTab: "services" } },
        },
        {
          id: "reg-ot-svc",
          labelKey: "navOtServiceRegistration",
          enabled: canSettings,
          action: { kind: "navigate", view: "settings", intent: { settingsTab: "services" } },
        },
        {
          id: "reg-pharm",
          labelKey: "navPharmacyStockRegistration",
          enabled: canPharmacy,
          action: {
            kind: "navigate",
            view: "pharmacy",
            intent: { pharmacyScreen: "form" },
          },
        },
      ],
    },
    {
      id: "opd",
      labelKey: "opd",
      enabled: canOPD,
      action: { kind: "navigate", view: "opd", intent: { billingMode: "edit" } },
      items: [
        {
          id: "opd-new",
          labelKey: "navCreateNewBill",
          enabled: canOPD,
          action: { kind: "navigate", view: "opd", intent: { billingMode: "edit" } },
        },
        {
          id: "opd-hist",
          labelKey: "navCheckHistory",
          enabled: canOPD,
          action: { kind: "navigate", view: "opd", intent: { billingMode: "list" } },
        },
      ],
    },
    {
      id: "ot",
      labelKey: "ot",
      enabled: canOT,
      action: { kind: "navigate", view: "ot", intent: { otMode: "case" } },
      items: [
        {
          id: "ot-new",
          labelKey: "navCreateNewBill",
          enabled: canOT,
          action: { kind: "navigate", view: "ot", intent: { otMode: "case" } },
        },
        {
          id: "ot-hist",
          labelKey: "navCheckHistory",
          enabled: canOT,
          action: { kind: "navigate", view: "ot", intent: { otMode: "list" } },
        },
      ],
    },
    {
      id: "pharmacy",
      labelKey: "pharmacy",
      enabled: canPharmacy,
      action: {
        kind: "navigate",
        view: "pharmacy_billing",
        intent: { billingMode: "edit" },
      },
      items: [
        {
          id: "pharm-new",
          labelKey: "navCreateNewBill",
          enabled: canPharmacy,
          action: {
            kind: "navigate",
            view: "pharmacy_billing",
            intent: { billingMode: "edit" },
          },
        },
        {
          id: "pharm-hist",
          labelKey: "navCheckHistory",
          enabled: canPharmacy,
          action: {
            kind: "navigate",
            view: "pharmacy_billing",
            intent: { billingMode: "list" },
          },
        },
      ],
    },
    {
      id: "maintenance",
      labelKey: "navMaintenance",
      enabled: canSettings || canPharmacy,
      items: [
        {
          id: "mnt-pharm",
          labelKey: "navEditPharmacyStock",
          enabled: canPharmacy,
          action: {
            kind: "navigate",
            view: "pharmacy",
            intent: { pharmacyScreen: "browse" },
          },
        },
        {
          id: "mnt-svc",
          labelKey: "navEditServicePrice",
          enabled: canSettings,
          action: { kind: "navigate", view: "settings", intent: { settingsTab: "services" } },
        },
        {
          id: "mnt-doc",
          labelKey: "navEditDoctor",
          enabled: canSettings,
          action: { kind: "navigate", view: "settings", intent: { settingsTab: "doctors" } },
        },
      ],
    },
    {
      id: "settings",
      labelKey: "settings",
      enabled: true,
      action: canSettings
        ? {
            kind: "navigate",
            view: "settings",
            intent: { settingsTab: "hospital" },
          }
        : undefined,
      items: [
        {
          id: "set-hospital",
          labelKey: "navHospitalSettings",
          enabled: canSettings,
          action: {
            kind: "navigate",
            view: "settings",
            intent: { settingsTab: "hospital" },
          },
        },
        {
          id: "set-help",
          labelKey: "help",
          enabled: true,
          action: { kind: "help" },
        },
        {
          id: "set-logout",
          labelKey: "logOut",
          enabled: true,
          action: { kind: "logout" },
        },
      ],
    },
  ];

  function run(action: NavAction, section: NavSectionId) {
    setOpenId(null);
    if (action.kind === "navigate") onNavigate(action.view, action.intent, section);
    else if (action.kind === "help") onHelp();
    else onLogout();
  }

  return (
    <nav className="app-nav" aria-label={t("navMain")} ref={rootRef}>
      {entries.map((entry) => {
        const isOpen = openId === entry.id;
        const hasMenu = !!entry.items?.length;
        const isActive = entry.id === currentSection;
        return (
          <div
            key={entry.id}
            className={`app-nav-item${isOpen ? " open" : ""}${isActive ? " active" : ""}`}
            onMouseEnter={() => {
              if (hasMenu && entry.enabled) setOpenId(entry.id);
            }}
            onMouseLeave={(e) => {
              setOpenId(null);
              const active = document.activeElement;
              if (active instanceof HTMLElement && e.currentTarget.contains(active)) {
                active.blur();
              }
            }}
            onFocus={() => {
              if (hasMenu && entry.enabled) setOpenId(entry.id);
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setOpenId(null);
              }
            }}
          >
            <button
              type="button"
              className={`app-nav-btn${isActive ? " active" : ""}`}
              disabled={!entry.enabled}
              aria-current={isActive ? "page" : undefined}
              aria-haspopup={hasMenu ? "menu" : undefined}
              aria-expanded={hasMenu ? isOpen : undefined}
              onClick={() => {
                if (!entry.enabled) return;
                if (entry.action) {
                  run(entry.action, entry.id);
                  return;
                }
                if (hasMenu) setOpenId(isOpen ? null : entry.id);
              }}
            >
              {t(entry.labelKey)}
            </button>
            {hasMenu ? (
              <ul className="app-nav-menu" role="menu">
                {entry.items!.map((item) => {
                  const itemActive = menuItemActive(item, view, navIntent, isActive);
                  return (
                    <li key={item.id} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className={itemActive ? "active" : undefined}
                        aria-current={itemActive ? "page" : undefined}
                        disabled={!item.enabled}
                        onClick={() => {
                          if (item.enabled) run(item.action, entry.id);
                        }}
                      >
                        {t(item.labelKey)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
