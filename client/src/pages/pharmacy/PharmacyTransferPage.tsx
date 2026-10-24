import { PharmacyBillingPage } from "@/pages/pharmacy/PharmacyBillingPage";

/** Pharmacy transfer desk: same cart as sales. Confirm moves MAIN qty into the OT cupboard. */
export function PharmacyTransferPage({
  initialMode = "edit",
}: {
  initialMode?: "list" | "edit";
}) {
  return <PharmacyBillingPage initialMode={initialMode} kind="transfer" />;
}
