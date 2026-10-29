import type { GuideLesson, GuideScreen } from "../registry";

const ipdScreen: GuideScreen = {
  view: "ipd",
  section: "ipd",
};

/** Stay lesson. Opens Stays. Does not press Admit, Take deposit, or Post ward charge. */
export const ipdStayLesson: GuideLesson = {
  id: "ipd-stay",
  steps: [
    {
      id: "admit",
      element: '[data-guide="ipd-admit"]',
      side: "left",
      titleKey: "guideIpdAdmitTitle",
      bodyKey: "guideIpdAdmitBody",
      screen: ipdScreen,
    },
    {
      id: "take-deposit",
      element: '[data-guide="ipd-take-deposit"]',
      side: "left",
      titleKey: "guideIpdDepositTitle",
      bodyKey: "guideIpdDepositBody",
      screen: ipdScreen,
    },
    {
      id: "ward-charge",
      element: '[data-guide="ipd-ward-charge"]',
      side: "left",
      titleKey: "guideIpdWardTitle",
      bodyKey: "guideIpdWardBody",
      screen: ipdScreen,
    },
  ],
};
