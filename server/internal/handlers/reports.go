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
	Source     string `json:"source"` // OPD | OT | Pharmacy
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
	for _, grant := range []string{auth.GrantOPDRead, auth.GrantOTRead, auth.GrantPharmacyRead} {
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
	return map[string]bool{"OPD": true, "OT": true, "Pharmacy": true}
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
	return sources
}

func scopeCashReport(rep *cashReport, sources map[string]bool) {
	if rep == nil {
		return
	}
	lines := make([]cashLine, 0)
	rep.OPDCount, rep.OTCount, rep.PharmacyCount = 0, 0, 0
	rep.OPDTotal, rep.OTTotal, rep.PharmacyTotal = 0, 0, 0
	for _, line := range rep.Lines {
		if !sources[line.Source] {
			continue
		}
		lines = append(lines, line)
		accumulateCashLine(rep, line)
	}
	rep.Lines = lines
	rep.GrandTotal = rep.OPDTotal + rep.OTTotal + rep.PharmacyTotal
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
	for _, source := range []string{"OPD", "OT", "Pharmacy"} {
		if err := appendDeskCash(db, rep, source, date, voidStart, voidEnd); err != nil {
			return nil, err
		}
	}
	rep.GrandTotal = rep.OPDTotal + rep.OTTotal + rep.PharmacyTotal
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

// renderDashboardDailyHTML is the admin daily print. It follows the clinic
// cash sheet and adds the three signed totals plus IPD and expense lines.
// net_cash_mmk is income_mmk + expense_mmk. expense_mmk is already signed.
func renderDashboardDailyHTML(hosp *hospitalSettings, move *cashMovement) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	desk := move.Desk
	if desk == nil {
		desk = &cashReport{Date: move.Date, Lines: []cashLine{}}
	}
	var ipdLines []ipdCashLine
	if move.IPD != nil {
		ipdLines = move.IPD.Lines
	}
	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Daily cash ")
	b.WriteString(html.EscapeString(move.Date))
	b.WriteString("</title><style>")
	b.WriteString(reportPrintCSS())
	b.WriteString("</style></head><body><h1>")
	b.WriteString(html.EscapeString(hosp.HospitalName))
	b.WriteString("</h1><h2>Daily cash report — ")
	b.WriteString(html.EscapeString(move.Date))
	b.WriteString("</h2><p class=\"summary\">Income: ")
	b.WriteString(formatMMK(move.IncomeMMK))
	b.WriteString(" MMK &nbsp;|&nbsp; Expenses: ")
	b.WriteString(formatMMK(move.ExpenseMMK))
	b.WriteString(" MMK &nbsp;|&nbsp; <strong>Net: ")
	b.WriteString(formatMMK(move.NetCashMMK))
	b.WriteString(" MMK</strong></p>")
	b.WriteString("<p class=\"summary\"><strong>Desk</strong></p>")
	b.WriteString("<table><thead><tr><th>Source</th><th>Bill</th><th>Patient</th><th>Doctor</th><th>Paid</th><th class=\"num\">MMK</th></tr></thead><tbody>")
	for _, line := range desk.Lines {
		source := line.Source
		if line.Reversal {
			source += " Reversal"
		}
		b.WriteString("<tr><td>")
		b.WriteString(html.EscapeString(source))
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
	if len(desk.Lines) == 0 {
		b.WriteString("<tr><td colspan=\"6\">No paid bills on this date.</td></tr>")
	}
	b.WriteString("</tbody></table>")
	b.WriteString("<p class=\"summary\"><strong>IPD</strong></p>")
	b.WriteString("<table><thead><tr><th>Kind</th><th>Admission</th><th>Patient</th><th class=\"num\">MMK</th></tr></thead><tbody>")
	for _, line := range ipdLines {
		b.WriteString("<tr><td>")
		b.WriteString(html.EscapeString(line.Kind))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(line.AdmissionNo))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(line.Patient))
		b.WriteString("</td><td class=\"num\">")
		b.WriteString(formatMMK(line.AmountMMK))
		b.WriteString("</td></tr>")
	}
	if len(ipdLines) == 0 {
		b.WriteString("<tr><td colspan=\"4\">No IPD cash on this date.</td></tr>")
	}
	b.WriteString("</tbody></table>")
	b.WriteString("<p class=\"summary\"><strong>Expenses</strong></p>")
	b.WriteString("<table><thead><tr><th>Bill</th><th>Portal</th><th>Payee</th><th>Paid</th><th class=\"num\">MMK</th></tr></thead><tbody>")
	for _, line := range move.ExpenseLines {
		b.WriteString("<tr><td>")
		b.WriteString(html.EscapeString(line.BillNo))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(line.Portal))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(line.Name))
		b.WriteString("</td><td>")
		b.WriteString(html.EscapeString(line.PaidAt))
		b.WriteString("</td><td class=\"num\">")
		b.WriteString(formatMMK(line.AmountMMK))
		b.WriteString("</td></tr>")
	}
	if len(move.ExpenseLines) == 0 {
		b.WriteString("<tr><td colspan=\"5\">No paid expenses on this date.</td></tr>")
	}
	b.WriteString("</tbody></table>")
	b.WriteString("<p class=\"meta\">Printed from Mudita Hospital</p></body></html>")
	return b.String()
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
