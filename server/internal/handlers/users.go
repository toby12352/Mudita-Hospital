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

// Users handles Admin user management (Reception / Pharmacy accounts).
type Users struct {
	DB *sql.DB
}

type userListItem struct {
	ID                 int64  `json:"id"`
	Username           string `json:"username"`
	DisplayName        string `json:"display_name"`
	Role               string `json:"role"`
	MustChangePassword bool   `json:"must_change_password"`
	Active             bool   `json:"active"`
	CreatedAt          string `json:"created_at,omitempty"`
}

type userCreateRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	Password    string `json:"password"`
}

type userUpdateRequest struct {
	DisplayName *string `json:"display_name,omitempty"`
	Role        *string `json:"role,omitempty"`
	Active      *bool   `json:"active,omitempty"`
	Password    *string `json:"password,omitempty"`
}

func (h *Users) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(h.DB, auth.PermManageUsers, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/users")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}

		switch {
		case path == "/" && r.Method == http.MethodGet:
			h.list(w, r)
		case path == "/" && r.Method == http.MethodPost:
			h.create(w, r)
		case strings.HasPrefix(path, "/") && r.Method == http.MethodPut:
			h.update(w, r, path)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		}
	})).ServeHTTP(w, r)
}

func (h *Users) list(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	var rows *sql.Rows
	var err error
	if q != "" {
		like := "%" + q + "%"
		rows, err = h.DB.Query(`
			SELECT id, username, display_name, role, must_change_password, active, created_at
			FROM users
			WHERE username LIKE ? OR display_name LIKE ?
			ORDER BY username COLLATE NOCASE
		`, like, like)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, username, display_name, role, must_change_password, active, created_at
			FROM users
			ORDER BY username COLLATE NOCASE
		`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]userListItem, 0)
	for rows.Next() {
		var u userListItem
		var must, active int
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &must, &active, &u.CreatedAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		u.MustChangePassword = must == 1
		u.Active = active == 1
		list = append(list, u)
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": list})
}

func (h *Users) create(w http.ResponseWriter, r *http.Request) {
	var req userCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	req.Role = strings.TrimSpace(req.Role)
	if req.Username == "" || req.DisplayName == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "username, display_name, and password required"})
		return
	}
	if len(req.Password) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 6 characters"})
		return
	}
	// Soft rule: Admin UI creates Reception/Pharmacy only (not another Admin).
	if req.Role != auth.RoleReception && req.Role != auth.RolePharmacy {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "role must be Reception or Pharmacy"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "hash failed"})
		return
	}

	res, err := h.DB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash, must_change_password, active)
		VALUES (?, ?, ?, ?, 1, 1)
	`, req.Username, req.DisplayName, req.Role, hash)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "username already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	id, _ := res.LastInsertId()

	actor := middleware.UserFromContext(r.Context())
	aid := actor.ID
	audit.WriteAudit(h.DB, &aid, "create", "user", &id, map[string]string{
		"username": req.Username, "role": req.Role,
	})

	u, err := loadUserItem(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

func (h *Users) update(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	existing, err := auth.GetUserByID(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	var req userUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	displayName := existing.DisplayName
	if req.DisplayName != nil {
		displayName = strings.TrimSpace(*req.DisplayName)
		if displayName == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "display_name required"})
			return
		}
	}

	role := existing.Role
	if req.Role != nil {
		role = strings.TrimSpace(*req.Role)
		// Keep existing Admins as Admin; do not promote Reception/Pharmacy to Admin here.
		if existing.Role == auth.RoleAdmin {
			if role != auth.RoleAdmin {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot change Admin role"})
				return
			}
		} else if role != auth.RoleReception && role != auth.RolePharmacy {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "role must be Reception or Pharmacy"})
			return
		}
	}

	active := existing.Active
	if req.Active != nil {
		active = *req.Active
		actor := middleware.UserFromContext(r.Context())
		if !active && existing.ID == actor.ID {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot deactivate yourself"})
			return
		}
		if !active && existing.Role == auth.RoleAdmin {
			var otherAdmins int
			_ = h.DB.QueryRow(`
				SELECT COUNT(1) FROM users WHERE role = ? AND active = 1 AND id != ?
			`, auth.RoleAdmin, id).Scan(&otherAdmins)
			if otherAdmins < 1 {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot deactivate the last Admin"})
				return
			}
		}
	}
	activeInt := 0
	if active {
		activeInt = 1
	}

	if req.Password != nil {
		if len(*req.Password) < 6 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 6 characters"})
			return
		}
		hash, err := auth.HashPassword(*req.Password)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "hash failed"})
			return
		}
		_, err = h.DB.Exec(`
			UPDATE users SET display_name = ?, role = ?, active = ?, password_hash = ?,
				must_change_password = 1, updated_at = datetime('now')
			WHERE id = ?
		`, displayName, role, activeInt, hash, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
			return
		}
		_ = auth.DeleteUserSessions(h.DB, id)
	} else {
		_, err = h.DB.Exec(`
			UPDATE users SET display_name = ?, role = ?, active = ?, updated_at = datetime('now')
			WHERE id = ?
		`, displayName, role, activeInt, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
			return
		}
	}

	actor := middleware.UserFromContext(r.Context())
	aid := actor.ID
	audit.WriteAudit(h.DB, &aid, "update", "user", &id, map[string]any{
		"username": existing.Username, "role": role, "active": active,
		"password_reset": req.Password != nil,
	})

	u, err := loadUserItem(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func loadUserItem(db *sql.DB, id int64) (userListItem, error) {
	var u userListItem
	var must, active int
	err := db.QueryRow(`
		SELECT id, username, display_name, role, must_change_password, active, created_at
		FROM users WHERE id = ?
	`, id).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &must, &active, &u.CreatedAt)
	if err != nil {
		return u, err
	}
	u.MustChangePassword = must == 1
	u.Active = active == 1
	return u, nil
}
