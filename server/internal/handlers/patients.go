package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

const patientSearchLimit = 50

// Patients handles chart demographics and one manual bill attach.
// Attach sets a null patient_id only. It does not merge charts or change totals.
type Patients struct {
	DB *sql.DB
}

type patientChart struct {
	ID               int64  `json:"id"`
	Name             string `json:"name"`
	Phone            string `json:"phone"`
	AgeYears         *int64 `json:"age_years"`
	Gender           string `json:"gender"`
	DateOfBirth      string `json:"date_of_birth"`
	NRC              string `json:"nrc"`
	FatherMotherName string `json:"father_mother_name"`
	Notes            string `json:"notes"`
	UpdatedAt        string `json:"updated_at"`
	OpenAdmissionID  *int64 `json:"open_admission_id,omitempty"`
}

// Optional chart fields use *string so an older client that omits the key
// does not wipe stored values on update. A sent empty string clears them.
type patientWriteRequest struct {
	Name             string  `json:"name"`
	Phone            string  `json:"phone"`
	AgeYears         *int64  `json:"age_years"`
	Gender           string  `json:"gender"`
	DateOfBirth      *string `json:"date_of_birth"`
	NRC              *string `json:"nrc"`
	FatherMotherName *string `json:"father_mother_name"`
	Notes            string  `json:"notes"`
}

func (h *Patients) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/patients")
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		path = "/"
	}

	switch {
	case path == "/" && r.Method == http.MethodGet:
		h.serveRead(w, r, h.list)
	case path == "/" && r.Method == http.MethodPost:
		h.servePatients(w, r, auth.GrantPatientsCreate, h.create)
	case strings.HasSuffix(path, "/history") && r.Method == http.MethodGet:
		p := path
		h.servePatients(w, r, auth.GrantPatientsRead, func(w http.ResponseWriter, r *http.Request) { h.history(w, r, p) })
	case strings.Contains(path, "/bills/") && strings.HasSuffix(path, "/print") && r.Method == http.MethodGet:
		p := path
		h.servePatients(w, r, auth.GrantPatientsRead, func(w http.ResponseWriter, r *http.Request) { h.printHistoryBill(w, r, p) })
	case strings.HasSuffix(path, "/attach") && r.Method == http.MethodPost:
		p := path
		h.servePatients(w, r, auth.GrantPatientsUpdate, func(w http.ResponseWriter, r *http.Request) { h.attach(w, r, p) })
	case strings.HasPrefix(path, "/") && r.Method == http.MethodGet:
		p := path
		h.serveRead(w, r, func(w http.ResponseWriter, r *http.Request) { h.get(w, r, p) })
	case strings.HasPrefix(path, "/") && r.Method == http.MethodPut:
		p := path
		h.servePatients(w, r, auth.GrantPatientsUpdate, func(w http.ResponseWriter, r *http.Request) { h.update(w, r, p) })
	case strings.HasPrefix(path, "/") && r.Method == http.MethodDelete:
		p := path
		h.serveAdminDelete(w, r, func(w http.ResponseWriter, r *http.Request) { h.delete(w, r, p) })
	default:
		h.servePatients(w, r, auth.GrantPatientsRead, func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		})
	}
}

func (h *Patients) serveRead(w http.ResponseWriter, r *http.Request, next http.HandlerFunc) {
	middleware.RequireAuth(h.DB, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := middleware.UserFromContext(r.Context())
		if user == nil {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		ok, err := auth.ChartReadAllowed(h.DB, user.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "permission check failed"})
			return
		}
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		next(w, r)
	})).ServeHTTP(w, r)
}

// servePatients is chart create, edit, history, and attach.
// Portal still requires the Patients desk. Unified requires the grant.
func (h *Patients) servePatients(w http.ResponseWriter, r *http.Request, grant string, next http.HandlerFunc) {
	middleware.RequireAuth(h.DB, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := middleware.UserFromContext(r.Context())
		if user == nil {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		ok, err := auth.PatientsCell(h.DB, user.ID, grant)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "permission check failed"})
			return
		}
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		next(w, r)
	})).ServeHTTP(w, r)
}

// Hard delete stays Admin-only. patients.delete does not open it.
func (h *Patients) serveAdminDelete(w http.ResponseWriter, r *http.Request, next http.HandlerFunc) {
	middleware.RequirePermission(h.DB, auth.PermSettings, next).ServeHTTP(w, r)
}

func (h *Patients) list(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	rows, err := queryPatients(h.DB, q)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]patientChart, 0)
	for rows.Next() {
		p, err := scanPatient(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, p)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"patients": list})
}

func queryPatients(db *sql.DB, q string) (*sql.Rows, error) {
	const cols = `SELECT p.id, p.name, p.phone, p.age_years, p.gender, p.date_of_birth, p.nrc, p.father_mother_name, p.notes, p.updated_at,
		(SELECT a.id FROM ipd_admissions a WHERE a.patient_id = p.id AND a.status = 'open' LIMIT 1)
		FROM patients p`
	if q == "" {
		return db.Query(cols+` ORDER BY name COLLATE NOCASE, id LIMIT ?`, patientSearchLimit)
	}
	like := "%" + q + "%"
	if id, err := strconv.ParseInt(q, 10, 64); err == nil && id > 0 {
		return db.Query(cols+`
			WHERE id = ? OR name LIKE ? COLLATE NOCASE OR phone LIKE ? OR nrc LIKE ? COLLATE NOCASE
			ORDER BY name COLLATE NOCASE, id
			LIMIT ?
		`, id, like, like, like, patientSearchLimit)
	}
	return db.Query(cols+`
		WHERE name LIKE ? COLLATE NOCASE OR phone LIKE ? OR nrc LIKE ? COLLATE NOCASE
		ORDER BY name COLLATE NOCASE, id
		LIMIT ?
	`, like, like, like, patientSearchLimit)
}

func (h *Patients) get(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	p, err := loadPatient(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *Patients) create(w http.ResponseWriter, r *http.Request) {
	req, ok := decodePatientWrite(w, r)
	if !ok {
		return
	}
	dob, nrc, father := optionalChartStrings(req)
	res, err := h.DB.Exec(`
		INSERT INTO patients (name, phone, age_years, gender, date_of_birth, nrc, father_mother_name, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, req.Name, req.Phone, req.AgeYears, req.Gender, dob, nrc, father, req.Notes)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	id, _ := res.LastInsertId()

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "create", "patient", &id, map[string]any{
		"name": req.Name, "phone": req.Phone,
	})

	p, err := loadPatient(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (h *Patients) update(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	req, ok := decodePatientWrite(w, r)
	if !ok {
		return
	}
	dobArg := optionalStringArg(req.DateOfBirth)
	nrcArg := optionalStringArg(req.NRC)
	fatherArg := optionalStringArg(req.FatherMotherName)
	res, err := h.DB.Exec(`
		UPDATE patients
		SET name = ?, phone = ?, age_years = ?, gender = ?,
			date_of_birth = COALESCE(?, date_of_birth),
			nrc = COALESCE(?, nrc),
			father_mother_name = COALESCE(?, father_mother_name),
			notes = ?, updated_at = datetime('now')
		WHERE id = ?
	`, req.Name, req.Phone, req.AgeYears, req.Gender, dobArg, nrcArg, fatherArg, req.Notes, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "patient", &id, map[string]any{
		"name": req.Name, "phone": req.Phone,
	})

	p, err := loadPatient(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *Patients) delete(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
		return
	}
	defer func() { _ = tx.Rollback() }()

	var name, phone string
	err = tx.QueryRow(`SELECT name, phone FROM patients WHERE id = ?`, id).Scan(&name, &phone)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	if blocked, reason := patientHasRecordedService(tx, id); blocked {
		writeJSON(w, http.StatusConflict, map[string]string{"error": reason})
		return
	}

	res, err := tx.Exec(`DELETE FROM patients WHERE id = ?`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "delete", "patient", &id, map[string]any{
		"name": name, "phone": phone,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// patientHasRecordedService is true when any voucher or stay is linked to the chart.
// OPD/pharmacy/OT use ON DELETE SET NULL, so the app must refuse before DELETE.
func patientHasRecordedService(tx *sql.Tx, patientID int64) (bool, string) {
	checks := []struct {
		query  string
		reason string
	}{
		{`SELECT 1 FROM opd_bills WHERE patient_id = ? LIMIT 1`, "patient has recorded vouchers"},
		{`SELECT 1 FROM pharmacy_bills WHERE patient_id = ? AND bill_no NOT LIKE 'TO-%' LIMIT 1`, "patient has recorded vouchers"},
		{`SELECT 1 FROM ot_cases WHERE patient_id = ? LIMIT 1`, "patient has recorded vouchers"},
		{`SELECT 1 FROM ipd_admissions WHERE patient_id = ? LIMIT 1`, "patient has recorded vouchers"},
	}
	for _, c := range checks {
		var one int
		err := tx.QueryRow(c.query, patientID).Scan(&one)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return true, "delete failed"
		}
		return true, c.reason
	}
	return false, ""
}

func decodePatientWrite(w http.ResponseWriter, r *http.Request) (patientWriteRequest, bool) {
	var req patientWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return req, false
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Phone = strings.TrimSpace(req.Phone)
	req.Gender = strings.TrimSpace(req.Gender)
	req.Notes = strings.TrimSpace(req.Notes)
	if req.DateOfBirth != nil {
		trimmed := strings.TrimSpace(*req.DateOfBirth)
		if trimmed == "" {
			empty := ""
			req.DateOfBirth = &empty
		} else if _, err := time.Parse("2006-01-02", trimmed); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "date_of_birth invalid"})
			return req, false
		} else {
			req.DateOfBirth = &trimmed
		}
	}
	if req.NRC != nil {
		trimmed := strings.TrimSpace(*req.NRC)
		req.NRC = &trimmed
	}
	if req.FatherMotherName != nil {
		trimmed := strings.TrimSpace(*req.FatherMotherName)
		req.FatherMotherName = &trimmed
	}
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return req, false
	}
	if req.AgeYears != nil && *req.AgeYears < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "age_years must be >= 0"})
		return req, false
	}
	return req, true
}

// optionalChartStrings turns omitted create keys into blank stored values.
func optionalChartStrings(req patientWriteRequest) (dob, nrc, father string) {
	if req.DateOfBirth != nil {
		dob = *req.DateOfBirth
	}
	if req.NRC != nil {
		nrc = *req.NRC
	}
	if req.FatherMotherName != nil {
		father = *req.FatherMotherName
	}
	return dob, nrc, father
}

// optionalStringArg is nil when the write key was omitted (keep stored value).
func optionalStringArg(v *string) any {
	if v == nil {
		return nil
	}
	return *v
}

func loadPatient(db *sql.DB, id int64) (patientChart, error) {
	row := db.QueryRow(`
		SELECT p.id, p.name, p.phone, p.age_years, p.gender, p.date_of_birth, p.nrc, p.father_mother_name, p.notes, p.updated_at,
			(SELECT a.id FROM ipd_admissions a WHERE a.patient_id = p.id AND a.status = 'open' LIMIT 1)
		FROM patients p WHERE p.id = ?
	`, id)
	return scanPatient(row)
}

func scanPatient(s scanner) (patientChart, error) {
	var p patientChart
	var age, openAdmission sql.NullInt64
	err := s.Scan(
		&p.ID, &p.Name, &p.Phone, &age, &p.Gender,
		&p.DateOfBirth, &p.NRC, &p.FatherMotherName,
		&p.Notes, &p.UpdatedAt, &openAdmission,
	)
	if err != nil {
		return p, err
	}
	if age.Valid {
		v := age.Int64
		p.AgeYears = &v
	}
	if openAdmission.Valid {
		v := openAdmission.Int64
		p.OpenAdmissionID = &v
	}
	return p, nil
}
