export type ConnState = "checking" | "ok" | "offline";
export type View =
  | "home"
  | "about"
  | "settings"
  | "pharmacy"
  | "pharmacy_billing"
  | "pharmacy_return"
  | "pharmacy_purchase"
  | "pharmacy_transfer"
  | "pharmacy_expense"
  | "opd"
  | "lab"
  | "ot"
  | "patients"
  | "ipd"
  | "ipd_bill"
  | "ipd_expense"
  | "reports";
export type PortalId = "opd" | "ot" | "pharmacy" | "patients" | "ipd" | "settings" | "lab";
export type NavSectionId =
  | "portals"
  | "home"
  | "about"
  | "admin_patients"
  | "admin_ipd"
  | "admin_opd"
  | "admin_ot"
  | "admin_pharmacy"
  | "admin_lab"
  | "opd"
  | "opd_expense"
  | "opd_maintenance"
  | "lab"
  | "lab_maintenance"
  | "ot_bill"
  | "ot_expense"
  | "ot_stock"
  | "pharmacy"
  | "pharmacy_expense"
  | "pharmacy_return"
  | "pharmacy_purchase"
  | "pharmacy_transfer"
  | "patients"
  | "patients_create"
  | "ipd"
  | "ipd_bill"
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
export type PatientsScreen = "list" | "create";

/** Deep-link intent when opening a view from the sticky nav. */
export type NavIntent = {
  settingsTab?: SettingsTab;
  billingMode?: "list" | "edit";
  otMode?: "case" | "stock" | "expense";
  pharmacyScreen?: PharmacyScreen;
  opdScreen?: OpdScreen;
  labScreen?: "bill" | "services";
  patientsScreen?: PatientsScreen;
  patientsFocusId?: number;
};
