package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// Services handles non-stock hospital services (Admin / settings).
type Services struct {
	DB *sql.DB
}

type service struct {
	ID        int64  `json:"id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	PriceMMK  int64  `json:"price_mmk"`
	Active    bool   `json:"active"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type serviceWriteRequest struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	PriceMMK *int64 `json:"price_mmk,omitempty"`
	Active   *bool  `json:"active,omitempty"`
}

func (h *Services) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(h.DB, auth.PermSettings, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/services")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}

		switch {
		case path == "/" && r.Method == http.MethodGet:
			h.list(w, r)
		case path == "/" && r.Method == http.MethodPost:
			h.create(w, r)
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
			rows, err = h.DB.Query(`
				SELECT id, code, name, price_mmk, active, created_at, updated_at
				FROM services
				WHERE code LIKE ? OR name LIKE ?
				ORDER BY name COLLATE NOCASE
			`, like, like)
		} else {
			rows, err = h.DB.Query(`
				SELECT id, code, name, price_mmk, active, created_at, updated_at
				FROM services
				WHERE active = 1 AND (code LIKE ? OR name LIKE ?)
				ORDER BY name COLLATE NOCASE
			`, like, like)
		}
	} else if includeInactive {
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk, active, created_at, updated_at
			FROM services ORDER BY name COLLATE NOCASE
		`)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk, active, created_at, updated_at
			FROM services WHERE active = 1 ORDER BY name COLLATE NOCASE
		`)
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

func (h *Services) create(w http.ResponseWriter, r *http.Request) {
	var req serviceWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))
	req.Name = strings.TrimSpace(req.Name)
	if req.Code == "" || req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code and name required"})
		return
	}
	price := int64(0)
	if req.PriceMMK != nil {
		if *req.PriceMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "price_mmk must be >= 0"})
			return
		}
		price = *req.PriceMMK
	}

	res, err := h.DB.Exec(`
		INSERT INTO services (code, name, price_mmk, active) VALUES (?, ?, ?, 1)
	`, req.Code, req.Name, price)
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
		"code": req.Code, "name": req.Name, "price_mmk": price,
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
	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))
	req.Name = strings.TrimSpace(req.Name)
	if req.Code == "" || req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code and name required"})
		return
	}

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

	_, err = h.DB.Exec(`
		UPDATE services SET code = ?, name = ?, price_mmk = ?, active = ?, updated_at = datetime('now')
		WHERE id = ?
	`, req.Code, req.Name, price, activeInt, id)
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
		"code": req.Code, "name": req.Name, "price_mmk": price, "active": active,
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

func loadService(db *sql.DB, id int64) (service, error) {
	row := db.QueryRow(`
		SELECT id, code, name, price_mmk, active, created_at, updated_at
		FROM services WHERE id = ?
	`, id)
	return scanService(row)
}

func scanService(s scanner) (service, error) {
	var svc service
	var active int
	err := s.Scan(&svc.ID, &svc.Code, &svc.Name, &svc.PriceMMK, &active, &svc.CreatedAt, &svc.UpdatedAt)
	if err != nil {
		return svc, err
	}
	svc.Active = active == 1
	return svc, nil
}
