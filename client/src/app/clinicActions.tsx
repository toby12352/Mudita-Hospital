import { createContext, useContext, type ReactNode } from "react";

export type ClinicActionFlags = {
  pharmacyCreate: boolean;
  pharmacyUpdate: boolean;
  /** Stock adjust. Follows pharmacy.update. */
  pharmacyAdjust: boolean;
  pharmacyDelete: boolean;
  opdCreate: boolean;
  opdUpdate: boolean;
  opdDelete: boolean;
  otCreate: boolean;
  otUpdate: boolean;
  otDelete: boolean;
  labCreate: boolean;
  labUpdate: boolean;
  labDelete: boolean;
  expenseCreate: boolean;
  expenseUpdate: boolean;
  expenseDelete: boolean;
  patientsCreate: boolean;
  patientsUpdate: boolean;
  /** Unused-chart delete. The server still requires Admin, so the grant does not show it. */
  patientsDelete: boolean;
  /** Hard-delete draft/void bills. Server requires Admin. */
  billPurge: boolean;
};

type ClinicActionInput = {
  fullAdmin: boolean;
  permissions: readonly string[] | null | undefined;
};

function allowGrant(input: ClinicActionInput, grant: string): boolean {
  if (input.fullAdmin) return true;
  return !!input.permissions?.includes(grant);
}

/** Full Admin sees every action. Other accounts follow /me grant keys. */
export function clinicActionFlags(input: ClinicActionInput): ClinicActionFlags {
  return {
    pharmacyCreate: allowGrant(input, "pharmacy.create"),
    pharmacyUpdate: allowGrant(input, "pharmacy.update"),
    pharmacyAdjust: allowGrant(input, "pharmacy.update"),
    pharmacyDelete: allowGrant(input, "pharmacy.delete"),
    opdCreate: allowGrant(input, "opd.create"),
    opdUpdate: allowGrant(input, "opd.update"),
    opdDelete: allowGrant(input, "opd.delete"),
    otCreate: allowGrant(input, "ot.create"),
    otUpdate: allowGrant(input, "ot.update"),
    otDelete: allowGrant(input, "ot.delete"),
    labCreate: allowGrant(input, "lab.create"),
    labUpdate: allowGrant(input, "lab.update"),
    labDelete: allowGrant(input, "lab.delete"),
    expenseCreate: allowGrant(input, "expense.create"),
    expenseUpdate: allowGrant(input, "expense.update"),
    expenseDelete: allowGrant(input, "expense.delete"),
    patientsCreate: allowGrant(input, "patients.create"),
    patientsUpdate: allowGrant(input, "patients.update"),
    patientsDelete: input.fullAdmin,
    billPurge: input.fullAdmin,
  };
}

const ClinicActionsContext = createContext<ClinicActionFlags | null>(null);

export function ClinicActionsProvider({
  value,
  children,
}: {
  value: ClinicActionFlags;
  children: ReactNode;
}) {
  return <ClinicActionsContext.Provider value={value}>{children}</ClinicActionsContext.Provider>;
}

export function useClinicActions(): ClinicActionFlags {
  return (
    useContext(ClinicActionsContext) ??
    clinicActionFlags({
      fullAdmin: false,
      permissions: [],
    })
  );
}

/** Footer hints for actions this account cannot use. */
export function shortcutVisible(view: string, key: string, actions: ClinicActionFlags): boolean {
  const deleteKey = key === "F8" || key === "^F8";
  if (view === "pharmacy") {
    if (key === "F5") return actions.pharmacyUpdate;
    if (key === "F8") return actions.pharmacyDelete;
    return true;
  }
  if (
    view === "pharmacy_billing" ||
    view === "pharmacy_return" ||
    view === "pharmacy_purchase" ||
    view === "pharmacy_transfer"
  ) {
    if (key === "F2" || key === "F5" || key === "F7") return actions.pharmacyCreate;
    if (deleteKey) return actions.pharmacyDelete;
    return true;
  }
  if (view === "opd") {
    if (key === "F2" || key === "F5" || key === "F7") return actions.opdCreate;
    if (deleteKey) return actions.opdDelete;
    return true;
  }
  if (view === "ot") {
    if (key === "F5") return actions.otCreate || actions.otUpdate;
    if (key === "F2" || key === "F7") return actions.otCreate;
    if (deleteKey) return actions.otDelete;
    return true;
  }
  if (view === "lab") {
    if (key === "F2" || key === "F5" || key === "F7") return actions.labCreate;
    if (deleteKey) return actions.labDelete;
    return true;
  }
  if (view === "expense") {
    if (key === "F2" || key === "F5" || key === "F7") return actions.expenseCreate;
    if (deleteKey) return actions.expenseDelete;
    return true;
  }
  return true;
}
