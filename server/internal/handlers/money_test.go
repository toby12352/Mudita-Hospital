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
		if _, err := fefoDeductSale(tx, billID, lineID, itemID, 100, uid); err == nil || !strings.Contains(err.Error(), "OPDMED") {
			t.Fatalf("want insufficient stock naming the item, got %v", err)
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
	res, err = sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('OTSVC', 'OT dressing', 4000)`)
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
		"services": [{"line_type":"service","ref_id":%d,"description":"hack","qty":2,"unit_price_mmk":1}]
	}`, serviceID))
	mustCode(t, w, http.StatusCreated)
	var bill otBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if bill.ID == oldBillID {
		t.Fatal("second bill reused the voided id")
	}
	if bill.TotalMMK != 1800+12000+8000 {
		t.Fatalf("total %d, want catalog item 1800 + OT fee 12000 + service 8000", bill.TotalMMK)
	}
	var sawItem, sawFee, sawService bool
	for _, l := range bill.Lines {
		switch l.LineType {
		case "item":
			sawItem = l.Qty == 2 && l.UnitPriceMMK == 900
		case "ot_fee":
			sawFee = l.UnitPriceMMK == 12000 && l.Qty == 1
		case "service":
			sawService = l.UnitPriceMMK == 4000 && l.Qty == 2 && l.Code == "OTSVC"
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
