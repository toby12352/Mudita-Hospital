package handlers

import (
	"database/sql"
	"fmt"
)

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

// moveMainBatchToOt moves qty from one MAIN batch into the OT cupboard.
// Batch number and expiry are copied as stored, including blanks.
// pharmacyBillID is stored on the stock_transfers row when the move belongs to a slip.
func moveMainBatchToOt(tx *sql.Tx, batchID, qty, actorUserID int64, pharmacyBillID *int64, reason string) (stockTransfer, error) {
	if qty <= 0 {
		return stockTransfer{}, fmt.Errorf("qty must be > 0")
	}
	var itemID, onHand int64
	var loc, batchNo string
	var expiry sql.NullString
	err := tx.QueryRow(`
		SELECT item_id, location_code, batch_no, expiry_date, qty
		FROM item_batches WHERE id = ?
	`, batchID).Scan(&itemID, &loc, &batchNo, &expiry, &onHand)
	if err == sql.ErrNoRows {
		return stockTransfer{}, fmt.Errorf("batch not found")
	}
	if err != nil {
		return stockTransfer{}, fmt.Errorf("batch load failed")
	}
	if loc != "MAIN" {
		return stockTransfer{}, fmt.Errorf("batch is not at MAIN")
	}
	if qty > onHand {
		return stockTransfer{}, fmt.Errorf("insufficient MAIN stock")
	}

	res, err := tx.Exec(`
		UPDATE item_batches
		SET qty = qty - ?, updated_at = datetime('now')
		WHERE id = ? AND location_code = 'MAIN' AND qty >= ?
	`, qty, batchID, qty)
	if err != nil {
		return stockTransfer{}, fmt.Errorf("transfer failed")
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		return stockTransfer{}, fmt.Errorf("insufficient MAIN stock")
	}

	if _, err := tx.Exec(`
		INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
		VALUES (?, ?, 'MAIN', 'TRANSFER', ?, ?, ?)
	`, itemID, batchID, -qty, reason, actorUserID); err != nil {
		return stockTransfer{}, fmt.Errorf("movement failed")
	}

	exp := nullStringPtr(expiry)
	otBatchID, err := findOrCreateOtBatch(tx, itemID, batchNo, exp, qty)
	if err != nil {
		return stockTransfer{}, fmt.Errorf("ot batch failed")
	}
	if _, err := tx.Exec(`
		INSERT INTO ot_stock_movements (item_id, ot_batch_id, movement_type, qty_delta, reason, actor_user_id)
		VALUES (?, ?, 'TRANSFER_IN', ?, ?, ?)
	`, itemID, otBatchID, qty, reason, actorUserID); err != nil {
		return stockTransfer{}, fmt.Errorf("ot movement failed")
	}

	tres, err := tx.Exec(`
		INSERT INTO stock_transfers (
			direction, item_id, pharmacy_batch_id, ot_batch_id, batch_no, expiry_date, qty,
			actor_user_id, pharmacy_bill_id
		) VALUES ('TO_OT', ?, ?, ?, ?, ?, ?, ?, ?)
	`, itemID, batchID, otBatchID, batchNo, exp, qty, actorUserID, pharmacyBillID)
	if err != nil {
		return stockTransfer{}, fmt.Errorf("transfer record failed")
	}
	transferID, _ := tres.LastInsertId()

	var otQty int64
	if err := tx.QueryRow(`SELECT qty FROM ot_batches WHERE id = ?`, otBatchID).Scan(&otQty); err != nil {
		return stockTransfer{}, fmt.Errorf("ot qty failed")
	}

	return stockTransfer{
		ID:              transferID,
		Direction:       "TO_OT",
		ItemID:          itemID,
		PharmacyBatchID: batchID,
		OtBatchID:       otBatchID,
		BatchNo:         batchNo,
		ExpiryDate:      exp,
		Qty:             qty,
		PharmacyQty:     onHand - qty,
		OtQty:           otQty,
	}, nil
}

// transferSaleableMainToOt takes saleable MAIN qty the same way a pharmacy sale does
// and moves each slice into the OT cupboard.
func transferSaleableMainToOt(tx *sql.Tx, billID, lineID, itemID, qty, actorUserID int64, billNo string) error {
	if qty <= 0 {
		return fmt.Errorf("qty must be > 0")
	}
	rows, err := tx.Query(unexpiredBatchSQL("id, qty"), itemID, "MAIN", localToday())
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
		return fmt.Errorf("insufficient stock for %s (need %d, have %d)", code, qty, total)
	}

	remaining := qty
	reason := fmt.Sprintf("Transfer to OT %s line %d", billNo, lineID)
	billRef := billID
	for _, t := range takes {
		if remaining == 0 {
			break
		}
		use := t.qty
		if use > remaining {
			use = remaining
		}
		moved, err := moveMainBatchToOt(tx, t.id, use, actorUserID, &billRef, reason)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`
			INSERT INTO pharmacy_bill_stock_allocs (bill_id, bill_line_id, item_id, batch_id, qty)
			VALUES (?, ?, ?, ?, ?)
		`, billID, lineID, itemID, moved.PharmacyBatchID, use); err != nil {
			return fmt.Errorf("alloc failed")
		}
		remaining -= use
	}
	return nil
}

// reverseTransfersForBill puts a confirmed Transfer to OT slip back:
// OT cupboard down, the same MAIN batch up. Fails when the cupboard no longer holds the qty.
func reverseTransfersForBill(tx *sql.Tx, billID, actorUserID int64, reason string) error {
	rows, err := tx.Query(`
		SELECT item_id, pharmacy_batch_id, ot_batch_id, batch_no, expiry_date, qty
		FROM stock_transfers
		WHERE pharmacy_bill_id = ? AND direction = 'TO_OT'
		ORDER BY id ASC
	`, billID)
	if err != nil {
		return fmt.Errorf("transfer load failed")
	}
	type row struct {
		itemID          int64
		pharmacyBatchID sql.NullInt64
		otBatchID       sql.NullInt64
		batchNo         string
		expiry          sql.NullString
		qty             int64
	}
	list := make([]row, 0)
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.itemID, &r.pharmacyBatchID, &r.otBatchID, &r.batchNo, &r.expiry, &r.qty); err != nil {
			rows.Close()
			return fmt.Errorf("transfer scan failed")
		}
		list = append(list, r)
	}
	rows.Close()
	if len(list) == 0 {
		return fmt.Errorf("cannot void transfer: no cupboard rows for this slip")
	}

	for _, r := range list {
		if !r.otBatchID.Valid {
			return fmt.Errorf("cannot void transfer: OT batch is missing")
		}
		var have int64
		err := tx.QueryRow(`SELECT qty FROM ot_batches WHERE id = ?`, r.otBatchID.Int64).Scan(&have)
		if err == sql.ErrNoRows {
			return fmt.Errorf("cannot void transfer: OT batch is missing")
		}
		if err != nil {
			return fmt.Errorf("ot batch load failed")
		}
		if have < r.qty {
			return fmt.Errorf("cannot void transfer: OT batch has %d, need to remove %d", have, r.qty)
		}
		res, err := tx.Exec(`
			UPDATE ot_batches SET qty = qty - ?, updated_at = datetime('now')
			WHERE id = ? AND qty >= ?
		`, r.qty, r.otBatchID.Int64, r.qty)
		if err != nil {
			return fmt.Errorf("ot reverse failed")
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			return fmt.Errorf("cannot void transfer: OT batch has %d, need to remove %d", have, r.qty)
		}
		if _, err := tx.Exec(`
			INSERT INTO ot_stock_movements (item_id, ot_batch_id, movement_type, qty_delta, reason, actor_user_id)
			VALUES (?, ?, 'TRANSFER_OUT', ?, ?, ?)
		`, r.itemID, r.otBatchID.Int64, -r.qty, reason, actorUserID); err != nil {
			return fmt.Errorf("ot movement failed")
		}

		pharmacyBatchID := int64(0)
		if r.pharmacyBatchID.Valid {
			var exists int
			if err := tx.QueryRow(`SELECT COUNT(1) FROM item_batches WHERE id = ?`, r.pharmacyBatchID.Int64).Scan(&exists); err != nil {
				return fmt.Errorf("batch load failed")
			}
			if exists == 1 {
				if _, err := tx.Exec(`
					UPDATE item_batches SET qty = qty + ?, updated_at = datetime('now') WHERE id = ?
				`, r.qty, r.pharmacyBatchID.Int64); err != nil {
					return fmt.Errorf("stock restore failed")
				}
				pharmacyBatchID = r.pharmacyBatchID.Int64
			}
		}
		if pharmacyBatchID == 0 {
			id, err := findOrCreateBatch(tx, r.itemID, "MAIN", r.batchNo, nullStringPtr(r.expiry), r.qty)
			if err != nil {
				return fmt.Errorf("stock restore failed")
			}
			pharmacyBatchID = id
		}
		if _, err := tx.Exec(`
			INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
			VALUES (?, ?, 'MAIN', 'TRANSFER', ?, ?, ?)
		`, r.itemID, pharmacyBatchID, r.qty, reason, actorUserID); err != nil {
			return fmt.Errorf("movement failed")
		}
	}
	return nil
}
