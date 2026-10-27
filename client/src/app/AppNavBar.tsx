import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clinicModules, type ClinicModule } from "./portal";
import type { NavIntent, NavSectionId, PortalId, View } from "./types";

const SIDEBAR_KEY = "mudita_sidebar_expanded";

type NavAction =
  | { kind: "navigate"; view: View; intent?: NavIntent }
  | { kind: "toggle" };

type NavEntry = {
  id: NavSectionId;
  labelKey: string;
  enabled: boolean;
  action: NavAction;
  children?: NavEntry[];
};

function sectionForView(view: View, intent: NavIntent, fallback: NavSectionId): NavSectionId {
  if (view === "home") return "home";
  if (view === "about") return "about";
  if (view === "opd") {
    const screen = intent.opdScreen ?? "bill";
    if (screen === "doctors" || screen === "services") return "opd_maintenance";
    if (screen === "expense") return "opd_expense";
    return "opd";
  }
  if (view === "ot") {
    const mode = intent.otMode ?? "case";
    if (mode === "stock") return "ot_stock";
    if (mode === "expense") return "ot_expense";
    return "ot_bill";
  }
  if (view === "pharmacy_expense") return "pharmacy_expense";
  if (view === "ipd_expense") return "ipd_expense";
  if (view === "pharmacy_billing") return "pharmacy";
  if (view === "pharmacy_return") return "pharmacy_return";
  if (view === "pharmacy_transfer") return "pharmacy_transfer";
  if (view === "pharmacy") return "stock";
  if (view === "patients") return "patients";
  if (view === "ipd") return "ipd";
  if (view === "settings") return "settings";
  return fallback;
}

function entryContainsSection(entry: NavEntry, section: NavSectionId): boolean {
  if (entry.id === section) return true;
  return entry.children?.some((c) => entryContainsSection(c, section)) ?? false;
}

function openAncestorsOf(entries: NavEntry[], section: NavSectionId): Set<NavSectionId> {
  const open = new Set<NavSectionId>();
  function walk(nodes: NavEntry[], ancestors: NavSectionId[]): boolean {
    for (const node of nodes) {
      if (node.id === section) {
        for (const a of ancestors) open.add(a);
        return true;
      }
      if (node.children && walk(node.children, [...ancestors, node.id])) {
        return true;
      }
    }
    return false;
  }
  walk(entries, []);
  return open;
}

function opdEntries(): NavEntry[] {
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
      id: "opd_expense",
      labelKey: "navExpenseBill",
      enabled: true,
      action: { kind: "navigate", view: "opd", intent: { opdScreen: "expense" } },
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

function otEntries(): NavEntry[] {
  return [
    {
      id: "ot_bill",
      labelKey: "navOtBill",
      enabled: true,
      action: { kind: "navigate", view: "ot", intent: { otMode: "case" } },
    },
    {
      id: "ot_expense",
      labelKey: "navExpenseBill",
      enabled: true,
      action: { kind: "navigate", view: "ot", intent: { otMode: "expense" } },
    },
    {
      id: "ot_stock",
      labelKey: "navOtCupboard",
      enabled: true,
      action: { kind: "navigate", view: "ot", intent: { otMode: "stock" } },
    },
  ];
}

function patientsEntries(): NavEntry[] {
  return [
    {
      id: "patients",
      labelKey: "navPatients",
      enabled: true,
      action: { kind: "navigate", view: "patients", intent: {} },
    },
  ];
}

function ipdEntries(): NavEntry[] {
  return [
    {
      id: "ipd",
      labelKey: "navIpd",
      enabled: true,
      action: { kind: "navigate", view: "ipd", intent: {} },
    },
    {
      id: "ipd_expense",
      labelKey: "navExpenseBill",
      enabled: true,
      action: { kind: "navigate", view: "ipd_expense", intent: {} },
    },
  ];
}

function pharmacyEntries(): NavEntry[] {
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
      id: "pharmacy_expense",
      labelKey: "navExpenseBill",
      enabled: true,
      action: { kind: "navigate", view: "pharmacy_expense", intent: {} },
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

function entriesForDesk(portal: PortalId): NavEntry[] {
  if (portal === "opd") return opdEntries();
  if (portal === "ot") return otEntries();
  if (portal === "patients") return patientsEntries();
  if (portal === "ipd") return ipdEntries();
  if (portal === "pharmacy") return pharmacyEntries();
  return [
    {
      id: "settings",
      labelKey: "settings",
      enabled: true,
      action: { kind: "navigate", view: "settings", intent: { settingsTab: "hospital" } },
    },
  ];
}

function adminEntries(read: ReadonlySet<ClinicModule>, showSettings: boolean): NavEntry[] {
  const groups: {
    id: NavSectionId;
    module: ClinicModule;
    labelKey: string;
    children: () => NavEntry[];
  }[] = [
    { id: "admin_patients", module: "patients", labelKey: "patients", children: patientsEntries },
    { id: "admin_ipd", module: "ipd", labelKey: "ipd", children: ipdEntries },
    { id: "admin_opd", module: "opd", labelKey: "opd", children: opdEntries },
    { id: "admin_ot", module: "ot", labelKey: "ot", children: otEntries },
    { id: "admin_pharmacy", module: "pharmacy", labelKey: "pharmacy", children: pharmacyEntries },
  ];
  const entries: NavEntry[] = [
    {
      id: "home",
      labelKey: "navHome",
      enabled: true,
      action: { kind: "navigate", view: "home", intent: {} },
    },
  ];
  for (const group of groups) {
    if (!read.has(group.module)) continue;
    entries.push({
      id: group.id,
      labelKey: group.labelKey,
      enabled: true,
      action: { kind: "toggle" },
      children: group.children(),
    });
  }
  if (showSettings) {
    entries.push({
      id: "settings",
      labelKey: "settings",
      enabled: true,
      action: { kind: "navigate", view: "settings", intent: { settingsTab: "hospital" } },
    });
  }
  entries.push({
    id: "about",
    labelKey: "navAbout",
    enabled: true,
    action: { kind: "navigate", view: "about", intent: {} },
  });
  return entries;
}

function readExpanded(): boolean {
  return localStorage.getItem(SIDEBAR_KEY) === "1";
}

function writeExpanded(expanded: boolean) {
  localStorage.setItem(SIDEBAR_KEY, expanded ? "1" : "0");
}

export function AppNavBar({
  mode,
  portal,
  view,
  navIntent,
  activeSection,
  onNavigate,
  t,
  readModules,
  showSettings,
}: {
  mode: "admin" | "desk";
  portal: PortalId | null;
  view: View;
  navIntent: NavIntent;
  activeSection: NavSectionId;
  onNavigate: (view: View, intent: NavIntent | undefined, section: NavSectionId) => void;
  t: (k: string) => string;
  /** Shared-layout modules with Read. Desk mode ignores this and keeps its rail. */
  readModules?: readonly ClinicModule[];
  /** Settings and user management. Full Admin only. */
  showSettings?: boolean;
}) {
  const [expanded, setExpanded] = useState(readExpanded);
  const [openIds, setOpenIds] = useState<Set<NavSectionId>>(() => new Set());
  const navRef = useRef<HTMLElement | null>(null);
  const currentSection = sectionForView(view, navIntent, activeSection);

  const readKey = (readModules ?? clinicModules).join("\0");
  const entries = useMemo(() => {
    if (mode !== "admin") return portal ? entriesForDesk(portal) : [];
    const modules = (readKey.length === 0 ? [] : readKey.split("\0")) as ClinicModule[];
    return adminEntries(new Set(modules), showSettings ?? true);
  }, [mode, portal, readKey, showSettings]);

  useEffect(() => {
    const ancestors = openAncestorsOf(entries, currentSection);
    if (ancestors.size === 0) return;
    setOpenIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestors) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentSection, entries]);

  useEffect(() => {
    if (openIds.size === 0) return;

    function onPointerDown(e: PointerEvent) {
      const el = navRef.current;
      if (el && !el.contains(e.target as Node)) {
        // Collapsed flyouts close fully; expanded rail keeps the path to the active page.
        if (!expanded) {
          setOpenIds(new Set());
        } else {
          setOpenIds(openAncestorsOf(entries, currentSection));
        }
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!expanded) setOpenIds(new Set());
        else setOpenIds(openAncestorsOf(entries, currentSection));
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openIds, expanded, entries, currentSection]);

  function run(action: NavAction, section: NavSectionId) {
    if (action.kind === "navigate") onNavigate(action.view, action.intent ?? {}, section);
  }

  function toggleGroup(id: NavSectionId, siblings: NavEntry[]) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      for (const sib of siblings) {
        if (sib.children && sib.children.length > 0) next.delete(sib.id);
      }
      next.add(id);
      return next;
    });
  }

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      writeExpanded(next);
      return next;
    });
  }

  const toggleLabel = expanded ? t("navCollapse") : t("navExpand");

  function renderEntries(nodes: NavEntry[], depth: number, siblings: NavEntry[]): ReactNode {
    return nodes.map((entry) => {
      const children = entry.children;
      const hasChildren = Boolean(children && children.length > 0);
      const childActive = children?.some((c) => entryContainsSection(c, currentSection)) ?? false;
      const isActive = entry.id === currentSection;
      const submenuOpen = openIds.has(entry.id);
      const label = t(entry.labelKey);

      if (!hasChildren || !children) {
        return (
          <li key={entry.id}>
            <button
              type="button"
              className={`desk-nav-btn${depth > 0 ? " desk-nav-btn--child" : ""}${
                depth > 1 ? " desk-nav-btn--grandchild" : ""
              }`}
              aria-current={isActive ? "page" : undefined}
              disabled={!entry.enabled}
              title={expanded ? label : undefined}
              onClick={() => {
                if (!entry.enabled) return;
                if (depth === 0) setOpenIds(new Set());
                run(entry.action, entry.id);
              }}
            >
              <NavIcon id={entry.id} />
              <span className="desk-nav-label">{label}</span>
            </button>
          </li>
        );
      }

      return (
        <li
          key={entry.id}
          className={`desk-nav-group${submenuOpen ? " desk-nav-group--open" : ""}${
            childActive ? " desk-nav-group--child-active" : ""
          }${depth > 0 ? " desk-nav-group--nested" : ""}`}
        >
          <button
            type="button"
            className={`desk-nav-btn desk-nav-btn--parent${depth > 0 ? " desk-nav-btn--child" : ""}`}
            aria-current={isActive && entry.action.kind !== "toggle" ? "page" : undefined}
            aria-expanded={submenuOpen}
            aria-controls={`desk-nav-sub-${entry.id}`}
            disabled={!entry.enabled}
            title={expanded && !submenuOpen ? label : undefined}
            onClick={() => {
              if (!entry.enabled) return;
              toggleGroup(entry.id, siblings);
              if (entry.action.kind === "navigate") {
                run(entry.action, entry.id);
              }
            }}
          >
            <NavIcon id={entry.id} />
            <span className="desk-nav-label">{label}</span>
            <span className="desk-nav-chevron" aria-hidden="true">
              <SubmenuChevron open={submenuOpen} />
            </span>
          </button>
          <div
            id={`desk-nav-sub-${entry.id}`}
            className="desk-nav-submenu"
            role="group"
            aria-label={label}
            aria-hidden={!submenuOpen}
            inert={submenuOpen ? undefined : true}
          >
            <div className="desk-nav-submenu-inner">
              <ul className="desk-nav-sublist">{renderEntries(children, depth + 1, children)}</ul>
            </div>
          </div>
        </li>
      );
    });
  }

  return (
    <aside
      className={`desk-sidebar${expanded ? " desk-sidebar--expanded" : ""}`}
      aria-label={t("navMain")}
    >
      <nav ref={navRef} className="desk-nav" aria-label={t("navMain")}>
        <ul className="desk-nav-list">{renderEntries(entries, 0, entries)}</ul>
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

function SubmenuChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`desk-nav-chevron-svg${open ? " desk-nav-chevron-svg--open" : ""}`}
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function expenseGlyph(): ReactNode {
  return (
    <>
      <path d="M4 3.25h6.15l2.6 2.6V12.75H4z" />
      <path d="M10.15 3.25v2.6h2.6" />
      <path d="M6.15 8.75h3.7" />
    </>
  );
}

const glyphs: Record<NavSectionId, ReactNode> = {
  portals: <path d="M7 3.5 3.5 8 7 12.5M3.75 8h8.75" />,
  home: (
    <>
      <path d="M2.75 7.25 8 2.75l5.25 4.5" />
      <path d="M4.25 6.5v6.75h7.5V6.5" />
    </>
  ),
  about: (
    <>
      <circle cx="8" cy="8" r="5.25" />
      <path d="M8 7.25v3.5M8 5.25v.01" />
    </>
  ),
  admin_patients: (
    <>
      <circle cx="8" cy="5.25" r="1.75" />
      <path d="M4.75 12.25c.55-1.9 1.9-2.85 3.25-2.85s2.7.95 3.25 2.85" />
    </>
  ),
  admin_ipd: (
    <>
      <path d="M3 11.25h10.5M3.5 11.25V8.75h9.5v2.5" />
      <path d="M4.25 8.75V6.5h3.25V8.75" />
    </>
  ),
  admin_opd: (
    <>
      <rect x="3.25" y="2.75" width="9.5" height="10.5" rx="1.25" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
    </>
  ),
  admin_ot: (
    <>
      <circle cx="8" cy="8" r="5.25" />
      <path d="M8 5.5v5M5.5 8h5" />
    </>
  ),
  admin_pharmacy: (
    <>
      <path d="M4 3.25h8v9.5H4z" />
      <path d="M6.5 6.25h3M8 4.75v3" />
    </>
  ),
  opd: (
    <>
      <rect x="3.25" y="2.75" width="9.5" height="10.5" rx="1.25" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
    </>
  ),
  opd_expense: expenseGlyph(),
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
  ot_expense: expenseGlyph(),
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
  pharmacy_expense: expenseGlyph(),
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
  patients: (
    <>
      <circle cx="8" cy="5.25" r="1.75" />
      <path d="M4.75 12.25c.55-1.9 1.9-2.85 3.25-2.85s2.7.95 3.25 2.85" />
    </>
  ),
  ipd: (
    <>
      <path d="M3 11.25h10.5M3.5 11.25V8.75h9.5v2.5" />
      <path d="M4.25 8.75V6.5h3.25V8.75" />
    </>
  ),
  ipd_expense: expenseGlyph(),
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
