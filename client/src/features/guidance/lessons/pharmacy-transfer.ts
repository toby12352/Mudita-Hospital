import type { GuideLesson, GuideScreen } from "../registry";

const transferDesk: GuideScreen = {
  view: "pharmacy_transfer",
  billingMode: "edit",
  section: "pharmacy_transfer",
};

/** Transfer to OT lesson. Does not press Transfer or Confirm transfer. */
export const pharmacyTransferLesson: GuideLesson = {
  id: "pharmacy-transfer",
  steps: [
    {
      id: "transfer",
      element: '[data-guide="pharmacy-transfer"]',
      side: "left",
      titleKey: "guidePharmacyTransferTitle",
      bodyKey: "guidePharmacyTransferBody",
      screen: transferDesk,
    },
    {
      id: "confirm-transfer",
      element: '[data-guide="pharmacy-transfer-confirm"]',
      side: "left",
      titleKey: "guidePharmacyTransferConfirmTitle",
      bodyKey: "guidePharmacyTransferConfirmBody",
      screen: transferDesk,
    },
  ],
};
