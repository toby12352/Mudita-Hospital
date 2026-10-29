package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
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
	// FOC marks the item free of charge on the patient bill.
	Foc int `json:"foc"`
	// Joined from items on read so the cart can offer that item's units again.
	PackL1Qty  int64  `json:"pack_l1_qty,omitempty"`
	PackL1Unit string `json:"pack_l1_unit,omitempty"`
	PackL2Qty  int64  `json:"pack_l2_qty,omitempty"`
	PackL2Unit string `json:"pack_l2_unit,omitempty"`
	PackL3Qty  int64  `json:"pack_l3_qty,omitempty"`
	PackL3Unit string `json:"pack_l3_unit,omitempty"`
	PackL4Qty  int64  `json:"pack_l4_qty,omitempty"`
	PackL4Unit string `json:"pack_l4_unit,omitempty"`
	PackL5Qty  int64  `json:"pack_l5_qty,omitempty"`
	PackL5Unit string `json:"pack_l5_unit,omitempty"`
	PackL6Qty  int64  `json:"pack_l6_qty,omitempty"`
	PackL6Unit string `json:"pack_l6_unit,omitempty"`
}

// Draft cart service line. unit_price_mmk is the case charge (nullable until typed).
type otCaseService struct {
	ID           int64  `json:"id,omitempty"`
	RefID        int64  `json:"ref_id"`
	Code         string `json:"code"`
	Description  string `json:"description"`
	UnitPriceMMK *int64 `json:"unit_price_mmk"`
	SortOrder    int    `json:"sort_order"`
	Foc          int    `json:"foc"`
}

type otCase struct {
	ID                int64           `json:"id"`
	CaseNo            string          `json:"case_no"`
	PatientID         *int64          `json:"patient_id,omitempty"`
	PatientName       string          `json:"patient_name"`
	PatientPhone      string          `json:"patient_phone"`
	PatientAgeYears   *int64          `json:"patient_age_years,omitempty"`
	PatientGender     string          `json:"patient_gender"`
	DoctorID          *int64          `json:"doctor_id,omitempty"`
	DoctorName        string          `json:"doctor_name"`
	ProcedureName     string          `json:"procedure_name"`
	Notes             string          `json:"notes"`
	DiscountValue     int64           `json:"discount_value"`
	DiscountUnit      string          `json:"discount_unit"`
	Status            string          `json:"status"`
	IssuedAt          *string         `json:"issued_at,omitempty"`
	ReconciledAt      *string         `json:"reconciled_at,omitempty"`
	OtBillID          *int64          `json:"ot_bill_id,omitempty"`
	BillStatus        *string         `json:"bill_status,omitempty"`
	BillPrintedAt     *string         `json:"bill_printed_at,omitempty"`
	BillCollectedCash *int            `json:"bill_collected_cash,omitempty"`
	BillTotalMMK      *int64          `json:"bill_total_mmk,omitempty"`
	CreatedByUserID   *int64          `json:"created_by_user_id,omitempty"`
	CreatedAt         string          `json:"created_at"`
	UpdatedAt         string          `json:"updated_at"`
	BilledAt          *string         `json:"billed_at,omitempty"`
	Items             []otCaseItem    `json:"items,omitempty"`
	Services          []otCaseService `json:"services,omitempty"`
	DoctorOTFeeMMK    int64           `json:"doctor_ot_fee_mmk,omitempty"`
}

type otCaseWriteRequest struct {
	PatientID       *int64          `json:"patient_id,omitempty"`
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
	BilledAt        string          `json:"billed_at,omitempty"`
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
	Foc          int    `json:"foc"`
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
	AdmissionID     *int64       `json:"admission_id,omitempty"`
	CollectedCash   int          `json:"collected_cash"`
	PaidAt          *string      `json:"paid_at,omitempty"`
	VoidedAt        *string      `json:"voided_at,omitempty"`
	VoidReason      string       `json:"void_reason,omitempty"`
	CreatedAt       string       `json:"created_at"`
	UpdatedAt       string       `json:"updated_at"`
	BilledAt        *string      `json:"billed_at,omitempty"`
	Lines           []otBillLine `json:"lines,omitempty"`
}

type otServiceCharge struct {
	LineType     string `json:"line_type"`
	RefID        *int64 `json:"ref_id"`
	Qty          int64  `json:"qty"`
	UnitPriceMMK *int64 `json:"unit_price_mmk"`
	Foc          int    `json:"foc"`
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
	PackL4Qty    int64  `json:"pack_l4_qty"`
	PackL4Unit   string `json:"pack_l4_unit"`
	PackL5Qty    int64  `json:"pack_l5_qty"`
	PackL5Unit   string `json:"pack_l5_unit"`
	PackL6Qty    int64  `json:"pack_l6_qty"`
	PackL6Unit   string `json:"pack_l6_unit"`
}

func (h *OT) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(h.DB, auth.PermOT, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/ot")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}
		if !allowCell(h.DB, w, r, otGrant(r.Method, path)) {
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
		case strings.HasPrefix(path, "/cases/") && r.Method == http.MethodDelete:
			h.purgeCase(w, r, path)
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
		case strings.HasPrefix(path, "/bills/") && r.Method == http.MethodDelete:
			h.purgeBill(w, r, path)
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
			COALESCE(i.pack_l3_qty, 1), COALESCE(i.pack_l3_unit, 'Tablet'),
			COALESCE(i.pack_l4_qty, 1), COALESCE(i.pack_l4_unit, ''),
			COALESCE(i.pack_l5_qty, 1), COALESCE(i.pack_l5_unit, ''),
			COALESCE(i.pack_l6_qty, 1), COALESCE(i.pack_l6_unit, '')
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
			&it.PackL4Qty, &it.PackL4Unit, &it.PackL5Qty, &it.PackL5Unit, &it.PackL6Qty, &it.PackL6Unit,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		padded := itemPackFromPharmacyItem(pharmacyItem{
			PackL1Qty: it.PackL1Qty, PackL1Unit: it.PackL1Unit,
			PackL2Qty: it.PackL2Qty, PackL2Unit: it.PackL2Unit,
			PackL3Qty: it.PackL3Qty, PackL3Unit: it.PackL3Unit,
			PackL4Qty: it.PackL4Qty, PackL4Unit: it.PackL4Unit,
			PackL5Qty: it.PackL5Qty, PackL5Unit: it.PackL5Unit,
			PackL6Qty: it.PackL6Qty, PackL6Unit: it.PackL6Unit,
		})
		it.PackL4Qty, it.PackL4Unit = padded.L4Qty, padded.L4Unit
		it.PackL5Qty, it.PackL5Unit = padded.L5Qty, padded.L5Unit
		it.PackL6Qty, it.PackL6Unit = padded.L6Qty, padded.L6Unit
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
		SELECT c.id, c.case_no, c.patient_id, c.patient_name, c.patient_phone, c.patient_age_years, c.patient_gender,
			c.doctor_id, c.doctor_name, c.procedure_name, c.notes, c.status, c.issued_at, c.reconciled_at,
			c.ot_bill_id, c.created_by_user_id, c.created_at, c.updated_at,
			c.discount_value, c.discount_unit, b.status, b.printed_at, b.collected_cash, b.total_mmk
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
	var errMsg string
	where, args, errMsg = appendBillHistoryFilters(where, args, r, "b.status", "b.printed_at", "c.created_at", "b.id IS NULL")
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	orderSQL, orderErr := billHistoryOrderBy(r, "c.created_at", "c.id")
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
	override, status, errMsg := parseAdminBilledAt(user.Role, req.BilledAt)
	if errMsg != "" {
		writeJSON(w, status, map[string]string{"error": errMsg})
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
	patientID, err := storedCasePatientID(tx, req.PatientID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "patient not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "patient load failed"})
		return
	}

	caseNo, err := nextOtCaseNo(tx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "case number failed"})
		return
	}
	uid := user.ID
	var res sql.Result
	if override != nil {
		res, err = tx.Exec(`
			INSERT INTO ot_cases (
				case_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
				doctor_id, doctor_name, procedure_name, notes, status, created_by_user_id,
				discount_value, discount_unit, billed_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
		`, caseNo, patientID, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
			strings.TrimSpace(req.PatientGender), doctorID, doctorName,
			strings.TrimSpace(req.ProcedureName), strings.TrimSpace(req.Notes), uid,
			discountValue, discountUnit, override.Yangon, override.UTC, override.UTC)
	} else {
		res, err = tx.Exec(`
			INSERT INTO ot_cases (
				case_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
				doctor_id, doctor_name, procedure_name, notes, status, created_by_user_id,
				discount_value, discount_unit
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
		`, caseNo, patientID, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
			strings.TrimSpace(req.PatientGender), doctorID, doctorName,
			strings.TrimSpace(req.ProcedureName), strings.TrimSpace(req.Notes), uid,
			discountValue, discountUnit)
	}
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

	auditPayload := map[string]any{"case_no": caseNo}
	if override != nil {
		auditPayload["billed_at"] = override.Yangon
	}
	audit.WriteAudit(h.DB, &uid, "create", "ot_case", &caseID, auditPayload)
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
	patientID, err := storedCasePatientID(tx, req.PatientID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "patient not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "patient load failed"})
		return
	}

	if _, err := tx.Exec(`
		UPDATE ot_cases SET
			patient_id = ?, patient_name = ?, patient_phone = ?, patient_age_years = ?, patient_gender = ?,
			doctor_id = ?, doctor_name = ?, procedure_name = ?, notes = ?,
			discount_value = ?, discount_unit = ?, updated_at = datetime('now')
		WHERE id = ?
	`, patientID, req.PatientName, strings.TrimSpace(req.PatientPhone), req.PatientAgeYears,
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
	var res sql.Result
	if c.BilledAt != nil && strings.TrimSpace(*c.BilledAt) != "" {
		override, parseStatus, parseErr := parseAdminBilledAt(auth.RoleAdmin, *c.BilledAt)
		if parseErr != "" {
			writeJSON(w, parseStatus, map[string]string{"error": parseErr})
			return
		}
		res, err = tx.Exec(`
			INSERT INTO ot_bills (
				bill_no, case_id, case_no, patient_name, patient_phone, patient_age_years, patient_gender,
				doctor_id, doctor_name, procedure_name, status, total_mmk, created_by_user_id,
				discount_value, discount_unit, discount_mmk, billed_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
		`, billNo, c.ID, c.CaseNo, c.PatientName, c.PatientPhone, c.PatientAgeYears, c.PatientGender,
			c.DoctorID, c.DoctorName, c.ProcedureName, net, uid,
			req.DiscountValue, discountUnit, discountMMK, override.Yangon, override.UTC, override.UTC)
	} else {
		res, err = tx.Exec(`
			INSERT INTO ot_bills (
				bill_no, case_id, case_no, patient_name, patient_phone, patient_age_years, patient_gender,
				doctor_id, doctor_name, procedure_name, status, total_mmk, created_by_user_id,
				discount_value, discount_unit, discount_mmk
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
		`, billNo, c.ID, c.CaseNo, c.PatientName, c.PatientPhone, c.PatientAgeYears, c.PatientGender,
			c.DoctorID, c.DoctorName, c.ProcedureName, net, uid,
			req.DiscountValue, discountUnit, discountMMK)
	}
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

	auditPayload := map[string]any{
		"bill_no": billNo, "case_no": c.CaseNo, "total_mmk": net, "discount_mmk": discountMMK,
	}
	if c.BilledAt != nil && strings.TrimSpace(*c.BilledAt) != "" {
		auditPayload["billed_at"] = *c.BilledAt
	}
	audit.WriteAudit(h.DB, &uid, "create", "ot_bill", &billID, auditPayload)
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
			created_at, updated_at, discount_value, discount_unit, discount_mmk, printed_at,
			admission_id, collected_cash, billed_at
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
	var legacy int
	var patientID sql.NullInt64
	var total int64
	err = tx.QueryRow(`
		SELECT b.status, b.bill_no, b.total_mmk, c.patient_id, c.legacy_stock_closed
		FROM ot_bills b
		JOIN ot_cases c ON c.id = b.case_id
		WHERE b.id = ?
	`, id).Scan(&status, &billNo, &total, &patientID, &legacy)
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
	n, err := execPayDraft(tx, "ot_bills", id, uid, charge.AdmissionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pay failed"})
		return
	}
	if n == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be paid"})
		return
	}
	if charge.AdmissionID != nil {
		if err := postLedgerTx(tx, *charge.AdmissionID, "charge", -total, "ot", id, billNo, uid); err != nil {
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
	audit.WriteAudit(h.DB, &uid, "pay", "ot_bill", &id, detail)
	bill, err := loadOtBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

var (
	errOtPurgeNotFound   = errors.New("not found")
	errOtPurgeCaseStatus = errors.New("only draft, billed, or void cases can be deleted")
	errOtPurgeBillStatus = errors.New("only draft or void bills can be deleted")
)

type otPurgeBillSummary struct {
	ID       int64
	BillNo   string
	Status   string
	TotalMMK int64
}

type otPurgeVisitResult struct {
	CaseID int64
	CaseNo string
	Bills  []otPurgeBillSummary
}

// purgeOtVisitTx removes a case and every draft/void bill on it. Paid bills refuse the whole visit.
func purgeOtVisitTx(tx *sql.Tx, caseID int64) (otPurgeVisitResult, error) {
	var out otPurgeVisitResult
	var status, caseNo string
	err := tx.QueryRow(`SELECT status, case_no FROM ot_cases WHERE id = ?`, caseID).Scan(&status, &caseNo)
	if err == sql.ErrNoRows {
		return out, errOtPurgeNotFound
	}
	if err != nil {
		return out, err
	}
	switch status {
	case "draft", "billed", "void":
	default:
		return out, errOtPurgeCaseStatus
	}
	out.CaseID = caseID
	out.CaseNo = caseNo

	rows, err := tx.Query(`
		SELECT id, status, bill_no, total_mmk FROM ot_bills WHERE case_id = ? ORDER BY id
	`, caseID)
	if err != nil {
		return out, err
	}
	bills := make([]otPurgeBillSummary, 0)
	for rows.Next() {
		var b otPurgeBillSummary
		if err := rows.Scan(&b.ID, &b.Status, &b.BillNo, &b.TotalMMK); err != nil {
			rows.Close()
			return out, err
		}
		if b.Status != "draft" && b.Status != "void" {
			rows.Close()
			return out, errOtPurgeBillStatus
		}
		bills = append(bills, b)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return out, err
	}
	rows.Close()

	for _, b := range bills {
		if err := purgeBillLedgerTx(tx, "ot", b.ID); err != nil {
			return out, err
		}
		res, err := tx.Exec(`DELETE FROM ot_bills WHERE id = ?`, b.ID)
		if err != nil {
			return out, err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return out, errOtPurgeNotFound
		}
	}
	res, err := tx.Exec(`DELETE FROM ot_cases WHERE id = ?`, caseID)
	if err != nil {
		return out, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return out, errOtPurgeNotFound
	}
	out.Bills = bills
	return out, nil
}

func writeOtPurgeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errOtPurgeNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	case errors.Is(err, errOtPurgeCaseStatus):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errOtPurgeCaseStatus.Error()})
	case errors.Is(err, errOtPurgeBillStatus):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft or void bills can be deleted"})
	case errors.Is(err, errLedgerNotBalanced):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "ledger not balanced"})
	default:
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
}

func (h *OT) purgeCase(w http.ResponseWriter, r *http.Request, path string) {
	user, ok := requireAdminUser(w, r)
	if !ok {
		return
	}
	id, ok := parseID(strings.TrimPrefix(path, "/cases"))
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

	result, err := purgeOtVisitTx(tx, id)
	if err != nil {
		writeOtPurgeErr(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}
	uid := user.ID
	for i := range result.Bills {
		b := result.Bills[i]
		billID := b.ID
		audit.WriteAudit(h.DB, &uid, "delete", "ot_bill", &billID, map[string]any{
			"bill_no": b.BillNo, "was_status": b.Status, "total_mmk": b.TotalMMK, "case_id": result.CaseID,
		})
	}
	caseID := result.CaseID
	audit.WriteAudit(h.DB, &uid, "delete", "ot_case", &caseID, map[string]any{
		"case_no": result.CaseNo, "bills": len(result.Bills),
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *OT) purgeBill(w http.ResponseWriter, r *http.Request, path string) {
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

	var status, billNo, caseNo string
	var totalMMK, caseID int64
	err = tx.QueryRow(`
		SELECT b.status, b.bill_no, b.total_mmk, b.case_id, c.case_no
		FROM ot_bills b
		JOIN ot_cases c ON c.id = b.case_id
		WHERE b.id = ?
	`, id).Scan(&status, &billNo, &totalMMK, &caseID, &caseNo)
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
	if err := purgeBillLedgerTx(tx, "ot", id); err != nil {
		if err == errLedgerNotBalanced {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "ledger not balanced"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ledger purge failed"})
		return
	}
	res, err := tx.Exec(`DELETE FROM ot_bills WHERE id = ?`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}

	var remaining int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM ot_bills WHERE case_id = ?`, caseID).Scan(&remaining); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "case check failed"})
		return
	}
	caseDeleted := false
	if remaining == 0 {
		cres, err := tx.Exec(`DELETE FROM ot_cases WHERE id = ?`, caseID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "case delete failed"})
			return
		}
		cn, _ := cres.RowsAffected()
		if cn == 0 {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		caseDeleted = true
	} else if _, err := tx.Exec(`
		UPDATE ot_cases SET status = 'draft', ot_bill_id = NULL, updated_at = datetime('now')
		WHERE id = ? AND ot_bill_id = ?
	`, caseID, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "case unlink failed"})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "delete", "ot_bill", &id, map[string]any{
		"bill_no": billNo, "was_status": status, "total_mmk": totalMMK, "case_id": caseID,
	})
	if caseDeleted {
		audit.WriteAudit(h.DB, &uid, "delete", "ot_case", &caseID, map[string]any{
			"case_no": caseNo, "bills": 1,
		})
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
	var admissionID sql.NullInt64
	err = tx.QueryRow(`SELECT status, bill_no, case_id, admission_id FROM ot_bills WHERE id = ?`, id).Scan(&status, &billNo, &caseID, &admissionID)
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
	if status == "paid" && admissionID.Valid {
		if ensureOpenStay(tx, admissionID.Int64).reject(w) {
			return
		}
	}
	if status == "paid" {
		if err := restoreOtBillStock(tx, id, billNo, req.Reason, uid); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if admissionID.Valid {
			if err := reverseLedgerTx(tx, admissionID.Int64, "ot", id, uid, billNo); err != nil {
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
		foc, errMsg := normalizeFocFlag(it.Foc)
		if errMsg != "" {
			return nil, errMsg
		}
		it.Foc = foc
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
		var l1q, l2q, l3q, l4q, l5q, l6q int64
		var l1u, l2u, l3u, l4u, l5u, l6u string
		err := tx.QueryRow(`
			SELECT code, name, sell_price_mmk, active,
				COALESCE(pack_l1_qty, 1), COALESCE(pack_l1_unit, ''),
				COALESCE(pack_l2_qty, 1), COALESCE(pack_l2_unit, ''),
				COALESCE(pack_l3_qty, 1), COALESCE(pack_l3_unit, ''),
				COALESCE(pack_l4_qty, 1), COALESCE(pack_l4_unit, ''),
				COALESCE(pack_l5_qty, 1), COALESCE(pack_l5_unit, ''),
				COALESCE(pack_l6_qty, 1), COALESCE(pack_l6_unit, '')
			FROM items WHERE id = ?
		`, items[i].ItemID).Scan(
			&code, &name, &price, &active,
			&l1q, &l1u, &l2q, &l2u, &l3q, &l3u, &l4q, &l4u, &l5q, &l5u, &l6q, &l6u,
		)
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
			pack := padPackTail(itemPack{
				L1Qty: l1q, L1Unit: l1u, L2Qty: l2q, L2Unit: l2u, L3Qty: l3q, L3Unit: l3u,
				L4Qty: l4q, L4Unit: l4u, L5Qty: l5q, L5Unit: l5u, L6Qty: l6q, L6Unit: l6u,
			})
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
				sale_qty, sale_unit, foc
			) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?)
		`, caseID, it.ItemID, it.Code, it.Name, it.SellPriceMMK, it.QtyIssued, it.SortOrder, it.SaleQty, it.SaleUnit, it.Foc); err != nil {
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
		foc, errMsg := normalizeFocFlag(s.Foc)
		if errMsg != "" {
			return nil, errMsg
		}
		s.Foc = foc
		s.SortOrder = i
		out = append(out, s)
	}
	return out, ""
}

// enrichOtCaseServices resolves active ot_services rows. Keeps the client case price
// (including null); does not copy catalog price_mmk onto the line.
// A deleted catalog row keeps the code and description already on the case line.
func enrichOtCaseServices(tx *sql.Tx, services []otCaseService) error {
	for i := range services {
		var code sql.NullString
		var name string
		var active int
		err := tx.QueryRow(`
			SELECT code, name, active FROM ot_services WHERE id = ?
		`, services[i].RefID).Scan(&code, &name, &active)
		if err == sql.ErrNoRows {
			continue
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
				case_id, service_id, code, description, unit_price_mmk, sort_order, foc
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`, caseID, s.RefID, s.Code, s.Description, s.UnitPriceMMK, s.SortOrder, s.Foc); err != nil {
			return err
		}
	}
	return nil
}

func loadOtCaseServicesTx(tx *sql.Tx, caseID int64) ([]otCaseService, error) {
	rows, err := tx.Query(`
		SELECT id, service_id, code, description, unit_price_mmk, sort_order, foc
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
		if err := rows.Scan(&s.ID, &s.RefID, &s.Code, &s.Description, &price, &s.SortOrder, &s.Foc); err != nil {
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
			c.qty_used, c.qty_returned, c.qty_wasted, c.qty_kept_on_floor, c.sort_order, c.foc,
			COALESCE(i.pack_l1_qty, 1), COALESCE(i.pack_l1_unit, ''),
			COALESCE(i.pack_l2_qty, 1), COALESCE(i.pack_l2_unit, ''),
			COALESCE(i.pack_l3_qty, 1), COALESCE(i.pack_l3_unit, ''),
			COALESCE(i.pack_l4_qty, 1), COALESCE(i.pack_l4_unit, ''),
			COALESCE(i.pack_l5_qty, 1), COALESCE(i.pack_l5_unit, ''),
			COALESCE(i.pack_l6_qty, 1), COALESCE(i.pack_l6_unit, '')
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
			&it.QtyUsed, &it.QtyReturned, &it.QtyWasted, &it.QtyKeptOnFloor, &it.SortOrder, &it.Foc,
			&it.PackL1Qty, &it.PackL1Unit, &it.PackL2Qty, &it.PackL2Unit, &it.PackL3Qty, &it.PackL3Unit,
			&it.PackL4Qty, &it.PackL4Unit, &it.PackL5Qty, &it.PackL5Unit, &it.PackL6Qty, &it.PackL6Unit,
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
		SELECT id, case_no, patient_id, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, procedure_name, notes, status, issued_at, reconciled_at,
			ot_bill_id, created_by_user_id, created_at, updated_at,
			discount_value, discount_unit, billed_at
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
	var patientID, age, doctorID, billID, createdBy sql.NullInt64
	var issuedAt, reconciledAt, billedAt sql.NullString
	err := row.Scan(
		&c.ID, &c.CaseNo, &patientID, &c.PatientName, &c.PatientPhone, &age, &c.PatientGender,
		&doctorID, &c.DoctorName, &c.ProcedureName, &c.Notes, &c.Status, &issuedAt, &reconciledAt,
		&billID, &createdBy, &c.CreatedAt, &c.UpdatedAt,
		&c.DiscountValue, &c.DiscountUnit, &billedAt,
	)
	if err != nil {
		return c, err
	}
	if patientID.Valid {
		v := patientID.Int64
		c.PatientID = &v
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
	if billedAt.Valid && strings.TrimSpace(billedAt.String) != "" {
		v := billedAt.String
		c.BilledAt = &v
	}
	return c, nil
}

func scanOtCaseWithBill(row scannable) (otCase, error) {
	var c otCase
	var patientID, age, doctorID, billID, createdBy, billTotal sql.NullInt64
	var issuedAt, reconciledAt, billStatus, billPrintedAt sql.NullString
	var billCollected sql.NullInt64
	err := row.Scan(
		&c.ID, &c.CaseNo, &patientID, &c.PatientName, &c.PatientPhone, &age, &c.PatientGender,
		&doctorID, &c.DoctorName, &c.ProcedureName, &c.Notes, &c.Status, &issuedAt, &reconciledAt,
		&billID, &createdBy, &c.CreatedAt, &c.UpdatedAt,
		&c.DiscountValue, &c.DiscountUnit, &billStatus, &billPrintedAt, &billCollected, &billTotal,
	)
	if err != nil {
		return c, err
	}
	if patientID.Valid {
		v := patientID.Int64
		c.PatientID = &v
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
	if billCollected.Valid {
		v := int(billCollected.Int64)
		c.BillCollectedCash = &v
	}
	if billTotal.Valid {
		v := billTotal.Int64
		c.BillTotalMMK = &v
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
			foc, errMsg := normalizeFocFlag(l.Foc)
			if errMsg != "" {
				return nil, errMsg
			}
			l.Foc = foc
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
		foc, errMsg := normalizeFocFlag(it.Foc)
		if errMsg != "" {
			return nil, 0, errMsg
		}
		lines = append(lines, otBillLine{
			LineType: "item", RefID: &itemID, Code: code,
			Description: name, Qty: it.QtyIssued, UnitPriceMMK: price,
			LineTotalMMK: lineTotal, SortOrder: sort, Foc: foc,
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
		foc, errMsg := normalizeFocFlag(s.Foc)
		if errMsg != "" {
			return nil, 0, errMsg
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
			Qty: 1, UnitPriceMMK: price, LineTotalMMK: price, SortOrder: sort, Foc: foc,
		})
		sort++
	}
	if len(lines) == 0 {
		return nil, 0, "nothing to bill (no items / OT fee / services)"
	}
	var total int64
	for _, l := range lines {
		total += billableLineTotal(l.LineTotalMMK, l.Foc)
	}
	return lines, total, ""
}

func insertOtBillLines(tx *sql.Tx, billID int64, lines []otBillLine) error {
	for _, l := range lines {
		if _, err := tx.Exec(`
			INSERT INTO ot_bill_lines (bill_id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order, foc)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, billID, l.LineType, l.RefID, l.Code, l.Description, l.Qty, l.UnitPriceMMK, l.LineTotalMMK, l.SortOrder, l.Foc); err != nil {
			return err
		}
	}
	return nil
}

func loadOtBillLinesTx(tx *sql.Tx, billID int64) ([]otBillLine, error) {
	rows, err := tx.Query(`
		SELECT id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order, foc
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

func loadOtBill(db *sql.DB, id int64) (otBill, error) {
	row := db.QueryRow(`
		SELECT id, bill_no, case_id, case_no, patient_name, patient_phone, patient_age_years, patient_gender,
			doctor_id, doctor_name, procedure_name, status, total_mmk, paid_at, voided_at, void_reason,
			created_at, updated_at, discount_value, discount_unit, discount_mmk, printed_at,
			admission_id, collected_cash, billed_at
		FROM ot_bills WHERE id = ?
	`, id)
	b, err := scanOtBill(row)
	if err != nil {
		return b, err
	}
	tx, err := db.Begin()
	if err != nil {
		return b, err
	}
	defer tx.Rollback()
	lines, err := loadOtBillLinesTx(tx, id)
	if err != nil {
		return b, err
	}
	b.Lines = lines
	return b, nil
}

func scanOtBill(row scannable) (otBill, error) {
	var b otBill
	var age, doctorID, admissionID sql.NullInt64
	var paidAt, voidedAt, printedAt, billedAt sql.NullString
	err := row.Scan(
		&b.ID, &b.BillNo, &b.CaseID, &b.CaseNo, &b.PatientName, &b.PatientPhone, &age, &b.PatientGender,
		&doctorID, &b.DoctorName, &b.ProcedureName, &b.Status, &b.TotalMMK, &paidAt, &voidedAt, &b.VoidReason,
		&b.CreatedAt, &b.UpdatedAt, &b.DiscountValue, &b.DiscountUnit, &b.DiscountMMK, &printedAt,
		&admissionID, &b.CollectedCash, &billedAt,
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
	if billedAt.Valid && strings.TrimSpace(billedAt.String) != "" {
		v := billedAt.String
		b.BilledAt = &v
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
	if admissionID.Valid {
		v := admissionID.Int64
		b.AdmissionID = &v
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
	dateLabel := receiptDateLabel(bill.CreatedAt, bill.BilledAt, bill.PaidAt)
	used := map[int]bool{}
	lines := make([]receiptLine, 0, len(bill.Lines)*2)
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
		lines = appendReceiptLine(lines, rl, line.Foc)
	}
	printedAt := ""
	if bill.PrintedAt != nil {
		printedAt = *bill.PrintedAt
	}
	return renderA4ReceiptHTML(hosp, receiptBill{
		Title:          "OPERATION THEATRE PAYMENT RECEIPT",
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
