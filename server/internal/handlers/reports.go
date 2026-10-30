package handlers

import (
	"database/sql"
	"fmt"
	"html"
	"net/http"
	"sort"
	"strings"
	"time"

	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// Reports serves daily cash, low-stock, and near-expiry reports (JSON + HTML print).
type Reports struct {
	DB *sql.DB
}

type cashLine struct {
	Source     string `json:"source"` // OPD | OT | Pharmacy | Lab
	BillNo     string `json:"bill_no"`
	Patient    string `json:"patient"`
	Doctor     string `json:"doctor"`
	TotalMMK   int64  `json:"total_mmk"`
	PaidAt     string `json:"paid_at"`
	PaidByName string `json:"paid_by_name"`
	Reversal   bool   `json:"reversal,omitempty"`
}

type cashReport struct {
	Date          string     `json:"date"`
	OPDCount      int        `json:"opd_count"`
	OPDTotal      int64      `json:"opd_total_mmk"`
	OTCount       int        `json:"ot_count"`
	OTTotal       int64      `json:"ot_total_mmk"`
	PharmacyCount int        `json:"pharmacy_count"`
	PharmacyTotal int64      `json:"pharmacy_total_mmk"`
	LabCount      int        `json:"lab_count"`
	LabTotal      int64      `json:"lab_total_mmk"`
	GrandTotal    int64      `json:"grand_total_mmk"`
	Lines         []cashLine `json:"lines"`
}

type lowStockRow struct {
	ID           int64  `json:"id"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	Category     string `json:"category"`
	StockMain    int64  `json:"stock_main"`
	ReorderLevel int64  `json:"reorder_level"`
	Deficit      int64  `json:"deficit"`
}

type expiryRow struct {
	BatchID    int64  `json:"batch_id"`
	ItemID     int64  `json:"item_id"`
	Code       string `json:"code"`
	Name       string `json:"name"`
	Location   string `json:"location_code"`
	BatchNo    string `json:"batch_no"`
	ExpiryDate string `json:"expiry_date"`
	Qty        int64  `json:"qty"`
	DaysLeft   int    `json:"days_left"`
}

func (h *Reports) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequireAuth(h.DB, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/reports")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}

		switch {
		case path == "/daily-cash" && r.Method == http.MethodGet:
			if !h.permitReport(w, r, "cash", false) {
				return
			}
			h.dailyCash(w, r, false)
		case path == "/daily-cash/print" && r.Method == http.MethodGet:
			if !h.permitReport(w, r, "cash", true) {
				return
			}
			h.dailyCash(w, r, true)
		case path == "/low-stock" && r.Method == http.MethodGet:
			if !h.permitReport(w, r, "stock", false) {
				return
			}
			h.lowStock(w, r, false)
		case path == "/low-stock/print" && r.Method == http.MethodGet:
			if !h.permitReport(w, r, "stock", true) {
				return
			}
			h.lowStock(w, r, true)
		case path == "/near-expiry" && r.Method == http.MethodGet:
			if !h.permitReport(w, r, "stock", false) {
				return
			}
			h.nearExpiry(w, r, false)
		case path == "/near-expiry/print" && r.Method == http.MethodGet:
			if !h.permitReport(w, r, "stock", true) {
				return
			}
			h.nearExpiry(w, r, true)
		default:
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		}
	})).ServeHTTP(w, r)
}

func canCashReport(role string) bool {
	return auth.HasPermission(role, auth.PermOPD) ||
		auth.HasPermission(role, auth.PermOT) ||
		auth.HasPermission(role, auth.PermPharmacy) ||
		auth.HasPermission(role, auth.PermLab) ||
		auth.HasPermission(role, auth.PermSettings)
}

func canStockReport(role string) bool {
	return auth.HasPermission(role, auth.PermPharmacy) ||
		auth.HasPermission(role, auth.PermSettings)
}

// permitReport allows the reads the dashboard app already calls.
// Portal desks keep the role checks. The dashboard grant opens these reads
// and does not satisfy settings anywhere else.
func (h *Reports) permitReport(w http.ResponseWriter, r *http.Request, kind string, asHTML bool) bool {
	user := middleware.UserFromContext(r.Context())
	ok, err := reportAllowed(h.DB, user, kind)
	if err != nil {
		if asHTML {
			http.Error(w, "report failed", http.StatusInternalServerError)
			return false
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "permission check failed"})
		return false
	}
	if !ok {
		if asHTML {
			http.Error(w, "forbidden", http.StatusForbidden)
			return false
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return false
	}
	return true
}

func reportAllowed(db *sql.DB, user *auth.User, kind string) (bool, error) {
	if user == nil {
		return false, nil
	}
	role, mode, err := auth.LoadAccess(db, user.ID)
	if err != nil {
		return false, err
	}
	if role == auth.RoleAdmin {
		return true, nil
	}
	if mode == auth.AccessPortal {
		if kind == "stock" {
			return canStockReport(role), nil
		}
		return canCashReport(role), nil
	}
	if mode != auth.AccessUnified {
		return false, nil
	}
	ok, err := auth.Allow(db, user.ID, auth.GrantDashboard)
	if err != nil || ok {
		return ok, err
	}
	if kind == "stock" {
		return auth.Allow(db, user.ID, auth.GrantPharmacyRead)
	}
	for _, grant := range []string{auth.GrantOPDRead, auth.GrantOTRead, auth.GrantPharmacyRead, auth.GrantLabRead} {
		ok, err = auth.Allow(db, user.ID, grant)
		if err != nil || ok {
			return ok, err
		}
	}
	return false, nil
}

func reportDate(r *http.Request) string {
	d := strings.TrimSpace(r.URL.Query().Get("date"))
	if _, err := time.Parse("2006-01-02", d); err != nil {
		return localToday()
	}
	return d
}

func (h *Reports) dailyCash(w http.ResponseWriter, r *http.Request, asHTML bool) {
	date := reportDate(r)
	rep, err := buildDailyCash(h.DB, date)
	if err != nil {
		if asHTML {
			http.Error(w, "report failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "report failed"})
		return
	}
	user := middleware.UserFromContext(r.Context())
	sources, err := cashSourcesForUser(h.DB, user)
	if err != nil {
		if asHTML {
			http.Error(w, "report failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "report failed"})
		return
	}
	scopeCashReport(rep, sources)
	if asHTML {
		hosp, _ := loadHospitalSettings(h.DB)
		if hosp == nil {
			hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(renderCashReportHTML(hosp, rep, sources)))
		return
	}
	writeJSON(w, http.StatusOK, rep)
}

func allCashSources() map[string]bool {
	return map[string]bool{"OPD": true, "OT": true, "Pharmacy": true, "Lab": true}
}

// cashSourcesForUser keeps each portal desk on its own bills.
// Admin and the dashboard grant see the combined report.
func cashSourcesForUser(db *sql.DB, user *auth.User) (map[string]bool, error) {
	if user == nil {
		return map[string]bool{}, nil
	}
	role, mode, err := auth.LoadAccess(db, user.ID)
	if err != nil {
		return nil, err
	}
	if role == auth.RoleAdmin {
		return allCashSources(), nil
	}
	if mode == auth.AccessPortal {
		return cashSourcesForRole(role), nil
	}
	if mode != auth.AccessUnified {
		return map[string]bool{}, nil
	}
	ok, err := auth.Allow(db, user.ID, auth.GrantDashboard)
	if err != nil {
		return nil, err
	}
	if ok {
		return allCashSources(), nil
	}
	sources := map[string]bool{}
	pairs := []struct {
		grant  string
		source string
	}{
		{auth.GrantOPDRead, "OPD"},
		{auth.GrantOTRead, "OT"},
		{auth.GrantPharmacyRead, "Pharmacy"},
		{auth.GrantLabRead, "Lab"},
	}
	for _, pair := range pairs {
		ok, err = auth.Allow(db, user.ID, pair.grant)
		if err != nil {
			return nil, err
		}
		if ok {
			sources[pair.source] = true
		}
	}
	return sources, nil
}

// cashSourcesForRole is the desks whose paid bills this role may see.
// Admin has every desk permission, so the admin dashboard print stays combined.
func cashSourcesForRole(role string) map[string]bool {
	sources := map[string]bool{}
	if auth.HasPermission(role, auth.PermOPD) {
		sources["OPD"] = true
	}
	if auth.HasPermission(role, auth.PermOT) {
		sources["OT"] = true
	}
	if auth.HasPermission(role, auth.PermPharmacy) {
		sources["Pharmacy"] = true
	}
	if auth.HasPermission(role, auth.PermLab) {
		sources["Lab"] = true
	}
	return sources
}

func scopeCashReport(rep *cashReport, sources map[string]bool) {
	if rep == nil {
		return
	}
	lines := make([]cashLine, 0)
	rep.OPDCount, rep.OTCount, rep.PharmacyCount, rep.LabCount = 0, 0, 0, 0
	rep.OPDTotal, rep.OTTotal, rep.PharmacyTotal, rep.LabTotal = 0, 0, 0, 0
	for _, line := range rep.Lines {
		if !sources[line.Source] {
			continue
		}
		lines = append(lines, line)
		accumulateCashLine(rep, line)
	}
	rep.Lines = lines
	rep.GrandTotal = rep.OPDTotal + rep.OTTotal + rep.PharmacyTotal + rep.LabTotal
}

// buildDailyCash is the desk part of buildCashMovement.
// A collected bill stays on the Asia/Yangon civil day of paid_at, including after a void.
// The opposite signed amount is posted on the Asia/Yangon civil day of voided_at.
// voided_at is UTC from datetime('now'); paid_at is already Yangon wall time.
// A void with a blank voided_at is left out of both days. Drafts, collected_cash = 0,
// and pharmacy TO- slips are not desk cash. Counts are payment legs only.
func buildDailyCash(db *sql.DB, date string) (*cashReport, error) {
	rep := &cashReport{Date: date, Lines: []cashLine{}}
	voidStart, voidEnd, ok := yangonDayUTCRange(date)
	if !ok {
		return rep, nil
	}
	for _, source := range []string{"OPD", "OT", "Pharmacy", "Lab"} {
		if err := appendDeskCash(db, rep, source, date, voidStart, voidEnd); err != nil {
			return nil, err
		}
	}
	rep.GrandTotal = rep.OPDTotal + rep.OTTotal + rep.PharmacyTotal + rep.LabTotal
	return rep, nil
}

func accumulateCashLine(rep *cashReport, line cashLine) {
	switch line.Source {
	case "OPD":
		if !line.Reversal {
			rep.OPDCount++
		}
		rep.OPDTotal += line.TotalMMK
	case "OT":
		if !line.Reversal {
			rep.OTCount++
		}
		rep.OTTotal += line.TotalMMK
	case "Pharmacy":
		if !line.Reversal {
			rep.PharmacyCount++
		}
		rep.PharmacyTotal += line.TotalMMK
	case "Lab":
		if !line.Reversal {
			rep.LabCount++
		}
		rep.LabTotal += line.TotalMMK
	}
}

func deskBillTable(source string) (table string, pharmacy bool, err error) {
	switch source {
	case "OPD":
		return "opd_bills", false, nil
	case "OT":
		return "ot_bills", false, nil
	case "Pharmacy":
		return "pharmacy_bills", true, nil
	case "Lab":
		return "lab_bills", false, nil
	default:
		return "", false, fmt.Errorf("unknown cash desk %s", source)
	}
}

func appendDeskCash(db *sql.DB, rep *cashReport, source, date, voidStart, voidEnd string) error {
	table, pharmacy, err := deskBillTable(source)
	if err != nil {
		return err
	}
	doctorSQL := "COALESCE(b.doctor_name, '')"
	payAmount := "b.total_mmk"
	voidAmount := "-b.total_mmk"
	extra := ""
	if pharmacy {
		doctorSQL = "''"
		payAmount = "CASE WHEN b.bill_no LIKE 'RT-%' THEN -b.total_mmk ELSE b.total_mmk END"
		voidAmount = "CASE WHEN b.bill_no LIKE 'RT-%' THEN b.total_mmk ELSE -b.total_mmk END"
		extra = " AND b.bill_no NOT LIKE 'TO-%'"
	}
	paySQL := fmt.Sprintf(`
		SELECT b.bill_no, b.patient_name, %s, %s,
		       COALESCE(b.paid_at, ''), COALESCE(u.display_name, '')
		FROM %s b
		LEFT JOIN users u ON u.id = b.paid_by_user_id
		WHERE b.collected_cash = 1
		  AND b.paid_at IS NOT NULL AND TRIM(b.paid_at) != ''
		  AND date(b.paid_at) = date(?)
		  AND (
		    b.status = 'paid'
		    OR (b.status = 'void' AND b.voided_at IS NOT NULL AND TRIM(b.voided_at) != '')
		  )%s
		ORDER BY b.paid_at ASC, b.id ASC
	`, doctorSQL, payAmount, table, extra)
	rows, err := db.Query(paySQL, date)
	if err != nil {
		return err
	}
	if err := scanDeskRows(rows, rep, source, false); err != nil {
		return err
	}
	voidSQL := fmt.Sprintf(`
		SELECT b.bill_no, b.patient_name, %s, %s,
		       COALESCE(b.paid_at, ''), COALESCE(u.display_name, '')
		FROM %s b
		LEFT JOIN users u ON u.id = b.paid_by_user_id
		WHERE b.collected_cash = 1
		  AND b.paid_at IS NOT NULL AND TRIM(b.paid_at) != ''
		  AND b.status = 'void'
		  AND b.voided_at IS NOT NULL AND TRIM(b.voided_at) != ''
		  AND b.voided_at >= ? AND b.voided_at < ?%s
		ORDER BY b.voided_at ASC, b.id ASC
	`, doctorSQL, voidAmount, table, extra)
	rows, err = db.Query(voidSQL, voidStart, voidEnd)
	if err != nil {
		return err
	}
	return scanDeskRows(rows, rep, source, true)
}

func scanDeskRows(rows *sql.Rows, rep *cashReport, source string, reversal bool) error {
	defer rows.Close()
	for rows.Next() {
		var line cashLine
		line.Source = source
		line.Reversal = reversal
		if err := rows.Scan(&line.BillNo, &line.Patient, &line.Doctor, &line.TotalMMK, &line.PaidAt, &line.PaidByName); err != nil {
			return err
		}
		rep.Lines = append(rep.Lines, line)
		accumulateCashLine(rep, line)
	}
	return rows.Err()
}

func (h *Reports) lowStock(w http.ResponseWriter, r *http.Request, asHTML bool) {
	list, err := listLowStock(h.DB)
	if err != nil {
		if asHTML {
			http.Error(w, "report failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "report failed"})
		return
	}
	if asHTML {
		hosp, _ := loadHospitalSettings(h.DB)
		if hosp == nil {
			hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(renderLowStockHTML(hosp, list)))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": list, "count": len(list)})
}

func listLowStock(db *sql.DB) ([]lowStockRow, error) {
	rows, err := db.Query(`
		SELECT i.id, i.code, i.name, i.category, i.reorder_level,
		       COALESCE((
		         SELECT SUM(b.qty) FROM item_batches b
		         WHERE b.item_id = i.id AND b.location_code = 'MAIN'
		       ), 0) AS stock_main
		FROM items i
		WHERE i.active = 1 AND i.reorder_level > 0
		ORDER BY i.code ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]lowStockRow, 0)
	for rows.Next() {
		var row lowStockRow
		if err := rows.Scan(&row.ID, &row.Code, &row.Name, &row.Category, &row.ReorderLevel, &row.StockMain); err != nil {
			return nil, err
		}
		if row.StockMain > row.ReorderLevel {
			continue
		}
		row.Deficit = row.ReorderLevel - row.StockMain
		out = append(out, row)
	}
	return out, rows.Err()
}

func (h *Reports) nearExpiry(w http.ResponseWriter, r *http.Request, asHTML bool) {
	days := 90
	if v := strings.TrimSpace(r.URL.Query().Get("days")); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 && n <= 730 {
			days = n
		}
	}
	list, err := listNearExpiry(h.DB, days)
	if err != nil {
		if asHTML {
			http.Error(w, "report failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "report failed"})
		return
	}
	if asHTML {
		hosp, _ := loadHospitalSettings(h.DB)
		if hosp == nil {
			hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(renderNearExpiryHTML(hosp, list, days)))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"days": days, "batches": list, "count": len(list)})
}

func listNearExpiry(db *sql.DB, days int) ([]expiryRow, error) {
	today := time.Now().Format("2006-01-02")
	limit := time.Now().AddDate(0, 0, days).Format("2006-01-02")
	rows, err := db.Query(`
		SELECT b.id, i.id, i.code, i.name, b.location_code, COALESCE(b.batch_no, ''),
		       b.expiry_date, b.qty
		FROM item_batches b
		JOIN items i ON i.id = b.item_id
		WHERE i.active = 1 AND b.qty > 0
		  AND b.location_code = 'MAIN'
		  AND b.expiry_date IS NOT NULL AND b.expiry_date != ''
		  AND date(b.expiry_date) <= date(?)
		ORDER BY b.expiry_date ASC, i.code ASC
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]expiryRow, 0)
	t0, _ := time.Parse("2006-01-02", today)
	for rows.Next() {
		var row expiryRow
		if err := rows.Scan(&row.BatchID, &row.ItemID, &row.Code, &row.Name, &row.Location, &row.BatchNo, &row.ExpiryDate, &row.Qty); err != nil {
			return nil, err
		}
		if exp, err := time.Parse("2006-01-02", row.ExpiryDate); err == nil {
			row.DaysLeft = int(exp.Sub(t0).Hours() / 24)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// listLiveNearExpiry is MAIN plus the OT cupboard. Legacy OT_FLOOR and
// OT_RESERVED rows are omitted so a copied floor batch is not counted twice.
func listLiveNearExpiry(db *sql.DB, days int) ([]expiryRow, error) {
	main, err := listNearExpiry(db, days)
	if err != nil {
		return nil, err
	}
	ot, err := listOtNearExpiry(db, days)
	if err != nil {
		return nil, err
	}
	out := append(main, ot...)
	sort.Slice(out, func(i, j int) bool {
		if out[i].ExpiryDate != out[j].ExpiryDate {
			return out[i].ExpiryDate < out[j].ExpiryDate
		}
		return out[i].Code < out[j].Code
	})
	return out, nil
}

func listOtNearExpiry(db *sql.DB, days int) ([]expiryRow, error) {
	today := time.Now().Format("2006-01-02")
	limit := time.Now().AddDate(0, 0, days).Format("2006-01-02")
	rows, err := db.Query(`
		SELECT b.id, i.id, i.code, i.name, COALESCE(b.batch_no, ''),
		       b.expiry_date, b.qty
		FROM ot_batches b
		JOIN items i ON i.id = b.item_id
		WHERE i.active = 1 AND b.qty > 0
		  AND b.expiry_date IS NOT NULL AND b.expiry_date != ''
		  AND date(b.expiry_date) <= date(?)
		ORDER BY b.expiry_date ASC, i.code ASC
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]expiryRow, 0)
	t0, _ := time.Parse("2006-01-02", today)
	for rows.Next() {
		var row expiryRow
		row.Location = "OT"
		if err := rows.Scan(&row.BatchID, &row.ItemID, &row.Code, &row.Name, &row.BatchNo, &row.ExpiryDate, &row.Qty); err != nil {
			return nil, err
		}
		if exp, err := time.Parse("2006-01-02", row.ExpiryDate); err == nil {
			row.DaysLeft = int(exp.Sub(t0).Hours() / 24)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func renderCashReportHTML(hosp *hospitalSettings, rep *cashReport, sources map[string]bool) string {
	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Daily cash ")
	b.WriteString(html.EscapeString(rep.Date))
	b.WriteString("</title><style>")
	b.WriteString(reportPrintCSS())
	b.WriteString("</style></head><body>")
	b.WriteString("<h1>")
	b.WriteString(html.EscapeString(hosp.HospitalName))
	b.WriteString("</h1>")
	b.WriteString("<h2>Daily cash report — ")
	b.WriteString(html.EscapeString(rep.Date))
	b.WriteString("</h2>")
	var parts []string
	if sources["OPD"] {
		parts = append(parts, fmt.Sprintf("OPD: %d · %s MMK", rep.OPDCount, formatMMK(rep.OPDTotal)))
	}
	if sources["Pharmacy"] {
		parts = append(parts, fmt.Sprintf("Pharmacy: %d · %s MMK", rep.PharmacyCount, formatMMK(rep.PharmacyTotal)))
	}
	if sources["OT"] {
		parts = append(parts, fmt.Sprintf("OT: %d · %s MMK", rep.OTCount, formatMMK(rep.OTTotal)))
	}
	if sources["Lab"] {
		parts = append(parts, fmt.Sprintf("Lab: %d · %s MMK", rep.LabCount, formatMMK(rep.LabTotal)))
	}
	parts = append(parts, fmt.Sprintf("<strong>Total: %s MMK</strong>", formatMMK(rep.GrandTotal)))
	b.WriteString(`<p class="summary">`)
	b.WriteString(strings.Join(parts, " &nbsp;|&nbsp; "))
	b.WriteString("</p>")
	b.WriteString("<table><thead><tr><th>Source</th><th>Bill</th><th>Patient</th><th>Doctor</th><th>Paid</th><th class=\"num\">MMK</th></tr></thead><tbody>")
	for _, line := range rep.Lines {
		b.WriteString("<tr><td>")
		b.WriteString(html.EscapeString(line.Source))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(line.BillNo))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(line.Patient))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(line.Doctor))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(line.PaidAt))
		b.WriteString("</td><td class=\"num\">")
		b.WriteString(formatMMK(line.TotalMMK))
		b.WriteString("</td></tr>")
	}
	if len(rep.Lines) == 0 {
		b.WriteString("<tr><td colspan=\"6\">No paid bills on this date.</td></tr>")
	}
	b.WriteString("</tbody></table>")
	b.WriteString("<p class=\"meta\">Printed from Mudita Hospital</p>")
	b.WriteString("</body></html>")
	return b.String()
}

// dailyPortalOrder is the print order for income and expense portal tables.
var dailyPortalOrder = []string{"OPD", "OT", "IPD", "Pharmacy", "Lab"}

// renderDashboardDailyHTML is the admin daily print. kind is income, expense,
// or overall (default). Income is desk bills plus IPD gains, one table per
// portal. Expense is paid expense lines grouped by portal. Overall prints
// income, then expenses on a new page, then Difference = income + expense.
// Drawer cash and open stays are omitted.
func renderDashboardDailyHTML(hosp *hospitalSettings, move *cashMovement, kind string) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	if kind == "" {
		kind = "overall"
	}
	desk := move.Desk
	if desk == nil {
		desk = &cashReport{Date: move.Date, Lines: []cashLine{}}
	}
	var earnedLines []ipdCashLine
	if move.IPDEarned != nil {
		earnedLines = move.IPDEarned.Lines
	}
	showIncome := kind == "income" || kind == "overall"
	showExpense := kind == "expense" || kind == "overall"

	title := "Daily cash"
	heading := "Daily Cash Report"
	switch kind {
	case "income":
		title = "Income"
		heading = "Income Cash Report"
	case "expense":
		title = "Expense"
		heading = "Expenses Cash Report"
	}
	dateLabel := dailyReportDateLabel(move.Date)

	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>")
	b.WriteString(html.EscapeString(title))
	b.WriteString(" ")
	b.WriteString(html.EscapeString(move.Date))
	b.WriteString("</title><style>")
	b.WriteString(dashboardDailyPrintCSS())
	b.WriteString("</style></head><body>")
	b.WriteString(`<div class="a4-sheet">`)
	writeA4Letterhead(&b, hosp)
	writeDailyReportTitle(&b, heading, dateLabel)

	if showIncome {
		wrote := writeDailyIncomeTables(&b, desk.Lines, earnedLines)
		if !wrote {
			b.WriteString(`<p class="daily-empty">No income on this date.</p>`)
		}
		if kind == "income" {
			writeDailySettle(&b, []dailySettleRow{
				{Label: "Total income", Amount: move.IncomeMMK, Emph: true},
			})
		}
	}

	if showExpense {
		if kind == "overall" {
			b.WriteString(`<div class="daily-page-break">`)
			writeDailyReportTitle(&b, "Expenses Cash Report", dateLabel)
		}
		wrote := writeDailyExpenseTables(&b, move.ExpenseLines)
		if !wrote {
			b.WriteString(`<p class="daily-empty">No expenses on this date.</p>`)
		}
		if kind == "expense" {
			writeDailySettle(&b, []dailySettleRow{
				{Label: "Total expenses", Amount: move.ExpenseMMK, Emph: true},
			})
		}
		if kind == "overall" {
			b.WriteString(`</div>`)
			writeDailySettle(&b, []dailySettleRow{
				{Label: "Total income", Amount: move.IncomeMMK, Emph: false},
				{Label: "Total expenses", Amount: move.ExpenseMMK, Emph: false},
				{Label: "Difference", Amount: move.IncomeMMK + move.ExpenseMMK, Emph: true},
			})
		}
	}

	b.WriteString(`<p class="meta">Printed from Mudita Hospital</p>`)
	b.WriteString(`</div></body></html>`)
	return b.String()
}

func writeDailyReportTitle(b *strings.Builder, heading, dateLabel string) {
	b.WriteString(`<p class="a4-title">`)
	b.WriteString(html.EscapeString(heading))
	b.WriteString(`</p><p class="daily-date">Date: `)
	b.WriteString(html.EscapeString(dateLabel))
	b.WriteString(`</p>`)
}

// dailyReportDateLabel turns YYYY-MM-DD into "Oct 30, 2026".
func dailyReportDateLabel(iso string) string {
	t, err := time.Parse("2006-01-02", strings.TrimSpace(iso))
	if err != nil {
		return iso
	}
	return t.Format("Jan 2, 2006")
}

type dailySettleRow struct {
	Label  string
	Amount int64
	Emph   bool
}

func writeDailySettle(b *strings.Builder, rows []dailySettleRow) {
	b.WriteString(`<table class="a4-settle">`)
	for _, row := range rows {
		writeA4SettleRow(b, row.Label, row.Amount, row.Emph)
	}
	b.WriteString(`</table>`)
}

// writeDailyIncomeTables emits one table per portal that has lines.
// Order is OPD, OT, IPD, Pharmacy, Lab. Returns whether any table was written.
func writeDailyIncomeTables(b *strings.Builder, desk []cashLine, earned []ipdCashLine) bool {
	bySource := map[string][]cashLine{}
	for _, line := range desk {
		bySource[line.Source] = append(bySource[line.Source], line)
	}
	wrote := false
	for _, portal := range dailyPortalOrder {
		if portal == "IPD" {
			if len(earned) == 0 {
				continue
			}
			writeDailyIPDIncomeTable(b, earned)
			wrote = true
			continue
		}
		lines := bySource[portal]
		if len(lines) == 0 {
			continue
		}
		writeDailyDeskIncomeTable(b, portal, lines)
		wrote = true
	}
	return wrote
}

func writeDailyDeskIncomeTable(b *strings.Builder, portal string, lines []cashLine) {
	openDailyPortalSection(b, portal)
	b.WriteString(`<table class="daily-table"><thead><tr>`)
	b.WriteString(`<th>Bill</th><th>Patient</th><th>Doctor</th><th>Paid</th><th class="num">MMK</th>`)
	b.WriteString(`</tr></thead><tbody>`)
	var subtotal int64
	for _, line := range lines {
		bill := line.BillNo
		if line.Reversal {
			bill += " (reversal)"
		}
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(bill))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Patient))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Doctor))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.PaidAt))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(formatMMK(line.TotalMMK))
		b.WriteString(`</td></tr>`)
		subtotal += line.TotalMMK
	}
	writeDailySubtotalRow(b, 4, subtotal)
	b.WriteString(`</tbody></table></section>`)
}

// ipdEarnedDisplayMMK is the income amount printed for one IPD line.
// Ward, charge, and reversal are stored negative, so the sheet shows the
// opposite. Deposit, collection, and refund are already signed as income.
func ipdEarnedDisplayMMK(line ipdCashLine) int64 {
	switch line.Kind {
	case "deposit", "collection", "refund":
		return line.AmountMMK
	default:
		return -line.AmountMMK
	}
}

func writeDailyIPDIncomeTable(b *strings.Builder, lines []ipdCashLine) {
	openDailyPortalSection(b, "IPD")
	b.WriteString(`<table class="daily-table"><thead><tr>`)
	b.WriteString(`<th>Kind</th><th>Admission</th><th>Patient</th><th class="num">MMK</th>`)
	b.WriteString(`</tr></thead><tbody>`)
	var subtotal int64
	for _, line := range lines {
		earned := ipdEarnedDisplayMMK(line)
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(line.Kind))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.AdmissionNo))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Patient))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(formatMMK(earned))
		b.WriteString(`</td></tr>`)
		subtotal += earned
	}
	writeDailySubtotalRow(b, 3, subtotal)
	b.WriteString(`</tbody></table></section>`)
}

// writeDailyExpenseTables emits one table per portal that has expense lines.
// Returns whether any table was written.
func writeDailyExpenseTables(b *strings.Builder, lines []expenseCashLine) bool {
	byPortal := map[string][]expenseCashLine{}
	for _, line := range lines {
		key := dailyExpensePortalLabel(line.Portal)
		byPortal[key] = append(byPortal[key], line)
	}
	wrote := false
	for _, portal := range dailyPortalOrder {
		group := byPortal[portal]
		if len(group) == 0 {
			continue
		}
		writeDailyExpensePortalTable(b, portal, group)
		wrote = true
	}
	// Any portal not in the fixed order still prints, after Lab.
	for key, group := range byPortal {
		known := false
		for _, portal := range dailyPortalOrder {
			if portal == key {
				known = true
				break
			}
		}
		if known || len(group) == 0 {
			continue
		}
		writeDailyExpensePortalTable(b, key, group)
		wrote = true
	}
	return wrote
}

func writeDailyExpensePortalTable(b *strings.Builder, portal string, lines []expenseCashLine) {
	openDailyPortalSection(b, portal)
	b.WriteString(`<table class="daily-table"><thead><tr>`)
	b.WriteString(`<th>Bill</th><th>Payee</th><th>Paid</th><th class="num">MMK</th>`)
	b.WriteString(`</tr></thead><tbody>`)
	var subtotal int64
	for _, line := range lines {
		bill := line.BillNo
		if line.Reversal {
			bill += " (reversal)"
		}
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(bill))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Name))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.PaidAt))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(formatMMK(line.AmountMMK))
		b.WriteString(`</td></tr>`)
		subtotal += line.AmountMMK
	}
	writeDailySubtotalRow(b, 3, subtotal)
	b.WriteString(`</tbody></table></section>`)
}

func writeDailySubtotalRow(b *strings.Builder, labelColspan int, amount int64) {
	b.WriteString(`<tr class="daily-subtotal"><td colspan="`)
	b.WriteString(fmt.Sprintf("%d", labelColspan))
	b.WriteString(`">Subtotal</td><td class="num">`)
	b.WriteString(formatMMK(amount))
	b.WriteString(`</td></tr>`)
}

func openDailyPortalSection(b *strings.Builder, title string) {
	b.WriteString(`<section class="block"><h3>`)
	b.WriteString(html.EscapeString(title))
	b.WriteString(`</h3>`)
}

func dailyExpensePortalLabel(portal string) string {
	switch strings.ToLower(strings.TrimSpace(portal)) {
	case "opd":
		return "OPD"
	case "ot":
		return "OT"
	case "ipd":
		return "IPD"
	case "pharmacy":
		return "Pharmacy"
	case "lab":
		return "Lab"
	default:
		if portal == "" {
			return "Other"
		}
		return portal
	}
}

func renderLowStockHTML(hosp *hospitalSettings, list []lowStockRow) string {
	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Low stock</title><style>")
	b.WriteString(reportPrintCSS())
	b.WriteString("</style></head><body>")
	b.WriteString("<h1>")
	b.WriteString(html.EscapeString(hosp.HospitalName))
	b.WriteString("</h1><h2>Low stock (MAIN ≤ reorder)</h2>")
	b.WriteString(fmt.Sprintf("<p class=\"summary\">%d items</p>", len(list)))
	b.WriteString("<table><thead><tr><th>Code</th><th>Name</th><th>Category</th><th class=\"num\">Stock</th><th class=\"num\">Reorder</th><th class=\"num\">Deficit</th></tr></thead><tbody>")
	for _, row := range list {
		b.WriteString("<tr><td>")
		b.WriteString(html.EscapeString(row.Code))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(row.Name))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(row.Category))
		b.WriteString("</td><td class=\"num\">")
		b.WriteString(fmt.Sprintf("%d", row.StockMain))
		b.WriteString("</td><td class=\"num\">")
		b.WriteString(fmt.Sprintf("%d", row.ReorderLevel))
		b.WriteString("</td><td class=\"num\">")
		b.WriteString(fmt.Sprintf("%d", row.Deficit))
		b.WriteString("</td></tr>")
	}
	if len(list) == 0 {
		b.WriteString("<tr><td colspan=\"6\">No low-stock items.</td></tr>")
	}
	b.WriteString("</tbody></table>")
	b.WriteString("</body></html>")
	return b.String()
}

func renderNearExpiryHTML(hosp *hospitalSettings, list []expiryRow, days int) string {
	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Near expiry</title><style>")
	b.WriteString(reportPrintCSS())
	b.WriteString("</style></head><body>")
	b.WriteString("<h1>")
	b.WriteString(html.EscapeString(hosp.HospitalName))
	b.WriteString(fmt.Sprintf("</h1><h2>Near expiry — MAIN (within %d days)</h2>", days))
	b.WriteString(fmt.Sprintf("<p class=\"summary\">%d batches</p>", len(list)))
	b.WriteString("<table><thead><tr><th>Code</th><th>Name</th><th>Loc</th><th>Batch</th><th>Expiry</th><th class=\"num\">Days</th><th class=\"num\">Qty</th></tr></thead><tbody>")
	for _, row := range list {
		cls := ""
		if row.DaysLeft < 0 {
			cls = " class=\"expired\""
		}
		b.WriteString("<tr" + cls + "><td>")
		b.WriteString(html.EscapeString(row.Code))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(row.Name))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(row.Location))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(row.BatchNo))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(row.ExpiryDate))
		b.WriteString("</td><td class=\"num\">")
		b.WriteString(fmt.Sprintf("%d", row.DaysLeft))
		b.WriteString("</td><td class=\"num\">")
		b.WriteString(fmt.Sprintf("%d", row.Qty))
		b.WriteString("</td></tr>")
	}
	if len(list) == 0 {
		b.WriteString("<tr><td colspan=\"7\">No batches near expiry.</td></tr>")
	}
	b.WriteString("</tbody></table>")
	b.WriteString("</body></html>")
	return b.String()
}

func reportPrintCSS() string {
	return `body{font-family:Segoe UI,Noto Sans,sans-serif;font-size:12px;margin:16px;color:#111}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:0 0 12px;font-weight:600}
.summary{margin:0 0 12px}.meta{color:#666;margin-top:16px;font-size:11px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
th{background:#f2f2f2}.num{text-align:right}.expired{background:#ffe8e0}
@media print{body{margin:0}}`
}

// dashboardDailyPrintCSS styles the admin daily A4 sheet: letterhead shared
// with OT receipts, portal tables, and an OT-style settle block at the end.
func dashboardDailyPrintCSS() string {
	return `
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
html{background:#fff;color-scheme:light}
body{
  margin:0;padding:0;color:#000;background:#fff;
  font-family:Arial,"Noto Sans Myanmar","Segoe UI",sans-serif;
  font-size:10pt;line-height:1.4;font-variant-numeric:tabular-nums;
  display:flex;justify-content:center;align-items:flex-start
}
.a4-sheet{width:100%;max-width:180mm;margin:0 auto;padding:8mm;box-sizing:border-box}
.a4-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:10px}
.a4-brand{display:flex;align-items:center;gap:10px;min-width:0}
.a4-logo{display:block;width:18mm;height:auto}
.a4-hospital{margin:0;font-size:16pt;font-weight:700;text-transform:uppercase}
.a4-contact{text-align:right;font-size:9pt;max-width:48%}
.a4-contact p{margin:0 0 2px}
.a4-title{text-align:center;font-size:14pt;font-weight:700;margin:12px 0 4px;letter-spacing:.02em}
.daily-date{text-align:center;font-size:11pt;font-weight:600;margin:0 0 14px}
.block{margin:18px 0 0}
.block h3{
  box-sizing:border-box;margin:0;padding:6px 10px;font-size:11pt;font-weight:700;line-height:1.35;
  background:#eee;color:#111;border:1px solid #000;border-bottom:none;
  page-break-after:avoid;break-after:avoid;
  -webkit-print-color-adjust:exact;print-color-adjust:exact
}
.daily-table{width:100%;border-collapse:collapse;margin:0 0 4px}
.daily-table th,.daily-table td{border:1px solid #000;padding:5px 8px;vertical-align:top;text-align:left}
.daily-table th{background:#eee;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.daily-table .num{text-align:right;white-space:nowrap}
.daily-table thead{display:table-header-group}
.daily-subtotal td{font-weight:700;background:#f7f7f7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.daily-empty{margin:12px 0;font-size:10.5pt}
.daily-page-break{page-break-before:always;break-before:page;margin-top:0;padding-top:0}
.daily-page-break .a4-title{margin-top:0}
.a4-settle{width:100%;max-width:70mm;margin:18px 0 0 auto;border-collapse:collapse}
.a4-settle td{padding:3px 0 3px 8px;font-size:10.5pt}
.a4-settle td:last-child{text-align:right;white-space:nowrap}
.a4-settle .emph td{font-weight:700;font-size:11.5pt;padding-top:6px;border-top:1px solid #000}
.meta{color:#666;margin-top:16px;font-size:9pt}
@media print{
  body{margin:0;display:flex;justify-content:center;align-items:flex-start}
  .a4-sheet{padding:8mm}
  .block h3,.daily-table th,.daily-subtotal td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`
}
