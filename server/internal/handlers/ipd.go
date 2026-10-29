package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// IPD admits a chart, posts deposits and ward charges, and discharges an open stay
// from the ledger balance. Desk bill charging lives on the desk handlers. Stock is not touched here.
type IPD struct {
	DB *sql.DB
}

type ipdPatient struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Phone    string `json:"phone"`
	AgeYears *int64 `json:"age_years"`
	Gender   string `json:"gender"`
}

type ipdAdmission struct {
	ID              int64           `json:"id"`
	AdmissionNo     string          `json:"admission_no"`
	PatientID       int64           `json:"patient_id"`
	Status          string          `json:"status"`
	Notes           string          `json:"notes"`
	RoomNo          string          `json:"room_no"`
	AdmittedAt      string          `json:"admitted_at"`
	DischargedAt    *string         `json:"discharged_at"`
	CreatedByUserID *int64          `json:"created_by_user_id"`
	CreatedAt       string          `json:"created_at"`
	UpdatedAt       string          `json:"updated_at"`
	Patient         ipdPatient      `json:"patient"`
	BalanceMMK      *int64          `json:"balance_mmk,omitempty"`
	Ledger          []ipdLedgerLine `json:"ledger,omitempty"`
}

type ipdAdmitRequest struct {
	PatientID int64  `json:"patient_id"`
	Notes     string `json:"notes"`
	BilledAt  string `json:"billed_at,omitempty"`
}

type ipdNotesRequest struct {
	Notes  string  `json:"notes"`
	RoomNo *string `json:"room_no"`
}

func (h *IPD) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(h.DB, auth.PermIPD, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/ipd")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}
		if !allowCell(h.DB, w, r, ipdGrant(r.Method, path)) {
			return
		}

		switch {
		case path == "/admissions" && r.Method == http.MethodGet:
			h.list(w, r)
		case path == "/admissions" && r.Method == http.MethodPost:
			h.admit(w, r)
		case path == "/daily-cash" && r.Method == http.MethodGet:
			h.dailyCash(w, r, false)
		case path == "/daily-cash/print" && r.Method == http.MethodGet:
			h.dailyCash(w, r, true)
		case r.Method == http.MethodPost && strings.HasSuffix(path, "/discharge"):
			h.discharge(w, r, path)
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/statement"):
			h.printStatement(w, r, path)
		case r.Method == http.MethodPost && strings.HasSuffix(path, "/deposits"):
			h.postDeposit(w, r, path)
		case r.Method == http.MethodPost && strings.HasSuffix(path, "/ward-charges"):
			h.postWardCharge(w, r, path)
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/print"):
			h.printDeposit(w, r, path)
		case strings.HasPrefix(path, "/admissions/") && r.Method == http.MethodGet:
			h.get(w, r, path)
		case strings.HasPrefix(path, "/admissions/") && r.Method == http.MethodPut:
			h.updateNotes(w, r, path)
		default:
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		}
	})).ServeHTTP(w, r)
}

func (h *IPD) list(w http.ResponseWriter, r *http.Request) {
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && status != "open" && status != "settled" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid status"})
		return
	}
	rows, err := h.DB.Query(`
		SELECT `+ipdAdmissionCols+`
		FROM ipd_admissions a
		JOIN patients p ON p.id = a.patient_id
		WHERE (? = '' OR a.status = ?)
		ORDER BY a.admitted_at DESC, a.id DESC
	`, status, status)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]ipdAdmission, 0)
	for rows.Next() {
		row, err := scanAdmission(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, row)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"admissions": list})
}

func (h *IPD) get(w http.ResponseWriter, _ *http.Request, path string) {
	id, ok := admissionPathID(path)
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
	writeJSON(w, http.StatusOK, row)
}

func (h *IPD) admit(w http.ResponseWriter, r *http.Request) {
	var req ipdAdmitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	notes := strings.TrimSpace(req.Notes)
	if req.PatientID < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "patient_id required"})
		return
	}

	role := ""
	if user := middleware.UserFromContext(r.Context()); user != nil {
		role = user.Role
	}
	override, status, errMsg := parseAdminBilledAt(role, req.BilledAt)
	if errMsg != "" {
		writeJSON(w, status, map[string]string{"error": errMsg})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "admit failed"})
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	var patientN int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM patients WHERE id = ?`, req.PatientID).Scan(&patientN); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "admit failed"})
		return
	}
	if patientN == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "patient not found"})
		return
	}

	var openN int
	if err := tx.QueryRow(`
		SELECT COUNT(1) FROM ipd_admissions WHERE patient_id = ? AND status = 'open'
	`, req.PatientID).Scan(&openN); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "admit failed"})
		return
	}
	if openN > 0 {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "patient already has an open stay"})
		return
	}

	var n int64
	if err := tx.QueryRow(`SELECT next_num FROM ipd_admission_number_seq WHERE id = 1`).Scan(&n); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "admit failed"})
		return
	}
	if _, err := tx.Exec(`UPDATE ipd_admission_number_seq SET next_num = next_num + 1 WHERE id = 1`); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "admit failed"})
		return
	}
	admissionNo := fmt.Sprintf("IPD-%06d", n)

	var actorID any
	var auditActor *int64
	if user := middleware.UserFromContext(r.Context()); user != nil {
		actorID = user.ID
		id := user.ID
		auditActor = &id
	}

	var res sql.Result
	if override != nil {
		res, err = tx.Exec(`
			INSERT INTO ipd_admissions (
				admission_no, patient_id, status, notes, admitted_at, created_by_user_id
			) VALUES (?, ?, 'open', ?, ?, ?)
		`, admissionNo, req.PatientID, notes, override.UTC, actorID)
	} else {
		res, err = tx.Exec(`
			INSERT INTO ipd_admissions (
				admission_no, patient_id, status, notes, admitted_at, created_by_user_id
			) VALUES (?, ?, 'open', ?, datetime('now'), ?)
		`, admissionNo, req.PatientID, notes, actorID)
	}
	if err != nil {
		if isUniqueErr(err) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "patient already has an open stay"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "admit failed"})
		return
	}
	id, _ := res.LastInsertId()
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "admit failed"})
		return
	}
	committed = true

	auditPayload := map[string]any{
		"admission_no": admissionNo,
		"patient_id":   req.PatientID,
	}
	if override != nil {
		auditPayload["billed_at"] = override.Yangon
		auditPayload["admitted_at"] = override.UTC
	}
	audit.WriteAudit(h.DB, auditActor, "create", "ipd_admission", &id, auditPayload)

	row, err := loadAdmissionDetail(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, row)
}

func (h *IPD) updateNotes(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := admissionPathID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req ipdNotesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	notes := strings.TrimSpace(req.Notes)
	var room *string
	if req.RoomNo != nil {
		trimmed := strings.TrimSpace(*req.RoomNo)
		if utf8.RuneCountInString(trimmed) > 32 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "room number too long"})
			return
		}
		room = &trimmed
	}

	var (
		res sql.Result
		err error
	)
	if room != nil {
		res, err = h.DB.Exec(`
			UPDATE ipd_admissions
			SET notes = ?, room_no = ?, updated_at = datetime('now')
			WHERE id = ? AND status = 'open'
		`, notes, *room, id)
	} else {
		res, err = h.DB.Exec(`
			UPDATE ipd_admissions
			SET notes = ?, updated_at = datetime('now')
			WHERE id = ? AND status = 'open'
		`, notes, id)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		var status string
		err := h.DB.QueryRow(`SELECT status FROM ipd_admissions WHERE id = ?`, id).Scan(&status)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
			return
		}
		writeJSON(w, http.StatusConflict, map[string]string{"error": "stay is not open"})
		return
	}

	if user := middleware.UserFromContext(r.Context()); user != nil {
		uid := user.ID
		detail := map[string]any{"notes": notes}
		if room != nil {
			detail["room_no"] = *room
		}
		audit.WriteAudit(h.DB, &uid, "update", "ipd_admission", &id, detail)
	}

	row, err := loadAdmissionDetail(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, row)
}

const ipdAdmissionCols = `
	a.id, a.admission_no, a.patient_id, a.status, a.notes, a.room_no, a.admitted_at,
	a.discharged_at, a.created_by_user_id, a.created_at, a.updated_at,
	p.id, p.name, p.phone, p.age_years, p.gender`

func loadAdmission(db *sql.DB, id int64) (ipdAdmission, error) {
	row := db.QueryRow(`
		SELECT `+ipdAdmissionCols+`
		FROM ipd_admissions a
		JOIN patients p ON p.id = a.patient_id
		WHERE a.id = ?
	`, id)
	return scanAdmission(row)
}

func scanAdmission(s scanner) (ipdAdmission, error) {
	var row ipdAdmission
	var discharged sql.NullString
	var createdBy sql.NullInt64
	var age sql.NullInt64
	err := s.Scan(
		&row.ID, &row.AdmissionNo, &row.PatientID, &row.Status, &row.Notes, &row.RoomNo, &row.AdmittedAt,
		&discharged, &createdBy, &row.CreatedAt, &row.UpdatedAt,
		&row.Patient.ID, &row.Patient.Name, &row.Patient.Phone, &age, &row.Patient.Gender,
	)
	if err != nil {
		return row, err
	}
	if discharged.Valid {
		v := discharged.String
		row.DischargedAt = &v
	}
	if createdBy.Valid {
		v := createdBy.Int64
		row.CreatedByUserID = &v
	}
	if age.Valid {
		v := age.Int64
		row.Patient.AgeYears = &v
	}
	return row, nil
}

func admissionPathID(path string) (int64, bool) {
	rest := strings.TrimPrefix(path, "/admissions")
	if rest == path || strings.Contains(strings.TrimPrefix(rest, "/"), "/") {
		return 0, false
	}
	return parseID(rest)
}

func isUniqueErr(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "unique")
}
