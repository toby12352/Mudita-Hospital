package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

type labService struct {
	ID        int64  `json:"id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	PriceMMK  int64  `json:"price_mmk"`
	Active    bool   `json:"active"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type labServiceWriteRequest struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	PriceMMK *int64 `json:"price_mmk,omitempty"`
	Active   *bool  `json:"active,omitempty"`
}

type labServiceHistoryRow struct {
	ID            int64   `json:"id"`
	ActorUsername string  `json:"actor_username,omitempty"`
	Action        string  `json:"action"`
	EntityID      *int64  `json:"entity_id,omitempty"`
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	Detail        *string `json:"detail,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

const labServiceSelect = `
	SELECT id, COALESCE(code, ''), name, price_mmk, active, created_at, updated_at
	FROM lab_services
`

func (h *Lab) listServices(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	includeInactive := r.URL.Query().Get("all") == "1"

	var rows *sql.Rows
	var err error
	if q != "" {
		like := "%" + q + "%"
		if includeInactive {
			rows, err = h.DB.Query(labServiceSelect+`
				WHERE COALESCE(code, '') LIKE ? OR name LIKE ?
				ORDER BY name COLLATE NOCASE
			`, like, like)
		} else {
			rows, err = h.DB.Query(labServiceSelect+`
				WHERE active = 1 AND (COALESCE(code, '') LIKE ? OR name LIKE ?)
				ORDER BY name COLLATE NOCASE
			`, like, like)
		}
	} else if includeInactive {
		rows, err = h.DB.Query(labServiceSelect + ` ORDER BY name COLLATE NOCASE`)
	} else {
		rows, err = h.DB.Query(labServiceSelect + ` WHERE active = 1 ORDER BY name COLLATE NOCASE`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]labService, 0)
	for rows.Next() {
		svc, err := scanLabService(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, svc)
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": list})
}

func (h *Lab) getService(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/services"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	svc, err := loadLabService(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	writeJSON(w, http.StatusOK, svc)
}

func (h *Lab) serviceHistory(w http.ResponseWriter, r *http.Request) {
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
			COALESCE(s.code, json_extract(a.detail, '$.code'), ''),
			COALESCE(s.name, json_extract(a.detail, '$.name'), ''),
			a.detail, a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_user_id
		LEFT JOIN lab_services s ON s.id = a.entity_id
		WHERE a.entity = 'lab_service'
	`
	if q != "" {
		like := "%" + q + "%"
		sqlStr += ` AND (
			COALESCE(u.username, '') LIKE ? OR a.action LIKE ?
			OR COALESCE(s.code, json_extract(a.detail, '$.code'), '') LIKE ?
			OR COALESCE(s.name, json_extract(a.detail, '$.name'), '') LIKE ?
			OR COALESCE(a.detail, '') LIKE ?
		)`
		args = append(args, like, like, like, like, like)
	}
	sqlStr += " ORDER BY a.id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := h.DB.Query(sqlStr, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history list failed"})
		return
	}
	defer rows.Close()

	out := make([]labServiceHistoryRow, 0)
	for rows.Next() {
		var row labServiceHistoryRow
		var entityID sql.NullInt64
		var detail sql.NullString
		if err := rows.Scan(
			&row.ID, &row.ActorUsername, &row.Action, &entityID,
			&row.Code, &row.Name, &detail, &row.CreatedAt,
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

func (h *Lab) createService(w http.ResponseWriter, r *http.Request) {
	var req labServiceWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}
	if req.PriceMMK == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "price_mmk required"})
		return
	}
	if *req.PriceMMK < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "price_mmk must be >= 0"})
		return
	}
	code := normalizeServiceCode(req.Code)
	price := *req.PriceMMK

	res, err := h.DB.Exec(`
		INSERT INTO lab_services (code, name, price_mmk, active) VALUES (?, ?, ?, 1)
	`, code, req.Name, price)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "code already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	id, _ := res.LastInsertId()

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "create", "lab_service", &id, map[string]any{
		"code": code, "name": req.Name, "price_mmk": price,
	})

	svc, err := loadLabService(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, svc)
}

func (h *Lab) updateService(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/services"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req labServiceWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}
	code := normalizeServiceCode(req.Code)

	existing, err := loadLabService(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	price := existing.PriceMMK
	if req.PriceMMK != nil {
		if *req.PriceMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "price_mmk must be >= 0"})
			return
		}
		price = *req.PriceMMK
	} else {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "price_mmk required"})
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

	_, err = h.DB.Exec(`
		UPDATE lab_services SET code = ?, name = ?, price_mmk = ?, active = ?, updated_at = datetime('now')
		WHERE id = ?
	`, code, req.Name, price, activeInt, id)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "code already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "lab_service", &id, map[string]any{
		"code": code, "name": req.Name, "price_mmk": price, "active": active,
	})

	svc, err := loadLabService(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, svc)
}

func (h *Lab) deactivateService(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/services"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	res, err := h.DB.Exec(`
		UPDATE lab_services SET active = 0, updated_at = datetime('now') WHERE id = ? AND active = 1
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
	audit.WriteAudit(h.DB, &uid, "deactivate", "lab_service", &id, nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Lab) deleteService(w http.ResponseWriter, r *http.Request, path string) {
	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/services/"), "/delete")
	id, ok := parseID("/" + idPart)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var code, name string
	var priceMMK int64
	err := h.DB.QueryRow(`SELECT COALESCE(code, ''), name, price_mmk FROM lab_services WHERE id = ?`, id).Scan(&code, &name, &priceMMK)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	res, err := h.DB.Exec(`DELETE FROM lab_services WHERE id = ?`, id)
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
	audit.WriteAudit(h.DB, &uid, "delete", "lab_service", &id, map[string]any{
		"code": code, "name": name, "price_mmk": priceMMK,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Lab) catalogServices(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	var rows *sql.Rows
	var err error
	if code != "" {
		rows, err = h.DB.Query(`
			SELECT id, COALESCE(code, ''), name, price_mmk FROM lab_services
			WHERE active = 1 AND code = ? COLLATE NOCASE
		`, code)
	} else if q != "" {
		like := "%" + q + "%"
		rows, err = h.DB.Query(`
			SELECT id, COALESCE(code, ''), name, price_mmk FROM lab_services
			WHERE active = 1 AND (COALESCE(code, '') LIKE ? OR name LIKE ?)
			ORDER BY name COLLATE NOCASE LIMIT 50
		`, like, like)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, COALESCE(code, ''), name, price_mmk FROM lab_services
			WHERE active = 1
			ORDER BY name COLLATE NOCASE LIMIT 100
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	out := make([]catalogService, 0)
	for rows.Next() {
		var s catalogService
		if err := rows.Scan(&s.ID, &s.Code, &s.Name, &s.PriceMMK); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": out})
}

func (h *Lab) catalogDoctors(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	var rows *sql.Rows
	var err error
	if q != "" {
		like := "%" + q + "%"
		rows, err = h.DB.Query(`
			SELECT d.id, d.name, d.specialty, COALESCE(c.amount_mmk, 0)
			FROM doctors d
			LEFT JOIN doctor_fees c ON c.doctor_id = d.id AND c.fee_type = 'consultation'
			WHERE d.active = 1 AND (d.name LIKE ? OR d.specialty LIKE ?)
			ORDER BY d.name COLLATE NOCASE
		`, like, like)
	} else {
		rows, err = h.DB.Query(`
			SELECT d.id, d.name, d.specialty, COALESCE(c.amount_mmk, 0)
			FROM doctors d
			LEFT JOIN doctor_fees c ON c.doctor_id = d.id AND c.fee_type = 'consultation'
			WHERE d.active = 1
			ORDER BY d.name COLLATE NOCASE
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	out := make([]catalogDoctor, 0)
	for rows.Next() {
		var d catalogDoctor
		if err := rows.Scan(&d.ID, &d.Name, &d.Specialty, &d.ConsultationMMK); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, d)
	}
	writeJSON(w, http.StatusOK, map[string]any{"doctors": out})
}

func loadLabService(db *sql.DB, id int64) (labService, error) {
	row := db.QueryRow(labServiceSelect+` WHERE id = ?`, id)
	return scanLabService(row)
}

func scanLabService(s scanner) (labService, error) {
	var svc labService
	var active int
	err := s.Scan(&svc.ID, &svc.Code, &svc.Name, &svc.PriceMMK, &active, &svc.CreatedAt, &svc.UpdatedAt)
	if err != nil {
		return svc, err
	}
	svc.Active = active == 1
	return svc, nil
}
