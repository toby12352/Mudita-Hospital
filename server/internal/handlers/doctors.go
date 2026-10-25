package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// Doctors handles doctor + fee master data (Admin settings or OPD desk).
type Doctors struct {
	DB *sql.DB
}

type doctorFees struct {
	ConsultationMMK int64 `json:"consultation_mmk"`
	OTMMK           int64 `json:"ot_mmk"`
}

type doctor struct {
	ID        int64      `json:"id"`
	Name      string     `json:"name"`
	Specialty string     `json:"specialty"`
	Active    bool       `json:"active"`
	Fees      doctorFees `json:"fees"`
	CreatedAt string     `json:"created_at,omitempty"`
	UpdatedAt string     `json:"updated_at,omitempty"`
}

type doctorWriteRequest struct {
	Name            string `json:"name"`
	Specialty       string `json:"specialty"`
	Active          *bool  `json:"active,omitempty"`
	ConsultationMMK *int64 `json:"consultation_mmk,omitempty"`
	OTMMK           *int64 `json:"ot_mmk,omitempty"`
}

func (h *Doctors) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequireAnyPermission(h.DB, []string{auth.PermSettings, auth.PermOPD}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/doctors")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}

		switch {
		case path == "/" && r.Method == http.MethodGet:
			h.list(w, r)
		case path == "/" && r.Method == http.MethodPost:
			h.create(w, r)
		case path == "/history" && r.Method == http.MethodGet:
			h.history(w, r)
		case strings.HasPrefix(path, "/") && strings.HasSuffix(path, "/delete") && r.Method == http.MethodPost:
			h.delete(w, r, path)
		case strings.HasPrefix(path, "/") && r.Method == http.MethodGet:
			h.get(w, r, path)
		case strings.HasPrefix(path, "/") && r.Method == http.MethodPut:
			h.update(w, r, path)
		case strings.HasPrefix(path, "/") && r.Method == http.MethodDelete:
			h.deactivate(w, r, path)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		}
	})).ServeHTTP(w, r)
}

func (h *Doctors) list(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	includeInactive := r.URL.Query().Get("all") == "1"

	var rows *sql.Rows
	var err error
	if q != "" {
		like := "%" + q + "%"
		if includeInactive {
			rows, err = h.DB.Query(`
				SELECT d.id, d.name, d.specialty, d.active, d.created_at, d.updated_at,
					COALESCE(c.amount_mmk, 0), COALESCE(o.amount_mmk, 0)
				FROM doctors d
				LEFT JOIN doctor_fees c ON c.doctor_id = d.id AND c.fee_type = 'consultation'
				LEFT JOIN doctor_fees o ON o.doctor_id = d.id AND o.fee_type = 'ot'
				WHERE d.name LIKE ? OR d.specialty LIKE ?
				ORDER BY d.name COLLATE NOCASE
			`, like, like)
		} else {
			rows, err = h.DB.Query(`
				SELECT d.id, d.name, d.specialty, d.active, d.created_at, d.updated_at,
					COALESCE(c.amount_mmk, 0), COALESCE(o.amount_mmk, 0)
				FROM doctors d
				LEFT JOIN doctor_fees c ON c.doctor_id = d.id AND c.fee_type = 'consultation'
				LEFT JOIN doctor_fees o ON o.doctor_id = d.id AND o.fee_type = 'ot'
				WHERE d.active = 1 AND (d.name LIKE ? OR d.specialty LIKE ?)
				ORDER BY d.name COLLATE NOCASE
			`, like, like)
		}
	} else if includeInactive {
		rows, err = h.DB.Query(`
			SELECT d.id, d.name, d.specialty, d.active, d.created_at, d.updated_at,
				COALESCE(c.amount_mmk, 0), COALESCE(o.amount_mmk, 0)
			FROM doctors d
			LEFT JOIN doctor_fees c ON c.doctor_id = d.id AND c.fee_type = 'consultation'
			LEFT JOIN doctor_fees o ON o.doctor_id = d.id AND o.fee_type = 'ot'
			ORDER BY d.name COLLATE NOCASE
		`)
	} else {
		rows, err = h.DB.Query(`
			SELECT d.id, d.name, d.specialty, d.active, d.created_at, d.updated_at,
				COALESCE(c.amount_mmk, 0), COALESCE(o.amount_mmk, 0)
			FROM doctors d
			LEFT JOIN doctor_fees c ON c.doctor_id = d.id AND c.fee_type = 'consultation'
			LEFT JOIN doctor_fees o ON o.doctor_id = d.id AND o.fee_type = 'ot'
			WHERE d.active = 1
			ORDER BY d.name COLLATE NOCASE
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]doctor, 0)
	for rows.Next() {
		d, err := scanDoctor(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, d)
	}
	writeJSON(w, http.StatusOK, map[string]any{"doctors": list})
}

func (h *Doctors) get(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	d, err := loadDoctor(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	writeJSON(w, http.StatusOK, d)
}

type doctorHistoryRow struct {
	ID            int64   `json:"id"`
	ActorUsername string  `json:"actor_username,omitempty"`
	Action        string  `json:"action"`
	EntityID      *int64  `json:"entity_id,omitempty"`
	Name          string  `json:"name"`
	Detail        *string `json:"detail,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

func (h *Doctors) history(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := strings.TrimSpace(r.URL.Query().Get("limit")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 500 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "limit must be 1–500"})
			return
		}
		limit = n
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	var args []any
	sqlStr := `
		SELECT a.id, COALESCE(u.username, ''), a.action, a.entity_id,
			COALESCE(d.name, json_extract(a.detail, '$.name'), ''),
			a.detail, a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_user_id
		LEFT JOIN doctors d ON d.id = a.entity_id
		WHERE a.entity = 'doctor'
	`
	if q != "" {
		like := "%" + q + "%"
		sqlStr += ` AND (
			COALESCE(u.username, '') LIKE ? OR a.action LIKE ?
			OR COALESCE(d.name, json_extract(a.detail, '$.name'), '') LIKE ?
			OR COALESCE(a.detail, '') LIKE ?
		)`
		args = append(args, like, like, like, like)
	}
	sqlStr += " ORDER BY a.id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := h.DB.Query(sqlStr, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history list failed"})
		return
	}
	defer rows.Close()

	out := make([]doctorHistoryRow, 0)
	for rows.Next() {
		var row doctorHistoryRow
		var entityID sql.NullInt64
		var detail sql.NullString
		if err := rows.Scan(
			&row.ID, &row.ActorUsername, &row.Action, &entityID, &row.Name,
			&detail, &row.CreatedAt,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		if entityID.Valid {
			id := entityID.Int64
			row.EntityID = &id
		}
		if detail.Valid {
			s := detail.String
			row.Detail = &s
		}
		out = append(out, row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"history": out})
}

func (h *Doctors) create(w http.ResponseWriter, r *http.Request) {
	var req doctorWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Specialty = strings.TrimSpace(req.Specialty)
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}
	consult := int64(0)
	ot := int64(0)
	if req.ConsultationMMK != nil {
		if *req.ConsultationMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "consultation_mmk must be >= 0"})
			return
		}
		consult = *req.ConsultationMMK
	}
	if req.OTMMK != nil {
		if *req.OTMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "ot_mmk must be >= 0"})
			return
		}
		ot = *req.OTMMK
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		INSERT INTO doctors (name, specialty, active) VALUES (?, ?, 1)
	`, req.Name, req.Specialty)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	id, _ := res.LastInsertId()
	if err := upsertFeesTx(tx, id, consult, ot); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "fees failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "create", "doctor", &id, map[string]any{
		"name": req.Name, "consultation_mmk": consult, "ot_mmk": ot,
	})

	d, err := loadDoctor(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

func (h *Doctors) update(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req doctorWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Specialty = strings.TrimSpace(req.Specialty)
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}

	existing, err := loadDoctor(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	active := existing.Active
	if req.Active != nil {
		active = *req.Active
	}
	activeInt := 0
	if active {
		activeInt = 1
	}

	consult := existing.Fees.ConsultationMMK
	ot := existing.Fees.OTMMK
	if req.ConsultationMMK != nil {
		if *req.ConsultationMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "consultation_mmk must be >= 0"})
			return
		}
		consult = *req.ConsultationMMK
	}
	if req.OTMMK != nil {
		if *req.OTMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "ot_mmk must be >= 0"})
			return
		}
		ot = *req.OTMMK
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		UPDATE doctors SET name = ?, specialty = ?, active = ?, updated_at = datetime('now')
		WHERE id = ?
	`, req.Name, req.Specialty, activeInt, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	if err := upsertFeesTx(tx, id, consult, ot); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "fees failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "doctor", &id, map[string]any{
		"name": req.Name, "consultation_mmk": consult, "ot_mmk": ot, "active": active,
	})

	d, err := loadDoctor(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (h *Doctors) deactivate(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	res, err := h.DB.Exec(`
		UPDATE doctors SET active = 0, updated_at = datetime('now') WHERE id = ? AND active = 1
	`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "deactivate failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "deactivate", "doctor", &id, nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Doctors) delete(w http.ResponseWriter, r *http.Request, path string) {
	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/"), "/delete")
	id, ok := parseID("/" + idPart)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var name, specialty string
	err := h.DB.QueryRow(`SELECT name, specialty FROM doctors WHERE id = ?`, id).Scan(&name, &specialty)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	res, err := h.DB.Exec(`DELETE FROM doctors WHERE id = ?`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "delete", "doctor", &id, map[string]any{
		"name": name, "specialty": specialty,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func upsertFeesTx(tx *sql.Tx, doctorID, consult, ot int64) error {
	_, err := tx.Exec(`
		INSERT INTO doctor_fees (doctor_id, fee_type, amount_mmk, updated_at)
		VALUES (?, 'consultation', ?, datetime('now'))
		ON CONFLICT(doctor_id, fee_type) DO UPDATE SET
			amount_mmk = excluded.amount_mmk,
			updated_at = datetime('now')
	`, doctorID, consult)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`
		INSERT INTO doctor_fees (doctor_id, fee_type, amount_mmk, updated_at)
		VALUES (?, 'ot', ?, datetime('now'))
		ON CONFLICT(doctor_id, fee_type) DO UPDATE SET
			amount_mmk = excluded.amount_mmk,
			updated_at = datetime('now')
	`, doctorID, ot)
	return err
}

func loadDoctor(db *sql.DB, id int64) (doctor, error) {
	row := db.QueryRow(`
		SELECT d.id, d.name, d.specialty, d.active, d.created_at, d.updated_at,
			COALESCE(c.amount_mmk, 0), COALESCE(o.amount_mmk, 0)
		FROM doctors d
		LEFT JOIN doctor_fees c ON c.doctor_id = d.id AND c.fee_type = 'consultation'
		LEFT JOIN doctor_fees o ON o.doctor_id = d.id AND o.fee_type = 'ot'
		WHERE d.id = ?
	`, id)
	return scanDoctor(row)
}

type scanner interface {
	Scan(dest ...any) error
}

func scanDoctor(s scanner) (doctor, error) {
	var d doctor
	var active int
	err := s.Scan(
		&d.ID, &d.Name, &d.Specialty, &active, &d.CreatedAt, &d.UpdatedAt,
		&d.Fees.ConsultationMMK, &d.Fees.OTMMK,
	)
	if err != nil {
		return d, err
	}
	d.Active = active == 1
	return d, nil
}

func parseID(path string) (int64, bool) {
	raw := strings.TrimPrefix(path, "/")
	if raw == "" || strings.Contains(raw, "/") {
		return 0, false
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id < 1 {
		return 0, false
	}
	return id, true
}
