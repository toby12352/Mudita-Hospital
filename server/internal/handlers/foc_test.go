package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestOpdBillFocDraftTotalAndPrint(t *testing.T) {
	sqlDB := openTestDB(t)
	_, tok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	opd := &OPD{DB: sqlDB}

	res, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('FOC1', 'Free visit', 2000)`)
	if err != nil {
		t.Fatal(err)
	}
	focID, _ := res.LastInsertId()
	res, err = sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('PAY1', 'Paid visit', 5000)`)
	if err != nil {
		t.Fatal(err)
	}
	paidID, _ := res.LastInsertId()

	w := doJSON(opd, http.MethodPost, "/api/opd/bills", tok, fmt.Sprintf(`{
		"patient_name":"Daw Foc",
		"discount_value":10,
		"discount_unit":"percent",
		"lines":[
			{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":2000,"foc":1},
			{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":5000,"foc":0}
		]
	}`, focID, paidID))
	mustCode(t, w, http.StatusCreated)
	bill := decodeOpdBill(t, w)
	if len(bill.Lines) != 2 {
		t.Fatalf("lines %d", len(bill.Lines))
	}
	if bill.Lines[0].Foc != 1 || bill.Lines[0].LineTotalMMK != 2000 {
		t.Fatalf("foc line %+v", bill.Lines[0])
	}
	if bill.Lines[1].Foc != 0 {
		t.Fatalf("paid line foc %d", bill.Lines[1].Foc)
	}
	// Gross is only the charged line; 10% of 5000 = 500.
	if bill.TotalMMK != 4500 || bill.DiscountMMK != 500 {
		t.Fatalf("total=%d discount=%d", bill.TotalMMK, bill.DiscountMMK)
	}

	w = doJSON(opd, http.MethodGet, fmt.Sprintf("/api/opd/bills/%d", bill.ID), tok, "")
	mustCode(t, w, http.StatusOK)
	reloaded := decodeOpdBill(t, w)
	if reloaded.Lines[0].Foc != 1 || reloaded.TotalMMK != 4500 {
		t.Fatalf("reload %+v total %d", reloaded.Lines[0], reloaded.TotalMMK)
	}

	w = doJSON(opd, http.MethodGet, fmt.Sprintf("/api/opd/bills/%d/print", bill.ID), tok, "")
	mustCode(t, w, http.StatusOK)
	html := w.Body.String()
	if !strings.Contains(html, "FOC") {
		t.Fatal("print missing FOC label")
	}
	if !strings.Contains(html, "-2,000") {
		t.Fatalf("print missing negative FOC amount: %s", html)
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", tok, fmt.Sprintf(`{
		"patient_name":"Bad Foc",
		"lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":2000,"foc":2}]
	}`, focID))
	mustCode(t, w, http.StatusBadRequest)
}

func TestPharmacySaleFocTotalAndStockOnce(t *testing.T) {
	sqlDB := openTestDB(t)
	_, tok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ph := &Pharmacy{DB: sqlDB}

	itemID := insertItem(t, sqlDB, "FOCMED", "Free med", 50, 100)
	batchID := insertBatch(t, sqlDB, itemID, "F1", "2030-01-01", 20)

	w := doJSON(ph, http.MethodPost, "/api/pharmacy/bills", tok, fmt.Sprintf(`{
		"patient_name":"U Free",
		"kind":"sale",
		"lines":[{"item_id":%d,"tablet_qty":3,"foc":1}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	bill := decodePharmacyBill(t, w)
	if bill.TotalMMK != 0 {
		t.Fatalf("foc sale total %d", bill.TotalMMK)
	}
	if len(bill.Lines) != 1 || bill.Lines[0].Foc != 1 || bill.Lines[0].LineTotalMMK <= 0 {
		t.Fatalf("line %+v", bill.Lines)
	}

	w = doJSON(ph, http.MethodPost, fmt.Sprintf("/api/pharmacy/bills/%d/pay", bill.ID), tok, `{}`)
	mustCode(t, w, http.StatusOK)
	if batchQty(t, sqlDB, batchID) != 17 {
		t.Fatalf("stock after foc pay %d", batchQty(t, sqlDB, batchID))
	}
	var allocs int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM pharmacy_bill_stock_allocs WHERE bill_id = ?`, bill.ID).Scan(&allocs); err != nil {
		t.Fatal(err)
	}
	if allocs != 1 {
		t.Fatalf("allocs %d", allocs)
	}
}

func TestOtCaseFocOnItemsAndServices(t *testing.T) {
	sqlDB := openTestDB(t)
	_, tok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ot := &OT{DB: sqlDB}

	itemFree := insertItem(t, sqlDB, "OTFREE", "Free OT item", 10, 400)
	itemPaid := insertItem(t, sqlDB, "OTPAID", "Paid OT item", 10, 600)
	_ = insertOtBatch(t, sqlDB, itemFree, "OF1", "2031-01-01", 10)
	_ = insertOtBatch(t, sqlDB, itemPaid, "OP1", "2031-01-01", 10)

	w := doJSON(ot, http.MethodPost, "/api/ot/services", tok, `{"code":"OTFOC","name":"Free OT svc","price_mmk":900}`)
	mustCode(t, w, http.StatusCreated)
	var focSvc otService
	if err := json.Unmarshal(w.Body.Bytes(), &focSvc); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, "/api/ot/services", tok, `{"code":"OTPAY","name":"Paid OT svc","price_mmk":1100}`)
	mustCode(t, w, http.StatusCreated)
	var paidSvc otService
	if err := json.Unmarshal(w.Body.Bytes(), &paidSvc); err != nil {
		t.Fatal(err)
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/cases", tok, fmt.Sprintf(`{
		"patient_name":"OT Foc",
		"items":[
			{"item_id":%d,"qty_issued":1,"foc":1},
			{"item_id":%d,"qty_issued":1,"foc":0}
		],
		"services":[
			{"ref_id":%d,"unit_price_mmk":900,"foc":1},
			{"ref_id":%d,"unit_price_mmk":1100,"foc":0}
		]
	}`, itemFree, itemPaid, focSvc.ID, paidSvc.ID))
	mustCode(t, w, http.StatusCreated)
	c := decodeOtCase(t, w)
	if len(c.Items) != 2 || c.Items[0].Foc != 1 || c.Items[1].Foc != 0 {
		t.Fatalf("items %+v", c.Items)
	}
	if len(c.Services) != 2 || c.Services[0].Foc != 1 || c.Services[1].Foc != 0 {
		t.Fatalf("services %+v", c.Services)
	}

	w = doJSON(ot, http.MethodGet, "/api/ot/cases/"+strconv.FormatInt(c.ID, 10), tok, "")
	mustCode(t, w, http.StatusOK)
	reloaded := decodeOtCase(t, w)
	if reloaded.Items[0].Foc != 1 || reloaded.Services[0].Foc != 1 {
		t.Fatalf("reload foc item=%d svc=%d", reloaded.Items[0].Foc, reloaded.Services[0].Foc)
	}

	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", c.ID), tok, fmt.Sprintf(`{
		"services":[
			{"line_type":"service","ref_id":%d,"unit_price_mmk":900,"foc":1},
			{"line_type":"service","ref_id":%d,"unit_price_mmk":1100,"foc":0}
		]
	}`, focSvc.ID, paidSvc.ID))
	mustCode(t, w, http.StatusCreated)
	bill := decodeOtBill(t, w)
	// Charged: paid item 600 + paid service 1100 = 1700. FOC item/service excluded.
	if bill.TotalMMK != 1700 {
		t.Fatalf("ot bill total %d want 1700 lines=%+v", bill.TotalMMK, bill.Lines)
	}
	var focLines int
	for _, l := range bill.Lines {
		if l.Foc == 1 {
			focLines++
			if l.LineTotalMMK <= 0 {
				t.Fatalf("foc line stored zero %+v", l)
			}
		}
	}
	if focLines != 2 {
		t.Fatalf("foc bill lines %d", focLines)
	}
}

func TestBillLineFocMigrationDefault(t *testing.T) {
	sqlDB := openTestDB(t)
	var foc int
	if err := sqlDB.QueryRow(`SELECT foc FROM bill_lines LIMIT 0`).Scan(&foc); err == nil {
		// No rows is fine; column must exist.
	}
	// Fresh migrate sets DEFAULT 0; insert without foc should store 0.
	res, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('DEF0', 'Default', 100)`)
	if err != nil {
		t.Fatal(err)
	}
	svcID, _ := res.LastInsertId()
	res, err = sqlDB.Exec(`
		INSERT INTO opd_bills (bill_no, patient_name, status, total_mmk)
		VALUES ('OPD-FOCDEF', 'Legacy', 'draft', 100)
	`)
	if err != nil {
		t.Fatal(err)
	}
	billID, _ := res.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO bill_lines (bill_id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order)
		VALUES (?, 'service', ?, 'DEF0', 'Default', 1, 100, 100, 0)
	`, billID, svcID); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT foc FROM bill_lines WHERE bill_id = ?`, billID).Scan(&foc); err != nil {
		t.Fatal(err)
	}
	if foc != 0 {
		t.Fatalf("default foc %d", foc)
	}
}
