package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

type labelBatchRequest struct {
	BatchNo    string `json:"batch_no"`
	ExpiryDate string `json:"expiry_date"`
}

// labelBatch sets batch_no and expiry_date on an existing MAIN row.
// Quantity is not changed. Only a row missing a batch number or expiry can be labeled.
func (h *Pharmacy) labelBatch(w http.ResponseWriter, r *http.Request, path string) {
	rest := strings.TrimSuffix(strings.TrimPrefix(path, "/items/"), "/label")
	parts := strings.Split(rest, "/")
	if len(parts) != 3 || parts[1] != "batches" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	itemID, ok := parseID("/" + parts[0])
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	batchID, ok := parseID("/" + parts[2])
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var req labelBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	batchNo, expiry, reqErr := requireBatchIdentity(req.BatchNo, req.ExpiryDate)
	if reqErr != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": reqErr.Error()})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var loc, oldNo string
	var oldExp sql.NullString
	var qty int64
	err = tx.QueryRow(`
		SELECT location_code, batch_no, expiry_date, qty
		FROM item_batches WHERE id = ? AND item_id = ?
	`, batchID, itemID).Scan(&loc, &oldNo, &oldExp, &qty)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "batch not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "batch load failed"})
		return
	}
	if loc != "MAIN" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch is not on MAIN"})
		return
	}
	if !batchUnlabeled(oldNo, oldExp) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch already labeled"})
		return
	}

	if _, err := tx.Exec(`
		UPDATE item_batches
		SET batch_no = ?, expiry_date = ?, updated_at = datetime('now')
		WHERE id = ? AND item_id = ?
	`, batchNo, *expiry, batchID, itemID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "label failed"})
		return
	}
	var after int64
	if err := tx.QueryRow(`SELECT qty FROM item_batches WHERE id = ?`, batchID).Scan(&after); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "label failed"})
		return
	}
	if after != qty {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "label failed"})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	oldExpiry := ""
	if oldExp.Valid {
		oldExpiry = oldExp.String
	}
	audit.WriteAudit(h.DB, &uid, "label_batch", "item_batch", &batchID, map[string]any{
		"item_id": itemID, "qty": qty,
		"old_batch_no": oldNo, "old_expiry_date": oldExpiry,
		"batch_no": batchNo, "expiry_date": *expiry,
	})

	item, err := loadPharmacyItem(h.DB, itemID, true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, item)
}
