package handlers

import (
	"database/sql"
	"encoding/json"
	"html"
	"net/http"
	"strconv"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

// ipdLedgerLine is one signed kyat row. Deposit is positive. Ward is negative.
// Balance is the sum: positive means the hospital owes the patient.
type ipdLedgerLine struct {
	ID          int64  `json:"id"`
	AdmissionID int64  `json:"admission_id"`
	Kind        string `json:"kind"`
	AmountMMK   int64  `json:"amount_mmk"`
	Source      string `json:"source"`
	SourceID    *int64 `json:"source_id"`
	Note        string `json:"note"`
	ActorUserID *int64 `json:"actor_user_id"`
	CreatedAt   string `json:"created_at"`
}

type ipdDepositRequest struct {
	AmountMMK int64  `json:"amount_mmk"`
	Note      string `json:"note"`
}

type ipdWardRequest struct {
	Description string `json:"description"`
	AmountMMK   int64  `json:"amount_mmk"`
}

func (h *IPD) postDeposit(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := admissionActionID(path, "deposits")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req ipdDepositRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if req.AmountMMK <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "amount must be > 0"})
		return
	}
	h.insertLedger(w, r, id, "deposit", req.AmountMMK, strings.TrimSpace(req.Note))
}

func (h *IPD) postWardCharge(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := admissionActionID(path, "ward-charges")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req ipdWardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	description := strings.TrimSpace(req.Description)
	if description == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "description required"})
		return
	}
	if req.AmountMMK <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "amount must be > 0"})
		return
	}
	h.insertLedger(w, r, id, "ward", -req.AmountMMK, description)
}

func (h *IPD) insertLedger(w http.ResponseWriter, r *http.Request, admissionID int64, kind string, amount int64, note string) {
	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "post failed"})
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	var status string
	err = tx.QueryRow(`SELECT status FROM ipd_admissions WHERE id = ?`, admissionID).Scan(&status)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "post failed"})
		return
	}
	if status != "open" {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "stay is not open"})
		return
	}

	var actorID any
	var auditActor *int64
	if user := middleware.UserFromContext(r.Context()); user != nil {
		actorID = user.ID
		id := user.ID
		auditActor = &id
	}

	res, err := tx.Exec(`
		INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, source, note, actor_user_id)
		VALUES (?, ?, ?, '', ?, ?)
	`, admissionID, kind, amount, note, actorID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "post failed"})
		return
	}
	lineID, _ := res.LastInsertId()
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "post failed"})
		return
	}
	committed = true

	audit.WriteAudit(h.DB, auditActor, "create", "ipd_ledger", &lineID, map[string]any{
		"admission_id": admissionID,
		"kind":         kind,
		"amount_mmk":   amount,
	})

	row, err := loadAdmissionDetail(h.DB, admissionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, row)
}

func (h *IPD) printDeposit(w http.ResponseWriter, r *http.Request, path string) {
	admissionID, lineID, ok := ledgerPrintIDs(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	row, err := loadAdmissionDetail(h.DB, admissionID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	var line *ipdLedgerLine
	for i := range row.Ledger {
		if row.Ledger[i].ID == lineID {
			line = &row.Ledger[i]
			break
		}
	}
	if line == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}

	if line.Kind == "deposit" {
		hosp, err := loadHospitalSettings(h.DB)
		if err != nil {
			hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
		}
		balance := int64(0)
		if row.BalanceMMK != nil {
			balance = *row.BalanceMMK
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(renderIpdDepositReceipt(hosp, row, *line, balance)))
		return
	}

	// Desk bills charged (or reversed) onto this stay — same receipt HTML as the desk.
	if line.SourceID == nil || *line.SourceID < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "line cannot be printed"})
		return
	}
	printPath := "/bills/" + strconv.FormatInt(*line.SourceID, 10) + "/print"
	switch line.Source {
	case "opd":
		(&OPD{DB: h.DB}).printBill(w, r, printPath)
	case "pharmacy":
		(&Pharmacy{DB: h.DB}).printPharmacyBill(w, r, printPath)
	case "ot":
		(&OT{DB: h.DB}).printBill(w, r, printPath)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "line cannot be printed"})
	}
}

func loadAdmissionDetail(db *sql.DB, id int64) (ipdAdmission, error) {
	row, err := loadAdmission(db, id)
	if err != nil {
		return row, err
	}
	lines, sum, err := loadLedger(db, id)
	if err != nil {
		return row, err
	}
	row.BalanceMMK = &sum
	if len(lines) > 0 {
		row.Ledger = lines
	}
	return row, nil
}

func loadLedger(db *sql.DB, admissionID int64) ([]ipdLedgerLine, int64, error) {
	rows, err := db.Query(`
		SELECT id, admission_id, kind, amount_mmk, source, source_id, note, actor_user_id, created_at
		FROM ipd_ledger
		WHERE admission_id = ?
		ORDER BY id
	`, admissionID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	lines := make([]ipdLedgerLine, 0)
	var sum int64
	for rows.Next() {
		var line ipdLedgerLine
		var sourceID, actorID sql.NullInt64
		if err := rows.Scan(
			&line.ID, &line.AdmissionID, &line.Kind, &line.AmountMMK, &line.Source,
			&sourceID, &line.Note, &actorID, &line.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		if sourceID.Valid {
			v := sourceID.Int64
			line.SourceID = &v
		}
		if actorID.Valid {
			v := actorID.Int64
			line.ActorUserID = &v
		}
		sum += line.AmountMMK
		lines = append(lines, line)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return lines, sum, nil
}

func admissionActionID(path, action string) (int64, bool) {
	const prefix = "/admissions/"
	if !strings.HasPrefix(path, prefix) {
		return 0, false
	}
	rest := strings.TrimPrefix(path, prefix)
	idPart, suffix, ok := strings.Cut(rest, "/")
	if !ok || suffix != action {
		return 0, false
	}
	id, err := strconv.ParseInt(idPart, 10, 64)
	if err != nil || id < 1 {
		return 0, false
	}
	return id, true
}

func ledgerPrintIDs(path string) (int64, int64, bool) {
	const prefix = "/admissions/"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, "/print") {
		return 0, 0, false
	}
	rest := strings.TrimSuffix(strings.TrimPrefix(path, prefix), "/print")
	parts := strings.Split(rest, "/")
	if len(parts) != 3 || parts[1] != "ledger" {
		return 0, 0, false
	}
	admissionID, err1 := strconv.ParseInt(parts[0], 10, 64)
	lineID, err2 := strconv.ParseInt(parts[2], 10, 64)
	if err1 != nil || err2 != nil || admissionID < 1 || lineID < 1 {
		return 0, 0, false
	}
	return admissionID, lineID, true
}

func renderIpdDepositReceipt(hosp *hospitalSettings, row ipdAdmission, line ipdLedgerLine, balance int64) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>`)
	b.WriteString(html.EscapeString(row.AdmissionNo))
	b.WriteString(`</title><style>`)
	b.WriteString(thermalReceiptCSS())
	b.WriteString(`</style></head><body>`)
	if src := receiptLogoDataURI(hosp); src != "" {
		b.WriteString(`<img class="logo" src="`)
		b.WriteString(src)
		b.WriteString(`" alt=""/>`)
	}
	b.WriteString(`<p class="hospital center">`)
	b.WriteString(html.EscapeString(hosp.HospitalName))
	b.WriteString(`</p>`)
	if hosp.Address != "" {
		b.WriteString(`<p class="addr center">`)
		b.WriteString(html.EscapeString(hosp.Address))
		b.WriteString(`</p>`)
	}
	if phones := hospitalPhones(hosp); phones != "" {
		b.WriteString(`<p class="tel center">Tel: `)
		b.WriteString(html.EscapeString(phones))
		b.WriteString(`</p>`)
	}
	b.WriteString(`<p class="center bold" style="margin:6px 0 0">IPD DEPOSIT</p>`)
	b.WriteString(`<hr class="sep"/>`)
	writeReceiptKV(&b, "Admission", row.AdmissionNo)
	writeReceiptKV(&b, "Date", line.CreatedAt)
	b.WriteString(`<p class="section-title">Patient</p>`)
	writeReceiptKV(&b, "Name", row.Patient.Name)
	if row.Patient.AgeYears != nil {
		writeReceiptKV(&b, "Age", strconv.FormatInt(*row.Patient.AgeYears, 10))
	}
	if phone := strings.TrimSpace(row.Patient.Phone); phone != "" {
		writeReceiptKV(&b, "Phone", phone)
	}
	if gender := strings.TrimSpace(row.Patient.Gender); gender != "" {
		writeReceiptKV(&b, "Sex", gender)
	}
	if note := strings.TrimSpace(line.Note); note != "" {
		b.WriteString(`<p class="section-title">Note</p>`)
		b.WriteString(`<p class="note-body">`)
		b.WriteString(html.EscapeString(note))
		b.WriteString(`</p>`)
	}
	b.WriteString(`<hr class="sep"/>`)
	writeReceiptMoney(&b, "DEPOSIT", line.AmountMMK, true)
	writeReceiptMoney(&b, "BALANCE", balance, true)
	b.WriteString(`<hr class="sep"/>`)
	b.WriteString(`<p class="footer">Thank you</p>`)
	b.WriteString(`</body></html>`)
	return b.String()
}
