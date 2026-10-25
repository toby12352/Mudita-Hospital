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

// OT handles a case bill: draft cart from the OT cupboard → bill → pay (cupboard sale) → print / void.
type OT struct {
	DB *sql.DB
}

type otCaseItem struct {
	ID             int64  `json:"id,omitempty"`
	ItemID         int64  `json:"item_id"`
	Code           string `json:"code"`
	Name           string `json:"name"`
	SellPriceMMK   int64  `json:"sell_price_mmk"`
	QtyIssued      int64  `json:"qty_issued"`
	SaleQty        int64  `json:"sale_qty"`
	SaleUnit       string `json:"sale_unit"`
	QtyUsed        int64  `json:"qty_used"`
	QtyReturned    int64  `json:"qty_returned"`
	QtyWasted      int64  `json:"qty_wasted"`
	QtyKeptOnFloor int64  `json:"qty_kept_on_floor"`
	SortOrder      int    `json:"sort_order"`
	// Joined from items on read so the cart can offer that item's units again.
	PackL1Qty  int64  `json:"pack_l1_qty,omitempty"`
	PackL1Unit string `json:"pack_l1_unit,omitempty"`
	PackL2Qty  int64  `json:"pack_l2_qty,omitempty"`
	PackL2Unit string `json:"pack_l2_unit,omitempty"`
	PackL3Qty  int64  `json:"pack_l3_qty,omitempty"`
	PackL3Unit string `json:"pack_l3_unit,omitempty"`
}

// Draft cart service line. unit_price_mmk is the case charge (nullable until typed).
type otCaseService struct {
	ID           int64  `json:"id,omitempty"`
	RefID        int64  `json:"ref_id"`
	Code         string `json:"code"`
	Description  string `json:"description"`
	UnitPriceMMK *int64 `json:"unit_price_mmk"`
	SortOrder    int    `json:"sort_order"`
}

type otCase struct {
	ID              int64           `json:"id"`
	CaseNo          string          `json:"case_no"`
	PatientName     string          `json:"patient_name"`
	PatientPhone    string          `json:"patient_phone"`
	PatientAgeYears *int64          `json:"patient_age_years,omitempty"`
	PatientGender   string          `json:"patient_gender"`
	DoctorID        *int64          `json:"doctor_id,omitempty"`
	DoctorName      string          `json:"doctor_name"`
	ProcedureName   string          `json:"procedure_name"`
	Notes           string          `json:"notes"`
	DiscountValue   int64           `json:"discount_value"`
	DiscountUnit    string          `json:"discount_unit"`
	Status          string          `json:"status"`
	IssuedAt        *string         `json:"issued_at,omitempty"`
	ReconciledAt    *string         `json:"reconciled_at,omitempty"`
	OtBillID        *int64          `json:"ot_bill_id,omitempty"`
	BillStatus      *string         `json:"bill_status,omitempty"`
	BillPrintedAt   *string         `json:"bill_printed_at,omitempty"`
	CreatedByUserID *int64          `json:"created_by_user_id,omitempty"`
	CreatedAt       string          `json:"created_at"`
	UpdatedAt       string          `json:"updated_at"`
	Items           []otCaseItem    `json:"items,omitempty"`
	Services        []otCaseService `json:"services,omitempty"`
	DoctorOTFeeMMK  int64           `json:"doctor_ot_fee_mmk,omitempty"`
}

type otCaseWriteRequest struct {
	PatientName     string          `json:"patient_name"`
	PatientPhone    string          `json:"patient_phone"`
	PatientAgeYears *int64          `json:"patient_age_years,omitempty"`
	PatientGender   string          `json:"patient_gender"`
	DoctorID        *int64          `json:"doctor_id,omitempty"`
	DoctorName      string          `json:"doctor_name"`
	ProcedureName   string          `json:"procedure_name"`
	Notes           string          `json:"notes"`
	Items           []otCaseItem    `json:"items"`
	Services        []otCaseService `json:"services"`
	DiscountValue   int64           `json:"discount_value"`
	DiscountUnit    string          `json:"discount_unit"`
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
	DiscountValue   int64        `json:"discount_value"`
	DiscountUnit    string       `json:"discount_unit"`
	DiscountMMK     int64        `json:"discount_mmk"`
	PrintedAt       *string      `json:"printed_at,omitempty"`
	PaidAt          *string      `json:"paid_at,omitempty"`
	VoidedAt        *string      `json:"voided_at,omitempty"`
	VoidReason      string       `json:"void_reason,omitempty"`
	CreatedAt       string       `json:"created_at"`
	UpdatedAt       string       `json:"updated_at"`
	Lines           []otBillLine `json:"lines,omitempty"`
}

type otServiceCharge struct {
	LineType     string `json:"line_type"`
	RefID        *int64 `json:"ref_id"`
	Qty          int64  `json:"qty"`
	UnitPriceMMK *int64 `json:"unit_price_mmk"`
}

type otCreateBillRequest struct {
	// Optional extra service lines (used items + doctor OT fee are auto-added).
	Services      []otServiceCharge `json:"services"`
	DiscountValue int64             `json:"discount_value"`
	DiscountUnit  string            `json:"discount_unit"`
}

type otCatalogDoctor struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Specialty string `json:"specialty"`
	OTFeeMMK  int64  `json:"ot_fee_mmk"`
}

type otCatalogItem struct {
	ID           int64  `json:"id"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	SellPriceMMK int64  `json:"sell_price_mmk"`
	StockUnit    string `json:"stock_unit"`
	OtOnHand     int64  `json:"ot_on_hand"`
	PackL1Qty    int64  `json:"pack_l1_qty"`
	PackL1Unit   string `json:"pack_l1_unit"`
	PackL2Qty    int64  `json:"pack_l2_qty"`
	PackL2Unit   string `json:"pack_l2_unit"`
	PackL3Qty    int64  `json:"pack_l3_qty"`
	PackL3Unit   string `json:"pack_l3_unit"`
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
		case path == "/services" && r.Method == http.MethodGet:
			h.listOtServices(w, r)
		case path == "/services" && r.Method == http.MethodPost:
			h.createOtService(w, r)
		case path == "/services/history" && r.Method == http.MethodGet:
			h.otServiceHistory(w, r)
		case strings.HasPrefix(path, "/services/") && strings.HasSuffix(path, "/delete") && r.Method == http.MethodPost:
			h.deleteOtService(w, r, path)
		case strings.HasPrefix(path, "/services/") && r.Method == http.MethodGet:
			h.getOtService(w, r, path)
		case strings.HasPrefix(path, "/services/") && r.Method == http.MethodPut:
			h.updateOtService(w, r, path)
		case strings.HasPrefix(path, "/services/") && r.Method == http.MethodDelete:
			h.deactivateOtService(w, r, path)
		case path == "/stock" && r.Method == http.MethodGet:
			h.listOtStock(w, r)
		case strings.HasPrefix(path, "/stock/") && strings.HasSuffix(path, "/return") && r.Method == http.MethodPost:
			h.returnOtStock(w, r, path)
		case strings.HasPrefix(path, "/stock/") && strings.HasSuffix(path, "/label") && r.Method == http.MethodPost:
			h.labelOtBatch(w, r, path)
		case path == "/cases" && r.Method == http.MethodGet:
			h.listCases(w, r)
		case path == "/cases" && r.Method == http.MethodPost:
			h.createCase(w, r)
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
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	var rows *sql.Rows
	var err error
	if code != "" {
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk FROM ot_services
			WHERE active = 1 AND code = ? COLLATE NOCASE
		`, code)
	} else if q != "" {
		like := "%" + q + "%"
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk FROM ot_services
			WHERE active = 1 AND (COALESCE(code, '') LIKE ? OR name LIKE ?)
			ORDER BY name COLLATE NOCASE LIMIT 50
		`, like, like)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk FROM ot_services
			WHERE active = 1
			ORDER BY name COLLATE NOCASE LIMIT 100
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	out := make([]otCatalogService, 0)
	for rows.Next() {
		var s otCatalogService
		var codeVal sql.NullString
		var price sql.NullInt64
		if err := rows.Scan(&s.ID, &codeVal, &s.Name, &price); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		if codeVal.Valid {
			s.Code = codeVal.String
		}
		if price.Valid {
			v := price.Int64
			s.PriceMMK = &v
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": out})
}

func (h *OT) catalogItems(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	const cols = `
		SELECT i.id, i.code, i.name, i.sell_price_mmk, COALESCE(i.stock_unit, 'Piece'),
			COALESCE((SELECT SUM(b.qty) FROM ot_batches b WHERE b.item_id = i.id), 0),
			COALESCE(i.pack_l1_qty, 1), COALESCE(i.pack_l1_unit, 'Box'),
			COALESCE(i.pack_l2_qty, 1), COALESCE(i.pack_l2_unit, 'Strip'),
			COALESCE(i.pack_l3_qty, 1), COALESCE(i.pack_l3_unit, 'Tablet')
		FROM items i`
	var rows *sql.Rows
	var err error
	const onHand = `COALESCE((SELECT SUM(b.qty) FROM ot_batches b WHERE b.item_id = i.id), 0)`
	switch {
	case code != "":
		rows, err = h.DB.Query(cols+`
			WHERE i.active = 1 AND i.code = ? COLLATE NOCASE AND `+onHand+` > 0
		`, code)
	case q != "":
		like := "%" + q + "%"
		rows, err = h.DB.Query(cols+`
			WHERE i.active = 1 AND (i.code LIKE ? OR i.name LIKE ?) AND `+onHand+` > 0
			ORDER BY i.code COLLATE NOCASE LIMIT 50
		`, like, like)
	default:
		rows, err = h.DB.Query(cols + `
			WHERE i.active = 1 AND ` + onHand + ` > 0
			ORDER BY i.code COLLATE NOCASE LIMIT 100
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	out := make([]otCatalogItem, 0)
	for rows.Next() {
		var it otCatalogItem
		if err := rows.Scan(
			&it.ID, &it.Code, &it.Name, &it.SellPriceMMK, &it.StockUnit, &it.OtOnHand,
			&it.PackL1Qty, &it.PackL1Unit, &it.PackL2Qty, &it.PackL2Unit, &it.PackL3Qty, &it.PackL3Unit,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, it)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (h *OT) catalogSettings(w http.ResponseWriter, r *http.Request) {
	(&OPD{DB: h.DB}).catalogSettings(w, r)
}

func (h *OT) listCases(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	query := `
		SELECT c.id, c.case_no, c.patient_name, c.patient_phone, c.patient_age_years, c.patient_gender,
			c.doctor_id, c.doctor_name, c.procedure_name, c.notes, c.status, c.issued_at, c.reconciled_at,
			c.ot_bill_id, c.created_by_user_id, c.created_at, c.updated_at,
			c.discount_value, c.discount_unit, b.status, b.printed_at
		FROM ot_cases c
		LEFT JOIN ot_bills b ON b.id = c.ot_bill_id
	`
	args := make([]any, 0)
	where := make([]string, 0)
	if status != "" {
		where = append(where, "c.status = ?")
		args = append(args, status)
	}
	if q != "" {
		like := "%" + q + "%"
		where = append(where, "(c.case_no LIKE ? OR c.patient_name LIKE ? OR c.patient_phone LIKE ? OR c.procedure_name LIKE ?)")
		args = append(args, like, like, like, like)
	}
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY c.created_at DESC, c.id DESC LIMIT 100"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()
	out := make([]otCase, 0)
	for rows.Next() {
		c, err := scanOtCaseWithBill(rows)
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
	services, errMsg := normalizeOtCaseServices(req.Services)
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
	if err := enrichOtCaseServices(tx, services); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	discountValue, discountUnit, errMsg := normalizeDiscountInput(req.DiscountValue, req.DiscountUnit)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
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
			doctor_id, doctor_name, procedure_name, notes, status, created_by_user_id,
			discount_value, discount_unit
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
	`, caseNo, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
		strings.TrimSpace(req.PatientGender), doctorID, doctorName,
		strings.TrimSpace(req.ProcedureName), strings.TrimSpace(req.Notes), uid,
		discountValue, discountUnit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	caseID, _ := res.LastInsertId()
	if err := insertOtCaseItems(tx, caseID, items); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "items failed"})
		return
	}
	if err := insertOtCaseServices(tx, caseID, services); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "services failed"})
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
	services, errMsg := normalizeOtCaseServices(req.Services)
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
	var otBillID sql.NullInt64
	err = tx.QueryRow(`SELECT status, ot_bill_id FROM ot_cases WHERE id = ?`, id).Scan(&status, &otBillID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	// Draft cases are always editable. Billed cases stay editable while the linked
	// bill is still draft (Printed — Not Paid / unpaid), so Print does not lock the desk.
	if status != "draft" {
		if status != "billed" || !otBillID.Valid {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft cases can be edited"})
			return
		}
		var billStatus string
		err = tx.QueryRow(`SELECT status FROM ot_bills WHERE id = ?`, otBillID.Int64).Scan(&billStatus)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft cases can be edited"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
			return
		}
		if billStatus != "draft" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only unpaid OT bills can be edited"})
			return
		}
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
	if err := enrichOtCaseServices(tx, services); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	discountValue, discountUnit, errMsg := normalizeDiscountInput(req.DiscountValue, req.DiscountUnit)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	if _, err := tx.Exec(`
		UPDATE ot_cases SET
			patient_name = ?, patient_phone = ?, patient_age_years = ?, patient_gender = ?,
			doctor_id = ?, doctor_name = ?, procedure_name = ?, notes = ?,
			discount_value = ?, discount_unit = ?, updated_at = datetime('now')
		WHERE id = ?
	`, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
		strings.TrimSpace(req.PatientGender), doctorID, doctorName,
		strings.TrimSpace(req.ProcedureName), strings.TrimSpace(req.Notes),
		discountValue, discountUnit, id); err != nil {
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
	if _, err := tx.Exec(`DELETE FROM ot_case_services WHERE case_id = ?`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "services clear failed"})
		return
	}
	if err := insertOtCaseServices(tx, id, services); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "services failed"})
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
	if c.Status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft cases can create a bill"})
		return
	}
	if c.OtBillID != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bill already exists for this case"})
		return
	}

	lines, total, errMsg := buildOtBillLines(tx, c, req.Services)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	discountMMK, net, discountUnit, errMsg := applyBillDiscount(total, req.DiscountValue, req.DiscountUnit)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
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
			doctor_id, doctor_name, procedure_name, status, total_mmk, created_by_user_id,
			discount_value, discount_unit, discount_mmk
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
	`, billNo, c.ID, c.CaseNo, c.PatientName, c.PatientPhone, c.PatientAgeYears, c.PatientGender,
		c.DoctorID, c.DoctorName, c.ProcedureName, net, uid,
		req.DiscountValue, discountUnit, discountMMK)
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
		"bill_no": billNo, "case_no": c.CaseNo, "total_mmk": net, "discount_mmk": discountMMK,
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
			created_at, updated_at, discount_value, discount_unit, discount_mmk, printed_at
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
		Lines         []otServiceCharge `json:"lines"`
		DiscountValue int64             `json:"discount_value"`
		DiscountUnit  string            `json:"discount_unit"`
	}
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

	var status string
	var caseID int64
	err = tx.QueryRow(`SELECT status, case_id FROM ot_bills WHERE id = ?`, id).Scan(&status, &caseID)
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
	c, err := loadOtCaseTx(tx, caseID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "case load failed"})
		return
	}
	services, errMsg := otBillServiceLines(req.Lines)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	lines, total, errMsg := buildOtBillLines(tx, c, services)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	discountMMK, net, discountUnit, errMsg := applyBillDiscount(total, req.DiscountValue, req.DiscountUnit)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	if _, err := tx.Exec(`
		UPDATE ot_bills SET
			patient_name = ?, patient_phone = ?, patient_age_years = ?, patient_gender = ?,
			doctor_id = ?, doctor_name = ?, procedure_name = ?,
			total_mmk = ?, discount_value = ?, discount_unit = ?, discount_mmk = ?,
			updated_at = datetime('now') WHERE id = ?
	`, c.PatientName, c.PatientPhone, c.PatientAgeYears, c.PatientGender,
		c.DoctorID, c.DoctorName, c.ProcedureName,
		net, req.DiscountValue, discountUnit, discountMMK, id); err != nil {
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
	audit.WriteAudit(h.DB, &uid, "update", "ot_bill", &id, map[string]any{
		"total_mmk": net, "discount_mmk": discountMMK,
	})
	bill, err := loadOtBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *OT) markBillPrinted(w http.ResponseWriter, r *http.Request, path string) {
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

	n, err := execMarkPrinted(tx, "ot_bills", id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "print stamp failed"})
		return
	}
	if n == 0 {
		var exists int
		err = tx.QueryRow(`SELECT 1 FROM ot_bills WHERE id = ?`, id).Scan(&exists)
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
	audit.WriteAudit(h.DB, &uid, "print", "ot_bill", &id, nil)

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
	var legacy int
	err = tx.QueryRow(`
		SELECT b.status, c.legacy_stock_closed
		FROM ot_bills b
		JOIN ot_cases c ON c.id = b.case_id
		WHERE b.id = ?
	`, id).Scan(&status, &legacy)
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
	lines, err := loadOtBillLinesTx(tx, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines load failed"})
		return
	}
	if len(lines) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bill has no lines"})
		return
	}
	uid := user.ID
	if legacy == 0 {
		for _, line := range lines {
			if line.LineType != "item" || line.RefID == nil {
				continue
			}
			if err := fefoDeductOtSale(tx, id, line.ID, *line.RefID, line.Qty, uid); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
		}
	}
	n, err := execPayDraft(tx, "ot_bills", id, uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pay failed"})
		return
	}
	if n == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be paid"})
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
	var caseID int64
	err = tx.QueryRow(`SELECT status, bill_no, case_id FROM ot_bills WHERE id = ?`, id).Scan(&status, &billNo, &caseID)
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
		if err := restoreOtBillStock(tx, id, billNo, req.Reason, uid); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}
	if _, err := tx.Exec(`
		UPDATE ot_bills SET status = 'void', voided_at = datetime('now'), voided_by_user_id = ?,
			void_reason = ?, updated_at = datetime('now')
		WHERE id = ?
	`, uid, req.Reason, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "void failed"})
		return
	}
	if _, err := tx.Exec(`
		UPDATE ot_cases SET status = 'draft', ot_bill_id = NULL, updated_at = datetime('now')
		WHERE id = ? AND ot_bill_id = ?
	`, caseID, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "case reopen failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}
	audit.WriteAudit(h.DB, &uid, "void", "ot_bill", &id, map[string]any{
		"bill_no": billNo, "reason": req.Reason, "was_status": status, "case_id": caseID,
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
	var caseItems []otCaseItem
	if c, loadErr := loadOtCase(h.DB, bill.CaseID); loadErr == nil {
		caseItems = c.Items
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderOtBillHTML(hosp, bill, caseItems)))
}

// --- normalize / load helpers ---

func normalizeOtCaseItems(in []otCaseItem) ([]otCaseItem, string) {
	out := make([]otCaseItem, 0, len(in))
	for i, it := range in {
		if it.ItemID <= 0 {
			return nil, "item_id required"
		}
		it.SaleUnit = strings.TrimSpace(it.SaleUnit)
		if it.SaleUnit != "" {
			if it.SaleQty <= 0 {
				return nil, "sale_qty must be > 0"
			}
		} else if it.QtyIssued <= 0 {
			return nil, "qty_issued must be > 0"
		} else {
			it.SaleQty = 0
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
		var l1q, l2q, l3q int64
		var l1u, l2u, l3u string
		err := tx.QueryRow(`
			SELECT code, name, sell_price_mmk, active,
				COALESCE(pack_l1_qty, 1), COALESCE(pack_l1_unit, ''),
				COALESCE(pack_l2_qty, 1), COALESCE(pack_l2_unit, ''),
				COALESCE(pack_l3_qty, 1), COALESCE(pack_l3_unit, '')
			FROM items WHERE id = ?
		`, items[i].ItemID).Scan(&code, &name, &price, &active, &l1q, &l1u, &l2q, &l2u, &l3q, &l3u)
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
		if items[i].SaleUnit != "" {
			pack := itemPack{L1Qty: l1q, L1Unit: l1u, L2Qty: l2q, L2Unit: l2u, L3Qty: l3q, L3Unit: l3u}
			factor, canonical, ok := saleUnitFactor(pack, items[i].SaleUnit)
			if !ok {
				return fmt.Errorf("%s: unknown unit %s", code, items[i].SaleUnit)
			}
			issued := items[i].SaleQty * factor
			if issued <= 0 || factor == 0 || issued/factor != items[i].SaleQty {
				return fmt.Errorf("%s: quantity too large", code)
			}
			items[i].SaleUnit = canonical
			items[i].QtyIssued = issued
		} else {
			items[i].SaleQty = 0
			items[i].SaleUnit = ""
		}
	}
	return nil
}

func insertOtCaseItems(tx *sql.Tx, caseID int64, items []otCaseItem) error {
	for _, it := range items {
		if _, err := tx.Exec(`
			INSERT INTO ot_case_items (
				case_id, item_id, code, name, sell_price_mmk, qty_issued,
				qty_used, qty_returned, qty_wasted, qty_kept_on_floor, sort_order,
				sale_qty, sale_unit
			) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)
		`, caseID, it.ItemID, it.Code, it.Name, it.SellPriceMMK, it.QtyIssued, it.SortOrder, it.SaleQty, it.SaleUnit); err != nil {
			return err
		}
	}
	return nil
}

func normalizeOtCaseServices(in []otCaseService) ([]otCaseService, string) {
	out := make([]otCaseService, 0, len(in))
	for i, s := range in {
		if s.RefID <= 0 {
			return nil, "service ref_id required"
		}
		if s.UnitPriceMMK != nil && *s.UnitPriceMMK < 0 {
			return nil, "service unit_price_mmk must be >= 0"
		}
		s.SortOrder = i
		out = append(out, s)
	}
	return out, ""
}

// enrichOtCaseServices resolves active ot_services rows. Keeps the client case price
// (including null); does not copy catalog price_mmk onto the line.
func enrichOtCaseServices(tx *sql.Tx, services []otCaseService) error {
	for i := range services {
		var code sql.NullString
		var name string
		var active int
		err := tx.QueryRow(`
			SELECT code, name, active FROM ot_services WHERE id = ?
		`, services[i].RefID).Scan(&code, &name, &active)
		if err == sql.ErrNoRows {
			return fmt.Errorf("service not found")
		}
		if err != nil {
			return fmt.Errorf("service load failed")
		}
		if active != 1 {
			label := name
			if code.Valid && code.String != "" {
				label = code.String
			}
			return fmt.Errorf("service %s is inactive", label)
		}
		svcCode := ""
		if code.Valid {
			svcCode = code.String
		}
		services[i].Code = svcCode
		services[i].Description = name
	}
	return nil
}

func insertOtCaseServices(tx *sql.Tx, caseID int64, services []otCaseService) error {
	for _, s := range services {
		if _, err := tx.Exec(`
			INSERT INTO ot_case_services (
				case_id, service_id, code, description, unit_price_mmk, sort_order
			) VALUES (?, ?, ?, ?, ?, ?)
		`, caseID, s.RefID, s.Code, s.Description, s.UnitPriceMMK, s.SortOrder); err != nil {
			return err
		}
	}
	return nil
}

func loadOtCaseServicesTx(tx *sql.Tx, caseID int64) ([]otCaseService, error) {
	rows, err := tx.Query(`
		SELECT id, service_id, code, description, unit_price_mmk, sort_order
		FROM ot_case_services
		WHERE case_id = ? ORDER BY sort_order, id
	`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]otCaseService, 0)
	for rows.Next() {
		var s otCaseService
		var price sql.NullInt64
		if err := rows.Scan(&s.ID, &s.RefID, &s.Code, &s.Description, &price, &s.SortOrder); err != nil {
			return nil, err
		}
		if price.Valid {
			v := price.Int64
			s.UnitPriceMMK = &v
		}
		out = append(out, s)
	}
	return out, rows.Err()
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
		SELECT c.id, c.item_id, c.code, c.name, c.sell_price_mmk, c.qty_issued, c.sale_qty, c.sale_unit,
			c.qty_used, c.qty_returned, c.qty_wasted, c.qty_kept_on_floor, c.sort_order,
			COALESCE(i.pack_l1_qty, 1), COALESCE(i.pack_l1_unit, ''),
			COALESCE(i.pack_l2_qty, 1), COALESCE(i.pack_l2_unit, ''),
			COALESCE(i.pack_l3_qty, 1), COALESCE(i.pack_l3_unit, '')
		FROM ot_case_items c
		LEFT JOIN items i ON i.id = c.item_id
		WHERE c.case_id = ? ORDER BY c.sort_order, c.id
	`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]otCaseItem, 0)
	for rows.Next() {
		var it otCaseItem
		if err := rows.Scan(
			&it.ID, &it.ItemID, &it.Code, &it.Name, &it.SellPriceMMK, &it.QtyIssued, &it.SaleQty, &it.SaleUnit,
			&it.QtyUsed, &it.QtyReturned, &it.QtyWasted, &it.QtyKeptOnFloor, &it.SortOrder,
			&it.PackL1Qty, &it.PackL1Unit, &it.PackL2Qty, &it.PackL2Unit, &it.PackL3Qty, &it.PackL3Unit,
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
			ot_bill_id, created_by_user_id, created_at, updated_at,
			discount_value, discount_unit
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
	services, err := loadOtCaseServicesTx(tx, id)
	if err != nil {
		return c, err
	}
	c.Services = services
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
		&c.DiscountValue, &c.DiscountUnit,
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

func scanOtCaseWithBill(row scannable) (otCase, error) {
	var c otCase
	var age, doctorID, billID, createdBy sql.NullInt64
	var issuedAt, reconciledAt, billStatus, billPrintedAt sql.NullString
	err := row.Scan(
		&c.ID, &c.CaseNo, &c.PatientName, &c.PatientPhone, &age, &c.PatientGender,
		&doctorID, &c.DoctorName, &c.ProcedureName, &c.Notes, &c.Status, &issuedAt, &reconciledAt,
		&billID, &createdBy, &c.CreatedAt, &c.UpdatedAt,
		&c.DiscountValue, &c.DiscountUnit, &billStatus, &billPrintedAt,
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
	if billStatus.Valid && billStatus.String != "" {
		v := billStatus.String
		c.BillStatus = &v
	}
	if billPrintedAt.Valid && billPrintedAt.String != "" {
		v := billPrintedAt.String
		c.BillPrintedAt = &v
	}
	return c, nil
}

// otBillServiceLines keeps client service rows. Item and OT-fee rows are rebuilt from the case.
func otBillServiceLines(in []otServiceCharge) ([]otServiceCharge, string) {
	out := make([]otServiceCharge, 0)
	for _, l := range in {
		l.LineType = strings.TrimSpace(strings.ToLower(l.LineType))
		switch l.LineType {
		case "item", "ot_fee":
			continue
		case "service":
			out = append(out, l)
		default:
			return nil, "invalid line_type"
		}
	}
	return out, ""
}

// buildOtBillLines prices cupboard item lines and the doctor OT fee from the catalog at bill time.
// Service lines must reference an active ot_services row. Qty is 1. Price is the case charge.
func buildOtBillLines(tx *sql.Tx, c otCase, services []otServiceCharge) ([]otBillLine, int64, string) {
	lines := make([]otBillLine, 0)
	sort := 0
	for _, it := range c.Items {
		if it.QtyIssued <= 0 {
			continue
		}
		var code, name string
		var price int64
		err := tx.QueryRow(`
			SELECT code, name, sell_price_mmk FROM items WHERE id = ?
		`, it.ItemID).Scan(&code, &name, &price)
		if err == sql.ErrNoRows {
			return nil, 0, fmt.Sprintf("item %s not found", it.Code)
		}
		if err != nil {
			return nil, 0, "item load failed"
		}
		itemID := it.ItemID
		lineTotal := it.QtyIssued * roundPayableMMK(price)
		if it.SaleQty > 0 && strings.TrimSpace(it.SaleUnit) != "" {
			factor := it.QtyIssued / it.SaleQty
			if factor > 0 && it.SaleQty*factor == it.QtyIssued {
				unitPrice := roundPayableMMK(price * factor)
				lineTotal = it.SaleQty * unitPrice
			}
		}
		lines = append(lines, otBillLine{
			LineType: "item", RefID: &itemID, Code: code,
			Description: name, Qty: it.QtyIssued, UnitPriceMMK: price,
			LineTotalMMK: lineTotal, SortOrder: sort,
		})
		sort++
	}
	if c.DoctorID != nil {
		var otFee int64
		err := tx.QueryRow(`
			SELECT COALESCE(amount_mmk, 0) FROM doctor_fees WHERE doctor_id = ? AND fee_type = 'ot'
		`, *c.DoctorID).Scan(&otFee)
		if err != nil && err != sql.ErrNoRows {
			return nil, 0, "OT fee load failed"
		}
		if otFee > 0 {
			lines = append(lines, otBillLine{
				LineType: "ot_fee", RefID: c.DoctorID, Code: "OT-FEE",
				Description: "Doctor OT fee — " + c.DoctorName, Qty: 1, UnitPriceMMK: otFee,
				LineTotalMMK: otFee, SortOrder: sort,
			})
			sort++
		}
	}
	for _, s := range services {
		lt := strings.TrimSpace(strings.ToLower(s.LineType))
		if lt != "" && lt != "service" {
			return nil, 0, "invalid service line"
		}
		if s.RefID == nil || *s.RefID == 0 {
			return nil, 0, "service ref_id required"
		}
		if s.UnitPriceMMK == nil {
			return nil, 0, "service unit_price_mmk required"
		}
		if *s.UnitPriceMMK < 0 {
			return nil, 0, "service unit_price_mmk must be >= 0"
		}
		var code sql.NullString
		var name string
		var active int
		err := tx.QueryRow(`
			SELECT code, name, active FROM ot_services WHERE id = ?
		`, *s.RefID).Scan(&code, &name, &active)
		if err == sql.ErrNoRows {
			return nil, 0, "service not found"
		}
		if err != nil {
			return nil, 0, "service load failed"
		}
		if active != 1 {
			label := name
			if code.Valid && code.String != "" {
				label = code.String
			}
			return nil, 0, fmt.Sprintf("service %s is inactive", label)
		}
		price := *s.UnitPriceMMK
		ref := *s.RefID
		svcCode := ""
		if code.Valid {
			svcCode = code.String
		}
		lines = append(lines, otBillLine{
			LineType: "service", RefID: &ref, Code: svcCode, Description: name,
			Qty: 1, UnitPriceMMK: price, LineTotalMMK: price, SortOrder: sort,
		})
		sort++
	}
	if len(lines) == 0 {
		return nil, 0, "nothing to bill (no items / OT fee / services)"
	}
	var total int64
	for _, l := range lines {
		total += l.LineTotalMMK
	}
	return lines, total, ""
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

func loadOtBillLinesTx(tx *sql.Tx, billID int64) ([]otBillLine, error) {
	rows, err := tx.Query(`
		SELECT id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order
		FROM ot_bill_lines WHERE bill_id = ? ORDER BY sort_order, id
	`, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]otBillLine, 0)
	for rows.Next() {
		var l otBillLine
		var ref sql.NullInt64
		if err := rows.Scan(&l.ID, &l.LineType, &ref, &l.Code, &l.Description, &l.Qty, &l.UnitPriceMMK, &l.LineTotalMMK, &l.SortOrder); err != nil {
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

func loadOtBill(db *sql.DB, id int64) (otBill, error) {
	row := db.QueryRow(`
		SELECT id, bill_no, case_id, case_no, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, procedure_name, status, total_mmk, paid_at, voided_at, void_reason,
			created_at, updated_at, discount_value, discount_unit, discount_mmk, printed_at
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
	var paidAt, voidedAt, printedAt sql.NullString
	err := row.Scan(
		&b.ID, &b.BillNo, &b.CaseID, &b.CaseNo, &b.PatientName, &b.PatientPhone, &age, &b.PatientGender,
		&doctorID, &b.DoctorName, &b.ProcedureName, &b.Status, &b.TotalMMK, &paidAt, &voidedAt, &b.VoidReason,
		&b.CreatedAt, &b.UpdatedAt, &b.DiscountValue, &b.DiscountUnit, &b.DiscountMMK, &printedAt,
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
	if printedAt.Valid && printedAt.String != "" {
		v := printedAt.String
		b.PrintedAt = &v
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
<th>Code</th><th>Item</th><th class="num">Qty</th>
</tr></thead><tbody>`)
	for _, it := range c.Items {
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(it.Code))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(it.Name))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(fmt.Sprintf("%d", it.QtyIssued))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</tbody></table>`)
	b.WriteString(`<div class="sign"><p>Prepared by: ________________ &nbsp;&nbsp; Date: ________________</p></div>`)
	b.WriteString(`</body></html>`)
	return b.String()
}

func renderOtBillHTML(hosp *hospitalSettings, bill otBill, caseItems []otCaseItem) string {
	dateLabel := bill.CreatedAt
	if bill.PaidAt != nil {
		dateLabel = *bill.PaidAt
	}
	used := map[int]bool{}
	lines := make([]receiptLine, 0, len(bill.Lines))
	for _, line := range bill.Lines {
		rl := receiptLine{
			Code:        line.Code,
			Description: line.Description,
			Qty:         line.Qty,
			UnitPrice:   line.UnitPriceMMK,
			LineTotal:   line.LineTotalMMK,
		}
		if line.LineType == "item" && line.RefID != nil {
			for i, it := range caseItems {
				if used[i] || it.ItemID != *line.RefID {
					continue
				}
				used[i] = true
				if strings.TrimSpace(it.SaleUnit) != "" && it.SaleQty > 0 {
					rl.Qty = it.SaleQty
					rl.Unit = it.SaleUnit
					rl.UnitPrice = line.LineTotalMMK / it.SaleQty
				}
				break
			}
		}
		lines = append(lines, rl)
	}
	printedAt := ""
	if bill.PrintedAt != nil {
		printedAt = *bill.PrintedAt
	}
	return renderThermalReceiptHTML(hosp, receiptBill{
		Title:          "OT RECEIPT",
		BillNo:         bill.BillNo,
		CaseNo:         bill.CaseNo,
		Status:         bill.Status,
		PrintedAt:      printedAt,
		PatientName:    bill.PatientName,
		PatientPhone:   bill.PatientPhone,
		PatientAge:     bill.PatientAgeYears,
		PatientGender:  bill.PatientGender,
		DoctorName:     bill.DoctorName,
		ProcedureName:  bill.ProcedureName,
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
