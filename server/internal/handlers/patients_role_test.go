package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/db"
)

func TestPatientsRoleKeepsExistingUsers(t *testing.T) {
	sqlDB := openRawTestDB(t)
	if _, err := sqlDB.Exec(`
		CREATE TABLE schema_migrations (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  name TEXT NOT NULL UNIQUE,
		  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE users (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
		  display_name TEXT NOT NULL,
		  role TEXT NOT NULL CHECK (role IN ('Admin', 'OPD', 'OT', 'Pharmacy')),
		  password_hash TEXT NOT NULL,
		  must_change_password INTEGER NOT NULL DEFAULT 0,
		  active INTEGER NOT NULL DEFAULT 1,
		  created_at TEXT NOT NULL DEFAULT (datetime('now')),
		  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE sessions (
		  token TEXT PRIMARY KEY,
		  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		  created_at TEXT NOT NULL DEFAULT (datetime('now')),
		  expires_at TEXT NOT NULL
		);
		CREATE TABLE patients (
		  id INTEGER PRIMARY KEY,
		  name TEXT NOT NULL
		);
		CREATE TABLE opd_bills (
		  id INTEGER PRIMARY KEY,
		  bill_no TEXT NOT NULL,
		  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
		  total_mmk INTEGER NOT NULL,
		  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
		);
		INSERT INTO users (
		  id, username, display_name, role, password_hash, must_change_password, active, created_at, updated_at
		) VALUES
		  (3, 'admin', 'System Admin', 'Admin', 'hash-admin', 1, 1, '2024-01-01 00:00:00', '2024-06-01 00:00:00'),
		  (9, 'opd', 'OPD Desk', 'OPD', 'hash-opd', 0, 1, '2024-02-02 00:00:00', '2024-07-02 00:00:00');
		INSERT INTO sessions (token, user_id, expires_at) VALUES ('keep-tok', 3, '2099-01-01T00:00:00Z');
		INSERT INTO patients (id, name) VALUES (1, 'Kept');
		INSERT INTO opd_bills (id, bill_no, patient_id, total_mmk, paid_by_user_id)
		VALUES (5, 'OPD-000099', 1, 4200, 3);
		CREATE TABLE ot_bills (
		  id INTEGER PRIMARY KEY,
		  bill_no TEXT NOT NULL,
		  total_mmk INTEGER NOT NULL
		);
		INSERT INTO ot_bills (id, bill_no, total_mmk) VALUES (8, 'OTB-000008', 900);
		CREATE TABLE pharmacy_bills (
		  id INTEGER PRIMARY KEY,
		  bill_no TEXT NOT NULL,
		  total_mmk INTEGER NOT NULL
		);
		INSERT INTO pharmacy_bills (id, bill_no, total_mmk) VALUES (7, 'PH-000007', 300);
		CREATE TABLE ot_cases (
		  id INTEGER PRIMARY KEY,
		  case_no TEXT NOT NULL,
		  patient_name TEXT NOT NULL
		);
		INSERT INTO ot_cases (id, case_no, patient_name) VALUES (4, 'OT-000004', 'Old OT');
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

	type userRow struct {
		id       int64
		username string
		display  string
		role     string
		hash     string
		must     int
		active   int
		created  string
		updated  string
	}
	var got []userRow
	rows, err := sqlDB.Query(`
		SELECT id, username, display_name, role, password_hash, must_change_password, active, created_at, updated_at
		FROM users ORDER BY id
	`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var u userRow
		if err := rows.Scan(&u.id, &u.username, &u.display, &u.role, &u.hash, &u.must, &u.active, &u.created, &u.updated); err != nil {
			t.Fatal(err)
		}
		got = append(got, u)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].id != 3 || got[1].id != 9 {
		t.Fatalf("users %+v", got)
	}
	if got[0].username != "admin" || got[0].hash != "hash-admin" || got[0].role != "Admin" || got[0].must != 1 || got[0].active != 1 {
		t.Fatalf("admin %+v", got[0])
	}
	if got[0].created != "2024-01-01 00:00:00" || got[0].updated != "2024-06-01 00:00:00" || got[0].display != "System Admin" {
		t.Fatalf("admin timestamps %+v", got[0])
	}
	if got[1].username != "opd" || got[1].hash != "hash-opd" || got[1].role != "OPD" || got[1].must != 0 {
		t.Fatalf("opd %+v", got[1])
	}

	var token string
	var sessionUser int64
	if err := sqlDB.QueryRow(`SELECT token, user_id FROM sessions`).Scan(&token, &sessionUser); err != nil {
		t.Fatal(err)
	}
	if token != "keep-tok" || sessionUser != 3 {
		t.Fatalf("session %s user %d", token, sessionUser)
	}

	var billNo string
	var total, patientID, paidBy int64
	if err := sqlDB.QueryRow(`
		SELECT bill_no, total_mmk, patient_id, paid_by_user_id FROM opd_bills WHERE id = 5
	`).Scan(&billNo, &total, &patientID, &paidBy); err != nil {
		t.Fatal(err)
	}
	if billNo != "OPD-000099" || total != 4200 || patientID != 1 || paidBy != 3 {
		t.Fatalf("bill %s total %d patient %d paid_by %d", billNo, total, patientID, paidBy)
	}
	var cash int
	var admission sql.NullInt64
	if err := sqlDB.QueryRow(`SELECT collected_cash, admission_id FROM opd_bills WHERE id = 5`).Scan(&cash, &admission); err != nil {
		t.Fatal(err)
	}
	if cash != 1 || admission.Valid {
		t.Fatalf("old opd cash=%d admission valid=%v", cash, admission.Valid)
	}
	var otTotal, phTotal int64
	if err := sqlDB.QueryRow(`SELECT total_mmk, collected_cash FROM ot_bills WHERE id = 8`).Scan(&otTotal, &cash); err != nil {
		t.Fatal(err)
	}
	if otTotal != 900 || cash != 1 {
		t.Fatalf("old ot total %d cash %d", otTotal, cash)
	}
	if err := sqlDB.QueryRow(`SELECT total_mmk, collected_cash FROM pharmacy_bills WHERE id = 7`).Scan(&phTotal, &cash); err != nil {
		t.Fatal(err)
	}
	if phTotal != 300 || cash != 1 {
		t.Fatalf("old pharmacy total %d cash %d", phTotal, cash)
	}
	var otName string
	var otPatient sql.NullInt64
	if err := sqlDB.QueryRow(`SELECT patient_name, patient_id FROM ot_cases WHERE id = 4`).Scan(&otName, &otPatient); err != nil {
		t.Fatal(err)
	}
	if otName != "Old OT" || otPatient.Valid {
		t.Fatalf("ot case %s patient valid=%v", otName, otPatient.Valid)
	}

	if _, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash)
		VALUES ('ipd1', 'IPD', 'IPD', 'x')
	`); err != nil {
		t.Fatalf("IPD insert: %v", err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash)
		VALUES ('lab1', 'Lab', 'Lab', 'x')
	`); err == nil {
		t.Fatal("Lab insert succeeded")
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_admissions (admission_no, patient_id, status, notes)
		VALUES ('IPD-000001', 1, 'open', '')
	`); err != nil {
		t.Fatalf("open stay: %v", err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_admissions (admission_no, patient_id, status, notes)
		VALUES ('IPD-000002', 1, 'open', '')
	`); err == nil {
		t.Fatal("second open admission inserted")
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_admissions (admission_no, patient_id, status, notes)
		VALUES ('IPD-000003', 1, 'settled', '')
	`); err != nil {
		t.Fatalf("settled stay: %v", err)
	}
	var ledger int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM sqlite_master WHERE type = 'table' AND name = 'ipd_ledger'`).Scan(&ledger); err != nil {
		t.Fatal(err)
	}
	if ledger != 1 {
		t.Fatal("ipd_ledger missing after upgrade")
	}
	var ledgerRows int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_ledger`).Scan(&ledgerRows); err != nil {
		t.Fatal(err)
	}
	if ledgerRows != 0 {
		t.Fatalf("upgrade seeded ledger rows %d", ledgerRows)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash)
		VALUES ('chart', 'Charts', 'Patients', 'hash-patients')
	`); err != nil {
		t.Fatalf("Patients insert: %v", err)
	}
	var newID int64
	if err := sqlDB.QueryRow(`SELECT id FROM users WHERE username = 'chart'`).Scan(&newID); err != nil {
		t.Fatal(err)
	}
	if newID == 3 || newID == 9 {
		t.Fatalf("new id reused %d", newID)
	}

	if _, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash, must_change_password, active)
		VALUES ('patients', 'Custom', 'OPD', 'custom-hash', 0, 1)
	`); err != nil {
		t.Fatalf("existing patients username: %v", err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash, must_change_password, active)
		VALUES ('ipd', 'Custom IPD', 'IPD', 'custom-ipd-hash', 0, 1)
	`); err != nil {
		t.Fatalf("existing ipd username: %v", err)
	}
	if err := db.SeedDefaultUsers(sqlDB); err != nil {
		t.Fatal(err)
	}
	var role, hash string
	var must int
	if err := sqlDB.QueryRow(`
		SELECT role, password_hash, must_change_password FROM users WHERE username = 'patients'
	`).Scan(&role, &hash, &must); err != nil {
		t.Fatal(err)
	}
	if role != "OPD" || hash != "custom-hash" || must != 0 {
		t.Fatalf("seed rewrote patients role=%s hash=%s must=%d", role, hash, must)
	}
	var adminHash string
	if err := sqlDB.QueryRow(`SELECT password_hash FROM users WHERE id = 3`).Scan(&adminHash); err != nil {
		t.Fatal(err)
	}
	if adminHash != "hash-admin" {
		t.Fatalf("admin hash %s", adminHash)
	}
	var ipdRole, ipdHash string
	var ipdMust int
	if err := sqlDB.QueryRow(`
		SELECT role, password_hash, must_change_password FROM users WHERE username = 'ipd'
	`).Scan(&ipdRole, &ipdHash, &ipdMust); err != nil {
		t.Fatal(err)
	}
	if ipdRole != "IPD" || ipdHash != "custom-ipd-hash" || ipdMust != 0 {
		t.Fatalf("seed rewrote ipd role=%s hash=%s must=%d", ipdRole, ipdHash, ipdMust)
	}
}

func TestPatientsSeedInsertsWhenMissing(t *testing.T) {
	sqlDB := openTestDB(t)
	if err := db.SeedDefaultUsers(sqlDB); err != nil {
		t.Fatal(err)
	}
	var id int64
	var hash string
	var must int
	if err := sqlDB.QueryRow(`
		SELECT id, password_hash, must_change_password FROM users WHERE username = 'patients'
	`).Scan(&id, &hash, &must); err != nil {
		t.Fatal(err)
	}
	if id < 1 || must != 1 || !auth.CheckPassword(hash, "patients123") {
		t.Fatalf("seed id=%d must=%d", id, must)
	}
	if err := db.SeedDefaultUsers(sqlDB); err != nil {
		t.Fatal(err)
	}
	var hash2 string
	var id2 int64
	if err := sqlDB.QueryRow(`
		SELECT id, password_hash FROM users WHERE username = 'patients'
	`).Scan(&id2, &hash2); err != nil {
		t.Fatal(err)
	}
	if id2 != id || hash2 != hash {
		t.Fatalf("reseed id %d→%d hash changed %v", id, id2, hash != hash2)
	}

	var ipdID int64
	var ipdHash string
	var ipdMust int
	if err := sqlDB.QueryRow(`
		SELECT id, password_hash, must_change_password FROM users WHERE username = 'ipd'
	`).Scan(&ipdID, &ipdHash, &ipdMust); err != nil {
		t.Fatal(err)
	}
	if ipdID < 1 || ipdMust != 1 || !auth.CheckPassword(ipdHash, "ipd123") {
		t.Fatalf("ipd seed id=%d must=%d", ipdID, ipdMust)
	}
	if err := db.SeedDefaultUsers(sqlDB); err != nil {
		t.Fatal(err)
	}
	var ipdID2 int64
	var ipdHash2 string
	if err := sqlDB.QueryRow(`
		SELECT id, password_hash FROM users WHERE username = 'ipd'
	`).Scan(&ipdID2, &ipdHash2); err != nil {
		t.Fatal(err)
	}
	if ipdID2 != ipdID || ipdHash2 != ipdHash {
		t.Fatalf("reseed ipd id %d→%d hash changed %v", ipdID, ipdID2, ipdHash != ipdHash2)
	}
}

func TestPatientHistory(t *testing.T) {
	if !auth.HasPermission(auth.RolePatients, auth.PermPatients) {
		t.Fatal("Patients missing patients")
	}
	for _, perm := range []string{auth.PermOPD, auth.PermOT, auth.PermPharmacy, auth.PermSettings, auth.PermIPD} {
		if auth.HasPermission(auth.RolePatients, perm) {
			t.Fatalf("Patients has %s", perm)
		}
	}

	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, patientsTok := insertSession(t, sqlDB, auth.RolePatients, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	h := &Patients{DB: sqlDB}
	opd := &OPD{DB: sqlDB}
	users := &Users{DB: sqlDB}

	w := doJSON(users, http.MethodPost, "/api/users", adminTok, `{
		"username":"chartdesk","display_name":"Chart Desk","password":"secret1",
		"grants":["patients.read","patients.create","patients.update"]
	}`)
	mustCode(t, w, http.StatusCreated)
	w = doJSON(users, http.MethodPost, "/api/users", adminTok, `{
		"username":"ipddesk","display_name":"IPD Desk","password":"secret1",
		"grants":["ipd.read","ipd.create","ipd.update"]
	}`)
	mustCode(t, w, http.StatusCreated)

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", patientsTok, `{"patient_name":"Nope","lines":[]}`)
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(h, http.MethodPost, "/api/patients", adminTok, `{"name":"Daw Hla","phone":"091111222"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	w = doJSON(h, http.MethodPost, "/api/patients", adminTok, `{"name":"Other","phone":"090000000"}`)
	mustCode(t, w, http.StatusCreated)
	other := decodePatient(t, w)

	if _, err := sqlDB.Exec(`
		INSERT INTO opd_bills (bill_no, patient_id, patient_name, doctor_name, status, total_mmk, created_at)
		VALUES ('OPD-000010', ?, 'Daw Hla', 'Dr A', 'paid', 1500, '2026-01-02 10:00:00'),
		       ('OPD-000011', ?, 'Daw Hla', 'Dr B', 'draft', 2500, '2026-01-05 10:00:00'),
		       ('OPD-000012', ?, 'Other', 'Dr C', 'paid', 10, '2026-01-06 10:00:00')
	`, chart.ID, chart.ID, other.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bills (bill_no, patient_id, patient_name, status, total_mmk, created_at)
		VALUES ('PH-000010', ?, 'Daw Hla', 'paid', 800, '2026-01-03 11:00:00'),
		       ('RT-000010', ?, 'Daw Hla', 'paid', 50, '2026-01-04 09:00:00'),
		       ('TO-000010', ?, 'Daw Hla', 'paid', 999, '2026-01-04 12:00:00'),
		       ('PH-000099', NULL, 'Daw Hla', 'paid', 1, '2026-01-04 13:00:00')
	`, chart.ID, chart.ID, chart.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ot_cases (case_no, patient_name, status, created_at)
		VALUES ('OT-000010', 'Daw Hla', 'draft', '2026-01-01 08:00:00')
	`); err != nil {
		t.Fatal(err)
	}

	w = doJSON(h, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", opdTok, "")
	mustCode(t, w, http.StatusForbidden)

	authH := &Auth{DB: sqlDB}
	w = doJSON(authH, http.MethodGet, "/api/auth/me", patientsTok, "")
	mustCode(t, w, http.StatusOK)
	if !meHasPerm(t, w, auth.PermPatients) || meHasPerm(t, w, auth.PermOPD) {
		t.Fatalf("patients /me %s", w.Body.String())
	}

	w = doJSON(h, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", patientsTok, "")
	mustCode(t, w, http.StatusOK)
	hist := decodeHistory(t, w)
	if len(hist.OPD) != 2 || hist.OPD[0].BillNo != "OPD-000011" || hist.OPD[0].DoctorName != "Dr B" || hist.OPD[0].TotalMMK != 2500 || hist.OPD[0].ID <= 0 {
		t.Fatalf("opd %+v", hist.OPD)
	}
	if hist.OPD[1].BillNo != "OPD-000010" || hist.OPD[1].Status != "paid" || hist.OPD[1].CreatedAt != "2026-01-02 10:00:00" || hist.OPD[1].ID <= 0 {
		t.Fatalf("opd older %+v", hist.OPD[1])
	}
	if len(hist.Pharmacy) != 2 || hist.Pharmacy[0].BillNo != "RT-000010" || hist.Pharmacy[1].BillNo != "PH-000010" || hist.Pharmacy[0].ID <= 0 {
		t.Fatalf("pharmacy %+v", hist.Pharmacy)
	}
	if hist.Pharmacy[1].TotalMMK != 800 || hist.Pharmacy[1].Status != "paid" {
		t.Fatalf("pharmacy sale %+v", hist.Pharmacy[1])
	}
	if len(hist.OT) != 0 || len(hist.IPD) != 0 {
		t.Fatalf("ot %+v ipd %+v", hist.OT, hist.IPD)
	}
	raw := w.Body.String()
	for _, leaked := range []string{"OT-000010", "TO-000010", "PH-000099", "OPD-000012"} {
		if strings.Contains(raw, leaked) {
			t.Fatalf("leaked %s: %s", leaked, raw)
		}
	}

	ownBillID := hist.OPD[0].ID
	var otherBillID int64
	if err := sqlDB.QueryRow(`SELECT id FROM opd_bills WHERE bill_no = 'OPD-000012'`).Scan(&otherBillID); err != nil {
		t.Fatal(err)
	}
	var printedBefore sql.NullString
	if err := sqlDB.QueryRow(`SELECT printed_at FROM opd_bills WHERE id = ?`, ownBillID).Scan(&printedBefore); err != nil {
		t.Fatal(err)
	}
	if printedBefore.Valid {
		t.Fatalf("expected null printed_at before history print, got %q", printedBefore.String)
	}

	printOwn := fmt.Sprintf("/api/patients/%d/bills/opd/%d/print", chart.ID, ownBillID)
	w = doJSON(h, http.MethodGet, printOwn, patientsTok, "")
	mustCode(t, w, http.StatusOK)
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("content type %s", ct)
	}
	if !strings.Contains(w.Body.String(), "OPD-000011") {
		t.Fatalf("receipt missing bill no: %s", w.Body.String())
	}
	var printedAfter sql.NullString
	if err := sqlDB.QueryRow(`SELECT printed_at FROM opd_bills WHERE id = ?`, ownBillID).Scan(&printedAfter); err != nil {
		t.Fatal(err)
	}
	if printedAfter.Valid {
		t.Fatalf("history print must not stamp printed_at, got %q", printedAfter.String)
	}

	w = doJSON(h, http.MethodGet, fmt.Sprintf("/api/patients/%d/bills/opd/%d/print", chart.ID, otherBillID), patientsTok, "")
	mustCode(t, w, http.StatusNotFound)

	w = doJSON(h, http.MethodGet, printOwn, opdTok, "")
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(h, http.MethodGet, "/api/patients/999999/history", adminTok, "")
	mustCode(t, w, http.StatusNotFound)
	w = doJSON(h, http.MethodPost, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", adminTok, `{}`)
	mustCode(t, w, http.StatusMethodNotAllowed)

	w = doJSON(h, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	if decodePatient(t, w).Name != "Daw Hla" {
		t.Fatal("chart get changed")
	}
}

type historyBody struct {
	OPD      []patientHistoryOpd      `json:"opd"`
	Pharmacy []patientHistoryPharmacy `json:"pharmacy"`
	OT       []patientHistoryOT       `json:"ot"`
	IPD      []patientHistoryIPD      `json:"ipd"`
}

func decodeHistory(t *testing.T, w *httptest.ResponseRecorder) historyBody {
	t.Helper()
	var body historyBody
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("history json: %v body=%s", err, w.Body.String())
	}
	if body.OPD == nil || body.Pharmacy == nil || body.OT == nil || body.IPD == nil {
		t.Fatalf("null list: %s", w.Body.String())
	}
	return body
}
