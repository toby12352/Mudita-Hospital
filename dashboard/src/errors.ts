import { t } from "./i18n";

/** Turn API / network failure text into a sentence a clerk can act on. Logs the original. */
export function userMessage(raw: string | null | undefined, status?: number): string {
  const original = (raw ?? "").trim();
  if (original || status !== undefined) {
    console.error("[mudita]", original || `(HTTP ${status})`);
  }

  if (looksLikeHtml(original)) {
    return t("errGeneric");
  }

  const statusFallback = matchStatusFallback(original, status);
  if (statusFallback) return statusFallback;

  if (looksLikeDriver(original)) {
    return t("errGeneric");
  }

  const exact = EXACT[original.toLowerCase()];
  if (exact) return fill(exact);

  const patterned = matchPattern(original);
  if (patterned) return patterned;

  const field = matchFieldRule(original);
  if (field) return field;

  if (/\bfailed\b/i.test(original) || /[a-z]+_[a-z0-9_]+/.test(original)) {
    return t("errGeneric");
  }

  if (!original) {
    return t("errGeneric");
  }

  return original;
}

/** Format a CSV import row for display (Line N: …). */
export function importLineMessage(line: number, message: string): string {
  return `${t("errLine")} ${line}: ${userMessage(message)}`;
}

function fill(key: string, vars?: Record<string, string | number>): string {
  let s = t(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

function looksLikeHtml(s: string): boolean {
  if (!s) return false;
  const lower = s.slice(0, 200).toLowerCase();
  return lower.includes("<html") || lower.includes("<!doctype") || /^\s*</.test(s);
}

function looksLikeDriver(s: string): boolean {
  return /UNIQUE|constraint|sql:|SQLITE|no such table/i.test(s);
}

function matchStatusFallback(raw: string, status?: number): string | null {
  const healthM = /^Health check failed \((\d+)\)$/i.exec(raw);
  if (healthM) {
    return Number(healthM[1]) === 503 ? t("errDbDown") : t("errUnreachable");
  }
  const m = /^(?:Request|Login|print|Export) failed \((\d+)\)$/i.exec(raw);
  const code = m ? Number(m[1]) : !raw && status !== undefined ? status : undefined;
  if (code !== undefined) {
    if (code === 503) return t("errDbDown");
    if (code === 401) return t("errSessionExpired");
    if (code === 403) return t("errForbidden");
    if (code === 404) return t("errNotFound");
    if (code === 409) return t("errConflict");
    if (code === 400) return t("errInvalidForm");
    if (code >= 500) return t("errGeneric");
    return t("errUnreachable");
  }
  if (/^Failed to fetch$/i.test(raw) || raw === "NetworkError when attempting to fetch resource.") {
    return t("errUnreachable");
  }
  return null;
}

function matchPattern(raw: string): string | null {
  let m: RegExpExecArray | null;

  m = /^insufficient stock for (.+) \(need (\d+), have (\d+)\)$/i.exec(raw);
  if (m) return fill("errInsufficientStockNamed", { code: m[1], need: m[2], have: m[3] });

  m = /^insufficient OT stock for (.+) \(need (\d+), have (\d+)\)$/i.exec(raw);
  if (m) return fill("errInsufficientOtStockNamed", { code: m[1], need: m[2], have: m[3] });

  m = /^service (.+) is inactive$/i.exec(raw);
  if (m) return t("errServiceUnavailable");

  m = /^item (.+) inactive$/i.exec(raw);
  if (m) return t("errItemInactive");

  m = /^(.+) is inactive$/i.exec(raw);
  if (m && !/item is inactive/i.test(raw)) return t("errItemInactive");

  m = /^item not found — create the item first$/i.exec(raw);
  if (m) return t("errItemMissing");

  m = /^item (.+) not found$/i.exec(raw);
  if (m) return t("errItemMissing");

  m = /^item (\d+) not found$/i.exec(raw);
  if (m) return t("errItemMissing");

  m = /^unknown code (.+) \(create items in clinic app first\)$/i.exec(raw);
  if (m) return fill("errUnknownCode", { code: m[1] });

  m = /^unknown code (.+)$/i.exec(raw);
  if (m) return fill("errUnknownCode", { code: m[1] });

  m = /^(?:unknown )?(?:doctor|item|service) id (\d+)(?: not found)?$/i.exec(raw);
  if (m) return t("errRecordRefresh");

  m = /^(.+): quantity required$/i.exec(raw);
  if (m) return t("errQtyPositive");

  m = /^(.+): pack quantities must be >= 0$/i.exec(raw);
  if (m) return t("errQtyPositive");

  m = /^(.+): quantity must be > 0$/i.exec(raw);
  if (m) return t("errQtyPositive");

  return null;
}

const FIELD_LABELS: Record<string, string> = {
  patient_name: "errFieldPatientName",
  hospital_name: "errFieldHospitalName",
  display_name: "errFieldDisplayName",
  buy_price_mmk: "errFieldBuyPrice",
  sell_price_mmk: "errFieldSellPrice",
  price_mmk: "errFieldPrice",
  consultation_mmk: "errFieldConsultFee",
  ot_mmk: "errFieldOtFee",
  reorder_level: "errFieldReorder",
  initial_qty: "errFieldInitialQty",
  pack_l1_qty: "errFieldPackL1",
  pack_l2_qty: "errFieldPackL2",
  pack_l3_qty: "errFieldPackL3",
  username: "errFieldUsername",
  password: "errFieldPassword",
  name: "errFieldName",
  code: "errFieldCode",
  reason: "errFieldReason",
  qty: "errFieldQty",
  quantity: "errFieldQty",
};

function matchFieldRule(raw: string): string | null {
  let m = /^([a-z0-9_]+) required$/i.exec(raw);
  if (m) {
    const field = m[1].toLowerCase();
    if (field === "item_id") return t("errChooseMedicine");
    if (field === "reason") return t("errReasonRequired");
    if (field === "quantity" || field === "qty") return t("errQtyPositive");
    const labelKey = FIELD_LABELS[field];
    if (labelKey) return fill("errFieldRequired", { field: t(labelKey) });
  }

  m = /^([a-z0-9_]+) must be >= 0$/i.exec(raw);
  if (m) {
    const labelKey = FIELD_LABELS[m[1].toLowerCase()];
    if (labelKey) return fill("errFieldNonNeg", { field: t(labelKey) });
  }

  m = /^([a-z0-9_]+) must be >= 1$/i.exec(raw);
  if (m) {
    if (/^pack_l[123]_qty$/i.test(m[1])) return t("errPackQtyMin");
  }

  m = /^Patient name required$/i.exec(raw);
  if (m) return t("errPatientNameRequired");

  m = /^Reason required$/i.exec(raw);
  if (m) return t("errReasonRequired");

  m = /^Restock qty must be > 0$/i.exec(raw);
  if (m) return t("errQtyPositive");

  m = /^Adjustment qty must be non-zero$/i.exec(raw);
  if (m) return t("errAdjustNonZero");

  m = /^Add at least one line$/i.exec(raw);
  if (m) return t("errAddLine");

  m = /^Add at least one medicine$/i.exec(raw);
  if (m) return t("errAddMedicine");

  return null;
}

/** Lowercase API / print bodies → i18n key. */
const EXACT: Record<string, string> = {
  "server address required": "errServerAddressRequired",
  "invalid server address": "errInvalidServerAddress",
  "api not ready": "errApiNotReady",
  unauthorized: "errSessionExpired",
  "invalid credentials": "errBadCredentials",
  "username and password required": "errUsernamePasswordRequired",
  "current password incorrect": "errCurrentPasswordWrong",
  "new password must be at least 6 characters": "errPasswordMin",
  "password must be at least 6 characters": "errPasswordMin",
  "password change required": "errPasswordChangeRequired",
  forbidden: "errForbidden",
  "admin only": "errForbidden",
  "not found": "errNotFound",
  "invalid id": "errNotFound",
  "invalid json": "errInvalidForm",
  "method not allowed": "errInvalidForm",
  "report failed": "errGeneric",
  "load failed": "errGeneric",
  "patient_name required": "errPatientNameRequired",
  "at least one item line required": "errAddMedicine",
  "bill has no lines": "errAddLine",
  "pharmacy items belong on pharmacy billing, not opd": "errPharmacyOnOpd",
  "only one consultation line is allowed": "errOneConsultation",
  "consultation requires a doctor": "errConsultNeedsDoctor",
  "doctor not found": "errDoctorUnavailable",
  "doctor inactive": "errDoctorUnavailable",
  "service not found": "errServiceUnavailable",
  "invalid line_type": "errCheckLines",
  "service ref_id required": "errCheckLines",
  "line qty must be > 0": "errCheckLines",
  "only draft bills can be paid": "errBillFinished",
  "only draft bills can be edited": "errBillFinished",
  "already void": "errAlreadyVoid",
  "reason required": "errReasonRequired",
  "reason is required": "errReasonRequired",
  "reason too long": "errReasonTooLong",
  "insufficient stock": "errInsufficientStock",
  "insufficient batch qty": "errInsufficientStock",
  "batch not found": "errBatchGone",
  "item not found": "errItemMissing",
  "item is inactive": "errItemInactive",
  "quantity required": "errQtyPositive",
  "qty must be > 0": "errQtyPositive",
  "qty_issued must be > 0": "errQtyPositive",
  "item_id required": "errChooseMedicine",
  "qty_delta must be non-zero": "errAdjustNonZero",
  "hospital_name required": "errHospitalNameRequired",
  "name required": "errDoctorNameRequired",
  "code and name required": "errCodeNameRequired",
  "code already exists": "errCodeExists",
  "invalid category": "errChooseCategory",
  "username already exists": "errUsernameExists",
  "username, display_name, and password required": "errUserFieldsRequired",
  "display_name required": "errDisplayNameRequired",
  "role must be opd, ot, pharmacy, or patients": "errChooseRole",
  "cannot change admin role": "errCannotChangeAdmin",
  "cannot deactivate yourself": "errCannotDeactivateSelf",
  "cannot deactivate the last admin": "errCannotDeactivateLastAdmin",
  "expiry_date must be yyyy-mm-dd": "errDateFormat",
  "date must be yyyy-mm-dd": "errDateFormat",
  "from/to must be yyyy-mm-dd": "errDateFormat",
  "days must be 7, 30, or 90": "errDaysChoice",
  "cogs_days must be 7, 30, or 90": "errDaysChoice",
  "slow_days must be 7–365": "errSlowDays",
  "slow_days must be 7-365": "errSlowDays",
  "from must be on or before to": "errDateOrder",
  "range too long (max 366 days)": "errRangeTooLong",
  "pack_l1_qty must be >= 1": "errPackQtyMin",
  "pack_l2_qty must be >= 1": "errPackQtyMin",
  "pack_l3_qty must be >= 1": "errPackQtyMin",
  "invalid pack_l1_unit (box or bottle)": "errPackL1Unit",
  "invalid pack_l2_unit (strip or card)": "errPackL2Unit",
  "invalid pack_l3_unit (tablet, capsule, or ml)": "errPackL3Unit",
  "pack quantities and the small unit cannot change while stock remains": "errPackLocked",
  "csv must include header and at least one data row": "errCsvRows",
  "csv header must include code, buy_price_mmk, sell_price_mmk, reorder_level": "errCsvHeaderItems",
  "active must be 0 or 1": "errActive01",
  "confirm must be import": "errConfirmImport",
  "confirm must be update": "errConfirmUpdate",
  "ids required": "errSelectRows",
  "set buy_price_mmk, sell_price_mmk, and/or reorder_level": "errSetAtLeastOne",
  "price_mmk required": "errSetAtLeastOne",
  "set consultation_mmk and/or ot_mmk": "errSetAtLeastOne",
  "limit must be 1–500": "errInvalidForm",
  "training data failed": "errGeneric",
  "db=error": "errDbDown",
  "db=unavailable": "errDbDown",
  "backup failed": "errGeneric",
  "invalid backup name": "errInvalidForm",
  "backup must be a .db file": "errInvalidForm",
  "backup outside backup_dir": "errInvalidForm",
  "backup not found": "errNotFound",
  "queue restore failed": "errGeneric",
  "code required": "errCodeRequired",
  "valid id required": "errNotFound",
};
