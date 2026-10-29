import type { GuideLesson, GuideScreen } from "../registry";

const createScreen: GuideScreen = {
  view: "patients",
  patientsScreen: "create",
  section: "patients_create",
};

const listScreen: GuideScreen = {
  view: "patients",
  patientsScreen: "list",
  section: "patients",
};

/** Chart lesson. Opens Patient Charts. Does not press Create or Attach bill. */
export const patientChartLesson: GuideLesson = {
  id: "patient-chart",
  steps: [
    {
      id: "create",
      element: '[data-guide="patient-create"]',
      side: "top",
      titleKey: "guidePatientCreateTitle",
      bodyKey: "guidePatientCreateBody",
      screen: createScreen,
    },
    {
      id: "search",
      element: '[data-guide="patient-search"]',
      side: "bottom",
      titleKey: "guidePatientSearchTitle",
      bodyKey: "guidePatientSearchBody",
      screen: listScreen,
    },
    {
      id: "attach",
      element: '[data-guide="patient-attach"]',
      side: "top",
      titleKey: "guidePatientAttachTitle",
      bodyKey: "guidePatientAttachBody",
      screen: listScreen,
    },
    {
      id: "transfer-slip",
      element: '[data-guide="patient-attach"]',
      side: "top",
      titleKey: "guidePatientTransferTitle",
      bodyKey: "guidePatientTransferBody",
      screen: listScreen,
    },
  ],
};
