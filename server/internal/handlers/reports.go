package handlers

import (
	"database/sql"
	"fmt"
	"html"
	"net/http"
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
}

type cashReport struct {
	Date           string     `json:"date"`
	OPDCount       int        `json:"opd_count"`
	OPDTotal       int64      `json:"opd_total_mmk"`
	OTCount        int        `json:"ot_count"`
	OTTotal        int64      `json:"ot_total_mmk"`
	PharmacyCount  int        `json:"pharmacy_count"`
	PharmacyTotal  int64      `json:"pharmacy_total_mmk"`
	GrandTotal     int64      `json:"grand_total_mmk"`
	Lines          []cashLine `json:"lines"`
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
	BatchID     int64  `json:"batch_id"`
	ItemID      int64  `json:"item_id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Location    string `json:"location_code"`
	BatchNo     string `json:"batch_no"`
	ExpiryDate  string `json:"expiry_date"`
	Qty         int64  `json:"qty"`
	DaysLeft    int    `json:"days_left"`
}

func (h *Reports) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequireAuth(h.DB, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := middleware.UserFromContext(r.Context())
		path := strings.TrimPrefix(r.URL.Path, "/api/reports")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}

		switch {
		case path == "/daily-cash" && r.Method == http.MethodGet:
			if !canCashReport(user.Role) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
				return
			}
			h.dailyCash(w, r, false)
		case path == "/daily-cash/print" && r.Method == http.MethodGet:
			if !canCashReport(user.Role) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			h.dailyCash(w, r, true)
		case path == "/low-stock" && r.Method == http.MethodGet:
			if !canStockReport(user.Role) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
				return
			}
			h.lowStock(w, r, false)
		case path == "/low-stock/print" && r.Method == http.MethodGet:
			if !canStockReport(user.Role) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			h.lowStock(w, r, true)
		case path == "/near-expiry" && r.Method == http.MethodGet:
			if !canStockReport(user.Role) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
				return
			}
			h.nearExpiry(w, r, false)
		case path == "/near-expiry/print" && r.Method == http.MethodGet:
			if !canStockReport(user.Role) {
				http.Error(w, "forbidden", http.StatusForbidden)
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

func reportDate(r *http.Request) string {
	d := strings.TrimSpace(r.URL.Query().Get("date"))
	if d == "" {
		return time.Now().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", d); err != nil {
		return time.Now().Format("2006-01-02")
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
	if asHTML {
		hosp, _ := loadHospitalSettings(h.DB)
		if hosp == nil {
			hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(renderCashReportHTML(hosp, rep)))
		return
	}
	writeJSON(w, http.StatusOK, rep)
}

func buildDailyCash(db *sql.DB, date string) (*cashReport, error) {
	rep := &cashReport{Date: date, Lines: []cashLine{}}

	opdRows, err := db.Query(`
		SELECT b.bill_no, b.patient_name, COALESCE(b.doctor_name, ''), b.total_mmk,
		       COALESCE(b.paid_at, ''), COALESCE(u.display_name, '')
		FROM opd_bills b
		LEFT JOIN users u ON u.id = b.paid_by_user_id
		WHERE b.status = 'paid' AND date(b.paid_at) = date(?)
		ORDER BY b.paid_at ASC, b.id ASC
	`, date)
	if err != nil {
		return nil, err
	}
	defer opdRows.Close()
	for opdRows.Next() {
		var line cashLine
		line.Source = "OPD"
		if err := opdRows.Scan(&line.BillNo, &line.Patient, &line.Doctor, &line.TotalMMK, &line.PaidAt, &line.PaidByName); err != nil {
			return nil, err
		}
		rep.Lines = append(rep.Lines, line)
		rep.OPDCount++
		rep.OPDTotal += line.TotalMMK
	}
	if err := opdRows.Err(); err != nil {
		return nil, err
	}

	otRows, err := db.Query(`
		SELECT b.bill_no, b.patient_name, COALESCE(b.doctor_name, ''), b.total_mmk,
		       COALESCE(b.paid_at, ''), COALESCE(u.display_name, '')
		FROM ot_bills b
		LEFT JOIN users u ON u.id = b.paid_by_user_id
		WHERE b.status = 'paid' AND date(b.paid_at) = date(?)
		ORDER BY b.paid_at ASC, b.id ASC
	`, date)
	if err != nil {
		return nil, err
	}
	defer otRows.Close()
	for otRows.Next() {
		var line cashLine
		line.Source = "OT"
		if err := otRows.Scan(&line.BillNo, &line.Patient, &line.Doctor, &line.TotalMMK, &line.PaidAt, &line.PaidByName); err != nil {
			return nil, err
		}
		rep.Lines = append(rep.Lines, line)
		rep.OTCount++
		rep.OTTotal += line.TotalMMK
	}
	if err := otRows.Err(); err != nil {
		return nil, err
	}

	phRows, err := db.Query(`
		SELECT b.bill_no, b.patient_name, '', b.total_mmk,
		       COALESCE(b.paid_at, ''), COALESCE(u.display_name, '')
		FROM pharmacy_bills b
		LEFT JOIN users u ON u.id = b.paid_by_user_id
		WHERE b.status = 'paid' AND date(b.paid_at) = date(?)
		ORDER BY b.paid_at ASC, b.id ASC
	`, date)
	if err != nil {
		return nil, err
	}
	defer phRows.Close()
	for phRows.Next() {
		var line cashLine
		line.Source = "Pharmacy"
		if err := phRows.Scan(&line.BillNo, &line.Patient, &line.Doctor, &line.TotalMMK, &line.PaidAt, &line.PaidByName); err != nil {
			return nil, err
		}
		rep.Lines = append(rep.Lines, line)
		rep.PharmacyCount++
		rep.PharmacyTotal += line.TotalMMK
	}
	if err := phRows.Err(); err != nil {
		return nil, err
	}

	rep.GrandTotal = rep.OPDTotal + rep.OTTotal + rep.PharmacyTotal
	return rep, nil
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

func renderCashReportHTML(hosp *hospitalSettings, rep *cashReport) string {
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
	b.WriteString(fmt.Sprintf(
		"<p class=\"summary\">OPD: %d · %s MMK &nbsp;|&nbsp; Pharmacy: %d · %s MMK &nbsp;|&nbsp; OT: %d · %s MMK &nbsp;|&nbsp; <strong>Total: %s MMK</strong></p>",
		rep.OPDCount, formatMMK(rep.OPDTotal),
		rep.PharmacyCount, formatMMK(rep.PharmacyTotal),
		rep.OTCount, formatMMK(rep.OTTotal),
		formatMMK(rep.GrandTotal),
	))
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
	b.WriteString(fmt.Sprintf("</h1><h2>Near expiry (within %d days)</h2>", days))
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
