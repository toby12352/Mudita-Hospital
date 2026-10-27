package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"database/sql"
)

func TestBillAdmissionCharge(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	opd := &OPD{DB: sqlDB}
	ph := &Pharmacy{DB: sqlDB}
	ot := &OT{DB: sqlDB}
	ipd := &IPD{DB: sqlDB}
	charts := &Patients{DB: sqlDB}
	today := localToday()

	if _, err := sqlDB.Exec(`
		INSERT INTO opd_bills (bill_no, patient_name, status, total_mmk, paid_at)
		VALUES ('OPD-LEGACY', 'Legacy Cash', 'paid', 4242, ?)
	`, today+" 08:00:00"); err != nil {
		t.Fatal(err)
	}
	var legacyCash int
	var legacyTotal int64
	var legacyAdmission sql.NullInt64
	if err := sqlDB.QueryRow(`
		SELECT total_mmk, collected_cash, admission_id FROM opd_bills WHERE bill_no = 'OPD-LEGACY'
	`).Scan(&legacyTotal, &legacyCash, &legacyAdmission); err != nil {
		t.Fatal(err)
	}
	if legacyTotal != 4242 || legacyCash != 1 || legacyAdmission.Valid {
		t.Fatalf("legacy total %d cash %d admission %v", legacyTotal, legacyCash, legacyAdmission)
	}

	w := doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"Daw Charge","phone":"094444"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	w = doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"U Other","phone":"095555"}`)
	mustCode(t, w, http.StatusCreated)
	other := decodePatient(t, w)

	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, other.ID))
	mustCode(t, w, http.StatusCreated)
	otherStay := decodeAdmission(t, w)

	w = doJSON(charts, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10), token, "")
	mustCode(t, w, http.StatusOK)
	opened := decodePatient(t, w)
	if opened.OpenAdmissionID == nil || *opened.OpenAdmissionID != stay.ID {
		t.Fatalf("open admission %+v", opened.OpenAdmissionID)
	}

	res, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('CASH6', 'Cash visit', 1500)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := res.LastInsertId()
	opdBody := func(patientID *int64) string {
		pid := ""
		if patientID != nil {
			pid = fmt.Sprintf(`"patient_id":%d,`, *patientID)
		}
		return fmt.Sprintf(`{%s"patient_name":"Daw Charge","lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1}]}`, pid, serviceID)
	}

	var movesBefore int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&movesBefore); err != nil {
		t.Fatal(err)
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", token, opdBody(nil))
	mustCode(t, w, http.StatusCreated)
	walkIn := decodeOpdBill(t, w)
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", walkIn.ID), token,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(w.Body.String(), "bill has no patient") {
		t.Fatalf("walk-in charge %s", w.Body.String())
	}
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", walkIn.ID), token, `{}`)
	mustCode(t, w, http.StatusOK)
	if decodeOpdBill(t, w).CollectedCash != 1 {
		t.Fatal("cash pay collected_cash")
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", token, opdBody(&chart.ID))
	mustCode(t, w, http.StatusCreated)
	cashBill := decodeOpdBill(t, w)
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", cashBill.ID), token, `{}`)
	mustCode(t, w, http.StatusOK)

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", token, opdBody(&chart.ID))
	mustCode(t, w, http.StatusCreated)
	chargeBill := decodeOpdBill(t, w)
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", chargeBill.ID), token,
		fmt.Sprintf(`{"admission_id":%d}`, otherStay.ID))
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", chargeBill.ID), token,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusOK)
	charged := decodeOpdBill(t, w)
	if charged.Status != "paid" || charged.CollectedCash != 0 || charged.AdmissionID == nil || *charged.AdmissionID != stay.ID || charged.TotalMMK != 1500 {
		t.Fatalf("charged opd %+v", charged)
	}
	var movesAfter int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&movesAfter); err != nil {
		t.Fatal(err)
	}
	if movesAfter != movesBefore {
		t.Fatalf("opd service charge moved stock %d -> %d", movesBefore, movesAfter)
	}

	itemID := insertItem(t, sqlDB, "CHGMED", "Charge med", 50, 100)
	batchID := insertBatch(t, sqlDB, itemID, "LOT", "2030-01-01", 20)

	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Charge","lines":[{"item_id":%d,"tablet_qty":5}]
	}`, chart.ID, itemID))
	mustCode(t, w, http.StatusCreated)
	cashSale := decodePharmacyBill(t, w)
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", cashSale.ID), token, `{}`)
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, batchID) != 15 {
		t.Fatalf("cash sale stock %d", batchQty(t, sqlDB, batchID))
	}

	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Charge","lines":[{"item_id":%d,"tablet_qty":2}]
	}`, chart.ID, itemID))
	mustCode(t, w, http.StatusCreated)
	phCharge := decodePharmacyBill(t, w)
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", phCharge.ID), token,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusOK)
	phPaid := decodePharmacyBill(t, w)
	if phPaid.CollectedCash != 0 || phPaid.TotalMMK != 200 || batchQty(t, sqlDB, batchID) != 13 {
		t.Fatalf("pharmacy charge total %d stock %d cash %d", phPaid.TotalMMK, batchQty(t, sqlDB, batchID), phPaid.CollectedCash)
	}

	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Charge","kind":"return","lines":[{"item_id":%d,"tablet_qty":1}]
	}`, chart.ID, itemID))
	mustCode(t, w, http.StatusCreated)
	ret := decodePharmacyBill(t, w)
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", ret.ID), token,
		fmt.Sprintf(`{"admission_id":%d,"source_bill_id":%d}`, stay.ID, phCharge.ID))
	mustCode(t, w, http.StatusOK)
	retPaid := decodePharmacyBill(t, w)
	if retPaid.CollectedCash != 0 || retPaid.AdmissionID == nil || *retPaid.AdmissionID != stay.ID {
		t.Fatalf("return credit %+v", retPaid)
	}
	var credit int64
	if err := sqlDB.QueryRow(`
		SELECT amount_mmk FROM ipd_ledger WHERE source = 'pharmacy' AND source_id = ? AND kind = 'charge'
	`, ret.ID).Scan(&credit); err != nil {
		t.Fatal(err)
	}
	if credit != retPaid.TotalMMK || credit != 100 {
		t.Fatalf("return credit %d", credit)
	}
	if batchQty(t, sqlDB, batchID) != 13 {
		t.Fatalf("return touched dated lot %d", batchQty(t, sqlDB, batchID))
	}

	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Charge","kind":"return","lines":[{"item_id":%d,"tablet_qty":1}]
	}`, chart.ID, itemID))
	mustCode(t, w, http.StatusCreated)
	cashRet := decodePharmacyBill(t, w)
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", cashRet.ID), token, `{}`)
	mustCode(t, w, http.StatusOK)
	if decodePharmacyBill(t, w).CollectedCash != 1 {
		t.Fatal("cash return was charged")
	}

	cash, err := buildDailyCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	// Legacy 4242 + two cash OPD 1500. Charged OPD is out.
	if cash.OPDTotal != 7242 {
		t.Fatalf("opd cash %d", cash.OPDTotal)
	}
	// Cash sale 500 minus cash return 100. Charged sale and its credit are out.
	if cash.PharmacyTotal != 400 || cash.OTTotal != 0 {
		t.Fatalf("pharmacy %d ot %d", cash.PharmacyTotal, cash.OTTotal)
	}

	points, err := buildCashTrends(sqlDB, today, today)
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 1 || points[0].OPDTotalMMK != 7242 || points[0].PharmacyTotalMMK != 400 {
		t.Fatalf("trend %+v", points)
	}
	services, err := buildRevenueByService(sqlDB, today, today)
	if err != nil {
		t.Fatal(err)
	}
	var serviceSum int64
	for _, row := range services {
		if row.Code == "CASH6" {
			serviceSum += row.TotalMMK
		}
	}
	if serviceSum != 3000 {
		t.Fatalf("service cash %d", serviceSum)
	}

	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/void", ret.ID), token, `{"reason":"undo credit"}`)
	mustCode(t, w, http.StatusOK)
	var blankQty int64
	if err := sqlDB.QueryRow(`
		SELECT COALESCE(SUM(qty), 0) FROM item_batches
		WHERE item_id = ? AND location_code = 'MAIN' AND batch_no = '' AND (expiry_date IS NULL OR expiry_date = '')
	`, itemID).Scan(&blankQty); err != nil {
		t.Fatal(err)
	}
	if blankQty != 1 {
		t.Fatalf("blank after voiding the charged return %d, want 1 (cash return remains)", blankQty)
	}

	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/void", phCharge.ID), token, `{"reason":"undo charge"}`)
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, batchID) != 15 {
		t.Fatalf("void charge stock %d", batchQty(t, sqlDB, batchID))
	}

	otItem := insertItem(t, sqlDB, "CHGCUP", "Cupboard", 10, 500)
	otBatch := insertOtBatch(t, sqlDB, otItem, "CUP", "2031-01-01", 4)
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", token, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Charge","items":[{"item_id":%d,"qty_issued":2}]
	}`, chart.ID, otItem))
	mustCode(t, w, http.StatusCreated)
	otCaseRow := decodeOtCase(t, w)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", otCaseRow.ID), token, `{}`)
	mustCode(t, w, http.StatusCreated)
	otDraft := decodeOtBill(t, w)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/pay", otDraft.ID), token,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusOK)
	otPaid := decodeOtBill(t, w)
	if otPaid.CollectedCash != 0 || otBatchQty(t, sqlDB, otBatch) != 2 {
		t.Fatalf("ot charge cash %d qty %d", otPaid.CollectedCash, otBatchQty(t, sqlDB, otBatch))
	}
	var otCharge int64
	if err := sqlDB.QueryRow(`
		SELECT amount_mmk FROM ipd_ledger WHERE source = 'ot' AND source_id = ? AND kind = 'charge'
	`, otDraft.ID).Scan(&otCharge); err != nil {
		t.Fatal(err)
	}
	if otCharge != -otPaid.TotalMMK {
		t.Fatalf("ot ledger %d total %d", otCharge, otPaid.TotalMMK)
	}
	cash, err = buildDailyCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	if cash.OTTotal != 0 {
		t.Fatalf("ot cash %d", cash.OTTotal)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/void", otDraft.ID), token, `{"reason":"undo ot"}`)
	mustCode(t, w, http.StatusOK)
	if otBatchQty(t, sqlDB, otBatch) != 4 {
		t.Fatalf("ot void qty %d", otBatchQty(t, sqlDB, otBatch))
	}

	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Charge","lines":[{"item_id":%d,"tablet_qty":1}]
	}`, chart.ID, itemID))
	mustCode(t, w, http.StatusCreated)
	held := decodePharmacyBill(t, w)
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", held.ID), token,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, batchID) != 14 {
		t.Fatalf("held stock %d", batchQty(t, sqlDB, batchID))
	}
	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET status = 'settled' WHERE id = ?`, stay.ID); err != nil {
		t.Fatal(err)
	}
	var reversals int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_ledger WHERE kind = 'reversal' AND source_id = ?`, held.ID).Scan(&reversals); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/void", held.ID), token, `{"reason":"too late"}`)
	mustCode(t, w, http.StatusConflict)
	if batchQty(t, sqlDB, batchID) != 14 {
		t.Fatalf("settled void moved stock to %d", batchQty(t, sqlDB, batchID))
	}
	var reversalsAfter int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_ledger WHERE kind = 'reversal' AND source_id = ?`, held.ID).Scan(&reversalsAfter); err != nil {
		t.Fatal(err)
	}
	if reversalsAfter != reversals {
		t.Fatal("settled void wrote a reversal")
	}

	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"kind":"transfer","lines":[{"item_id":%d,"tablet_qty":1}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	slip := decodePharmacyBill(t, w)
	before := batchQty(t, sqlDB, batchID)
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", slip.ID), token,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(w.Body.String(), "transfer") {
		t.Fatalf("transfer pay %s", w.Body.String())
	}
	if batchQty(t, sqlDB, batchID) != before {
		t.Fatal("transfer pay moved stock")
	}
}

func decodePharmacyBill(t *testing.T, w *httptest.ResponseRecorder) pharmacyBill {
	t.Helper()
	var bill pharmacyBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	return bill
}

func decodeOtCase(t *testing.T, w *httptest.ResponseRecorder) otCase {
	t.Helper()
	var row otCase
	if err := json.Unmarshal(w.Body.Bytes(), &row); err != nil {
		t.Fatal(err)
	}
	return row
}

func decodeOtBill(t *testing.T, w *httptest.ResponseRecorder) otBill {
	t.Helper()
	var bill otBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	return bill
}
