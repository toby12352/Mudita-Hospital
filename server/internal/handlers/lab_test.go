package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func TestLabServicesAndBills(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	lab := &Lab{DB: sqlDB}
	opd := &OPD{DB: sqlDB}
	ipd := &IPD{DB: sqlDB}
	charts := &Patients{DB: sqlDB}

	// Existing OPD bill must survive migration (already applied by openTestDB).
	if _, err := sqlDB.Exec(`
		INSERT INTO opd_bills (bill_no, patient_name, status, total_mmk)
		VALUES ('OPD-PRELAB', 'Pre Lab', 'draft', 999)
	`); err != nil {
		t.Fatal(err)
	}
	var preTotal int64
	if err := sqlDB.QueryRow(`SELECT total_mmk FROM opd_bills WHERE bill_no = 'OPD-PRELAB'`).Scan(&preTotal); err != nil {
		t.Fatal(err)
	}
	if preTotal != 999 {
		t.Fatalf("pre-lab opd bill %d", preTotal)
	}

	w := doJSON(lab, http.MethodPost, "/api/lab/services", token, `{"name":"CBC","price_mmk":5000}`)
	mustCode(t, w, http.StatusCreated)
	a := decodeLabService(t, w)
	if a.Code != "" || a.Name != "CBC" || a.PriceMMK != 5000 {
		t.Fatalf("first blank code: %+v", a)
	}

	w = doJSON(lab, http.MethodPost, "/api/lab/services", token, `{"name":"ESR","price_mmk":2000}`)
	mustCode(t, w, http.StatusCreated)
	b := decodeLabService(t, w)
	if b.Code != "" || b.ID == a.ID {
		t.Fatalf("second blank code: %+v", b)
	}

	w = doJSON(lab, http.MethodPost, "/api/lab/services", token, `{"name":"No price"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("missing price: got %d %s", w.Code, w.Body.String())
	}

	w = doJSON(lab, http.MethodPost, "/api/lab/services", token, `{"code":"XRAY","name":"Chest X-ray","price_mmk":15000}`)
	mustCode(t, w, http.StatusCreated)
	xray := decodeLabService(t, w)

	if _, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('OPDSVC', 'OPD only', 100)`); err != nil {
		t.Fatal(err)
	}
	// Lab only resolves lab_services. An id that is not in that catalog is refused.
	w = doJSON(lab, http.MethodPost, "/api/lab/bills", token, `{
		"patient_name":"Daw Lab",
		"lines":[{"line_type":"service","ref_id":99999,"qty":1}]
	}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("unknown lab service id: got %d %s", w.Code, w.Body.String())
	}

	w = doJSON(lab, http.MethodPost, "/api/lab/bills", token, fmt.Sprintf(`{
		"patient_name":"Daw Lab",
		"lines":[{"line_type":"service","ref_id":%d,"qty":2}]
	}`, xray.ID))
	mustCode(t, w, http.StatusCreated)
	bill := decodeLabBill(t, w)
	if bill.BillNo == "" || bill.BillNo[:4] != "LAB-" {
		t.Fatalf("bill_no %s", bill.BillNo)
	}
	if bill.TotalMMK != 30000 || len(bill.Lines) != 1 || bill.Lines[0].Code != "XRAY" {
		t.Fatalf("bill %+v", bill)
	}

	w = doJSON(lab, http.MethodPost, fmt.Sprintf("/api/lab/bills/%d/pay", bill.ID), token, `{}`)
	mustCode(t, w, http.StatusOK)
	paid := decodeLabBill(t, w)
	if paid.Status != "paid" || paid.CollectedCash != 1 {
		t.Fatalf("cash pay %+v", paid)
	}

	w = doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"U Stay","phone":"09111"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)

	w = doJSON(lab, http.MethodPost, "/api/lab/bills", token, fmt.Sprintf(`{
		"patient_id":%d,
		"patient_name":"U Stay",
		"lines":[{"line_type":"service","ref_id":%d,"qty":1}]
	}`, chart.ID, a.ID))
	mustCode(t, w, http.StatusCreated)
	chargeBill := decodeLabBill(t, w)
	w = doJSON(lab, http.MethodPost, fmt.Sprintf("/api/lab/bills/%d/pay", chargeBill.ID), token,
		fmt.Sprintf(`{"admission_id":%d}`, stay.ID))
	mustCode(t, w, http.StatusOK)
	charged := decodeLabBill(t, w)
	if charged.CollectedCash != 0 || charged.AdmissionID == nil {
		t.Fatalf("ipd charge %+v", charged)
	}
	var ledgerSum int64
	if err := sqlDB.QueryRow(`
		SELECT COALESCE(SUM(amount_mmk), 0) FROM ipd_ledger
		WHERE source = 'lab' AND source_id = ? AND kind = 'charge'
	`, chargeBill.ID).Scan(&ledgerSum); err != nil {
		t.Fatal(err)
	}
	if ledgerSum != -5000 {
		t.Fatalf("ledger charge %d", ledgerSum)
	}

	w = doJSON(lab, http.MethodPost, fmt.Sprintf("/api/lab/bills/%d/void", chargeBill.ID), token,
		`{"reason":"undo lab charge"}`)
	mustCode(t, w, http.StatusOK)
	var net int64
	if err := sqlDB.QueryRow(`
		SELECT COALESCE(SUM(amount_mmk), 0) FROM ipd_ledger
		WHERE source = 'lab' AND source_id = ? AND kind IN ('charge', 'reversal')
	`, chargeBill.ID).Scan(&net); err != nil {
		t.Fatal(err)
	}
	if net != 0 {
		t.Fatalf("reversal net %d", net)
	}

	if err := sqlDB.QueryRow(`SELECT total_mmk FROM opd_bills WHERE bill_no = 'OPD-PRELAB'`).Scan(&preTotal); err != nil {
		t.Fatal(err)
	}
	if preTotal != 999 {
		t.Fatalf("opd bill changed after lab work: %d", preTotal)
	}

	// OPD catalog must not see lab services.
	w = doJSON(opd, http.MethodGet, "/api/opd/catalog/services?code=XRAY", token, "")
	mustCode(t, w, http.StatusOK)
	var opdCat struct {
		Services []catalogService `json:"services"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &opdCat); err != nil {
		t.Fatal(err)
	}
	if len(opdCat.Services) != 0 {
		t.Fatalf("opd catalog leaked lab service: %+v", opdCat.Services)
	}

	_ = strconv.FormatInt(b.ID, 10)
}

func decodeLabService(t *testing.T, w *httptest.ResponseRecorder) labService {
	t.Helper()
	var svc labService
	if err := json.Unmarshal(w.Body.Bytes(), &svc); err != nil {
		t.Fatalf("lab service json: %v body=%s", err, w.Body.String())
	}
	return svc
}

func decodeLabBill(t *testing.T, w *httptest.ResponseRecorder) labBill {
	t.Helper()
	var bill labBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatalf("lab bill json: %v body=%s", err, w.Body.String())
	}
	return bill
}
