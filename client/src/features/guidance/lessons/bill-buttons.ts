import type { GuideLesson } from "../registry";

/** Sale-rail lesson. Stays on the desk already open. Does not switch views. */
export const billButtonsLesson: GuideLesson = {
  id: "bill-buttons",
  steps: [
    {
      id: "save-draft",
      element: '[data-guide="bill-save-draft"]',
      side: "left",
      titleKey: "guideBillSaveDraftTitle",
      bodyKey: "guideBillSaveDraftBody",
    },
    {
      id: "print",
      element: '[data-guide="bill-print"]',
      side: "left",
      titleKey: "guideBillPrintTitle",
      bodyKey: "guideBillPrintBody",
    },
    {
      id: "mark-paid",
      element: '[data-guide="bill-mark-paid"]',
      side: "left",
      titleKey: "guideBillMarkPaidTitle",
      bodyKey: "guideBillMarkPaidBody",
    },
    {
      id: "charge-to-ipd",
      element: '[data-guide="bill-charge-ipd"]',
      side: "left",
      titleKey: "guideBillChargeIpdTitle",
      bodyKey: "guideBillChargeIpdBody",
    },
    {
      id: "void",
      element: '[data-guide="bill-void"]',
      side: "left",
      titleKey: "guideBillVoidTitle",
      bodyKey: "guideBillVoidBody",
    },
    {
      id: "history",
      element: '[data-guide="bill-history"]',
      side: "left",
      titleKey: "guideBillHistoryTitle",
      bodyKey: "guideBillHistoryBody",
    },
    {
      id: "new-bill",
      element: '[data-guide="bill-new"]',
      side: "left",
      titleKey: "guideBillNewTitle",
      bodyKey: "guideBillNewBody",
    },
    {
      id: "cancel",
      element: '[data-guide="bill-cancel"]',
      side: "left",
      titleKey: "guideBillCancelTitle",
      bodyKey: "guideBillCancelBody",
    },
  ],
};
