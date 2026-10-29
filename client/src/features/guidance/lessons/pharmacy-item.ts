import type { GuideLesson, GuideScreen } from "../registry";

const createForm: GuideScreen = {
  view: "pharmacy",
  pharmacyScreen: "form",
  section: "stock",
};

const browse: GuideScreen = {
  view: "pharmacy",
  pharmacyScreen: "browse",
  section: "stock",
};

/**
 * Drug Setup lesson. Opens the create form, then the item list.
 * Does not press Create, Save, Edit, Restock, or F5. F5 on this screen reloads the window.
 * The edit step looks for the edit form only, so it skips while Create New Item is open.
 */
export const pharmacyItemLesson: GuideLesson = {
  id: "pharmacy-item",
  steps: [
    {
      id: "packing-rows",
      element: '[data-guide="pharmacy-pack"]',
      side: "bottom",
      titleKey: "guidePharmacyPackTitle",
      bodyKey: "guidePharmacyPackBody",
      screen: createForm,
    },
    {
      id: "create-stock",
      element: '.drug-setup-detail-pane [data-guide="pharmacy-pack"]',
      side: "bottom",
      titleKey: "guidePharmacyCreateStockTitle",
      bodyKey: "guidePharmacyCreateStockBody",
      screen: createForm,
    },
    {
      id: "edit-item",
      element: '.drug-setup-form-wrap [data-guide="pharmacy-pack"]',
      side: "bottom",
      titleKey: "guidePharmacyEditTitle",
      bodyKey: "guidePharmacyEditBody",
      screen: createForm,
    },
    {
      id: "restock",
      element: '[data-guide="pharmacy-restock"]',
      side: "left",
      titleKey: "guidePharmacyRestockTitle",
      bodyKey: "guidePharmacyRestockBody",
      screen: browse,
    },
    {
      id: "main-only",
      element: '[data-guide="pharmacy-restock"]',
      side: "left",
      titleKey: "guidePharmacyMainTitle",
      bodyKey: "guidePharmacyMainBody",
      screen: browse,
    },
  ],
};
