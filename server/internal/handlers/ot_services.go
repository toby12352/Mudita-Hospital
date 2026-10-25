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

type otService struct {
	ID        int64  `json:"id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	PriceMMK  *int64 `json:"price_mmk"`
	Active    bool   `json:"active"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type otServiceWriteRequest struct {
	Code     string          `json:"code"`
	Name     string          `json:"name"`
	PriceMMK json.RawMessage `json:"price_mmk"`
	Active   *bool           `json:"active,omitempty"`
}

type otCatalogService struct {
	ID       int64  `json:"id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	PriceMMK *int64 `json:"price_mmk"`
}

func (h *OT) listOtServices(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	includeInactive := r.URL.Query().Get("all") == "1"

	var rows *sql.Rows
	var err error
	if q != "" {
		like := "%" + q + "%"
		if includeInactive {
			rows, err = h.DB.Query(`
				SELECT id, code, name, price_mmk, active, created_at, updated_at
				FROM ot_services
				WHERE COALESCE(code, '') LIKE ? OR name LIKE ?
				ORDER BY name COLLATE NOCASE
			`, like, like)
		} else {
			rows, err = h.DB.Query(`
				SELECT id, code, name, price_mmk, active, created_at, updated_at
				FROM ot_services
				WHERE active = 1 AND (COALESCE(code, '') LIKE ? OR name LIKE ?)
				ORDER BY name COLLATE NOCASE
			`, like, like)
		}
	} else if includeInactive {
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk, active, created_at, updated_at
			FROM ot_services ORDER BY name COLLATE NOCASE
		`)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk, active, created_at, updated_at
			FROM ot_services WHERE active = 1 ORDER BY name COLLATE NOCASE
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]otService, 0)
	for rows.Next() {
		svc, err := scanOtService(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, svc)
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": list})
}

func (h *OT) getOtService(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/services"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	svc, err := loadOtService(h.DB, id)
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

type otServiceHistoryRow struct {
	ID            int64   `json:"id"`
	ActorUsername string  `json:"actor_username,omitempty"`
	Action        string  `json:"action"`
	EntityID      *int64  `json:"entity_id,omitempty"`
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	Detail        *string `json:"detail,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

func (h *OT) otServiceHistory(w http.ResponseWriter, r *http.Request) {
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
		LEFT JOIN ot_services s ON s.id = a.entity_id
		WHERE a.entity = 'ot_service'
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

	out := make([]otServiceHistoryRow, 0)
	for rows.Next() {
		var row otServiceHistoryRow
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

func (h *OT) createOtService(w http.ResponseWriter, r *http.Request) {
	var req otServiceWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}
	code := normalizeOtServiceCode(req.Code)
	price, errMsg := parseOtServicePrice(req.PriceMMK, nil, true)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	res, err := h.DB.Exec(`
		INSERT INTO ot_services (code, name, price_mmk, active) VALUES (?, ?, ?, 1)
	`, code, name, price)
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
	audit.WriteAudit(h.DB, &uid, "create", "ot_service", &id, otServiceAudit(code, name, price, true))

	svc, err := loadOtService(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, svc)
}

func (h *OT) updateOtService(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/services"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req otServiceWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}

	existing, err := loadOtService(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	code := normalizeOtServiceCode(req.Code)
	price, errMsg := parseOtServicePrice(req.PriceMMK, existing.PriceMMK, false)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
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
		UPDATE ot_services SET code = ?, name = ?, price_mmk = ?, active = ?, updated_at = datetime('now')
		WHERE id = ?
	`, code, name, price, activeInt, id)
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
	audit.WriteAudit(h.DB, &uid, "update", "ot_service", &id, otServiceAudit(code, name, price, active))

	svc, err := loadOtService(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, svc)
}

func (h *OT) deactivateOtService(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/services"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	res, err := h.DB.Exec(`
		UPDATE ot_services SET active = 0, updated_at = datetime('now') WHERE id = ? AND active = 1
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
	audit.WriteAudit(h.DB, &uid, "deactivate", "ot_service", &id, nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *OT) deleteOtService(w http.ResponseWriter, r *http.Request, path string) {
	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/services/"), "/delete")
	id, ok := parseID("/" + idPart)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	existing, err := loadOtService(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	res, err := h.DB.Exec(`DELETE FROM ot_services WHERE id = ?`, id)
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
	audit.WriteAudit(h.DB, &uid, "delete", "ot_service", &id, otServiceAudit(nullableCode(existing.Code), existing.Name, existing.PriceMMK, existing.Active))
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func loadOtService(db *sql.DB, id int64) (otService, error) {
	row := db.QueryRow(`
		SELECT id, code, name, price_mmk, active, created_at, updated_at
		FROM ot_services WHERE id = ?
	`, id)
	return scanOtService(row)
}

func scanOtService(s scanner) (otService, error) {
	var svc otService
	var code sql.NullString
	var price sql.NullInt64
	var active int
	err := s.Scan(&svc.ID, &code, &svc.Name, &price, &active, &svc.CreatedAt, &svc.UpdatedAt)
	if err != nil {
		return svc, err
	}
	if code.Valid {
		svc.Code = code.String
	}
	if price.Valid {
		v := price.Int64
		svc.PriceMMK = &v
	}
	svc.Active = active == 1
	return svc, nil
}

func normalizeOtServiceCode(raw string) any {
	code := strings.ToUpper(strings.TrimSpace(raw))
	if code == "" {
		return nil
	}
	return code
}

func nullableCode(code string) any {
	if strings.TrimSpace(code) == "" {
		return nil
	}
	return code
}

func parseOtServicePrice(raw json.RawMessage, existing *int64, create bool) (*int64, string) {
	if len(raw) == 0 {
		if create {
			return nil, ""
		}
		return existing, ""
	}
	if string(raw) == "null" {
		return nil, ""
	}
	var n int64
	if err := json.Unmarshal(raw, &n); err != nil {
		return nil, "price_mmk must be an integer"
	}
	if n < 0 {
		return nil, "price_mmk must be >= 0"
	}
	return &n, ""
}

func otServiceAudit(code any, name string, price *int64, active bool) map[string]any {
	detail := map[string]any{"name": name, "active": active}
	if s, ok := code.(string); ok && s != "" {
		detail["code"] = s
	} else {
		detail["code"] = ""
	}
	if price != nil {
		detail["price_mmk"] = *price
	} else {
		detail["price_mmk"] = nil
	}
	return detail
}
