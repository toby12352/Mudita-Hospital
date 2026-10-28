package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

type otReturnRequest struct {
	Qty int64 `json:"qty"`
}

type otStockBatch struct {
	ID           int64   `json:"id"`
	ItemID       int64   `json:"item_id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	StockUnit    string  `json:"stock_unit"`
	Dosage       string  `json:"dosage"`
	BuyPriceMMK  int64   `json:"buy_price_mmk"`
	SellPriceMMK int64   `json:"sell_price_mmk"`
	PackL1Qty    int64   `json:"pack_l1_qty"`
	PackL1Unit   string  `json:"pack_l1_unit"`
	PackL2Qty    int64   `json:"pack_l2_qty"`
	PackL2Unit   string  `json:"pack_l2_unit"`
	PackL3Qty    int64   `json:"pack_l3_qty"`
	PackL3Unit   string  `json:"pack_l3_unit"`
	PackL4Qty    int64   `json:"pack_l4_qty"`
	PackL4Unit   string  `json:"pack_l4_unit"`
	PackL5Qty    int64   `json:"pack_l5_qty"`
	PackL5Unit   string  `json:"pack_l5_unit"`
	PackL6Qty    int64   `json:"pack_l6_qty"`
	PackL6Unit   string  `json:"pack_l6_unit"`
	Active       bool    `json:"active"`
	CreatedAt    string  `json:"created_at"`
	BatchNo      string  `json:"batch_no"`
	ExpiryDate   *string `json:"expiry_date"`
	Qty          int64   `json:"qty"`
}

func (h *OT) listOtStock(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(`
		SELECT b.id, b.item_id, i.code, i.name, COALESCE(i.stock_unit, 'Piece'),
		       COALESCE(i.dosage, ''), i.buy_price_mmk, i.sell_price_mmk,
		       COALESCE(i.pack_l1_qty, 1), COALESCE(i.pack_l1_unit, 'Box'),
		       COALESCE(i.pack_l2_qty, 1), COALESCE(i.pack_l2_unit, 'Strip'),
		       COALESCE(i.pack_l3_qty, 1), COALESCE(i.pack_l3_unit, 'Tablet'),
		       COALESCE(i.pack_l4_qty, 1), COALESCE(i.pack_l4_unit, ''),
		       COALESCE(i.pack_l5_qty, 1), COALESCE(i.pack_l5_unit, ''),
		       COALESCE(i.pack_l6_qty, 1), COALESCE(i.pack_l6_unit, ''),
		       i.active, i.created_at,
		       b.batch_no, b.expiry_date, b.qty
		FROM ot_batches b
		JOIN items i ON i.id = b.item_id
		WHERE b.qty > 0
		ORDER BY i.name COLLATE NOCASE, i.code COLLATE NOCASE,
		         CASE WHEN b.expiry_date IS NULL OR b.expiry_date = '' THEN 1 ELSE 0 END,
		         b.expiry_date ASC, b.id ASC
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]otStockBatch, 0)
	for rows.Next() {
		var b otStockBatch
		var expiry sql.NullString
		var active int
		if err := rows.Scan(
			&b.ID, &b.ItemID, &b.ItemCode, &b.ItemName, &b.StockUnit,
			&b.Dosage, &b.BuyPriceMMK, &b.SellPriceMMK,
			&b.PackL1Qty, &b.PackL1Unit, &b.PackL2Qty, &b.PackL2Unit, &b.PackL3Qty, &b.PackL3Unit,
			&b.PackL4Qty, &b.PackL4Unit, &b.PackL5Qty, &b.PackL5Unit, &b.PackL6Qty, &b.PackL6Unit,
			&active, &b.CreatedAt,
			&b.BatchNo, &expiry, &b.Qty,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		b.Active = active == 1
		padded := itemPackFromPharmacyItem(pharmacyItem{
			PackL1Qty: b.PackL1Qty, PackL1Unit: b.PackL1Unit,
			PackL2Qty: b.PackL2Qty, PackL2Unit: b.PackL2Unit,
			PackL3Qty: b.PackL3Qty, PackL3Unit: b.PackL3Unit,
			PackL4Qty: b.PackL4Qty, PackL4Unit: b.PackL4Unit,
			PackL5Qty: b.PackL5Qty, PackL5Unit: b.PackL5Unit,
			PackL6Qty: b.PackL6Qty, PackL6Unit: b.PackL6Unit,
		})
		b.PackL4Qty, b.PackL4Unit = padded.L4Qty, padded.L4Unit
		b.PackL5Qty, b.PackL5Unit = padded.L5Qty, padded.L5Unit
		b.PackL6Qty, b.PackL6Unit = padded.L6Qty, padded.L6Unit
		b.ExpiryDate = nullStringPtr(expiry)
		list = append(list, b)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"batches": list})
}

// returnOtStock moves a chosen OT cupboard qty back to the same batch at MAIN.
func (h *OT) returnOtStock(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/stock/"), "/return")
	otBatchID, ok := parseID("/" + idPart)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var req otReturnRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
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
	var batchNo string
	var expiry sql.NullString
	err = tx.QueryRow(`
		SELECT item_id, batch_no, expiry_date, qty FROM ot_batches WHERE id = ?
	`, otBatchID).Scan(&itemID, &batchNo, &expiry, &onHand)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "batch not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "batch load failed"})
		return
	}
	if req.Qty > onHand {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "insufficient OT stock"})
		return
	}

	res, err := tx.Exec(`
		UPDATE ot_batches
		SET qty = qty - ?, updated_at = datetime('now')
		WHERE id = ? AND qty >= ?
	`, req.Qty, otBatchID, req.Qty)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "return failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "insufficient OT stock"})
		return
	}

	exp := nullStringPtr(expiry)
	if _, err := tx.Exec(`
		INSERT INTO ot_stock_movements (item_id, ot_batch_id, movement_type, qty_delta, reason, actor_user_id)
		VALUES (?, ?, 'TRANSFER_OUT', ?, 'Return to pharmacy', ?)
	`, itemID, otBatchID, -req.Qty, user.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ot movement failed"})
		return
	}

	pharmacyBatchID, err := findOrCreateBatch(tx, itemID, "MAIN", batchNo, exp, req.Qty)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pharmacy batch failed"})
		return
	}
	if _, err := tx.Exec(`
		INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
		VALUES (?, ?, 'MAIN', 'TRANSFER', ?, 'Return from OT', ?)
	`, itemID, pharmacyBatchID, req.Qty, user.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
		return
	}

	tres, err := tx.Exec(`
		INSERT INTO stock_transfers (
			direction, item_id, pharmacy_batch_id, ot_batch_id, batch_no, expiry_date, qty, actor_user_id
		) VALUES ('TO_PHARMACY', ?, ?, ?, ?, ?, ?, ?)
	`, itemID, pharmacyBatchID, otBatchID, batchNo, exp, req.Qty, user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "transfer record failed"})
		return
	}
	transferID, _ := tres.LastInsertId()

	var pharmacyQty int64
	if err := tx.QueryRow(`SELECT qty FROM item_batches WHERE id = ?`, pharmacyBatchID).Scan(&pharmacyQty); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pharmacy qty failed"})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &user.ID, "return", "stock_transfer", &transferID, map[string]any{
		"direction": "TO_PHARMACY", "item_id": itemID, "ot_batch_id": otBatchID, "qty": req.Qty,
	})

	writeJSON(w, http.StatusCreated, stockTransfer{
		ID:              transferID,
		Direction:       "TO_PHARMACY",
		ItemID:          itemID,
		PharmacyBatchID: pharmacyBatchID,
		OtBatchID:       otBatchID,
		BatchNo:         batchNo,
		ExpiryDate:      exp,
		Qty:             req.Qty,
		PharmacyQty:     pharmacyQty,
		OtQty:           onHand - req.Qty,
	})
}

func findOrCreateOtBatch(tx *sql.Tx, itemID int64, batchNo string, expiry *string, addQty int64) (int64, error) {
	var batchID int64
	var err error
	if expiry == nil {
		err = tx.QueryRow(`
			SELECT id FROM ot_batches
			WHERE item_id = ? AND batch_no = ?
			  AND (expiry_date IS NULL OR expiry_date = '')
			ORDER BY id ASC LIMIT 1
		`, itemID, batchNo).Scan(&batchID)
	} else {
		err = tx.QueryRow(`
			SELECT id FROM ot_batches
			WHERE item_id = ? AND batch_no = ? AND expiry_date = ?
			ORDER BY id ASC LIMIT 1
		`, itemID, batchNo, *expiry).Scan(&batchID)
	}
	if err == sql.ErrNoRows {
		res, err := tx.Exec(`
			INSERT INTO ot_batches (item_id, batch_no, expiry_date, qty)
			VALUES (?, ?, ?, ?)
		`, itemID, batchNo, expiry, addQty)
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(`
		UPDATE ot_batches SET qty = qty + ?, updated_at = datetime('now') WHERE id = ?
	`, addQty, batchID); err != nil {
		return 0, err
	}
	return batchID, nil
}

// labelOtBatch sets batch_no and expiry_date on an existing cupboard row.
// Quantity is not changed. Only a row missing a batch number or expiry can be labeled.
func (h *OT) labelOtBatch(w http.ResponseWriter, r *http.Request, path string) {
	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/stock/"), "/label")
	otBatchID, ok := parseID("/" + idPart)
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

	var oldNo string
	var oldExp sql.NullString
	var qty int64
	err = tx.QueryRow(`
		SELECT batch_no, expiry_date, qty FROM ot_batches WHERE id = ?
	`, otBatchID).Scan(&oldNo, &oldExp, &qty)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "batch not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "batch load failed"})
		return
	}
	if !batchUnlabeled(oldNo, oldExp) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch already labeled"})
		return
	}

	if _, err := tx.Exec(`
		UPDATE ot_batches
		SET batch_no = ?, expiry_date = ?, updated_at = datetime('now')
		WHERE id = ?
	`, batchNo, *expiry, otBatchID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "label failed"})
		return
	}
	var after int64
	if err := tx.QueryRow(`SELECT qty FROM ot_batches WHERE id = ?`, otBatchID).Scan(&after); err != nil || after != qty {
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
	audit.WriteAudit(h.DB, &uid, "label_batch", "ot_batch", &otBatchID, map[string]any{
		"qty":          qty,
		"old_batch_no": oldNo, "old_expiry_date": oldExpiry,
		"batch_no": batchNo, "expiry_date": *expiry,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"id": otBatchID, "batch_no": batchNo, "expiry_date": *expiry, "qty": qty,
	})
}

// fefoDeductOtSale takes OT cupboard batches, earliest expiry first.
// A null or blank expiry sells after every unexpired dated batch.
// A batch dated before today (Asia/Yangon) stays in the cupboard.
func fefoDeductOtSale(tx *sql.Tx, billID, lineID, itemID, qty, actorUserID int64) error {
	if qty <= 0 {
		return fmt.Errorf("qty must be > 0")
	}
	rows, err := tx.Query(`
		SELECT id, qty FROM ot_batches
		WHERE item_id = ? AND qty > 0
		  AND (
		    expiry_date IS NULL OR expiry_date = ''
		    OR date(expiry_date) >= date(?)
		  )
		ORDER BY
		  CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
		  expiry_date ASC, id ASC
	`, itemID, localToday())
	if err != nil {
		return fmt.Errorf("stock query failed")
	}
	type take struct {
		id  int64
		qty int64
	}
	takes := make([]take, 0)
	for rows.Next() {
		var t take
		if err := rows.Scan(&t.id, &t.qty); err != nil {
			rows.Close()
			return fmt.Errorf("stock scan failed")
		}
		takes = append(takes, t)
	}
	rows.Close()

	var total int64
	for _, t := range takes {
		total += t.qty
	}
	if total < qty {
		var code string
		_ = tx.QueryRow(`SELECT code FROM items WHERE id = ?`, itemID).Scan(&code)
		if code == "" {
			code = fmt.Sprintf("#%d", itemID)
		}
		return fmt.Errorf("insufficient OT stock for %s (need %d, have %d)", code, qty, total)
	}

	remaining := qty
	reason := fmt.Sprintf("OT bill sale line %d", lineID)
	for _, t := range takes {
		if remaining == 0 {
			break
		}
		use := t.qty
		if use > remaining {
			use = remaining
		}
		res, err := tx.Exec(`
			UPDATE ot_batches SET qty = qty - ?, updated_at = datetime('now')
			WHERE id = ? AND qty >= ?
		`, use, t.id, use)
		if err != nil {
			return fmt.Errorf("deduct failed")
		}
		affected, _ := res.RowsAffected()
		if affected == 0 {
			return fmt.Errorf("deduct failed")
		}
		if _, err := tx.Exec(`
			INSERT INTO ot_stock_movements (item_id, ot_batch_id, movement_type, qty_delta, reason, actor_user_id)
			VALUES (?, ?, 'SALE', ?, ?, ?)
		`, itemID, t.id, -use, reason, actorUserID); err != nil {
			return fmt.Errorf("movement failed")
		}
		if _, err := tx.Exec(`
			INSERT INTO ot_bill_stock_allocs (bill_id, bill_line_id, item_id, ot_batch_id, qty)
			VALUES (?, ?, ?, ?, ?)
		`, billID, lineID, itemID, t.id, use); err != nil {
			return fmt.Errorf("alloc failed")
		}
		remaining -= use
	}
	return nil
}

func restoreOtBillStock(tx *sql.Tx, billID int64, billNo, voidReason string, actorUserID int64) error {
	rows, err := tx.Query(`
		SELECT item_id, ot_batch_id, qty FROM ot_bill_stock_allocs WHERE bill_id = ? ORDER BY id
	`, billID)
	if err != nil {
		return fmt.Errorf("allocs load failed")
	}
	type alloc struct {
		itemID, batchID, qty int64
	}
	allocs := make([]alloc, 0)
	for rows.Next() {
		var a alloc
		if err := rows.Scan(&a.itemID, &a.batchID, &a.qty); err != nil {
			rows.Close()
			return fmt.Errorf("alloc scan failed")
		}
		allocs = append(allocs, a)
	}
	rows.Close()

	reason := fmt.Sprintf("void %s: %s", billNo, voidReason)
	for _, a := range allocs {
		res, err := tx.Exec(`
			UPDATE ot_batches SET qty = qty + ?, updated_at = datetime('now') WHERE id = ?
		`, a.qty, a.batchID)
		if err != nil {
			return fmt.Errorf("stock restore failed")
		}
		affected, _ := res.RowsAffected()
		if affected == 0 {
			return fmt.Errorf("stock restore failed")
		}
		if _, err := tx.Exec(`
			INSERT INTO ot_stock_movements (item_id, ot_batch_id, movement_type, qty_delta, reason, actor_user_id)
			VALUES (?, ?, 'VOID', ?, ?, ?)
		`, a.itemID, a.batchID, a.qty, reason, actorUserID); err != nil {
			return fmt.Errorf("movement failed")
		}
	}
	return nil
}

func nullStringPtr(v sql.NullString) *string {
	if !v.Valid || v.String == "" {
		return nil
	}
	s := v.String
	return &s
}
