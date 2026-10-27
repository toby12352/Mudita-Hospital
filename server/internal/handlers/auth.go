package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

type Auth struct {
	DB *sql.DB
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token     string     `json:"token"`
	ExpiresAt string     `json:"expires_at"`
	User      *auth.User `json:"user"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func (a *Auth) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/auth")
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		path = "/"
	}

	switch {
	case path == "/login" && r.Method == http.MethodPost:
		a.login(w, r)
	case path == "/logout" && r.Method == http.MethodPost:
		middleware.RequireAuth(a.DB, http.HandlerFunc(a.logout)).ServeHTTP(w, r)
	case path == "/me" && r.Method == http.MethodGet:
		middleware.RequireAuth(a.DB, http.HandlerFunc(a.me)).ServeHTTP(w, r)
	case path == "/change-password" && r.Method == http.MethodPost:
		middleware.RequireAuth(a.DB, http.HandlerFunc(a.changePassword)).ServeHTTP(w, r)
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}

func (a *Auth) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "username and password required"})
		return
	}

	user, hash, err := auth.GetUserByUsername(a.DB, req.Username)
	if err == sql.ErrNoRows || user == nil {
		audit.WriteAudit(a.DB, nil, "login_failed", "user", nil, map[string]string{
			"username": req.Username,
			"reason":   "unknown_user",
		})
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "server error"})
		return
	}
	if !user.Active {
		uid := user.ID
		audit.WriteAudit(a.DB, &uid, "login_failed", "user", &uid, map[string]string{"reason": "inactive"})
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}
	if !auth.CheckPassword(hash, req.Password) {
		uid := user.ID
		audit.WriteAudit(a.DB, &uid, "login_failed", "user", &uid, map[string]string{"reason": "bad_password"})
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}

	token, expiresAt, err := auth.CreateSession(a.DB, user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "session create failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(a.DB, &uid, "login", "user", &uid, map[string]string{"username": user.Username})

	// Optional cookie for browser clients; Tauri/fetch also uses Bearer.
	http.SetCookie(w, &http.Cookie{
		Name:     "mudita_session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  expiresAt,
	})

	writeJSON(w, http.StatusOK, loginResponse{
		Token:     token,
		ExpiresAt: expiresAt.Format(time.RFC3339),
		User:      user,
	})
}

func (a *Auth) logout(w http.ResponseWriter, r *http.Request) {
	token := middleware.BearerToken(r)
	user := middleware.UserFromContext(r.Context())
	_ = auth.DeleteSession(a.DB, token)

	if user != nil {
		uid := user.ID
		audit.WriteAudit(a.DB, &uid, "logout", "user", &uid, nil)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "mudita_session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type meUser struct {
	ID                 int64  `json:"id"`
	Username           string `json:"username"`
	DisplayName        string `json:"display_name"`
	Role               string `json:"role"`
	MustChangePassword bool   `json:"must_change_password"`
	Active             bool   `json:"active"`
	AccessMode         string `json:"access_mode"`
}

func (a *Auth) me(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	role, mode, err := auth.LoadAccess(a.DB, user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	grants, err := loadGrants(a.DB, user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": meUser{
			ID:                 user.ID,
			Username:           user.Username,
			DisplayName:        user.DisplayName,
			Role:               role,
			MustChangePassword: user.MustChangePassword,
			Active:             user.Active,
			AccessMode:         mode,
		},
		"permissions": permissionsForAccess(role, mode, grants),
	})
}

func (a *Auth) changePassword(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	var req changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if len(req.NewPassword) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "new password must be at least 6 characters"})
		return
	}

	_, hash, err := auth.GetUserByUsername(a.DB, user.Username)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "server error"})
		return
	}
	if !auth.CheckPassword(hash, req.CurrentPassword) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "current password incorrect"})
		return
	}

	newHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "hash failed"})
		return
	}

	_, err = a.DB.Exec(`
		UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now')
		WHERE id = ?
	`, newHash, user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(a.DB, &uid, "change_password", "user", &uid, nil)

	// Force re-login on other devices.
	_ = auth.DeleteUserSessions(a.DB, user.ID)
	token, expiresAt, err := auth.CreateSession(a.DB, user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "session create failed"})
		return
	}

	updated, _ := auth.GetUserByID(a.DB, user.ID)
	http.SetCookie(w, &http.Cookie{
		Name:     "mudita_session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  expiresAt,
	})

	writeJSON(w, http.StatusOK, loginResponse{
		Token:     token,
		ExpiresAt: expiresAt.Format(time.RFC3339),
		User:      updated,
	})
}

func permissionsFor(role string) []string {
	candidates := []string{
		auth.PermSettings, auth.PermManageUsers, auth.PermOPD, auth.PermOT, auth.PermPharmacy, auth.PermPatients, auth.PermIPD,
	}
	out := make([]string, 0, len(candidates))
	for _, p := range candidates {
		if auth.HasPermission(role, p) {
			out = append(out, p)
		}
	}
	return out
}

// permissionsForAccess is the key list returned by /api/auth/me.
// Portal accounts keep the desk keys, plus any stored grant keys.
// Unified accounts return grant keys only. dashboard is included only when saved.
// settings and manage_users are never added from a grant.
func permissionsForAccess(role, mode string, grants []string) []string {
	ordered := auth.OrderedGrants(grants)
	if role == auth.RoleAdmin || mode != auth.AccessUnified {
		out := permissionsFor(role)
		seen := make(map[string]bool, len(out)+len(ordered))
		for _, p := range out {
			seen[p] = true
		}
		for _, g := range ordered {
			if seen[g] || g == auth.PermSettings || g == auth.PermManageUsers {
				continue
			}
			out = append(out, g)
			seen[g] = true
		}
		return out
	}
	out := make([]string, 0, len(ordered))
	for _, g := range ordered {
		if g == auth.PermSettings || g == auth.PermManageUsers {
			continue
		}
		out = append(out, g)
	}
	return out
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
