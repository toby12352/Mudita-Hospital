import type { GuideLesson, GuideScreen } from "../registry";

const cupboard: GuideScreen = {
  view: "ot",
  otMode: "stock",
  section: "ot_stock",
};

/**
 * OT Inventory lesson. Does not press Return to pharmacy and does not run a transfer.
 * Cupboard step highlights the list. On the return step, OtStockPage opens the first
 * cupboard row so Return to pharmacy is on screen (same idea as pharmacy-item restock).
 */
export const otCupboardLesson: GuideLesson = {
  id: "ot-cupboard",
  steps: [
    {
      id: "cupboard",
      element: '[data-guide="ot-cupboard"]',
      side: "right",
      titleKey: "guideOtInventoryTitle",
      bodyKey: "guideOtInventoryBody",
      screen: cupboard,
    },
    {
      id: "return-to-pharmacy",
      element: '[data-guide="ot-return-pharmacy"]',
      side: "left",
      titleKey: "guideOtReturnTitle",
      bodyKey: "guideOtReturnBody",
      screen: cupboard,
      waitForElementMs: 1000,
    },
  ],
};
