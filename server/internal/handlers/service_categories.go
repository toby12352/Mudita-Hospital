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

// ServiceCategories is the admin-managed label list for OPD services.
type ServiceCategories struct {
	DB *sql.DB
}

type serviceCategory struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type serviceCategoryWrite struct {
	Name string `json:"name"`
}

func (h *ServiceCategories) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequireAnyPermission(h.DB, []string{auth.PermSettings, auth.PermOPD}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/service-categories")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}

		if r.Method != http.MethodGet {
			user := middleware.UserFromContext(r.Context())
			if user == nil || !auth.HasPermission(user.Role, auth.PermSettings) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
				return
			}
		} else if !allowCell(h.DB, w, r, auth.GrantOPDRead) {
			return
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
			h.delete(w, r, path)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		}
	})).ServeHTTP(w, r)
}

func (h *ServiceCategories) list(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	var rows *sql.Rows
	var err error
	if q != "" {
		rows, err = h.DB.Query(`
			SELECT id, name, created_at, updated_at
			FROM service_categories
			WHERE name LIKE ?
			ORDER BY name COLLATE NOCASE
		`, "%"+q+"%")
	} else {
		rows, err = h.DB.Query(`
			SELECT id, name, created_at, updated_at
			FROM service_categories
			ORDER BY name COLLATE NOCASE
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]serviceCategory, 0)
	for rows.Next() {
		c, err := scanServiceCategory(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"categories": list})
}

func (h *ServiceCategories) get(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	c, err := loadServiceCategory(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (h *ServiceCategories) create(w http.ResponseWriter, r *http.Request) {
	var req serviceCategoryWrite
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "category name required"})
		return
	}
	res, err := h.DB.Exec(`INSERT INTO service_categories (name) VALUES (?)`, name)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "category name already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	id, _ := res.LastInsertId()
	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "create", "service_category", &id, map[string]any{"name": name})

	c, err := loadServiceCategory(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (h *ServiceCategories) update(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req serviceCategoryWrite
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "category name required"})
		return
	}
	if _, err := loadServiceCategory(h.DB, id); err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	_, err := h.DB.Exec(`
		UPDATE service_categories SET name = ?, updated_at = datetime('now') WHERE id = ?
	`, name, id)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "category name already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "service_category", &id, map[string]any{"name": name})

	c, err := loadServiceCategory(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (h *ServiceCategories) delete(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	existing, err := loadServiceCategory(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	var used int
	if err := h.DB.QueryRow(`SELECT COUNT(1) FROM services WHERE category_id = ?`, id).Scan(&used); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if used > 0 {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "category still in use"})
		return
	}
	res, err := h.DB.Exec(`DELETE FROM service_categories WHERE id = ?`, id)
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
	audit.WriteAudit(h.DB, &uid, "delete", "service_category", &id, map[string]any{"name": existing.Name})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func loadServiceCategory(db *sql.DB, id int64) (serviceCategory, error) {
	row := db.QueryRow(`
		SELECT id, name, created_at, updated_at FROM service_categories WHERE id = ?
	`, id)
	return scanServiceCategory(row)
}

func scanServiceCategory(s scanner) (serviceCategory, error) {
	var c serviceCategory
	err := s.Scan(&c.ID, &c.Name, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}
