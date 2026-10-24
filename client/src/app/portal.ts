import type { NavIntent, NavSectionId, PortalId, View } from "./types";

export type PortalLanding = {
  view: View;
  intent: NavIntent;
  section: NavSectionId;
};

/** Desk role lands in one portal. Admin chooses. Unknown roles get no portal. */
export function portalForRole(role: string): PortalId | "admin" | null {
  switch (role) {
    case "OPD":
      return "opd";
    case "OT":
      return "ot";
    case "Pharmacy":
      return "pharmacy";
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
    case "settings":
      return {
        view: "settings",
        intent: { settingsTab: "hospital" },
        section: "settings",
      };
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
        view === "pharmacy_transfer"
      );
    case "settings":
      return view === "settings";
  }
}
