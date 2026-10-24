package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/db"
)

func openRawTestDB(t *testing.T) *sql.DB {
	t.Helper()
	n := testDBSeq.Add(1)
	dsn := fmt.Sprintf("file:portalraw%d?mode=memory&cache=shared&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", n)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := sqlDB.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
	return sqlDB
}

func TestPortalRoleIsolation(t *testing.T) {
	sqlDB := openTestDB(t)
	opd := &OPD{DB: sqlDB}
	ot := &OT{DB: sqlDB}
	pharmacy := &Pharmacy{DB: sqlDB}
	users := &Users{DB: sqlDB}

	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	_, otTok := insertSession(t, sqlDB, auth.RoleOT, 0)
	_, pharmTok := insertSession(t, sqlDB, auth.RolePharmacy, 0)
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)

	checks := []struct {
		name   string
		h      http.Handler
		method string
		path   string
		token  string
		want   int
	}{
		{"opd blocks ot", ot, http.MethodGet, "/api/ot/cases", opdTok, http.StatusForbidden},
		{"opd blocks pharmacy", pharmacy, http.MethodGet, "/api/pharmacy/items", opdTok, http.StatusForbidden},
		{"ot blocks opd", opd, http.MethodGet, "/api/opd/bills", otTok, http.StatusForbidden},
		{"ot blocks pharmacy", pharmacy, http.MethodGet, "/api/pharmacy/items", otTok, http.StatusForbidden},
		{"pharmacy blocks opd", opd, http.MethodGet, "/api/opd/bills", pharmTok, http.StatusForbidden},
		{"pharmacy blocks ot", ot, http.MethodGet, "/api/ot/cases", pharmTok, http.StatusForbidden},
		{"admin opd", opd, http.MethodGet, "/api/opd/bills", adminTok, http.StatusOK},
		{"admin ot", ot, http.MethodGet, "/api/ot/cases", adminTok, http.StatusOK},
		{"admin pharmacy", pharmacy, http.MethodGet, "/api/pharmacy/items", adminTok, http.StatusOK},
		{"opd own bills", opd, http.MethodGet, "/api/opd/bills", opdTok, http.StatusOK},
		{"ot own cases", ot, http.MethodGet, "/api/ot/cases", otTok, http.StatusOK},
		{"pharmacy own items", pharmacy, http.MethodGet, "/api/pharmacy/items", pharmTok, http.StatusOK},
	}
	for _, c := range checks {
		t.Run(c.name, func(t *testing.T) {
			w := doJSON(c.h, c.method, c.path, c.token, "")
			mustCode(t, w, c.want)
		})
	}

	t.Run("reception role rejected by api", func(t *testing.T) {
		w := doJSON(users, http.MethodPost, "/api/users", adminTok, `{
			"username":"olddesk","display_name":"Old Desk","role":"Reception","password":"secret1"
		}`)
		mustCode(t, w, http.StatusBadRequest)
	})

	t.Run("ot role can be created", func(t *testing.T) {
		w := doJSON(users, http.MethodPost, "/api/users", adminTok, `{
			"username":"otdesk2","display_name":"OT Two","role":"OT","password":"secret1"
		}`)
		mustCode(t, w, http.StatusCreated)
	})

	t.Run("reception role not insertable", func(t *testing.T) {
		_, err := sqlDB.Exec(`
			INSERT INTO users (username, display_name, role, password_hash, must_change_password, active)
			VALUES ('legacy', 'Legacy', 'Reception', 'x', 0, 1)
		`)
		if err == nil {
			t.Fatal("Reception insert succeeded")
		}
	})
}

func TestReceptionUsersBecomeOPD(t *testing.T) {
	sqlDB := openRawTestDB(t)
	if _, err := sqlDB.Exec(`
		CREATE TABLE schema_migrations (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  name TEXT NOT NULL UNIQUE,
		  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
	`); err != nil {
		t.Fatalf("schema_migrations: %v", err)
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
	}
	for _, name := range applied {
		if _, err := sqlDB.Exec(`INSERT INTO schema_migrations (name) VALUES (?)`, name); err != nil {
			t.Fatalf("mark %s: %v", name, err)
		}
	}
	if _, err := sqlDB.Exec(`
		CREATE TABLE users (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
		  display_name TEXT NOT NULL,
		  role TEXT NOT NULL CHECK (role IN ('Admin', 'Reception', 'Pharmacy')),
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
		INSERT INTO users (username, display_name, role, password_hash)
		VALUES ('reception', 'Reception Demo', 'Reception', 'x');
		INSERT INTO sessions (token, user_id, expires_at)
		VALUES ('legacy-tok', 1, '2099-01-01T00:00:00Z');
		CREATE TABLE items (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  code TEXT NOT NULL UNIQUE,
		  name TEXT NOT NULL
		);
		CREATE TABLE stock_locations (
		  code TEXT PRIMARY KEY,
		  name TEXT NOT NULL
		);
		CREATE TABLE item_batches (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  item_id INTEGER NOT NULL REFERENCES items(id),
		  location_code TEXT NOT NULL REFERENCES stock_locations(code),
		  batch_no TEXT NOT NULL DEFAULT '',
		  expiry_date TEXT,
		  qty INTEGER NOT NULL DEFAULT 0,
		  created_at TEXT NOT NULL DEFAULT (datetime('now')),
		  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE stock_movements (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  item_id INTEGER NOT NULL,
		  batch_id INTEGER,
		  location_code TEXT NOT NULL,
		  movement_type TEXT NOT NULL,
		  qty_delta INTEGER NOT NULL,
		  reason TEXT NOT NULL DEFAULT ''
		);
		CREATE TABLE ot_cases (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  status TEXT NOT NULL DEFAULT 'draft',
		  issued_at TEXT,
		  reconciled_at TEXT,
		  ot_bill_id INTEGER,
		  updated_at TEXT
		);
		CREATE TABLE ot_case_items (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  case_id INTEGER NOT NULL,
		  qty_issued INTEGER NOT NULL DEFAULT 0,
		  qty_used INTEGER NOT NULL DEFAULT 0,
		  qty_returned INTEGER NOT NULL DEFAULT 0,
		  qty_wasted INTEGER NOT NULL DEFAULT 0,
		  qty_kept_on_floor INTEGER NOT NULL DEFAULT 0
		);
		CREATE TABLE ot_bills (id INTEGER PRIMARY KEY AUTOINCREMENT);
		CREATE TABLE ot_bill_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER);
	`); err != nil {
		t.Fatalf("old schema: %v", err)
	}

	if err := db.Migrate(sqlDB); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var role string
	if err := sqlDB.QueryRow(`SELECT role FROM users WHERE username = 'reception'`).Scan(&role); err != nil {
		t.Fatalf("load role: %v", err)
	}
	if role != auth.RoleOPD {
		t.Fatalf("role %q, want OPD", role)
	}
	var token string
	if err := sqlDB.QueryRow(`SELECT token FROM sessions WHERE user_id = 1`).Scan(&token); err != nil {
		t.Fatalf("session lost: %v", err)
	}
	if token != "legacy-tok" {
		t.Fatalf("token %q", token)
	}

	if _, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash)
		VALUES ('nope', 'Nope', 'Reception', 'x')
	`); err == nil {
		t.Fatal("Reception insert succeeded after migration")
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash)
		VALUES ('ot1', 'OT One', 'OT', 'x')
	`); err != nil {
		t.Fatalf("OT insert: %v", err)
	}
}

func TestOtFloorCopiedIntoOtBatches(t *testing.T) {
	sqlDB := openRawTestDB(t)
	if _, err := sqlDB.Exec(`
		CREATE TABLE schema_migrations (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  name TEXT NOT NULL UNIQUE,
		  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE users (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  username TEXT NOT NULL UNIQUE,
		  display_name TEXT NOT NULL,
		  role TEXT NOT NULL,
		  password_hash TEXT NOT NULL
		);
		CREATE TABLE stock_locations (
		  code TEXT PRIMARY KEY,
		  name TEXT NOT NULL
		);
		INSERT INTO stock_locations (code, name) VALUES
		  ('MAIN', 'Main'),
		  ('OT_RESERVED', 'Reserved'),
		  ('OT_FLOOR', 'Floor');
		CREATE TABLE items (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  code TEXT NOT NULL UNIQUE,
		  name TEXT NOT NULL
		);
		CREATE TABLE item_batches (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  item_id INTEGER NOT NULL REFERENCES items(id),
		  location_code TEXT NOT NULL REFERENCES stock_locations(code),
		  batch_no TEXT NOT NULL DEFAULT '',
		  expiry_date TEXT,
		  qty INTEGER NOT NULL DEFAULT 0,
		  created_at TEXT NOT NULL DEFAULT (datetime('now')),
		  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		INSERT INTO items (code, name) VALUES ('FLO', 'Floor item');
		INSERT INTO item_batches (item_id, location_code, batch_no, expiry_date, qty)
		VALUES
		  (1, 'MAIN', 'MAIN1', '2027-01-01', 4),
		  (1, 'OT_RESERVED', 'RES1', '2027-02-01', 3),
		  (1, 'OT_FLOOR', 'FLOOR1', '2028-01-15', 7),
		  (1, 'OT_FLOOR', 'EMPTY', '2028-02-01', 0);
		CREATE TABLE stock_movements (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  item_id INTEGER NOT NULL,
		  batch_id INTEGER,
		  location_code TEXT NOT NULL,
		  movement_type TEXT NOT NULL,
		  qty_delta INTEGER NOT NULL,
		  reason TEXT NOT NULL DEFAULT ''
		);
		CREATE TABLE ot_cases (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  case_no TEXT NOT NULL,
		  patient_name TEXT NOT NULL,
		  status TEXT NOT NULL DEFAULT 'draft',
		  issued_at TEXT,
		  reconciled_at TEXT,
		  ot_bill_id INTEGER,
		  updated_at TEXT
		);
		CREATE TABLE ot_case_items (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  case_id INTEGER NOT NULL,
		  item_id INTEGER NOT NULL,
		  qty_issued INTEGER NOT NULL DEFAULT 0,
		  qty_used INTEGER NOT NULL DEFAULT 0,
		  qty_returned INTEGER NOT NULL DEFAULT 0,
		  qty_wasted INTEGER NOT NULL DEFAULT 0,
		  qty_kept_on_floor INTEGER NOT NULL DEFAULT 0
		);
		CREATE TABLE ot_bills (id INTEGER PRIMARY KEY AUTOINCREMENT);
		CREATE TABLE ot_bill_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER);
		INSERT INTO ot_cases (case_no, patient_name, status, issued_at)
		VALUES ('OT-1', 'Issued', 'issued', '2026-01-01');
		INSERT INTO ot_case_items (case_id, item_id, qty_issued, qty_used)
		VALUES (1, 1, 3, 0);
		INSERT INTO ot_cases (case_no, patient_name, status)
		VALUES ('OT-2', 'Reconciled', 'reconciled');
		INSERT INTO ot_case_items (case_id, item_id, qty_issued, qty_used, qty_returned)
		VALUES (2, 1, 5, 2, 3);
		INSERT INTO ot_cases (case_no, patient_name, status, ot_bill_id)
		VALUES ('OT-3', 'Billed', 'billed', 1);
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
	}
	for _, name := range applied {
		if _, err := sqlDB.Exec(`INSERT INTO schema_migrations (name) VALUES (?)`, name); err != nil {
			t.Fatalf("mark %s: %v", name, err)
		}
	}
	if err := db.Migrate(sqlDB); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var batchNo, expiry string
	var qty int64
	if err := sqlDB.QueryRow(`SELECT batch_no, expiry_date, qty FROM ot_batches`).Scan(&batchNo, &expiry, &qty); err != nil {
		t.Fatalf("ot batch: %v", err)
	}
	if batchNo != "FLOOR1" || expiry != "2028-01-15" || qty != 7 {
		t.Fatalf("copied batch %s %s %d", batchNo, expiry, qty)
	}
	var n int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ot_batches`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("ot batches %d, want 1 (zero floor and other locations stay out)", n)
	}
	var opening int64
	if err := sqlDB.QueryRow(`
		SELECT qty_delta FROM ot_stock_movements WHERE movement_type = 'OPENING'
	`).Scan(&opening); err != nil {
		t.Fatalf("opening: %v", err)
	}
	if opening != 7 {
		t.Fatalf("opening delta %d", opening)
	}
	var mainQty, reservedQty, floorQty, returnedQty int64
	if err := sqlDB.QueryRow(`SELECT qty FROM item_batches WHERE batch_no = 'MAIN1'`).Scan(&mainQty); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT qty FROM item_batches WHERE location_code = 'OT_RESERVED'`).Scan(&reservedQty); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT qty FROM item_batches WHERE batch_no = 'FLOOR1'`).Scan(&floorQty); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`
		SELECT qty FROM item_batches WHERE location_code = 'MAIN' AND batch_no = 'RES1'
	`).Scan(&returnedQty); err != nil {
		t.Fatal(err)
	}
	if mainQty != 4 || reservedQty != 0 || floorQty != 7 || returnedQty != 3 {
		t.Fatalf("qty main=%d reserved=%d floor=%d returned=%d", mainQty, reservedQty, floorQty, returnedQty)
	}

	var issuedStatus string
	var issuedLegacy, issuedQty int64
	if err := sqlDB.QueryRow(`SELECT status, legacy_stock_closed FROM ot_cases WHERE case_no = 'OT-1'`).Scan(&issuedStatus, &issuedLegacy); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT qty_issued FROM ot_case_items WHERE case_id = 1`).Scan(&issuedQty); err != nil {
		t.Fatal(err)
	}
	if issuedStatus != "draft" || issuedLegacy != 0 || issuedQty != 3 {
		t.Fatalf("issued case %s legacy=%d qty=%d", issuedStatus, issuedLegacy, issuedQty)
	}
	var recStatus string
	var recLegacy, recIssued, recReturned int64
	if err := sqlDB.QueryRow(`SELECT status, legacy_stock_closed FROM ot_cases WHERE case_no = 'OT-2'`).Scan(&recStatus, &recLegacy); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT qty_issued, qty_returned FROM ot_case_items WHERE case_id = 2`).Scan(&recIssued, &recReturned); err != nil {
		t.Fatal(err)
	}
	if recStatus != "draft" || recLegacy != 1 || recIssued != 2 || recReturned != 0 {
		t.Fatalf("reconciled case %s legacy=%d issued=%d returned=%d", recStatus, recLegacy, recIssued, recReturned)
	}
	var billedStatus string
	var billedLegacy int64
	if err := sqlDB.QueryRow(`SELECT status, legacy_stock_closed FROM ot_cases WHERE case_no = 'OT-3'`).Scan(&billedStatus, &billedLegacy); err != nil {
		t.Fatal(err)
	}
	if billedStatus != "billed" || billedLegacy != 1 {
		t.Fatalf("billed case %s legacy=%d", billedStatus, billedLegacy)
	}
}

func TestOtStockTransferAndReturn(t *testing.T) {
	sqlDB := openTestDB(t)
	pharmacy := &Pharmacy{DB: sqlDB}
	ot := &OT{DB: sqlDB}
	_, pharmTok := insertSession(t, sqlDB, auth.RolePharmacy, 0)
	_, otTok := insertSession(t, sqlDB, auth.RoleOT, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)

	itemID := insertItem(t, sqlDB, "OTCUP", "Cupboard item", 100, 200)
	batchID := insertBatch(t, sqlDB, itemID, "LOT-9", "2027-06-01", 10)
	reserved := insertBatchAt(t, sqlDB, itemID, "OT_RESERVED", "RES-9", "2027-06-01", 2)

	moved := confirmTransferBill(t, pharmacy, pharmTok, itemID, 4)
	var otBatchID int64
	var billLink sql.NullInt64
	if err := sqlDB.QueryRow(`
		SELECT ot_batch_id, pharmacy_bill_id FROM stock_transfers WHERE pharmacy_bill_id = ?
	`, moved.ID).Scan(&otBatchID, &billLink); err != nil {
		t.Fatal(err)
	}
	if !billLink.Valid || billLink.Int64 != moved.ID {
		t.Fatalf("transfer not linked to bill %+v", billLink)
	}
	assertBatchLedger(t, sqlDB, batchID, otBatchID, 6, 4, "LOT-9", "2027-06-01")
	assertTransferCount(t, sqlDB, 1)
	assertMovement(t, sqlDB, "stock_movements", "TRANSFER", -4)
	assertMovement(t, sqlDB, "ot_stock_movements", "TRANSFER_IN", 4)
	if batchQty(t, sqlDB, reserved) != 2 {
		t.Fatal("reserved qty changed")
	}

	second := confirmTransferBill(t, pharmacy, pharmTok, itemID, 2)
	if second.ID == moved.ID {
		t.Fatal("second slip reused the first bill")
	}
	var otRows int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ot_batches WHERE item_id = ?`, itemID).Scan(&otRows); err != nil {
		t.Fatal(err)
	}
	if otRows != 1 {
		t.Fatalf("ot batches %d, want the same batch merged", otRows)
	}
	if batchQty(t, sqlDB, batchID) != 4 || otBatchQty(t, sqlDB, otBatchID) != 6 {
		t.Fatalf("after second transfer main=%d ot=%d", batchQty(t, sqlDB, batchID), otBatchQty(t, sqlDB, otBatchID))
	}

	before := ledgerSnapshot(t, sqlDB)
	w := doJSON(pharmacy, http.MethodPost, "/api/pharmacy/bills", pharmTok, fmt.Sprintf(`{
		"kind":"transfer",
		"lines":[{"item_id":%d,"tablet_qty":5,"unit_price_mmk":1}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	var over pharmacyBill
	if err := json.Unmarshal(w.Body.Bytes(), &over); err != nil {
		t.Fatal(err)
	}
	w = doJSON(pharmacy, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/transfer", over.ID), pharmTok, "{}")
	mustCode(t, w, http.StatusBadRequest)
	if batchQty(t, sqlDB, batchID) != 4 || otBatchQty(t, sqlDB, otBatchID) != 6 {
		t.Fatal("over-transfer changed qty")
	}
	if ledgerSnapshot(t, sqlDB) != before {
		t.Fatalf("over-transfer wrote rows: before %s after %s", before, ledgerSnapshot(t, sqlDB))
	}
	if batchQty(t, sqlDB, reserved) != 2 {
		t.Fatal("reserved qty changed")
	}

	w = doJSON(pharmacy, http.MethodPost, "/api/pharmacy/transfers", pharmTok, fmt.Sprintf(`{"batch_id":%d,"qty":1}`, batchID))
	mustCode(t, w, http.StatusMethodNotAllowed)

	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/stock/%d/return", otBatchID), otTok, `{"qty":1}`)
	mustCode(t, w, http.StatusCreated)
	var back stockTransfer
	if err := json.Unmarshal(w.Body.Bytes(), &back); err != nil {
		t.Fatal(err)
	}
	if back.Direction != "TO_PHARMACY" || back.Qty != 1 || back.PharmacyQty != 5 || back.OtQty != 5 {
		t.Fatalf("return %+v", back)
	}
	if back.PharmacyBatchID != batchID {
		t.Fatalf("return landed on batch %d, want %d", back.PharmacyBatchID, batchID)
	}
	assertBatchLedger(t, sqlDB, batchID, otBatchID, 5, 5, "LOT-9", "2027-06-01")
	assertTransferCount(t, sqlDB, 3)
	var toPharm int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_transfers WHERE direction = 'TO_PHARMACY'`).Scan(&toPharm); err != nil {
		t.Fatal(err)
	}
	if toPharm != 1 {
		t.Fatalf("TO_PHARMACY rows %d", toPharm)
	}
	assertMovement(t, sqlDB, "ot_stock_movements", "TRANSFER_OUT", -1)

	before = ledgerSnapshot(t, sqlDB)
	mainQty := batchQty(t, sqlDB, batchID)
	otQty := otBatchQty(t, sqlDB, otBatchID)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/stock/%d/return", otBatchID), otTok, `{"qty":9}`)
	mustCode(t, w, http.StatusBadRequest)
	if batchQty(t, sqlDB, batchID) != mainQty || otBatchQty(t, sqlDB, otBatchID) != otQty || ledgerSnapshot(t, sqlDB) != before {
		t.Fatal("over-return changed stock")
	}

	w = doJSON(pharmacy, http.MethodPost, "/api/pharmacy/transfers", opdTok, fmt.Sprintf(`{"batch_id":%d,"qty":1}`, batchID))
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/stock/%d/return", otBatchID), opdTok, `{"qty":1}`)
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(pharmacy, http.MethodPost, "/api/pharmacy/transfers", otTok, fmt.Sprintf(`{"batch_id":%d,"qty":1}`, batchID))
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/stock/%d/return", otBatchID), pharmTok, `{"qty":1}`)
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(ot, http.MethodGet, "/api/ot/stock", pharmTok, "")
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(ot, http.MethodPut, fmt.Sprintf("/api/ot/stock/%d", otBatchID), pharmTok, `{"qty":99}`)
	mustCode(t, w, http.StatusForbidden)
	if batchQty(t, sqlDB, batchID) != mainQty || otBatchQty(t, sqlDB, otBatchID) != otQty {
		t.Fatal("forbidden calls changed qty")
	}

	w = doJSON(ot, http.MethodGet, "/api/ot/stock", otTok, "")
	mustCode(t, w, http.StatusOK)
	var listed struct {
		Batches []otStockBatch `json:"batches"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Batches) != 1 || listed.Batches[0].Qty != otQty || listed.Batches[0].BatchNo != "LOT-9" {
		t.Fatalf("on hand %+v", listed.Batches)
	}
	b0 := listed.Batches[0]
	if b0.ItemCode == "" || b0.ItemName == "" || b0.PackL3Unit == "" {
		t.Fatalf("stock row missing item/pack fields %+v", b0)
	}
	if b0.BuyPriceMMK < 0 || b0.SellPriceMMK < 0 {
		t.Fatalf("stock row prices %+v", b0)
	}
}

func confirmTransferBill(t *testing.T, h *Pharmacy, token string, itemID, qty int64) pharmacyBill {
	t.Helper()
	w := doJSON(h, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"kind":"transfer",
		"lines":[{"item_id":%d,"tablet_qty":%d,"unit_price_mmk":1}]
	}`, itemID, qty))
	mustCode(t, w, http.StatusCreated)
	var draft pharmacyBill
	if err := json.Unmarshal(w.Body.Bytes(), &draft); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(draft.BillNo, "TO-") || draft.PatientName != "OT" {
		t.Fatalf("draft slip %+v", draft.BillNo)
	}
	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/transfer", draft.ID), token, "{}")
	mustCode(t, w, http.StatusOK)
	var done pharmacyBill
	if err := json.Unmarshal(w.Body.Bytes(), &done); err != nil {
		t.Fatal(err)
	}
	if done.Status != "paid" || done.BillNo != draft.BillNo {
		t.Fatalf("confirmed slip %+v", done)
	}
	return done
}

func insertBatchAt(t *testing.T, sqlDB *sql.DB, itemID int64, location, batchNo, expiry string, qty int64) int64 {
	t.Helper()
	res, err := sqlDB.Exec(`
		INSERT INTO item_batches (item_id, location_code, batch_no, expiry_date, qty)
		VALUES (?, ?, ?, ?, ?)
	`, itemID, location, batchNo, expiry, qty)
	if err != nil {
		t.Fatalf("batch: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func otBatchQty(t *testing.T, sqlDB *sql.DB, id int64) int64 {
	t.Helper()
	var q int64
	if err := sqlDB.QueryRow(`SELECT qty FROM ot_batches WHERE id = ?`, id).Scan(&q); err != nil {
		t.Fatalf("ot qty: %v", err)
	}
	return q
}

func assertBatchLedger(t *testing.T, sqlDB *sql.DB, pharmacyID, otID, wantMain, wantOt int64, batchNo, expiry string) {
	t.Helper()
	if batchQty(t, sqlDB, pharmacyID) != wantMain {
		t.Fatalf("MAIN qty %d, want %d", batchQty(t, sqlDB, pharmacyID), wantMain)
	}
	var gotNo, gotExp string
	var gotQty int64
	if err := sqlDB.QueryRow(`SELECT batch_no, expiry_date, qty FROM ot_batches WHERE id = ?`, otID).Scan(&gotNo, &gotExp, &gotQty); err != nil {
		t.Fatal(err)
	}
	if gotQty != wantOt || gotNo != batchNo || gotExp != expiry {
		t.Fatalf("ot batch %s %s %d", gotNo, gotExp, gotQty)
	}
}

func assertTransferCount(t *testing.T, sqlDB *sql.DB, want int) {
	t.Helper()
	var n int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_transfers`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Fatalf("stock_transfers %d, want %d", n, want)
	}
}

func assertMovement(t *testing.T, sqlDB *sql.DB, table, movementType string, delta int64) {
	t.Helper()
	var n int
	q := fmt.Sprintf(`SELECT COUNT(1) FROM %s WHERE movement_type = ? AND qty_delta = ?`, table)
	if err := sqlDB.QueryRow(q, movementType, delta).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n < 1 {
		t.Fatalf("missing %s %s %d", table, movementType, delta)
	}
}

func ledgerSnapshot(t *testing.T, sqlDB *sql.DB) string {
	t.Helper()
	var moves, otMoves, transfers int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&moves); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ot_stock_movements`).Scan(&otMoves); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_transfers`).Scan(&transfers); err != nil {
		t.Fatal(err)
	}
	return fmt.Sprintf("%d/%d/%d", moves, otMoves, transfers)
}

func TestOtBillPayAndVoid(t *testing.T) {
	sqlDB := openTestDB(t)
	ot := &OT{DB: sqlDB}
	opd := &OPD{DB: sqlDB}
	_, otTok := insertSession(t, sqlDB, auth.RoleOT, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)

	itemID := insertItem(t, sqlDB, "CUP1", "Cupboard drug", 100, 500)
	mainID := insertBatch(t, sqlDB, itemID, "MAIN-1", "2027-08-01", 20)
	expiredID := insertOtBatch(t, sqlDB, itemID, "OLD", "2020-01-01", 9)
	liveID := insertOtBatch(t, sqlDB, itemID, "LIVE", "2027-08-01", 4)

	w := doJSON(ot, http.MethodGet, "/api/ot/catalog/items?code=CUP1", otTok, "")
	mustCode(t, w, http.StatusOK)
	var catalog struct {
		Items []otCatalogItem `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &catalog); err != nil {
		t.Fatal(err)
	}
	if len(catalog.Items) != 1 || catalog.Items[0].OtOnHand != 13 {
		t.Fatalf("catalog %+v", catalog.Items)
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, fmt.Sprintf(`{
		"patient_name":"Daw Aye",
		"items":[{"item_id":%d,"qty_issued":2}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	var created otCase
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", created.ID), otTok, `{"services":[]}`)
	mustCode(t, w, http.StatusCreated)
	var bill otBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/pay", bill.ID), otTok, `{}`)
	mustCode(t, w, http.StatusOK)
	if otBatchQty(t, sqlDB, liveID) != 2 || otBatchQty(t, sqlDB, expiredID) != 9 || batchQty(t, sqlDB, mainID) != 20 {
		t.Fatalf("pay qty live=%d expired=%d main=%d", otBatchQty(t, sqlDB, liveID), otBatchQty(t, sqlDB, expiredID), batchQty(t, sqlDB, mainID))
	}
	var allocQty int64
	if err := sqlDB.QueryRow(`SELECT qty FROM ot_bill_stock_allocs WHERE bill_id = ?`, bill.ID).Scan(&allocQty); err != nil {
		t.Fatal(err)
	}
	if allocQty != 2 {
		t.Fatalf("alloc qty %d", allocQty)
	}
	assertMovement(t, sqlDB, "ot_stock_movements", "SALE", -2)

	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, fmt.Sprintf(`{
		"patient_name":"U Short",
		"items":[{"item_id":%d,"qty_issued":5}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	var shortCase otCase
	if err := json.Unmarshal(w.Body.Bytes(), &shortCase); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", shortCase.ID), otTok, `{}`)
	mustCode(t, w, http.StatusCreated)
	var shortBill otBill
	if err := json.Unmarshal(w.Body.Bytes(), &shortBill); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/pay", shortBill.ID), otTok, `{}`)
	mustCode(t, w, http.StatusBadRequest)
	var shortStatus string
	if err := sqlDB.QueryRow(`SELECT status FROM ot_bills WHERE id = ?`, shortBill.ID).Scan(&shortStatus); err != nil {
		t.Fatal(err)
	}
	var allocN int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ot_bill_stock_allocs`).Scan(&allocN); err != nil {
		t.Fatal(err)
	}
	if shortStatus != "draft" || allocN != 1 || otBatchQty(t, sqlDB, liveID) != 2 {
		t.Fatalf("short pay left status=%s allocs=%d qty=%d", shortStatus, allocN, otBatchQty(t, sqlDB, liveID))
	}

	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/void", bill.ID), otTok, `{"reason":"wrong case"}`)
	mustCode(t, w, http.StatusOK)
	if otBatchQty(t, sqlDB, liveID) != 4 {
		t.Fatalf("void qty %d", otBatchQty(t, sqlDB, liveID))
	}
	assertMovement(t, sqlDB, "ot_stock_movements", "VOID", 2)

	res, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('DRESS', 'Dressing', 3000)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := res.LastInsertId()
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, `{"patient_name":"Daw Fee","items":[]}`)
	mustCode(t, w, http.StatusCreated)
	var feeCase otCase
	if err := json.Unmarshal(w.Body.Bytes(), &feeCase); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", feeCase.ID), otTok, fmt.Sprintf(`{
		"services":[{"line_type":"service","ref_id":%d,"qty":1}]
	}`, serviceID))
	mustCode(t, w, http.StatusCreated)
	var feeBill otBill
	if err := json.Unmarshal(w.Body.Bytes(), &feeBill); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/pay", feeBill.ID), otTok, `{}`)
	mustCode(t, w, http.StatusOK)
	if otBatchQty(t, sqlDB, liveID) != 4 || batchQty(t, sqlDB, mainID) != 20 {
		t.Fatal("service bill moved stock")
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, fmt.Sprintf(`{
		"patient_name":"Legacy",
		"items":[{"item_id":%d,"qty_issued":1}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	var legacyCase otCase
	if err := json.Unmarshal(w.Body.Bytes(), &legacyCase); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`UPDATE ot_cases SET legacy_stock_closed = 1 WHERE id = ?`, legacyCase.ID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", legacyCase.ID), otTok, `{}`)
	mustCode(t, w, http.StatusCreated)
	var legacyBill otBill
	if err := json.Unmarshal(w.Body.Bytes(), &legacyBill); err != nil {
		t.Fatal(err)
	}
	beforeAlloc := allocN
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/pay", legacyBill.ID), otTok, `{}`)
	mustCode(t, w, http.StatusOK)
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ot_bill_stock_allocs`).Scan(&allocN); err != nil {
		t.Fatal(err)
	}
	if allocN != beforeAlloc || otBatchQty(t, sqlDB, liveID) != 4 {
		t.Fatalf("legacy pay allocs=%d qty=%d", allocN, otBatchQty(t, sqlDB, liveID))
	}

	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/issue", created.ID), otTok, `{}`)
	mustCode(t, w, http.StatusNotFound)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/reconcile", created.ID), otTok, `{}`)
	mustCode(t, w, http.StatusNotFound)

	res, err = sqlDB.Exec(`
		INSERT INTO opd_bills (bill_no, patient_name, status, total_mmk) VALUES ('OPD-SVC-1', 'OPD', 'draft', 3000)
	`)
	if err != nil {
		t.Fatal(err)
	}
	opdBillID, _ := res.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO bill_lines (bill_id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk)
		VALUES (?, 'service', ?, 'DRESS', 'Dressing', 1, 3000, 3000)
	`, opdBillID, serviceID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", opdBillID), opdTok, `{}`)
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, mainID) != 20 || otBatchQty(t, sqlDB, liveID) != 4 {
		t.Fatal("OPD pay sold stock")
	}
}

func TestPortalCashVisibility(t *testing.T) {
	sqlDB := openTestDB(t)
	opd := &OPD{DB: sqlDB}
	ot := &OT{DB: sqlDB}
	pharmacy := &Pharmacy{DB: sqlDB}
	reports := &Reports{DB: sqlDB}
	dash := &Dashboard{DB: sqlDB}

	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	_, otTok := insertSession(t, sqlDB, auth.RoleOT, 0)
	_, pharmTok := insertSession(t, sqlDB, auth.RolePharmacy, 0)
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)

	const day = "2026-10-21 09:00:00"
	if _, err := sqlDB.Exec(`
		INSERT INTO opd_bills (bill_no, patient_name, doctor_name, status, total_mmk, paid_at)
		VALUES ('OPD-C4-1', 'OPD Patient', 'Dr O', 'paid', 1000, ?)
	`, day); err != nil {
		t.Fatal(err)
	}
	res, err := sqlDB.Exec(`
		INSERT INTO ot_cases (case_no, patient_name, status) VALUES ('OT-C4-1', 'OT Patient', 'billed')
	`)
	if err != nil {
		t.Fatal(err)
	}
	caseID, _ := res.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO ot_bills (bill_no, case_id, case_no, patient_name, doctor_name, status, total_mmk, paid_at)
		VALUES ('OTB-C4-1', ?, 'OT-C4-1', 'OT Patient', 'Dr T', 'paid', 2000, ?)
	`, caseID, day); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bills (bill_no, patient_name, status, total_mmk, paid_at)
		VALUES ('PH-C4-1', 'Pharmacy Patient', 'paid', 4000, ?)
	`, day); err != nil {
		t.Fatal(err)
	}

	type cashBody struct {
		OPDTotal      int64 `json:"opd_total_mmk"`
		OTTotal       int64 `json:"ot_total_mmk"`
		PharmacyTotal int64 `json:"pharmacy_total_mmk"`
		Grand         int64 `json:"grand_total_mmk"`
		Lines         []struct {
			Source string `json:"source"`
			BillNo string `json:"bill_no"`
		} `json:"lines"`
	}
	readCash := func(t *testing.T, w *httptest.ResponseRecorder) cashBody {
		t.Helper()
		var body cashBody
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatalf("cash json: %v %s", err, w.Body.String())
		}
		return body
	}

	t.Run("opd cash is opd only", func(t *testing.T) {
		w := doJSON(reports, http.MethodGet, "/api/reports/daily-cash?date=2026-10-21", opdTok, "")
		mustCode(t, w, http.StatusOK)
		body := readCash(t, w)
		if body.OPDTotal != 1000 || body.OTTotal != 0 || body.PharmacyTotal != 0 || body.Grand != 1000 {
			t.Fatalf("opd cash %+v", body)
		}
		if len(body.Lines) != 1 || body.Lines[0].BillNo != "OPD-C4-1" || body.Lines[0].Source != "OPD" {
			t.Fatalf("opd lines %+v", body.Lines)
		}
		if strings.Contains(w.Body.String(), "OTB-C4-1") || strings.Contains(w.Body.String(), "PH-C4-1") {
			t.Fatalf("opd cash leaked another bill: %s", w.Body.String())
		}
		printed := doJSON(reports, http.MethodGet, "/api/reports/daily-cash/print?date=2026-10-21", opdTok, "")
		mustCode(t, printed, http.StatusOK)
		if strings.Contains(printed.Body.String(), "OTB-C4-1") || strings.Contains(printed.Body.String(), "PH-C4-1") || strings.Contains(printed.Body.String(), "Pharmacy:") {
			t.Fatalf("opd print leaked: %s", printed.Body.String())
		}
	})

	t.Run("pharmacy cash is pharmacy only", func(t *testing.T) {
		w := doJSON(reports, http.MethodGet, "/api/reports/daily-cash?date=2026-10-21", pharmTok, "")
		mustCode(t, w, http.StatusOK)
		body := readCash(t, w)
		if body.PharmacyTotal != 4000 || body.OPDTotal != 0 || body.OTTotal != 0 || body.Grand != 4000 {
			t.Fatalf("pharmacy cash %+v", body)
		}
		if len(body.Lines) != 1 || body.Lines[0].Source != "Pharmacy" {
			t.Fatalf("pharmacy lines %+v", body.Lines)
		}
	})

	t.Run("ot cash is ot only", func(t *testing.T) {
		w := doJSON(reports, http.MethodGet, "/api/reports/daily-cash?date=2026-10-21", otTok, "")
		mustCode(t, w, http.StatusOK)
		body := readCash(t, w)
		if body.OTTotal != 2000 || body.OPDTotal != 0 || body.Grand != 2000 || len(body.Lines) != 1 {
			t.Fatalf("ot cash %+v", body)
		}
	})

	t.Run("admin dashboard cash is combined", func(t *testing.T) {
		w := doJSON(dash, http.MethodGet, "/api/dashboard/overview?date=2026-10-21", adminTok, "")
		mustCode(t, w, http.StatusOK)
		var body struct {
			OPDTotal      int64 `json:"opd_total_mmk"`
			OTTotal       int64 `json:"ot_total_mmk"`
			PharmacyTotal int64 `json:"pharmacy_total_mmk"`
			Grand         int64 `json:"grand_total_mmk"`
			BillCount     int   `json:"bill_count"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.OPDTotal != 1000 || body.OTTotal != 2000 || body.PharmacyTotal != 4000 || body.Grand != 7000 || body.BillCount != 3 {
			t.Fatalf("overview %+v", body)
		}
		daily := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report?date=2026-10-21", adminTok, "")
		mustCode(t, daily, http.StatusOK)
		var rep struct {
			Grand     int64 `json:"grand_total_mmk"`
			BillCount int   `json:"bill_count"`
			Lines     []struct {
				BillNo string `json:"bill_no"`
			} `json:"lines"`
		}
		if err := json.Unmarshal(daily.Body.Bytes(), &rep); err != nil {
			t.Fatal(err)
		}
		if rep.Grand != 7000 || rep.BillCount != 3 || len(rep.Lines) != 3 {
			t.Fatalf("daily report %+v", rep)
		}
		printed := doJSON(reports, http.MethodGet, "/api/reports/daily-cash/print?date=2026-10-21", adminTok, "")
		mustCode(t, printed, http.StatusOK)
		html := printed.Body.String()
		for _, bill := range []string{"OPD-C4-1", "OTB-C4-1", "PH-C4-1"} {
			if !strings.Contains(html, bill) {
				t.Fatalf("admin print missing %s", bill)
			}
		}
	})

	forbidden := []struct {
		name   string
		h      http.Handler
		method string
		path   string
		token  string
	}{
		{"opd lists ot bills", ot, http.MethodGet, "/api/ot/bills", opdTok},
		{"opd lists pharmacy bills", pharmacy, http.MethodGet, "/api/pharmacy/bills", opdTok},
		{"pharmacy lists opd bills", opd, http.MethodGet, "/api/opd/bills", pharmTok},
		{"opd lists ot stock", ot, http.MethodGet, "/api/ot/stock", opdTok},
		{"opd transfers", pharmacy, http.MethodPost, "/api/pharmacy/transfers", opdTok},
		{"pharmacy returns ot stock", ot, http.MethodPost, "/api/ot/stock/1/return", pharmTok},
		{"ot transfers", pharmacy, http.MethodPost, "/api/pharmacy/transfers", otTok},
		{"pharmacy lists ot catalog", ot, http.MethodGet, "/api/ot/catalog/items", pharmTok},
		{"opd dashboard", dash, http.MethodGet, "/api/dashboard/overview", opdTok},
		{"ot dashboard daily", dash, http.MethodGet, "/api/dashboard/daily-report", otTok},
		{"pharmacy dashboard", dash, http.MethodGet, "/api/dashboard/stock", pharmTok},
	}
	for _, c := range forbidden {
		t.Run(c.name, func(t *testing.T) {
			body := ""
			if c.method == http.MethodPost {
				body = `{"qty":1}`
			}
			w := doJSON(c.h, c.method, c.path, c.token, body)
			mustCode(t, w, http.StatusForbidden)
		})
	}

	t.Run("stock value ignores legacy floor", func(t *testing.T) {
		itemID := insertItem(t, sqlDB, "C4VAL", "Value", 1000, 200)
		insertBatch(t, sqlDB, itemID, "MAIN1", "2026-11-01", 10)
		if _, err := sqlDB.Exec(`
			INSERT INTO item_batches (item_id, location_code, batch_no, expiry_date, qty)
			VALUES (?, 'OT_FLOOR', 'FLOOR1', '2026-11-01', 7)
		`, itemID); err != nil {
			t.Fatal(err)
		}
		insertOtBatch(t, sqlDB, itemID, "CUP1", "2026-11-01", 4)

		w := doJSON(dash, http.MethodGet, "/api/dashboard/stock", adminTok, "")
		mustCode(t, w, http.StatusOK)
		var stock struct {
			TotalQty   int64 `json:"total_qty"`
			TotalValue int64 `json:"total_value_mmk"`
			ByLocation []struct {
				Code string `json:"location_code"`
				Qty  int64  `json:"qty"`
			} `json:"by_location"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &stock); err != nil {
			t.Fatal(err)
		}
		if stock.TotalQty != 14 || stock.TotalValue != 1400 {
			t.Fatalf("stock qty=%d value=%d (floor must not be added)", stock.TotalQty, stock.TotalValue)
		}
		seen := map[string]int64{}
		for _, row := range stock.ByLocation {
			seen[row.Code] = row.Qty
		}
		if seen["MAIN"] != 10 || seen["OT"] != 4 || seen["OT_FLOOR"] != 0 {
			t.Fatalf("locations %+v", stock.ByLocation)
		}

		near := doJSON(reports, http.MethodGet, "/api/reports/near-expiry?days=90", pharmTok, "")
		mustCode(t, near, http.StatusOK)
		if strings.Contains(near.Body.String(), `"location_code":"OT"`) || strings.Contains(near.Body.String(), "OT_FLOOR") {
			t.Fatalf("pharmacy expiry leaked cupboard or floor: %s", near.Body.String())
		}
		if !strings.Contains(near.Body.String(), "MAIN1") {
			t.Fatalf("pharmacy expiry missing MAIN: %s", near.Body.String())
		}
	})
}

// Fractional buy-per-tablet must round to integer MMK so Scan into int64 succeeds.
func TestStockHealthRoundsFractionalValue(t *testing.T) {
	sqlDB := openTestDB(t)
	itemID := insertItem(t, sqlDB, "FRAC1", "Fractional", 1000, 200)
	if _, err := sqlDB.Exec(`UPDATE items SET units_per_purchase = 3, pack_l3_qty = 3 WHERE id = ?`, itemID); err != nil {
		t.Fatal(err)
	}
	insertBatch(t, sqlDB, itemID, "MAIN-F", "2026-11-01", 1)
	insertOtBatch(t, sqlDB, itemID, "OT-F", "2026-11-01", 1)

	rep, err := buildStockHealth(sqlDB, 90, 30)
	if err != nil {
		t.Fatalf("buildStockHealth: %v", err)
	}
	// 1 tablet × 1000 MMK / 3 ≈ 333.33 → ROUND → 333 each location.
	if rep.TotalQty != 2 || rep.TotalValueMMK != 666 {
		t.Fatalf("qty=%d value=%d want qty=2 value=666", rep.TotalQty, rep.TotalValueMMK)
	}
	seen := map[string]int64{}
	for _, row := range rep.ByLocation {
		seen[row.LocationCode] = row.ValueMMK
	}
	if seen["MAIN"] != 333 || seen["OT"] != 333 {
		t.Fatalf("by_location values %+v", rep.ByLocation)
	}
}
