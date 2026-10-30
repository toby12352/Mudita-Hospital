package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"math"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

// ipdChargeBill is a free-text charge slip for one chart.
// total_mmk is the line sum before discount. The stay ledger is posted
// -(total_mmk - discount_mmk) when the bill is charged. There is no
// collected_cash column and no drawer line: the family pays on the day voucher.
type ipdChargeBill struct {
	ID              int64               `json:"id"`
	BillNo          string              `json:"bill_no"`
	PatientID       *int64              `json:"patient_id,omitempty"`
	PatientName     string              `json:"patient_name"`
	PatientPhone    string              `json:"patient_phone"`
	PatientAgeYears *int64              `json:"patient_age_years,omitempty"`
	PatientGender   string              `json:"patient_gender"`
	AdmissionID     *int64              `json:"admission_id,omitempty"`
	Status          string              `json:"status"`
	TotalMMK        int64               `json:"total_mmk"`
	DiscountValue   int64               `json:"discount_value"`
	DiscountUnit    string              `json:"discount_unit"`
	DiscountMMK     int64               `json:"discount_mmk"`
	PrintedAt       *string             `json:"printed_at,omitempty"`
	VoidedAt        *string             `json:"voided_at,omitempty"`
	VoidedByUserID  *int64              `json:"voided_by_user_id,omitempty"`
	VoidReason      string              `json:"void_reason,omitempty"`
	CreatedByUserID *int64              `json:"created_by_user_id,omitempty"`
	CreatedAt       string              `json:"created_at"`
	UpdatedAt       string              `json:"updated_at"`
	Lines           []ipdChargeBillLine `json:"lines,omitempty"`
}

type ipdChargeBillLine struct {
	ID           int64  `json:"id,omitempty"`
	Description  string `json:"description"`
	Qty          int64  `json:"qty"`
	UnitPriceMMK int64  `json:"unit_price_mmk"`
	LineTotalMMK int64  `json:"line_total_mmk"`
	SortOrder    int    `json:"sort_order"`
}

type ipdChargeBillWrite struct {
	PatientID       *int64                   `json:"patient_id"`
	PatientName     string                   `json:"patient_name"`
	PatientPhone    string                   `json:"patient_phone"`
	PatientAgeYears *int64                   `json:"patient_age_years"`
	PatientGender   string                   `json:"patient_gender"`
	DiscountValue   int64                    `json:"discount_value"`
	DiscountUnit    string                   `json:"discount_unit"`
	Lines           []ipdChargeBillLineInput `json:"lines"`
}

// ipdChargeBillLineInput keeps qty and unit_price_mmk raw so a fractional
// JSON number is rejected instead of truncated. Description is free text.
type ipdChargeBillLineInput struct {
	Description  string          `json:"description"`
	Qty          json.RawMessage `json:"qty"`
	UnitPriceMMK json.RawMessage `json:"unit_price_mmk"`
}

const ipdChargeBillColumns = `
	id, bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
	admission_id, status, total_mmk, discount_value, discount_unit, discount_mmk,
	printed_at, voided_at, voided_by_user_id, void_reason,
	created_by_user_id, created_at, updated_at`

func (h *IPD) listChargeBills(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	if status != "" && status != "draft" && status != "charged" && status != "void" && status != "deleted" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid status"})
		return
	}

	listReq := r
	chargedFilter := false
	if strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("money")), "paid") {
		chargedFilter = true
		clone := r.Clone(r.Context())
		u := *r.URL
		query := r.URL.Query()
		query.Del("money")
		u.RawQuery = query.Encode()
		clone.URL = &u
		listReq = clone
	}

	query := `SELECT ` + ipdChargeBillColumns + ` FROM ipd_charge_bills`
	args := make([]any, 0, 4)
	where := make([]string, 0, 4)
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if chargedFilter {
		where = append(where, "status = 'charged'")
	}
	if q != "" {
		like := "%" + q + "%"
		where = append(where, "(bill_no LIKE ? OR patient_name LIKE ?)")
		args = append(args, like, like)
	}
	var errMsg string
	where, args, errMsg = appendBillHistoryFilters(where, args, listReq, "status", "printed_at", "created_at", "")
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

	out := make([]ipdChargeBill, 0)
	for rows.Next() {
		b, err := scanIpdChargeBill(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"bills": out})
}

func (h *IPD) createChargeBill(w http.ResponseWriter, r *http.Request) {
	var req ipdChargeBillWrite
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.PatientName = strings.TrimSpace(req.PatientName)
	if req.PatientName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "patient_name required"})
		return
	}
	user := middleware.UserFromContext(r.Context())

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	prepared, code, errMsg := prepareChargeBillWrite(tx, req)
	if errMsg != "" {
		writeJSON(w, code, map[string]string{"error": errMsg})
		return
	}

	billNo, err := nextIpdChargeBillNo(tx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "bill number failed"})
		return
	}

	uid := user.ID
	res, err := tx.Exec(`
		INSERT INTO ipd_charge_bills (
			bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
			status, total_mmk, discount_value, discount_unit, discount_mmk, created_by_user_id
		) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
	`, billNo, prepared.PatientID, prepared.Name, prepared.Phone, prepared.Age, prepared.Gender,
		prepared.Gross, req.DiscountValue, prepared.DiscountUnit, prepared.DiscountMMK, uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	billID, _ := res.LastInsertId()
	if err := insertIpdChargeBillLines(tx, billID, prepared.Lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "create", "ipd_charge_bill", &billID, map[string]any{
		"bill_no": billNo, "total_mmk": prepared.Gross, "discount_mmk": prepared.DiscountMMK,
	})

	bill, err := loadIpdChargeBill(h.DB, billID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, bill)
}

func (h *IPD) getChargeBill(w http.ResponseWriter, _ *http.Request, path string) {
	id, ok := chargeBillID(path, "")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	bill, err := loadIpdChargeBill(h.DB, id)
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

func (h *IPD) updateChargeBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := chargeBillID(path, "")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req ipdChargeBillWrite
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.PatientName = strings.TrimSpace(req.PatientName)
	if req.PatientName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "patient_name required"})
		return
	}
	user := middleware.UserFromContext(r.Context())

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status string
	err = tx.QueryRow(`SELECT status FROM ipd_charge_bills WHERE id = ?`, id).Scan(&status)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if rejectDeletedBill(w, status) {
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be edited"})
		return
	}

	prepared, code, errMsg := prepareChargeBillWrite(tx, req)
	if errMsg != "" {
		writeJSON(w, code, map[string]string{"error": errMsg})
		return
	}

	res, err := tx.Exec(`
		UPDATE ipd_charge_bills SET
			patient_id = ?, patient_name = ?, patient_phone = ?, patient_age_years = ?, patient_gender = ?,
			total_mmk = ?, discount_value = ?, discount_unit = ?, discount_mmk = ?,
			updated_at = datetime('now')
		WHERE id = ? AND status = 'draft'
	`, prepared.PatientID, prepared.Name, prepared.Phone, prepared.Age, prepared.Gender,
		prepared.Gross, req.DiscountValue, prepared.DiscountUnit, prepared.DiscountMMK, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be edited"})
		return
	}
	if _, err := tx.Exec(`DELETE FROM ipd_charge_bill_lines WHERE bill_id = ?`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines clear failed"})
		return
	}
	if err := insertIpdChargeBillLines(tx, id, prepared.Lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "ipd_charge_bill", &id, map[string]any{
		"total_mmk": prepared.Gross, "discount_mmk": prepared.DiscountMMK,
	})

	bill, err := loadIpdChargeBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *IPD) markChargeBillPrinted(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := chargeBillID(path, "/printed")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	user := middleware.UserFromContext(r.Context())

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		UPDATE ipd_charge_bills
		SET printed_at = ?, updated_at = datetime('now')
		WHERE id = ? AND status = 'draft' AND (printed_at IS NULL OR printed_at = '')
	`, localCivilNow(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "print stamp failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		var status string
		var printed sql.NullString
		err = tx.QueryRow(`SELECT status, printed_at FROM ipd_charge_bills WHERE id = ?`, id).Scan(&status, &printed)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
			return
		}
		if rejectDeletedBill(w, status) {
			return
		}
		if status != "draft" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be marked printed"})
			return
		}
		if err := tx.Commit(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
			return
		}
		bill, err := loadIpdChargeBill(h.DB, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
			return
		}
		writeJSON(w, http.StatusOK, bill)
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "print", "ipd_charge_bill", &id, nil)

	bill, err := loadIpdChargeBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

// chargeBillToIPD posts the draft onto the chart's open stay.
// A typed name with no chart is refused. The ledger kind is charge, source ipd,
// and the amount is the negative net. No drawer line is written.
func (h *IPD) chargeBillToIPD(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := chargeBillID(path, "/charge")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	user := middleware.UserFromContext(r.Context())

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, billNo string
	var patientID sql.NullInt64
	var total, discount int64
	err = tx.QueryRow(`
		SELECT status, bill_no, patient_id, total_mmk, discount_mmk
		FROM ipd_charge_bills WHERE id = ?
	`, id).Scan(&status, &billNo, &patientID, &total, &discount)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if rejectDeletedBill(w, status) {
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be charged"})
		return
	}
	if !patientID.Valid {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "patient chart required"})
		return
	}
	var lineCount int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM ipd_charge_bill_lines WHERE bill_id = ?`, id).Scan(&lineCount); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines load failed"})
		return
	}
	if lineCount == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bill has no lines"})
		return
	}
	net := total - discount
	if net < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "discount exceeds total"})
		return
	}

	var admissionID int64
	err = tx.QueryRow(`
		SELECT id FROM ipd_admissions WHERE patient_id = ? AND status = 'open'
	`, patientID.Int64).Scan(&admissionID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "no open stay"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	uid := user.ID
	res, err := tx.Exec(`
		UPDATE ipd_charge_bills
		SET status = 'charged', admission_id = ?, updated_at = datetime('now')
		WHERE id = ? AND status = 'draft'
	`, admissionID, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "charge failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be charged"})
		return
	}
	if err := postLedgerTx(tx, admissionID, "charge", -net, "ipd", id, billNo, uid); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "charge failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "charge", "ipd_charge_bill", &id, map[string]any{
		"bill_no": billNo, "admission_id": admissionID, "amount_mmk": -net,
	})

	bill, err := loadIpdChargeBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *IPD) purgeChargeBill(w http.ResponseWriter, r *http.Request, path string) {
	user, ok := requireAdminUser(w, r)
	if !ok {
		return
	}
	id, ok := chargeBillID(path, "")
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
	err = tx.QueryRow(`SELECT status, bill_no, total_mmk FROM ipd_charge_bills WHERE id = ?`, id).Scan(&status, &billNo, &totalMMK)
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
	res, err := tx.Exec(`
		UPDATE ipd_charge_bills SET status = 'deleted', updated_at = datetime('now') WHERE id = ?
	`, id)
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
	audit.WriteAudit(h.DB, &uid, "delete", "ipd_charge_bill", &id, map[string]any{
		"bill_no": billNo, "was_status": status, "status": "deleted", "total_mmk": totalMMK,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *IPD) voidChargeBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := chargeBillID(path, "/void")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	user := middleware.UserFromContext(r.Context())

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
	err = tx.QueryRow(`
		SELECT status, bill_no, admission_id FROM ipd_charge_bills WHERE id = ?
	`, id).Scan(&status, &billNo, &admissionID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if rejectDeletedBill(w, status) {
		return
	}
	if status == "void" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "already void"})
		return
	}
	if status != "draft" && status != "charged" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft or charged bills can be voided"})
		return
	}

	uid := user.ID
	if status == "charged" {
		if !admissionID.Valid {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "ledger line missing"})
			return
		}
		if ensureOpenStay(tx, admissionID.Int64).reject(w) {
			return
		}
		var createdAt string
		err = tx.QueryRow(`
			SELECT created_at FROM ipd_ledger
			WHERE admission_id = ? AND source = 'ipd' AND source_id = ? AND kind = 'charge'
			ORDER BY id DESC LIMIT 1
		`, admissionID.Int64, id).Scan(&createdAt)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "ledger line missing"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
			return
		}
		day, ok := yangonDateKey(createdAt)
		if !ok {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "charge date unknown"})
			return
		}
		var voucherStatus string
		err = tx.QueryRow(`
			SELECT status FROM ipd_day_vouchers
			WHERE admission_id = ? AND civil_date = ?
		`, admissionID.Int64, day).Scan(&voucherStatus)
		if err == sql.ErrNoRows {
			voucherStatus = ""
		} else if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
			return
		}
		if voucherStatus == "paid" {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "day is already paid"})
			return
		}
		if err := reverseLedgerTx(tx, admissionID.Int64, "ipd", id, uid, billNo); err != nil {
			msg := "void failed"
			if err == sql.ErrNoRows {
				msg = "ledger line missing"
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": msg})
			return
		}
		if err := refreshUnpaidVoucherClosing(tx, admissionID.Int64, day); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "void failed"})
			return
		}
	}

	if _, err := tx.Exec(`
		UPDATE ipd_charge_bills SET status = 'void', voided_at = datetime('now'), voided_by_user_id = ?,
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

	audit.WriteAudit(h.DB, &uid, "void", "ipd_charge_bill", &id, map[string]any{
		"bill_no": billNo, "reason": req.Reason, "was_status": status,
	})

	bill, err := loadIpdChargeBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *IPD) printChargeBill(w http.ResponseWriter, _ *http.Request, path string) {
	id, ok := chargeBillID(path, "/print")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	h.writeChargeBillHTML(w, id)
}

func (h *IPD) writeChargeBillHTML(w http.ResponseWriter, id int64) {
	bill, err := loadIpdChargeBill(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	hosp, err := loadHospitalSettings(h.DB)
	if err != nil || hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	page := renderIpdChargeBillHTML(hosp, bill, chargeBillDateLabel(h.DB, bill), chargeBillAdmissionNo(h.DB, bill.AdmissionID))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(page))
}

// refreshUnpaidVoucherClosing rewrites the stored closing after a reversal
// when that day is still issued or credit. A paid day is refused before this
// runs. If the previous day is still issued, the sheet cannot be rebuilt and
// the stored closing is left for the next issue call.
func refreshUnpaidVoucherClosing(tx *sql.Tx, admissionID int64, civilDate string) error {
	v, err := loadDayVoucher(tx, admissionID, civilDate)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if v.Status != "issued" && v.Status != "credit" {
		return nil
	}
	closing, err := sheetClosingTx(tx, admissionID, civilDate)
	if err != nil {
		if errors.Is(err, errPreviousVoucherIssued) {
			return nil
		}
		return err
	}
	_, err = tx.Exec(`
		UPDATE ipd_day_vouchers
		SET closing_mmk = ?, updated_at = datetime('now')
		WHERE id = ? AND status IN ('issued', 'credit')
	`, closing, v.ID)
	return err
}

type chargeBillPrepared struct {
	Lines        []ipdChargeBillLine
	Gross        int64
	DiscountMMK  int64
	DiscountUnit string
	PatientID    any
	Name         string
	Phone        string
	Age          any
	Gender       string
}

func prepareChargeBillWrite(tx *sql.Tx, req ipdChargeBillWrite) (chargeBillPrepared, int, string) {
	var prepared chargeBillPrepared
	lines, gross, errMsg := normalizeIpdChargeLines(req.Lines)
	if errMsg != "" {
		return prepared, http.StatusBadRequest, errMsg
	}
	discountMMK, _, discountUnit, errMsg := applyBillDiscount(gross, req.DiscountValue, req.DiscountUnit)
	if errMsg != "" {
		return prepared, http.StatusBadRequest, errMsg
	}
	patientID, code, errMsg := resolveChargePatient(tx, req.PatientID)
	if errMsg != "" {
		return prepared, code, errMsg
	}
	age, errMsg := chargeAgeValue(req.PatientAgeYears)
	if errMsg != "" {
		return prepared, http.StatusBadRequest, errMsg
	}
	prepared = chargeBillPrepared{
		Lines:        lines,
		Gross:        gross,
		DiscountMMK:  discountMMK,
		DiscountUnit: discountUnit,
		PatientID:    patientID,
		Name:         strings.TrimSpace(req.PatientName),
		Phone:        strings.TrimSpace(req.PatientPhone),
		Age:          age,
		Gender:       strings.TrimSpace(req.PatientGender),
	}
	return prepared, 0, ""
}

func resolveChargePatient(tx *sql.Tx, id *int64) (any, int, string) {
	if id == nil {
		return nil, 0, ""
	}
	if *id < 1 {
		return nil, http.StatusBadRequest, "invalid patient_id"
	}
	var n int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM patients WHERE id = ?`, *id).Scan(&n); err != nil {
		return nil, http.StatusInternalServerError, "patient load failed"
	}
	if n == 0 {
		return nil, http.StatusNotFound, "patient not found"
	}
	return *id, 0, ""
}

func chargeAgeValue(age *int64) (any, string) {
	if age == nil {
		return nil, ""
	}
	if *age < 0 {
		return nil, "age must be >= 0"
	}
	return *age, ""
}

func normalizeIpdChargeLines(in []ipdChargeBillLineInput) ([]ipdChargeBillLine, int64, string) {
	if len(in) == 0 {
		return nil, 0, "at least one line"
	}
	out := make([]ipdChargeBillLine, 0, len(in))
	var total int64
	for i, raw := range in {
		desc := strings.TrimSpace(raw.Description)
		if desc == "" {
			return nil, 0, "description required"
		}
		qty, errMsg := parseExpenseQty(raw.Qty)
		if errMsg != "" {
			return nil, 0, errMsg
		}
		price, errMsg := parseExpenseUnitPrice(raw.UnitPriceMMK)
		if errMsg != "" {
			return nil, 0, errMsg
		}
		if qty > 1 && price > math.MaxInt64/qty {
			return nil, 0, "line total too large"
		}
		lineTotal := qty * price
		out = append(out, ipdChargeBillLine{
			Description:  desc,
			Qty:          qty,
			UnitPriceMMK: price,
			LineTotalMMK: lineTotal,
			SortOrder:    i,
		})
		total += lineTotal
	}
	return out, total, ""
}

func nextIpdChargeBillNo(tx *sql.Tx) (string, error) {
	var n int64
	err := tx.QueryRow(`SELECT next_num FROM ipd_charge_bill_number_seq WHERE id = 1`).Scan(&n)
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(`UPDATE ipd_charge_bill_number_seq SET next_num = next_num + 1 WHERE id = 1`); err != nil {
		return "", err
	}
	return fmt.Sprintf("IPB-%06d", n), nil
}

func insertIpdChargeBillLines(tx *sql.Tx, billID int64, lines []ipdChargeBillLine) error {
	for _, l := range lines {
		if _, err := tx.Exec(`
			INSERT INTO ipd_charge_bill_lines (
				bill_id, description, qty, unit_price_mmk, line_total_mmk, sort_order
			) VALUES (?, ?, ?, ?, ?, ?)
		`, billID, l.Description, l.Qty, l.UnitPriceMMK, l.LineTotalMMK, l.SortOrder); err != nil {
			return err
		}
	}
	return nil
}

func loadIpdChargeBill(db *sql.DB, id int64) (ipdChargeBill, error) {
	row := db.QueryRow(`SELECT `+ipdChargeBillColumns+` FROM ipd_charge_bills WHERE id = ?`, id)
	b, err := scanIpdChargeBill(row)
	if err != nil {
		return b, err
	}
	lines, err := queryIpdChargeBillLines(db, id)
	if err != nil {
		return b, err
	}
	b.Lines = lines
	return b, nil
}

func queryIpdChargeBillLines(db sqlQuery, billID int64) ([]ipdChargeBillLine, error) {
	rows, err := db.Query(`
		SELECT id, description, qty, unit_price_mmk, line_total_mmk, sort_order
		FROM ipd_charge_bill_lines WHERE bill_id = ? ORDER BY sort_order, id
	`, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ipdChargeBillLine, 0)
	for rows.Next() {
		var l ipdChargeBillLine
		if err := rows.Scan(&l.ID, &l.Description, &l.Qty, &l.UnitPriceMMK, &l.LineTotalMMK, &l.SortOrder); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func scanIpdChargeBill(row scannable) (ipdChargeBill, error) {
	var b ipdChargeBill
	var patientID, age, admissionID, voidedBy, createdBy sql.NullInt64
	var printedAt, voidedAt sql.NullString
	err := row.Scan(
		&b.ID, &b.BillNo, &patientID, &b.PatientName, &b.PatientPhone, &age, &b.PatientGender,
		&admissionID, &b.Status, &b.TotalMMK, &b.DiscountValue, &b.DiscountUnit, &b.DiscountMMK,
		&printedAt, &voidedAt, &voidedBy, &b.VoidReason,
		&createdBy, &b.CreatedAt, &b.UpdatedAt,
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
	if admissionID.Valid {
		v := admissionID.Int64
		b.AdmissionID = &v
	}
	if printedAt.Valid && printedAt.String != "" {
		v := printedAt.String
		b.PrintedAt = &v
	}
	if voidedAt.Valid && voidedAt.String != "" {
		v := voidedAt.String
		b.VoidedAt = &v
	}
	if voidedBy.Valid {
		v := voidedBy.Int64
		b.VoidedByUserID = &v
	}
	if createdBy.Valid {
		v := createdBy.Int64
		b.CreatedByUserID = &v
	}
	return b, nil
}

func chargeBillID(path, suffix string) (int64, bool) {
	rest := strings.TrimPrefix(path, "/charge-bills/")
	if rest == path || rest == "" {
		return 0, false
	}
	if suffix != "" {
		if !strings.HasSuffix(rest, suffix) {
			return 0, false
		}
		rest = strings.TrimSuffix(rest, suffix)
	}
	if rest == "" || strings.Contains(rest, "/") {
		return 0, false
	}
	return parseID("/" + rest)
}

func chargeBillDateLabel(db *sql.DB, bill ipdChargeBill) string {
	if bill.Status == "charged" || bill.Status == "void" {
		var created string
		err := db.QueryRow(`
			SELECT created_at FROM ipd_ledger
			WHERE source = 'ipd' AND source_id = ? AND kind = 'charge'
			ORDER BY id DESC LIMIT 1
		`, bill.ID).Scan(&created)
		if err == nil && strings.TrimSpace(created) != "" {
			return receiptDateLabel(created, nil, nil)
		}
	}
	return receiptDateLabel(bill.CreatedAt, nil, nil)
}

func chargeBillAdmissionNo(db *sql.DB, admissionID *int64) string {
	if admissionID == nil || *admissionID < 1 {
		return ""
	}
	var no string
	if err := db.QueryRow(`SELECT admission_no FROM ipd_admissions WHERE id = ?`, *admissionID).Scan(&no); err != nil {
		return ""
	}
	return no
}

func chargeBillStatusLine(bill ipdChargeBill) string {
	switch bill.Status {
	case "charged":
		return "Charged to IPD"
	case "void":
		if strings.TrimSpace(bill.VoidReason) != "" {
			return "VOID — " + strings.TrimSpace(bill.VoidReason)
		}
		return "VOID"
	case "deleted":
		return "DELETED"
	default:
		return "DRAFT"
	}
}

func renderIpdChargeBillHTML(hosp *hospitalSettings, bill ipdChargeBill, dateLabel, admissionNo string) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>`)
	b.WriteString(html.EscapeString(bill.BillNo))
	b.WriteString(`</title><style>`)
	b.WriteString(a4ReceiptCSS())
	b.WriteString(`.a4-status{margin-top:14px;font-size:12pt;font-weight:700}`)
	b.WriteString(`</style></head><body><div class="a4-sheet">`)
	writeA4Letterhead(&b, hosp)
	b.WriteString(`<p class="a4-title">IPD CHARGE BILL</p>`)
	b.WriteString(`<div class="a4-meta"><div class="a4-meta-col"><p class="a4-meta-heading">Patient</p>`)
	writeA4KV(&b, "Name", bill.PatientName)
	if bill.PatientAgeYears != nil {
		writeA4KV(&b, "Age", fmt.Sprintf("%d", *bill.PatientAgeYears))
	}
	writeA4KV(&b, "Sex", bill.PatientGender)
	writeA4KV(&b, "Phone", bill.PatientPhone)
	b.WriteString(`</div><div class="a4-meta-col"><p class="a4-meta-heading">Bill</p>`)
	writeA4KV(&b, "Bill No", bill.BillNo)
	writeA4KV(&b, "Admission No", admissionNo)
	writeA4KV(&b, "Date", dateLabel)
	writeA4KV(&b, "Status", chargeBillStatusLine(bill))
	b.WriteString(`</div></div>`)

	if len(bill.Lines) > 0 {
		b.WriteString(`<table class="a4-items"><thead><tr>`)
		b.WriteString(`<th>Particular</th><th class="col-qty">Qty</th><th class="col-amt">Fee</th>`)
		b.WriteString(`</tr></thead><tbody>`)
		for _, line := range bill.Lines {
			b.WriteString(`<tr><td>`)
			b.WriteString(html.EscapeString(line.Description))
			b.WriteString(`</td><td class="col-qty">`)
			b.WriteString(fmt.Sprintf("%d", line.Qty))
			b.WriteString(`</td><td class="col-amt">`)
			b.WriteString(formatMMK(line.LineTotalMMK))
			b.WriteString(`</td></tr>`)
		}
		b.WriteString(`</tbody></table>`)
	}

	net := bill.TotalMMK - bill.DiscountMMK
	if net < 0 {
		net = 0
	}
	b.WriteString(`<table class="a4-settle">`)
	writeA4SettleRow(&b, "Total", bill.TotalMMK, false)
	if bill.DiscountMMK != 0 {
		label := "Discount"
		if strings.EqualFold(bill.DiscountUnit, "percent") && bill.DiscountValue > 0 {
			label = fmt.Sprintf("Discount (%d%%)", bill.DiscountValue)
		}
		writeA4SettleRow(&b, label, bill.DiscountMMK, false)
	}
	writeA4SettleRow(&b, "Net", net, true)
	b.WriteString(`</table>`)
	b.WriteString(`<p class="a4-status">`)
	b.WriteString(html.EscapeString(chargeBillStatusLine(bill)))
	b.WriteString(`</p></div></body></html>`)
	return b.String()
}
