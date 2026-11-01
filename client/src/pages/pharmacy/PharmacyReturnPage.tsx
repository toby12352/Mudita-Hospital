import { PharmacyBillingPage } from "@/pages/pharmacy/PharmacyBillingPage";

/** Pharmacy return-in desk: same bill form as sales, credits MAIN stock on Return & print. */
export function PharmacyReturnPage({
  initialMode = "edit",
  openRecordId,
}: {
  initialMode?: "list" | "edit";
  openRecordId?: number;
}) {
  return (
    <PharmacyBillingPage
      initialMode={initialMode}
      kind="return"
      openRecordId={openRecordId}
    />
  );
}
