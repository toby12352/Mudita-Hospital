package handlers

import (
	"database/sql"
	"fmt"
	"html"
	"net/http"
	"sort"
	"strings"
	"time"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

// Discharge settles an open stay from the ledger sum. A positive balance (the
// hospital owes the patient) writes a refund. A negative balance writes a
// collection. Zero writes no cash line. Status becomes settled either way.
// Later deposits, ward charges, and desk charges fail because the stay is not open.

func (h *IPD) discharge(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := admissionActionID(path, "discharge")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "discharge failed"})
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	var status string
	err = tx.QueryRow(`SELECT status FROM ipd_admissions WHERE id = ?`, id).Scan(&status)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "discharge failed"})
		return
	}
	if status != "open" {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "stay is not open"})
		return
	}

	var balance int64
	if err := tx.QueryRow(`
		SELECT COALESCE(SUM(amount_mmk), 0) FROM ipd_ledger WHERE admission_id = ?
	`, id).Scan(&balance); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "discharge failed"})
		return
	}

	var actorID any
	var auditActor *int64
	if user := middleware.UserFromContext(r.Context()); user != nil {
		actorID = user.ID
		uid := user.ID
		auditActor = &uid
	}

	kind := ""
	amount := int64(0)
	var lineID int64
	switch {
	case balance > 0:
		kind = "refund"
		amount = -balance
	case balance < 0:
		kind = "collection"
		amount = -balance
	}
	if kind != "" {
		res, err := tx.Exec(`
			INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, source, note, actor_user_id)
			VALUES (?, ?, ?, '', '', ?)
		`, id, kind, amount, actorID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "discharge failed"})
			return
		}
		lineID, _ = res.LastInsertId()
	}

	res, err := tx.Exec(`
		UPDATE ipd_admissions
		SET status = 'settled', discharged_at = datetime('now'), updated_at = datetime('now')
		WHERE id = ? AND status = 'open'
	`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "discharge failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "stay is not open"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "discharge failed"})
		return
	}
	committed = true

	if kind != "" {
		audit.WriteAudit(h.DB, auditActor, "create", "ipd_ledger", &lineID, map[string]any{
			"admission_id": id,
			"kind":         kind,
			"amount_mmk":   amount,
		})
	}
	audit.WriteAudit(h.DB, auditActor, "update", "ipd_admission", &id, map[string]any{
		"status":                "settled",
		"balance_before_mmk":    balance,
		"settlement_kind":       kind,
		"settlement_amount_mmk": amount,
	})

	row, err := loadAdmissionDetail(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, row)
}

func (h *IPD) printStatement(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := admissionActionID(path, "statement")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	daily := strings.TrimSpace(r.URL.Query().Get("date"))
	if daily != "" {
		if _, _, ok := yangonDayUTCRange(daily); !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid date"})
			return
		}
	}
	row, err := loadAdmissionDetail(h.DB, id)
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
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderIpdStatement(h.DB, hosp, row, daily)))
}

type ipdCashLine struct {
	Kind        string `json:"kind"`
	AmountMMK   int64  `json:"amount_mmk"`
	AdmissionNo string `json:"admission_no"`
	Patient     string `json:"patient"`
	Note        string `json:"note"`
	CreatedAt   string `json:"created_at"`
}

type ipdCashReport struct {
	Date          string        `json:"date"`
	DepositMMK    int64         `json:"deposit_mmk"`
	CollectionMMK int64         `json:"collection_mmk"`
	RefundMMK     int64         `json:"refund_mmk"`
	NetMMK        int64         `json:"net_mmk"`
	Lines         []ipdCashLine `json:"lines"`
}

// ipdEarnedReport is ward, desk charge, and reversal lines for one Yangon day.
// Ledger stores charges as negative. EarnedMMK is the opposite of that sum.
type ipdEarnedReport struct {
	Date      string        `json:"date"`
	EarnedMMK int64         `json:"earned_mmk"`
	Lines     []ipdCashLine `json:"lines"`
}

// ipdOpenStayRow is one stay still open at the end of a Yangon civil day.
// BalanceMMK is the ledger sum through that day: positive means the hospital
// still holds the patient's deposit; negative means the patient owes.
type ipdOpenStayRow struct {
	AdmissionNo string `json:"admission_no"`
	Patient     string `json:"patient"`
	BalanceMMK  int64  `json:"balance_mmk"`
}

type ipdOpenStayReport struct {
	Date              string           `json:"date"`
	OwedToPatientsMMK int64            `json:"owed_to_patients_mmk"`
	OwedByPatientsMMK int64            `json:"owed_by_patients_mmk"`
	Stays             []ipdOpenStayRow `json:"stays"`
}

func (h *IPD) dailyCash(w http.ResponseWriter, r *http.Request, asHTML bool) {
	date := reportDate(r)
	rep, err := buildIpdCash(h.DB, date)
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
		_, _ = w.Write([]byte(renderIpdCashHTML(hosp, rep)))
		return
	}
	writeJSON(w, http.StatusOK, rep)
}

// buildIpdCash sums deposits, collections, and refunds on the Asia/Yangon
// civil day of ledger created_at. Rows are stored as UTC datetime('now').
// Ward, charge, and reversal rows are not cash. Drawer cash is not income;
// earned charges enter income through buildIpdEarned.
func buildIpdCash(db *sql.DB, date string) (*ipdCashReport, error) {
	rep := &ipdCashReport{Date: date, Lines: []ipdCashLine{}}
	start, end, ok := yangonDayUTCRange(date)
	if !ok {
		return rep, nil
	}
	rows, err := db.Query(`
		SELECT l.kind, l.amount_mmk, l.note, l.created_at, a.admission_no, p.name
		FROM ipd_ledger l
		JOIN ipd_admissions a ON a.id = l.admission_id
		JOIN patients p ON p.id = a.patient_id
		WHERE l.kind IN ('deposit', 'collection', 'refund')
		  AND l.created_at >= ? AND l.created_at < ?
		ORDER BY l.created_at, l.id
	`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var line ipdCashLine
		if err := rows.Scan(&line.Kind, &line.AmountMMK, &line.Note, &line.CreatedAt, &line.AdmissionNo, &line.Patient); err != nil {
			return nil, err
		}
		switch line.Kind {
		case "deposit":
			rep.DepositMMK += line.AmountMMK
		case "collection":
			rep.CollectionMMK += line.AmountMMK
		case "refund":
			rep.RefundMMK += line.AmountMMK
		}
		rep.NetMMK += line.AmountMMK
		rep.Lines = append(rep.Lines, line)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return rep, nil
}

// buildIpdEarned sums ward, charge, and reversal lines on the Asia/Yangon
// civil day. Charges are stored negative; EarnedMMK is the opposite of that sum.
func buildIpdEarned(db *sql.DB, date string) (*ipdEarnedReport, error) {
	rep := &ipdEarnedReport{Date: date, Lines: []ipdCashLine{}}
	start, end, ok := yangonDayUTCRange(date)
	if !ok {
		return rep, nil
	}
	rows, err := db.Query(`
		SELECT l.kind, l.amount_mmk, l.note, l.created_at, a.admission_no, p.name
		FROM ipd_ledger l
		JOIN ipd_admissions a ON a.id = l.admission_id
		JOIN patients p ON p.id = a.patient_id
		WHERE l.kind IN ('ward', 'charge', 'reversal')
		  AND l.created_at >= ? AND l.created_at < ?
		ORDER BY l.created_at, l.id
	`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var chargeSum int64
	for rows.Next() {
		var line ipdCashLine
		if err := rows.Scan(&line.Kind, &line.AmountMMK, &line.Note, &line.CreatedAt, &line.AdmissionNo, &line.Patient); err != nil {
			return nil, err
		}
		chargeSum += line.AmountMMK
		rep.Lines = append(rep.Lines, line)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rep.EarnedMMK = -chargeSum
	return rep, nil
}

// buildIpdOpenStays lists stays still open at the end of the Yangon civil day
// and the ledger balance through that moment.
func buildIpdOpenStays(db *sql.DB, date string) (*ipdOpenStayReport, error) {
	rep := &ipdOpenStayReport{Date: date, Stays: []ipdOpenStayRow{}}
	_, end, ok := yangonDayUTCRange(date)
	if !ok {
		return rep, nil
	}
	rows, err := db.Query(`
		SELECT a.admission_no, p.name,
		       COALESCE((
		         SELECT SUM(l.amount_mmk) FROM ipd_ledger l
		         WHERE l.admission_id = a.id AND l.created_at < ?
		       ), 0)
		FROM ipd_admissions a
		JOIN patients p ON p.id = a.patient_id
		WHERE a.admitted_at < ?
		  AND (
		    a.discharged_at IS NULL
		    OR TRIM(a.discharged_at) = ''
		    OR a.discharged_at >= ?
		  )
		ORDER BY a.admission_no
	`, end, end, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var row ipdOpenStayRow
		if err := rows.Scan(&row.AdmissionNo, &row.Patient, &row.BalanceMMK); err != nil {
			return nil, err
		}
		if row.BalanceMMK > 0 {
			rep.OwedToPatientsMMK += row.BalanceMMK
		} else if row.BalanceMMK < 0 {
			rep.OwedByPatientsMMK += -row.BalanceMMK
		}
		rep.Stays = append(rep.Stays, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return rep, nil
}

func yangonDayUTCRange(date string) (start, end string, ok bool) {
	startT, err := time.ParseInLocation("2006-01-02", date, yangon)
	if err != nil {
		return "", "", false
	}
	endT := startT.AddDate(0, 0, 1)
	return startT.UTC().Format("2006-01-02 15:04:05"), endT.UTC().Format("2006-01-02 15:04:05"), true
}

func ledgerBillNo(db *sql.DB, source string, sourceID *int64) string {
	if db == nil || sourceID == nil {
		return ""
	}
	table := ""
	switch source {
	case "opd":
		table = "opd_bills"
	case "ot":
		table = "ot_bills"
	case "pharmacy":
		table = "pharmacy_bills"
	default:
		return ""
	}
	var billNo string
	err := db.QueryRow(`SELECT bill_no FROM `+table+` WHERE id = ?`, *sourceID).Scan(&billNo)
	if err != nil {
		return ""
	}
	return billNo
}

func statementDesk(source string) string {
	switch source {
	case "opd":
		return "OPD"
	case "ot":
		return "OT"
	case "pharmacy":
		return "Pharmacy"
	default:
		return ""
	}
}

func statementKind(line ipdLedgerLine) string {
	switch line.Kind {
	case "deposit":
		return "Deposit"
	case "ward":
		return "Ward"
	case "charge":
		charge := line.AmountMMK < 0
		switch line.Source {
		case "opd":
			if charge {
				return "OPD charge"
			}
			return "OPD credit"
		case "ot":
			if charge {
				return "OT charge"
			}
			return "OT credit"
		case "pharmacy":
			if charge {
				return "Pharmacy charge"
			}
			return "Pharmacy credit"
		default:
			if charge {
				return "Desk charge"
			}
			return "Desk credit"
		}
	case "reversal":
		return "Reversal"
	case "refund":
		return "Refund"
	case "collection":
		return "Collection"
	default:
		return line.Kind
	}
}

func statementDetail(db *sql.DB, line ipdLedgerLine) string {
	detail := strings.TrimSpace(line.Note)
	desk := statementDesk(line.Source)
	if desk == "" {
		return detail
	}
	bill := ledgerBillNo(db, line.Source, line.SourceID)
	// Charge/credit kinds already name the desk (e.g. "OPD charge"), so detail keeps the bill only.
	label := desk
	if line.Kind == "charge" {
		label = bill
		if label == "" {
			return detail
		}
	} else if bill != "" {
		label = desk + " " + bill
	}
	if detail == "" {
		return label
	}
	if label == "" {
		return detail
	}
	return label + " · " + detail
}

func ipdStatementCSS() string {
	return a4ReceiptCSS() + `
.a4-kv .label{flex-basis:14ch}
.a4-day{margin:12px 0 6px;font-size:12pt;font-weight:700}
.a4-items tfoot td{font-weight:700}
.a4-time{width:8ch;white-space:nowrap}
`
}

// ledgerUTC parses a stored datetime('now') value. Those rows are UTC.
func ledgerUTC(createdAt string) (time.Time, bool) {
	ts, err := time.ParseInLocation("2006-01-02 15:04:05", strings.TrimSpace(createdAt), time.UTC)
	if err != nil {
		return time.Time{}, false
	}
	return ts, true
}

func yangonDateKey(createdAt string) (string, bool) {
	ts, ok := ledgerUTC(createdAt)
	if !ok {
		return "", false
	}
	return ts.In(yangon).Format("2006-01-02"), true
}

func formatLedgerDate(createdAt string) string {
	ts, ok := ledgerUTC(createdAt)
	if !ok {
		return strings.TrimSpace(createdAt)
	}
	return ts.In(yangon).Format("02 Jan 2006")
}

func formatLedgerTime(createdAt string) string {
	ts, ok := ledgerUTC(createdAt)
	if !ok {
		return strings.TrimSpace(createdAt)
	}
	return ts.In(yangon).Format("15:04")
}

func formatLedgerDateTime(createdAt string) string {
	ts, ok := ledgerUTC(createdAt)
	if !ok {
		return strings.TrimSpace(createdAt)
	}
	return ts.In(yangon).Format("02 Jan 2006 15:04")
}

func formatCivilDate(iso string) string {
	ts, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(iso), yangon)
	if err != nil {
		return strings.TrimSpace(iso)
	}
	return ts.Format("02 Jan 2006")
}

func lineOnYangonDay(createdAt, start, end string) bool {
	ts, ok := ledgerUTC(createdAt)
	if !ok {
		return false
	}
	stamp := ts.Format("2006-01-02 15:04:05")
	return stamp >= start && stamp < end
}

type statementSection struct {
	heading string
	lines   []ipdLedgerLine
}

// groupStatementDays returns one section per Yangon day, oldest first, when
// lines fall on more than one day. A single day (or none) stays one table.
// Unparseable timestamps stay in that single table, or in a final Undated
// section when the sheet already has day headings.
func groupStatementDays(lines []ipdLedgerLine) (sections []statementSection, multi bool) {
	var undated []ipdLedgerLine
	buckets := map[string][]ipdLedgerLine{}
	var order []string
	for _, line := range lines {
		key, ok := yangonDateKey(line.CreatedAt)
		if !ok {
			undated = append(undated, line)
			continue
		}
		if _, seen := buckets[key]; !seen {
			order = append(order, key)
		}
		buckets[key] = append(buckets[key], line)
	}
	if len(order) <= 1 {
		return nil, false
	}
	sort.Strings(order)
	sections = make([]statementSection, 0, len(order)+1)
	for _, key := range order {
		sections = append(sections, statementSection{
			heading: formatCivilDate(key),
			lines:   buckets[key],
		})
	}
	if len(undated) > 0 {
		sections = append(sections, statementSection{heading: "Undated", lines: undated})
	}
	return sections, true
}

func writeStatementTable(b *strings.Builder, db *sql.DB, lines []ipdLedgerLine, dayTotal bool, empty string) {
	b.WriteString(`<table class="a4-items"><thead><tr>`)
	b.WriteString(`<th class="col-no">No.</th><th>Kind</th><th>Detail</th><th class="a4-time">Time</th><th class="col-amt">MMK</th>`)
	b.WriteString(`</tr></thead><tbody>`)
	if len(lines) == 0 {
		b.WriteString(`<tr><td colspan="5">`)
		b.WriteString(html.EscapeString(empty))
		b.WriteString(`</td></tr>`)
	}
	var sum int64
	for i, line := range lines {
		sum += line.AmountMMK
		b.WriteString(`<tr><td class="col-no">`)
		b.WriteString(fmt.Sprintf("%d", i+1))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(statementKind(line)))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(statementDetail(db, line)))
		b.WriteString(`</td><td class="a4-time">`)
		b.WriteString(html.EscapeString(formatLedgerTime(line.CreatedAt)))
		b.WriteString(`</td><td class="col-amt">`)
		b.WriteString(formatMMK(line.AmountMMK))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</tbody>`)
	if dayTotal {
		b.WriteString(`<tfoot><tr><td colspan="4">Day total</td><td class="col-amt">`)
		b.WriteString(formatMMK(sum))
		b.WriteString(`</td></tr></tfoot>`)
	}
	b.WriteString(`</table>`)
}

func writeStatementSettle(b *strings.Builder, rows [][2]string) {
	b.WriteString(`<table class="a4-settle"><tbody>`)
	last := len(rows) - 1
	for i, row := range rows {
		class := ""
		if i == last {
			class = ` class="emph"`
		}
		b.WriteString(`<tr`)
		b.WriteString(class)
		b.WriteString(`><td>`)
		b.WriteString(html.EscapeString(row[0]))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(row[1]))
		b.WriteString(` MMK</td></tr>`)
	}
	b.WriteString(`</tbody></table>`)
}

// statementBalanceLabel returns the Myanmar closing-balance label and the
// absolute kyat amount. Remaining deposit (and zero) is ပိုငွေ; amount owed is လိုငွေ.
func statementBalanceLabel(balance int64) (string, int64) {
	if balance < 0 {
		return "လိုငွေ", -balance
	}
	return "ပိုငွေ", balance
}

// renderIpdStatement prints the final stay sheet. dailyDate (YYYY-MM-DD) limits
// the body to that Asia/Yangon civil day and swaps the footer for a day total
// plus the balance through the end of that day.
func renderIpdStatement(db *sql.DB, hosp *hospitalSettings, row ipdAdmission, dailyDate string) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	dailyDate = strings.TrimSpace(dailyDate)
	daily := dailyDate != ""
	lines := row.Ledger
	var through int64
	if daily {
		start, end, _ := yangonDayUTCRange(dailyDate)
		filtered := make([]ipdLedgerLine, 0)
		for _, line := range row.Ledger {
			if lineOnYangonDay(line.CreatedAt, start, end) {
				filtered = append(filtered, line)
			}
			if ts, ok := ledgerUTC(line.CreatedAt); ok && ts.Format("2006-01-02 15:04:05") < end {
				through += line.AmountMMK
			}
		}
		lines = filtered
	}

	title := "IPD FINAL STATEMENT"
	headerDate := formatLedgerDate(row.AdmittedAt)
	if daily {
		title = "IPD DAILY STATEMENT"
		headerDate = formatCivilDate(dailyDate)
	}

	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>`)
	b.WriteString(html.EscapeString(title + " " + row.AdmissionNo))
	b.WriteString(`</title><style>`)
	b.WriteString(ipdStatementCSS())
	b.WriteString(`</style></head><body><div class="a4-sheet">`)
	writeA4Letterhead(&b, hosp)
	b.WriteString(`<p class="a4-title">`)
	b.WriteString(html.EscapeString(title))
	b.WriteString(`</p><div class="a4-meta"><div class="a4-meta-col">`)
	b.WriteString(`<p class="a4-meta-heading">Patient</p>`)
	writeA4KV(&b, "Name", strings.TrimSpace(row.Patient.Name))
	if row.Patient.AgeYears != nil {
		writeA4KV(&b, "Age", fmt.Sprintf("%d", *row.Patient.AgeYears))
	}
	writeA4KV(&b, "Sex", strings.TrimSpace(row.Patient.Gender))
	writeA4KV(&b, "Phone", strings.TrimSpace(row.Patient.Phone))
	b.WriteString(`</div><div class="a4-meta-col">`)
	b.WriteString(`<p class="a4-meta-heading">Stay</p>`)
	writeA4KV(&b, "Admission No", row.AdmissionNo)
	writeA4KV(&b, "Room no.", strings.TrimSpace(row.RoomNo))
	writeA4KV(&b, "Date", headerDate)
	writeA4KV(&b, "Status", strings.ToUpper(strings.TrimSpace(row.Status)))
	if row.DischargedAt != nil && strings.TrimSpace(*row.DischargedAt) != "" {
		writeA4KV(&b, "Discharged", formatLedgerDateTime(*row.DischargedAt))
	}
	b.WriteString(`</div></div>`)

	if daily {
		empty := "No lines on this date."
		writeStatementTable(&b, db, lines, false, empty)
		var daySum int64
		for _, line := range lines {
			daySum += line.AmountMMK
		}
		balLabel, balAmt := statementBalanceLabel(through)
		writeStatementSettle(&b, [][2]string{
			{"Day total", formatMMK(daySum)},
			{balLabel, formatMMK(balAmt)},
		})
	} else {
		sections, multi := groupStatementDays(lines)
		if !multi {
			writeStatementTable(&b, db, lines, false, "No ledger lines.")
		} else {
			for _, sec := range sections {
				b.WriteString(`<p class="a4-day">`)
				b.WriteString(html.EscapeString(sec.heading))
				b.WriteString(`</p>`)
				writeStatementTable(&b, db, sec.lines, true, "No ledger lines.")
			}
		}
		balance := int64(0)
		if row.BalanceMMK != nil {
			balance = *row.BalanceMMK
		}
		balLabel, balAmt := statementBalanceLabel(balance)
		writeStatementSettle(&b, [][2]string{{balLabel, formatMMK(balAmt)}})
	}
	b.WriteString(`</div></body></html>`)
	return b.String()
}

func renderIpdCashHTML(hosp *hospitalSettings, rep *ipdCashReport) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>IPD cash `)
	b.WriteString(html.EscapeString(rep.Date))
	b.WriteString(`</title><style>`)
	b.WriteString(reportPrintCSS())
	b.WriteString(`</style></head><body><h1>`)
	b.WriteString(html.EscapeString(hosp.HospitalName))
	b.WriteString(`</h1><h2>IPD daily cash — `)
	b.WriteString(html.EscapeString(rep.Date))
	b.WriteString(`</h2><p class="summary">Deposits `)
	b.WriteString(formatMMK(rep.DepositMMK))
	b.WriteString(` · Collections `)
	b.WriteString(formatMMK(rep.CollectionMMK))
	b.WriteString(` · Refunds `)
	b.WriteString(formatMMK(rep.RefundMMK))
	b.WriteString(` · <strong>Net `)
	b.WriteString(formatMMK(rep.NetMMK))
	b.WriteString(` MMK</strong></p>`)
	b.WriteString(`<table><thead><tr><th>Kind</th><th>Admission</th><th>Patient</th><th>When</th><th class="num">MMK</th></tr></thead><tbody>`)
	for _, line := range rep.Lines {
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(line.Kind))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.AdmissionNo))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Patient))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.CreatedAt))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(formatMMK(line.AmountMMK))
		b.WriteString(`</td></tr>`)
	}
	if len(rep.Lines) == 0 {
		b.WriteString(`<tr><td colspan="5">No IPD cash on this date.</td></tr>`)
	}
	b.WriteString(`</tbody></table><p class="meta">Deposits, collections, and refunds only. Ward lines and desk charges are not cash.</p></body></html>`)
	return b.String()
}
