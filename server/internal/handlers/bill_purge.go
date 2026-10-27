package handlers

import (
	"database/sql"
	"errors"
	"net/http"

	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

var errLedgerNotBalanced = errors.New("ledger not balanced")

// requireAdminUser allows only Role Admin. Desk delete grants stay on void.
func requireAdminUser(w http.ResponseWriter, r *http.Request) (*auth.User, bool) {
	user := middleware.UserFromContext(r.Context())
	if user == nil || user.Role != auth.RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "admin only"})
		return nil, false
	}
	return user, true
}

// purgeBillLedgerTx removes charge + reversal rows for a bill when they net to zero.
// No rows is fine (cash bill or never charged). A non-zero net refuses so stay balance stays intact.
func purgeBillLedgerTx(tx *sql.Tx, source string, billID int64) error {
	var sum int64
	var n int
	err := tx.QueryRow(`
		SELECT COALESCE(SUM(amount_mmk), 0), COUNT(*)
		FROM ipd_ledger
		WHERE source = ? AND source_id = ? AND kind IN ('charge', 'reversal')
	`, source, billID).Scan(&sum, &n)
	if err != nil {
		return err
	}
	if n == 0 {
		return nil
	}
	if sum != 0 {
		return errLedgerNotBalanced
	}
	_, err = tx.Exec(`
		DELETE FROM ipd_ledger
		WHERE source = ? AND source_id = ? AND kind IN ('charge', 'reversal')
	`, source, billID)
	return err
}

func rejectPurgeStatus(w http.ResponseWriter, status string) bool {
	switch status {
	case "draft", "void":
		return false
	case "paid":
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft or void bills can be deleted"})
		return true
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft or void bills can be deleted"})
		return true
	}
}
