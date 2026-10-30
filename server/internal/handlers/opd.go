package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// OPD handles outpatient bills: draft → cash pay (FEFO SALE at MAIN) → print / void.
type OPD struct {
	DB *sql.DB
}

type opdBillLine struct {
	ID           int64  `json:"id,omitempty"`
	LineType     string `json:"line_type"`
	RefID        *int64 `json:"ref_id,omitempty"`
	Code         string `json:"code"`
	Description  string `json:"description"`
	Qty          int64  `json:"qty"`
	UnitPriceMMK int64  `json:"unit_price_mmk"`
	LineTotalMMK int64  `json:"line_total_mmk"`
	SortOrder    int    `json:"sort_order"`
	// FOC marks the line free of charge. Stored price stays non-negative; bill total skips it.
	Foc int `json:"foc"`
}

type opdBill struct {
	ID              int64         `json:"id"`
	BillNo          string        `json:"bill_no"`
	PatientID       *int64        `json:"patient_id,omitempty"`
	PatientName     string        `json:"patient_name"`
	PatientPhone    string        `json:"patient_phone"`
	PatientAgeYears *int64        `json:"patient_age_years,omitempty"`
	PatientGender   string        `json:"patient_gender"`
	DoctorID        *int64        `json:"doctor_id,omitempty"`
	DoctorName      string        `json:"doctor_name"`
	Description     string        `json:"description"`
	Status          string        `json:"status"`
	TotalMMK        int64         `json:"total_mmk"`
	DiscountValue   int64         `json:"discount_value"`
	DiscountUnit    string        `json:"discount_unit"`
	DiscountMMK     int64         `json:"discount_mmk"`
	PrintedAt       *string       `json:"printed_at,omitempty"`
	AdmissionID     *int64        `json:"admission_id,omitempty"`
	CollectedCash   int           `json:"collected_cash"`
	PaidAt          *string       `json:"paid_at,omitempty"`
	PaidByUserID    *int64        `json:"paid_by_user_id,omitempty"`
	VoidedAt        *string       `json:"voided_at,omitempty"`
	VoidedByUserID  *int64        `json:"voided_by_user_id,omitempty"`
	VoidReason      string        `json:"void_reason,omitempty"`
	CreatedByUserID *int64        `json:"created_by_user_id,omitempty"`
	CreatedAt       string        `json:"created_at"`
	UpdatedAt       string        `json:"updated_at"`
	BilledAt        *string       `json:"billed_at,omitempty"`
	Lines           []opdBillLine `json:"lines,omitempty"`
}

type opdBillWriteRequest struct {
	PatientName     string        `json:"patient_name"`
	PatientPhone    string        `json:"patient_phone"`
	PatientAgeYears *int64        `json:"patient_age_years,omitempty"`
	PatientGender   string        `json:"patient_gender"`
	DoctorID        *int64        `json:"doctor_id,omitempty"`
	DoctorName      string        `json:"doctor_name"`
	Description     string        `json:"description"`
	Lines           []opdBillLine `json:"lines"`
	SavePatient     bool          `json:"save_patient"`
	DiscountValue   int64         `json:"discount_value"`
	DiscountUnit    string        `json:"discount_unit"`
	PatientID       *int64        `json:"patient_id,omitempty"`
	BilledAt        string        `json:"billed_at,omitempty"`
}

type voidRequest struct {
	Reason string `json:"reason"`
}

type catalogDoctor struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	Specialty       string `json:"specialty"`
	ConsultationMMK int64  `json:"consultation_mmk"`
}

type catalogService struct {
	ID       int64  `json:"id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	PriceMMK int64  `json:"price_mmk"`
}

type catalogItem struct {
	ID           int64  `json:"id"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	SellPriceMMK int64  `json:"sell_price_mmk"`
	StockMain    int64  `json:"stock_main"`
}

func (h *OPD) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(h.DB, auth.PermOPD, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/opd")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}
		if !allowCell(h.DB, w, r, opdGrant(r.Method, path)) {
			return
		}

		switch {
		case path == "/catalog/doctors" && r.Method == http.MethodGet:
			h.catalogDoctors(w, r)
		case path == "/catalog/services" && r.Method == http.MethodGet:
			h.catalogServices(w, r)
		case path == "/catalog/items" && r.Method == http.MethodGet:
			h.catalogItems(w, r)
		case path == "/settings" && r.Method == http.MethodGet:
			h.catalogSettings(w, r)
		case path == "/bills" && r.Method == http.MethodGet:
			h.listBills(w, r)
		case path == "/bills" && r.Method == http.MethodPost:
			h.createBill(w, r)
		case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/pay") && r.Method == http.MethodPost:
			h.payBill(w, r, path)
		case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/printed") && r.Method == http.MethodPost:
			h.markBillPrinted(w, r, path)
		case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/void") && r.Method == http.MethodPost:
			h.voidBill(w, r, path)
		case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/print") && r.Method == http.MethodGet:
			h.printBill(w, r, path)
		case strings.HasPrefix(path, "/bills/") && r.Method == http.MethodGet:
			h.getBill(w, r, path)
		case strings.HasPrefix(path, "/bills/") && r.Method == http.MethodPut:
			h.updateBill(w, r, path)
		case strings.HasPrefix(path, "/bills/") && r.Method == http.MethodDelete:
			h.purgeBill(w, r, path)
		default:
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		}
	})).ServeHTTP(w, r)
}

func (h *OPD) catalogDoctors(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	var rows *sql.Rows
	var err error
	if q != "" {
		like := "%" + q + "%"
		rows, err = h.DB.Query(`
			SELECT d.id, d.name, d.specialty, COALESCE(c.amount_mmk, 0)
			FROM doctors d
			LEFT JOIN doctor_fees c ON c.doctor_id = d.id AND c.fee_type = 'consultation'
			WHERE d.active = 1 AND (d.name LIKE ? OR d.specialty LIKE ?)
			ORDER BY d.name COLLATE NOCASE
		`, like, like)
	} else {
		rows, err = h.DB.Query(`
			SELECT d.id, d.name, d.specialty, COALESCE(c.amount_mmk, 0)
			FROM doctors d
			LEFT JOIN doctor_fees c ON c.doctor_id = d.id AND c.fee_type = 'consultation'
			WHERE d.active = 1
			ORDER BY d.name COLLATE NOCASE
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	out := make([]catalogDoctor, 0)
	for rows.Next() {
		var d catalogDoctor
		if err := rows.Scan(&d.ID, &d.Name, &d.Specialty, &d.ConsultationMMK); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, d)
	}
	writeJSON(w, http.StatusOK, map[string]any{"doctors": out})
}

func (h *OPD) catalogServices(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	var rows *sql.Rows
	var err error
	if code != "" {
		rows, err = h.DB.Query(`
			SELECT id, COALESCE(code, ''), name, price_mmk FROM services
			WHERE active = 1 AND code = ? COLLATE NOCASE
		`, code)
	} else if q != "" {
		like := "%" + q + "%"
		rows, err = h.DB.Query(`
			SELECT id, COALESCE(code, ''), name, price_mmk FROM services
			WHERE active = 1 AND (code LIKE ? OR name LIKE ?)
			ORDER BY name COLLATE NOCASE LIMIT 50
		`, like, like)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, COALESCE(code, ''), name, price_mmk FROM services
			WHERE active = 1
			ORDER BY name COLLATE NOCASE LIMIT 100
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	out := make([]catalogService, 0)
	for rows.Next() {
		var s catalogService
		if err := rows.Scan(&s.ID, &s.Code, &s.Name, &s.PriceMMK); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": out})
}

func (h *OPD) catalogItems(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	var rows *sql.Rows
	var err error
	if code != "" {
		rows, err = h.DB.Query(`
			SELECT i.id, i.code, i.name, i.sell_price_mmk,
				COALESCE((SELECT SUM(b.qty) FROM item_batches b WHERE b.item_id = i.id AND b.location_code = 'MAIN'), 0)
			FROM items i
			WHERE i.active = 1 AND i.code = ? COLLATE NOCASE
		`, code)
	} else if q != "" {
		like := "%" + q + "%"
		rows, err = h.DB.Query(`
			SELECT i.id, i.code, i.name, i.sell_price_mmk,
				COALESCE((SELECT SUM(b.qty) FROM item_batches b WHERE b.item_id = i.id AND b.location_code = 'MAIN'), 0)
			FROM items i
			WHERE i.active = 1 AND (i.code LIKE ? OR i.name LIKE ?)
			ORDER BY i.code COLLATE NOCASE LIMIT 50
		`, like, like)
	} else {
		rows, err = h.DB.Query(`
			SELECT i.id, i.code, i.name, i.sell_price_mmk,
				COALESCE((SELECT SUM(b.qty) FROM item_batches b WHERE b.item_id = i.id AND b.location_code = 'MAIN'), 0)
			FROM items i
			WHERE i.active = 1
			ORDER BY i.code COLLATE NOCASE LIMIT 100
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	out := make([]catalogItem, 0)
	for rows.Next() {
		var it catalogItem
		if err := rows.Scan(&it.ID, &it.Code, &it.Name, &it.SellPriceMMK, &it.StockMain); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, it)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (h *OPD) catalogSettings(w http.ResponseWriter, _ *http.Request) {
	s, err := loadHospitalSettings(h.DB)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "settings load failed"})
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (h *OPD) listBills(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))

	query := `
		SELECT id, bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, description, status, total_mmk, paid_at, paid_by_user_id,
			voided_at, voided_by_user_id, void_reason, created_by_user_id, created_at, updated_at,
			discount_value, discount_unit, discount_mmk, printed_at, admission_id, collected_cash, billed_at
		FROM opd_bills
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

	out := make([]opdBill, 0)
	for rows.Next() {
		b, err := scanOpdBill(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, b)
	}
	writeJSON(w, http.StatusOK, map[string]any{"bills": out})
}

func (h *OPD) createBill(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	var req opdBillWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.PatientName = strings.TrimSpace(req.PatientName)
	if req.PatientName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "patient_name required"})
		return
	}
	override, status, errMsg := parseAdminBilledAt(user.Role, req.BilledAt)
	if errMsg != "" {
		writeJSON(w, status, map[string]string{"error": errMsg})
		return
	}
	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	doctorName, doctorID, err := resolveDoctor(tx, req.DoctorID, req.DoctorName)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	lines, total, errMsg := normalizeBillLines(tx, doctorID, doctorName, req.Lines)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	discountMMK, net, discountUnit, errMsg := applyBillDiscount(total, req.DiscountValue, req.DiscountUnit)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	patientID, err := resolveDeskPatient(tx, req.PatientID, req.SavePatient, req.PatientName, req.PatientPhone, req.PatientGender, req.PatientAgeYears, func() (int64, error) {
		return upsertPatient(tx, req)
	})
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "patient not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "patient save failed"})
		return
	}

	billNo, err := nextBillNo(tx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "bill number failed"})
		return
	}

	uid := user.ID
	var res sql.Result
	if override != nil {
		res, err = tx.Exec(`
			INSERT INTO opd_bills (
				bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
				doctor_id, doctor_name, description, status, total_mmk, created_by_user_id,
				discount_value, discount_unit, discount_mmk, billed_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
		`, billNo, patientID, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
			strings.TrimSpace(req.PatientGender), doctorID, doctorName, strings.TrimSpace(req.Description),
			net, uid, req.DiscountValue, discountUnit, discountMMK, override.Yangon, override.UTC, override.UTC)
	} else {
		res, err = tx.Exec(`
			INSERT INTO opd_bills (
				bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
				doctor_id, doctor_name, description, status, total_mmk, created_by_user_id,
				discount_value, discount_unit, discount_mmk
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
		`, billNo, patientID, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
			strings.TrimSpace(req.PatientGender), doctorID, doctorName, strings.TrimSpace(req.Description),
			net, uid, req.DiscountValue, discountUnit, discountMMK)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	billID, _ := res.LastInsertId()
	if err := insertBillLines(tx, billID, lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	auditPayload := map[string]any{
		"bill_no": billNo, "total_mmk": net, "discount_mmk": discountMMK,
	}
	if override != nil {
		auditPayload["billed_at"] = override.Yangon
	}
	audit.WriteAudit(h.DB, &uid, "create", "opd_bill", &billID, auditPayload)

	bill, err := loadOpdBill(h.DB, billID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, bill)
}

func (h *OPD) getBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/bills"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	bill, err := loadOpdBill(h.DB, id)
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

func (h *OPD) updateBill(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	id, ok := parseID(strings.TrimPrefix(path, "/bills"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var req opdBillWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.PatientName = strings.TrimSpace(req.PatientName)
	if req.PatientName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "patient_name required"})
		return
	}
	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status string
	err = tx.QueryRow(`SELECT status FROM opd_bills WHERE id = ?`, id).Scan(&status)
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

	doctorName, doctorID, err := resolveDoctor(tx, req.DoctorID, req.DoctorName)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	lines, total, errMsg := normalizeBillLines(tx, doctorID, doctorName, req.Lines)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	discountMMK, net, discountUnit, errMsg := applyBillDiscount(total, req.DiscountValue, req.DiscountUnit)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	patientID, err := resolveDeskPatient(tx, req.PatientID, req.SavePatient, req.PatientName, req.PatientPhone, req.PatientGender, req.PatientAgeYears, func() (int64, error) {
		return upsertPatient(tx, req)
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
		UPDATE opd_bills SET
			patient_id = ?, patient_name = ?, patient_phone = ?, patient_age_years = ?, patient_gender = ?,
			doctor_id = ?, doctor_name = ?, description = ?, total_mmk = ?,
			discount_value = ?, discount_unit = ?, discount_mmk = ?, updated_at = datetime('now')
		WHERE id = ?
	`, patientID, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
		strings.TrimSpace(req.PatientGender), doctorID, doctorName, strings.TrimSpace(req.Description),
		net, req.DiscountValue, discountUnit, discountMMK, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	if _, err := tx.Exec(`DELETE FROM bill_lines WHERE bill_id = ?`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines clear failed"})
		return
	}
	if err := insertBillLines(tx, id, lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "opd_bill", &id, map[string]any{
		"total_mmk": net, "discount_mmk": discountMMK,
	})

	bill, err := loadOpdBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *OPD) markBillPrinted(w http.ResponseWriter, r *http.Request, path string) {
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

	n, err := execMarkPrinted(tx, "opd_bills", id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "print stamp failed"})
		return
	}
	if n == 0 {
		var exists int
		err = tx.QueryRow(`SELECT 1 FROM opd_bills WHERE id = ?`, id).Scan(&exists)
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
	audit.WriteAudit(h.DB, &uid, "print", "opd_bill", &id, nil)

	bill, err := loadOpdBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *OPD) payBill(w http.ResponseWriter, r *http.Request, path string) {
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
	err = tx.QueryRow(`SELECT status, bill_no, patient_id, total_mmk FROM opd_bills WHERE id = ?`, id).Scan(&status, &billNo, &patientID, &total)
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
	charge := bindSaleCharge(tx, patientID, body.AdmissionID)
	if charge.reject(w) {
		return
	}

	lines, err := loadBillLinesTx(tx, id)
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
		if line.LineType != "item" || line.RefID == nil {
			continue
		}
		allocs, err := fefoDeductSale(tx, id, line.ID, *line.RefID, line.Qty, uid)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		_ = allocs
	}

	n, err := execPayDraft(tx, "opd_bills", id, uid, charge.AdmissionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pay failed"})
		return
	}
	if n == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be paid"})
		return
	}
	if charge.AdmissionID != nil {
		if err := postLedgerTx(tx, *charge.AdmissionID, "charge", -total, "opd", id, billNo, uid); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pay failed"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	detail := map[string]any{"method": "cash"}
	if charge.AdmissionID != nil {
		detail["method"] = "ipd"
		detail["admission_id"] = *charge.AdmissionID
	}
	audit.WriteAudit(h.DB, &uid, "pay", "opd_bill", &id, detail)

	bill, err := loadOpdBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *OPD) purgeBill(w http.ResponseWriter, r *http.Request, path string) {
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
	err = tx.QueryRow(`SELECT status, bill_no, total_mmk FROM opd_bills WHERE id = ?`, id).Scan(&status, &billNo, &totalMMK)
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
	if err := purgeBillLedgerTx(tx, "opd", id); err != nil {
		if err == errLedgerNotBalanced {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "ledger not balanced"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ledger purge failed"})
		return
	}
	res, err := tx.Exec(`
		UPDATE opd_bills SET status = 'deleted', updated_at = datetime('now') WHERE id = ?
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
	audit.WriteAudit(h.DB, &uid, "delete", "opd_bill", &id, map[string]any{
		"bill_no": billNo, "was_status": status, "status": "deleted", "total_mmk": totalMMK,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *OPD) voidBill(w http.ResponseWriter, r *http.Request, path string) {
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
	err = tx.QueryRow(`SELECT status, bill_no, admission_id FROM opd_bills WHERE id = ?`, id).Scan(&status, &billNo, &admissionID)
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

	uid := user.ID

	if status == "paid" && admissionID.Valid {
		if ensureOpenStay(tx, admissionID.Int64).reject(w) {
			return
		}
	}

	if status == "paid" {
		rows, err := tx.Query(`
			SELECT id, item_id, batch_id, qty FROM bill_stock_allocs WHERE bill_id = ?
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
				VALUES (?, ?, 'MAIN', 'RETURN', ?, ?, ?)
			`, a.itemID, a.batchID, a.qty, reason, uid); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
				return
			}
		}
		if admissionID.Valid {
			if err := reverseLedgerTx(tx, admissionID.Int64, "opd", id, uid, billNo); err != nil {
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
		UPDATE opd_bills SET status = 'void', voided_at = datetime('now'), voided_by_user_id = ?,
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

	audit.WriteAudit(h.DB, &uid, "void", "opd_bill", &id, map[string]any{
		"bill_no": billNo, "reason": req.Reason, "was_status": status,
	})

	bill, err := loadOpdBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *OPD) printBill(w http.ResponseWriter, r *http.Request, path string) {
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/bills/"), "/print")
	id, ok := parseID("/" + idPath)
	if !ok {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	bill, err := loadOpdBill(h.DB, id)
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

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderBillHTML(hosp, bill)))
}

// fefoDeductSale deducts MAIN stock FEFO, writes SALE movements, and records bill_stock_allocs.
func fefoDeductSale(tx *sql.Tx, billID, lineID, itemID, qty, actorUserID int64) (int, error) {
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
	reason := fmt.Sprintf("OPD bill sale line %d", lineID)
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
			INSERT INTO bill_stock_allocs (bill_id, bill_line_id, item_id, batch_id, qty)
			VALUES (?, ?, ?, ?, ?)
		`, billID, lineID, itemID, t.id, use); err != nil {
			return 0, fmt.Errorf("alloc failed")
		}
		remaining -= use
		n++
	}
	return n, nil
}

type queryRower interface {
	QueryRow(query string, args ...any) *sql.Row
}

// normalizeBillLines snapshots catalog prices. Client unit_price_mmk is ignored.
// Consultation uses the doctor's fee, quantity is 1, and a second consultation is rejected.
func normalizeBillLines(q queryRower, doctorID *int64, doctorName string, in []opdBillLine) ([]opdBillLine, int64, string) {
	out := make([]opdBillLine, 0, len(in))
	var total int64
	consultations := 0
	for i, l := range in {
		l.LineType = strings.TrimSpace(strings.ToLower(l.LineType))
		if l.LineType == "item" {
			return nil, 0, "pharmacy items belong on Pharmacy Billing, not OPD"
		}
		if l.LineType != "service" && l.LineType != "consultation" {
			return nil, 0, "invalid line_type"
		}
		foc, errMsg := normalizeFocFlag(l.Foc)
		if errMsg != "" {
			return nil, 0, errMsg
		}
		l.Foc = foc
		if l.LineType == "consultation" {
			consultations++
			if consultations > 1 {
				return nil, 0, "only one consultation line is allowed"
			}
			if doctorID == nil || *doctorID == 0 {
				return nil, 0, "consultation requires a doctor"
			}
			var fee int64
			err := q.QueryRow(`
				SELECT COALESCE(amount_mmk, 0) FROM doctor_fees
				WHERE doctor_id = ? AND fee_type = 'consultation'
			`, *doctorID).Scan(&fee)
			if err == sql.ErrNoRows {
				fee = 0
			} else if err != nil {
				return nil, 0, "consultation fee load failed"
			}
			l.Qty = 1
			l.UnitPriceMMK = fee
			l.Code = "CONSULT"
			if strings.TrimSpace(doctorName) != "" {
				l.Description = "Consultation — " + strings.TrimSpace(doctorName)
			} else {
				l.Description = "Consultation"
			}
			id := *doctorID
			l.RefID = &id
		} else {
			if l.RefID == nil || *l.RefID == 0 {
				return nil, 0, "service ref_id required"
			}
			if l.Qty <= 0 {
				return nil, 0, "line qty must be > 0"
			}
			var code, name string
			var price int64
			var active int
			err := q.QueryRow(`
				SELECT COALESCE(code, ''), name, price_mmk, active FROM services WHERE id = ?
			`, *l.RefID).Scan(&code, &name, &price, &active)
			if err == sql.ErrNoRows {
				return nil, 0, "service not found"
			}
			if err != nil {
				return nil, 0, "service load failed"
			}
			if active != 1 {
				return nil, 0, fmt.Sprintf("service %s is inactive", code)
			}
			ref := *l.RefID
			l.RefID = &ref
			l.Code = code
			l.Description = name
			l.UnitPriceMMK = price
		}
		l.LineTotalMMK = l.Qty * l.UnitPriceMMK
		l.SortOrder = i
		total += billableLineTotal(l.LineTotalMMK, l.Foc)
		out = append(out, l)
	}
	return out, total, ""
}

func resolveDoctor(tx *sql.Tx, doctorID *int64, doctorName string) (string, *int64, error) {
	if doctorID != nil && *doctorID != 0 {
		var name string
		var active int
		err := tx.QueryRow(`SELECT name, active FROM doctors WHERE id = ?`, *doctorID).Scan(&name, &active)
		if err == sql.ErrNoRows {
			return "", nil, fmt.Errorf("doctor not found")
		}
		if err != nil {
			return "", nil, fmt.Errorf("doctor load failed")
		}
		if active != 1 {
			return "", nil, fmt.Errorf("doctor inactive")
		}
		id := *doctorID
		return name, &id, nil
	}
	name := strings.TrimSpace(doctorName)
	if name == "" {
		return "", nil, nil
	}
	return name, nil, nil
}

func upsertPatient(tx *sql.Tx, req opdBillWriteRequest) (int64, error) {
	phone := strings.TrimSpace(req.PatientPhone)
	if phone != "" {
		var id int64
		err := tx.QueryRow(`
			SELECT id FROM patients WHERE phone = ? AND name = ? COLLATE NOCASE LIMIT 1
		`, phone, req.PatientName).Scan(&id)
		if err == nil {
			_, err = tx.Exec(`
				UPDATE patients SET age_years = ?, gender = ?, updated_at = datetime('now') WHERE id = ?
			`, req.PatientAgeYears, strings.TrimSpace(req.PatientGender), id)
			return id, err
		}
		if err != sql.ErrNoRows {
			return 0, err
		}
	}
	res, err := tx.Exec(`
		INSERT INTO patients (name, phone, age_years, gender) VALUES (?, ?, ?, ?)
	`, req.PatientName, phone, req.PatientAgeYears, strings.TrimSpace(req.PatientGender))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func nextBillNo(tx *sql.Tx) (string, error) {
	var n int64
	err := tx.QueryRow(`SELECT next_num FROM bill_number_seq WHERE id = 1`).Scan(&n)
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(`UPDATE bill_number_seq SET next_num = next_num + 1 WHERE id = 1`); err != nil {
		return "", err
	}
	return fmt.Sprintf("OPD-%06d", n), nil
}

func insertBillLines(tx *sql.Tx, billID int64, lines []opdBillLine) error {
	for _, l := range lines {
		if _, err := tx.Exec(`
			INSERT INTO bill_lines (bill_id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order, foc)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, billID, l.LineType, l.RefID, l.Code, l.Description, l.Qty, l.UnitPriceMMK, l.LineTotalMMK, l.SortOrder, l.Foc); err != nil {
			return err
		}
	}
	return nil
}

func loadBillLinesTx(tx *sql.Tx, billID int64) ([]opdBillLine, error) {
	rows, err := tx.Query(`
		SELECT id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order, foc
		FROM bill_lines WHERE bill_id = ? ORDER BY sort_order, id
	`, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]opdBillLine, 0)
	for rows.Next() {
		var l opdBillLine
		var ref sql.NullInt64
		if err := rows.Scan(&l.ID, &l.LineType, &ref, &l.Code, &l.Description, &l.Qty, &l.UnitPriceMMK, &l.LineTotalMMK, &l.SortOrder, &l.Foc); err != nil {
			return nil, err
		}
		if ref.Valid {
			v := ref.Int64
			l.RefID = &v
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func loadOpdBill(db *sql.DB, id int64) (opdBill, error) {
	row := db.QueryRow(`
		SELECT id, bill_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, description, status, total_mmk, paid_at, paid_by_user_id,
			voided_at, voided_by_user_id, void_reason, created_by_user_id, created_at, updated_at,
			discount_value, discount_unit, discount_mmk, printed_at, admission_id, collected_cash, billed_at
		FROM opd_bills WHERE id = ?
	`, id)
	b, err := scanOpdBill(row)
	if err != nil {
		return b, err
	}
	tx, err := db.Begin()
	if err != nil {
		return b, err
	}
	defer tx.Rollback()
	lines, err := loadBillLinesTx(tx, id)
	if err != nil {
		return b, err
	}
	b.Lines = lines
	return b, nil
}

type scannable interface {
	Scan(dest ...any) error
}

func scanOpdBill(row scannable) (opdBill, error) {
	var b opdBill
	var patientID, doctorID, paidBy, voidedBy, createdBy, admissionID sql.NullInt64
	var age sql.NullInt64
	var paidAt, voidedAt, printedAt, billedAt sql.NullString
	err := row.Scan(
		&b.ID, &b.BillNo, &patientID, &b.PatientName, &b.PatientPhone, &age, &b.PatientGender,
		&doctorID, &b.DoctorName, &b.Description, &b.Status, &b.TotalMMK, &paidAt, &paidBy,
		&voidedAt, &voidedBy, &b.VoidReason, &createdBy, &b.CreatedAt, &b.UpdatedAt,
		&b.DiscountValue, &b.DiscountUnit, &b.DiscountMMK, &printedAt, &admissionID, &b.CollectedCash, &billedAt,
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
	if doctorID.Valid {
		v := doctorID.Int64
		b.DoctorID = &v
	}
	if paidAt.Valid {
		v := paidAt.String
		b.PaidAt = &v
	}
	if paidBy.Valid {
		v := paidBy.Int64
		b.PaidByUserID = &v
	}
	if voidedAt.Valid {
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
	if printedAt.Valid && printedAt.String != "" {
		v := printedAt.String
		b.PrintedAt = &v
	}
	if admissionID.Valid {
		v := admissionID.Int64
		b.AdmissionID = &v
	}
	if billedAt.Valid && strings.TrimSpace(billedAt.String) != "" {
		v := billedAt.String
		b.BilledAt = &v
	}
	return b, nil
}

func renderBillHTML(hosp *hospitalSettings, bill opdBill) string {
	dateLabel := receiptDateLabel(bill.CreatedAt, bill.BilledAt, bill.PaidAt)
	lines := make([]receiptLine, 0, len(bill.Lines)*2)
	for _, line := range bill.Lines {
		lines = appendReceiptLine(lines, receiptLine{
			Code:        line.Code,
			Description: line.Description,
			Qty:         line.Qty,
			UnitPrice:   line.UnitPriceMMK,
			LineTotal:   line.LineTotalMMK,
		}, line.Foc)
	}
	printedAt := ""
	if bill.PrintedAt != nil {
		printedAt = *bill.PrintedAt
	}
	return renderThermalReceiptHTML(hosp, receiptBill{
		Title:          "OPD RECEIPT",
		BillNo:         bill.BillNo,
		Status:         bill.Status,
		PrintedAt:      printedAt,
		PatientName:    bill.PatientName,
		PatientPhone:   bill.PatientPhone,
		PatientAge:     bill.PatientAgeYears,
		PatientGender:  bill.PatientGender,
		DoctorName:     bill.DoctorName,
		Note:           bill.Description,
		DateLabel:      dateLabel,
		TotalMMK:       bill.TotalMMK + bill.DiscountMMK,
		NetMMK:         bill.TotalMMK,
		ShowSettlement: true,
		DiscountMMK:    bill.DiscountMMK,
		DiscountValue:  bill.DiscountValue,
		DiscountUnit:   bill.DiscountUnit,
		VoidReason:     bill.VoidReason,
		Lines:          lines,
	})
}

func formatMMK(n int64) string {
	s := fmt.Sprintf("%d", n)
	if n < 0 {
		s = s[1:]
	}
	var parts []string
	for len(s) > 3 {
		parts = append([]string{s[len(s)-3:]}, parts...)
		s = s[:len(s)-3]
	}
	parts = append([]string{s}, parts...)
	out := strings.Join(parts, ",")
	if n < 0 {
		return "-" + out
	}
	return out
}
