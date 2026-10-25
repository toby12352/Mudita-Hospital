package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"mudita-hospital/server/internal/db"
)

var testDBSeq atomic.Int64

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	n := testDBSeq.Add(1)
	dsn := fmt.Sprintf("file:moneytest%d?mode=memory&cache=shared&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", n)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := sqlDB.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
	if err := db.Migrate(sqlDB); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return sqlDB
}

func insertSession(t *testing.T, sqlDB *sql.DB, role string, mustChange int) (int64, string) {
	t.Helper()
	res, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash, must_change_password, active)
		VALUES (?, 'Tester', ?, 'x', ?, 1)
	`, fmt.Sprintf("user-%s-%d", role, testDBSeq.Add(1)), role, mustChange)
	if err != nil {
		t.Fatalf("user: %v", err)
	}
	id, _ := res.LastInsertId()
	token := fmt.Sprintf("tok-%d", id)
	exp := time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339)
	if _, err := sqlDB.Exec(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`, token, id, exp); err != nil {
		t.Fatalf("session: %v", err)
	}
	return id, token
}

func doJSON(h http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	var r *http.Request
	if body != "" {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func mustCode(t *testing.T, w *httptest.ResponseRecorder, code int) {
	t.Helper()
	if w.Code != code {
		t.Fatalf("status %d, want %d: %s", w.Code, code, w.Body.String())
	}
}

func insertItem(t *testing.T, sqlDB *sql.DB, code, name string, buy, sell int64) int64 {
	t.Helper()
	res, err := sqlDB.Exec(`
		INSERT INTO items (code, name, category, buy_price_mmk, sell_price_mmk, units_per_purchase, pack_l3_qty, pack_l3_unit)
		VALUES (?, ?, 'Tablet', ?, ?, 10, 10, 'Tablet')
	`, code, name, buy, sell)
	if err != nil {
		t.Fatalf("item: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func insertBatch(t *testing.T, sqlDB *sql.DB, itemID int64, batchNo, expiry string, qty int64) int64 {
	t.Helper()
	var exp any
	if expiry != "" {
		exp = expiry
	}
	res, err := sqlDB.Exec(`
		INSERT INTO item_batches (item_id, location_code, batch_no, expiry_date, qty)
		VALUES (?, 'MAIN', ?, ?, ?)
	`, itemID, batchNo, exp, qty)
	if err != nil {
		t.Fatalf("batch: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func insertOtBatch(t *testing.T, sqlDB *sql.DB, itemID int64, batchNo, expiry string, qty int64) int64 {
	t.Helper()
	var exp any
	if expiry != "" {
		exp = expiry
	}
	res, err := sqlDB.Exec(`
		INSERT INTO ot_batches (item_id, batch_no, expiry_date, qty) VALUES (?, ?, ?, ?)
	`, itemID, batchNo, exp, qty)
	if err != nil {
		t.Fatalf("ot batch: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func batchQty(t *testing.T, sqlDB *sql.DB, id int64) int64 {
	t.Helper()
	var q int64
	if err := sqlDB.QueryRow(`SELECT qty FROM item_batches WHERE id = ?`, id).Scan(&q); err != nil {
		t.Fatalf("qty: %v", err)
	}
	return q
}

func TestPharmacyDraftUsesCatalogPrice(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	itemID := insertItem(t, sqlDB, "PARA", "Paracetamol", 1000, 250)
	h := &Pharmacy{DB: sqlDB}

	w := doJSON(h, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"patient_name": "Ma Hla",
		"lines": [{
			"item_id": %d,
			"code": "HACK",
			"description": "Hack",
			"tablet_qty": 4,
			"unit_price_mmk": 1
		}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	var bill pharmacyBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if bill.TotalMMK != 1000 {
		t.Fatalf("total %d, want 1000 (catalog 250 x 4)", bill.TotalMMK)
	}
	if len(bill.Lines) != 1 {
		t.Fatalf("lines %d", len(bill.Lines))
	}
	line := bill.Lines[0]
	if line.UnitPriceMMK != 250 || line.Code != "PARA" || line.Description != "Paracetamol" {
		t.Fatalf("line priced from client: %+v", line)
	}

	batchID := insertBatch(t, sqlDB, itemID, "FRESH", localToday(), 10)
	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", bill.ID), token, "")
	mustCode(t, w, http.StatusOK)
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if bill.PaidAt == nil || !strings.HasPrefix(*bill.PaidAt, localToday()+" ") {
		t.Fatalf("paid_at %v, want local civil time on %s", bill.PaidAt, localToday())
	}
	if batchQty(t, sqlDB, batchID) != 6 {
		t.Fatalf("stock after pay %d, want 6", batchQty(t, sqlDB, batchID))
	}

	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", bill.ID), token, "")
	mustCode(t, w, http.StatusBadRequest)
	if batchQty(t, sqlDB, batchID) != 6 {
		t.Fatalf("second pay changed stock to %d", batchQty(t, sqlDB, batchID))
	}

	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/void", bill.ID), token, `{"reason":"wrong patient"}`)
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, batchID) != 10 {
		t.Fatalf("stock after void %d, want 10", batchQty(t, sqlDB, batchID))
	}
	var moveType string
	var delta int64
	if err := sqlDB.QueryRow(`
		SELECT movement_type, qty_delta FROM stock_movements
		WHERE item_id = ? ORDER BY id DESC LIMIT 1
	`, itemID).Scan(&moveType, &delta); err != nil {
		t.Fatal(err)
	}
	if moveType != "RETURN" || delta != 4 {
		t.Fatalf("void movement %s %d, want RETURN 4", moveType, delta)
	}
}

func TestOPDDraftUsesCatalogPrice(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	res, err := sqlDB.Exec(`INSERT INTO doctors (name) VALUES ('Dr Aye')`)
	if err != nil {
		t.Fatal(err)
	}
	doctorID, _ := res.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO doctor_fees (doctor_id, fee_type, amount_mmk) VALUES (?, 'consultation', 8000)
	`, doctorID); err != nil {
		t.Fatal(err)
	}
	res, err = sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('DRESS', 'Dressing', 3000)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := res.LastInsertId()
	h := &OPD{DB: sqlDB}

	w := doJSON(h, http.MethodPost, "/api/opd/bills", token, fmt.Sprintf(`{
		"patient_name": "Ko Mg",
		"doctor_id": %d,
		"lines": [
			{"line_type":"service","ref_id":%d,"code":"FAKE","description":"Nope","qty":2,"unit_price_mmk":0},
			{"line_type":"consultation","description":"Cheap","qty":5,"unit_price_mmk":1}
		]
	}`, doctorID, serviceID))
	mustCode(t, w, http.StatusCreated)
	var bill opdBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if bill.TotalMMK != 14000 {
		t.Fatalf("total %d, want 14000", bill.TotalMMK)
	}
	if len(bill.Lines) != 2 {
		t.Fatalf("lines %+v", bill.Lines)
	}
	if bill.Lines[0].UnitPriceMMK != 3000 || bill.Lines[0].Qty != 2 || bill.Lines[0].Code != "DRESS" {
		t.Fatalf("service line %+v", bill.Lines[0])
	}
	if bill.Lines[1].Qty != 1 || bill.Lines[1].UnitPriceMMK != 8000 {
		t.Fatalf("consultation stored client qty/price: %+v", bill.Lines[1])
	}

	w = doJSON(h, http.MethodPost, "/api/opd/bills", token, fmt.Sprintf(`{
		"patient_name": "Ko Mg",
		"doctor_id": %d,
		"lines": [
			{"line_type":"consultation","description":"A","qty":1,"unit_price_mmk":1},
			{"line_type":"consultation","description":"B","qty":1,"unit_price_mmk":1}
		]
	}`, doctorID))
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(w.Body.String(), "only one consultation") {
		t.Fatalf("body %s", w.Body.String())
	}
}

func TestExpiredBatchNotDispensed(t *testing.T) {
	sqlDB := openTestDB(t)
	uid, _ := insertSession(t, sqlDB, "Admin", 0)
	yesterday := time.Now().In(yangon).AddDate(0, 0, -1).Format("2006-01-02")
	later := time.Now().In(yangon).AddDate(0, 0, 40).Format("2006-01-02")

	t.Run("opd", func(t *testing.T) {
		itemID := insertItem(t, sqlDB, "OPDMED", "OPD med", 100, 50)
		expired := insertBatch(t, sqlDB, itemID, "OLD", yesterday, 10)
		today := insertBatch(t, sqlDB, itemID, "TODAY", localToday(), 4)
		future := insertBatch(t, sqlDB, itemID, "NEW", later, 6)
		blank := insertBatch(t, sqlDB, itemID, "NONE", "", 8)
		res, err := sqlDB.Exec(`
			INSERT INTO opd_bills (bill_no, patient_name, status, total_mmk, created_by_user_id)
			VALUES ('OPD-000099', 'P', 'draft', 1, ?)
		`, uid)
		if err != nil {
			t.Fatal(err)
		}
		billID, _ := res.LastInsertId()
		res, err = sqlDB.Exec(`
			INSERT INTO bill_lines (bill_id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk)
			VALUES (?, 'item', ?, 'OPDMED', 'OPD med', 1, 50, 50)
		`, billID, itemID)
		if err != nil {
			t.Fatal(err)
		}
		lineID, _ := res.LastInsertId()

		tx, err := sqlDB.Begin()
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		if _, err := fefoDeductSale(tx, billID, lineID, itemID, 4, uid); err != nil {
			t.Fatal(err)
		}
		if _, err := fefoDeductSale(tx, billID, lineID, itemID, 6, uid); err != nil {
			t.Fatal(err)
		}
		if _, err := fefoDeductSale(tx, billID, lineID, itemID, 2, uid); err != nil {
			t.Fatal(err)
		}
		if _, err := fefoDeductSale(tx, billID, lineID, itemID, 7, uid); err == nil || !strings.Contains(err.Error(), "OPDMED") {
			t.Fatalf("expired must not fill an undated shortfall, got %v", err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		if batchQty(t, sqlDB, expired) != 10 || batchQty(t, sqlDB, today) != 0 || batchQty(t, sqlDB, future) != 0 || batchQty(t, sqlDB, blank) != 6 {
			t.Fatalf("qtys expired=%d today=%d future=%d blank=%d",
				batchQty(t, sqlDB, expired), batchQty(t, sqlDB, today), batchQty(t, sqlDB, future), batchQty(t, sqlDB, blank))
		}
	})

	t.Run("pharmacy", func(t *testing.T) {
		itemID := insertItem(t, sqlDB, "PHMED", "Pharm med", 100, 50)
		expired := insertBatch(t, sqlDB, itemID, "OLD", yesterday, 9)
		future := insertBatch(t, sqlDB, itemID, "NEW", later, 3)
		res, err := sqlDB.Exec(`
			INSERT INTO pharmacy_bills (bill_no, patient_name, status, total_mmk, created_by_user_id)
			VALUES ('PH-000099', 'P', 'draft', 1, ?)
		`, uid)
		if err != nil {
			t.Fatal(err)
		}
		billID, _ := res.LastInsertId()
		res, err = sqlDB.Exec(`
			INSERT INTO pharmacy_bill_lines (
				bill_id, item_id, code, description, billing_qty, stock_qty, unit_price_mmk, line_total_mmk
			) VALUES (?, ?, 'PHMED', 'Pharm med', 3, 3, 50, 150)
		`, billID, itemID)
		if err != nil {
			t.Fatal(err)
		}
		lineID, _ := res.LastInsertId()
		tx, err := sqlDB.Begin()
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		if _, err := fefoDeductPharmacySale(tx, billID, lineID, itemID, 3, uid); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		if batchQty(t, sqlDB, expired) != 9 || batchQty(t, sqlDB, future) != 0 {
			t.Fatalf("pharmacy took expired stock: expired=%d future=%d", batchQty(t, sqlDB, expired), batchQty(t, sqlDB, future))
		}
	})

	t.Run("ot sale", func(t *testing.T) {
		itemID := insertItem(t, sqlDB, "OTMED", "OT med", 100, 50)
		expired := insertOtBatch(t, sqlDB, itemID, "OLD", yesterday, 8)
		future := insertOtBatch(t, sqlDB, itemID, "NEW", later, 5)
		res, err := sqlDB.Exec(`
			INSERT INTO ot_cases (case_no, patient_name, status) VALUES ('OT-000088', 'P', 'billed')
		`)
		if err != nil {
			t.Fatal(err)
		}
		caseID, _ := res.LastInsertId()
		res, err = sqlDB.Exec(`
			INSERT INTO ot_bills (bill_no, case_id, case_no, patient_name, status, total_mmk)
			VALUES ('OTB-000088', ?, 'OT-000088', 'P', 'draft', 250)
		`, caseID)
		if err != nil {
			t.Fatal(err)
		}
		billID, _ := res.LastInsertId()
		res, err = sqlDB.Exec(`
			INSERT INTO ot_bill_lines (bill_id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk)
			VALUES (?, 'item', ?, 'OTMED', 'OT med', 5, 50, 250)
		`, billID, itemID)
		if err != nil {
			t.Fatal(err)
		}
		lineID, _ := res.LastInsertId()
		tx, err := sqlDB.Begin()
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		if err := fefoDeductOtSale(tx, billID, lineID, itemID, 5, uid); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		if otBatchQty(t, sqlDB, expired) != 8 || otBatchQty(t, sqlDB, future) != 0 {
			t.Fatalf("OT sale took expired stock: expired=%d future=%d", otBatchQty(t, sqlDB, expired), otBatchQty(t, sqlDB, future))
		}
	})
}

func TestVoidOTBillAllowsRebill(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	res, err := sqlDB.Exec(`INSERT INTO doctors (name) VALUES ('Dr Tun')`)
	if err != nil {
		t.Fatal(err)
	}
	doctorID, _ := res.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO doctor_fees (doctor_id, fee_type, amount_mmk) VALUES (?, 'ot', 12000)
	`, doctorID); err != nil {
		t.Fatal(err)
	}
	res, err = sqlDB.Exec(`INSERT INTO ot_services (code, name, price_mmk) VALUES ('OTSVC', 'OT dressing', 4000)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := res.LastInsertId()
	itemID := insertItem(t, sqlDB, "OTDRUG", "OT drug", 2000, 500)
	batchID := insertBatch(t, sqlDB, itemID, "KEEP", localToday(), 7)

	res, err = sqlDB.Exec(`
		INSERT INTO ot_cases (case_no, patient_name, doctor_id, doctor_name, procedure_name, status)
		VALUES ('OT-000010', 'Patient', ?, 'Dr Tun', 'Appendectomy', 'reconciled')
	`, doctorID)
	if err != nil {
		t.Fatal(err)
	}
	caseID, _ := res.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO ot_case_items (
			case_id, item_id, code, name, sell_price_mmk, qty_issued, qty_used
		) VALUES (?, ?, 'OTDRUG', 'OT drug', 100, 2, 2)
	`, caseID, itemID); err != nil {
		t.Fatal(err)
	}
	res, err = sqlDB.Exec(`
		INSERT INTO ot_bills (
			bill_no, case_id, case_no, patient_name, doctor_id, doctor_name, procedure_name, status, total_mmk
		) VALUES ('OTB-000010', ?, 'OT-000010', 'Patient', ?, 'Dr Tun', 'Appendectomy', 'draft', 100)
	`, caseID, doctorID)
	if err != nil {
		t.Fatal(err)
	}
	oldBillID, _ := res.LastInsertId()
	if _, err := sqlDB.Exec(`
		UPDATE ot_cases SET status = 'billed', ot_bill_id = ? WHERE id = ?
	`, oldBillID, caseID); err != nil {
		t.Fatal(err)
	}

	h := &OT{DB: sqlDB}
	w := doJSON(h, http.MethodPost, fmt.Sprintf("/api/ot/bills/%d/void", oldBillID), token, `{"reason":"wrong price"}`)
	mustCode(t, w, http.StatusOK)

	var status string
	var linked sql.NullInt64
	if err := sqlDB.QueryRow(`SELECT status, ot_bill_id FROM ot_cases WHERE id = ?`, caseID).Scan(&status, &linked); err != nil {
		t.Fatal(err)
	}
	if status != "draft" || linked.Valid {
		t.Fatalf("case after void status=%s bill=%v", status, linked)
	}
	if batchQty(t, sqlDB, batchID) != 7 {
		t.Fatalf("void moved stock to %d", batchQty(t, sqlDB, batchID))
	}

	if _, err := sqlDB.Exec(`UPDATE items SET sell_price_mmk = 900 WHERE id = ?`, itemID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", caseID), token, fmt.Sprintf(`{
		"services": [{"line_type":"service","ref_id":%d,"description":"hack","qty":2,"unit_price_mmk":4000}]
	}`, serviceID))
	mustCode(t, w, http.StatusCreated)
	var bill otBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if bill.ID == oldBillID {
		t.Fatal("second bill reused the voided id")
	}
	if bill.TotalMMK != 1800+12000+4000 {
		t.Fatalf("total %d, want catalog item 1800 + OT fee 12000 + service 4000", bill.TotalMMK)
	}
	var sawItem, sawFee, sawService bool
	for _, l := range bill.Lines {
		switch l.LineType {
		case "item":
			sawItem = l.Qty == 2 && l.UnitPriceMMK == 900
		case "ot_fee":
			sawFee = l.UnitPriceMMK == 12000 && l.Qty == 1
		case "service":
			sawService = l.UnitPriceMMK == 4000 && l.Qty == 1 && l.Code == "OTSVC"
		}
	}
	if !sawItem || !sawFee || !sawService {
		t.Fatalf("lines %+v", bill.Lines)
	}
	if err := sqlDB.QueryRow(`SELECT status, ot_bill_id FROM ot_cases WHERE id = ?`, caseID).Scan(&status, &linked); err != nil {
		t.Fatal(err)
	}
	if status != "billed" || !linked.Valid || linked.Int64 != bill.ID {
		t.Fatalf("case after rebill status=%s bill=%v", status, linked)
	}
	if batchQty(t, sqlDB, batchID) != 7 {
		t.Fatalf("rebill moved stock to %d", batchQty(t, sqlDB, batchID))
	}
}

func TestPharmacyMarginIncludesPaidBill(t *testing.T) {
	sqlDB := openTestDB(t)
	itemID := insertItem(t, sqlDB, "PARA", "Paracetamol", 10000, 500)
	res, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bills (bill_no, patient_name, status, total_mmk, paid_at)
		VALUES ('PH-000050', 'P', 'paid', 1000, '2026-10-21 10:00:00')
	`)
	if err != nil {
		t.Fatal(err)
	}
	billID, _ := res.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bill_lines (
			bill_id, item_id, code, description, billing_qty, stock_qty, unit_price_mmk, line_total_mmk
		) VALUES (?, ?, 'PARA', 'Paracetamol', 2, 2, 500, 1000)
	`, billID, itemID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bills (bill_no, patient_name, status, total_mmk, paid_at)
		VALUES ('PH-000051', 'Draft', 'draft', 99999, '2026-10-21 11:00:00')
	`); err != nil {
		t.Fatal(err)
	}

	rep, err := buildPharmacyMargin(sqlDB, "2026-10-21", "2026-10-21")
	if err != nil {
		t.Fatal(err)
	}
	if rep.RevenueMMK != 1000 {
		t.Fatalf("revenue %d, want 1000", rep.RevenueMMK)
	}
	if rep.COGSMMK != 2000 {
		t.Fatalf("cogs %d, want 2000 (2 x 10000 / 10)", rep.COGSMMK)
	}
	if len(rep.TopByRevenue) != 1 || rep.TopByRevenue[0].ItemID != itemID {
		t.Fatalf("items %+v", rep.TopByRevenue)
	}
}

func TestMustChangePasswordBlocksAPI(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 1)
	w := doJSON(&OPD{DB: sqlDB}, http.MethodGet, "/api/opd/bills", token, "")
	mustCode(t, w, http.StatusForbidden)
	if !strings.Contains(w.Body.String(), "password change required") {
		t.Fatalf("body %s", w.Body.String())
	}

	authH := &Auth{DB: sqlDB}
	w = doJSON(authH, http.MethodGet, "/api/auth/me", token, "")
	mustCode(t, w, http.StatusOK)
	w = doJSON(authH, http.MethodPost, "/api/auth/change-password", token, `{}`)
	if w.Code == http.StatusForbidden {
		t.Fatalf("change-password blocked: %s", w.Body.String())
	}
	w = doJSON(authH, http.MethodPost, "/api/auth/logout", token, "")
	mustCode(t, w, http.StatusOK)
}

func mainQty(t *testing.T, sqlDB *sql.DB, itemID int64) int64 {
	t.Helper()
	var q int64
	if err := sqlDB.QueryRow(`SELECT COALESCE(SUM(qty), 0) FROM item_batches WHERE item_id = ?`, itemID).Scan(&q); err != nil {
		t.Fatal(err)
	}
	return q
}

func TestBatchIdentityAndBlankExpiry(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	h := &Pharmacy{DB: sqlDB}
	later := time.Now().In(yangon).AddDate(0, 0, 40).Format("2006-01-02")
	sooner := time.Now().In(yangon).AddDate(0, 0, 10).Format("2006-01-02")

	t.Run("restock and opening stock", func(t *testing.T) {
		itemID := insertItem(t, sqlDB, "RESTK", "Restock me", 100, 50)
		insertBatch(t, sqlDB, itemID, "KEEP", later, 5)
		w := doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/restock", itemID), token,
			`{"qty":2,"batch_no":"B2","expiry_date":"not-a-date"}`)
		mustCode(t, w, http.StatusBadRequest)
		if mainQty(t, sqlDB, itemID) != 5 {
			t.Fatalf("rejected restock changed qty to %d", mainQty(t, sqlDB, itemID))
		}
		for _, body := range []string{
			`{"qty":2}`,
			`{"qty":2,"batch_no":"B2"}`,
			fmt.Sprintf(`{"qty":2,"expiry_date":"%s"}`, later),
		} {
			w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/restock", itemID), token, body)
			mustCode(t, w, http.StatusOK)
		}
		w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/restock", itemID), token,
			fmt.Sprintf(`{"qty":1,"batch_no":"B2","expiry_date":"%s"}`, later))
		mustCode(t, w, http.StatusOK)
		// units_per_purchase is 10: three qty-2 receipts (60) plus one qty-1 receipt (10).
		if mainQty(t, sqlDB, itemID) != 75 {
			t.Fatalf("restock qty %d, want 75", mainQty(t, sqlDB, itemID))
		}

		w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/restock", itemID), token,
			`{"qty":0,"buy_price_mmk":120,"sell_price_mmk":60}`)
		mustCode(t, w, http.StatusOK)
		if mainQty(t, sqlDB, itemID) != 75 {
			t.Fatalf("price-only restock changed qty to %d", mainQty(t, sqlDB, itemID))
		}
		var buy, sell int64
		if err := sqlDB.QueryRow(`SELECT buy_price_mmk, sell_price_mmk FROM items WHERE id = ?`, itemID).Scan(&buy, &sell); err != nil {
			t.Fatal(err)
		}
		if buy != 120 || sell != 60 {
			t.Fatalf("price-only restock prices %d/%d, want 120/60", buy, sell)
		}

		w = doJSON(h, http.MethodPost, "/api/pharmacy/items", token,
			`{"code":"OPENBAD","name":"Open","initial_qty":3,"expiry_date":"not-a-date"}`)
		mustCode(t, w, http.StatusBadRequest)
		var n int
		if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM items WHERE code = 'OPENBAD'`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Fatalf("rejected opening stock created %d items", n)
		}
		for _, body := range []string{
			`{"code":"OPEN1","name":"Open","initial_qty":3}`,
			`{"code":"OPEN2","name":"Open lot","initial_qty":3,"batch_no":"LOT"}`,
			fmt.Sprintf(`{"code":"OPEN3","name":"Open date","initial_qty":3,"expiry_date":"%s"}`, later),
			fmt.Sprintf(`{"code":"OPEN4","name":"Open both","initial_qty":3,"batch_no":"LOT","expiry_date":"%s"}`, later),
		} {
			w = doJSON(h, http.MethodPost, "/api/pharmacy/items", token, body)
			mustCode(t, w, http.StatusCreated)
		}
		for _, code := range []string{"OPEN1", "OPEN2", "OPEN3", "OPEN4"} {
			var opened int64
			if err := sqlDB.QueryRow(`SELECT id FROM items WHERE code = ?`, code).Scan(&opened); err != nil {
				t.Fatal(err)
			}
			if mainQty(t, sqlDB, opened) != 3 {
				t.Fatalf("%s opening qty %d, want 3", code, mainQty(t, sqlDB, opened))
			}
		}

		w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/adjust", itemID), token,
			`{"qty_delta":4,"reason":"count","expiry_date":"not-a-date"}`)
		mustCode(t, w, http.StatusBadRequest)
		if mainQty(t, sqlDB, itemID) != 75 {
			t.Fatalf("rejected adjust changed qty to %d", mainQty(t, sqlDB, itemID))
		}
		w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/adjust", itemID), token,
			`{"qty_delta":4,"reason":"count"}`)
		mustCode(t, w, http.StatusOK)
		if mainQty(t, sqlDB, itemID) != 79 {
			t.Fatalf("undated adjust qty %d, want 79", mainQty(t, sqlDB, itemID))
		}
		w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/adjust", itemID), token,
			fmt.Sprintf(`{"qty_delta":4,"reason":"count","batch_no":"ADJ2","expiry_date":"%s"}`, later))
		mustCode(t, w, http.StatusOK)
		if mainQty(t, sqlDB, itemID) != 83 {
			t.Fatalf("adjust qty %d, want 83", mainQty(t, sqlDB, itemID))
		}
	})

	t.Run("label then sell", func(t *testing.T) {
		itemID := insertItem(t, sqlDB, "LABEL", "Label me", 100, 50)
		dated := insertBatch(t, sqlDB, itemID, "EARLY", sooner, 3)
		blank := insertBatch(t, sqlDB, itemID, "", "", 8)

		w := doJSON(h, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
			"patient_name": "Ma Hla",
			"lines": [{"item_id": %d, "tablet_qty": 3, "unit_price_mmk": 1}]
		}`, itemID))
		mustCode(t, w, http.StatusCreated)
		var bill pharmacyBill
		if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
			t.Fatal(err)
		}
		w = doJSON(h, http.MethodGet, fmt.Sprintf("/api/pharmacy/bills/%d/print", bill.ID), token, "")
		mustCode(t, w, http.StatusOK)
		if !strings.Contains(w.Body.String(), "DRAFT") {
			t.Fatalf("draft receipt: %s", w.Body.String())
		}
		w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", bill.ID), token, "")
		mustCode(t, w, http.StatusOK)
		if batchQty(t, sqlDB, dated) != 0 || batchQty(t, sqlDB, blank) != 8 {
			t.Fatalf("FEFO dated=%d blank=%d", batchQty(t, sqlDB, dated), batchQty(t, sqlDB, blank))
		}
		w = doJSON(h, http.MethodGet, fmt.Sprintf("/api/pharmacy/bills/%d/print", bill.ID), token, "")
		mustCode(t, w, http.StatusOK)
		if !strings.Contains(w.Body.String(), "PAID \u2014 CASH") {
			t.Fatalf("paid receipt missing PAID — CASH: %s", w.Body.String())
		}

		w = doJSON(h, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
			"patient_name": "Ma Hla",
			"lines": [{"item_id": %d, "tablet_qty": 1, "unit_price_mmk": 1}]
		}`, itemID))
		mustCode(t, w, http.StatusCreated)
		if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
			t.Fatal(err)
		}
		w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", bill.ID), token, "")
		mustCode(t, w, http.StatusOK)
		if batchQty(t, sqlDB, blank) != 7 {
			t.Fatalf("undated sale qty %d, want 7", batchQty(t, sqlDB, blank))
		}

		w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/batches/%d/label", itemID, blank), token,
			fmt.Sprintf(`{"batch_no":"LAB1","expiry_date":"%s"}`, later))
		mustCode(t, w, http.StatusOK)
		if batchQty(t, sqlDB, blank) != 7 {
			t.Fatalf("label changed qty to %d", batchQty(t, sqlDB, blank))
		}
		var gotNo, gotExp string
		if err := sqlDB.QueryRow(`SELECT batch_no, expiry_date FROM item_batches WHERE id = ?`, blank).Scan(&gotNo, &gotExp); err != nil {
			t.Fatal(err)
		}
		if gotNo != "LAB1" || gotExp != later {
			t.Fatalf("label stored %s %s", gotNo, gotExp)
		}
		var detail string
		if err := sqlDB.QueryRow(`
			SELECT detail FROM audit_logs WHERE action = 'label_batch' AND entity = 'item_batch' AND entity_id = ?
		`, blank).Scan(&detail); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(detail, "LAB1") || !strings.Contains(detail, later) {
			t.Fatalf("audit %s", detail)
		}

		w = doJSON(h, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
			"patient_name": "Ma Hla",
			"lines": [{"item_id": %d, "tablet_qty": 1, "unit_price_mmk": 1}]
		}`, itemID))
		mustCode(t, w, http.StatusCreated)
		if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
			t.Fatal(err)
		}
		w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", bill.ID), token, "")
		mustCode(t, w, http.StatusOK)
		if batchQty(t, sqlDB, blank) != 6 {
			t.Fatalf("after label sale qty %d, want 6", batchQty(t, sqlDB, blank))
		}
		w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", bill.ID), token, "")
		mustCode(t, w, http.StatusBadRequest)
		if batchQty(t, sqlDB, blank) != 6 {
			t.Fatalf("second pay changed qty to %d", batchQty(t, sqlDB, blank))
		}
	})

	t.Run("ot cupboard", func(t *testing.T) {
		uid, _ := insertSession(t, sqlDB, "Admin", 0)
		itemID := insertItem(t, sqlDB, "OTLBL", "OT label", 100, 50)
		blank := insertOtBatch(t, sqlDB, itemID, "", "", 6)
		dated := insertOtBatch(t, sqlDB, itemID, "OT1", sooner, 2)
		res, err := sqlDB.Exec(`INSERT INTO ot_cases (case_no, patient_name, status) VALUES ('OT-000077', 'P', 'billed')`)
		if err != nil {
			t.Fatal(err)
		}
		caseID, _ := res.LastInsertId()
		res, err = sqlDB.Exec(`
			INSERT INTO ot_bills (bill_no, case_id, case_no, patient_name, status, total_mmk)
			VALUES ('OTB-000077', ?, 'OT-000077', 'P', 'draft', 1)
		`, caseID)
		if err != nil {
			t.Fatal(err)
		}
		billID, _ := res.LastInsertId()
		res, err = sqlDB.Exec(`
			INSERT INTO ot_bill_lines (bill_id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk)
			VALUES (?, 'item', ?, 'OTLBL', 'OT label', 1, 50, 50)
		`, billID, itemID)
		if err != nil {
			t.Fatal(err)
		}
		lineID, _ := res.LastInsertId()

		tx, err := sqlDB.Begin()
		if err != nil {
			t.Fatal(err)
		}
		if err := fefoDeductOtSale(tx, billID, lineID, itemID, 2, uid); err != nil {
			t.Fatal(err)
		}
		if err := fefoDeductOtSale(tx, billID, lineID, itemID, 1, uid); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		if otBatchQty(t, sqlDB, dated) != 0 || otBatchQty(t, sqlDB, blank) != 5 {
			t.Fatalf("ot dated=%d blank=%d", otBatchQty(t, sqlDB, dated), otBatchQty(t, sqlDB, blank))
		}

		ot := &OT{DB: sqlDB}
		w := doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/stock/%d/label", blank), token,
			fmt.Sprintf(`{"batch_no":"CUP1","expiry_date":"%s"}`, later))
		mustCode(t, w, http.StatusOK)
		if otBatchQty(t, sqlDB, blank) != 5 {
			t.Fatalf("ot label changed qty to %d", otBatchQty(t, sqlDB, blank))
		}
		tx, err = sqlDB.Begin()
		if err != nil {
			t.Fatal(err)
		}
		if err := fefoDeductOtSale(tx, billID, lineID, itemID, 1, uid); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		if otBatchQty(t, sqlDB, blank) != 4 {
			t.Fatalf("labeled OT qty %d, want 4", otBatchQty(t, sqlDB, blank))
		}

		_, phToken := insertSession(t, sqlDB, "Pharmacy", 0)
		w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/stock/%d/label", blank), phToken, `{"batch_no":"X","expiry_date":"2027-01-01"}`)
		mustCode(t, w, http.StatusForbidden)
	})
}

func TestPharmacyReturnCreditsStockAndNetsCash(t *testing.T) {
	sqlDB := openTestDB(t)
	uid, token := insertSession(t, sqlDB, "Pharmacy", 0)
	h := &Pharmacy{DB: sqlDB}
	itemID := insertItem(t, sqlDB, "RETMED", "Return med", 1000, 100)
	dated := insertBatch(t, sqlDB, itemID, "LOT-A", "2030-01-01", 20)

	// Sale still deducts FEFO from the dated lot.
	w := doJSON(h, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"patient_name": "Sale Patient",
		"kind": "sale",
		"lines": [{"item_id": %d, "tablet_qty": 5}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	var sale struct {
		ID     int64  `json:"id"`
		BillNo string `json:"bill_no"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &sale); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(sale.BillNo, "PH-") {
		t.Fatalf("sale bill_no %s", sale.BillNo)
	}
	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", sale.ID), token, "{}")
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, dated) != 15 {
		t.Fatalf("after sale dated qty %d, want 15", batchQty(t, sqlDB, dated))
	}

	// Return credits the unlabeled MAIN batch (not the dated lot).
	w = doJSON(h, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"patient_name": "Return Patient",
		"kind": "return",
		"lines": [{"item_id": %d, "tablet_qty": 3}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	var ret struct {
		ID       int64  `json:"id"`
		BillNo   string `json:"bill_no"`
		TotalMMK int64  `json:"total_mmk"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &ret); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(ret.BillNo, "RT-") {
		t.Fatalf("return bill_no %s", ret.BillNo)
	}
	if ret.TotalMMK != 300 {
		t.Fatalf("return total %d, want 300", ret.TotalMMK)
	}
	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", ret.ID), token, "{}")
	mustCode(t, w, http.StatusOK)

	var blankID, blankQty int64
	err := sqlDB.QueryRow(`
		SELECT id, qty FROM item_batches
		WHERE item_id = ? AND location_code = 'MAIN'
		  AND batch_no = '' AND (expiry_date IS NULL OR expiry_date = '')
	`, itemID).Scan(&blankID, &blankQty)
	if err != nil {
		t.Fatalf("unlabeled batch: %v", err)
	}
	if blankQty != 3 {
		t.Fatalf("unlabeled qty %d, want 3", blankQty)
	}
	if batchQty(t, sqlDB, dated) != 15 {
		t.Fatalf("dated lot changed to %d", batchQty(t, sqlDB, dated))
	}

	var moveType string
	var delta int64
	if err := sqlDB.QueryRow(`
		SELECT movement_type, qty_delta FROM stock_movements
		WHERE item_id = ? AND batch_id = ? AND movement_type = 'RETURN'
		ORDER BY id DESC LIMIT 1
	`, itemID, blankID).Scan(&moveType, &delta); err != nil {
		t.Fatalf("RETURN movement: %v", err)
	}
	if delta != 3 {
		t.Fatalf("RETURN delta %d, want 3", delta)
	}

	// List kind filters keep desks separate.
	w = doJSON(h, http.MethodGet, "/api/pharmacy/bills?kind=return", token, "")
	mustCode(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), ret.BillNo) || strings.Contains(w.Body.String(), sale.BillNo) {
		t.Fatalf("return list mixed: %s", w.Body.String())
	}
	w = doJSON(h, http.MethodGet, "/api/pharmacy/bills?kind=sale", token, "")
	mustCode(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), sale.BillNo) || strings.Contains(w.Body.String(), ret.BillNo) {
		t.Fatalf("sale list mixed: %s", w.Body.String())
	}

	// Daily cash nets the refund.
	today := time.Now().In(time.FixedZone("Asia/Yangon", 6*3600+30*60)).Format("2006-01-02")
	cash, err := buildDailyCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	// Sale 5*100=500 minus return 300 = 200.
	if cash.PharmacyTotal != 200 {
		t.Fatalf("pharmacy cash %d, want 200 (uid=%d)", cash.PharmacyTotal, uid)
	}

	// Void return removes the credited qty.
	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/void", ret.ID), token, `{"reason":"test void"}`)
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, blankID) != 0 {
		t.Fatalf("after void blank qty %d, want 0", batchQty(t, sqlDB, blankID))
	}
}

func TestPharmacyTransferToOt(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Pharmacy", 0)
	h := &Pharmacy{DB: sqlDB}
	itemID := insertItem(t, sqlDB, "XFOT", "Transfer med", 100, 50)
	yesterday := time.Now().In(yangon).AddDate(0, 0, -1).Format("2006-01-02")
	sooner := time.Now().In(yangon).AddDate(0, 0, 10).Format("2006-01-02")
	dated := insertBatch(t, sqlDB, itemID, "EARLY", sooner, 2)
	blank := insertBatch(t, sqlDB, itemID, "", "", 8)
	expired := insertBatch(t, sqlDB, itemID, "OLD", yesterday, 5)

	today := time.Now().In(yangon).Format("2006-01-02")
	before, err := buildDailyCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}

	// Not enough saleable stock (expired does not count). Nothing moves.
	w := doJSON(h, http.MethodPost, "/api/pharmacy/bills", token, fmt.Sprintf(`{
		"kind":"transfer",
		"lines":[{"item_id":%d,"tablet_qty":11,"unit_price_mmk":50}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	var short pharmacyBill
	if err := json.Unmarshal(w.Body.Bytes(), &short); err != nil {
		t.Fatal(err)
	}
	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/transfer", short.ID), token, "{}")
	mustCode(t, w, http.StatusBadRequest)
	if batchQty(t, sqlDB, dated) != 2 || batchQty(t, sqlDB, blank) != 8 || batchQty(t, sqlDB, expired) != 5 {
		t.Fatal("short transfer changed stock")
	}
	if err := sqlDB.QueryRow(`SELECT status FROM pharmacy_bills WHERE id = ?`, short.ID).Scan(&short.Status); err != nil {
		t.Fatal(err)
	}
	if short.Status != "draft" {
		t.Fatalf("short slip status %s", short.Status)
	}

	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", short.ID), token, "{}")
	mustCode(t, w, http.StatusBadRequest)
	if batchQty(t, sqlDB, dated) != 2 {
		t.Fatal("pay of a transfer slip changed stock")
	}

	done := confirmTransferBill(t, h, token, itemID, 3)
	if batchQty(t, sqlDB, dated) != 0 || batchQty(t, sqlDB, blank) != 7 || batchQty(t, sqlDB, expired) != 5 {
		t.Fatalf("FEFO dated=%d blank=%d expired=%d", batchQty(t, sqlDB, dated), batchQty(t, sqlDB, blank), batchQty(t, sqlDB, expired))
	}
	var datedOt, blankOt int64
	if err := sqlDB.QueryRow(`
		SELECT qty FROM ot_batches WHERE item_id = ? AND batch_no = 'EARLY' AND expiry_date = ?
	`, itemID, sooner).Scan(&datedOt); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`
		SELECT qty FROM ot_batches
		WHERE item_id = ? AND batch_no = '' AND (expiry_date IS NULL OR expiry_date = '')
	`, itemID).Scan(&blankOt); err != nil {
		t.Fatal(err)
	}
	if datedOt != 2 || blankOt != 1 {
		t.Fatalf("ot dated=%d blank=%d", datedOt, blankOt)
	}

	w = doJSON(h, http.MethodGet, "/api/pharmacy/bills?kind=sale", token, "")
	mustCode(t, w, http.StatusOK)
	if strings.Contains(w.Body.String(), done.BillNo) {
		t.Fatalf("sale list includes transfer: %s", w.Body.String())
	}
	w = doJSON(h, http.MethodGet, "/api/pharmacy/bills?kind=return", token, "")
	mustCode(t, w, http.StatusOK)
	if strings.Contains(w.Body.String(), done.BillNo) {
		t.Fatalf("return list includes transfer: %s", w.Body.String())
	}
	w = doJSON(h, http.MethodGet, "/api/pharmacy/bills?kind=transfer", token, "")
	mustCode(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), done.BillNo) {
		t.Fatalf("transfer list missing slip: %s", w.Body.String())
	}

	after, err := buildDailyCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	if after.PharmacyTotal != before.PharmacyTotal || after.PharmacyCount != before.PharmacyCount {
		t.Fatalf("cash changed from %+v to %+v", before.PharmacyTotal, after.PharmacyTotal)
	}

	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/void", done.ID), token, `{"reason":"put back"}`)
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, dated) != 2 || batchQty(t, sqlDB, blank) != 8 || datedOtRow(t, sqlDB, itemID, sooner) != 0 || blankOtRow(t, sqlDB, itemID) != 0 {
		t.Fatalf("void left dated=%d blank=%d otDated=%d otBlank=%d",
			batchQty(t, sqlDB, dated), batchQty(t, sqlDB, blank), datedOtRow(t, sqlDB, itemID, sooner), blankOtRow(t, sqlDB, itemID))
	}

	again := confirmTransferBill(t, h, token, itemID, 4)
	if _, err := sqlDB.Exec(`UPDATE ot_batches SET qty = 1 WHERE item_id = ?`, itemID); err != nil {
		t.Fatal(err)
	}
	mainBefore := batchQty(t, sqlDB, dated) + batchQty(t, sqlDB, blank)
	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/void", again.ID), token, `{"reason":"cupboard used"}`)
	mustCode(t, w, http.StatusBadRequest)
	var status string
	if err := sqlDB.QueryRow(`SELECT status FROM pharmacy_bills WHERE id = ?`, again.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "paid" {
		t.Fatalf("failed void status %s", status)
	}
	if batchQty(t, sqlDB, dated)+batchQty(t, sqlDB, blank) != mainBefore {
		t.Fatal("failed void changed MAIN qty")
	}
}

func datedOtRow(t *testing.T, sqlDB *sql.DB, itemID int64, expiry string) int64 {
	t.Helper()
	var q int64
	err := sqlDB.QueryRow(`
		SELECT COALESCE(qty, 0) FROM ot_batches WHERE item_id = ? AND expiry_date = ?
	`, itemID, expiry).Scan(&q)
	if err == sql.ErrNoRows {
		return 0
	}
	if err != nil {
		t.Fatal(err)
	}
	return q
}

func blankOtRow(t *testing.T, sqlDB *sql.DB, itemID int64) int64 {
	t.Helper()
	var q int64
	err := sqlDB.QueryRow(`
		SELECT COALESCE(qty, 0) FROM ot_batches
		WHERE item_id = ? AND batch_no = '' AND (expiry_date IS NULL OR expiry_date = '')
	`, itemID).Scan(&q)
	if err == sql.ErrNoRows {
		return 0
	}
	if err != nil {
		t.Fatal(err)
	}
	return q
}

func TestTrainingOffUnlessEnabled(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	off := &Demo{DB: sqlDB}
	w := doJSON(off, http.MethodGet, "/api/demo/status", token, "")
	mustCode(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), `"enabled":false`) {
		t.Fatalf("status %s", w.Body.String())
	}
	w = doJSON(off, http.MethodPost, "/api/demo/seed", token, "{}")
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(off, http.MethodPost, "/api/demo/reset", token, "{}")
	mustCode(t, w, http.StatusForbidden)
	var n int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM items WHERE code LIKE 'DEMO-%'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("disabled training wrote %d items", n)
	}

	on := &Demo{DB: sqlDB, AllowTraining: true}
	w = doJSON(on, http.MethodGet, "/api/demo/status", token, "")
	mustCode(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), `"enabled":true`) {
		t.Fatalf("status %s", w.Body.String())
	}
}

func TestDeletePharmacyItem(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Pharmacy", 0)
	h := &Pharmacy{DB: sqlDB}
	later := time.Now().In(yangon).AddDate(0, 0, 40).Format("2006-01-02")

	okID := insertItem(t, sqlDB, "DEL1", "Delete me", 100, 50)
	insertBatch(t, sqlDB, okID, "LOT", later, 20)
	if _, err := sqlDB.Exec(`
		INSERT INTO stock_movements (item_id, location_code, movement_type, qty_delta, reason)
		VALUES (?, 'MAIN', 'PURCHASE', 20, 'Restock')
	`, okID); err != nil {
		t.Fatal(err)
	}
	w := doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/delete", okID), token, `{}`)
	mustCode(t, w, http.StatusOK)
	var n int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM items WHERE id = ?`, okID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("item still present")
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM item_batches WHERE item_id = ?`, okID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("batches not cascaded")
	}

	blockID := insertItem(t, sqlDB, "DEL2", "On a bill", 100, 50)
	if _, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bills (bill_no, patient_name, status, total_mmk)
		VALUES ('PH-DEL', 'P', 'draft', 0)
	`); err != nil {
		t.Fatal(err)
	}
	var billID int64
	if err := sqlDB.QueryRow(`SELECT id FROM pharmacy_bills WHERE bill_no = 'PH-DEL'`).Scan(&billID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bill_lines (
			bill_id, item_id, code, description, billing_qty, stock_qty, unit_price_mmk, line_total_mmk
		) VALUES (?, ?, 'DEL2', 'On a bill', 1, 1, 50, 50)
	`, billID, blockID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/delete", blockID), token, `{}`)
	mustCode(t, w, http.StatusConflict)
	if !strings.Contains(w.Body.String(), "item is on a bill or transfer") {
		t.Fatalf("body %s", w.Body.String())
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM items WHERE id = ?`, blockID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("blocked item was deleted")
	}
}

func TestRestockPackUnit(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	h := &Pharmacy{DB: sqlDB}

	res, err := sqlDB.Exec(`
		INSERT INTO items (
			code, name, category, buy_price_mmk, sell_price_mmk,
			pack_l1_qty, pack_l1_unit, pack_l2_qty, pack_l2_unit, pack_l3_qty, pack_l3_unit,
			units_per_purchase, purchase_unit, stock_unit, billing_unit
		) VALUES (
			'PACKRST', 'Pack restock', 'Tablet', 1000, 10,
			1, 'Box', 10, 'Card', 10, 'Tablet',
			100, 'Box', 'Tablet', 'Tablet'
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	itemID, _ := res.LastInsertId()

	w := doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/restock", itemID), token,
		`{"qty":3,"qty_unit":"Card"}`)
	mustCode(t, w, http.StatusOK)
	if mainQty(t, sqlDB, itemID) != 30 {
		t.Fatalf("card restock qty %d, want 30", mainQty(t, sqlDB, itemID))
	}

	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/restock", itemID), token,
		`{"qty":1,"qty_unit":"Bottle"}`)
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(w.Body.String(), "unknown unit") {
		t.Fatalf("body %s", w.Body.String())
	}
	if mainQty(t, sqlDB, itemID) != 30 {
		t.Fatalf("rejected restock changed qty to %d", mainQty(t, sqlDB, itemID))
	}

	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/restock", itemID), token,
		`{"qty":1,"qty_unit":"stock"}`)
	mustCode(t, w, http.StatusOK)
	if mainQty(t, sqlDB, itemID) != 31 {
		t.Fatalf("stock restock qty %d, want 31", mainQty(t, sqlDB, itemID))
	}
}
