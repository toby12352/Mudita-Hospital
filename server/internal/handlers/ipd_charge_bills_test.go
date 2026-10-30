package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"mudita-hospital/server/internal/db"
)

func TestIpdChargeBills(t *testing.T) {
	sqlDB := openTestDB(t)

	var applied int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '038_ipd_charge_bills'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("038 not recorded: %d", applied)
	}
	for _, table := range []string{"ipd_charge_bills", "ipd_charge_bill_lines", "ipd_charge_bill_number_seq"} {
		var n int
		if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Fatalf("%s missing", table)
		}
	}
	var nextNum int64
	if err := sqlDB.QueryRow(`SELECT next_num FROM ipd_charge_bill_number_seq WHERE id = 1`).Scan(&nextNum); err != nil {
		t.Fatal(err)
	}
	if nextNum != 1 {
		t.Fatalf("charge bill sequence = %d", nextNum)
	}

	keepStay := insertStay(t, sqlDB, "IPD-KEEP-CHARGE")
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, note, created_at)
		VALUES (?, 'deposit', 5000, 'keep', '2026-01-01 02:00:00')
	`, keepStay); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(sqlDB); err != nil {
		t.Fatalf("remigrate: %v", err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '038_ipd_charge_bills'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("038 recorded %d times", applied)
	}
	assertKeptDeposit(t, sqlDB, keepStay)

	_, adminTok := insertSession(t, sqlDB, "Admin", 0)
	_, ipdTok := insertSession(t, sqlDB, "IPD", 0)
	_, opdTok := insertSession(t, sqlDB, "OPD", 0)
	h := &IPD{DB: sqlDB}
	charts := &Patients{DB: sqlDB}

	w := doJSON(h, http.MethodPost, "/api/ipd/charge-bills", opdTok, `{"patient_name":"Nope","lines":[{"description":"X","qty":1,"unit_price_mmk":1}]}`)
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Daw Fee","phone":"09123","age_years":44,"gender":"F"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"U Walkin","phone":"09222"}`)
	mustCode(t, w, http.StatusCreated)
	walkIn := decodePatient(t, w)

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", ipdTok, `{"patient_id":`+strconv.FormatInt(chart.ID, 10)+`}`)
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)
	if !strings.HasPrefix(stay.AdmissionNo, "IPD-") {
		t.Fatalf("admission no %s", stay.AdmissionNo)
	}

	draftBody := `{
		"patient_id":` + strconv.FormatInt(chart.ID, 10) + `,
		"patient_name":"Daw Fee",
		"patient_phone":"09123",
		"patient_age_years":44,
		"patient_gender":"F",
		"discount_value":10,
		"discount_unit":"percent",
		"lines":[{"description":"Dressing","qty":2,"unit_price_mmk":2000}]
	}`
	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills", ipdTok, draftBody)
	mustCode(t, w, http.StatusCreated)
	bill := decodeChargeBill(t, w)
	if bill.BillNo != "IPB-000001" || bill.Status != "draft" || bill.AdmissionID != nil {
		t.Fatalf("created %+v", bill)
	}
	if strings.HasPrefix(bill.BillNo, "IPD-") || bill.BillNo == stay.AdmissionNo {
		t.Fatalf("charge number shared the admission sequence: %s %s", bill.BillNo, stay.AdmissionNo)
	}
	if bill.TotalMMK != 4000 || bill.DiscountMMK != 400 || bill.DiscountUnit != "percent" {
		t.Fatalf("amounts total=%d discount=%d unit=%s", bill.TotalMMK, bill.DiscountMMK, bill.DiscountUnit)
	}
	if bill.PatientID == nil || *bill.PatientID != chart.ID || len(bill.Lines) != 1 || bill.Lines[0].LineTotalMMK != 4000 {
		t.Fatalf("draft lines %+v", bill)
	}

	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills", ipdTok, `{"patient_name":"X","lines":[{"description":"Bad","qty":1.5,"unit_price_mmk":100}]}`)
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(errorText(t, w), "integer") {
		t.Fatalf("fractional qty: %s", w.Body.String())
	}

	updated := `{
		"patient_id":` + strconv.FormatInt(chart.ID, 10) + `,
		"patient_name":"Daw Fee",
		"patient_phone":"09123",
		"patient_age_years":44,
		"patient_gender":"F",
		"discount_value":500,
		"discount_unit":"mmk",
		"lines":[{"description":"Dressing","qty":1,"unit_price_mmk":5000}]
	}`
	w = doJSON(h, http.MethodPut, "/api/ipd/charge-bills/"+strconv.FormatInt(bill.ID, 10), ipdTok, updated)
	mustCode(t, w, http.StatusOK)
	bill = decodeChargeBill(t, w)
	if bill.TotalMMK != 5000 || bill.DiscountMMK != 500 || bill.DiscountUnit != "mmk" || bill.Lines[0].Qty != 1 {
		t.Fatalf("updated %+v", bill)
	}
	const net = int64(4500)

	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills/"+strconv.FormatInt(bill.ID, 10)+"/printed", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	bill = decodeChargeBill(t, w)
	if bill.PrintedAt == nil || *bill.PrintedAt == "" {
		t.Fatal("printed_at not set")
	}

	w = doJSON(h, http.MethodGet, "/api/ipd/charge-bills/"+strconv.FormatInt(bill.ID, 10)+"/print", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("content type %s", ct)
	}
	draftHTML := w.Body.String()
	for _, want := range []string{"IPD CHARGE BILL", "Particular", "Qty", "Fee", "Dressing", "Daw Fee", "DRAFT", "@page{size:A4"} {
		if !strings.Contains(draftHTML, want) {
			t.Fatalf("draft slip missing %q", want)
		}
	}
	for _, absent := range []string{"Charged to IPD", "Deposited Fee", "IPD DAILY STATEMENT", "To Pay"} {
		if strings.Contains(draftHTML, absent) {
			t.Fatalf("draft slip includes %q", absent)
		}
	}

	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills", ipdTok, `{"patient_name":"Typed Only","lines":[{"description":"Note","qty":1,"unit_price_mmk":100}]}`)
	mustCode(t, w, http.StatusCreated)
	typed := decodeChargeBill(t, w)
	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills/"+strconv.FormatInt(typed.ID, 10)+"/charge", ipdTok, "")
	mustCode(t, w, http.StatusBadRequest)
	if errorText(t, w) != "patient chart required" {
		t.Fatalf("typed name: %s", w.Body.String())
	}

	walkBody := `{
		"patient_id":` + strconv.FormatInt(walkIn.ID, 10) + `,
		"patient_name":"U Walkin",
		"lines":[{"description":"Visit","qty":1,"unit_price_mmk":100}]
	}`
	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills", ipdTok, walkBody)
	mustCode(t, w, http.StatusCreated)
	walkBill := decodeChargeBill(t, w)
	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills/"+strconv.FormatInt(walkBill.ID, 10)+"/charge", ipdTok, "")
	mustCode(t, w, http.StatusConflict)
	if errorText(t, w) != "no open stay" {
		t.Fatalf("no stay: %s", w.Body.String())
	}

	before := mustMove(t, sqlDB, localToday())
	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills/"+strconv.FormatInt(bill.ID, 10)+"/charge", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	bill = decodeChargeBill(t, w)
	if bill.Status != "charged" || bill.AdmissionID == nil || *bill.AdmissionID != stay.ID {
		t.Fatalf("charged %+v stay %d", bill, stay.ID)
	}
	var kind, source, note string
	var amount, sourceID int64
	if err := sqlDB.QueryRow(`
		SELECT kind, amount_mmk, source, source_id, note
		FROM ipd_ledger
		WHERE admission_id = ? AND kind = 'charge' AND source = 'ipd' AND source_id = ?
	`, stay.ID, bill.ID).Scan(&kind, &amount, &source, &sourceID, &note); err != nil {
		t.Fatal(err)
	}
	if amount != -net || source != "ipd" || sourceID != bill.ID || note != bill.BillNo {
		t.Fatalf("ledger kind=%s amount=%d source=%s id=%d note=%s", kind, amount, source, sourceID, note)
	}
	var drawerKinds int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM ipd_ledger
		WHERE admission_id = ? AND kind IN ('deposit', 'collection', 'refund')
	`, stay.ID).Scan(&drawerKinds); err != nil {
		t.Fatal(err)
	}
	if drawerKinds != 0 {
		t.Fatalf("charge wrote %d drawer lines", drawerKinds)
	}
	after := mustMove(t, sqlDB, localToday())
	if after.IncomeMMK-before.IncomeMMK != net || after.IPD.NetMMK != before.IPD.NetMMK || after.NetCashMMK != before.NetCashMMK {
		t.Fatalf("income delta %d drawer %d→%d net %d→%d", after.IncomeMMK-before.IncomeMMK, before.IPD.NetMMK, after.IPD.NetMMK, before.NetCashMMK, after.NetCashMMK)
	}

	w = doJSON(h, http.MethodPut, "/api/ipd/charge-bills/"+strconv.FormatInt(bill.ID, 10), ipdTok, updated)
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills/"+strconv.FormatInt(bill.ID, 10)+"/printed", ipdTok, "")
	mustCode(t, w, http.StatusBadRequest)

	w = doJSON(h, http.MethodGet, "/api/ipd/charge-bills/"+strconv.FormatInt(bill.ID, 10)+"/print", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	chargedHTML := w.Body.String()
	for _, want := range []string{"Charged to IPD", "Particular", "Qty", "Fee", stay.AdmissionNo, bill.BillNo} {
		if !strings.Contains(chargedHTML, want) {
			t.Fatalf("charged slip missing %q", want)
		}
	}
	for _, absent := range []string{"Deposited Fee", "IPD DAILY STATEMENT", "To Pay", "Difference"} {
		if strings.Contains(chargedHTML, absent) {
			t.Fatalf("charged slip includes %q", absent)
		}
	}

	var lineID int64
	var createdAt string
	if err := sqlDB.QueryRow(`
		SELECT id, created_at FROM ipd_ledger
		WHERE source = 'ipd' AND source_id = ? AND kind = 'charge'
	`, bill.ID).Scan(&lineID, &createdAt); err != nil {
		t.Fatal(err)
	}
	w = doJSON(h, http.MethodGet, "/api/ipd/admissions/"+strconv.FormatInt(stay.ID, 10)+"/ledger/"+strconv.FormatInt(lineID, 10)+"/print", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), "Charged to IPD") || !strings.Contains(w.Body.String(), bill.BillNo) {
		t.Fatalf("ledger print missing the charge slip: %s", w.Body.String())
	}
	chargeDay, ok := yangonDateKey(createdAt)
	if !ok {
		t.Fatal("charge day")
	}
	w = doJSON(h, http.MethodGet, "/api/ipd/admissions/"+strconv.FormatInt(stay.ID, 10)+"/statement?date="+chargeDay, ipdTok, "")
	mustCode(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), "IPD charge") || !strings.Contains(w.Body.String(), bill.BillNo) {
		t.Fatalf("daily sheet missing the charge: %s", w.Body.String())
	}

	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_day_vouchers (admission_id, civil_date, status, closing_mmk)
		VALUES (?, ?, 'issued', -999)
	`, stay.ID, chargeDay); err != nil {
		t.Fatal(err)
	}
	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills/"+strconv.FormatInt(bill.ID, 10)+"/void", ipdTok, `{"reason":"wrong item"}`)
	mustCode(t, w, http.StatusOK)
	bill = decodeChargeBill(t, w)
	if bill.Status != "void" || bill.VoidReason != "wrong item" {
		t.Fatalf("void %+v", bill)
	}
	var reversal int64
	var revAt string
	if err := sqlDB.QueryRow(`
		SELECT amount_mmk, created_at FROM ipd_ledger
		WHERE admission_id = ? AND source = 'ipd' AND source_id = ? AND kind = 'reversal'
	`, stay.ID, bill.ID).Scan(&reversal, &revAt); err != nil {
		t.Fatal(err)
	}
	if reversal != net {
		t.Fatalf("reversal %d", reversal)
	}
	var staySum int64
	if err := sqlDB.QueryRow(`SELECT COALESCE(SUM(amount_mmk), 0) FROM ipd_ledger WHERE admission_id = ?`, stay.ID).Scan(&staySum); err != nil {
		t.Fatal(err)
	}
	if staySum != 0 {
		t.Fatalf("stay balance %d", staySum)
	}
	revDay, ok := yangonDateKey(revAt)
	if !ok {
		t.Fatal("reversal day")
	}
	var voucherStatus string
	var closing int64
	if err := sqlDB.QueryRow(`
		SELECT status, closing_mmk FROM ipd_day_vouchers
		WHERE admission_id = ? AND civil_date = ?
	`, stay.ID, chargeDay).Scan(&voucherStatus, &closing); err != nil {
		t.Fatal(err)
	}
	wantClosing := -net
	if chargeDay == revDay {
		wantClosing = 0
	}
	if voucherStatus != "issued" || closing != wantClosing {
		t.Fatalf("voucher %s closing %d want %d", voucherStatus, closing, wantClosing)
	}
	voided := mustMove(t, sqlDB, localToday())
	if voided.IncomeMMK != before.IncomeMMK || voided.IPD.NetMMK != before.IPD.NetMMK {
		t.Fatalf("after void income %d want %d drawer %d want %d", voided.IncomeMMK, before.IncomeMMK, voided.IPD.NetMMK, before.IPD.NetMMK)
	}

	secondBody := `{
		"patient_id":` + strconv.FormatInt(chart.ID, 10) + `,
		"patient_name":"Daw Fee",
		"lines":[{"description":"Injection","qty":1,"unit_price_mmk":1000}]
	}`
	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills", ipdTok, secondBody)
	mustCode(t, w, http.StatusCreated)
	second := decodeChargeBill(t, w)
	if second.BillNo != "IPB-000004" {
		t.Fatalf("second bill no %s", second.BillNo)
	}
	paidBase := mustMove(t, sqlDB, localToday())
	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills/"+strconv.FormatInt(second.ID, 10)+"/charge", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	second = decodeChargeBill(t, w)
	paidMove := mustMove(t, sqlDB, localToday())
	if paidMove.IncomeMMK-paidBase.IncomeMMK != 1000 || paidMove.IPD.NetMMK != paidBase.IPD.NetMMK {
		t.Fatalf("second charge income delta %d drawer %d→%d", paidMove.IncomeMMK-paidBase.IncomeMMK, paidBase.IPD.NetMMK, paidMove.IPD.NetMMK)
	}
	var secondAt string
	if err := sqlDB.QueryRow(`
		SELECT created_at FROM ipd_ledger
		WHERE source = 'ipd' AND source_id = ? AND kind = 'charge'
	`, second.ID).Scan(&secondAt); err != nil {
		t.Fatal(err)
	}
	secondDay, ok := yangonDateKey(secondAt)
	if !ok {
		t.Fatal("second charge day")
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_day_vouchers (admission_id, civil_date, status, closing_mmk)
		VALUES (?, ?, 'paid', -1000)
		ON CONFLICT(admission_id, civil_date) DO UPDATE SET status = 'paid', closing_mmk = -1000
	`, stay.ID, secondDay); err != nil {
		t.Fatal(err)
	}
	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills/"+strconv.FormatInt(second.ID, 10)+"/void", ipdTok, `{"reason":"too late"}`)
	mustCode(t, w, http.StatusConflict)
	if errorText(t, w) != "day is already paid" {
		t.Fatalf("paid day: %s", w.Body.String())
	}
	var still string
	if err := sqlDB.QueryRow(`SELECT status FROM ipd_charge_bills WHERE id = ?`, second.ID).Scan(&still); err != nil {
		t.Fatal(err)
	}
	if still != "charged" {
		t.Fatalf("status after refused void %s", still)
	}
	var revCount int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM ipd_ledger
		WHERE source = 'ipd' AND source_id = ? AND kind = 'reversal'
	`, second.ID).Scan(&revCount); err != nil {
		t.Fatal(err)
	}
	if revCount != 0 {
		t.Fatalf("paid day wrote %d reversals", revCount)
	}

	w = doJSON(h, http.MethodPost, "/api/ipd/charge-bills/"+strconv.FormatInt(typed.ID, 10)+"/void", ipdTok, `{"reason":"scratch"}`)
	mustCode(t, w, http.StatusOK)
	typed = decodeChargeBill(t, w)
	if typed.Status != "void" {
		t.Fatalf("draft void %+v", typed)
	}
	var typedLedger int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_ledger WHERE source = 'ipd' AND source_id = ?`, typed.ID).Scan(&typedLedger); err != nil {
		t.Fatal(err)
	}
	if typedLedger != 0 {
		t.Fatalf("draft void wrote %d ledger rows", typedLedger)
	}

	w = doJSON(h, http.MethodGet, "/api/ipd/charge-bills?q=Daw+Fee&money=paid", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	listed := decodeChargeBillList(t, w)
	if len(listed) != 1 || listed[0].ID != second.ID || listed[0].Status != "charged" {
		t.Fatalf("charged list %+v", listed)
	}

	w = doJSON(h, http.MethodDelete, "/api/ipd/charge-bills/"+strconv.FormatInt(second.ID, 10), ipdTok, "")
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(h, http.MethodDelete, "/api/ipd/charge-bills/"+strconv.FormatInt(second.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(h, http.MethodDelete, "/api/ipd/charge-bills/"+strconv.FormatInt(typed.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	if err := sqlDB.QueryRow(`SELECT status FROM ipd_charge_bills WHERE id = ?`, typed.ID).Scan(&still); err != nil {
		t.Fatal(err)
	}
	if still != "deleted" {
		t.Fatalf("purged status %s", still)
	}

	setVoucherEpochDate(t, sqlDB, "2000-01-01")
	epochMove := mustMove(t, sqlDB, localToday())
	if epochMove.IPDEarned.EarnedMMK != epochMove.IPD.NetMMK {
		t.Fatalf("epoch earned %d drawer %d", epochMove.IPDEarned.EarnedMMK, epochMove.IPD.NetMMK)
	}
	for _, line := range epochMove.IPDEarned.Lines {
		if line.Kind == "charge" || line.Kind == "reversal" || line.Kind == "ward" {
			t.Fatalf("epoch income still has %s", line.Kind)
		}
	}
	if epochMove.IPD.NetMMK != 0 {
		t.Fatalf("drawer %d", epochMove.IPD.NetMMK)
	}

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions/"+strconv.FormatInt(stay.ID, 10)+"/ward-charges", ipdTok, `{"description":"Bed","amount_mmk":1500}`)
	mustCode(t, w, http.StatusCreated)
	assertKeptDeposit(t, sqlDB, keepStay)
}

func assertKeptDeposit(t *testing.T, sqlDB *sql.DB, admissionID int64) {
	t.Helper()
	var kind, note string
	var amount int64
	if err := sqlDB.QueryRow(`
		SELECT kind, amount_mmk, note FROM ipd_ledger WHERE admission_id = ? AND note = 'keep'
	`, admissionID).Scan(&kind, &amount, &note); err != nil {
		t.Fatal(err)
	}
	if kind != "deposit" || amount != 5000 || note != "keep" {
		t.Fatalf("kept ledger %s %d %s", kind, amount, note)
	}
}

func decodeChargeBill(t *testing.T, w *httptest.ResponseRecorder) ipdChargeBill {
	t.Helper()
	var bill ipdChargeBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatalf("bill json: %v body=%s", err, w.Body.String())
	}
	return bill
}

func decodeChargeBillList(t *testing.T, w *httptest.ResponseRecorder) []ipdChargeBill {
	t.Helper()
	var body struct {
		Bills []ipdChargeBill `json:"bills"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("list json: %v body=%s", err, w.Body.String())
	}
	return body.Bills
}
