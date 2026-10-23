package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

type transferRequest struct {
	BatchID int64 `json:"batch_id"`
	Qty     int64 `json:"qty"`
}

type stockTransfer struct {
	ID              int64   `json:"id"`
	Direction       string  `json:"direction"`
	ItemID          int64   `json:"item_id"`
	PharmacyBatchID int64   `json:"pharmacy_batch_id"`
	OtBatchID       int64   `json:"ot_batch_id"`
	BatchNo         string  `json:"batch_no"`
	ExpiryDate      *string `json:"expiry_date"`
	Qty             int64   `json:"qty"`
	PharmacyQty     int64   `json:"pharmacy_qty"`
	OtQty           int64   `json:"ot_qty"`
}

// transferToOT moves a chosen MAIN batch qty into the OT cupboard.
// Pharmacy on-hand drops and OT on-hand rises in the same transaction.
func (h *Pharmacy) transferToOT(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req transferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if req.BatchID < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch_id required"})
		return
	}
	if req.Qty <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "qty must be > 0"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var itemID, onHand int64
	var loc, batchNo string
	var expiry sql.NullString
	err = tx.QueryRow(`
		SELECT item_id, location_code, batch_no, expiry_date, qty
		FROM item_batches WHERE id = ?
	`, req.BatchID).Scan(&itemID, &loc, &batchNo, &expiry, &onHand)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "batch not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "batch load failed"})
		return
	}
	if loc != "MAIN" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch is not at MAIN"})
		return
	}
	if req.Qty > onHand {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "insufficient MAIN stock"})
		return
	}

	res, err := tx.Exec(`
		UPDATE item_batches
		SET qty = qty - ?, updated_at = datetime('now')
		WHERE id = ? AND location_code = 'MAIN' AND qty >= ?
	`, req.Qty, req.BatchID, req.Qty)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "transfer failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "insufficient MAIN stock"})
		return
	}

	exp := nullStringPtr(expiry)
	if _, err := tx.Exec(`
		INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
		VALUES (?, ?, 'MAIN', 'TRANSFER', ?, 'Send to OT', ?)
	`, itemID, req.BatchID, -req.Qty, user.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
		return
	}

	otBatchID, err := findOrCreateOtBatch(tx, itemID, batchNo, exp, req.Qty)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ot batch failed"})
		return
	}
	if _, err := tx.Exec(`
		INSERT INTO ot_stock_movements (item_id, ot_batch_id, movement_type, qty_delta, reason, actor_user_id)
		VALUES (?, ?, 'TRANSFER_IN', ?, 'Send to OT', ?)
	`, itemID, otBatchID, req.Qty, user.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ot movement failed"})
		return
	}

	tres, err := tx.Exec(`
		INSERT INTO stock_transfers (
			direction, item_id, pharmacy_batch_id, ot_batch_id, batch_no, expiry_date, qty, actor_user_id
		) VALUES ('TO_OT', ?, ?, ?, ?, ?, ?, ?)
	`, itemID, req.BatchID, otBatchID, batchNo, exp, req.Qty, user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "transfer record failed"})
		return
	}
	transferID, _ := tres.LastInsertId()

	var otQty int64
	if err := tx.QueryRow(`SELECT qty FROM ot_batches WHERE id = ?`, otBatchID).Scan(&otQty); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ot qty failed"})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &user.ID, "transfer", "stock_transfer", &transferID, map[string]any{
		"direction": "TO_OT", "item_id": itemID, "batch_id": req.BatchID, "qty": req.Qty,
	})

	writeJSON(w, http.StatusCreated, stockTransfer{
		ID:              transferID,
		Direction:       "TO_OT",
		ItemID:          itemID,
		PharmacyBatchID: req.BatchID,
		OtBatchID:       otBatchID,
		BatchNo:         batchNo,
		ExpiryDate:      exp,
		Qty:             req.Qty,
		PharmacyQty:     onHand - req.Qty,
		OtQty:           otQty,
	})
}
