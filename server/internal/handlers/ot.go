package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// OT handles case cart: draft → issue (MAIN→OT_RESERVED) → reconcile → bill → cash/print.
type OT struct {
	DB *sql.DB
}

type otCaseItem struct {
	ID              int64  `json:"id,omitempty"`
	ItemID          int64  `json:"item_id"`
	Code            string `json:"code"`
	Name            string `json:"name"`
	SellPriceMMK    int64  `json:"sell_price_mmk"`
	QtyIssued       int64  `json:"qty_issued"`
	QtyUsed         int64  `json:"qty_used"`
	QtyReturned     int64  `json:"qty_returned"`
	QtyWasted       int64  `json:"qty_wasted"`
	QtyKeptOnFloor  int64  `json:"qty_kept_on_floor"`
	SortOrder       int    `json:"sort_order"`
}

type otCase struct {
	ID                   int64        `json:"id"`
	CaseNo               string       `json:"case_no"`
	PatientName          string       `json:"patient_name"`
	PatientPhone         string       `json:"patient_phone"`
	PatientAgeYears      *int64       `json:"patient_age_years,omitempty"`
	PatientGender        string       `json:"patient_gender"`
	DoctorID             *int64       `json:"doctor_id,omitempty"`
	DoctorName           string       `json:"doctor_name"`
	ProcedureName        string       `json:"procedure_name"`
	Notes                string       `json:"notes"`
	Status               string       `json:"status"`
	IssuedAt             *string      `json:"issued_at,omitempty"`
	ReconciledAt         *string      `json:"reconciled_at,omitempty"`
	OtBillID             *int64       `json:"ot_bill_id,omitempty"`
	CreatedByUserID      *int64       `json:"created_by_user_id,omitempty"`
	CreatedAt            string       `json:"created_at"`
	UpdatedAt            string       `json:"updated_at"`
	Items                []otCaseItem `json:"items,omitempty"`
	DoctorOTFeeMMK       int64        `json:"doctor_ot_fee_mmk,omitempty"`
}

type otCaseWriteRequest struct {
	PatientName     string       `json:"patient_name"`
	PatientPhone    string       `json:"patient_phone"`
	PatientAgeYears *int64       `json:"patient_age_years,omitempty"`
	PatientGender   string       `json:"patient_gender"`
	DoctorID        *int64       `json:"doctor_id,omitempty"`
	DoctorName      string       `json:"doctor_name"`
	ProcedureName   string       `json:"procedure_name"`
	Notes           string       `json:"notes"`
	Items           []otCaseItem `json:"items"`
}

type otReconcileItem struct {
	ID             int64 `json:"id"`
	QtyUsed        int64 `json:"qty_used"`
	QtyReturned    int64 `json:"qty_returned"`
	QtyWasted      int64 `json:"qty_wasted"`
	QtyKeptOnFloor int64 `json:"qty_kept_on_floor"`
}

type otReconcileRequest struct {
	Items []otReconcileItem `json:"items"`
}

type otBillLine struct {
	ID           int64  `json:"id,omitempty"`
	LineType     string `json:"line_type"`
	RefID        *int64 `json:"ref_id,omitempty"`
	Code         string `json:"code"`
	Description  string `json:"description"`
	Qty          int64  `json:"qty"`
	UnitPriceMMK int64  `json:"unit_price_mmk"`
	LineTotalMMK int64  `json:"line_total_mmk"`
	SortOrder    int    `json:"sort_order"`
}

type otBill struct {
	ID              int64        `json:"id"`
	BillNo          string       `json:"bill_no"`
	CaseID          int64        `json:"case_id"`
	CaseNo          string       `json:"case_no"`
	PatientName     string       `json:"patient_name"`
	PatientPhone    string       `json:"patient_phone"`
	PatientAgeYears *int64       `json:"patient_age_years,omitempty"`
	PatientGender   string       `json:"patient_gender"`
	DoctorID        *int64       `json:"doctor_id,omitempty"`
	DoctorName      string       `json:"doctor_name"`
	ProcedureName   string       `json:"procedure_name"`
	Status          string       `json:"status"`
	TotalMMK        int64        `json:"total_mmk"`
	PaidAt          *string      `json:"paid_at,omitempty"`
	VoidedAt        *string      `json:"voided_at,omitempty"`
	VoidReason      string       `json:"void_reason,omitempty"`
	CreatedAt       string       `json:"created_at"`
	UpdatedAt       string       `json:"updated_at"`
	Lines           []otBillLine `json:"lines,omitempty"`
}

type otCreateBillRequest struct {
	// Optional extra service lines (used items + doctor OT fee are auto-added).
	Services []otBillLine `json:"services"`
}

type otCatalogDoctor struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Specialty string `json:"specialty"`
	OTFeeMMK  int64  `json:"ot_fee_mmk"`
}

func (h *OT) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(h.DB, auth.PermOT, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/ot")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
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
		case path == "/cases" && r.Method == http.MethodGet:
			h.listCases(w, r)
		case path == "/cases" && r.Method == http.MethodPost:
			h.createCase(w, r)
		case strings.HasPrefix(path, "/cases/") && strings.HasSuffix(path, "/issue") && r.Method == http.MethodPost:
			h.issueCase(w, r, path)
		case strings.HasPrefix(path, "/cases/") && strings.HasSuffix(path, "/reconcile") && r.Method == http.MethodPost:
			h.reconcileCase(w, r, path)
		case strings.HasPrefix(path, "/cases/") && strings.HasSuffix(path, "/bill") && r.Method == http.MethodPost:
			h.createBillFromCase(w, r, path)
		case strings.HasPrefix(path, "/cases/") && strings.HasSuffix(path, "/pick-list") && r.Method == http.MethodGet:
			h.printPickList(w, r, path)
		case strings.HasPrefix(path, "/cases/") && r.Method == http.MethodGet:
			h.getCase(w, r, path)
		case strings.HasPrefix(path, "/cases/") && r.Method == http.MethodPut:
			h.updateCase(w, r, path)
		case path == "/bills" && r.Method == http.MethodGet:
			h.listBills(w, r)
		case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/pay") && r.Method == http.MethodPost:
			h.payBill(w, r, path)
		case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/void") && r.Method == http.MethodPost:
			h.voidBill(w, r, path)
		case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/print") && r.Method == http.MethodGet:
			h.printBill(w, r, path)
		case strings.HasPrefix(path, "/bills/") && r.Method == http.MethodGet:
			h.getBill(w, r, path)
		case strings.HasPrefix(path, "/bills/") && r.Method == http.MethodPut:
			h.updateBill(w, r, path)
		default:
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		}
	})).ServeHTTP(w, r)
}

func (h *OT) catalogDoctors(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	var rows *sql.Rows
	var err error
	if q != "" {
		like := "%" + q + "%"
		rows, err = h.DB.Query(`
			SELECT d.id, d.name, d.specialty, COALESCE(f.amount_mmk, 0)
			FROM doctors d
			LEFT JOIN doctor_fees f ON f.doctor_id = d.id AND f.fee_type = 'ot'
			WHERE d.active = 1 AND (d.name LIKE ? OR d.specialty LIKE ?)
			ORDER BY d.name COLLATE NOCASE
		`, like, like)
	} else {
		rows, err = h.DB.Query(`
			SELECT d.id, d.name, d.specialty, COALESCE(f.amount_mmk, 0)
			FROM doctors d
			LEFT JOIN doctor_fees f ON f.doctor_id = d.id AND f.fee_type = 'ot'
			WHERE d.active = 1
			ORDER BY d.name COLLATE NOCASE
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()
	out := make([]otCatalogDoctor, 0)
	for rows.Next() {
		var d otCatalogDoctor
		if err := rows.Scan(&d.ID, &d.Name, &d.Specialty, &d.OTFeeMMK); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, d)
	}
	writeJSON(w, http.StatusOK, map[string]any{"doctors": out})
}

func (h *OT) catalogServices(w http.ResponseWriter, r *http.Request) {
	// Reuse OPD catalog shape via shared query.
	(&OPD{DB: h.DB}).catalogServices(w, r)
}

func (h *OT) catalogItems(w http.ResponseWriter, r *http.Request) {
	(&OPD{DB: h.DB}).catalogItems(w, r)
}

func (h *OT) catalogSettings(w http.ResponseWriter, r *http.Request) {
	(&OPD{DB: h.DB}).catalogSettings(w, r)
}

func (h *OT) listCases(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	query := `
		SELECT id, case_no, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, procedure_name, notes, status, issued_at, reconciled_at,
			ot_bill_id, created_by_user_id, created_at, updated_at
		FROM ot_cases
	`
	args := make([]any, 0)
	where := make([]string, 0)
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if q != "" {
		like := "%" + q + "%"
		where = append(where, "(case_no LIKE ? OR patient_name LIKE ? OR patient_phone LIKE ? OR procedure_name LIKE ?)")
		args = append(args, like, like, like, like)
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
	out := make([]otCase, 0)
	for rows.Next() {
		c, err := scanOtCase(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"cases": out})
}

func (h *OT) createCase(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	var req otCaseWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.PatientName = strings.TrimSpace(req.PatientName)
	if req.PatientName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "patient_name required"})
		return
	}
	items, errMsg := normalizeOtCaseItems(req.Items)
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

	doctorName, doctorID, err := resolveDoctor(tx, req.DoctorID, req.DoctorName)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := enrichOtCaseItems(tx, items); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	caseNo, err := nextOtCaseNo(tx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "case number failed"})
		return
	}
	uid := user.ID
	res, err := tx.Exec(`
		INSERT INTO ot_cases (
			case_no, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, procedure_name, notes, status, created_by_user_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
	`, caseNo, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
		strings.TrimSpace(req.PatientGender), doctorID, doctorName,
		strings.TrimSpace(req.ProcedureName), strings.TrimSpace(req.Notes), uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	caseID, _ := res.LastInsertId()
	if err := insertOtCaseItems(tx, caseID, items); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "items failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "create", "ot_case", &caseID, map[string]any{"case_no": caseNo})
	c, err := loadOtCase(h.DB, caseID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (h *OT) getCase(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/cases"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	c, err := loadOtCase(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (h *OT) updateCase(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	id, ok := parseID(strings.TrimPrefix(path, "/cases"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req otCaseWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.PatientName = strings.TrimSpace(req.PatientName)
	if req.PatientName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "patient_name required"})
		return
	}
	items, errMsg := normalizeOtCaseItems(req.Items)
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

	var status string
	err = tx.QueryRow(`SELECT status FROM ot_cases WHERE id = ?`, id).Scan(&status)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft cases can be edited"})
		return
	}

	doctorName, doctorID, err := resolveDoctor(tx, req.DoctorID, req.DoctorName)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := enrichOtCaseItems(tx, items); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if _, err := tx.Exec(`
		UPDATE ot_cases SET
			patient_name = ?, patient_phone = ?, patient_age_years = ?, patient_gender = ?,
			doctor_id = ?, doctor_name = ?, procedure_name = ?, notes = ?, updated_at = datetime('now')
		WHERE id = ?
	`, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
		strings.TrimSpace(req.PatientGender), doctorID, doctorName,
		strings.TrimSpace(req.ProcedureName), strings.TrimSpace(req.Notes), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	if _, err := tx.Exec(`DELETE FROM ot_case_items WHERE case_id = ?`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "items clear failed"})
		return
	}
	if err := insertOtCaseItems(tx, id, items); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "items failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "ot_case", &id, nil)
	c, err := loadOtCase(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (h *OT) issueCase(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/cases/"), "/issue")
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

	var status, caseNo string
	err = tx.QueryRow(`SELECT status, case_no FROM ot_cases WHERE id = ?`, id).Scan(&status, &caseNo)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft cases can be issued"})
		return
	}

	items, err := loadOtCaseItemsTx(tx, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "items load failed"})
		return
	}
	if len(items) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "case has no cart items"})
		return
	}

	uid := user.ID
	for _, it := range items {
		if it.QtyIssued <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "item qty must be > 0"})
			return
		}
		if err := issueItemMAINToReserved(tx, id, it, uid, caseNo); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}

	if _, err := tx.Exec(`
		UPDATE ot_cases SET status = 'issued', issued_at = datetime('now'), issued_by_user_id = ?,
			updated_at = datetime('now')
		WHERE id = ?
	`, uid, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "issue failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "issue", "ot_case", &id, map[string]any{"case_no": caseNo})
	c, err := loadOtCase(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (h *OT) reconcileCase(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/cases/"), "/reconcile")
	id, ok := parseID("/" + idPath)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req otReconcileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, caseNo string
	err = tx.QueryRow(`SELECT status, case_no FROM ot_cases WHERE id = ?`, id).Scan(&status, &caseNo)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if status != "issued" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only issued cases can be reconciled"})
		return
	}

	items, err := loadOtCaseItemsTx(tx, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "items load failed"})
		return
	}
	byID := map[int64]otCaseItem{}
	for _, it := range items {
		byID[it.ID] = it
	}
	if len(req.Items) != len(items) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "reconcile must include every cart item"})
		return
	}

	uid := user.ID
	for _, ri := range req.Items {
		it, ok := byID[ri.ID]
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown case item"})
			return
		}
		sum := ri.QtyUsed + ri.QtyReturned + ri.QtyWasted + ri.QtyKeptOnFloor
		if ri.QtyUsed < 0 || ri.QtyReturned < 0 || ri.QtyWasted < 0 || ri.QtyKeptOnFloor < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "reconcile qty cannot be negative"})
			return
		}
		if sum != it.QtyIssued {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": fmt.Sprintf("%s: used+returned+wasted+kept (%d) must equal issued (%d)", it.Code, sum, it.QtyIssued),
			})
			return
		}
		if err := applyOtReconcile(tx, id, it, ri, uid, caseNo); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if _, err := tx.Exec(`
			UPDATE ot_case_items SET qty_used = ?, qty_returned = ?, qty_wasted = ?, qty_kept_on_floor = ?
			WHERE id = ?
		`, ri.QtyUsed, ri.QtyReturned, ri.QtyWasted, ri.QtyKeptOnFloor, it.ID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "item update failed"})
			return
		}
	}

	if _, err := tx.Exec(`
		UPDATE ot_cases SET status = 'reconciled', reconciled_at = datetime('now'),
			reconciled_by_user_id = ?, updated_at = datetime('now')
		WHERE id = ?
	`, uid, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reconcile failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "reconcile", "ot_case", &id, map[string]any{"case_no": caseNo})
	c, err := loadOtCase(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (h *OT) createBillFromCase(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/cases/"), "/bill")
	id, ok := parseID("/" + idPath)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req otCreateBillRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	c, err := loadOtCaseTx(tx, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if c.Status != "reconciled" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only reconciled cases can create a bill"})
		return
	}
	if c.OtBillID != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bill already exists for this case"})
		return
	}

	lines := make([]otBillLine, 0)
	sort := 0
	for _, it := range c.Items {
		if it.QtyUsed <= 0 {
			continue
		}
		lines = append(lines, otBillLine{
			LineType: "item", RefID: &it.ItemID, Code: it.Code,
			Description: it.Name, Qty: it.QtyUsed, UnitPriceMMK: it.SellPriceMMK,
			LineTotalMMK: it.QtyUsed * it.SellPriceMMK, SortOrder: sort,
		})
		sort++
	}
	if c.DoctorID != nil {
		var otFee int64
		_ = tx.QueryRow(`
			SELECT COALESCE(amount_mmk, 0) FROM doctor_fees WHERE doctor_id = ? AND fee_type = 'ot'
		`, *c.DoctorID).Scan(&otFee)
		if otFee > 0 {
			lines = append(lines, otBillLine{
				LineType: "ot_fee", RefID: c.DoctorID, Code: "OT-FEE",
				Description: "Doctor OT fee — " + c.DoctorName, Qty: 1, UnitPriceMMK: otFee,
				LineTotalMMK: otFee, SortOrder: sort,
			})
			sort++
		}
	}
	for _, s := range req.Services {
		s.LineType = "service"
		s.Description = strings.TrimSpace(s.Description)
		s.Code = strings.TrimSpace(s.Code)
		if s.Description == "" || s.Qty <= 0 || s.UnitPriceMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid service line"})
			return
		}
		s.LineTotalMMK = s.Qty * s.UnitPriceMMK
		s.SortOrder = sort
		lines = append(lines, s)
		sort++
	}
	if len(lines) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "nothing to bill (no used items / OT fee / services)"})
		return
	}
	var total int64
	for _, l := range lines {
		total += l.LineTotalMMK
	}

	billNo, err := nextOtBillNo(tx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "bill number failed"})
		return
	}
	uid := user.ID
	res, err := tx.Exec(`
		INSERT INTO ot_bills (
			bill_no, case_id, case_no, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, procedure_name, status, total_mmk, created_by_user_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
	`, billNo, c.ID, c.CaseNo, c.PatientName, c.PatientPhone, c.PatientAgeYears, c.PatientGender,
		c.DoctorID, c.DoctorName, c.ProcedureName, total, uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create bill failed"})
		return
	}
	billID, _ := res.LastInsertId()
	if err := insertOtBillLines(tx, billID, lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if _, err := tx.Exec(`
		UPDATE ot_cases SET status = 'billed', ot_bill_id = ?, updated_at = datetime('now') WHERE id = ?
	`, billID, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "case update failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "create", "ot_bill", &billID, map[string]any{
		"bill_no": billNo, "case_no": c.CaseNo, "total_mmk": total,
	})
	bill, err := loadOtBill(h.DB, billID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, bill)
}

func (h *OT) printPickList(w http.ResponseWriter, r *http.Request, path string) {
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/cases/"), "/pick-list")
	id, ok := parseID("/" + idPath)
	if !ok {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	c, err := loadOtCase(h.DB, id)
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
	_, _ = w.Write([]byte(renderOtPickListHTML(hosp, c)))
}

func (h *OT) listBills(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	query := `
		SELECT id, bill_no, case_id, case_no, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, procedure_name, status, total_mmk, paid_at, voided_at, void_reason,
			created_at, updated_at
		FROM ot_bills
	`
	args := make([]any, 0)
	where := make([]string, 0)
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if q != "" {
		like := "%" + q + "%"
		where = append(where, "(bill_no LIKE ? OR case_no LIKE ? OR patient_name LIKE ?)")
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
	out := make([]otBill, 0)
	for rows.Next() {
		b, err := scanOtBill(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, b)
	}
	writeJSON(w, http.StatusOK, map[string]any{"bills": out})
}

func (h *OT) getBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/bills"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	bill, err := loadOtBill(h.DB, id)
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

func (h *OT) updateBill(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	id, ok := parseID(strings.TrimPrefix(path, "/bills"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req struct {
		Lines []otBillLine `json:"lines"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	lines, total, errMsg := normalizeOtBillLines(req.Lines)
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

	var status string
	err = tx.QueryRow(`SELECT status FROM ot_bills WHERE id = ?`, id).Scan(&status)
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
	if _, err := tx.Exec(`UPDATE ot_bills SET total_mmk = ?, updated_at = datetime('now') WHERE id = ?`, total, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	if _, err := tx.Exec(`DELETE FROM ot_bill_lines WHERE bill_id = ?`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines clear failed"})
		return
	}
	if err := insertOtBillLines(tx, id, lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "ot_bill", &id, map[string]any{"total_mmk": total})
	bill, err := loadOtBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *OT) payBill(w http.ResponseWriter, r *http.Request, path string) {
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
	var lineCount int
	err = tx.QueryRow(`SELECT status FROM ot_bills WHERE id = ?`, id).Scan(&status)
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
	_ = tx.QueryRow(`SELECT COUNT(1) FROM ot_bill_lines WHERE bill_id = ?`, id).Scan(&lineCount)
	if lineCount == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bill has no lines"})
		return
	}
	// Stock already closed at reconcile — pay is cash only.
	uid := user.ID
	if _, err := tx.Exec(`
		UPDATE ot_bills SET status = 'paid', paid_at = datetime('now'), paid_by_user_id = ?,
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
	audit.WriteAudit(h.DB, &uid, "pay", "ot_bill", &id, map[string]any{"method": "cash"})
	bill, err := loadOtBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *OT) voidBill(w http.ResponseWriter, r *http.Request, path string) {
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
	err = tx.QueryRow(`SELECT status, bill_no FROM ot_bills WHERE id = ?`, id).Scan(&status, &billNo)
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
	if _, err := tx.Exec(`
		UPDATE ot_bills SET status = 'void', voided_at = datetime('now'), voided_by_user_id = ?,
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
	audit.WriteAudit(h.DB, &uid, "void", "ot_bill", &id, map[string]any{
		"bill_no": billNo, "reason": req.Reason, "was_status": status,
	})
	bill, err := loadOtBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *OT) printBill(w http.ResponseWriter, r *http.Request, path string) {
	idPath := strings.TrimSuffix(strings.TrimPrefix(path, "/bills/"), "/print")
	id, ok := parseID("/" + idPath)
	if !ok {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	bill, err := loadOtBill(h.DB, id)
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
	_, _ = w.Write([]byte(renderOtBillHTML(hosp, bill)))
}

// --- stock helpers ---

func issueItemMAINToReserved(tx *sql.Tx, caseID int64, it otCaseItem, actorUserID int64, caseNo string) error {
	rows, err := tx.Query(`
		SELECT id, qty, batch_no, expiry_date FROM item_batches
		WHERE item_id = ? AND location_code = 'MAIN' AND qty > 0
		ORDER BY CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
		         expiry_date ASC, id ASC
	`, it.ItemID)
	if err != nil {
		return fmt.Errorf("stock query failed")
	}
	type take struct {
		id      int64
		qty     int64
		batchNo string
		expiry  sql.NullString
	}
	takes := make([]take, 0)
	for rows.Next() {
		var t take
		if err := rows.Scan(&t.id, &t.qty, &t.batchNo, &t.expiry); err != nil {
			rows.Close()
			return fmt.Errorf("stock scan failed")
		}
		takes = append(takes, t)
	}
	rows.Close()

	var total int64
	for _, t := range takes {
		total += t.qty
	}
	if total < it.QtyIssued {
		return fmt.Errorf("insufficient MAIN stock for %s (need %d, have %d)", it.Code, it.QtyIssued, total)
	}

	remaining := it.QtyIssued
	reason := fmt.Sprintf("OT issue %s item %s", caseNo, it.Code)
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
			return fmt.Errorf("MAIN deduct failed")
		}
		if _, err := tx.Exec(`
			INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
			VALUES (?, ?, 'MAIN', 'ISSUE', ?, ?, ?)
		`, it.ItemID, t.id, -use, reason, actorUserID); err != nil {
			return fmt.Errorf("ISSUE movement failed")
		}

		var expiry *string
		if t.expiry.Valid && t.expiry.String != "" {
			e := t.expiry.String
			expiry = &e
		}
		reservedID, err := findOrCreateBatch(tx, it.ItemID, "OT_RESERVED", t.batchNo, expiry, use)
		if err != nil {
			return fmt.Errorf("OT_RESERVED batch failed")
		}
		if _, err := tx.Exec(`
			INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
			VALUES (?, ?, 'OT_RESERVED', 'TRANSFER', ?, ?, ?)
		`, it.ItemID, reservedID, use, reason, actorUserID); err != nil {
			return fmt.Errorf("TRANSFER movement failed")
		}
		if _, err := tx.Exec(`
			INSERT INTO ot_case_issue_allocs (case_id, case_item_id, item_id, main_batch_id, reserved_batch_id, qty)
			VALUES (?, ?, ?, ?, ?, ?)
		`, caseID, it.ID, it.ItemID, t.id, reservedID, use); err != nil {
			return fmt.Errorf("alloc failed")
		}
		remaining -= use
	}
	return nil
}

func applyOtReconcile(tx *sql.Tx, caseID int64, it otCaseItem, ri otReconcileItem, actorUserID int64, caseNo string) error {
	rows, err := tx.Query(`
		SELECT id, main_batch_id, reserved_batch_id, qty
		FROM ot_case_issue_allocs
		WHERE case_item_id = ?
		ORDER BY id ASC
	`, it.ID)
	if err != nil {
		return fmt.Errorf("allocs load failed")
	}
	type alloc struct {
		id, mainBatchID, reservedBatchID, qty int64
	}
	allocs := make([]alloc, 0)
	for rows.Next() {
		var a alloc
		if err := rows.Scan(&a.id, &a.mainBatchID, &a.reservedBatchID, &a.qty); err != nil {
			rows.Close()
			return fmt.Errorf("alloc scan failed")
		}
		allocs = append(allocs, a)
	}
	rows.Close()

	needUsed, needRet, needWaste, needKept := ri.QtyUsed, ri.QtyReturned, ri.QtyWasted, ri.QtyKeptOnFloor
	for _, a := range allocs {
		left := a.qty
		// Consume reserved in order: used, wasted, returned, kept.
		take := func(n *int64) int64 {
			if *n <= 0 || left <= 0 {
				return 0
			}
			u := *n
			if u > left {
				u = left
			}
			*n -= u
			left -= u
			return u
		}
		used := take(&needUsed)
		wasted := take(&needWaste)
		returned := take(&needRet)
		kept := take(&needKept)
		consume := used + wasted + returned + kept
		if consume == 0 {
			continue
		}
		res, err := tx.Exec(`
			UPDATE item_batches SET qty = qty - ?, updated_at = datetime('now') WHERE id = ? AND qty >= ?
		`, consume, a.reservedBatchID, consume)
		if err != nil {
			return fmt.Errorf("OT_RESERVED deduct failed for %s", it.Code)
		}
		affected, _ := res.RowsAffected()
		if affected == 0 {
			return fmt.Errorf("insufficient OT_RESERVED stock for %s", it.Code)
		}

		reasonBase := fmt.Sprintf("OT reconcile %s %s", caseNo, it.Code)
		if used > 0 {
			if _, err := tx.Exec(`
				INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
				VALUES (?, ?, 'OT_RESERVED', 'ISSUE', ?, ?, ?)
			`, it.ItemID, a.reservedBatchID, -used, reasonBase+" used", actorUserID); err != nil {
				return fmt.Errorf("used movement failed")
			}
		}
		if wasted > 0 {
			if _, err := tx.Exec(`
				INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
				VALUES (?, ?, 'OT_RESERVED', 'WASTE', ?, ?, ?)
			`, it.ItemID, a.reservedBatchID, -wasted, reasonBase+" waste", actorUserID); err != nil {
				return fmt.Errorf("waste movement failed")
			}
		}
		if returned > 0 {
			if _, err := tx.Exec(`
				INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
				VALUES (?, ?, 'OT_RESERVED', 'RETURN', ?, ?, ?)
			`, it.ItemID, a.reservedBatchID, -returned, reasonBase+" return", actorUserID); err != nil {
				return fmt.Errorf("return reserved movement failed")
			}
			if _, err := tx.Exec(`
				UPDATE item_batches SET qty = qty + ?, updated_at = datetime('now') WHERE id = ?
			`, returned, a.mainBatchID); err != nil {
				return fmt.Errorf("MAIN restore failed")
			}
			if _, err := tx.Exec(`
				INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
				VALUES (?, ?, 'MAIN', 'RETURN', ?, ?, ?)
			`, it.ItemID, a.mainBatchID, returned, reasonBase+" return", actorUserID); err != nil {
				return fmt.Errorf("return MAIN movement failed")
			}
		}
		if kept > 0 {
			var batchNo string
			var expiry sql.NullString
			if err := tx.QueryRow(`
				SELECT batch_no, expiry_date FROM item_batches WHERE id = ?
			`, a.reservedBatchID).Scan(&batchNo, &expiry); err != nil {
				return fmt.Errorf("batch meta failed")
			}
			var exp *string
			if expiry.Valid && expiry.String != "" {
				e := expiry.String
				exp = &e
			}
			if _, err := tx.Exec(`
				INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
				VALUES (?, ?, 'OT_RESERVED', 'TRANSFER', ?, ?, ?)
			`, it.ItemID, a.reservedBatchID, -kept, reasonBase+" floor", actorUserID); err != nil {
				return fmt.Errorf("floor transfer out failed")
			}
			floorID, err := findOrCreateBatch(tx, it.ItemID, "OT_FLOOR", batchNo, exp, kept)
			if err != nil {
				return fmt.Errorf("OT_FLOOR batch failed")
			}
			if _, err := tx.Exec(`
				INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
				VALUES (?, ?, 'OT_FLOOR', 'TRANSFER', ?, ?, ?)
			`, it.ItemID, floorID, kept, reasonBase+" floor", actorUserID); err != nil {
				return fmt.Errorf("floor transfer in failed")
			}
		}
	}
	if needUsed+needRet+needWaste+needKept != 0 {
		return fmt.Errorf("alloc mismatch for %s — contact Admin", it.Code)
	}
	_ = caseID
	return nil
}

// --- normalize / load helpers ---

func normalizeOtCaseItems(in []otCaseItem) ([]otCaseItem, string) {
	out := make([]otCaseItem, 0, len(in))
	for i, it := range in {
		if it.ItemID <= 0 {
			return nil, "item_id required"
		}
		if it.QtyIssued <= 0 {
			return nil, "qty_issued must be > 0"
		}
		it.SortOrder = i
		out = append(out, it)
	}
	return out, ""
}

func enrichOtCaseItems(tx *sql.Tx, items []otCaseItem) error {
	for i := range items {
		var code, name string
		var price int64
		var active int
		err := tx.QueryRow(`
			SELECT code, name, sell_price_mmk, active FROM items WHERE id = ?
		`, items[i].ItemID).Scan(&code, &name, &price, &active)
		if err == sql.ErrNoRows {
			return fmt.Errorf("item not found")
		}
		if err != nil {
			return fmt.Errorf("item load failed")
		}
		if active != 1 {
			return fmt.Errorf("item %s inactive", code)
		}
		items[i].Code = code
		items[i].Name = name
		items[i].SellPriceMMK = price
	}
	return nil
}

func insertOtCaseItems(tx *sql.Tx, caseID int64, items []otCaseItem) error {
	for _, it := range items {
		if _, err := tx.Exec(`
			INSERT INTO ot_case_items (
				case_id, item_id, code, name, sell_price_mmk, qty_issued,
				qty_used, qty_returned, qty_wasted, qty_kept_on_floor, sort_order
			) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)
		`, caseID, it.ItemID, it.Code, it.Name, it.SellPriceMMK, it.QtyIssued, it.SortOrder); err != nil {
			return err
		}
	}
	return nil
}

func nextOtCaseNo(tx *sql.Tx) (string, error) {
	var n int64
	if err := tx.QueryRow(`SELECT next_num FROM ot_case_number_seq WHERE id = 1`).Scan(&n); err != nil {
		return "", err
	}
	if _, err := tx.Exec(`UPDATE ot_case_number_seq SET next_num = next_num + 1 WHERE id = 1`); err != nil {
		return "", err
	}
	return fmt.Sprintf("OT-%06d", n), nil
}

func nextOtBillNo(tx *sql.Tx) (string, error) {
	var n int64
	if err := tx.QueryRow(`SELECT next_num FROM ot_bill_number_seq WHERE id = 1`).Scan(&n); err != nil {
		return "", err
	}
	if _, err := tx.Exec(`UPDATE ot_bill_number_seq SET next_num = next_num + 1 WHERE id = 1`); err != nil {
		return "", err
	}
	return fmt.Sprintf("OTB-%06d", n), nil
}

func loadOtCaseItemsTx(tx *sql.Tx, caseID int64) ([]otCaseItem, error) {
	rows, err := tx.Query(`
		SELECT id, item_id, code, name, sell_price_mmk, qty_issued, qty_used, qty_returned,
			qty_wasted, qty_kept_on_floor, sort_order
		FROM ot_case_items WHERE case_id = ? ORDER BY sort_order, id
	`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]otCaseItem, 0)
	for rows.Next() {
		var it otCaseItem
		if err := rows.Scan(
			&it.ID, &it.ItemID, &it.Code, &it.Name, &it.SellPriceMMK, &it.QtyIssued,
			&it.QtyUsed, &it.QtyReturned, &it.QtyWasted, &it.QtyKeptOnFloor, &it.SortOrder,
		); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func loadOtCase(db *sql.DB, id int64) (otCase, error) {
	tx, err := db.Begin()
	if err != nil {
		return otCase{}, err
	}
	defer tx.Rollback()
	c, err := loadOtCaseTx(tx, id)
	if err != nil {
		return c, err
	}
	return c, nil
}

func loadOtCaseTx(tx *sql.Tx, id int64) (otCase, error) {
	row := tx.QueryRow(`
		SELECT id, case_no, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, procedure_name, notes, status, issued_at, reconciled_at,
			ot_bill_id, created_by_user_id, created_at, updated_at
		FROM ot_cases WHERE id = ?
	`, id)
	c, err := scanOtCase(row)
	if err != nil {
		return c, err
	}
	items, err := loadOtCaseItemsTx(tx, id)
	if err != nil {
		return c, err
	}
	c.Items = items
	if c.DoctorID != nil {
		var fee int64
		_ = tx.QueryRow(`
			SELECT COALESCE(amount_mmk, 0) FROM doctor_fees WHERE doctor_id = ? AND fee_type = 'ot'
		`, *c.DoctorID).Scan(&fee)
		c.DoctorOTFeeMMK = fee
	}
	return c, nil
}

func scanOtCase(row scannable) (otCase, error) {
	var c otCase
	var age, doctorID, billID, createdBy sql.NullInt64
	var issuedAt, reconciledAt sql.NullString
	err := row.Scan(
		&c.ID, &c.CaseNo, &c.PatientName, &c.PatientPhone, &age, &c.PatientGender,
		&doctorID, &c.DoctorName, &c.ProcedureName, &c.Notes, &c.Status, &issuedAt, &reconciledAt,
		&billID, &createdBy, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return c, err
	}
	if age.Valid {
		v := age.Int64
		c.PatientAgeYears = &v
	}
	if doctorID.Valid {
		v := doctorID.Int64
		c.DoctorID = &v
	}
	if issuedAt.Valid {
		v := issuedAt.String
		c.IssuedAt = &v
	}
	if reconciledAt.Valid {
		v := reconciledAt.String
		c.ReconciledAt = &v
	}
	if billID.Valid {
		v := billID.Int64
		c.OtBillID = &v
	}
	if createdBy.Valid {
		v := createdBy.Int64
		c.CreatedByUserID = &v
	}
	return c, nil
}

func normalizeOtBillLines(in []otBillLine) ([]otBillLine, int64, string) {
	out := make([]otBillLine, 0, len(in))
	var total int64
	for i, l := range in {
		l.LineType = strings.TrimSpace(strings.ToLower(l.LineType))
		if l.LineType != "service" && l.LineType != "item" && l.LineType != "ot_fee" {
			return nil, 0, "invalid line_type"
		}
		l.Description = strings.TrimSpace(l.Description)
		if l.Description == "" {
			return nil, 0, "line description required"
		}
		if l.Qty <= 0 {
			return nil, 0, "line qty must be > 0"
		}
		if l.UnitPriceMMK < 0 {
			return nil, 0, "unit_price_mmk invalid"
		}
		l.Code = strings.TrimSpace(l.Code)
		l.LineTotalMMK = l.Qty * l.UnitPriceMMK
		l.SortOrder = i
		total += l.LineTotalMMK
		out = append(out, l)
	}
	return out, total, ""
}

func insertOtBillLines(tx *sql.Tx, billID int64, lines []otBillLine) error {
	for _, l := range lines {
		if _, err := tx.Exec(`
			INSERT INTO ot_bill_lines (bill_id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, billID, l.LineType, l.RefID, l.Code, l.Description, l.Qty, l.UnitPriceMMK, l.LineTotalMMK, l.SortOrder); err != nil {
			return err
		}
	}
	return nil
}

func loadOtBill(db *sql.DB, id int64) (otBill, error) {
	row := db.QueryRow(`
		SELECT id, bill_no, case_id, case_no, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, procedure_name, status, total_mmk, paid_at, voided_at, void_reason,
			created_at, updated_at
		FROM ot_bills WHERE id = ?
	`, id)
	b, err := scanOtBill(row)
	if err != nil {
		return b, err
	}
	rows, err := db.Query(`
		SELECT id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order
		FROM ot_bill_lines WHERE bill_id = ? ORDER BY sort_order, id
	`, id)
	if err != nil {
		return b, err
	}
	defer rows.Close()
	b.Lines = make([]otBillLine, 0)
	for rows.Next() {
		var l otBillLine
		var ref sql.NullInt64
		if err := rows.Scan(&l.ID, &l.LineType, &ref, &l.Code, &l.Description, &l.Qty, &l.UnitPriceMMK, &l.LineTotalMMK, &l.SortOrder); err != nil {
			return b, err
		}
		if ref.Valid {
			v := ref.Int64
			l.RefID = &v
		}
		b.Lines = append(b.Lines, l)
	}
	return b, rows.Err()
}

func scanOtBill(row scannable) (otBill, error) {
	var b otBill
	var age, doctorID sql.NullInt64
	var paidAt, voidedAt sql.NullString
	err := row.Scan(
		&b.ID, &b.BillNo, &b.CaseID, &b.CaseNo, &b.PatientName, &b.PatientPhone, &age, &b.PatientGender,
		&doctorID, &b.DoctorName, &b.ProcedureName, &b.Status, &b.TotalMMK, &paidAt, &voidedAt, &b.VoidReason,
		&b.CreatedAt, &b.UpdatedAt,
	)
	if err != nil {
		return b, err
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
	if voidedAt.Valid {
		v := voidedAt.String
		b.VoidedAt = &v
	}
	return b, nil
}

func renderOtPickListHTML(hosp *hospitalSettings, c otCase) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pick list `)
	b.WriteString(html.EscapeString(c.CaseNo))
	b.WriteString(`</title><style>
body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#111;font-size:14px}
h1{margin:0 0 4px;font-size:20px}
.meta,.addr{color:#444;margin:2px 0}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border:1px solid #333;padding:8px 6px;text-align:left}
th.num,td.num{text-align:right}
.sign{margin-top:28px}
@media print{body{margin:12px}}
</style></head><body>`)
	b.WriteString(`<h1>`)
	b.WriteString(html.EscapeString(hosp.HospitalName))
	b.WriteString(` — OT Pick List</h1>`)
	if hosp.Address != "" {
		b.WriteString(`<p class="addr">`)
		b.WriteString(html.EscapeString(hosp.Address))
		b.WriteString(`</p>`)
	}
	b.WriteString(`<p class="meta"><strong>Case:</strong> `)
	b.WriteString(html.EscapeString(c.CaseNo))
	b.WriteString(` &nbsp; <strong>Status:</strong> `)
	b.WriteString(html.EscapeString(strings.ToUpper(c.Status)))
	b.WriteString(`</p>`)
	b.WriteString(`<p class="meta"><strong>Patient:</strong> `)
	b.WriteString(html.EscapeString(c.PatientName))
	if c.PatientPhone != "" {
		b.WriteString(` · `)
		b.WriteString(html.EscapeString(c.PatientPhone))
	}
	b.WriteString(`</p>`)
	if c.DoctorName != "" {
		b.WriteString(`<p class="meta"><strong>Doctor:</strong> `)
		b.WriteString(html.EscapeString(c.DoctorName))
		b.WriteString(`</p>`)
	}
	if c.ProcedureName != "" {
		b.WriteString(`<p class="meta"><strong>Procedure:</strong> `)
		b.WriteString(html.EscapeString(c.ProcedureName))
		b.WriteString(`</p>`)
	}
	b.WriteString(`<p class="meta"><strong>Date:</strong> `)
	if c.IssuedAt != nil {
		b.WriteString(html.EscapeString(*c.IssuedAt))
	} else {
		b.WriteString(html.EscapeString(c.CreatedAt))
	}
	b.WriteString(`</p>`)
	b.WriteString(`<table><thead><tr>
<th>Code</th><th>Item</th><th class="num">Issued</th>
<th class="num">Used</th><th class="num">Returned</th><th class="num">Wasted</th><th class="num">Floor</th>
</tr></thead><tbody>`)
	for _, it := range c.Items {
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(it.Code))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(it.Name))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(fmt.Sprintf("%d", it.QtyIssued))
		b.WriteString(`</td><td class="num">`)
		if c.Status == "reconciled" || c.Status == "billed" {
			b.WriteString(fmt.Sprintf("%d", it.QtyUsed))
		} else {
			b.WriteString(`____`)
		}
		b.WriteString(`</td><td class="num">`)
		if c.Status == "reconciled" || c.Status == "billed" {
			b.WriteString(fmt.Sprintf("%d", it.QtyReturned))
		} else {
			b.WriteString(`____`)
		}
		b.WriteString(`</td><td class="num">`)
		if c.Status == "reconciled" || c.Status == "billed" {
			b.WriteString(fmt.Sprintf("%d", it.QtyWasted))
		} else {
			b.WriteString(`____`)
		}
		b.WriteString(`</td><td class="num">`)
		if c.Status == "reconciled" || c.Status == "billed" {
			b.WriteString(fmt.Sprintf("%d", it.QtyKeptOnFloor))
		} else {
			b.WriteString(`____`)
		}
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</tbody></table>`)
	b.WriteString(`<div class="sign"><p>Issued by: ________________ &nbsp;&nbsp; Received (OT): ________________</p>`)
	b.WriteString(`<p>Reconciled by: ________________ &nbsp;&nbsp; Date: ________________</p></div>`)
	b.WriteString(`</body></html>`)
	return b.String()
}

func renderOtBillHTML(hosp *hospitalSettings, bill otBill) string {
	dateLabel := bill.CreatedAt
	if bill.PaidAt != nil {
		dateLabel = *bill.PaidAt
	}
	lines := make([]receiptLine, 0, len(bill.Lines))
	for _, line := range bill.Lines {
		lines = append(lines, receiptLine{
			Code:        line.Code,
			Description: line.Description,
			Qty:         line.Qty,
			UnitPrice:   line.UnitPriceMMK,
			LineTotal:   line.LineTotalMMK,
		})
	}
	return renderThermalReceiptHTML(hosp, receiptBill{
		Title:         "OT RECEIPT",
		BillNo:        bill.BillNo,
		CaseNo:        bill.CaseNo,
		Status:        bill.Status,
		PatientName:   bill.PatientName,
		PatientPhone:  bill.PatientPhone,
		PatientAge:    bill.PatientAgeYears,
		PatientGender: bill.PatientGender,
		DoctorName:    bill.DoctorName,
		ProcedureName: bill.ProcedureName,
		DateLabel:     dateLabel,
		TotalMMK:      bill.TotalMMK,
		VoidReason:    bill.VoidReason,
		Lines:         lines,
	})
}
