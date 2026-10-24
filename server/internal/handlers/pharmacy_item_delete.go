package handlers

import (
	"database/sql"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

func (h *Pharmacy) deleteItem(w http.ResponseWriter, r *http.Request, path string) {
	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/items/"), "/delete")
	id, ok := parseID("/" + idPart)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var code, name string
	err := h.DB.QueryRow(`SELECT code, name FROM items WHERE id = ?`, id).Scan(&code, &name)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	if blocked, err := itemHasClinicalHistory(tx, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "check failed"})
		return
	} else if blocked {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "item is on a bill or transfer"})
		return
	}

	if _, err := tx.Exec(`DELETE FROM stock_movements WHERE item_id = ?`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
		return
	}
	res, err := tx.Exec(`DELETE FROM items WHERE id = ?`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "delete", "item", &id, map[string]any{
		"code": code, "name": name,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func itemHasClinicalHistory(tx *sql.Tx, itemID int64) (bool, error) {
	checks := []string{
		`SELECT 1 FROM pharmacy_bill_lines WHERE item_id = ? LIMIT 1`,
		`SELECT 1 FROM pharmacy_bill_stock_allocs WHERE item_id = ? LIMIT 1`,
		`SELECT 1 FROM bill_lines WHERE line_type = 'item' AND ref_id = ? LIMIT 1`,
		`SELECT 1 FROM bill_stock_allocs WHERE item_id = ? LIMIT 1`,
		`SELECT 1 FROM ot_case_items WHERE item_id = ? LIMIT 1`,
		`SELECT 1 FROM ot_case_issue_allocs WHERE item_id = ? LIMIT 1`,
		`SELECT 1 FROM ot_bill_lines WHERE line_type = 'item' AND ref_id = ? LIMIT 1`,
		`SELECT 1 FROM ot_bill_stock_allocs WHERE item_id = ? LIMIT 1`,
		`SELECT 1 FROM stock_transfers WHERE item_id = ? LIMIT 1`,
		`SELECT 1 FROM ot_stock_movements WHERE item_id = ? LIMIT 1`,
		`SELECT 1 FROM ot_batches WHERE item_id = ? LIMIT 1`,
		`SELECT 1 FROM stock_movements WHERE item_id = ? AND movement_type NOT IN ('PURCHASE', 'ADJUST') LIMIT 1`,
	}
	for _, q := range checks {
		var one int
		err := tx.QueryRow(q, itemID).Scan(&one)
		if err == nil {
			return true, nil
		}
		if err != sql.ErrNoRows {
			return false, err
		}
	}
	return false, nil
}
