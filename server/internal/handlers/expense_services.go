package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

type expenseService struct {
	ID        int64  `json:"id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	PriceMMK  *int64 `json:"price_mmk"`
	Active    bool   `json:"active"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type expenseServiceWriteRequest struct {
	Code     string          `json:"code"`
	Name     string          `json:"name"`
	PriceMMK json.RawMessage `json:"price_mmk"`
	Active   *bool           `json:"active,omitempty"`
}

type expenseCatalogService struct {
	ID       int64  `json:"id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	PriceMMK *int64 `json:"price_mmk"`
}

func (h *Expenses) listExpenseServices(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	includeInactive := r.URL.Query().Get("all") == "1"

	var rows *sql.Rows
	var err error
	if q != "" {
		like := "%" + q + "%"
		if includeInactive {
			rows, err = h.DB.Query(`
				SELECT id, code, name, price_mmk, active, created_at, updated_at
				FROM expense_services
				WHERE COALESCE(code, '') LIKE ? OR name LIKE ?
				ORDER BY name COLLATE NOCASE
			`, like, like)
		} else {
			rows, err = h.DB.Query(`
				SELECT id, code, name, price_mmk, active, created_at, updated_at
				FROM expense_services
				WHERE active = 1 AND (COALESCE(code, '') LIKE ? OR name LIKE ?)
				ORDER BY name COLLATE NOCASE
			`, like, like)
		}
	} else if includeInactive {
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk, active, created_at, updated_at
			FROM expense_services ORDER BY name COLLATE NOCASE
		`)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk, active, created_at, updated_at
			FROM expense_services WHERE active = 1 ORDER BY name COLLATE NOCASE
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]expenseService, 0)
	for rows.Next() {
		svc, err := scanExpenseService(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, svc)
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": list})
}

func (h *Expenses) getExpenseService(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/services"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	svc, err := loadExpenseService(h.DB, id)
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

func (h *Expenses) createExpenseService(w http.ResponseWriter, r *http.Request) {
	var req expenseServiceWriteRequest
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
		INSERT INTO expense_services (code, name, price_mmk, active) VALUES (?, ?, ?, 1)
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
	audit.WriteAudit(h.DB, &uid, "create", "expense_service", &id, expenseServiceAudit(code, name, price, true))

	svc, err := loadExpenseService(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, svc)
}

func (h *Expenses) updateExpenseService(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/services"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req expenseServiceWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}

	existing, err := loadExpenseService(h.DB, id)
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
		UPDATE expense_services SET code = ?, name = ?, price_mmk = ?, active = ?, updated_at = datetime('now')
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
	audit.WriteAudit(h.DB, &uid, "update", "expense_service", &id, expenseServiceAudit(code, name, price, active))

	svc, err := loadExpenseService(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, svc)
}

func (h *Expenses) deactivateExpenseService(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/services"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	res, err := h.DB.Exec(`
		UPDATE expense_services SET active = 0, updated_at = datetime('now') WHERE id = ? AND active = 1
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
	audit.WriteAudit(h.DB, &uid, "deactivate", "expense_service", &id, nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Expenses) deleteExpenseService(w http.ResponseWriter, r *http.Request, path string) {
	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/services/"), "/delete")
	id, ok := parseID("/" + idPart)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	existing, err := loadExpenseService(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	res, err := h.DB.Exec(`DELETE FROM expense_services WHERE id = ?`, id)
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
	audit.WriteAudit(h.DB, &uid, "delete", "expense_service", &id, expenseServiceAudit(nullableCode(existing.Code), existing.Name, existing.PriceMMK, existing.Active))
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Expenses) catalogExpenseServices(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	var rows *sql.Rows
	var err error
	if code != "" {
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk FROM expense_services
			WHERE active = 1 AND code = ? COLLATE NOCASE
		`, code)
	} else if q != "" {
		like := "%" + q + "%"
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk FROM expense_services
			WHERE active = 1 AND (COALESCE(code, '') LIKE ? OR name LIKE ?)
			ORDER BY name COLLATE NOCASE LIMIT 50
		`, like, like)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, code, name, price_mmk FROM expense_services
			WHERE active = 1
			ORDER BY name COLLATE NOCASE LIMIT 100
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	out := make([]expenseCatalogService, 0)
	for rows.Next() {
		var s expenseCatalogService
		var codeVal sql.NullString
		var price sql.NullInt64
		if err := rows.Scan(&s.ID, &codeVal, &s.Name, &price); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		if codeVal.Valid {
			s.Code = codeVal.String
		}
		if price.Valid {
			v := price.Int64
			s.PriceMMK = &v
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": out})
}

func loadExpenseService(db *sql.DB, id int64) (expenseService, error) {
	row := db.QueryRow(`
		SELECT id, code, name, price_mmk, active, created_at, updated_at
		FROM expense_services WHERE id = ?
	`, id)
	return scanExpenseService(row)
}

func scanExpenseService(s scanner) (expenseService, error) {
	var svc expenseService
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

func expenseServiceAudit(code any, name string, price *int64, active bool) map[string]any {
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
