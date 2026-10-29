import { billButtonsLesson } from "./lessons/bill-buttons";
import { chargeToIpdLesson } from "./lessons/charge-to-ipd";
import { ipdDischargeLesson } from "./lessons/ipd-discharge";
import { ipdStayLesson } from "./lessons/ipd-stay";
import { otCupboardLesson } from "./lessons/ot-cupboard";
import { patientChartLesson } from "./lessons/patient-chart";
import { pharmacyItemLesson } from "./lessons/pharmacy-item";
import { pharmacyReturnLesson } from "./lessons/pharmacy-return";
import { pharmacyTransferLesson } from "./lessons/pharmacy-transfer";

/** A lesson the host can run. */

export type GuideSide = "top" | "right" | "bottom" | "left";

/** Screen a step may open before it highlights. The host does not press the control. */
export type GuideScreen = {
  view:
    | "patients"
    | "ipd"
    | "pharmacy"
    | "pharmacy_billing"
    | "pharmacy_return"
    | "pharmacy_transfer"
    | "ot"
    | "opd";
  patientsScreen?: "list" | "create";
  pharmacyScreen?: "browse" | "form";
  billingMode?: "list" | "edit";
  otMode?: "case" | "stock";
  opdScreen?: "bill";
  /**
   * Stay on the sale desk already open (OPD bill, OT bill, or pharmacy sale).
   * Does not open Return in, Transfer to OT, an expense bill, or IPD.
   */
  saleStay?: boolean;
  section:
    | "patients"
    | "patients_create"
    | "ipd"
    | "stock"
    | "pharmacy"
    | "pharmacy_return"
    | "pharmacy_transfer"
    | "ot_stock"
    | "ot_bill"
    | "opd";
};

/** Desk snapshot used to avoid remounting a screen the tour is already on. */
export type GuideDesk = {
  view: string;
  patientsScreen?: "list" | "create";
  pharmacyScreen?: "browse" | "form" | "history";
  billingMode?: "list" | "edit";
  otMode?: "case" | "stock" | "expense";
  opdScreen?: "doctors" | "services" | "bill" | "expense";
};

export type GuideLessonStep = {
  id: string;
  /** CSS selector. A missing element is skipped. */
  element: string;
  side?: GuideSide;
  titleKey: string;
  bodyKey: string;
  /** When set, open this screen if it is not already showing. Does not remount a matching screen. */
  screen?: GuideScreen;
};

function isChargeSaleDesk(desk: GuideDesk): boolean {
  if (desk.view === "opd" && (desk.opdScreen ?? "bill") === "bill") return true;
  if (desk.view === "ot" && (desk.otMode ?? "case") === "case") return true;
  if (desk.view === "pharmacy_billing" && desk.billingMode === "edit") return true;
  return false;
}

/** True when the desk is already on that screen, so a tour must not remount it. */
export function guideScreenMatches(desk: GuideDesk, screen: GuideScreen): boolean {
  if (screen.saleStay) return isChargeSaleDesk(desk);
  if (desk.view !== screen.view) return false;
  if (screen.view === "patients") {
    const have = desk.patientsScreen === "create" ? "create" : "list";
    return have === (screen.patientsScreen ?? "list");
  }
  if (screen.view === "pharmacy") {
    const have = desk.pharmacyScreen ?? "browse";
    return have === (screen.pharmacyScreen ?? "browse");
  }
  if (
    screen.view === "pharmacy_billing" ||
    screen.view === "pharmacy_return" ||
    screen.view === "pharmacy_transfer"
  ) {
    return (desk.billingMode ?? "list") === (screen.billingMode ?? "edit");
  }
  if (screen.view === "ot") {
    return (desk.otMode ?? "case") === (screen.otMode ?? "case");
  }
  if (screen.view === "opd") {
    return (desk.opdScreen ?? "bill") === (screen.opdScreen ?? "bill");
  }
  return true;
}

/** True when two steps open the same screen, so Next must not remount it. */
export function guideScreensEqual(a?: GuideScreen, b?: GuideScreen): boolean {
  if (a == null || b == null) return false;
  if (a.saleStay && b.saleStay) return true;
  if (a.saleStay || b.saleStay) return false;
  return (
    a.view === b.view &&
    a.section === b.section &&
    (a.patientsScreen ?? "list") === (b.patientsScreen ?? "list") &&
    (a.pharmacyScreen ?? "browse") === (b.pharmacyScreen ?? "browse") &&
    (a.billingMode ?? "edit") === (b.billingMode ?? "edit") &&
    (a.otMode ?? "case") === (b.otMode ?? "case") &&
    (a.opdScreen ?? "bill") === (b.opdScreen ?? "bill")
  );
}

/**
 * Sale desk for Charge to IPD when the current screen cannot show the button.
 * Pharmacy stays on Pharmacy Bill. OT stays on OT Bill. Other logins open OPD Bill.
 */
export function saleDeskForRole(role: string, desk: GuideDesk): GuideScreen {
  if (role === "OT" || (role !== "Pharmacy" && role !== "OPD" && desk.view === "ot")) {
    return { view: "ot", otMode: "case", section: "ot_bill", saleStay: true };
  }
  if (role === "Pharmacy" || desk.view === "pharmacy" || desk.view.startsWith("pharmacy_")) {
    return { view: "pharmacy_billing", billingMode: "edit", section: "pharmacy", saleStay: true };
  }
  return { view: "opd", opdScreen: "bill", billingMode: "edit", section: "opd", saleStay: true };
}

export type GuideLesson = {
  id: string;
  steps: readonly GuideLessonStep[];
};

/** Registered lessons. Nothing in this list starts on login. */
export const guideLessons: GuideLesson[] = [
  billButtonsLesson,
  chargeToIpdLesson,
  patientChartLesson,
  ipdStayLesson,
  ipdDischargeLesson,
  pharmacyItemLesson,
  pharmacyReturnLesson,
  pharmacyTransferLesson,
  otCupboardLesson,
];

export function findGuideLesson(id: string): GuideLesson | undefined {
  return guideLessons.find((lesson) => lesson.id === id);
}
