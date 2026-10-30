package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// expenseBill is one hospital cost bill for a single desk.
// total_mmk is the sum of line totals before discount. Net is total_mmk - discount_mmk.
// Drafts are not cash. buildCashMovement reads paid rows on paid_at and posts the
// opposite net on the Asia/Yangon day of voided_at.
type expenseBill struct {
	ID              int64             `json:"id"`
	BillNo          string            `json:"bill_no"`
	Portal          string            `json:"portal"`
	Name            string            `json:"name"`
	Description     string            `json:"description"`
	Status          string            `json:"status"`
	TotalMMK        int64             `json:"total_mmk"`
	DiscountValue   int64             `json:"discount_value"`
	DiscountUnit    string            `json:"discount_unit"`
	DiscountMMK     int64             `json:"discount_mmk"`
	PaidAt          *string           `json:"paid_at,omitempty"`
	PaidByUserID    *int64            `json:"paid_by_user_id,omitempty"`
	PrintedAt       *string           `json:"printed_at,omitempty"`
	VoidedAt        *string           `json:"voided_at,omitempty"`
	VoidedByUserID  *int64            `json:"voided_by_user_id,omitempty"`
	VoidReason      string            `json:"void_reason,omitempty"`
	CreatedByUserID *int64            `json:"created_by_user_id,omitempty"`
	CreatedAt       string            `json:"created_at"`
	UpdatedAt       string            `json:"updated_at"`
	BilledAt        *string           `json:"billed_at,omitempty"`
	Lines           []expenseBillLine `json:"lines,omitempty"`
}

type expenseBillLine struct {
	ID           int64  `json:"id,omitempty"`
	RefID        *int64 `json:"ref_id,omitempty"`
	Code         string `json:"code"`
	Description  string `json:"description"`
	Qty          int64  `json:"qty"`
	UnitPriceMMK int64  `json:"unit_price_mmk"`
	LineTotalMMK int64  `json:"line_total_mmk"`
	SortOrder    int    `json:"sort_order"`
}

type expenseBillWriteRequest struct {
	Portal        string                 `json:"portal"`
	Name          string                 `json:"name"`
	Description   string                 `json:"description"`
	DiscountValue int64                  `json:"discount_value"`
	DiscountUnit  string                 `json:"discount_unit"`
	Lines         []expenseBillLineInput `json:"lines"`
	BilledAt      string                 `json:"billed_at,omitempty"`
}

// expenseBillLineInput keeps qty and unit_price_mmk raw so a fractional JSON
// number is rejected as a non-integer instead of being truncated.
// Description is used when ref_id is omitted (typed particular). A present
// ref_id still copies code and name from the expense catalog.
type expenseBillLineInput struct {
	RefID        json.RawMessage `json:"ref_id"`
	Description  string          `json:"description"`
	Qty          json.RawMessage `json:"qty"`
	UnitPriceMMK json.RawMessage `json:"unit_price_mmk"`
}

const expenseBillColumns = `
	id, bill_no, portal, name, description, status, total_mmk,
	discount_value, discount_unit, discount_mmk,
	paid_at, paid_by_user_id, printed_at,
	voided_at, voided_by_user_id, void_reason,
	created_by_user_id, created_at, updated_at, billed_at`

func (h *Expenses) listExpenseBills(w http.ResponseWriter, r *http.Request) {
	_, portal, ok := h.allowPortal(w, r, r.URL.Query().Get("portal"), auth.ActionRead)
	if !ok {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	if status != "" && status != "draft" && status != "paid" && status != "void" && status != "deleted" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid status"})
		return
	}

	query := `SELECT ` + expenseBillColumns + ` FROM expense_bills`
	args := make([]any, 0, 4)
	where := []string{"portal = ?"}
	args = append(args, portal)
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if q != "" {
		like := "%" + q + "%"
		where = append(where, "(bill_no LIKE ? OR name LIKE ?)")
		args = append(args, like, like)
	}
	var errMsg string
	where, args, errMsg = appendBillHistoryFilters(where, args, r, "status", "printed_at", "created_at", "")
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	query += " WHERE " + strings.Join(where, " AND ")
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

	out := make([]expenseBill, 0)
	for rows.Next() {
		b, err := scanExpenseBill(rows)
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

func (h *Expenses) createExpenseBill(w http.ResponseWriter, r *http.Request) {
	var req expenseBillWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	user, portal, ok := h.allowPortal(w, r, req.Portal, auth.ActionCreate)
	if !ok {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}
	override, status, errMsg := parseAdminBilledAt(user.Role, req.BilledAt)
	if errMsg != "" {
		writeJSON(w, status, map[string]string{"error": errMsg})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	lines, gross, discountMMK, discountUnit, errMsg := expenseBillAmounts(tx, req)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	billNo, err := nextExpenseBillNo(tx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "bill number failed"})
		return
	}

	uid := user.ID
	var res sql.Result
	if override != nil {
		res, err = tx.Exec(`
			INSERT INTO expense_bills (
				bill_no, portal, name, description, status, total_mmk,
				discount_value, discount_unit, discount_mmk, created_by_user_id,
				billed_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
		`, billNo, portal, req.Name, strings.TrimSpace(req.Description), gross,
			req.DiscountValue, discountUnit, discountMMK, uid,
			override.Yangon, override.UTC, override.UTC)
	} else {
		res, err = tx.Exec(`
			INSERT INTO expense_bills (
				bill_no, portal, name, description, status, total_mmk,
				discount_value, discount_unit, discount_mmk, created_by_user_id
			) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
		`, billNo, portal, req.Name, strings.TrimSpace(req.Description), gross,
			req.DiscountValue, discountUnit, discountMMK, uid)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	billID, _ := res.LastInsertId()
	if err := insertExpenseBillLines(tx, billID, lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	auditPayload := map[string]any{
		"bill_no": billNo, "portal": portal, "total_mmk": gross, "discount_mmk": discountMMK,
	}
	if override != nil {
		auditPayload["billed_at"] = override.Yangon
	}
	audit.WriteAudit(h.DB, &uid, "create", "expense_bill", &billID, auditPayload)

	bill, err := loadExpenseBill(h.DB, billID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, bill)
}

func (h *Expenses) getExpenseBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := expenseBillID(path, "")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if _, ok := h.guardExpenseBill(w, r, id, auth.ActionRead); !ok {
		return
	}
	bill, err := loadExpenseBill(h.DB, id)
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

func (h *Expenses) updateExpenseBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := expenseBillID(path, "")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	user, ok := h.guardExpenseBill(w, r, id, auth.ActionCreate)
	if !ok {
		return
	}

	var req expenseBillWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status string
	err = tx.QueryRow(`SELECT status FROM expense_bills WHERE id = ?`, id).Scan(&status)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if status != "draft" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be edited"})
		return
	}

	lines, gross, discountMMK, discountUnit, errMsg := expenseBillAmounts(tx, req)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	res, err := tx.Exec(`
		UPDATE expense_bills SET
			name = ?, description = ?, total_mmk = ?,
			discount_value = ?, discount_unit = ?, discount_mmk = ?,
			updated_at = datetime('now')
		WHERE id = ? AND status = 'draft'
	`, req.Name, strings.TrimSpace(req.Description), gross, req.DiscountValue, discountUnit, discountMMK, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only draft bills can be edited"})
		return
	}
	if _, err := tx.Exec(`DELETE FROM expense_bill_lines WHERE bill_id = ?`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines clear failed"})
		return
	}
	if err := insertExpenseBillLines(tx, id, lines); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines failed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "expense_bill", &id, map[string]any{
		"total_mmk": gross, "discount_mmk": discountMMK,
	})

	bill, err := loadExpenseBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Expenses) markExpenseBillPrinted(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := expenseBillID(path, "/printed")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	user, ok := h.guardExpenseBill(w, r, id, auth.ActionCreate)
	if !ok {
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		UPDATE expense_bills
		SET printed_at = ?, updated_at = datetime('now')
		WHERE id = ? AND status = 'draft' AND (printed_at IS NULL OR printed_at = '')
	`, localCivilNow(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "print stamp failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		var status string
		var printed sql.NullString
		err = tx.QueryRow(`SELECT status, printed_at FROM expense_bills WHERE id = ?`, id).Scan(&status, &printed)
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
		if err := tx.Commit(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
			return
		}
		bill, err := loadExpenseBill(h.DB, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
			return
		}
		writeJSON(w, http.StatusOK, bill)
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "print", "expense_bill", &id, nil)

	bill, err := loadExpenseBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Expenses) payExpenseBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := expenseBillID(path, "/pay")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	user, ok := h.guardExpenseBill(w, r, id, auth.ActionCreate)
	if !ok {
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var status, billNo string
	err = tx.QueryRow(`SELECT status, bill_no FROM expense_bills WHERE id = ?`, id).Scan(&status, &billNo)
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
	var lineCount int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM expense_bill_lines WHERE bill_id = ?`, id).Scan(&lineCount); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lines load failed"})
		return
	}
	if lineCount == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bill has no lines"})
		return
	}

	uid := user.ID
	paidAt, err := payAtForBill(tx, "expense_bills", id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pay failed"})
		return
	}
	res, err := tx.Exec(`
		UPDATE expense_bills
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

	audit.WriteAudit(h.DB, &uid, "pay", "expense_bill", &id, map[string]any{"method": "cash", "bill_no": billNo})

	bill, err := loadExpenseBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Expenses) purgeExpenseBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := expenseBillID(path, "")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	user, ok := h.guardExpenseBill(w, r, id, auth.ActionDelete)
	if !ok {
		return
	}
	if user.Role != auth.RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "admin only"})
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
	err = tx.QueryRow(`SELECT status, bill_no, total_mmk FROM expense_bills WHERE id = ?`, id).Scan(&status, &billNo, &totalMMK)
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
		UPDATE expense_bills SET status = 'deleted', updated_at = datetime('now') WHERE id = ?
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
	audit.WriteAudit(h.DB, &uid, "delete", "expense_bill", &id, map[string]any{
		"bill_no": billNo, "was_status": status, "status": "deleted", "total_mmk": totalMMK,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Expenses) voidExpenseBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := expenseBillID(path, "/void")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	user, ok := h.guardExpenseBill(w, r, id, auth.ActionDelete)
	if !ok {
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
	err = tx.QueryRow(`SELECT status, bill_no FROM expense_bills WHERE id = ?`, id).Scan(&status, &billNo)
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
	if _, err := tx.Exec(`
		UPDATE expense_bills SET status = 'void', voided_at = datetime('now'), voided_by_user_id = ?,
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

	audit.WriteAudit(h.DB, &uid, "void", "expense_bill", &id, map[string]any{
		"bill_no": billNo, "reason": req.Reason, "was_status": status,
	})

	bill, err := loadExpenseBill(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, bill)
}

func (h *Expenses) printExpenseBill(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := expenseBillID(path, "/print")
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if _, ok := h.guardExpenseBill(w, r, id, auth.ActionRead); !ok {
		return
	}
	bill, err := loadExpenseBill(h.DB, id)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	hosp, err := loadHospitalSettings(h.DB)
	if err != nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderExpenseBillHTML(hosp, bill)))
}

func renderExpenseBillHTML(hosp *hospitalSettings, bill expenseBill) string {
	dateLabel := receiptDateLabel(bill.CreatedAt, bill.BilledAt, bill.PaidAt)
	lines := make([]receiptLine, 0, len(bill.Lines))
	for _, line := range bill.Lines {
		lines = append(lines, receiptLine{
			Code:        line.Code,
			Description: line.Description,
			Qty:         line.Qty,
			UnitPrice:   line.UnitPriceMMK,
			LineTotal:   line.LineTotalMMK,
		})
	}
	printedAt := ""
	if bill.PrintedAt != nil {
		printedAt = *bill.PrintedAt
	}
	net := bill.TotalMMK - bill.DiscountMMK
	if net < 0 {
		net = 0
	}
	return renderThermalReceiptHTML(hosp, receiptBill{
		Title:          "EXPENSE RECEIPT",
		BillNo:         bill.BillNo,
		Status:         bill.Status,
		PrintedAt:      printedAt,
		PortalLabel:    expensePortalLabel(bill.Portal),
		PayeeName:      bill.Name,
		Note:           bill.Description,
		DateLabel:      dateLabel,
		TotalMMK:       bill.TotalMMK,
		NetMMK:         net,
		ShowSettlement: true,
		DiscountMMK:    bill.DiscountMMK,
		DiscountValue:  bill.DiscountValue,
		DiscountUnit:   bill.DiscountUnit,
		VoidReason:     bill.VoidReason,
		Lines:          lines,
	})
}

// expenseBillAmounts builds lines from typed particulars or a catalog ref_id
// and keeps the client's unit price. gross is the pre-discount line sum stored
// in total_mmk.
func expenseBillAmounts(q queryRower, req expenseBillWriteRequest) (lines []expenseBillLine, gross, discountMMK int64, discountUnit, errMsg string) {
	lines, gross, errMsg = normalizeExpenseLines(q, req.Lines)
	if errMsg != "" {
		return nil, 0, 0, "", errMsg
	}
	discountMMK, _, discountUnit, errMsg = applyBillDiscount(gross, req.DiscountValue, req.DiscountUnit)
	if errMsg != "" {
		return nil, 0, 0, "", errMsg
	}
	return lines, gross, discountMMK, discountUnit, ""
}

func normalizeExpenseLines(q queryRower, in []expenseBillLineInput) ([]expenseBillLine, int64, string) {
	if len(in) == 0 {
		return nil, 0, "at least one line"
	}
	out := make([]expenseBillLine, 0, len(in))
	var total int64
	for i, raw := range in {
		refID, hasRef, errMsg := parseOptionalExpenseRefID(raw.RefID)
		if errMsg != "" {
			return nil, 0, errMsg
		}
		qty, errMsg := parseExpenseQty(raw.Qty)
		if errMsg != "" {
			return nil, 0, errMsg
		}
		price, errMsg := parseExpenseUnitPrice(raw.UnitPriceMMK)
		if errMsg != "" {
			return nil, 0, errMsg
		}
		if qty > 1 && price > math.MaxInt64/qty {
			return nil, 0, "line total too large"
		}
		lineTotal := qty * price

		if !hasRef {
			desc := strings.TrimSpace(raw.Description)
			if desc == "" {
				return nil, 0, "description required"
			}
			out = append(out, expenseBillLine{
				RefID:        nil,
				Code:         "",
				Description:  desc,
				Qty:          qty,
				UnitPriceMMK: price,
				LineTotalMMK: lineTotal,
				SortOrder:    i,
			})
			total += lineTotal
			continue
		}

		var code sql.NullString
		var name string
		var active int
		err := q.QueryRow(`
			SELECT code, name, active FROM expense_services WHERE id = ?
		`, refID).Scan(&code, &name, &active)
		if err == sql.ErrNoRows {
			return nil, 0, "expense service not found"
		}
		if err != nil {
			return nil, 0, "expense service load failed"
		}
		if active != 1 {
			return nil, 0, "expense service is inactive"
		}
		storedCode := ""
		if code.Valid {
			storedCode = code.String
		}
		ref := refID
		out = append(out, expenseBillLine{
			RefID:        &ref,
			Code:         storedCode,
			Description:  name,
			Qty:          qty,
			UnitPriceMMK: price,
			LineTotalMMK: lineTotal,
			SortOrder:    i,
		})
		total += lineTotal
	}
	return out, total, ""
}

// parseOptionalExpenseRefID treats missing or null ref_id as a typed particular.
// A present value must be a positive integer (legacy catalog desks).
func parseOptionalExpenseRefID(raw json.RawMessage) (refID int64, hasRef bool, errMsg string) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return 0, false, ""
	}
	n, errMsg := parseRequiredJSONInt(raw, "ref_id required", "ref_id must be an integer")
	if errMsg != "" {
		return 0, false, errMsg
	}
	if n < 1 {
		return 0, false, "ref_id required"
	}
	return n, true, ""
}

func parseExpenseQty(raw json.RawMessage) (int64, string) {
	n, errMsg := parseRequiredJSONInt(raw, "qty must be >= 1", "qty must be an integer")
	if errMsg != "" {
		return 0, errMsg
	}
	if n < 1 {
		return 0, "qty must be >= 1"
	}
	return n, ""
}

func parseExpenseUnitPrice(raw json.RawMessage) (int64, string) {
	n, errMsg := parseRequiredJSONInt(raw, "unit_price_mmk required", "unit_price_mmk must be an integer")
	if errMsg != "" {
		return 0, errMsg
	}
	if n < 0 {
		return 0, "unit_price_mmk must be >= 0"
	}
	return n, ""
}

func parseRequiredJSONInt(raw json.RawMessage, missing, badType string) (int64, string) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return 0, missing
	}
	var n int64
	if err := json.Unmarshal(raw, &n); err != nil {
		return 0, badType
	}
	return n, ""
}

func nextExpenseBillNo(tx *sql.Tx) (string, error) {
	var n int64
	err := tx.QueryRow(`SELECT next_num FROM expense_bill_number_seq WHERE id = 1`).Scan(&n)
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(`UPDATE expense_bill_number_seq SET next_num = next_num + 1 WHERE id = 1`); err != nil {
		return "", err
	}
	return fmt.Sprintf("EXP-%06d", n), nil
}

func insertExpenseBillLines(tx *sql.Tx, billID int64, lines []expenseBillLine) error {
	for _, l := range lines {
		if _, err := tx.Exec(`
			INSERT INTO expense_bill_lines (
				bill_id, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, billID, l.RefID, l.Code, l.Description, l.Qty, l.UnitPriceMMK, l.LineTotalMMK, l.SortOrder); err != nil {
			return err
		}
	}
	return nil
}

type sqlQuery interface {
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

func loadExpenseBill(db *sql.DB, id int64) (expenseBill, error) {
	row := db.QueryRow(`SELECT `+expenseBillColumns+` FROM expense_bills WHERE id = ?`, id)
	b, err := scanExpenseBill(row)
	if err != nil {
		return b, err
	}
	lines, err := queryExpenseBillLines(db, id)
	if err != nil {
		return b, err
	}
	b.Lines = lines
	return b, nil
}

func queryExpenseBillLines(db sqlQuery, billID int64) ([]expenseBillLine, error) {
	rows, err := db.Query(`
		SELECT id, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order
		FROM expense_bill_lines WHERE bill_id = ? ORDER BY sort_order, id
	`, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]expenseBillLine, 0)
	for rows.Next() {
		var l expenseBillLine
		var ref sql.NullInt64
		if err := rows.Scan(&l.ID, &ref, &l.Code, &l.Description, &l.Qty, &l.UnitPriceMMK, &l.LineTotalMMK, &l.SortOrder); err != nil {
			return nil, err
		}
		if ref.Valid {
			v := ref.Int64
			l.RefID = &v
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func scanExpenseBill(row scannable) (expenseBill, error) {
	var b expenseBill
	var paidBy, voidedBy, createdBy sql.NullInt64
	var paidAt, printedAt, voidedAt, billedAt sql.NullString
	err := row.Scan(
		&b.ID, &b.BillNo, &b.Portal, &b.Name, &b.Description, &b.Status, &b.TotalMMK,
		&b.DiscountValue, &b.DiscountUnit, &b.DiscountMMK,
		&paidAt, &paidBy, &printedAt,
		&voidedAt, &voidedBy, &b.VoidReason,
		&createdBy, &b.CreatedAt, &b.UpdatedAt, &billedAt,
	)
	if err != nil {
		return b, err
	}
	if paidAt.Valid && paidAt.String != "" {
		v := paidAt.String
		b.PaidAt = &v
	}
	if paidBy.Valid {
		v := paidBy.Int64
		b.PaidByUserID = &v
	}
	if printedAt.Valid && printedAt.String != "" {
		v := printedAt.String
		b.PrintedAt = &v
	}
	if voidedAt.Valid && voidedAt.String != "" {
		v := voidedAt.String
		b.VoidedAt = &v
	}
	if voidedBy.Valid {
		v := voidedBy.Int64
		b.VoidedByUserID = &v
	}
	if billedAt.Valid && strings.TrimSpace(billedAt.String) != "" {
		v := billedAt.String
		b.BilledAt = &v
	}
	if createdBy.Valid {
		v := createdBy.Int64
		b.CreatedByUserID = &v
	}
	return b, nil
}

func expenseBillID(path, suffix string) (int64, bool) {
	rest := strings.TrimPrefix(path, "/bills/")
	if rest == path || rest == "" {
		return 0, false
	}
	if suffix != "" {
		if !strings.HasSuffix(rest, suffix) {
			return 0, false
		}
		rest = strings.TrimSuffix(rest, suffix)
	}
	return parseID("/" + rest)
}

func (h *Expenses) allowPortal(w http.ResponseWriter, r *http.Request, portal, action string) (*auth.User, string, bool) {
	canonical := strings.ToLower(strings.TrimSpace(portal))
	perm, ok := expensePortalPermission(canonical)
	user := middleware.UserFromContext(r.Context())
	if !ok || user == nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return nil, "", false
	}
	allowed, err := auth.ExpenseAction(h.DB, user.ID, perm, action)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "permission check failed"})
		return nil, "", false
	}
	if !allowed {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return nil, "", false
	}
	return user, canonical, true
}

func (h *Expenses) guardExpenseBill(w http.ResponseWriter, r *http.Request, id int64, action string) (*auth.User, bool) {
	var portal string
	err := h.DB.QueryRow(`SELECT portal FROM expense_bills WHERE id = ?`, id).Scan(&portal)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return nil, false
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return nil, false
	}
	user, _, ok := h.allowPortal(w, r, portal, action)
	return user, ok
}

func expensePortalPermission(portal string) (string, bool) {
	switch portal {
	case "opd":
		return auth.PermOPD, true
	case "ot":
		return auth.PermOT, true
	case "ipd":
		return auth.PermIPD, true
	case "pharmacy":
		return auth.PermPharmacy, true
	default:
		return "", false
	}
}

func expensePortalLabel(portal string) string {
	switch portal {
	case "opd":
		return "OPD"
	case "ot":
		return "OT"
	case "ipd":
		return "IPD"
	case "pharmacy":
		return "Pharmacy"
	default:
		return portal
	}
}
