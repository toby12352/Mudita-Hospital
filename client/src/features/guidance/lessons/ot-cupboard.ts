import type { GuideLesson, GuideScreen } from "../registry";

const cupboard: GuideScreen = {
  view: "ot",
  otMode: "stock",
  section: "ot_stock",
};

/** OT Inventory lesson. Does not press Return to pharmacy and does not run a transfer. */
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
    },
  ],
};
