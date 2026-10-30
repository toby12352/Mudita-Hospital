package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

// pharmacyPurchaseBill is a hospital stock purchase slip (PU-######).
// total_mmk is the sum of typed line totals (money out). Confirm credits MAIN,
// updates catalog buy_price_mmk from the unit price, and leaves sell_price_mmk alone.
type pharmacyPurchaseBill struct {
	ID              int64                      `json:"id"`
	BillNo          string                     `json:"bill_no"`
	SupplierName    string                     `json:"supplier_name"`
	Description     string                     `json:"description"`
	Status          string                     `json:"status"`
	TotalMMK        int64                      `json:"total_mmk"`
	PrintedAt       *string                    `json:"printed_at,omitempty"`
	PaidAt          *string                    `json:"paid_at,omitempty"`
	PaidByUserID    *int64                     `json:"paid_by_user_id,omitempty"`
	VoidedAt        *string                    `json:"voided_at,omitempty"`
	VoidedByUserID  *int64                     `json:"voided_by_user_id,omitempty"`
	VoidReason      string                     `json:"void_reason,omitempty"`
	CreatedByUserID *int64                     `json:"created_by_user_id,omitempty"`
	CreatedAt       string                     `json:"created_at"`
	UpdatedAt       string                     `json:"updated_at"`
	Lines           []pharmacyPurchaseBillLine `json:"lines,omitempty"`
}

type pharmacyPurchaseBillLine struct {
	ID           int64   `json:"id,omitempty"`
	ItemID       int64   `json:"item_id"`
	Code         string  `json:"code"`
	Description  string  `json:"description"`
	Qty          int64   `json:"qty"`
	Unit         string  `json:"unit"`
	LineTotalMMK int64   `json:"line_total_mmk"`
	ExpiryDate   *string `json:"expiry_date,omitempty"`
	StockQty     int64   `json:"stock_qty"`
	StockUnit    string  `json:"stock_unit"`
	SortOrder    int     `json:"sort_order"`
}

type pharmacyPurchaseBillWriteRequest struct {
	SupplierName string                           `json:"supplier_name"`
	Description  string                           `json:"description"`
	Lines        []pharmacyPurchaseBillLineInput `json:"lines"`
}

type pharmacyPurchaseBillLineInput struct {
	ItemID       int64  `json:"item_id"`
	Qty          int64  `json:"qty"`
	Unit         string `json:"unit"`
	LineTotalMMK int64  `json:"line_total_mmk"`
	ExpiryDate   string `json:"expiry_date"`
}

const pharmacyPurchaseBillColumns = `
	id, bill_no, supplier_name, description, status, total_mmk,
	printed_at, paid_at, paid_by_user_id,
	voided_at, voided_by_user_id, void_reason,
	created_by_user_id, created_at, updated_at`

func pharmacyPurchaseBillID(path, suffix string) (int64, bool) {
	rest := strings.TrimPrefix(path, "/purchase-bills/")
	if suffix != "" {
		rest = strings.TrimSuffix(rest, suffix)
	}
	return parseID("/" + rest)
}

func (h *Pharmacy) listPharmacyPurchaseBills(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	if status != "" && status != "draft" && status != "paid" && status != "void" && status != "deleted" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid status"})
		return
	}

	query := `SELECT ` + pharmacyPurchaseBillColumns + ` FROM pharmacy_purchase_bills`
	args := make([]any, 0, 4)
	where := make([]string, 0)
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if q != "" {
		like := "%" + q + "%"
		where = append(where, "(bill_no LIKE ? OR supplier_name LIKE ?)")
		args = append(args, like, like)
	}
	var errMsg string
	where, args, errMsg = appendBillHistoryFilters(where, args, r, "status", "printed_at", "created_at", "")
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	orderSQL, orderErr := billHistoryOrderBy(r, "created_at", "id")
	if orderErr != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": orderErr})
		return
	}
	query += orderSQL

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	out := make([]pharmacyPurchaseBill, 0)
	for rows.Next() {
		b, err := scanPharmacyPurchaseBill(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"bills": out})
}

func (h *Pharmacy) createPharmacyPurchaseBill(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	var req pharmacyPurchaseBillWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	lines, total, errMsg := normalizePharmacyPurchaseLines(tx, req.Lines)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	billNo, err := nextPharmacyPurchaseBillNo(tx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "bill number failed"})
		return
	}

	uid := user.ID
	res, err := tx.Exec(`
		INSERT INTO pharmacy_purchase_bills (
			bill_no, supplier_name, description, status, total_mmk, created_by_user_id
		) VALUES (?, ?, ?, 'draft', ?, ?)
	`, billNo, strings.TrimSpace(req.SupplierName), strings.TrimSpace(req.Description), total, uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	billID, _ := res.LastInsertId()
	if err := insertPharmacyPurchaseBillLines(tx, billID, lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "create", "pharmacy_purchase_bill", &billID, map[string]any{
		"bill_no": billNo, "total_mmk": total,
	})

	bill, err := loadPharmacyPurchaseBill(h.DB, billID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, bill)
}

func (h *Pharmacy) getPharmacyPurchaseBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := pharmacyPurchaseBillID(path, "")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	bill, err := loadPharmacyPurchaseBill(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) updatePharmacyPurchaseBill(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	id, ok := pharmacyPurchaseBillID(path, "")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req pharmacyPurchaseBillWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status string
	err = tx.QueryRow(`SELECT status FROM pharmacy_purchase_bills WHERE id = ?`, id).Scan(&status)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be updated"})
		return
	}

	lines, total, errMsg := normalizePharmacyPurchaseLines(tx, req.Lines)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	if _, err := tx.Exec(`
		UPDATE pharmacy_purchase_bills
		SET supplier_name = ?, description = ?, total_mmk = ?, updated_at = datetime('now')
		WHERE id = ? AND status = 'draft'
	`, strings.TrimSpace(req.SupplierName), strings.TrimSpace(req.Description), total, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	if _, err := tx.Exec(`DELETE FROM pharmacy_purchase_bill_lines WHERE bill_id = ?`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines clear failed"})
		return
	}
	if err := insertPharmacyPurchaseBillLines(tx, id, lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "pharmacy_purchase_bill", &id, map[string]any{"total_mmk": total})

	bill, err := loadPharmacyPurchaseBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) markPharmacyPurchaseBillPrinted(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := pharmacyPurchaseBillID(path, "/printed")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		UPDATE pharmacy_purchase_bills
		SET printed_at = ?, updated_at = datetime('now')
		WHERE id = ? AND status = 'draft'
	`, localCivilNow(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "print stamp failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		var status string
		err = tx.QueryRow(`SELECT status FROM pharmacy_purchase_bills WHERE id = ?`, id).Scan(&status)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
			return
		}
		if status != "draft" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be marked printed"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	bill, err := loadPharmacyPurchaseBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) payPharmacyPurchaseBill(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	id, ok := pharmacyPurchaseBillID(path, "/pay")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, billNo string
	err = tx.QueryRow(`SELECT status, bill_no FROM pharmacy_purchase_bills WHERE id = ?`, id).Scan(&status, &billNo)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be paid"})
		return
	}

	lines, err := loadPharmacyPurchaseBillLinesTx(tx, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines load failed"})
		return
	}
	if len(lines) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bill has no lines"})
		return
	}

	uid := user.ID
	// Last non-zero line total for an item wins the catalog buy price.
	buyByItem := make(map[int64]int64)
	for _, line := range lines {
		if err := creditPharmacyPurchase(tx, id, line, billNo, uid); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if line.LineTotalMMK <= 0 || line.Qty <= 0 {
			continue
		}
		pack, err := loadItemPackTx(tx, line.ItemID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "item load failed"})
			return
		}
		outer, errMsg := buyOuterFromPurchaseLine(pack, line.Unit, line.Qty, line.LineTotalMMK)
		if errMsg != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
			return
		}
		buyByItem[line.ItemID] = outer
	}
	for itemID, buy := range buyByItem {
		if _, err := tx.Exec(`
			UPDATE items SET buy_price_mmk = ?, updated_at = datetime('now') WHERE id = ?
		`, buy, itemID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "price update failed"})
			return
		}
	}

	paidAt := localCivilNow()
	res, err := tx.Exec(`
		UPDATE pharmacy_purchase_bills
		SET status = 'paid', paid_at = ?, paid_by_user_id = ?, updated_at = datetime('now')
		WHERE id = ? AND status = 'draft'
	`, paidAt, uid, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pay failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be paid"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "pay", "pharmacy_purchase_bill", &id, map[string]any{
		"method": "purchase", "bill_no": billNo,
	})

	bill, err := loadPharmacyPurchaseBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) voidPharmacyPurchaseBill(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	id, ok := pharmacyPurchaseBillID(path, "/void")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req voidRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "reason required"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, billNo string
	err = tx.QueryRow(`SELECT status, bill_no FROM pharmacy_purchase_bills WHERE id = ?`, id).Scan(&status, &billNo)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if rejectDeletedBill(w, status) {
		return
	}
	if status == "void" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "already void"})
		return
	}

	uid := user.ID
	if status == "paid" {
		rows, err := tx.Query(`
			SELECT id, item_id, batch_id, qty FROM pharmacy_purchase_stock_allocs WHERE bill_id = ?
		`, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "allocs load failed"})
			return
		}
		type alloc struct {
			id, itemID, batchID, qty int64
		}
		allocs := make([]alloc, 0)
		for rows.Next() {
			var a alloc
			if err := rows.Scan(&a.id, &a.itemID, &a.batchID, &a.qty); err != nil {
				rows.Close()
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
				return
			}
			allocs = append(allocs, a)
		}
		rows.Close()

		reason := fmt.Sprintf("void %s: %s", billNo, req.Reason)
		for _, a := range allocs {
			var have int64
			if err := tx.QueryRow(`SELECT qty FROM item_batches WHERE id = ?`, a.batchID).Scan(&have); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "batch load failed"})
				return
			}
			if have < a.qty {
				writeJSON(w, http.StatusBadRequest, map[string]string{
					"error": fmt.Sprintf("cannot void purchase: batch has %d, need to remove %d", have, a.qty),
				})
				return
			}
			if _, err := tx.Exec(`
				UPDATE item_batches SET qty = qty - ?, updated_at = datetime('now') WHERE id = ?
			`, a.qty, a.batchID); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "stock reverse failed"})
				return
			}
			if _, err := tx.Exec(`
				INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
				VALUES (?, ?, 'MAIN', 'ADJUST', ?, ?, ?)
			`, a.itemID, a.batchID, -a.qty, reason, uid); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
				return
			}
		}
	}

	if _, err := tx.Exec(`
		UPDATE pharmacy_purchase_bills SET status = 'void', voided_at = datetime('now'), voided_by_user_id = ?,
			void_reason = ?, updated_at = datetime('now')
		WHERE id = ?
	`, uid, req.Reason, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "void failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "void", "pharmacy_purchase_bill", &id, map[string]any{
		"bill_no": billNo, "reason": req.Reason,
	})

	bill, err := loadPharmacyPurchaseBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Pharmacy) purgePharmacyPurchaseBill(w http.ResponseWriter, r *http.Request, path string) {
	user, ok := requireAdminUser(w, r)
	if !ok {
		return
	}
	id, ok := pharmacyPurchaseBillID(path, "")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, billNo string
	var totalMMK int64
	err = tx.QueryRow(`SELECT status, bill_no, total_mmk FROM pharmacy_purchase_bills WHERE id = ?`, id).
		Scan(&status, &billNo, &totalMMK)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if rejectPurgeStatus(w, status) {
		return
	}
	res, err := tx.Exec(`
		UPDATE pharmacy_purchase_bills SET status = 'deleted', updated_at = datetime('now') WHERE id = ?
	`, id)
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

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "delete", "pharmacy_purchase_bill", &id, map[string]any{
		"bill_no": billNo, "was_status": status, "status": "deleted", "total_mmk": totalMMK,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Pharmacy) printPharmacyPurchaseBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := pharmacyPurchaseBillID(path, "/print")
	if !ok {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	bill, err := loadPharmacyPurchaseBill(h.DB, id)
	if err == sql.ErrNoRows {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "load failed", http.StatusInternalServerError)
		return
	}

	hosp, err := loadHospitalSettings(h.DB)
	if err != nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}

	dateLabel := receiptDateLabel(bill.CreatedAt, nil, bill.PaidAt)
	lines := make([]receiptLine, 0, len(bill.Lines))
	for _, line := range bill.Lines {
		desc := line.Description
		if line.Unit != "" {
			desc = fmt.Sprintf("%s (%s)", line.Description, line.Unit)
		}
		if line.ExpiryDate != nil && strings.TrimSpace(*line.ExpiryDate) != "" {
			desc = fmt.Sprintf("%s · exp %s", desc, *line.ExpiryDate)
		}
		unitPrice := int64(0)
		if line.Qty > 0 {
			unitPrice = int64(math.Round(float64(line.LineTotalMMK) / float64(line.Qty)))
		}
		lines = append(lines, receiptLine{
			Code:        line.Code,
			Description: desc,
			Qty:         line.Qty,
			Unit:        line.Unit,
			UnitPrice:   unitPrice,
			LineTotal:   line.LineTotalMMK,
		})
	}
	printedAt := ""
	if bill.PrintedAt != nil {
		printedAt = *bill.PrintedAt
	}
	payee := strings.TrimSpace(bill.SupplierName)
	if payee == "" {
		payee = "Pharmacy purchase"
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderThermalReceiptHTML(hosp, receiptBill{
		Title:          "PURCHASE BILL",
		BillNo:         bill.BillNo,
		Status:         bill.Status,
		PrintedAt:      printedAt,
		PortalLabel:    "Pharmacy",
		PayeeName:      payee,
		Note:           bill.Description,
		DateLabel:      dateLabel,
		TotalMMK:       bill.TotalMMK,
		NetMMK:         bill.TotalMMK,
		ShowSettlement: true,
		VoidReason:     bill.VoidReason,
		Lines:          lines,
	})))
}

func nextPharmacyPurchaseBillNo(tx *sql.Tx) (string, error) {
	var n int64
	err := tx.QueryRow(`SELECT next_num FROM pharmacy_purchase_bill_number_seq WHERE id = 1`).Scan(&n)
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(`UPDATE pharmacy_purchase_bill_number_seq SET next_num = next_num + 1 WHERE id = 1`); err != nil {
		return "", err
	}
	return fmt.Sprintf("PU-%06d", n), nil
}

func normalizePharmacyPurchaseLines(q queryRower, in []pharmacyPurchaseBillLineInput) ([]pharmacyPurchaseBillLine, int64, string) {
	if len(in) == 0 {
		return nil, 0, "at least one line"
	}
	out := make([]pharmacyPurchaseBillLine, 0, len(in))
	var total int64
	for i, raw := range in {
		if raw.ItemID <= 0 {
			return nil, 0, "item_id required"
		}
		if raw.Qty <= 0 {
			return nil, 0, "qty must be > 0"
		}
		if raw.LineTotalMMK < 0 {
			return nil, 0, "line_total_mmk must be >= 0"
		}
		unit := strings.TrimSpace(raw.Unit)
		if unit == "" {
			return nil, 0, "unit required"
		}
		expiry, err := normalizeExpiry(raw.ExpiryDate)
		if err != nil {
			return nil, 0, "expiry_date must be YYYY-MM-DD"
		}

		var code, name, stockUnit string
		var pack itemPack
		var active int
		err = q.QueryRow(`
			SELECT code, name, stock_unit, active,
			       pack_l1_qty, pack_l1_unit, pack_l2_qty, pack_l2_unit, pack_l3_qty, pack_l3_unit,
			       pack_l4_qty, pack_l4_unit, pack_l5_qty, pack_l5_unit, pack_l6_qty, pack_l6_unit
			FROM items WHERE id = ?
		`, raw.ItemID).Scan(
			&code, &name, &stockUnit, &active,
			&pack.L1Qty, &pack.L1Unit, &pack.L2Qty, &pack.L2Unit, &pack.L3Qty, &pack.L3Unit,
			&pack.L4Qty, &pack.L4Unit, &pack.L5Qty, &pack.L5Unit, &pack.L6Qty, &pack.L6Unit,
		)
		if err == sql.ErrNoRows {
			return nil, 0, "item not found"
		}
		if err != nil {
			return nil, 0, "item load failed"
		}
		if active != 1 {
			return nil, 0, "item inactive"
		}
		pack = padPackTail(pack)
		factor, canonical, ok := saleUnitFactor(pack, unit)
		if !ok || factor < 1 {
			return nil, 0, "unknown unit"
		}
		if raw.Qty > math.MaxInt64/factor {
			return nil, 0, "quantity too large"
		}
		stockQty := raw.Qty * factor
		if stockUnit == "" {
			stockUnit = "Piece"
		}
		if total > math.MaxInt64-raw.LineTotalMMK {
			return nil, 0, "total too large"
		}
		total += raw.LineTotalMMK
		out = append(out, pharmacyPurchaseBillLine{
			ItemID:       raw.ItemID,
			Code:         code,
			Description:  name,
			Qty:          raw.Qty,
			Unit:         canonical,
			LineTotalMMK: raw.LineTotalMMK,
			ExpiryDate:   expiry,
			StockQty:     stockQty,
			StockUnit:    stockUnit,
			SortOrder:    i,
		})
	}
	return out, total, ""
}

func insertPharmacyPurchaseBillLines(tx *sql.Tx, billID int64, lines []pharmacyPurchaseBillLine) error {
	for _, l := range lines {
		if _, err := tx.Exec(`
			INSERT INTO pharmacy_purchase_bill_lines (
				bill_id, item_id, code, description, qty, unit, line_total_mmk,
				expiry_date, stock_qty, stock_unit, sort_order
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, billID, l.ItemID, l.Code, l.Description, l.Qty, l.Unit, l.LineTotalMMK,
			l.ExpiryDate, l.StockQty, l.StockUnit, l.SortOrder); err != nil {
			return err
		}
	}
	return nil
}

func creditPharmacyPurchase(tx *sql.Tx, billID int64, line pharmacyPurchaseBillLine, billNo string, actorUserID int64) error {
	if line.StockQty <= 0 {
		return fmt.Errorf("stock qty must be > 0")
	}
	batchID, err := findOrCreateBatch(tx, line.ItemID, "MAIN", "", line.ExpiryDate, line.StockQty)
	if err != nil {
		return fmt.Errorf("stock credit failed")
	}
	reason := fmt.Sprintf("%s purchase line %d", billNo, line.ID)
	if _, err := tx.Exec(`
		INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
		VALUES (?, ?, 'MAIN', 'PURCHASE', ?, ?, ?)
	`, line.ItemID, batchID, line.StockQty, reason, actorUserID); err != nil {
		return fmt.Errorf("movement failed")
	}
	if _, err := tx.Exec(`
		INSERT INTO pharmacy_purchase_stock_allocs (bill_id, bill_line_id, item_id, batch_id, qty)
		VALUES (?, ?, ?, ?, ?)
	`, billID, line.ID, line.ItemID, batchID, line.StockQty); err != nil {
		return fmt.Errorf("alloc failed")
	}
	return nil
}

// buyOuterFromPurchaseLine turns a typed line total into the catalog outer (L1) buy price.
// Unit price is half-up of total/qty; that price is spread across packing like pricesFromUnit.
func buyOuterFromPurchaseLine(pack itemPack, unit string, qty, lineTotal int64) (int64, string) {
	if qty <= 0 {
		return 0, "qty must be > 0"
	}
	if lineTotal <= 0 {
		return 0, ""
	}
	unitPrice := int64(math.Round(float64(lineTotal) / float64(qty)))
	levels := visiblePackLevels(pack)
	if len(levels) == 0 {
		return 0, "pack missing"
	}
	var anchorFactor int64
	found := false
	for _, lv := range levels {
		if strings.EqualFold(lv.Unit, unit) {
			anchorFactor = lv.Factor
			found = true
			break
		}
	}
	if !found || anchorFactor < 1 {
		return 0, "unknown unit"
	}
	outerFactor := levels[0].Factor
	if outerFactor < 1 {
		outerFactor = 1
	}
	return int64(math.Round(float64(unitPrice) * float64(outerFactor) / float64(anchorFactor))), ""
}

func loadItemPackTx(tx *sql.Tx, itemID int64) (itemPack, error) {
	var pack itemPack
	err := tx.QueryRow(`
		SELECT pack_l1_qty, pack_l1_unit, pack_l2_qty, pack_l2_unit, pack_l3_qty, pack_l3_unit,
		       pack_l4_qty, pack_l4_unit, pack_l5_qty, pack_l5_unit, pack_l6_qty, pack_l6_unit
		FROM items WHERE id = ?
	`, itemID).Scan(
		&pack.L1Qty, &pack.L1Unit, &pack.L2Qty, &pack.L2Unit, &pack.L3Qty, &pack.L3Unit,
		&pack.L4Qty, &pack.L4Unit, &pack.L5Qty, &pack.L5Unit, &pack.L6Qty, &pack.L6Unit,
	)
	if err != nil {
		return itemPack{}, err
	}
	return padPackTail(pack), nil
}

func loadPharmacyPurchaseBill(db *sql.DB, id int64) (pharmacyPurchaseBill, error) {
	row := db.QueryRow(`SELECT `+pharmacyPurchaseBillColumns+` FROM pharmacy_purchase_bills WHERE id = ?`, id)
	bill, err := scanPharmacyPurchaseBill(row)
	if err != nil {
		return bill, err
	}
	lines, err := loadPharmacyPurchaseBillLines(db, id)
	if err != nil {
		return bill, err
	}
	bill.Lines = lines
	return bill, nil
}

func loadPharmacyPurchaseBillLines(db *sql.DB, billID int64) ([]pharmacyPurchaseBillLine, error) {
	rows, err := db.Query(`
		SELECT id, item_id, code, description, qty, unit, line_total_mmk,
		       expiry_date, stock_qty, stock_unit, sort_order
		FROM pharmacy_purchase_bill_lines
		WHERE bill_id = ?
		ORDER BY sort_order ASC, id ASC
	`, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPharmacyPurchaseBillLines(rows)
}

func loadPharmacyPurchaseBillLinesTx(tx *sql.Tx, billID int64) ([]pharmacyPurchaseBillLine, error) {
	rows, err := tx.Query(`
		SELECT id, item_id, code, description, qty, unit, line_total_mmk,
		       expiry_date, stock_qty, stock_unit, sort_order
		FROM pharmacy_purchase_bill_lines
		WHERE bill_id = ?
		ORDER BY sort_order ASC, id ASC
	`, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPharmacyPurchaseBillLines(rows)
}

func scanPharmacyPurchaseBillLines(rows *sql.Rows) ([]pharmacyPurchaseBillLine, error) {
	out := make([]pharmacyPurchaseBillLine, 0)
	for rows.Next() {
		var l pharmacyPurchaseBillLine
		var expiry sql.NullString
		if err := rows.Scan(
			&l.ID, &l.ItemID, &l.Code, &l.Description, &l.Qty, &l.Unit, &l.LineTotalMMK,
			&expiry, &l.StockQty, &l.StockUnit, &l.SortOrder,
		); err != nil {
			return nil, err
		}
		if expiry.Valid && strings.TrimSpace(expiry.String) != "" {
			s := expiry.String
			l.ExpiryDate = &s
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

type purchaseBillScanner interface {
	Scan(dest ...any) error
}

func scanPharmacyPurchaseBill(row purchaseBillScanner) (pharmacyPurchaseBill, error) {
	var b pharmacyPurchaseBill
	var printed, paid, voided sql.NullString
	var paidBy, voidedBy, createdBy sql.NullInt64
	err := row.Scan(
		&b.ID, &b.BillNo, &b.SupplierName, &b.Description, &b.Status, &b.TotalMMK,
		&printed, &paid, &paidBy,
		&voided, &voidedBy, &b.VoidReason,
		&createdBy, &b.CreatedAt, &b.UpdatedAt,
	)
	if err != nil {
		return b, err
	}
	if printed.Valid && printed.String != "" {
		s := printed.String
		b.PrintedAt = &s
	}
	if paid.Valid && paid.String != "" {
		s := paid.String
		b.PaidAt = &s
	}
	if voided.Valid && voided.String != "" {
		s := voided.String
		b.VoidedAt = &s
	}
	if paidBy.Valid {
		v := paidBy.Int64
		b.PaidByUserID = &v
	}
	if voidedBy.Valid {
		v := voidedBy.Int64
		b.VoidedByUserID = &v
	}
	if createdBy.Valid {
		v := createdBy.Int64
		b.CreatedByUserID = &v
	}
	return b, nil
}
