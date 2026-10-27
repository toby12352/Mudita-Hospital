package handlers

import (
	"database/sql"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// allowCell enforces one unified grant after the desk gate.
// Portal accounts already matched today's role and are allowed.
// Admin is allowed. A missing unified grant is 403.
func allowCell(db *sql.DB, w http.ResponseWriter, r *http.Request, grant string) bool {
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return false
	}
	ok, err := auth.CellAllowed(db, user.ID, grant)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "permission check failed"})
		return false
	}
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return false
	}
	return true
}

// pharmacyGrant maps a pharmacy route to a cell.
// Adjust is skipped here; the handler uses Allow so portal Pharmacy is denied.
func pharmacyGrant(method, path string) (grant string, skip bool) {
	if method == http.MethodPost && strings.HasSuffix(path, "/adjust") {
		return "", true
	}
	if method == http.MethodDelete || (method == http.MethodPost && (strings.HasSuffix(path, "/void") || strings.HasSuffix(path, "/delete"))) {
		return auth.GrantPharmacyDelete, false
	}
	if method == http.MethodPost && strings.HasSuffix(path, "/restock") {
		return auth.GrantPharmacyCreate, false
	}
	if method == http.MethodPost && path == "/items" {
		return auth.GrantPharmacyUpdate, false
	}
	if method == http.MethodPut && strings.HasPrefix(path, "/items/") {
		return auth.GrantPharmacyUpdate, false
	}
	if method == http.MethodPost && strings.HasSuffix(path, "/label") {
		return auth.GrantPharmacyUpdate, false
	}
	if method == http.MethodPost && (path == "/bills" ||
		strings.HasSuffix(path, "/pay") ||
		strings.HasSuffix(path, "/printed") ||
		strings.HasSuffix(path, "/transfer")) {
		return auth.GrantPharmacyCreate, false
	}
	if method == http.MethodPut && strings.HasPrefix(path, "/bills/") {
		return auth.GrantPharmacyCreate, false
	}
	return auth.GrantPharmacyRead, false
}

func opdGrant(method, path string) string {
	if method == http.MethodDelete && strings.HasPrefix(path, "/bills/") {
		return auth.GrantOPDDelete
	}
	if method == http.MethodPost && strings.HasSuffix(path, "/void") {
		return auth.GrantOPDDelete
	}
	if method == http.MethodPost && (path == "/bills" || strings.HasSuffix(path, "/pay") || strings.HasSuffix(path, "/printed")) {
		return auth.GrantOPDCreate
	}
	if method == http.MethodPut && strings.HasPrefix(path, "/bills/") {
		return auth.GrantOPDCreate
	}
	return auth.GrantOPDRead
}

func otGrant(method, path string) string {
	if method == http.MethodDelete && strings.HasPrefix(path, "/bills/") {
		return auth.GrantOTDelete
	}
	if method == http.MethodPost && strings.HasSuffix(path, "/void") {
		return auth.GrantOTDelete
	}
	if method == http.MethodPost && strings.Contains(path, "/services/") && strings.HasSuffix(path, "/delete") {
		return auth.GrantOTDelete
	}
	if method == http.MethodDelete && strings.HasPrefix(path, "/services/") {
		return auth.GrantOTDelete
	}
	if method == http.MethodPost && path == "/services" {
		return auth.GrantOTUpdate
	}
	if method == http.MethodPut && strings.HasPrefix(path, "/services/") {
		return auth.GrantOTUpdate
	}
	if method == http.MethodPut && strings.HasPrefix(path, "/cases/") {
		return auth.GrantOTUpdate
	}
	if method == http.MethodPost && strings.HasSuffix(path, "/label") {
		return auth.GrantOTUpdate
	}
	if method == http.MethodPost && (path == "/cases" ||
		strings.HasSuffix(path, "/bill") ||
		strings.HasSuffix(path, "/pay") ||
		strings.HasSuffix(path, "/printed") ||
		strings.HasSuffix(path, "/return")) {
		return auth.GrantOTCreate
	}
	if method == http.MethodPut && strings.HasPrefix(path, "/bills/") {
		return auth.GrantOTCreate
	}
	return auth.GrantOTRead
}

func ipdGrant(method, path string) string {
	if method == http.MethodPost && (path == "/admissions" ||
		strings.HasSuffix(path, "/deposits") ||
		strings.HasSuffix(path, "/ward-charges")) {
		return auth.GrantIPDCreate
	}
	if method == http.MethodPut || (method == http.MethodPost && strings.HasSuffix(path, "/discharge")) {
		return auth.GrantIPDUpdate
	}
	return auth.GrantIPDRead
}

// masterGrant is the OPD service and doctor catalog.
// Creating a service or a doctor is Update. Delete is removal.
func masterGrant(method, path string) string {
	if method == http.MethodDelete || (method == http.MethodPost && strings.HasSuffix(path, "/delete")) {
		return auth.GrantOPDDelete
	}
	if method == http.MethodPost || method == http.MethodPut {
		return auth.GrantOPDUpdate
	}
	return auth.GrantOPDRead
}
