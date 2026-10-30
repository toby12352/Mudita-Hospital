package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestBillPurgeAdminOnly(t *testing.T) {
	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	opd := &OPD{DB: sqlDB}
	ph := &Pharmacy{DB: sqlDB}
	ot := &OT{DB: sqlDB}
	exp := &Expenses{DB: sqlDB}
	charts := &Patients{DB: sqlDB}
	ipd := &IPD{DB: sqlDB}

	res, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('PURGE1', 'Purge visit', 2000)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := res.LastInsertId()

	w := doJSON(opd, http.MethodPost, "/api/opd/bills", adminTok, fmt.Sprintf(`{
		"patient_name":"Daw Draft","lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":2000}]
	}`, serviceID))
	mustCode(t, w, http.StatusCreated)
	draft := decodeOpdBill(t, w)

	w = doJSON(opd, http.MethodDelete, "/api/opd/bills/"+strconv.FormatInt(draft.ID, 10), opdTok, "")
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(opd, http.MethodDelete, "/api/opd/bills/"+strconv.FormatInt(draft.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	var status string
	var lineN int
	if err := sqlDB.QueryRow(`SELECT status FROM opd_bills WHERE id = ?`, draft.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("draft status %q, want deleted", status)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM bill_lines WHERE bill_id = ?`, draft.ID).Scan(&lineN); err != nil {
		t.Fatal(err)
	}
	if lineN < 1 {
		t.Fatal("draft lines were removed")
	}

	// Soft-deleted draft stays in desk list, leaves patient chart.
	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Daw Chart","phone":"0999"}`)
	mustCode(t, w, http.StatusCreated)
	chartDraft := decodePatient(t, w)
	w = doJSON(opd, http.MethodPost, "/api/opd/bills", adminTok, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Chart","lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":2000}]
	}`, chartDraft.ID, serviceID))
	mustCode(t, w, http.StatusCreated)
	chartBill := decodeOpdBill(t, w)
	w = doJSON(opd, http.MethodDelete, "/api/opd/bills/"+strconv.FormatInt(chartBill.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)

	w = doJSON(opd, http.MethodGet, "/api/opd/bills", adminTok, "")
	mustCode(t, w, http.StatusOK)
	var deskList struct {
		Bills []struct {
			ID     int64  `json:"id"`
			Status string `json:"status"`
		} `json:"bills"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &deskList); err != nil {
		t.Fatal(err)
	}
	foundDeleted := false
	for _, b := range deskList.Bills {
		if b.ID == chartBill.ID {
			foundDeleted = true
			if b.Status != "deleted" {
				t.Fatalf("desk list status %q", b.Status)
			}
		}
	}
	if !foundDeleted {
		t.Fatal("deleted bill missing from unfiltered desk list")
	}

	w = doJSON(charts, http.MethodGet, fmt.Sprintf("/api/patients/%d/history", chartDraft.ID), adminTok, "")
	mustCode(t, w, http.StatusOK)
	var hist struct {
		OPD []struct {
			ID int64 `json:"id"`
		} `json:"opd"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &hist); err != nil {
		t.Fatal(err)
	}
	for _, row := range hist.OPD {
		if row.ID == chartBill.ID {
			t.Fatal("deleted bill still on patient chart")
		}
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", adminTok, fmt.Sprintf(`{
		"patient_name":"Daw Paid","lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":2000}]
	}`, serviceID))
	mustCode(t, w, http.StatusCreated)
	paid := decodeOpdBill(t, w)
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", paid.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusOK)
	w = doJSON(opd, http.MethodDelete, "/api/opd/bills/"+strconv.FormatInt(paid.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusBadRequest)
	if err := sqlDB.QueryRow(`SELECT status FROM opd_bills WHERE id = ?`, paid.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "paid" {
		t.Fatalf("paid status became %q", status)
	}

	itemID := insertItem(t, sqlDB, "PURGEMED", "Purge med", 50, 100)
	batchID := insertBatch(t, sqlDB, itemID, "P1", "2030-01-01", 30)
	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", adminTok, fmt.Sprintf(`{
		"patient_name":"U Sale","lines":[{"item_id":%d,"tablet_qty":3}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	sale := decodePharmacyBill(t, w)
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", sale.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, batchID) != 27 {
		t.Fatalf("after pay qty %d", batchQty(t, sqlDB, batchID))
	}
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/void", sale.ID), adminTok, `{"reason":"mistake"}`)
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, batchID) != 30 {
		t.Fatalf("after void qty %d", batchQty(t, sqlDB, batchID))
	}
	w = doJSON(ph, http.MethodDelete, "/api/pharmacy/bills/"+strconv.FormatInt(sale.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, batchID) != 30 {
		t.Fatalf("purge changed stock %d", batchQty(t, sqlDB, batchID))
	}
	if err := sqlDB.QueryRow(`SELECT status FROM pharmacy_bills WHERE id = ?`, sale.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("voided pharmacy status %q", status)
	}
	// Deleted void drops out of cash (pay and reversal legs both require paid/void).
	var cashHits int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM pharmacy_bills
		WHERE id = ? AND (
		  status = 'paid'
		  OR (status = 'void' AND voided_at IS NOT NULL AND TRIM(voided_at) != '')
		)
	`, sale.ID).Scan(&cashHits); err != nil {
		t.Fatal(err)
	}
	if cashHits != 0 {
		t.Fatal("deleted pharmacy bill still matches cash predicates")
	}

	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Daw Stay","phone":"091234"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", adminTok, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", adminTok, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Stay","lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":2000}]
	}`, chart.ID, serviceID))
	mustCode(t, w, http.StatusCreated)
	charge := decodeOpdBill(t, w)
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", charge.ID), adminTok,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusOK)
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/void", charge.ID), adminTok, `{"reason":"undo charge"}`)
	mustCode(t, w, http.StatusOK)

	var ledgerBefore int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM ipd_ledger WHERE source = 'opd' AND source_id = ?
	`, charge.ID).Scan(&ledgerBefore); err != nil {
		t.Fatal(err)
	}
	if ledgerBefore < 2 {
		t.Fatalf("expected charge+reversal, got %d", ledgerBefore)
	}
	var stayNetBefore int64
	if err := sqlDB.QueryRow(`SELECT COALESCE(SUM(amount_mmk), 0) FROM ipd_ledger WHERE admission_id = ?`, stay.ID).Scan(&stayNetBefore); err != nil {
		t.Fatal(err)
	}

	w = doJSON(opd, http.MethodDelete, "/api/opd/bills/"+strconv.FormatInt(charge.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	var ledgerAfter int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM ipd_ledger WHERE source = 'opd' AND source_id = ?
	`, charge.ID).Scan(&ledgerAfter); err != nil {
		t.Fatal(err)
	}
	if ledgerAfter != 0 {
		t.Fatalf("ledger rows left %d", ledgerAfter)
	}
	var stayNetAfter int64
	if err := sqlDB.QueryRow(`SELECT COALESCE(SUM(amount_mmk), 0) FROM ipd_ledger WHERE admission_id = ?`, stay.ID).Scan(&stayNetAfter); err != nil {
		t.Fatal(err)
	}
	if stayNetAfter != stayNetBefore {
		t.Fatalf("stay net %d -> %d", stayNetBefore, stayNetAfter)
	}
	if err := sqlDB.QueryRow(`SELECT status FROM opd_bills WHERE id = ?`, charge.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("charged void status %q", status)
	}

	otItem := insertItem(t, sqlDB, "PURGEOT", "OT purge", 10, 400)
	otCupboard := insertOtBatch(t, sqlDB, otItem, "OT1", "2031-01-01", 5)

	// Unbilled draft: soft-delete keeps the visit row and items; cupboard qty unchanged.
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", adminTok, fmt.Sprintf(`{
		"patient_name":"OT Unbilled","items":[{"item_id":%d,"qty_issued":1}]
	}`, otItem))
	mustCode(t, w, http.StatusCreated)
	otUnbilled := decodeOtCase(t, w)
	w = doJSON(ot, http.MethodDelete, "/api/ot/cases/"+strconv.FormatInt(otUnbilled.ID, 10), opdTok, "")
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(ot, http.MethodDelete, "/api/ot/cases/"+strconv.FormatInt(otUnbilled.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	if err := sqlDB.QueryRow(`SELECT status FROM ot_cases WHERE id = ?`, otUnbilled.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("unbilled ot case status %q", status)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ot_case_items WHERE case_id = ?`, otUnbilled.ID).Scan(&lineN); err != nil {
		t.Fatal(err)
	}
	if lineN < 1 {
		t.Fatal("ot case items were removed")
	}
	if otBatchQty(t, sqlDB, otCupboard) != 5 {
		t.Fatalf("unbilled purge changed cupboard %d", otBatchQty(t, sqlDB, otCupboard))
	}
	w = doJSON(ot, http.MethodDelete, "/api/ot/cases/"+strconv.FormatInt(otUnbilled.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusBadRequest)

	// Draft bill: soft-delete keeps case and bill.
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", adminTok, fmt.Sprintf(`{
		"patient_name":"OT Draft","items":[{"item_id":%d,"qty_issued":1}]
	}`, otItem))
	mustCode(t, w, http.StatusCreated)
	otDraftCase := decodeOtCase(t, w)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", otDraftCase.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusCreated)
	otDraftBill := decodeOtBill(t, w)
	w = doJSON(ot, http.MethodDelete, "/api/ot/cases/"+strconv.FormatInt(otDraftCase.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	if err := sqlDB.QueryRow(`SELECT status FROM ot_cases WHERE id = ?`, otDraftCase.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("draft ot case status %q", status)
	}
	if err := sqlDB.QueryRow(`SELECT status FROM ot_bills WHERE id = ?`, otDraftBill.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("draft ot bill status %q", status)
	}
	if otBatchQty(t, sqlDB, otCupboard) != 5 {
		t.Fatalf("draft purge changed cupboard %d", otBatchQty(t, sqlDB, otCupboard))
	}

	// Last-bill path: DELETE /bills/{id} on a lone draft soft-deletes bill and case.
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", adminTok, fmt.Sprintf(`{
		"patient_name":"OT Last Bill","items":[{"item_id":%d,"qty_issued":1}]
	}`, otItem))
	mustCode(t, w, http.StatusCreated)
	otLastCase := decodeOtCase(t, w)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", otLastCase.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusCreated)
	otLastBill := decodeOtBill(t, w)
	w = doJSON(ot, http.MethodDelete, "/api/ot/bills/"+strconv.FormatInt(otLastBill.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	if err := sqlDB.QueryRow(`SELECT status FROM ot_bills WHERE id = ?`, otLastBill.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("last-bill path bill status %q", status)
	}
	if err := sqlDB.QueryRow(`SELECT status FROM ot_cases WHERE id = ?`, otLastCase.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("last-bill path case status %q", status)
	}
	if otBatchQty(t, sqlDB, otCupboard) != 5 {
		t.Fatalf("last-bill purge changed cupboard %d", otBatchQty(t, sqlDB, otCupboard))
	}

	// Paid bill: both DELETE paths refuse; stock stays deducted.
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", adminTok, fmt.Sprintf(`{
		"patient_name":"OT Paid","items":[{"item_id":%d,"qty_issued":1}]
	}`, otItem))
	mustCode(t, w, http.StatusCreated)
	otPaidCase := decodeOtCase(t, w)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", otPaidCase.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusCreated)
	otPaidBill := decodeOtBill(t, w)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/pay", otPaidBill.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusOK)
	if otBatchQty(t, sqlDB, otCupboard) != 4 {
		t.Fatalf("after pay cupboard %d", otBatchQty(t, sqlDB, otCupboard))
	}
	w = doJSON(ot, http.MethodDelete, "/api/ot/bills/"+strconv.FormatInt(otPaidBill.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(ot, http.MethodDelete, "/api/ot/cases/"+strconv.FormatInt(otPaidCase.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusBadRequest)
	if err := sqlDB.QueryRow(`SELECT status FROM ot_cases WHERE id = ?`, otPaidCase.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status == "deleted" {
		t.Fatal("paid ot case was soft-deleted")
	}
	if err := sqlDB.QueryRow(`SELECT status FROM ot_bills WHERE id = ?`, otPaidBill.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "paid" {
		t.Fatalf("paid ot bill status %q", status)
	}
	if otBatchQty(t, sqlDB, otCupboard) != 4 {
		t.Fatalf("paid refuse changed cupboard %d", otBatchQty(t, sqlDB, otCupboard))
	}

	// Pay → void → delete case: visit soft-deleted, cupboard restored, SALE+VOID movements kept.
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/void", otPaidBill.ID), adminTok, `{"reason":"void ot"}`)
	mustCode(t, w, http.StatusOK)
	if otBatchQty(t, sqlDB, otCupboard) != 5 {
		t.Fatalf("after void cupboard %d", otBatchQty(t, sqlDB, otCupboard))
	}
	w = doJSON(ot, http.MethodDelete, "/api/ot/cases/"+strconv.FormatInt(otPaidCase.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	if err := sqlDB.QueryRow(`SELECT status FROM ot_bills WHERE id = ?`, otPaidBill.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("voided ot bill status %q", status)
	}
	if err := sqlDB.QueryRow(`SELECT status FROM ot_cases WHERE id = ?`, otPaidCase.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("voided ot case status %q", status)
	}
	if otBatchQty(t, sqlDB, otCupboard) != 5 {
		t.Fatalf("void purge changed cupboard %d", otBatchQty(t, sqlDB, otCupboard))
	}
	var saleN, voidN int
	if err := sqlDB.QueryRow(`
		SELECT
			COALESCE(SUM(CASE WHEN movement_type = 'SALE' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN movement_type = 'VOID' THEN 1 ELSE 0 END), 0)
		FROM ot_stock_movements WHERE item_id = ?
	`, otItem).Scan(&saleN, &voidN); err != nil {
		t.Fatal(err)
	}
	if saleN < 1 || voidN < 1 {
		t.Fatalf("expected SALE and VOID movements, got sale=%d void=%d", saleN, voidN)
	}

	// IPD: charge draft OT → void → delete case; ledger cleared, stay net unchanged.
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", adminTok, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Stay","items":[{"item_id":%d,"qty_issued":1}]
	}`, chart.ID, otItem))
	mustCode(t, w, http.StatusCreated)
	otIpdCase := decodeOtCase(t, w)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", otIpdCase.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusCreated)
	otIpdBill := decodeOtBill(t, w)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/pay", otIpdBill.ID), adminTok,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusOK)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/void", otIpdBill.ID), adminTok, `{"reason":"undo ot charge"}`)
	mustCode(t, w, http.StatusOK)
	var otLedgerBefore int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM ipd_ledger WHERE source = 'ot' AND source_id = ?
	`, otIpdBill.ID).Scan(&otLedgerBefore); err != nil {
		t.Fatal(err)
	}
	if otLedgerBefore < 2 {
		t.Fatalf("expected ot charge+reversal, got %d", otLedgerBefore)
	}
	var otStayNetBefore int64
	if err := sqlDB.QueryRow(`SELECT COALESCE(SUM(amount_mmk), 0) FROM ipd_ledger WHERE admission_id = ?`, stay.ID).Scan(&otStayNetBefore); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodDelete, "/api/ot/cases/"+strconv.FormatInt(otIpdCase.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	var otLedgerAfter int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM ipd_ledger WHERE source = 'ot' AND source_id = ?
	`, otIpdBill.ID).Scan(&otLedgerAfter); err != nil {
		t.Fatal(err)
	}
	if otLedgerAfter != 0 {
		t.Fatalf("ot ledger rows left %d", otLedgerAfter)
	}
	var otStayNetAfter int64
	if err := sqlDB.QueryRow(`SELECT COALESCE(SUM(amount_mmk), 0) FROM ipd_ledger WHERE admission_id = ?`, stay.ID).Scan(&otStayNetAfter); err != nil {
		t.Fatal(err)
	}
	if otStayNetAfter != otStayNetBefore {
		t.Fatalf("ot stay net %d -> %d", otStayNetBefore, otStayNetAfter)
	}

	xferItem := insertItem(t, sqlDB, "PURGXFER", "Xfer purge", 10, 50)
	xferBatch := insertBatch(t, sqlDB, xferItem, "X1", "2030-06-01", 10)
	xfer := confirmTransferBill(t, ph, adminTok, xferItem, 2)
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/void", xfer.ID), adminTok, `{"reason":"undo xfer"}`)
	mustCode(t, w, http.StatusOK)
	var transferRows int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_transfers WHERE pharmacy_bill_id = ?`, xfer.ID).Scan(&transferRows); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ph, http.MethodDelete, "/api/pharmacy/bills/"+strconv.FormatInt(xfer.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_transfers`).Scan(&transferRows); err != nil {
		t.Fatal(err)
	}
	if transferRows < 1 {
		t.Fatal("transfer row deleted with bill")
	}
	var linked sql.NullInt64
	if err := sqlDB.QueryRow(`SELECT pharmacy_bill_id FROM stock_transfers ORDER BY id DESC LIMIT 1`).Scan(&linked); err != nil {
		t.Fatal(err)
	}
	// Soft-delete keeps the transfer link; the bill row still exists.
	if !linked.Valid || linked.Int64 != xfer.ID {
		t.Fatalf("pharmacy_bill_id after soft-delete got %v, want %d", linked, xfer.ID)
	}
	if err := sqlDB.QueryRow(`SELECT status FROM pharmacy_bills WHERE id = ?`, xfer.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("transfer bill status %q", status)
	}
	if batchQty(t, sqlDB, xferBatch) != 10 {
		t.Fatalf("transfer purge stock %d", batchQty(t, sqlDB, xferBatch))
	}

	svcRes, err := sqlDB.Exec(`INSERT INTO expense_services (code, name, price_mmk, active) VALUES ('EPURGE', 'Paper', 500, 1)`)
	if err != nil {
		t.Fatal(err)
	}
	expSvcID, _ := svcRes.LastInsertId()
	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", adminTok, fmt.Sprintf(`{
		"portal":"opd","name":"Paper","lines":[{"ref_id":%d,"qty":1,"unit_price_mmk":500}]
	}`, expSvcID))
	mustCode(t, w, http.StatusCreated)
	expBill := decodeExpenseBill(t, w)
	w = doJSON(exp, http.MethodDelete, "/api/expenses/bills/"+strconv.FormatInt(expBill.ID, 10), opdTok, "")
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(exp, http.MethodDelete, "/api/expenses/bills/"+strconv.FormatInt(expBill.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	if err := sqlDB.QueryRow(`SELECT status FROM expense_bills WHERE id = ?`, expBill.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("expense draft status %q", status)
	}
}
