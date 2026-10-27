package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestIPDLedger(t *testing.T) {
	sqlDB := openTestDB(t)
	for _, table := range []string{"opd_bills", "ot_bills", "pharmacy_bills"} {
		if !columnExists(t, sqlDB, table, "admission_id") || !columnExists(t, sqlDB, table, "collected_cash") {
			t.Fatalf("%s missing admission columns", table)
		}
	}
	var applied int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '022_ipd_ledger'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatal("022_ipd_ledger was not recorded")
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '023_bill_admission'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatal("023_bill_admission was not applied")
	}

	if _, err := sqlDB.Exec(`
		UPDATE hospital_settings
		SET hospital_name = 'Verify Hospital', address = '1 Lane', phone = '091000'
		WHERE id = 1
	`); err != nil {
		t.Fatal(err)
	}

	var stockMoves, batches, otBatches, opdBills int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&stockMoves); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM item_batches`).Scan(&batches); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ot_batches`).Scan(&otBatches); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM opd_bills`).Scan(&opdBills); err != nil {
		t.Fatal(err)
	}

	_, ipdTok := insertSession(t, sqlDB, auth.RoleIPD, 0)
	ipdUser := int64(0)
	if err := sqlDB.QueryRow(`SELECT user_id FROM sessions WHERE token = ?`, ipdTok).Scan(&ipdUser); err != nil {
		t.Fatal(err)
	}
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	_, patientsTok := insertSession(t, sqlDB, auth.RolePatients, 0)
	h := &IPD{DB: sqlDB}
	charts := &Patients{DB: sqlDB}

	w := doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Daw Ledger","phone":"093333","age_years":51,"gender":"F"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", ipdTok, `{"patient_id":`+strconv.FormatInt(chart.ID, 10)+`}`)
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)
	stayPath := "/api/ipd/admissions/" + strconv.FormatInt(stay.ID, 10)

	w = doJSON(h, http.MethodPost, stayPath+"/deposits", opdTok, `{"amount_mmk":10000}`)
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(h, http.MethodPost, stayPath+"/deposits", patientsTok, `{"amount_mmk":10000}`)
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(h, http.MethodPost, stayPath+"/deposits", ipdTok, `{"amount_mmk":0}`)
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(h, http.MethodPost, stayPath+"/deposits", ipdTok, `{"amount_mmk":-5}`)
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(h, http.MethodPost, stayPath+"/ward-charges", ipdTok, `{"description":"  ","amount_mmk":1000}`)
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(h, http.MethodPost, "/api/ipd/admissions/999999/deposits", ipdTok, `{"amount_mmk":1000}`)
	mustCode(t, w, http.StatusNotFound)

	w = doJSON(h, http.MethodPost, stayPath+"/deposits", ipdTok, `{"amount_mmk":10000,"note":" advance "}`)
	mustCode(t, w, http.StatusCreated)
	first := decodeAdmission(t, w)
	if first.BalanceMMK == nil || *first.BalanceMMK != 10000 || len(first.Ledger) != 1 {
		t.Fatalf("first deposit %+v", first)
	}
	if first.Ledger[0].Kind != "deposit" || first.Ledger[0].AmountMMK != 10000 || first.Ledger[0].Note != "advance" {
		t.Fatalf("deposit line %+v", first.Ledger[0])
	}
	if first.Ledger[0].ActorUserID == nil || *first.Ledger[0].ActorUserID != ipdUser || first.Ledger[0].Source != "" || first.Ledger[0].SourceID != nil {
		t.Fatalf("deposit actor %+v", first.Ledger[0])
	}
	depositID := first.Ledger[0].ID

	w = doJSON(h, http.MethodPost, stayPath+"/deposits", adminTok, `{"amount_mmk":5000}`)
	mustCode(t, w, http.StatusCreated)
	second := decodeAdmission(t, w)
	if second.BalanceMMK == nil || *second.BalanceMMK != 15000 || len(second.Ledger) != 2 || second.Ledger[1].AmountMMK != 5000 {
		t.Fatalf("second deposit %+v", second)
	}

	w = doJSON(h, http.MethodPost, stayPath+"/ward-charges", ipdTok, `{"description":" Room night ","amount_mmk":3000}`)
	mustCode(t, w, http.StatusCreated)
	charged := decodeAdmission(t, w)
	if charged.BalanceMMK == nil || *charged.BalanceMMK != 12000 || len(charged.Ledger) != 3 {
		t.Fatalf("balance %+v lines %d", charged.BalanceMMK, len(charged.Ledger))
	}
	ward := charged.Ledger[2]
	if ward.Kind != "ward" || ward.AmountMMK != -3000 || ward.Note != "Room night" {
		t.Fatalf("ward line %+v", ward)
	}

	w = doJSON(h, http.MethodGet, stayPath, ipdTok, "")
	mustCode(t, w, http.StatusOK)
	got := decodeAdmission(t, w)
	if got.BalanceMMK == nil || *got.BalanceMMK != 12000 || len(got.Ledger) != 3 {
		t.Fatalf("get %+v", got)
	}
	var summed int64
	for _, line := range got.Ledger {
		summed += line.AmountMMK
	}
	if summed != *got.BalanceMMK {
		t.Fatalf("sum %d balance %d", summed, *got.BalanceMMK)
	}

	w = doJSON(h, http.MethodGet, stayPath+"/ledger/"+strconv.FormatInt(depositID, 10)+"/print", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("content type %s", ct)
	}
	body := w.Body.String()
	for _, want := range []string{"Verify Hospital", "1 Lane", "091000", "IPD DEPOSIT", "Daw Ledger", "10,000", "12,000", "advance", stay.AdmissionNo} {
		if !strings.Contains(body, want) {
			t.Fatalf("receipt missing %q in %s", want, body)
		}
	}
	if strings.Contains(body, "PAID — CASH") || strings.Contains(body, "Room night") {
		t.Fatalf("receipt looks like a desk bill: %s", body)
	}

	w = doJSON(h, http.MethodGet, stayPath+"/ledger/"+strconv.FormatInt(ward.ID, 10)+"/print", ipdTok, "")
	mustCode(t, w, http.StatusBadRequest)

	res, err := sqlDB.Exec(`
		INSERT INTO opd_bills (bill_no, patient_id, patient_name, doctor_name, status, total_mmk, admission_id, collected_cash, created_at)
		VALUES ('OPD-LEDGER-1', ?, 'Daw Ledger', 'Dr A', 'paid', 2000, ?, 0, datetime('now'))
	`, chart.ID, stay.ID)
	if err != nil {
		t.Fatal(err)
	}
	opdBillID, _ := res.LastInsertId()
	res, err = sqlDB.Exec(`
		INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, source, source_id, note)
		VALUES (?, 'charge', -2000, 'opd', ?, 'OPD-LEDGER-1')
	`, stay.ID, opdBillID)
	if err != nil {
		t.Fatal(err)
	}
	chargeLineID, _ := res.LastInsertId()
	w = doJSON(h, http.MethodGet, stayPath+"/ledger/"+strconv.FormatInt(chargeLineID, 10)+"/print", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("bill print content type %s", ct)
	}
	billHTML := w.Body.String()
	if !strings.Contains(billHTML, "OPD-LEDGER-1") {
		t.Fatalf("bill receipt missing bill no: %s", billHTML)
	}
	var printedAt sql.NullString
	if err := sqlDB.QueryRow(`SELECT printed_at FROM opd_bills WHERE id = ?`, opdBillID).Scan(&printedAt); err != nil {
		t.Fatal(err)
	}
	if printedAt.Valid {
		t.Fatalf("ledger bill print must not stamp printed_at, got %q", printedAt.String)
	}

	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET status = 'settled' WHERE id = ?`, stay.ID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(h, http.MethodPost, stayPath+"/deposits", ipdTok, `{"amount_mmk":1000}`)
	mustCode(t, w, http.StatusConflict)
	w = doJSON(h, http.MethodPost, stayPath+"/ward-charges", ipdTok, `{"description":"Late","amount_mmk":1000}`)
	mustCode(t, w, http.StatusConflict)
	var rows int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_ledger WHERE admission_id = ?`, stay.ID).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 4 {
		t.Fatalf("settled stay gained rows %d", rows)
	}
	if _, err := sqlDB.Exec(`INSERT INTO ipd_ledger (admission_id, kind, amount_mmk) VALUES (?, 'tip', 1)`, stay.ID); err == nil {
		t.Fatal("unknown kind inserted")
	}

	var stockAfter, batchesAfter, otAfter, opdAfter int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&stockAfter); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM item_batches`).Scan(&batchesAfter); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ot_batches`).Scan(&otAfter); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM opd_bills`).Scan(&opdAfter); err != nil {
		t.Fatal(err)
	}
	if stockMoves != stockAfter || batches != batchesAfter || otBatches != otAfter || opdBills+1 != opdAfter {
		t.Fatalf("stock or bills changed moves %d→%d batches %d→%d ot %d→%d opd %d→%d",
			stockMoves, stockAfter, batches, batchesAfter, otBatches, otAfter, opdBills, opdAfter)
	}
	var auditN int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM audit_logs WHERE entity = 'ipd_ledger' AND action = 'create'
	`).Scan(&auditN); err != nil {
		t.Fatal(err)
	}
	if auditN != 3 {
		t.Fatalf("ledger audit rows %d", auditN)
	}
}
