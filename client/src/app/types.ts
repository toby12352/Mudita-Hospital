export type ConnState = "checking" | "ok" | "offline";
export type View = "home" | "settings" | "pharmacy" | "pharmacy_billing" | "opd" | "ot" | "reports";
export type PortalId = "opd" | "ot" | "pharmacy" | "settings";
export type NavSectionId =
  | "portals"
  | "opd"
  | "opd_maintenance"
  | "ot_bill"
  | "ot_history"
  | "ot_stock"
  | "pharmacy"
  | "stock"
  | "settings";
export type SettingsTab = "hospital" | "doctors" | "services" | "users" | "backup" | "training";
export type PharmacyTab = "items" | "movements";
export type OpdScreen = "doctors" | "services" | "bill";

/** Deep-link intent when opening a view from the sticky nav. */
export type NavIntent = {
  settingsTab?: SettingsTab;
  billingMode?: "list" | "edit";
  otMode?: "list" | "case" | "stock";
  pharmacyScreen?: "browse" | "form";
  opdScreen?: OpdScreen;
};
