import type { GuideLesson, GuideScreen } from "../registry";

const ipdScreen: GuideScreen = {
  view: "ipd",
  section: "ipd",
};

/**
 * Discharge lesson. Opens Stays and highlights the button already on screen.
 * Does not open a stay and does not call discharge.
 */
export const ipdDischargeLesson: GuideLesson = {
  id: "ipd-discharge",
  steps: [
    {
      id: "cash-line",
      element: '[data-guide="ipd-discharge"]',
      side: "left",
      titleKey: "guideIpdCashLineTitle",
      bodyKey: "guideIpdCashLineBody",
      screen: ipdScreen,
    },
    {
      id: "discharge",
      element: '[data-guide="ipd-discharge"]',
      side: "left",
      titleKey: "guideIpdDischargeTitle",
      bodyKey: "guideIpdDischargeBody",
      screen: ipdScreen,
    },
  ],
};
