package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

type pharmacyBillLine struct {
	ID           int64  `json:"id,omitempty"`
	ItemID       int64  `json:"item_id"`
	Code         string `json:"code"`
	Description  string `json:"description"`
	BillingQty   int64  `json:"billing_qty"`
	BillingUnit  string `json:"billing_unit"`
	StockQty     int64  `json:"stock_qty"`
	StockUnit    string `json:"stock_unit"`
	UnitPriceMMK int64  `json:"unit_price_mmk"`
	LineTotalMMK int64  `json:"line_total_mmk"`
	SortOrder    int    `json:"sort_order"`
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
}

func (h *Pharmacy) listPharmacyBills(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	query := `
		SELECT id, bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
		       description, status, total_mmk, paid_at, paid_by_user_id, voided_at, voided_by_user_id,
		       void_reason, created_by_user_id, created_at, updated_at
		FROM pharmacy_bills
	`
	args := make([]any, 0)
	where := make([]string, 0)
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if q != "" {
		like := "%" + q + "%"
		where = append(where, "(bill_no LIKE ? OR patient_name LIKE ? OR patient_phone LIKE ?)")
		args = append(args, like, like, like)
	}
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY created_at DESC, id DESC LIMIT 100"

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

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var patientID *int64
	if req.SavePatient {
		pid, err := upsertPharmacyPatient(tx, req)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "patient save failed"})
			return
		}
		patientID = &pid
	}

	billNo, err := nextPharmacyBillNo(tx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "bill number failed"})
		return
	}

	uid := user.ID
	res, err := tx.Exec(`
		INSERT INTO pharmacy_bills (
			bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
			description, status, total_mmk, created_by_user_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
	`, billNo, patientID, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
		strings.TrimSpace(req.PatientGender), strings.TrimSpace(req.Description), total, uid)
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
		"bill_no": billNo, "total_mmk": total,
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

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status string
	err = tx.QueryRow(`SELECT status FROM pharmacy_bills WHERE id = ?`, id).Scan(&status)
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

	var patientID *int64
	if req.SavePatient {
		pid, err := upsertPharmacyPatient(tx, req)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "patient save failed"})
			return
		}
		patientID = &pid
	}

	if _, err := tx.Exec(`
		UPDATE pharmacy_bills SET patient_id = ?, patient_name = ?, patient_phone = ?,
			patient_age_years = ?, patient_gender = ?, description = ?, total_mmk = ?,
			updated_at = datetime('now')
		WHERE id = ?
	`, patientID, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
		strings.TrimSpace(req.PatientGender), strings.TrimSpace(req.Description), total, id); err != nil {
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
	audit.WriteAudit(h.DB, &uid, "update", "pharmacy_bill", &id, map[string]any{"total_mmk": total})

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

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status string
	err = tx.QueryRow(`SELECT status FROM pharmacy_bills WHERE id = ?`, id).Scan(&status)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be paid"})
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
		if _, err := fefoDeductPharmacySale(tx, id, line.ID, line.ItemID, line.StockQty, uid); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}

	if _, err := tx.Exec(`
		UPDATE pharmacy_bills SET status = 'paid', paid_at = datetime('now'), paid_by_user_id = ?,
			updated_at = datetime('now')
		WHERE id = ?
	`, uid, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pay failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "pay", "pharmacy_bill", &id, map[string]any{"method": "cash"})

	bill, err := loadPharmacyBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
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
	err = tx.QueryRow(`SELECT status, bill_no FROM pharmacy_bills WHERE id = ?`, id).Scan(&status, &billNo)
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
	if status == "paid" {
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
			if _, err := tx.Exec(`
				UPDATE item_batches SET qty = qty + ?, updated_at = datetime('now') WHERE id = ?
			`, a.qty, a.batchID); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "stock restore failed"})
				return
			}
			if _, err := tx.Exec(`
				INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
				VALUES (?, ?, 'MAIN', 'SALE', ?, ?, ?)
			`, a.itemID, a.batchID, a.qty, reason, uid); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
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
		desc := line.Description
		if line.BillingUnit != "" {
			desc = fmt.Sprintf("%s (%s)", line.Description, line.BillingUnit)
		}
		lines = append(lines, receiptLine{
			Code:        line.Code,
			Description: desc,
			Qty:         line.BillingQty,
			UnitPrice:   line.UnitPriceMMK,
			LineTotal:   line.LineTotalMMK,
		})
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderThermalReceiptHTML(hosp, receiptBill{
		Title:         "PHARMACY RECEIPT",
		BillNo:        bill.BillNo,
		Status:        bill.Status,
		PatientName:   bill.PatientName,
		PatientPhone:  bill.PatientPhone,
		PatientAge:    bill.PatientAgeYears,
		PatientGender: bill.PatientGender,
		Note:          bill.Description,
		DateLabel:     dateLabel,
		TotalMMK:      bill.TotalMMK,
		Lines:         lines,
	})))
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

		billingQty := l.BillingQty
		if billingQty <= 0 {
			return nil, 0, "billing_qty must be > 0"
		}
		stockQty, msg := billingToStockQty(billingQty, item.BillingPerStock, item.ChargeFullStockUnit)
		if msg != "" {
			return nil, 0, fmt.Sprintf("%s: %s", item.Code, msg)
		}
		sell := item.SellPriceMMK
		if l.UnitPriceMMK > 0 {
			sell = l.UnitPriceMMK
		}
		lineTotal := lineChargeMMK(billingQty, stockQty, item.BillingPerStock, sell, item.ChargeFullStockUnit)

		desc := strings.TrimSpace(l.Description)
		if desc == "" {
			desc = item.Name
		}
		code := strings.TrimSpace(l.Code)
		if code == "" {
			code = item.Code
		}

		out = append(out, pharmacyBillLine{
			ItemID:       item.ID,
			Code:         code,
			Description:  desc,
			BillingQty:   billingQty,
			BillingUnit:  item.BillingUnit,
			StockQty:     stockQty,
			StockUnit:    item.StockUnit,
			UnitPriceMMK: sell,
			LineTotalMMK: lineTotal,
			SortOrder:    i,
		})
		total += lineTotal
	}
	return out, total, ""
}

func nextPharmacyBillNo(tx *sql.Tx) (string, error) {
	var n int64
	err := tx.QueryRow(`SELECT next_num FROM pharmacy_bill_number_seq WHERE id = 1`).Scan(&n)
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(`UPDATE pharmacy_bill_number_seq SET next_num = next_num + 1 WHERE id = 1`); err != nil {
		return "", err
	}
	return fmt.Sprintf("PH-%06d", n), nil
}

func insertPharmacyBillLines(tx *sql.Tx, billID int64, lines []pharmacyBillLine) error {
	for _, l := range lines {
		if _, err := tx.Exec(`
			INSERT INTO pharmacy_bill_lines (
				bill_id, item_id, code, description, billing_qty, billing_unit,
				stock_qty, stock_unit, unit_price_mmk, line_total_mmk, sort_order
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, billID, l.ItemID, l.Code, l.Description, l.BillingQty, l.BillingUnit,
			l.StockQty, l.StockUnit, l.UnitPriceMMK, l.LineTotalMMK, l.SortOrder); err != nil {
			return err
		}
	}
	return nil
}

func loadPharmacyBillLinesTx(tx *sql.Tx, billID int64) ([]pharmacyBillLine, error) {
	rows, err := tx.Query(`
		SELECT id, item_id, code, description, billing_qty, billing_unit,
		       stock_qty, stock_unit, unit_price_mmk, line_total_mmk, sort_order
		FROM pharmacy_bill_lines WHERE bill_id = ? ORDER BY sort_order, id
	`, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]pharmacyBillLine, 0)
	for rows.Next() {
		var l pharmacyBillLine
		if err := rows.Scan(
			&l.ID, &l.ItemID, &l.Code, &l.Description, &l.BillingQty, &l.BillingUnit,
			&l.StockQty, &l.StockUnit, &l.UnitPriceMMK, &l.LineTotalMMK, &l.SortOrder,
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
		       void_reason, created_by_user_id, created_at, updated_at
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
	var patientID, paidBy, voidedBy, createdBy, age sql.NullInt64
	var paidAt, voidedAt sql.NullString
	err := s.Scan(
		&b.ID, &b.BillNo, &patientID, &b.PatientName, &b.PatientPhone, &age, &b.PatientGender,
		&b.Description, &b.Status, &b.TotalMMK, &paidAt, &paidBy, &voidedAt, &voidedBy,
		&b.VoidReason, &createdBy, &b.CreatedAt, &b.UpdatedAt,
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
	rows, err := tx.Query(`
		SELECT id, qty FROM item_batches
		WHERE item_id = ? AND location_code = 'MAIN' AND qty > 0
		ORDER BY CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
		         expiry_date ASC, id ASC
	`, itemID)
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
