export type ConnState = "checking" | "ok" | "offline";
export type View =
  | "home"
  | "about"
  | "settings"
  | "pharmacy"
  | "pharmacy_billing"
  | "pharmacy_return"
  | "pharmacy_transfer"
  | "pharmacy_expense"
  | "opd"
  | "ot"
  | "patients"
  | "ipd"
  | "ipd_expense"
  | "reports";
export type PortalId = "opd" | "ot" | "pharmacy" | "patients" | "ipd" | "settings";
export type NavSectionId =
  | "portals"
  | "home"
  | "about"
  | "admin_patients"
  | "admin_ipd"
  | "admin_opd"
  | "admin_ot"
  | "admin_pharmacy"
  | "opd"
  | "opd_expense"
  | "opd_maintenance"
  | "ot_bill"
  | "ot_expense"
  | "ot_stock"
  | "pharmacy"
  | "pharmacy_expense"
  | "pharmacy_return"
  | "pharmacy_transfer"
  | "patients"
  | "ipd"
  | "ipd_expense"
  | "stock"
  | "settings";
export type SettingsTab =
  | "hospital"
  | "doctors"
  | "categories"
  | "expenses"
  | "users"
  | "backup"
  | "training";
export type PharmacyTab = "items" | "movements";
export type OpdScreen = "doctors" | "services" | "bill" | "expense";
export type PharmacyScreen = "browse" | "form" | "history";

/** Deep-link intent when opening a view from the sticky nav. */
export type NavIntent = {
  settingsTab?: SettingsTab;
  billingMode?: "list" | "edit";
  otMode?: "case" | "stock" | "expense";
  pharmacyScreen?: PharmacyScreen;
  opdScreen?: OpdScreen;
};
