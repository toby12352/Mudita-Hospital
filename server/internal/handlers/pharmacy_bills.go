package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

type pharmacyBillLine struct {
	ID           int64  `json:"id,omitempty"`
	ItemID       int64  `json:"item_id"`
	Code         string `json:"code"`
	Description  string `json:"description"`
	BoxQty       int64  `json:"box_qty"`
	StripQty     int64  `json:"strip_qty"`
	TabletQty    int64  `json:"tablet_qty"`
	BillingQty   int64  `json:"billing_qty"`
	BillingUnit  string `json:"billing_unit"`
	StockQty     int64  `json:"stock_qty"`
	StockUnit    string `json:"stock_unit"`
	UnitPriceMMK int64  `json:"unit_price_mmk"`
	LineTotalMMK int64  `json:"line_total_mmk"`
	SortOrder    int    `json:"sort_order"`
	// Joined from items on read so the screen and the receipt can name the chosen unit.
	// Ignored when a bill is saved; normalize reloads the pack from the item.
	PackL1Qty  int64  `json:"pack_l1_qty,omitempty"`
	PackL1Unit string `json:"pack_l1_unit,omitempty"`
	PackL2Qty  int64  `json:"pack_l2_qty,omitempty"`
	PackL2Unit string `json:"pack_l2_unit,omitempty"`
	PackL3Qty  int64  `json:"pack_l3_qty,omitempty"`
	PackL3Unit string `json:"pack_l3_unit,omitempty"`
}

type pharmacyBill struct {
	ID              int64              `json:"id"`
	BillNo          string             `json:"bill_no"`
	PatientID       *int64             `json:"patient_id,omitempty"`
	PatientName     string             `json:"patient_name"`
	PatientPhone    string             `json:"patient_phone"`
	PatientAgeYears *int64             `json:"patient_age_years,omitempty"`
	PatientGender   string             `json:"patient_gender"`
	Description     string             `json:"description"`
	Status          string             `json:"status"`
	TotalMMK        int64              `json:"total_mmk"`
	DiscountValue   int64              `json:"discount_value"`
	DiscountUnit    string             `json:"discount_unit"`
	DiscountMMK     int64              `json:"discount_mmk"`
	PrintedAt       *string            `json:"printed_at,omitempty"`
	AdmissionID     *int64             `json:"admission_id,omitempty"`
	CollectedCash   int                `json:"collected_cash"`
	PaidAt          *string            `json:"paid_at,omitempty"`
	PaidByUserID    *int64             `json:"paid_by_user_id,omitempty"`
	VoidedAt        *string            `json:"voided_at,omitempty"`
	VoidedByUserID  *int64             `json:"voided_by_user_id,omitempty"`
	VoidReason      string             `json:"void_reason,omitempty"`
	CreatedByUserID *int64             `json:"created_by_user_id,omitempty"`
	CreatedAt       string             `json:"created_at"`
	UpdatedAt       string             `json:"updated_at"`
	Lines           []pharmacyBillLine `json:"lines,omitempty"`
}

type pharmacyBillWriteRequest struct {
	PatientName     string             `json:"patient_name"`
	PatientPhone    string             `json:"patient_phone"`
	PatientAgeYears *int64             `json:"patient_age_years,omitempty"`
	PatientGender   string             `json:"patient_gender"`
	Description     string             `json:"description"`
	Lines           []pharmacyBillLine `json:"lines"`
	SavePatient     bool               `json:"save_patient"`
	// Kind is "sale" (default), "return", or "transfer".
	// Returns get RT-###### numbers. Transfers to OT get TO-###### numbers.
	Kind          string `json:"kind,omitempty"`
	DiscountValue int64  `json:"discount_value"`
	DiscountUnit  string `json:"discount_unit"`
	PatientID     *int64 `json:"patient_id,omitempty"`
}

func isPharmacyReturnBillNo(billNo string) bool {
	return strings.HasPrefix(billNo, "RT-")
}

func isPharmacyTransferBillNo(billNo string) bool {
	return strings.HasPrefix(billNo, "TO-")
}

func (h *Pharmacy) listPharmacyBills(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	kind := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("kind")))
	query := `
		SELECT id, bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
		       description, status, total_mmk, paid_at, paid_by_user_id, voided_at, voided_by_user_id,
		       void_reason, created_by_user_id, created_at, updated_at,
		       discount_value, discount_unit, discount_mmk, printed_at, admission_id, collected_cash
		FROM pharmacy_bills
	`
	args := make([]any, 0)
	where := make([]string, 0)
	switch kind {
	case "return":
		where = append(where, "bill_no LIKE 'RT-%'")
	case "sale":
		where = append(where, "bill_no LIKE 'PH-%'")
	case "transfer":
		where = append(where, "bill_no LIKE 'TO-%'")
	case "":
		// All pharmacy bills (sales, returns, and transfers).
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "kind must be sale, return, or transfer"})
		return
	}
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if patientRaw := strings.TrimSpace(r.URL.Query().Get("patient_id")); patientRaw != "" {
		patientID, err := strconv.ParseInt(patientRaw, 10, 64)
		if err != nil || patientID <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid patient_id"})
			return
		}
		where = append(where, "patient_id = ?")
		args = append(args, patientID)
	}
	if q != "" {
		like := "%" + q + "%"
		where = append(where, "(bill_no LIKE ? OR patient_name LIKE ? OR patient_phone LIKE ?)")
		args = append(args, like, like, like)
	}
	var errMsg string
	where, args, errMsg = appendBillHistoryFilters(where, args, r, "status", "printed_at", "created_at", "")
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	orderSQL, orderErr := billHistoryOrderBy(r, "created_at", "id")
	if orderErr != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": orderErr})
		return
	}
	query += orderSQL

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	out := make([]pharmacyBill, 0)
	for rows.Next() {
		b, err := scanPharmacyBill(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, b)
	}
	writeJSON(w, http.StatusOK, map[string]any{"bills": out})
}

func (h *Pharmacy) createPharmacyBill(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	var req pharmacyBillWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.PatientName = strings.TrimSpace(req.PatientName)
	kind := strings.ToLower(strings.TrimSpace(req.Kind))
	prefix := "PH"
	switch kind {
	case "", "sale":
		kind = "sale"
	case "return":
		prefix = "RT"
	case "transfer":
		prefix = "TO"
		if req.PatientName == "" {
			req.PatientName = "OT"
		}
		req.SavePatient = false
		req.PatientID = nil
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "kind must be sale, return, or transfer"})
		return
	}
	if req.PatientName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "patient_name required"})
		return
	}
	lines, total, errMsg := normalizePharmacyBillLines(h.DB, req.Lines)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	if len(lines) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "at least one item line required"})
		return
	}
	discountValue, discountUnit, discountMMK, net, errMsg := pharmacyDiscount(kind, total, req.DiscountValue, req.DiscountUnit)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	patientID, err := resolveDeskPatient(tx, req.PatientID, req.SavePatient, req.PatientName, req.PatientPhone, req.PatientGender, req.PatientAgeYears, func() (int64, error) {
		return upsertPharmacyPatient(tx, req)
	})
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "patient not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "patient save failed"})
		return
	}

	billNo, err := nextPharmacyBillNo(tx, prefix)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "bill number failed"})
		return
	}

	uid := user.ID
	res, err := tx.Exec(`
		INSERT INTO pharmacy_bills (
			bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
			description, status, total_mmk, created_by_user_id,
			discount_value, discount_unit, discount_mmk
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
	`, billNo, patientID, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
		strings.TrimSpace(req.PatientGender), strings.TrimSpace(req.Description), net, uid,
		discountValue, discountUnit, discountMMK)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	billID, _ := res.LastInsertId()
	if err := insertPharmacyBillLines(tx, billID, lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "create", "pharmacy_bill", &billID, map[string]any{
		"bill_no": billNo, "total_mmk": net, "discount_mmk": discountMMK, "kind": kind,
	})

	bill, err := loadPharmacyBill(h.DB, billID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, bill)
}

func (h *Pharmacy) getPharmacyBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/bills"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	bill, err := loadPharmacyBill(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) updatePharmacyBill(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	id, ok := parseID(strings.TrimPrefix(path, "/bills"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var req pharmacyBillWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.PatientName = strings.TrimSpace(req.PatientName)
	lines, total, errMsg := normalizePharmacyBillLines(h.DB, req.Lines)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	if len(lines) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "at least one item line required"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, billNo string
	err = tx.QueryRow(`SELECT status, bill_no FROM pharmacy_bills WHERE id = ?`, id).Scan(&status, &billNo)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be edited"})
		return
	}
	if isPharmacyTransferBillNo(billNo) {
		if req.PatientName == "" {
			req.PatientName = "OT"
		}
		req.SavePatient = false
		req.PatientID = nil
	} else if req.PatientName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "patient_name required"})
		return
	}
	kind := "sale"
	if isPharmacyReturnBillNo(billNo) {
		kind = "return"
	} else if isPharmacyTransferBillNo(billNo) {
		kind = "transfer"
	}
	discountValue, discountUnit, discountMMK, net, errMsg := pharmacyDiscount(kind, total, req.DiscountValue, req.DiscountUnit)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	patientID, err := resolveDeskPatient(tx, req.PatientID, req.SavePatient, req.PatientName, req.PatientPhone, req.PatientGender, req.PatientAgeYears, func() (int64, error) {
		return upsertPharmacyPatient(tx, req)
	})
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "patient not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "patient save failed"})
		return
	}

	if _, err := tx.Exec(`
		UPDATE pharmacy_bills SET patient_id = ?, patient_name = ?, patient_phone = ?,
			patient_age_years = ?, patient_gender = ?, description = ?, total_mmk = ?,
			discount_value = ?, discount_unit = ?, discount_mmk = ?,
			updated_at = datetime('now')
		WHERE id = ?
	`, patientID, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
		strings.TrimSpace(req.PatientGender), strings.TrimSpace(req.Description), net,
		discountValue, discountUnit, discountMMK, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	if _, err := tx.Exec(`DELETE FROM pharmacy_bill_lines WHERE bill_id = ?`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "clear lines failed"})
		return
	}
	if err := insertPharmacyBillLines(tx, id, lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "pharmacy_bill", &id, map[string]any{
		"total_mmk": net, "discount_mmk": discountMMK,
	})

	bill, err := loadPharmacyBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) markPharmacyBillPrinted(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/bills/"), "/printed")
	id, ok := parseID("/" + idPath)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	n, err := execMarkPrinted(tx, "pharmacy_bills", id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "print stamp failed"})
		return
	}
	if n == 0 {
		var exists int
		err = tx.QueryRow(`SELECT 1 FROM pharmacy_bills WHERE id = ?`, id).Scan(&exists)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be marked printed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "print", "pharmacy_bill", &id, nil)

	bill, err := loadPharmacyBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) payPharmacyBill(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/bills/"), "/pay")
	id, ok := parseID("/" + idPath)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	body, err := decodePayBody(r)
	if rejectPayBody(w, err) {
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, billNo string
	var patientID sql.NullInt64
	var total int64
	err = tx.QueryRow(`SELECT status, bill_no, patient_id, total_mmk FROM pharmacy_bills WHERE id = ?`, id).Scan(&status, &billNo, &patientID, &total)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if isPharmacyTransferBillNo(billNo) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "transfer bills are confirmed, not paid"})
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be paid"})
		return
	}
	isReturn := isPharmacyReturnBillNo(billNo)
	var charge stayBind
	if isReturn {
		charge = bindReturnCredit(tx, patientID, body)
	} else {
		charge = bindSaleCharge(tx, patientID, body.AdmissionID)
	}
	if charge.reject(w) {
		return
	}

	lines, err := loadPharmacyBillLinesTx(tx, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines load failed"})
		return
	}
	if len(lines) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bill has no lines"})
		return
	}

	uid := user.ID
	for _, line := range lines {
		if isReturn {
			if err := creditPharmacyReturn(tx, id, line.ID, line.ItemID, line.StockQty, uid); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
		} else {
			if _, err := fefoDeductPharmacySale(tx, id, line.ID, line.ItemID, line.StockQty, uid); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
		}
	}

	n, err := execPayDraft(tx, "pharmacy_bills", id, uid, charge.AdmissionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pay failed"})
		return
	}
	if n == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be paid"})
		return
	}
	if charge.AdmissionID != nil {
		amount := -total
		if isReturn {
			amount = total
		}
		if err := postLedgerTx(tx, *charge.AdmissionID, "charge", amount, "pharmacy", id, billNo, uid); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pay failed"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	payAction := "pay"
	if isReturn {
		payAction = "return"
	}
	detail := map[string]any{"method": "cash", "bill_no": billNo}
	if charge.AdmissionID != nil {
		detail["method"] = "ipd"
		detail["admission_id"] = *charge.AdmissionID
	}
	audit.WriteAudit(h.DB, &uid, payAction, "pharmacy_bill", &id, detail)

	bill, err := loadPharmacyBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) transferPharmacyBill(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/bills/"), "/transfer")
	id, ok := parseID("/" + idPath)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, billNo string
	err = tx.QueryRow(`SELECT status, bill_no FROM pharmacy_bills WHERE id = ?`, id).Scan(&status, &billNo)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if !isPharmacyTransferBillNo(billNo) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only a transfer slip can be confirmed"})
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only a draft transfer can be confirmed"})
		return
	}

	lines, err := loadPharmacyBillLinesTx(tx, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines load failed"})
		return
	}
	if len(lines) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bill has no lines"})
		return
	}

	uid := user.ID
	for _, line := range lines {
		if err := transferSaleableMainToOt(tx, id, line.ID, line.ItemID, line.StockQty, uid, billNo); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}

	n, err := execPayDraft(tx, "pharmacy_bills", id, uid, nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "transfer failed"})
		return
	}
	if n == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only a draft transfer can be confirmed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "transfer", "pharmacy_bill", &id, map[string]any{"bill_no": billNo})

	bill, err := loadPharmacyBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) purgePharmacyBill(w http.ResponseWriter, r *http.Request, path string) {
	user, ok := requireAdminUser(w, r)
	if !ok {
		return
	}
	id, ok := parseID(strings.TrimPrefix(path, "/bills"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, billNo string
	var totalMMK int64
	err = tx.QueryRow(`SELECT status, bill_no, total_mmk FROM pharmacy_bills WHERE id = ?`, id).Scan(&status, &billNo, &totalMMK)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if rejectPurgeStatus(w, status) {
		return
	}
	if err := purgeBillLedgerTx(tx, "pharmacy", id); err != nil {
		if err == errLedgerNotBalanced {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "ledger not balanced"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ledger purge failed"})
		return
	}
	if _, err := tx.Exec(`UPDATE stock_transfers SET pharmacy_bill_id = NULL WHERE pharmacy_bill_id = ?`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "transfer unlink failed"})
		return
	}
	res, err := tx.Exec(`DELETE FROM pharmacy_bills WHERE id = ?`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "delete", "pharmacy_bill", &id, map[string]any{
		"bill_no": billNo, "was_status": status, "total_mmk": totalMMK,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Pharmacy) voidPharmacyBill(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/bills/"), "/void")
	id, ok := parseID("/" + idPath)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var req voidRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "reason required"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, billNo string
	var admissionID sql.NullInt64
	err = tx.QueryRow(`SELECT status, bill_no, admission_id FROM pharmacy_bills WHERE id = ?`, id).Scan(&status, &billNo, &admissionID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if status == "void" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "already void"})
		return
	}

	uid := user.ID
	isReturn := isPharmacyReturnBillNo(billNo)
	if status == "paid" && admissionID.Valid {
		if ensureOpenStay(tx, admissionID.Int64).reject(w) {
			return
		}
	}
	isTransfer := isPharmacyTransferBillNo(billNo)
	if status == "paid" && isTransfer {
		reason := fmt.Sprintf("void %s: %s", billNo, req.Reason)
		if err := reverseTransfersForBill(tx, id, uid, reason); err != nil {
			code := http.StatusInternalServerError
			if strings.HasPrefix(err.Error(), "cannot void transfer") {
				code = http.StatusBadRequest
			}
			writeJSON(w, code, map[string]string{"error": err.Error()})
			return
		}
	} else if status == "paid" {
		rows, err := tx.Query(`
			SELECT id, item_id, batch_id, qty FROM pharmacy_bill_stock_allocs WHERE bill_id = ?
		`, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "allocs load failed"})
			return
		}
		type alloc struct {
			id, itemID, batchID, qty int64
		}
		allocs := make([]alloc, 0)
		for rows.Next() {
			var a alloc
			if err := rows.Scan(&a.id, &a.itemID, &a.batchID, &a.qty); err != nil {
				rows.Close()
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
				return
			}
			allocs = append(allocs, a)
		}
		rows.Close()

		reason := fmt.Sprintf("void %s: %s", billNo, req.Reason)
		for _, a := range allocs {
			if isReturn {
				var have int64
				if err := tx.QueryRow(`SELECT qty FROM item_batches WHERE id = ?`, a.batchID).Scan(&have); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "batch load failed"})
					return
				}
				if have < a.qty {
					writeJSON(w, http.StatusBadRequest, map[string]string{
						"error": fmt.Sprintf("cannot void return: batch has %d, need to remove %d", have, a.qty),
					})
					return
				}
				if _, err := tx.Exec(`
					UPDATE item_batches SET qty = qty - ?, updated_at = datetime('now') WHERE id = ?
				`, a.qty, a.batchID); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "stock reverse failed"})
					return
				}
				if _, err := tx.Exec(`
					INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
					VALUES (?, ?, 'MAIN', 'ADJUST', ?, ?, ?)
				`, a.itemID, a.batchID, -a.qty, reason, uid); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
					return
				}
			} else {
				if _, err := tx.Exec(`
					UPDATE item_batches SET qty = qty + ?, updated_at = datetime('now') WHERE id = ?
				`, a.qty, a.batchID); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "stock restore failed"})
					return
				}
				if _, err := tx.Exec(`
					INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
					VALUES (?, ?, 'MAIN', 'RETURN', ?, ?, ?)
				`, a.itemID, a.batchID, a.qty, reason, uid); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
					return
				}
			}
		}
		if admissionID.Valid {
			if err := reverseLedgerTx(tx, admissionID.Int64, "pharmacy", id, uid, billNo); err != nil {
				msg := "void failed"
				if err == sql.ErrNoRows {
					msg = "ledger line missing"
				}
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": msg})
				return
			}
		}
	}

	if _, err := tx.Exec(`
		UPDATE pharmacy_bills SET status = 'void', voided_at = datetime('now'), voided_by_user_id = ?,
			void_reason = ?, updated_at = datetime('now')
		WHERE id = ?
	`, uid, req.Reason, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "void failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "void", "pharmacy_bill", &id, map[string]any{
		"bill_no": billNo, "reason": req.Reason, "was_status": status,
	})

	bill, err := loadPharmacyBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) printPharmacyBill(w http.ResponseWriter, r *http.Request, path string) {
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/bills/"), "/print")
	id, ok := parseID("/" + idPath)
	if !ok {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	bill, err := loadPharmacyBill(h.DB, id)
	if err == sql.ErrNoRows {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "load failed", http.StatusInternalServerError)
		return
	}

	hosp, err := loadHospitalSettings(h.DB)
	if err != nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}

	dateLabel := bill.CreatedAt
	if bill.PaidAt != nil {
		dateLabel = *bill.PaidAt
	}
	lines := make([]receiptLine, 0, len(bill.Lines))
	for _, line := range bill.Lines {
		qty, unit, price := pharmacyReceiptQty(line)
		desc := line.Description
		if unit == "" && line.BillingUnit != "" {
			desc = fmt.Sprintf("%s (%s)", line.Description, line.BillingUnit)
		}
		lines = append(lines, receiptLine{
			Code:        line.Code,
			Description: desc,
			Qty:         qty,
			Unit:        unit,
			UnitPrice:   price,
			LineTotal:   line.LineTotalMMK,
		})
	}

	title := "PHARMACY RECEIPT"
	if isPharmacyReturnBillNo(bill.BillNo) {
		title = "PHARMACY RETURN"
	}
	transfer := isPharmacyTransferBillNo(bill.BillNo)
	if transfer {
		title = "TRANSFER TO OT"
	}
	printedAt := ""
	if bill.PrintedAt != nil {
		printedAt = *bill.PrintedAt
	}
	receipt := receiptBill{
		Title:         title,
		BillNo:        bill.BillNo,
		Status:        bill.Status,
		PrintedAt:     printedAt,
		PatientName:   bill.PatientName,
		PatientPhone:  bill.PatientPhone,
		PatientAge:    bill.PatientAgeYears,
		PatientGender: bill.PatientGender,
		Note:          bill.Description,
		DateLabel:     dateLabel,
		TotalMMK:      bill.TotalMMK,
		Lines:         lines,
	}
	if !transfer {
		receipt.ShowSettlement = true
		receipt.TotalMMK = bill.TotalMMK + bill.DiscountMMK
		receipt.NetMMK = bill.TotalMMK
		receipt.DiscountMMK = bill.DiscountMMK
		receipt.DiscountValue = bill.DiscountValue
		receipt.DiscountUnit = bill.DiscountUnit
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderThermalReceiptHTML(hosp, receipt)))
}

// pharmacyDiscount ignores a discount on a transfer to OT. Sales and returns
// store the net in total_mmk.
func pharmacyDiscount(kind string, gross, value int64, unit string) (int64, string, int64, int64, string) {
	if kind == "transfer" {
		return 0, "percent", 0, gross, ""
	}
	off, net, unitOut, errMsg := applyBillDiscount(gross, value, unit)
	if errMsg != "" {
		return 0, "", 0, 0, errMsg
	}
	return value, unitOut, off, net, ""
}

// pharmacyReceiptQty prints the chosen unit when exactly one of box/strip/tablet
// is set. Mixed legacy lines keep the smallest-unit qty and price.
func pharmacyReceiptQty(line pharmacyBillLine) (qty int64, unit string, price int64) {
	qty = line.BillingQty
	price = line.UnitPriceMMK
	n := 0
	if line.BoxQty > 0 {
		n++
	}
	if line.StripQty > 0 {
		n++
	}
	if line.TabletQty > 0 {
		n++
	}
	if n != 1 {
		return qty, "", price
	}
	switch {
	case line.BoxQty > 0:
		qty = line.BoxQty
		unit = strings.TrimSpace(line.PackL1Unit)
	case line.StripQty > 0:
		qty = line.StripQty
		unit = strings.TrimSpace(line.PackL2Unit)
	default:
		qty = line.TabletQty
		unit = strings.TrimSpace(line.PackL3Unit)
	}
	if qty > 0 {
		price = line.LineTotalMMK / qty
	}
	return qty, unit, price
}

func normalizePharmacyBillLines(db *sql.DB, in []pharmacyBillLine) ([]pharmacyBillLine, int64, string) {
	out := make([]pharmacyBillLine, 0, len(in))
	var total int64
	for i, l := range in {
		if l.ItemID <= 0 {
			return nil, 0, "item_id required"
		}
		item, err := loadPharmacyItem(db, l.ItemID, false)
		if err == sql.ErrNoRows {
			return nil, 0, fmt.Sprintf("item %d not found", l.ItemID)
		}
		if err != nil {
			return nil, 0, "item load failed"
		}
		if !item.Active {
			return nil, 0, fmt.Sprintf("%s is inactive", item.Code)
		}

		pack := itemPackFromPharmacyItem(item)
		boxQty, stripQty, tabletQty := l.BoxQty, l.StripQty, l.TabletQty
		var billingQty int64
		var msg string
		if boxQty > 0 || stripQty > 0 || tabletQty > 0 {
			billingQty, msg = totalTabletsFromPackQtys(boxQty, stripQty, tabletQty, pack)
			if msg != "" {
				return nil, 0, fmt.Sprintf("%s: %s", item.Code, msg)
			}
		} else if l.BillingQty > 0 {
			// Legacy: single billing_qty treated as L3 units.
			billingQty = l.BillingQty
			tabletQty = l.BillingQty
		} else {
			return nil, 0, "quantity required"
		}
		stockQty := billingQty
		// Catalog price, code, and name. Client unit_price_mmk is ignored.
		sell := item.SellPriceMMK
		lineTotal := pharmacyPackLineChargeMMK(boxQty, stripQty, tabletQty, sell, pack)

		out = append(out, pharmacyBillLine{
			ItemID:       item.ID,
			Code:         item.Code,
			Description:  item.Name,
			BoxQty:       boxQty,
			StripQty:     stripQty,
			TabletQty:    tabletQty,
			BillingQty:   billingQty,
			BillingUnit:  item.PackL3Unit,
			StockQty:     stockQty,
			StockUnit:    item.PackL3Unit,
			UnitPriceMMK: sell,
			LineTotalMMK: lineTotal,
			SortOrder:    i,
		})
		total += lineTotal
	}
	return out, total, ""
}

func nextPharmacyBillNo(tx *sql.Tx, prefix string) (string, error) {
	if prefix == "" {
		prefix = "PH"
	}
	var n int64
	err := tx.QueryRow(`SELECT next_num FROM pharmacy_bill_number_seq WHERE id = 1`).Scan(&n)
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(`UPDATE pharmacy_bill_number_seq SET next_num = next_num + 1 WHERE id = 1`); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%06d", prefix, n), nil
}

// creditPharmacyReturn adds qty onto the unlabeled MAIN batch and records allocs.
func creditPharmacyReturn(tx *sql.Tx, billID, lineID, itemID, qty, actorUserID int64) error {
	if qty <= 0 {
		return fmt.Errorf("return qty must be > 0")
	}
	batchID, err := findOrCreateBatch(tx, itemID, "MAIN", "", nil, qty)
	if err != nil {
		return fmt.Errorf("stock credit failed")
	}
	reason := fmt.Sprintf("Pharmacy bill return line %d", lineID)
	if _, err := tx.Exec(`
		INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
		VALUES (?, ?, 'MAIN', 'RETURN', ?, ?, ?)
	`, itemID, batchID, qty, reason, actorUserID); err != nil {
		return fmt.Errorf("movement failed")
	}
	if _, err := tx.Exec(`
		INSERT INTO pharmacy_bill_stock_allocs (bill_id, bill_line_id, item_id, batch_id, qty)
		VALUES (?, ?, ?, ?, ?)
	`, billID, lineID, itemID, batchID, qty); err != nil {
		return fmt.Errorf("alloc failed")
	}
	return nil
}

func insertPharmacyBillLines(tx *sql.Tx, billID int64, lines []pharmacyBillLine) error {
	for _, l := range lines {
		if _, err := tx.Exec(`
			INSERT INTO pharmacy_bill_lines (
				bill_id, item_id, code, description, box_qty, strip_qty, tablet_qty,
				billing_qty, billing_unit, stock_qty, stock_unit, unit_price_mmk, line_total_mmk, sort_order
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, billID, l.ItemID, l.Code, l.Description, l.BoxQty, l.StripQty, l.TabletQty,
			l.BillingQty, l.BillingUnit, l.StockQty, l.StockUnit, l.UnitPriceMMK, l.LineTotalMMK, l.SortOrder); err != nil {
			return err
		}
	}
	return nil
}

func loadPharmacyBillLinesTx(tx *sql.Tx, billID int64) ([]pharmacyBillLine, error) {
	rows, err := tx.Query(`
		SELECT l.id, l.item_id, l.code, l.description, l.box_qty, l.strip_qty, l.tablet_qty,
		       l.billing_qty, l.billing_unit, l.stock_qty, l.stock_unit, l.unit_price_mmk, l.line_total_mmk, l.sort_order,
		       COALESCE(i.pack_l1_qty, 1), COALESCE(i.pack_l1_unit, ''),
		       COALESCE(i.pack_l2_qty, 1), COALESCE(i.pack_l2_unit, ''),
		       COALESCE(i.pack_l3_qty, 1), COALESCE(i.pack_l3_unit, '')
		FROM pharmacy_bill_lines l
		LEFT JOIN items i ON i.id = l.item_id
		WHERE l.bill_id = ? ORDER BY l.sort_order, l.id
	`, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]pharmacyBillLine, 0)
	for rows.Next() {
		var l pharmacyBillLine
		if err := rows.Scan(
			&l.ID, &l.ItemID, &l.Code, &l.Description, &l.BoxQty, &l.StripQty, &l.TabletQty,
			&l.BillingQty, &l.BillingUnit, &l.StockQty, &l.StockUnit, &l.UnitPriceMMK, &l.LineTotalMMK, &l.SortOrder,
			&l.PackL1Qty, &l.PackL1Unit, &l.PackL2Qty, &l.PackL2Unit, &l.PackL3Qty, &l.PackL3Unit,
		); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func loadPharmacyBill(db *sql.DB, id int64) (pharmacyBill, error) {
	row := db.QueryRow(`
		SELECT id, bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
		       description, status, total_mmk, paid_at, paid_by_user_id, voided_at, voided_by_user_id,
		       void_reason, created_by_user_id, created_at, updated_at,
		       discount_value, discount_unit, discount_mmk, printed_at, admission_id, collected_cash
		FROM pharmacy_bills WHERE id = ?
	`, id)
	bill, err := scanPharmacyBill(row)
	if err != nil {
		return bill, err
	}
	tx, err := db.Begin()
	if err != nil {
		return bill, err
	}
	defer tx.Rollback()
	lines, err := loadPharmacyBillLinesTx(tx, id)
	if err != nil {
		return bill, err
	}
	bill.Lines = lines
	return bill, nil
}

func scanPharmacyBill(s scanner) (pharmacyBill, error) {
	var b pharmacyBill
	var patientID, paidBy, voidedBy, createdBy, age, admissionID sql.NullInt64
	var paidAt, voidedAt, printedAt sql.NullString
	err := s.Scan(
		&b.ID, &b.BillNo, &patientID, &b.PatientName, &b.PatientPhone, &age, &b.PatientGender,
		&b.Description, &b.Status, &b.TotalMMK, &paidAt, &paidBy, &voidedAt, &voidedBy,
		&b.VoidReason, &createdBy, &b.CreatedAt, &b.UpdatedAt,
		&b.DiscountValue, &b.DiscountUnit, &b.DiscountMMK, &printedAt, &admissionID, &b.CollectedCash,
	)
	if err != nil {
		return b, err
	}
	if patientID.Valid {
		v := patientID.Int64
		b.PatientID = &v
	}
	if age.Valid {
		v := age.Int64
		b.PatientAgeYears = &v
	}
	if paidAt.Valid && paidAt.String != "" {
		s := paidAt.String
		b.PaidAt = &s
	}
	if paidBy.Valid {
		v := paidBy.Int64
		b.PaidByUserID = &v
	}
	if voidedAt.Valid && voidedAt.String != "" {
		s := voidedAt.String
		b.VoidedAt = &s
	}
	if voidedBy.Valid {
		v := voidedBy.Int64
		b.VoidedByUserID = &v
	}
	if createdBy.Valid {
		v := createdBy.Int64
		b.CreatedByUserID = &v
	}
	if printedAt.Valid && printedAt.String != "" {
		s := printedAt.String
		b.PrintedAt = &s
	}
	if admissionID.Valid {
		v := admissionID.Int64
		b.AdmissionID = &v
	}
	return b, nil
}

func upsertPharmacyPatient(tx *sql.Tx, req pharmacyBillWriteRequest) (int64, error) {
	name := strings.TrimSpace(req.PatientName)
	phone := strings.TrimSpace(req.PatientPhone)
	gender := strings.TrimSpace(req.PatientGender)
	if phone != "" {
		var id int64
		err := tx.QueryRow(`
			SELECT id FROM patients WHERE name = ? COLLATE NOCASE AND phone = ? ORDER BY id DESC LIMIT 1
		`, name, phone).Scan(&id)
		if err == nil {
			_, _ = tx.Exec(`
				UPDATE patients SET age_years = ?, gender = ?, updated_at = datetime('now') WHERE id = ?
			`, req.PatientAgeYears, gender, id)
			return id, nil
		}
		if err != sql.ErrNoRows {
			return 0, err
		}
	}
	res, err := tx.Exec(`
		INSERT INTO patients (name, phone, age_years, gender) VALUES (?, ?, ?, ?)
	`, name, phone, req.PatientAgeYears, gender)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// fefoDeductPharmacySale deducts MAIN stock FEFO and records pharmacy_bill_stock_allocs.
func fefoDeductPharmacySale(tx *sql.Tx, billID, lineID, itemID, qty, actorUserID int64) (int, error) {
	rows, err := tx.Query(unexpiredBatchSQL("id, qty"), itemID, "MAIN", localToday())
	if err != nil {
		return 0, fmt.Errorf("stock query failed")
	}
	type take struct {
		id  int64
		qty int64
	}
	takes := make([]take, 0)
	for rows.Next() {
		var t take
		if err := rows.Scan(&t.id, &t.qty); err != nil {
			rows.Close()
			return 0, fmt.Errorf("stock scan failed")
		}
		takes = append(takes, t)
	}
	rows.Close()

	var total int64
	for _, t := range takes {
		total += t.qty
	}
	if total < qty {
		var code string
		_ = tx.QueryRow(`SELECT code FROM items WHERE id = ?`, itemID).Scan(&code)
		if code == "" {
			code = fmt.Sprintf("#%d", itemID)
		}
		return 0, fmt.Errorf("insufficient stock for %s (need %d, have %d)", code, qty, total)
	}

	remaining := qty
	n := 0
	reason := fmt.Sprintf("Pharmacy bill sale line %d", lineID)
	for _, t := range takes {
		if remaining == 0 {
			break
		}
		use := t.qty
		if use > remaining {
			use = remaining
		}
		if _, err := tx.Exec(`
			UPDATE item_batches SET qty = qty - ?, updated_at = datetime('now') WHERE id = ?
		`, use, t.id); err != nil {
			return 0, fmt.Errorf("deduct failed")
		}
		if _, err := tx.Exec(`
			INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
			VALUES (?, ?, 'MAIN', 'SALE', ?, ?, ?)
		`, itemID, t.id, -use, reason, actorUserID); err != nil {
			return 0, fmt.Errorf("movement failed")
		}
		if _, err := tx.Exec(`
			INSERT INTO pharmacy_bill_stock_allocs (bill_id, bill_line_id, item_id, batch_id, qty)
			VALUES (?, ?, ?, ?, ?)
		`, billID, lineID, itemID, t.id, use); err != nil {
			return 0, fmt.Errorf("alloc failed")
		}
		remaining -= use
		n++
	}
	return n, nil
}
