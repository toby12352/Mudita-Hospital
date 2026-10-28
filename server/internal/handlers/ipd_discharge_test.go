package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestIpdDischargeCashAndAttach(t *testing.T) {
	sqlDB := openTestDB(t)
	today := localToday()
	_, token := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	_, patientsTok := insertSession(t, sqlDB, auth.RolePatients, 0)
	opd := &OPD{DB: sqlDB}
	ph := &Pharmacy{DB: sqlDB}
	ipd := &IPD{DB: sqlDB}
	charts := &Patients{DB: sqlDB}
	dash := &Dashboard{DB: sqlDB}

	if _, err := sqlDB.Exec(`
		INSERT INTO opd_bills (bill_no, patient_name, status, total_mmk, paid_at)
		VALUES ('OPD-LEGACY', 'Legacy Cash', 'paid', 4242, ?)
	`, today+" 08:00:00"); err != nil {
		t.Fatal(err)
	}

	w := doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"Daw Settle","phone":"096666"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	w = doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"U Other Chart","phone":"097777"}`)
	mustCode(t, w, http.StatusCreated)
	other := decodePatient(t, w)

	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)
	stayPath := "/api/ipd/admissions/" + strconv.FormatInt(stay.ID, 10)

	res, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('DISCH', 'Discharge visit', 1500)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := res.LastInsertId()
	w = doJSON(opd, http.MethodPost, "/api/opd/bills", token, fmt.Sprintf(
		`{"patient_id":%d,"patient_name":"Daw Settle","lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1}]}`,
		chart.ID, serviceID,
	))
	mustCode(t, w, http.StatusCreated)
	cashBill := decodeOpdBill(t, w)
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", cashBill.ID), token, `{}`)
	mustCode(t, w, http.StatusOK)
	if decodeOpdBill(t, w).CollectedCash != 1 || decodeOpdBill(t, w).TotalMMK != 1500 {
		t.Fatalf("cash opd %s", w.Body.String())
	}

	itemID := insertItem(t, sqlDB, "DISMED", "Discharge med", 40, 100)
	batchID := insertBatch(t, sqlDB, itemID, "LOT", "2031-01-01", 20)
	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Settle","lines":[{"item_id":%d,"tablet_qty":2}]
	}`, chart.ID, itemID))
	mustCode(t, w, http.StatusCreated)
	phBill := decodePharmacyBill(t, w)
	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", phBill.ID), token,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusOK)
	phPaid := decodePharmacyBill(t, w)
	if phPaid.CollectedCash != 0 || phPaid.TotalMMK != 200 || batchQty(t, sqlDB, batchID) != 18 {
		t.Fatalf("pharmacy charge total %d stock %d cash %d", phPaid.TotalMMK, batchQty(t, sqlDB, batchID), phPaid.CollectedCash)
	}

	w = doJSON(ipd, http.MethodPost, stayPath+"/deposits", token, `{"amount_mmk":1000,"note":"advance"}`)
	mustCode(t, w, http.StatusCreated)
	w = doJSON(ipd, http.MethodPost, stayPath+"/ward-charges", token, `{"description":"Room","amount_mmk":300}`)
	mustCode(t, w, http.StatusCreated)
	before := decodeAdmission(t, w)
	if before.BalanceMMK == nil || *before.BalanceMMK != 500 {
		t.Fatalf("balance before discharge %+v", before.BalanceMMK)
	}

	w = doJSON(ipd, http.MethodPost, stayPath+"/discharge", opdTok, ``)
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(ipd, http.MethodPost, stayPath+"/discharge", patientsTok, ``)
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(ipd, http.MethodPost, stayPath+"/discharge", token, ``)
	mustCode(t, w, http.StatusOK)
	settled := decodeAdmission(t, w)
	if settled.Status != "settled" || settled.DischargedAt == nil || settled.BalanceMMK == nil || *settled.BalanceMMK != 0 {
		t.Fatalf("settled %+v", settled)
	}
	var refundCount int
	var refundAmount int64
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1), COALESCE(SUM(amount_mmk), 0) FROM ipd_ledger
		WHERE admission_id = ? AND kind = 'refund'
	`, stay.ID).Scan(&refundCount, &refundAmount); err != nil {
		t.Fatal(err)
	}
	if refundCount != 1 || refundAmount != -500 {
		t.Fatalf("refund count %d amount %d", refundCount, refundAmount)
	}

	w = doJSON(ipd, http.MethodGet, stayPath+"/statement", token, "")
	mustCode(t, w, http.StatusOK)
	statement := w.Body.String()
	if !strings.Contains(statement, phPaid.BillNo) || !strings.Contains(statement, "Pharmacy charge") ||
		!strings.Contains(statement, "Refund") || !strings.Contains(statement, ">ပိုငွေ</td><td>0 MMK</td>") ||
		!strings.Contains(statement, "IPD FINAL STATEMENT") {
		t.Fatalf("statement missing lines: %s", statement)
	}

	w = doJSON(ipd, http.MethodPost, stayPath+"/deposits", token, `{"amount_mmk":100}`)
	mustCode(t, w, http.StatusConflict)
	w = doJSON(ipd, http.MethodPost, stayPath+"/ward-charges", token, `{"description":"Late","amount_mmk":50}`)
	mustCode(t, w, http.StatusConflict)
	w = doJSON(opd, http.MethodPost, "/api/opd/bills", token, fmt.Sprintf(
		`{"patient_id":%d,"patient_name":"Daw Settle","lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1}]}`,
		chart.ID, serviceID,
	))
	mustCode(t, w, http.StatusCreated)
	late := decodeOpdBill(t, w)
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", late.ID), token,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusConflict)
	if batchQty(t, sqlDB, batchID) != 18 {
		t.Fatalf("late charge moved stock to %d", batchQty(t, sqlDB, batchID))
	}
	var lateStatus string
	var lateTotal int64
	if err := sqlDB.QueryRow(`SELECT status, total_mmk FROM opd_bills WHERE id = ?`, late.ID).Scan(&lateStatus, &lateTotal); err != nil {
		t.Fatal(err)
	}
	if lateStatus != "draft" || lateTotal != 1500 {
		t.Fatalf("late bill %s total %d", lateStatus, lateTotal)
	}

	cash, err := buildDailyCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	if cash.OPDTotal != 5742 || cash.PharmacyTotal != 0 {
		t.Fatalf("desk cash opd %d pharmacy %d", cash.OPDTotal, cash.PharmacyTotal)
	}
	ipdCash, err := buildIpdCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	if ipdCash.DepositMMK != 1000 || ipdCash.RefundMMK != -500 || ipdCash.CollectionMMK != 0 || ipdCash.NetMMK != 500 {
		t.Fatalf("ipd cash %+v", ipdCash)
	}
	for _, line := range ipdCash.Lines {
		if line.Kind == "ward" || line.Kind == "charge" {
			t.Fatalf("non-cash line %+v", line)
		}
	}

	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	owe := decodeAdmission(t, w)
	owePath := "/api/ipd/admissions/" + strconv.FormatInt(owe.ID, 10)
	w = doJSON(ipd, http.MethodPost, owePath+"/ward-charges", token, `{"description":"Nursing","amount_mmk":2000}`)
	mustCode(t, w, http.StatusCreated)
	w = doJSON(ipd, http.MethodPost, owePath+"/discharge", token, ``)
	mustCode(t, w, http.StatusOK)
	collected := decodeAdmission(t, w)
	if collected.Status != "settled" || collected.BalanceMMK == nil || *collected.BalanceMMK != 0 {
		t.Fatalf("collection settle %+v", collected)
	}
	var collection int64
	if err := sqlDB.QueryRow(`
		SELECT amount_mmk FROM ipd_ledger WHERE admission_id = ? AND kind = 'collection'
	`, owe.ID).Scan(&collection); err != nil {
		t.Fatal(err)
	}
	if collection != 2000 {
		t.Fatalf("collection %d", collection)
	}

	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	zero := decodeAdmission(t, w)
	var linesBefore int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_ledger WHERE admission_id = ?`, zero.ID).Scan(&linesBefore); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions/"+strconv.FormatInt(zero.ID, 10)+"/discharge", token, ``)
	mustCode(t, w, http.StatusOK)
	zeroSettled := decodeAdmission(t, w)
	if zeroSettled.Status != "settled" || zeroSettled.BalanceMMK == nil || *zeroSettled.BalanceMMK != 0 || len(zeroSettled.Ledger) != linesBefore {
		t.Fatalf("zero discharge %+v lines %d", zeroSettled, linesBefore)
	}

	ipdCash, err = buildIpdCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	if ipdCash.CollectionMMK != 2000 || ipdCash.NetMMK != 2500 {
		t.Fatalf("ipd cash after collection %+v", ipdCash)
	}
	w = doJSON(ipd, http.MethodGet, "/api/ipd/daily-cash?date="+today, opdTok, "")
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(dash, http.MethodGet, "/api/dashboard/overview?date="+today, token, "")
	mustCode(t, w, http.StatusOK)
	var overview struct {
		GrandTotalMMK int64 `json:"grand_total_mmk"`
		IpdCashMMK    int64 `json:"ipd_cash_mmk"`
		OPDTotalMMK   int64 `json:"opd_total_mmk"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &overview); err != nil {
		t.Fatal(err)
	}
	if overview.GrandTotalMMK != 5742 || overview.OPDTotalMMK != 5742 || overview.IpdCashMMK != 2500 {
		t.Fatalf("overview %+v", overview)
	}

	if _, err := sqlDB.Exec(`UPDATE ipd_ledger SET created_at = '1999-01-01 00:00:00' WHERE kind = 'collection'`); err != nil {
		t.Fatal(err)
	}
	ipdCash, err = buildIpdCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	if ipdCash.CollectionMMK != 0 || ipdCash.NetMMK != 500 {
		t.Fatalf("old collection still in today %+v", ipdCash)
	}

	var movesBefore int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&movesBefore); err != nil {
		t.Fatal(err)
	}
	w = doJSON(charts, http.MethodPost, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/attach", opdTok, `{"bill_no":"OPD-LEGACY"}`)
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(charts, http.MethodPost, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/attach", patientsTok, `{"bill_no":"OPD-LEGACY"}`)
	mustCode(t, w, http.StatusOK)
	var legacyPatient sql.NullInt64
	var legacyTotal int64
	if err := sqlDB.QueryRow(`SELECT patient_id, total_mmk FROM opd_bills WHERE bill_no = 'OPD-LEGACY'`).Scan(&legacyPatient, &legacyTotal); err != nil {
		t.Fatal(err)
	}
	if !legacyPatient.Valid || legacyPatient.Int64 != chart.ID || legacyTotal != 4242 {
		t.Fatalf("legacy patient %v total %d", legacyPatient, legacyTotal)
	}
	w = doJSON(charts, http.MethodPost, "/api/patients/"+strconv.FormatInt(other.ID, 10)+"/attach", patientsTok, `{"bill_no":"OPD-LEGACY"}`)
	mustCode(t, w, http.StatusConflict)
	w = doJSON(charts, http.MethodPost, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/attach", patientsTok,
		fmt.Sprintf(`{"bill_no":"%s"}`, cashBill.BillNo))
	mustCode(t, w, http.StatusConflict)

	if _, err := sqlDB.Exec(`
		INSERT INTO opd_bills (bill_no, patient_name, status, total_mmk) VALUES ('OPD-000088', 'Daw Settle', 'paid', 77)
	`); err != nil {
		t.Fatal(err)
	}
	var guessed sql.NullInt64
	if err := sqlDB.QueryRow(`SELECT patient_id FROM opd_bills WHERE bill_no = 'OPD-000088'`).Scan(&guessed); err != nil {
		t.Fatal(err)
	}
	if guessed.Valid {
		t.Fatal("name match attached a bill")
	}
	w = doJSON(charts, http.MethodPost, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/attach", patientsTok, `{"bill_no":"NO-SUCH"}`)
	mustCode(t, w, http.StatusNotFound)
	w = doJSON(charts, http.MethodPost, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/attach", patientsTok, `{"bill_no":"  "}`)
	mustCode(t, w, http.StatusBadRequest)

	if _, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bills (bill_no, patient_name, status, total_mmk) VALUES ('TO-000099', 'Transfer', 'paid', 10)
	`); err != nil {
		t.Fatal(err)
	}
	w = doJSON(charts, http.MethodPost, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/attach", patientsTok, `{"bill_no":"to-000099"}`)
	mustCode(t, w, http.StatusBadRequest)
	var transferPatient sql.NullInt64
	var transferTotal int64
	if err := sqlDB.QueryRow(`SELECT patient_id, total_mmk FROM pharmacy_bills WHERE bill_no = 'TO-000099'`).Scan(&transferPatient, &transferTotal); err != nil {
		t.Fatal(err)
	}
	if transferPatient.Valid || transferTotal != 10 {
		t.Fatalf("transfer patient %v total %d", transferPatient, transferTotal)
	}

	caseRes, err := sqlDB.Exec(`INSERT INTO ot_cases (case_no, patient_name, status) VALUES ('OT-000099', 'Daw Settle', 'billed')`)
	if err != nil {
		t.Fatal(err)
	}
	caseID, _ := caseRes.LastInsertId()
	billRes, err := sqlDB.Exec(`
		INSERT INTO ot_bills (bill_no, case_id, case_no, patient_name, status, total_mmk)
		VALUES ('OTB-000099', ?, 'OT-000099', 'Daw Settle', 'paid', 900)
	`, caseID)
	if err != nil {
		t.Fatal(err)
	}
	otBillID, _ := billRes.LastInsertId()
	if _, err := sqlDB.Exec(`UPDATE ot_cases SET ot_bill_id = ? WHERE id = ?`, otBillID, caseID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(charts, http.MethodPost, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/attach", patientsTok, `{"bill_no":"otb-000099"}`)
	mustCode(t, w, http.StatusOK)
	var otPatient sql.NullInt64
	var otTotal int64
	if err := sqlDB.QueryRow(`SELECT patient_id FROM ot_cases WHERE id = ?`, caseID).Scan(&otPatient); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT total_mmk FROM ot_bills WHERE id = ?`, otBillID).Scan(&otTotal); err != nil {
		t.Fatal(err)
	}
	if !otPatient.Valid || otPatient.Int64 != chart.ID || otTotal != 900 {
		t.Fatalf("ot patient %v total %d", otPatient, otTotal)
	}
	var movesAfter int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&movesAfter); err != nil {
		t.Fatal(err)
	}
	if movesAfter != movesBefore {
		t.Fatalf("attach moved stock %d -> %d", movesBefore, movesAfter)
	}

	w = doJSON(charts, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", patientsTok, "")
	mustCode(t, w, http.StatusOK)
	hist := decodeHistory(t, w)
	if len(hist.OPD) < 2 || len(hist.Pharmacy) < 1 || len(hist.OT) != 1 || len(hist.IPD) != 3 {
		t.Fatalf("history opd %d pharmacy %d ot %d ipd %d", len(hist.OPD), len(hist.Pharmacy), len(hist.OT), len(hist.IPD))
	}
	if hist.OT[0].CaseNo != "OT-000099" {
		t.Fatalf("ot history %+v", hist.OT)
	}
	settledSeen := 0
	for _, row := range hist.IPD {
		if row.Settled && row.BalanceMMK == 0 {
			settledSeen++
		}
	}
	if settledSeen != 3 {
		t.Fatalf("ipd history %+v", hist.IPD)
	}
	w = doJSON(charts, http.MethodGet, "/api/patients/"+strconv.FormatInt(other.ID, 10)+"/history", patientsTok, "")
	mustCode(t, w, http.StatusOK)
	if len(decodeHistory(t, w).OT) != 0 || len(decodeHistory(t, w).OPD) != 0 {
		t.Fatal("other chart gained a guessed visit")
	}
}
