package middleware

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/auth"
)

type ctxKey int

const userCtxKey ctxKey = 1

// UserFromContext returns the authenticated user set by RequireAuth.
func UserFromContext(ctx context.Context) *auth.User {
	u, _ := ctx.Value(userCtxKey).(*auth.User)
	return u
}

func withUser(ctx context.Context, u *auth.User) context.Context {
	return context.WithValue(ctx, userCtxKey, u)
}

// BearerToken extracts the session token from Authorization: Bearer … or mudita_session cookie.
func BearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	if c, err := r.Cookie("mudita_session"); err == nil {
		return c.Value
	}
	return ""
}

// RequireAuth rejects unauthenticated requests.
func RequireAuth(db *sql.DB, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := BearerToken(r)
		user, err := auth.LookupSession(db, token)
		if err != nil || user == nil {
			writeJSONError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		if user.MustChangePassword && !passwordChangeAllowed(r.URL.Path) {
			writeJSONError(w, http.StatusForbidden, "password change required")
			return
		}
		next.ServeHTTP(w, r.WithContext(withUser(r.Context(), user)))
	})
}

// RequirePermission requires auth plus the desk gate.
// Portal accounts use the role map. Unified accounts need a grant on that
// module; users.role is not the decision. settings and manage_users stay Admin-only.
func RequirePermission(db *sql.DB, perm string, next http.Handler) http.Handler {
	return RequireAuth(db, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			writeJSONError(w, http.StatusForbidden, "forbidden")
			return
		}
		ok, err := auth.DeskAllowed(db, user.ID, perm)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "permission check failed")
			return
		}
		if !ok {
			writeJSONError(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

// RequireAnyPermission requires auth plus any one of the listed desk gates.
// Unified accounts need a grant on one of those modules, not a matching role.
func RequireAnyPermission(db *sql.DB, perms []string, next http.Handler) http.Handler {
	return RequireAuth(db, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			writeJSONError(w, http.StatusForbidden, "forbidden")
			return
		}
		ok, err := auth.AnyDeskAllowed(db, user.ID, perms)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "permission check failed")
			return
		}
		if !ok {
			writeJSONError(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func passwordChangeAllowed(path string) bool {
	switch strings.TrimSuffix(path, "/") {
	case "/api/auth/me", "/api/auth/change-password", "/api/auth/logout":
		return true
	default:
		return false
	}
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}
