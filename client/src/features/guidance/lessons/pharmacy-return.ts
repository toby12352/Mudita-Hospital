import type { GuideLesson, GuideScreen } from "../registry";

const returnDesk: GuideScreen = {
  view: "pharmacy_return",
  billingMode: "edit",
  section: "pharmacy_return",
};

/** Return in lesson. Does not press Mark returned, Credit to IPD, or Void Bills. */
export const pharmacyReturnLesson: GuideLesson = {
  id: "pharmacy-return",
  steps: [
    {
      id: "save-draft",
      element: '[data-guide="bill-save-draft"]',
      side: "left",
      titleKey: "guidePharmacyReturnDraftTitle",
      bodyKey: "guidePharmacyReturnDraftBody",
      screen: returnDesk,
    },
    {
      id: "print",
      element: '[data-guide="bill-print"]',
      side: "left",
      titleKey: "guidePharmacyReturnPrintTitle",
      bodyKey: "guidePharmacyReturnPrintBody",
      screen: returnDesk,
    },
    {
      id: "mark-returned",
      element: '[data-guide="pharmacy-return-mark"]',
      side: "left",
      titleKey: "guidePharmacyReturnMarkTitle",
      bodyKey: "guidePharmacyReturnMarkBody",
      screen: returnDesk,
    },
  ],
};
