import { createContext, useContext, type ReactNode } from "react";

export type ClinicActionFlags = {
  pharmacyCreate: boolean;
  pharmacyUpdate: boolean;
  /** Stock adjust. Portal Pharmacy stays hidden; unified uses pharmacy.update. */
  pharmacyAdjust: boolean;
  pharmacyDelete: boolean;
  opdCreate: boolean;
  opdUpdate: boolean;
  opdDelete: boolean;
  otCreate: boolean;
  otUpdate: boolean;
  otDelete: boolean;
  patientsCreate: boolean;
  patientsUpdate: boolean;
  /** Unused-chart delete. The server still requires Admin, so the grant does not show it. */
  patientsDelete: boolean;
  /** Hard-delete draft/void bills. Server requires Admin. */
  billPurge: boolean;
};

type ClinicActionInput = {
  fullAdmin: boolean;
  accessMode?: "portal" | "unified";
  permissions: readonly string[] | null | undefined;
};

function allowGrant(input: ClinicActionInput, grant: string, portalDefault: boolean): boolean {
  if (input.fullAdmin) return true;
  if (input.accessMode === "unified") return !!input.permissions?.includes(grant);
  return portalDefault;
}

/** Full Admin sees every action. Unified follows /me grant keys. Portal keeps today's desk. */
export function clinicActionFlags(input: ClinicActionInput): ClinicActionFlags {
  return {
    pharmacyCreate: allowGrant(input, "pharmacy.create", true),
    pharmacyUpdate: allowGrant(input, "pharmacy.update", true),
    pharmacyAdjust: allowGrant(input, "pharmacy.update", false),
    pharmacyDelete: allowGrant(input, "pharmacy.delete", true),
    opdCreate: allowGrant(input, "opd.create", true),
    opdUpdate: allowGrant(input, "opd.update", true),
    opdDelete: allowGrant(input, "opd.delete", true),
    otCreate: allowGrant(input, "ot.create", true),
    otUpdate: allowGrant(input, "ot.update", true),
    otDelete: allowGrant(input, "ot.delete", true),
    patientsCreate: allowGrant(input, "patients.create", true),
    patientsUpdate: allowGrant(input, "patients.update", true),
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
      accessMode: "portal",
      permissions: [],
    })
  );
}

/** Footer hints for actions this account cannot use. */
export function shortcutVisible(view: string, key: string, actions: ClinicActionFlags): boolean {
  if (view.endsWith("_expense")) return true;
  const deleteKey = key === "F8" || key === "^F8";
  if (view === "pharmacy") {
    if (key === "F5") return actions.pharmacyUpdate;
    if (key === "F8") return actions.pharmacyDelete;
    return true;
  }
  if (view === "pharmacy_billing" || view === "pharmacy_return" || view === "pharmacy_transfer") {
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
  return true;
}
