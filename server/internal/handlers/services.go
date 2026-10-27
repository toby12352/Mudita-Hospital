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

// Services handles non-stock hospital services (Admin settings or OPD desk).
type Services struct {
	DB *sql.DB
}

type service struct {
	ID           int64  `json:"id"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	PriceMMK     int64  `json:"price_mmk"`
	Active       bool   `json:"active"`
	CategoryID   *int64 `json:"category_id"`
	CategoryName string `json:"category_name"`
	CreatedAt    string `json:"created_at,omitempty"`
	UpdatedAt    string `json:"updated_at,omitempty"`
}

type serviceWriteRequest struct {
	Code       string          `json:"code"`
	Name       string          `json:"name"`
	PriceMMK   *int64          `json:"price_mmk,omitempty"`
	Active     *bool           `json:"active,omitempty"`
	CategoryID json.RawMessage `json:"category_id"`
}

const serviceSelect = `
	SELECT s.id, COALESCE(s.code, ''), s.name, s.price_mmk, s.active,
		s.category_id, COALESCE(c.name, ''),
		s.created_at, s.updated_at
	FROM services s
	LEFT JOIN service_categories c ON c.id = s.category_id
`

func (h *Services) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequireAnyPermission(h.DB, []string{auth.PermSettings, auth.PermOPD}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/services")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}
		if !allowCell(h.DB, w, r, masterGrant(r.Method, path)) {
			return
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

func (h *Services) list(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	includeInactive := r.URL.Query().Get("all") == "1"

	var rows *sql.Rows
	var err error
	if q != "" {
		like := "%" + q + "%"
		if includeInactive {
			rows, err = h.DB.Query(serviceSelect+`
				WHERE s.code LIKE ? OR s.name LIKE ?
				ORDER BY s.name COLLATE NOCASE
			`, like, like)
		} else {
			rows, err = h.DB.Query(serviceSelect+`
				WHERE s.active = 1 AND (s.code LIKE ? OR s.name LIKE ?)
				ORDER BY s.name COLLATE NOCASE
			`, like, like)
		}
	} else if includeInactive {
		rows, err = h.DB.Query(serviceSelect + ` ORDER BY s.name COLLATE NOCASE`)
	} else {
		rows, err = h.DB.Query(serviceSelect + ` WHERE s.active = 1 ORDER BY s.name COLLATE NOCASE`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]service, 0)
	for rows.Next() {
		svc, err := scanService(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, svc)
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": list})
}

func (h *Services) get(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	svc, err := loadService(h.DB, id)
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

type serviceHistoryRow struct {
	ID            int64   `json:"id"`
	ActorUsername string  `json:"actor_username,omitempty"`
	Action        string  `json:"action"`
	EntityID      *int64  `json:"entity_id,omitempty"`
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	Detail        *string `json:"detail,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

func (h *Services) history(w http.ResponseWriter, r *http.Request) {
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
		LEFT JOIN services s ON s.id = a.entity_id
		WHERE a.entity = 'service'
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

	out := make([]serviceHistoryRow, 0)
	for rows.Next() {
		var row serviceHistoryRow
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

func (h *Services) create(w http.ResponseWriter, r *http.Request) {
	var req serviceWriteRequest
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
	price := int64(0)
	if req.PriceMMK != nil {
		if *req.PriceMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "price_mmk must be >= 0"})
			return
		}
		price = *req.PriceMMK
	}
	_, categoryID, errMsg := parseServiceCategoryID(req.CategoryID)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	if errMsg, status := h.requireServiceCategory(categoryID); errMsg != "" {
		writeJSON(w, status, map[string]string{"error": errMsg})
		return
	}

	res, err := h.DB.Exec(`
		INSERT INTO services (code, name, price_mmk, active, category_id) VALUES (?, ?, ?, 1, ?)
	`, code, req.Name, price, categoryID)
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
	audit.WriteAudit(h.DB, &uid, "create", "service", &id, map[string]any{
		"code": code, "name": req.Name, "price_mmk": price, "category_id": categoryID,
	})

	svc, err := loadService(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, svc)
}

func (h *Services) update(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req serviceWriteRequest
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

	existing, err := loadService(h.DB, id)
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
	}
	active := existing.Active
	if req.Active != nil {
		active = *req.Active
	}
	activeInt := 0
	if active {
		activeInt = 1
	}
	categorySet, categoryID, errMsg := parseServiceCategoryID(req.CategoryID)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	if !categorySet {
		categoryID = existing.CategoryID
	} else if errMsg, status := h.requireServiceCategory(categoryID); errMsg != "" {
		writeJSON(w, status, map[string]string{"error": errMsg})
		return
	}

	_, err = h.DB.Exec(`
		UPDATE services SET code = ?, name = ?, price_mmk = ?, active = ?, category_id = ?, updated_at = datetime('now')
		WHERE id = ?
	`, code, req.Name, price, activeInt, categoryID, id)
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
	audit.WriteAudit(h.DB, &uid, "update", "service", &id, map[string]any{
		"code": code, "name": req.Name, "price_mmk": price, "active": active, "category_id": categoryID,
	})

	svc, err := loadService(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, svc)
}

func (h *Services) deactivate(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	res, err := h.DB.Exec(`
		UPDATE services SET active = 0, updated_at = datetime('now') WHERE id = ? AND active = 1
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
	audit.WriteAudit(h.DB, &uid, "deactivate", "service", &id, nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Services) delete(w http.ResponseWriter, r *http.Request, path string) {
	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/"), "/delete")
	id, ok := parseID("/" + idPart)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var code, name string
	var priceMMK int64
	err := h.DB.QueryRow(`SELECT COALESCE(code, ''), name, price_mmk FROM services WHERE id = ?`, id).Scan(&code, &name, &priceMMK)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	res, err := h.DB.Exec(`DELETE FROM services WHERE id = ?`, id)
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
	audit.WriteAudit(h.DB, &uid, "delete", "service", &id, map[string]any{
		"code": code, "name": name, "price_mmk": priceMMK,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func loadService(db *sql.DB, id int64) (service, error) {
	row := db.QueryRow(serviceSelect+` WHERE s.id = ?`, id)
	return scanService(row)
}

func scanService(s scanner) (service, error) {
	var svc service
	var active int
	var categoryID sql.NullInt64
	err := s.Scan(
		&svc.ID, &svc.Code, &svc.Name, &svc.PriceMMK, &active,
		&categoryID, &svc.CategoryName, &svc.CreatedAt, &svc.UpdatedAt,
	)
	if err != nil {
		return svc, err
	}
	svc.Active = active == 1
	if categoryID.Valid {
		id := categoryID.Int64
		svc.CategoryID = &id
	}
	return svc, nil
}

// parseServiceCategoryID distinguishes a missing field from JSON null.
// set is false when the client omitted category_id. id is nil when it sent null.
func parseServiceCategoryID(raw json.RawMessage) (set bool, id *int64, errMsg string) {
	if len(raw) == 0 {
		return false, nil, ""
	}
	if string(raw) == "null" {
		return true, nil, ""
	}
	var n int64
	if err := json.Unmarshal(raw, &n); err != nil || n <= 0 {
		return true, nil, "invalid category_id"
	}
	return true, &n, ""
}

func (h *Services) requireServiceCategory(id *int64) (string, int) {
	if id == nil {
		return "", 0
	}
	var n int
	if err := h.DB.QueryRow(`SELECT COUNT(1) FROM service_categories WHERE id = ?`, *id).Scan(&n); err != nil {
		return "load failed", http.StatusInternalServerError
	}
	if n == 0 {
		return "unknown category", http.StatusBadRequest
	}
	return "", 0
}

func normalizeServiceCode(raw string) any {
	code := strings.ToUpper(strings.TrimSpace(raw))
	if code == "" {
		return nil
	}
	return code
}
