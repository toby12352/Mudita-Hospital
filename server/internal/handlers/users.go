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

// Users handles Admin user management. New and edited accounts are unified.
// Deactivate stays, and Admin rows are not given a grant matrix.
type Users struct {
	DB *sql.DB
}

type userListItem struct {
	ID                 int64    `json:"id"`
	Username           string   `json:"username"`
	DisplayName        string   `json:"display_name"`
	Role               string   `json:"role"`
	MustChangePassword bool     `json:"must_change_password"`
	Active             bool     `json:"active"`
	CreatedAt          string   `json:"created_at,omitempty"`
	AccessMode         string   `json:"access_mode"`
	Grants             []string `json:"grants"`
}

type userCreateRequest struct {
	Username    string   `json:"username"`
	DisplayName string   `json:"display_name"`
	Password    string   `json:"password"`
	Grants      []string `json:"grants"`
}

type userUpdateRequest struct {
	DisplayName *string   `json:"display_name,omitempty"`
	Active      *bool     `json:"active,omitempty"`
	Password    *string   `json:"password,omitempty"`
	Grants      *[]string `json:"grants,omitempty"`
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
			SELECT id, username, display_name, role, must_change_password, active, created_at, access_mode
			FROM users
			WHERE username LIKE ? OR display_name LIKE ?
			ORDER BY username COLLATE NOCASE
		`, like, like)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, username, display_name, role, must_change_password, active, created_at, access_mode
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
		u, err := scanUserItem(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, u)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	_ = rows.Close()
	grantMap, err := loadGrantMap(h.DB)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	for i := range list {
		list[i].Grants = grantsFor(grantMap, list[i].ID)
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
	if req.Username == "" || req.DisplayName == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "username, display_name, and password required"})
		return
	}
	if len(req.Password) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 6 characters"})
		return
	}
	grants, err := auth.NormalizeGrants(req.Grants)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	role := auth.FillerRole(grants)

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "hash failed"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.Exec(`
		INSERT INTO users (username, display_name, role, password_hash, must_change_password, active, access_mode)
		VALUES (?, ?, ?, ?, 1, 1, ?)
	`, req.Username, req.DisplayName, role, hash, auth.AccessUnified)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "username already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	id, _ := res.LastInsertId()
	if err := replaceGrants(tx, id, grants); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}

	if err := auth.DeleteUserSessions(h.DB, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "session revoke failed"})
		return
	}

	actor := middleware.UserFromContext(r.Context())
	aid := actor.ID
	audit.WriteAudit(h.DB, &aid, "create", "user", &id, map[string]any{
		"username":    req.Username,
		"role":        role,
		"access_mode": auth.AccessUnified,
		"old_grants":  []string{},
		"new_grants":  grants,
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

	if req.Grants != nil {
		if existing.Role == auth.RoleAdmin {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot edit Admin"})
			return
		}
		h.saveGrants(w, r, existing, displayName, active, req.Password, *req.Grants)
		return
	}

	h.saveProfile(w, r, existing, displayName, active, req.Password)
}

// saveGrants replaces the matrix, sets access_mode = unified, then revokes sessions.
func (h *Users) saveGrants(w http.ResponseWriter, r *http.Request, existing *auth.User, displayName string, active bool, password *string, rawGrants []string) {
	grants, err := auth.NormalizeGrants(rawGrants)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	role := auth.FillerRole(grants)
	oldGrants, err := loadGrants(h.DB, existing.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	var hash string
	if password != nil {
		if len(*password) < 6 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 6 characters"})
			return
		}
		hash, err = auth.HashPassword(*password)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "hash failed"})
			return
		}
	}

	activeInt := 0
	if active {
		activeInt = 1
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	defer func() { _ = tx.Rollback() }()

	if password != nil {
		_, err = tx.Exec(`
			UPDATE users SET display_name = ?, role = ?, active = ?, access_mode = ?,
				password_hash = ?, must_change_password = 1, updated_at = datetime('now')
			WHERE id = ?
		`, displayName, role, activeInt, auth.AccessUnified, hash, existing.ID)
	} else {
		_, err = tx.Exec(`
			UPDATE users SET display_name = ?, role = ?, active = ?, access_mode = ?,
				updated_at = datetime('now')
			WHERE id = ?
		`, displayName, role, activeInt, auth.AccessUnified, existing.ID)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	if err := replaceGrants(tx, existing.ID, grants); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}

	if err := auth.DeleteUserSessions(h.DB, existing.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "session revoke failed"})
		return
	}

	actor := middleware.UserFromContext(r.Context())
	aid := actor.ID
	id := existing.ID
	audit.WriteAudit(h.DB, &aid, "update", "user", &id, map[string]any{
		"username":       existing.Username,
		"role":           role,
		"active":         active,
		"access_mode":    auth.AccessUnified,
		"password_reset": password != nil,
		"old_grants":     oldGrants,
		"new_grants":     grants,
	})

	u, err := loadUserItem(h.DB, existing.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// saveProfile updates name, active, or password and leaves portal mode and grants alone.
func (h *Users) saveProfile(w http.ResponseWriter, r *http.Request, existing *auth.User, displayName string, active bool, password *string) {
	activeInt := 0
	if active {
		activeInt = 1
	}
	id := existing.ID

	if password != nil {
		if len(*password) < 6 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 6 characters"})
			return
		}
		hash, err := auth.HashPassword(*password)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "hash failed"})
			return
		}
		_, err = h.DB.Exec(`
			UPDATE users SET display_name = ?, active = ?, password_hash = ?,
				must_change_password = 1, updated_at = datetime('now')
			WHERE id = ?
		`, displayName, activeInt, hash, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
			return
		}
		_ = auth.DeleteUserSessions(h.DB, id)
	} else {
		_, err := h.DB.Exec(`
			UPDATE users SET display_name = ?, active = ?, updated_at = datetime('now')
			WHERE id = ?
		`, displayName, activeInt, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
			return
		}
	}

	actor := middleware.UserFromContext(r.Context())
	aid := actor.ID
	audit.WriteAudit(h.DB, &aid, "update", "user", &id, map[string]any{
		"username": existing.Username, "role": existing.Role, "active": active,
		"password_reset": password != nil,
	})

	u, err := loadUserItem(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func replaceGrants(tx *sql.Tx, userID int64, grants []string) error {
	if _, err := tx.Exec(`DELETE FROM user_grants WHERE user_id = ?`, userID); err != nil {
		return err
	}
	for _, perm := range grants {
		if _, err := tx.Exec(`INSERT INTO user_grants (user_id, perm) VALUES (?, ?)`, userID, perm); err != nil {
			return err
		}
	}
	return nil
}

func loadGrants(db *sql.DB, userID int64) ([]string, error) {
	rows, err := db.Query(`SELECT perm FROM user_grants WHERE user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var perms []string
	for rows.Next() {
		var perm string
		if err := rows.Scan(&perm); err != nil {
			return nil, err
		}
		perms = append(perms, perm)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return auth.OrderedGrants(perms), nil
}

func loadGrantMap(db *sql.DB) (map[int64][]string, error) {
	rows, err := db.Query(`SELECT user_id, perm FROM user_grants`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	raw := map[int64][]string{}
	for rows.Next() {
		var id int64
		var perm string
		if err := rows.Scan(&id, &perm); err != nil {
			return nil, err
		}
		raw[id] = append(raw[id], perm)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make(map[int64][]string, len(raw))
	for id, perms := range raw {
		out[id] = auth.OrderedGrants(perms)
	}
	return out, nil
}

func grantsFor(m map[int64][]string, id int64) []string {
	if g, ok := m[id]; ok {
		return g
	}
	return []string{}
}

type userScanner interface {
	Scan(dest ...any) error
}

func scanUserItem(sc userScanner) (userListItem, error) {
	var u userListItem
	var must, active int
	err := sc.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &must, &active, &u.CreatedAt, &u.AccessMode)
	if err != nil {
		return u, err
	}
	u.MustChangePassword = must == 1
	u.Active = active == 1
	u.Grants = []string{}
	return u, nil
}

func loadUserItem(db *sql.DB, id int64) (userListItem, error) {
	row := db.QueryRow(`
		SELECT id, username, display_name, role, must_change_password, active, created_at, access_mode
		FROM users WHERE id = ?
	`, id)
	u, err := scanUserItem(row)
	if err != nil {
		return u, err
	}
	grants, err := loadGrants(db, id)
	if err != nil {
		return u, err
	}
	u.Grants = grants
	return u, nil
}
