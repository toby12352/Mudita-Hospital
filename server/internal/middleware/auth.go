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
		next.ServeHTTP(w, r.WithContext(withUser(r.Context(), user)))
	})
}

// RequirePermission requires auth plus a role permission.
func RequirePermission(db *sql.DB, perm string, next http.Handler) http.Handler {
	return RequireAuth(db, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil || !auth.HasPermission(user.Role, perm) {
			writeJSONError(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}
