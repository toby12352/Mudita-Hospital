package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"testing"

	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/db"
)

func TestOtCasePatientColumnLeavesExistingNull(t *testing.T) {
	sqlDB := openRawTestDB(t)
	if _, err := sqlDB.Exec(`
		CREATE TABLE schema_migrations (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  name TEXT NOT NULL UNIQUE,
		  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE patients (
		  id INTEGER PRIMARY KEY,
		  name TEXT NOT NULL
		);
		CREATE TABLE users (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
		  display_name TEXT NOT NULL,
		  role TEXT NOT NULL CHECK (role IN ('Admin', 'OPD', 'OT', 'Pharmacy', 'Patients')),
		  password_hash TEXT NOT NULL,
		  must_change_password INTEGER NOT NULL DEFAULT 0,
		  active INTEGER NOT NULL DEFAULT 1,
		  created_at TEXT NOT NULL DEFAULT (datetime('now')),
		  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		INSERT INTO users (
		  id, username, display_name, role, password_hash, must_change_password, active, created_at, updated_at
		) VALUES (
		  4, 'kept', 'Kept Desk', 'OPD', 'hash-kept', 0, 1, '2024-03-03 00:00:00', '2024-08-03 00:00:00'
		);
		CREATE TABLE opd_bills (id INTEGER PRIMARY KEY);
		CREATE TABLE ot_bills (id INTEGER PRIMARY KEY);
		CREATE TABLE pharmacy_bills (id INTEGER PRIMARY KEY);
		CREATE TABLE ot_cases (
		  id INTEGER PRIMARY KEY,
		  case_no TEXT NOT NULL,
		  patient_name TEXT NOT NULL
		);
		INSERT INTO patients (id, name) VALUES (1, 'Kept');
		INSERT INTO ot_cases (id, case_no, patient_name) VALUES (7, 'OT-000007', 'Old Case');
	`); err != nil {
		t.Fatalf("pre schema: %v", err)
	}
	applied := []string{
		"001_schema_migrations",
		"002_auth",
		"003_master_data",
		"004_pharmacy",
		"005_opd",
		"006_ot",
		"007_pharmacy_units_billing",
		"008_pharmacy_pack_dosage",
		"009_hospital_phone2",
		"010_portal_roles",
		"011_ot_stock",
		"012_ot_bill_stock",
		"013_ot_sale_unit",
		"014_transfer_bill_link",
		"015_ot_services",
		"016_bill_discount",
		"017_service_categories",
		"018_ot_case_services",
		"019_bill_printed_at",
		"019_patients_role",
		"027_ot_service_delete",
	}
	for _, name := range applied {
		if _, err := sqlDB.Exec(`INSERT INTO schema_migrations (name) VALUES (?)`, name); err != nil {
			t.Fatalf("mark %s: %v", name, err)
		}
	}
	if err := db.Migrate(sqlDB); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var caseNo, patientName string
	var patientID sql.NullInt64
	if err := sqlDB.QueryRow(`
		SELECT case_no, patient_name, patient_id FROM ot_cases WHERE id = 7
	`).Scan(&caseNo, &patientName, &patientID); err != nil {
		t.Fatal(err)
	}
	if caseNo != "OT-000007" || patientName != "Old Case" || patientID.Valid {
		t.Fatalf("case %s %s patient_id valid=%v", caseNo, patientName, patientID.Valid)
	}
	var notNull int
	if err := sqlDB.QueryRow(`
		SELECT "notnull" FROM pragma_table_info('ot_cases') WHERE name = 'patient_id'
	`).Scan(&notNull); err != nil {
		t.Fatal(err)
	}
	if notNull != 0 {
		t.Fatalf("patient_id notnull %d", notNull)
	}
	var keptHash, keptRole string
	if err := sqlDB.QueryRow(`SELECT password_hash, role FROM users WHERE id = 4`).Scan(&keptHash, &keptRole); err != nil {
		t.Fatal(err)
	}
	if keptHash != "hash-kept" || keptRole != "OPD" {
		t.Fatalf("user hash=%s role=%s", keptHash, keptRole)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ot_cases (case_no, patient_name) VALUES ('OT-000008', 'Still blank')
	`); err != nil {
		t.Fatalf("insert without patient_id: %v", err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ot_cases (case_no, patient_name, patient_id) VALUES ('OT-000009', 'Missing', 99)
	`); err == nil {
		t.Fatal("unknown patient_id was stored")
	}
}

func TestDeskChartLookupAndPayWithoutPatientID(t *testing.T) {
	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	_, otTok := insertSession(t, sqlDB, auth.RoleOT, 0)
	_, phTok := insertSession(t, sqlDB, auth.RolePharmacy, 0)
	patientsH := &Patients{DB: sqlDB}
	opd := &OPD{DB: sqlDB}
	ot := &OT{DB: sqlDB}
	ph := &Pharmacy{DB: sqlDB}

	w := doJSON(patientsH, http.MethodGet, "/api/patients?q=Daw", "", "")
	mustCode(t, w, http.StatusUnauthorized)
	w = doJSON(patientsH, http.MethodPost, "/api/patients", adminTok, `{
		"name":"Daw Chart","phone":"0911001100","age_years":42,"gender":"F","notes":"keep me"
	}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)

	for _, tok := range []string{opdTok, otTok, phTok} {
		w = doJSON(patientsH, http.MethodGet, "/api/patients?q=0911001100", tok, "")
		mustCode(t, w, http.StatusOK)
		found := decodePatientList(t, w)
		if len(found) != 1 || found[0].ID != chart.ID || found[0].Notes != "keep me" {
			t.Fatalf("desk search %+v", found)
		}
		w = doJSON(patientsH, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10), tok, "")
		mustCode(t, w, http.StatusOK)
		if decodePatient(t, w).Name != "Daw Chart" {
			t.Fatalf("desk get %s", w.Body.String())
		}
		w = doJSON(patientsH, http.MethodPost, "/api/patients", tok, `{"name":"Nope"}`)
		mustCode(t, w, http.StatusForbidden)
		w = doJSON(patientsH, http.MethodPut, "/api/patients/"+strconv.FormatInt(chart.ID, 10), tok, `{"name":"Nope"}`)
		mustCode(t, w, http.StatusForbidden)
		w = doJSON(patientsH, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", tok, "")
		mustCode(t, w, http.StatusForbidden)
	}

	res, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('CASH', 'Cash visit', 1500)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := res.LastInsertId()

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", opdTok, fmt.Sprintf(`{
		"patient_name":"Walk In",
		"save_patient":false,
		"lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1}]
	}`, serviceID))
	mustCode(t, w, http.StatusCreated)
	walkIn := decodeOpdBill(t, w)
	if walkIn.PatientID != nil {
		t.Fatalf("walk-in patient_id %v", walkIn.PatientID)
	}
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", walkIn.ID), opdTok, `{}`)
	mustCode(t, w, http.StatusOK)
	paid := decodeOpdBill(t, w)
	if paid.Status != "paid" || paid.PatientID != nil || paid.TotalMMK != 1500 {
		t.Fatalf("paid without chart %+v", paid)
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", opdTok, fmt.Sprintf(`{
		"patient_name":"Typed Name","patient_phone":"0922002200","save_patient":true,
		"lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1}]
	}`, serviceID))
	mustCode(t, w, http.StatusCreated)
	typed := decodeOpdBill(t, w)
	if typed.PatientID == nil || *typed.PatientID == chart.ID {
		t.Fatalf("upsert id %v", typed.PatientID)
	}
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", typed.ID), opdTok, `{}`)
	mustCode(t, w, http.StatusOK)
	if decodeOpdBill(t, w).Status != "paid" {
		t.Fatalf("typed pay %s", w.Body.String())
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", opdTok, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Chart","patient_phone":"0933003300",
		"patient_age_years":43,"patient_gender":"F","save_patient":true,
		"lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1}]
	}`, chart.ID, serviceID))
	mustCode(t, w, http.StatusCreated)
	linked := decodeOpdBill(t, w)
	if linked.PatientID == nil || *linked.PatientID != chart.ID {
		t.Fatalf("linked bill %+v", linked.PatientID)
	}
	var notes, phone string
	var age int64
	var chartCount int
	if err := sqlDB.QueryRow(`SELECT notes, phone, age_years FROM patients WHERE id = ?`, chart.ID).Scan(&notes, &phone, &age); err != nil {
		t.Fatal(err)
	}
	if notes != "keep me" || phone != "0933003300" || age != 43 {
		t.Fatalf("chart notes=%s phone=%s age=%d", notes, phone, age)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM patients WHERE name = 'Daw Chart'`).Scan(&chartCount); err != nil {
		t.Fatal(err)
	}
	if chartCount != 1 {
		t.Fatalf("chart copies %d", chartCount)
	}
	w = doJSON(opd, http.MethodPost, "/api/opd/bills", opdTok, fmt.Sprintf(`{
		"patient_id":999999,"patient_name":"Missing","save_patient":true,
		"lines":[{"line_type":"service","ref_id":%d,"qty":1}]
	}`, serviceID))
	mustCode(t, w, http.StatusNotFound)

	w = doJSON(patientsH, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", adminTok, "")
	mustCode(t, w, http.StatusOK)
	hist := decodeHistory(t, w)
	if len(hist.OPD) != 1 || hist.OPD[0].BillNo != linked.BillNo || len(hist.OT) != 0 {
		t.Fatalf("history before ot %+v", hist)
	}

	var moves int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&moves); err != nil {
		t.Fatal(err)
	}
	if moves != 0 {
		t.Fatalf("stock movements %d", moves)
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/services", otTok, `{"code":"OTFEE","name":"Fee","price_mmk":1000}`)
	mustCode(t, w, http.StatusCreated)
	var otSvc struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &otSvc); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, `{"patient_name":"No Chart","items":[]}`)
	mustCode(t, w, http.StatusCreated)
	var bare otCase
	if err := json.Unmarshal(w.Body.Bytes(), &bare); err != nil {
		t.Fatal(err)
	}
	if bare.PatientID != nil {
		t.Fatalf("bare case patient_id %v", bare.PatientID)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", bare.ID), otTok, fmt.Sprintf(`{
		"services":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1000}]
	}`, otSvc.ID))
	mustCode(t, w, http.StatusCreated)
	var draftOt otBill
	if err := json.Unmarshal(w.Body.Bytes(), &draftOt); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/pay", draftOt.ID), otTok, `{}`)
	mustCode(t, w, http.StatusOK)
	var paidOt otBill
	if err := json.Unmarshal(w.Body.Bytes(), &paidOt); err != nil {
		t.Fatal(err)
	}
	if paidOt.Status != "paid" || paidOt.TotalMMK != 1000 {
		t.Fatalf("ot pay %+v", paidOt)
	}
	var casePatient sql.NullInt64
	if err := sqlDB.QueryRow(`SELECT patient_id FROM ot_cases WHERE id = ?`, bare.ID).Scan(&casePatient); err != nil {
		t.Fatal(err)
	}
	if casePatient.Valid {
		t.Fatal("pay stored a patient_id")
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Chart","patient_phone":"0933003300","items":[]
	}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	var linkedCase otCase
	if err := json.Unmarshal(w.Body.Bytes(), &linkedCase); err != nil {
		t.Fatal(err)
	}
	if linkedCase.PatientID == nil || *linkedCase.PatientID != chart.ID {
		t.Fatalf("linked case %+v", linkedCase.PatientID)
	}
	if err := sqlDB.QueryRow(`SELECT notes FROM patients WHERE id = ?`, chart.ID).Scan(&notes); err != nil {
		t.Fatal(err)
	}
	if notes != "keep me" {
		t.Fatalf("ot rewrote notes %s", notes)
	}
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, `{"patient_id":999999,"patient_name":"Missing","items":[]}`)
	mustCode(t, w, http.StatusNotFound)

	w = doJSON(patientsH, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", adminTok, "")
	mustCode(t, w, http.StatusOK)
	hist = decodeHistory(t, w)
	if len(hist.OT) != 1 || hist.OT[0].CaseNo != linkedCase.CaseNo || hist.OT[0].Status != "draft" || hist.OT[0].BillNo != "" {
		t.Fatalf("ot history %+v", hist.OT)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&moves); err != nil {
		t.Fatal(err)
	}
	if moves != 0 {
		t.Fatalf("stock after ot pay %d", moves)
	}

	itemID := insertItem(t, sqlDB, "PARA", "Paracetamol", 100, 200)
	line := fmt.Sprintf(`{"item_id":%d,"billing_qty":1,"unit_price_mmk":1}`, itemID)
	var patientsBefore int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM patients`).Scan(&patientsBefore); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", phTok, `{
		"patient_name":"Counter","save_patient":false,"lines":[`+line+`]
	}`)
	mustCode(t, w, http.StatusCreated)
	var sale pharmacyBill
	if err := json.Unmarshal(w.Body.Bytes(), &sale); err != nil {
		t.Fatal(err)
	}
	if sale.PatientID != nil {
		t.Fatalf("pharmacy no-pick patient_id %v", sale.PatientID)
	}
	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", phTok, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Daw Chart","patient_phone":"0944004400",
		"patient_age_years":44,"patient_gender":"F","save_patient":true,"kind":"return",
		"lines":[%s]
	}`, chart.ID, line))
	mustCode(t, w, http.StatusCreated)
	var ret pharmacyBill
	if err := json.Unmarshal(w.Body.Bytes(), &ret); err != nil {
		t.Fatal(err)
	}
	if ret.PatientID == nil || *ret.PatientID != chart.ID || ret.BillNo[:3] != "RT-" {
		t.Fatalf("return %+v", ret)
	}
	if err := sqlDB.QueryRow(`SELECT notes, phone, age_years FROM patients WHERE id = ?`, chart.ID).Scan(&notes, &phone, &age); err != nil {
		t.Fatal(err)
	}
	if notes != "keep me" || phone != "0944004400" || age != 44 {
		t.Fatalf("return refresh notes=%s phone=%s age=%d", notes, phone, age)
	}
	w = doJSON(ph, http.MethodPost, "/api/pharmacy/bills", phTok, fmt.Sprintf(`{
		"patient_id":%d,"patient_name":"Should Not Link","save_patient":true,"kind":"transfer",
		"lines":[%s]
	}`, chart.ID, line))
	mustCode(t, w, http.StatusCreated)
	var transfer pharmacyBill
	if err := json.Unmarshal(w.Body.Bytes(), &transfer); err != nil {
		t.Fatal(err)
	}
	if transfer.PatientID != nil || transfer.BillNo[:3] != "TO-" {
		t.Fatalf("transfer %+v", transfer)
	}
	var patientsAfter int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM patients`).Scan(&patientsAfter); err != nil {
		t.Fatal(err)
	}
	if patientsAfter != patientsBefore {
		t.Fatalf("patients %d → %d", patientsBefore, patientsAfter)
	}
	w = doJSON(patientsH, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", adminTok, "")
	mustCode(t, w, http.StatusOK)
	hist = decodeHistory(t, w)
	if len(hist.Pharmacy) != 1 || hist.Pharmacy[0].BillNo != ret.BillNo {
		t.Fatalf("pharmacy history %+v", hist.Pharmacy)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&moves); err != nil {
		t.Fatal(err)
	}
	if moves != 0 {
		t.Fatalf("draft pharmacy moved stock %d", moves)
	}
}
