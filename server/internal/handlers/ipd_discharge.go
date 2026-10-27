package handlers

import (
	"database/sql"
	"html"
	"net/http"
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

func (h *IPD) printStatement(w http.ResponseWriter, _ *http.Request, path string) {
	id, ok := admissionActionID(path, "statement")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
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
	_, _ = w.Write([]byte(renderIpdStatement(h.DB, hosp, row)))
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
// Ward, charge, and reversal rows are not cash. Desk bills and this IPD net
// are added together only in buildCashMovement.
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
		if line.AmountMMK < 0 {
			return "Desk charge"
		}
		return "Desk credit"
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
	label := desk
	if bill != "" {
		label = desk + " " + bill
	}
	if detail == "" {
		return label
	}
	return label + " · " + detail
}

func renderIpdStatement(db *sql.DB, hosp *hospitalSettings, row ipdAdmission) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	balance := int64(0)
	if row.BalanceMMK != nil {
		balance = *row.BalanceMMK
	}
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>`)
	b.WriteString(html.EscapeString(row.AdmissionNo))
	b.WriteString(`</title><style>`)
	b.WriteString(reportPrintCSS())
	b.WriteString(`</style></head><body><h1>`)
	b.WriteString(html.EscapeString(hosp.HospitalName))
	b.WriteString(`</h1><h2>IPD statement — `)
	b.WriteString(html.EscapeString(row.AdmissionNo))
	b.WriteString(`</h2><p class="summary">`)
	b.WriteString(html.EscapeString(row.Patient.Name))
	b.WriteString(` · Admitted `)
	b.WriteString(html.EscapeString(row.AdmittedAt))
	if row.DischargedAt != nil && *row.DischargedAt != "" {
		b.WriteString(` · Discharged `)
		b.WriteString(html.EscapeString(*row.DischargedAt))
	}
	b.WriteString(` · `)
	b.WriteString(html.EscapeString(row.Status))
	b.WriteString(`</p>`)
	b.WriteString(`<table><thead><tr><th>Kind</th><th>Detail</th><th>When</th><th class="num">MMK</th></tr></thead><tbody>`)
	for _, line := range row.Ledger {
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(statementKind(line)))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(statementDetail(db, line)))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.CreatedAt))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(formatMMK(line.AmountMMK))
		b.WriteString(`</td></tr>`)
	}
	if len(row.Ledger) == 0 {
		b.WriteString(`<tr><td colspan="4">No ledger lines.</td></tr>`)
	}
	b.WriteString(`</tbody></table><p class="summary"><strong>Balance: `)
	b.WriteString(formatMMK(balance))
	b.WriteString(` MMK</strong></p><p class="meta">Printed from Mudita Hospital</p></body></html>`)
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
