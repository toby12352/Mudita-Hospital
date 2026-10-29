import type { GuideLesson, GuideScreen } from "../registry";

/** A sale desk. The host stays put when one is already open, and does not post the charge. */
const saleDesk: GuideScreen = {
  view: "opd",
  opdScreen: "bill",
  billingMode: "edit",
  section: "opd",
  saleStay: true,
};

/** Charge to IPD lesson. Highlights only. Does not press Charge to IPD or Mark Paid. */
export const chargeToIpdLesson: GuideLesson = {
  id: "charge-to-ipd",
  steps: [
    {
      id: "charge-button",
      element: '[data-guide="bill-charge-ipd"]',
      side: "left",
      titleKey: "guideChargeButtonTitle",
      bodyKey: "guideChargeButtonBody",
      screen: saleDesk,
    },
    {
      id: "leave-mark-paid",
      element: '[data-guide="bill-mark-paid"]',
      side: "left",
      titleKey: "guideChargeLeavePaidTitle",
      bodyKey: "guideChargeLeavePaidBody",
      screen: saleDesk,
    },
  ],
};
