import type { NavIntent, NavSectionId, PortalId, View } from "./types";

export type PortalLanding = {
  view: View;
  intent: NavIntent;
  section: NavSectionId;
};

/** Desk role lands in one portal. Admin uses the full sidebar. Unknown roles get no portal. */
export function portalForRole(role: string): PortalId | "admin" | null {
  switch (role) {
    case "OPD":
      return "opd";
    case "OT":
      return "ot";
    case "Pharmacy":
      return "pharmacy";
    case "Patients":
      return "patients";
    case "IPD":
      return "ipd";
    case "Admin":
      return "admin";
    default:
      return null;
  }
}

export function landingFor(portal: PortalId): PortalLanding {
  switch (portal) {
    case "opd":
      return {
        view: "opd",
        intent: { opdScreen: "bill", billingMode: "edit" },
        section: "opd",
      };
    case "ot":
      return { view: "ot", intent: { otMode: "case" }, section: "ot_bill" };
    case "pharmacy":
      return {
        view: "pharmacy_billing",
        intent: { billingMode: "edit" },
        section: "pharmacy",
      };
    case "patients":
      return { view: "patients", intent: { patientsScreen: "list" }, section: "patients" };
    case "ipd":
      return { view: "ipd", intent: {}, section: "ipd" };
    case "settings":
      return {
        view: "settings",
        intent: { settingsTab: "hospital" },
        section: "settings",
      };
  }
}

export function adminLanding(): PortalLanding {
  return { view: "home", intent: {}, section: "home" };
}

/** Which desk portal owns a view — used so admin page gates still match. */
export function portalForView(view: View): PortalId | null {
  switch (view) {
    case "opd":
      return "opd";
    case "ot":
      return "ot";
    case "pharmacy":
    case "pharmacy_billing":
    case "pharmacy_return":
    case "pharmacy_transfer":
    case "pharmacy_expense":
      return "pharmacy";
    case "patients":
      return "patients";
    case "ipd":
    case "ipd_expense":
      return "ipd";
    case "settings":
      return "settings";
    default:
      return null;
  }
}

export function viewInPortal(view: View, portal: PortalId): boolean {
  switch (portal) {
    case "opd":
      return view === "opd";
    case "ot":
      return view === "ot";
    case "pharmacy":
      return (
        view === "pharmacy" ||
        view === "pharmacy_billing" ||
        view === "pharmacy_return" ||
        view === "pharmacy_transfer" ||
        view === "pharmacy_expense"
      );
    case "patients":
      return view === "patients";
    case "ipd":
      return view === "ipd" || view === "ipd_expense";
    case "settings":
      return view === "settings";
  }
}

export function titleKeyForAdmin(view: View, portal: PortalId | null): string {
  if (view === "home") return "navHome";
  if (view === "about") return "navAbout";
  if (portal) return portal;
  return "navHome";
}

/** Clinic modules in sidebar order. Settings is not a module. */
export const clinicModules = ["patients", "ipd", "opd", "ot", "pharmacy"] as const;
export type ClinicModule = (typeof clinicModules)[number];

const moduleReadKey: Record<ClinicModule, string> = {
  patients: "patients.read",
  ipd: "ipd.read",
  opd: "opd.read",
  ot: "ot.read",
  pharmacy: "pharmacy.read",
};

/** Modules this account may open. Full Admin sees every module. Unified uses Read keys only. */
export function readableClinicModules(
  permissions: readonly string[] | null | undefined,
  fullAdmin: boolean,
): ClinicModule[] {
  if (fullAdmin) return [...clinicModules];
  const granted = new Set(permissions ?? []);
  return clinicModules.filter((module) => granted.has(moduleReadKey[module]));
}

export function moduleForView(view: View): ClinicModule | null {
  switch (view) {
    case "patients":
      return "patients";
    case "ipd":
    case "ipd_expense":
      return "ipd";
    case "opd":
      return "opd";
    case "ot":
      return "ot";
    case "pharmacy":
    case "pharmacy_billing":
    case "pharmacy_return":
    case "pharmacy_transfer":
    case "pharmacy_expense":
      return "pharmacy";
    default:
      return null;
  }
}

/** Home and About stay on the shared layout. Settings is full Admin only. */
export function sharedViewAllowed(
  view: View,
  readable: readonly ClinicModule[],
  fullAdmin: boolean,
): boolean {
  if (view === "home" || view === "about") return true;
  if (view === "settings") return fullAdmin;
  const module = moduleForView(view);
  return module != null && readable.includes(module);
}

/** First sidebar module this account can Read. No module lands on Home, never Settings. */
export function firstReadableLanding(readable: readonly ClinicModule[]): PortalLanding {
  for (const module of clinicModules) {
    if (readable.includes(module)) return landingFor(module);
  }
  return adminLanding();
}

export function resolveShownView(opts: {
  sharedLayout: boolean;
  fullAdmin: boolean;
  desk: PortalId | null;
  view: View;
  intent: NavIntent;
  section: NavSectionId;
  readable: readonly ClinicModule[];
}): { view: View; intent: NavIntent; section: NavSectionId; portal: PortalId | null } {
  if (opts.sharedLayout) {
    if (sharedViewAllowed(opts.view, opts.readable, opts.fullAdmin)) {
      return {
        view: opts.view,
        intent: opts.intent,
        section: opts.section,
        portal: portalForView(opts.view),
      };
    }
    const landing = firstReadableLanding(opts.readable);
    return {
      view: landing.view,
      intent: landing.intent,
      section: landing.section,
      portal: portalForView(landing.view),
    };
  }
  const desk = opts.desk;
  if (!desk) {
    return { view: "home", intent: {}, section: "home", portal: null };
  }
  if (viewInPortal(opts.view, desk)) {
    return {
      view: opts.view,
      intent: opts.intent,
      section: opts.section,
      portal: desk,
    };
  }
  const landing = landingFor(desk);
  return {
    view: landing.view,
    intent: landing.intent,
    section: landing.section,
    portal: desk,
  };
}
