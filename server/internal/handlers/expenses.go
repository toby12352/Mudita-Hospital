package handlers

import (
	"database/sql"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// Expenses serves the hospital expense catalog and expense bills.
// The mount is not wrapped in PermSettings: desk users must be able to read the catalog,
// and each bill route checks the portal's own desk permission.
type Expenses struct {
	DB *sql.DB
}

func (h *Expenses) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/expenses")
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		path = "/"
	}

	switch {
	case path == "/catalog/services" && r.Method == http.MethodGet:
		h.withCatalogRead(w, r, h.catalogExpenseServices)
	case path == "/services" && r.Method == http.MethodGet:
		h.withSettings(w, r, h.listExpenseServices)
	case path == "/services" && r.Method == http.MethodPost:
		h.withSettings(w, r, h.createExpenseService)
	case strings.HasPrefix(path, "/services/") && strings.HasSuffix(path, "/delete") && r.Method == http.MethodPost:
		h.withSettings(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.deleteExpenseService(w, r, path)
		})
	case strings.HasPrefix(path, "/services/") && r.Method == http.MethodGet:
		h.withSettings(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.getExpenseService(w, r, path)
		})
	case strings.HasPrefix(path, "/services/") && r.Method == http.MethodPut:
		h.withSettings(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.updateExpenseService(w, r, path)
		})
	case strings.HasPrefix(path, "/services/") && r.Method == http.MethodDelete:
		h.withSettings(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.deactivateExpenseService(w, r, path)
		})
	case path == "/bills" && r.Method == http.MethodGet:
		h.withAuth(w, r, h.listExpenseBills)
	case path == "/bills" && r.Method == http.MethodPost:
		h.withAuth(w, r, h.createExpenseBill)
	case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/pay") && r.Method == http.MethodPost:
		h.withAuth(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.payExpenseBill(w, r, path)
		})
	case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/printed") && r.Method == http.MethodPost:
		h.withAuth(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.markExpenseBillPrinted(w, r, path)
		})
	case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/void") && r.Method == http.MethodPost:
		h.withAuth(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.voidExpenseBill(w, r, path)
		})
	case strings.HasPrefix(path, "/bills/") && strings.HasSuffix(path, "/print") && r.Method == http.MethodGet:
		h.withAuth(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.printExpenseBill(w, r, path)
		})
	case strings.HasPrefix(path, "/bills/") && r.Method == http.MethodGet:
		h.withAuth(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.getExpenseBill(w, r, path)
		})
	case strings.HasPrefix(path, "/bills/") && r.Method == http.MethodDelete:
		h.withAuth(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.purgeExpenseBill(w, r, path)
		})
	case strings.HasPrefix(path, "/bills/") && r.Method == http.MethodPut:
		h.withAuth(w, r, func(w http.ResponseWriter, r *http.Request) {
			h.updateExpenseBill(w, r, path)
		})
	default:
		middleware.RequireAuth(h.DB, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		})).ServeHTTP(w, r)
	}
}

func (h *Expenses) withSettings(w http.ResponseWriter, r *http.Request, next http.HandlerFunc) {
	middleware.RequirePermission(h.DB, auth.PermSettings, next).ServeHTTP(w, r)
}

func (h *Expenses) withAuth(w http.ResponseWriter, r *http.Request, next http.HandlerFunc) {
	middleware.RequireAuth(h.DB, next).ServeHTTP(w, r)
}

func (h *Expenses) withCatalogRead(w http.ResponseWriter, r *http.Request, next http.HandlerFunc) {
	middleware.RequireAnyPermission(h.DB, []string{
		auth.PermSettings,
		auth.PermOPD,
		auth.PermOT,
		auth.PermIPD,
		auth.PermPharmacy,
	}, next).ServeHTTP(w, r)
}
