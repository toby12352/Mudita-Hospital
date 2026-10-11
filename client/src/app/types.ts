export type ConnState = "checking" | "ok" | "offline";
export type View = "home" | "settings" | "pharmacy" | "pharmacy_billing" | "opd" | "ot" | "reports";
export type SettingsTab = "hospital" | "doctors" | "services" | "users" | "backup" | "training";
export type PharmacyTab = "items" | "movements";

/** Deep-link intent when opening a view from the sticky nav. */
export type NavIntent = {
  settingsTab?: SettingsTab;
  billingMode?: "list" | "edit";
  otMode?: "list" | "case";
  pharmacyScreen?: "browse" | "form";
};
