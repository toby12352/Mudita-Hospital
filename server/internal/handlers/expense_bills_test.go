package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExpenseBills(t *testing.T) {
	sqlDB := openTestDB(t)
	var applied int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '026_expense_bills'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatal("026_expense_bills was not recorded")
	}

	_, adminTok := insertSession(t, sqlDB, "Admin", 0)
	opdUser, opdTok := insertSession(t, sqlDB, "OPD", 0)
	exp := &Expenses{DB: sqlDB}

	fuel := postExpenseService(t, exp, adminTok, `{"code":"fuel","name":"Diesel","price_mmk":5000}`)
	open := postExpenseService(t, exp, adminTok, `{"code":"  ","name":"Generator fuel","price_mmk":null}`)
	if fuel.PriceMMK == nil || *fuel.PriceMMK != 5000 || open.PriceMMK != nil {
		t.Fatalf("catalog prices fuel=%v open=%v", fuel.PriceMMK, open.PriceMMK)
	}

	w := doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, `{"portal":"ot","name":"Wrong desk","lines":[{"ref_id":1,"qty":1,"unit_price_mmk":1}]}`)
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(exp, http.MethodGet, "/api/expenses/bills?portal=ot", opdTok, "")
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(exp, http.MethodGet, "/api/expenses/bills", opdTok, "")
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, `{"portal":"opd","name":"  ","lines":[{"ref_id":1,"qty":1,"unit_price_mmk":1}]}`)
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, fmt.Sprintf(`{"portal":"opd","name":"Empty","lines":[]}`))
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, fmt.Sprintf(
		`{"portal":"opd","name":"Bad price","lines":[{"ref_id":%d,"qty":1,"unit_price_mmk":1.5}]}`, open.ID,
	))
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(errorText(t, w), "integer") {
		t.Fatalf("price error %s", w.Body.String())
	}
	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, `{"portal":"opd","name":"Missing","lines":[{"ref_id":999999,"qty":1,"unit_price_mmk":100}]}`)
	mustCode(t, w, http.StatusBadRequest)

	body := fmt.Sprintf(`{
		"portal":"opd",
		"name":" Night generator ",
		"description":" tank 2 ",
		"discount_value":2500,
		"discount_unit":"mmk",
		"discount_mmk":1,
		"lines":[
			{"ref_id":%d,"qty":2,"unit_price_mmk":7500,"description":"client text","code":"NOPE"},
			{"ref_id":%d,"qty":1,"unit_price_mmk":1200,"description":"also ignore"}
		]
	}`, fuel.ID, open.ID)
	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, body)
	mustCode(t, w, http.StatusCreated)
	bill := decodeExpenseBill(t, w)
	if bill.BillNo != "EXP-000001" || bill.Portal != "opd" || bill.Name != "Night generator" || bill.Description != "tank 2" || bill.Status != "draft" {
		t.Fatalf("header %+v", bill)
	}
	if bill.TotalMMK != 16200 || bill.DiscountMMK != 2500 || bill.DiscountValue != 2500 || bill.DiscountUnit != "mmk" {
		t.Fatalf("money total=%d discount=%d value=%d unit=%s", bill.TotalMMK, bill.DiscountMMK, bill.DiscountValue, bill.DiscountUnit)
	}
	if len(bill.Lines) != 2 {
		t.Fatalf("lines %+v", bill.Lines)
	}
	if bill.Lines[0].Code != "FUEL" || bill.Lines[0].Description != "Diesel" || bill.Lines[0].Qty != 2 || bill.Lines[0].UnitPriceMMK != 7500 || bill.Lines[0].LineTotalMMK != 15000 {
		t.Fatalf("priced line %+v", bill.Lines[0])
	}
	if bill.Lines[1].Code != "" || bill.Lines[1].Description != "Generator fuel" || bill.Lines[1].UnitPriceMMK != 1200 || bill.Lines[1].LineTotalMMK != 1200 {
		t.Fatalf("null-catalog line %+v", bill.Lines[1])
	}
	assertServicePrice(t, sqlDB, fuel.ID, 5000)
	assertServicePrice(t, sqlDB, open.ID, -1)

	updatedBody := fmt.Sprintf(`{
		"name":"Night generator",
		"description":"tank 2",
		"discount_value":2500,
		"discount_unit":"MMK",
		"lines":[
			{"ref_id":%d,"qty":3,"unit_price_mmk":7500},
			{"ref_id":%d,"qty":1,"unit_price_mmk":1200}
		]
	}`, fuel.ID, open.ID)
	w = doJSON(exp, http.MethodPut, fmt.Sprintf("/api/expenses/bills/%d", bill.ID), opdTok, updatedBody)
	mustCode(t, w, http.StatusOK)
	bill = decodeExpenseBill(t, w)
	if len(bill.Lines) != 2 || bill.Lines[0].Qty != 3 || bill.Lines[0].UnitPriceMMK != 7500 || bill.TotalMMK != 23700 || bill.DiscountMMK != 2500 || bill.DiscountUnit != "mmk" {
		t.Fatalf("updated bill total=%d discount=%d unit=%s lines=%+v", bill.TotalMMK, bill.DiscountMMK, bill.DiscountUnit, bill.Lines)
	}

	w = doJSON(exp, http.MethodDelete, fmt.Sprintf("/api/expenses/services/%d", fuel.ID), adminTok, "")
	mustCode(t, w, http.StatusOK)
	w = doJSON(exp, http.MethodGet, fmt.Sprintf("/api/expenses/bills/%d", bill.ID), opdTok, "")
	mustCode(t, w, http.StatusOK)
	bill = decodeExpenseBill(t, w)
	if bill.Lines[0].Description != "Diesel" || bill.Lines[0].Code != "FUEL" || bill.Lines[0].UnitPriceMMK != 7500 {
		t.Fatalf("history rewritten %+v", bill.Lines[0])
	}
	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, fmt.Sprintf(
		`{"portal":"opd","name":"Again","lines":[{"ref_id":%d,"qty":1,"unit_price_mmk":100}]}`, fuel.ID,
	))
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(errorText(t, w), "inactive") {
		t.Fatalf("inactive error %s", w.Body.String())
	}

	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", adminTok, fmt.Sprintf(
		`{"portal":"ot","name":"OT only expense","lines":[{"ref_id":%d,"qty":1,"unit_price_mmk":400}]}`, open.ID,
	))
	mustCode(t, w, http.StatusCreated)
	otBill := decodeExpenseBill(t, w)
	if otBill.BillNo != "EXP-000002" || otBill.Portal != "ot" {
		t.Fatalf("ot bill %+v", otBill)
	}
	w = doJSON(exp, http.MethodGet, fmt.Sprintf("/api/expenses/bills/%d", otBill.ID), opdTok, "")
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(exp, http.MethodGet, "/api/expenses/bills?portal=opd&q=Night", opdTok, "")
	mustCode(t, w, http.StatusOK)
	listed := decodeExpenseBillList(t, w)
	if len(listed) != 1 || listed[0].ID != bill.ID {
		t.Fatalf("opd list %+v", listed)
	}
	w = doJSON(exp, http.MethodGet, "/api/expenses/bills?portal=opd&q=OT+only", opdTok, "")
	mustCode(t, w, http.StatusOK)
	if n := len(decodeExpenseBillList(t, w)); n != 0 {
		t.Fatalf("opd list included %d ot rows", n)
	}

	w = doJSON(exp, http.MethodPost, fmt.Sprintf("/api/expenses/bills/%d/printed", bill.ID), opdTok, "")
	mustCode(t, w, http.StatusOK)
	stamped := decodeExpenseBill(t, w)
	if stamped.PrintedAt == nil || *stamped.PrintedAt == "" {
		t.Fatal("printed_at was not set")
	}
	if _, err := sqlDB.Exec(`UPDATE expense_bills SET printed_at = '2000-01-01 00:00:00' WHERE id = ?`, bill.ID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(exp, http.MethodPost, fmt.Sprintf("/api/expenses/bills/%d/printed", bill.ID), opdTok, "")
	mustCode(t, w, http.StatusOK)
	again := decodeExpenseBill(t, w)
	if again.PrintedAt == nil || *again.PrintedAt != "2000-01-01 00:00:00" {
		t.Fatalf("printed_at rewritten: %+v", again.PrintedAt)
	}
	if n := expenseAuditCount(t, sqlDB, bill.ID, "print"); n != 1 {
		t.Fatalf("print audit count %d", n)
	}

	w = doJSON(exp, http.MethodGet, "/api/expenses/bills?portal=opd&status=paid&q=Night", opdTok, "")
	mustCode(t, w, http.StatusOK)
	if n := len(decodeExpenseBillList(t, w)); n != 0 {
		t.Fatalf("paid list before pay has %d", n)
	}

	w = doJSON(exp, http.MethodPost, fmt.Sprintf("/api/expenses/bills/%d/pay", bill.ID), opdTok, "")
	mustCode(t, w, http.StatusOK)
	paid := decodeExpenseBill(t, w)
	if paid.Status != "paid" || paid.PaidAt == nil || *paid.PaidAt == "" || paid.PaidByUserID == nil || *paid.PaidByUserID != opdUser {
		t.Fatalf("pay result %+v", paid)
	}
	if paid.TotalMMK != 23700 || paid.DiscountMMK != 2500 || paid.PrintedAt == nil || *paid.PrintedAt != "2000-01-01 00:00:00" {
		t.Fatalf("pay changed money or stamp %+v", paid)
	}
	w = doJSON(exp, http.MethodPost, fmt.Sprintf("/api/expenses/bills/%d/pay", bill.ID), opdTok, "")
	mustCode(t, w, http.StatusBadRequest)
	if errorText(t, w) != "only draft bills can be paid" {
		t.Fatalf("second pay %s", w.Body.String())
	}
	w = doJSON(exp, http.MethodPut, fmt.Sprintf("/api/expenses/bills/%d", bill.ID), opdTok, updatedBody)
	mustCode(t, w, http.StatusBadRequest)
	if errorText(t, w) != "only draft bills can be edited" {
		t.Fatalf("paid update %s", w.Body.String())
	}

	assertTableCount(t, sqlDB, "stock_movements", 0)
	assertTableCount(t, sqlDB, "ipd_ledger", 0)
	assertTableCount(t, sqlDB, "opd_bills", 0)
	assertTableCount(t, sqlDB, "ot_bills", 0)
	assertTableCount(t, sqlDB, "pharmacy_bills", 0)

	w = doJSON(exp, http.MethodGet, fmt.Sprintf("/api/expenses/bills/%d/print", bill.ID), opdTok, "")
	mustCode(t, w, http.StatusOK)
	html := w.Body.String()
	if !strings.Contains(html, "EXP-000001") || !strings.Contains(html, "Night generator") || !strings.Contains(html, "tank 2") {
		t.Fatalf("receipt missing bill identity: %s", html)
	}
	if strings.Contains(html, "Doctor") || strings.Contains(html, ">Patient</") || strings.Contains(html, "section-title\">Patient") {
		t.Fatalf("receipt has a patient or doctor block")
	}
	if !strings.Contains(html, ">Portal:</span><span class=\"val\">OPD</span>") {
		t.Fatalf("receipt missing portal label")
	}

	w = doJSON(exp, http.MethodPost, fmt.Sprintf("/api/expenses/bills/%d/void", otBill.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusBadRequest)
	if errorText(t, w) != "reason required" {
		t.Fatalf("void reason %s", w.Body.String())
	}
	w = doJSON(exp, http.MethodPost, fmt.Sprintf("/api/expenses/bills/%d/void", bill.ID), opdTok, `{"reason":" wrong desk "}`)
	mustCode(t, w, http.StatusOK)
	voided := decodeExpenseBill(t, w)
	if voided.Status != "void" || voided.VoidReason != "wrong desk" || voided.VoidedAt == nil || voided.PaidAt == nil {
		t.Fatalf("void %+v", voided)
	}
	w = doJSON(exp, http.MethodPost, fmt.Sprintf("/api/expenses/bills/%d/void", bill.ID), opdTok, `{"reason":"again"}`)
	mustCode(t, w, http.StatusBadRequest)
	if errorText(t, w) != "already void" {
		t.Fatalf("second void %s", w.Body.String())
	}

	assertTableCount(t, sqlDB, "stock_movements", 0)
	assertTableCount(t, sqlDB, "ipd_ledger", 0)
	assertTableCount(t, sqlDB, "opd_bills", 0)
	assertTableCount(t, sqlDB, "ot_bills", 0)
	assertTableCount(t, sqlDB, "pharmacy_bills", 0)

	for _, action := range []string{"create", "update", "print", "pay", "void"} {
		if n := expenseAuditCount(t, sqlDB, bill.ID, action); n != 1 {
			t.Fatalf("audit %s count %d", action, n)
		}
	}

	halfBody := fmt.Sprintf(`{
		"portal":"opd",
		"name":"Half up",
		"discount_value":10,
		"discount_unit":"percent",
		"discount_mmk":1,
		"lines":[{"ref_id":%d,"qty":1,"unit_price_mmk":1005}]
	}`, open.ID)
	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, halfBody)
	mustCode(t, w, http.StatusCreated)
	half := decodeExpenseBill(t, w)
	if half.TotalMMK != 1005 || half.DiscountMMK != 101 || half.DiscountUnit != "percent" {
		t.Fatalf("percent kyats total=%d off=%d unit=%s", half.TotalMMK, half.DiscountMMK, half.DiscountUnit)
	}

	for _, portal := range []string{"ipd", "pharmacy"} {
		w = doJSON(exp, http.MethodPost, "/api/expenses/bills", adminTok, fmt.Sprintf(
			`{"portal":%q,"name":"Supply","lines":[{"ref_id":%d,"qty":1,"unit_price_mmk":0}]}`, portal, open.ID,
		))
		mustCode(t, w, http.StatusCreated)
		created := decodeExpenseBill(t, w)
		if created.Portal != portal || created.Lines[0].UnitPriceMMK != 0 {
			t.Fatalf("portal %s bill %+v", portal, created)
		}
	}

	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, `{
		"portal":"opd",
		"name":"Custom fuel run",
		"description":"night shift",
		"lines":[
			{"description":"  Diesel jerry can  ","qty":2,"unit_price_mmk":7500},
			{"description":"Taxi to depot","qty":1,"unit_price_mmk":3000}
		]
	}`)
	mustCode(t, w, http.StatusCreated)
	free := decodeExpenseBill(t, w)
	if free.Name != "Custom fuel run" || free.Description != "night shift" || free.TotalMMK != 18000 {
		t.Fatalf("free-text header %+v", free)
	}
	if len(free.Lines) != 2 {
		t.Fatalf("free-text lines %+v", free.Lines)
	}
	if free.Lines[0].RefID != nil || free.Lines[0].Code != "" || free.Lines[0].Description != "Diesel jerry can" || free.Lines[0].Qty != 2 || free.Lines[0].UnitPriceMMK != 7500 || free.Lines[0].LineTotalMMK != 15000 {
		t.Fatalf("free-text line 0 %+v", free.Lines[0])
	}
	if free.Lines[1].RefID != nil || free.Lines[1].Description != "Taxi to depot" || free.Lines[1].LineTotalMMK != 3000 {
		t.Fatalf("free-text line 1 %+v", free.Lines[1])
	}
	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, `{
		"portal":"opd","name":"Blank particular","lines":[{"description":"  ","qty":1,"unit_price_mmk":100}]
	}`)
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(errorText(t, w), "description required") {
		t.Fatalf("blank particular %s", w.Body.String())
	}
	w = doJSON(exp, http.MethodGet, fmt.Sprintf("/api/expenses/bills/%d/print", free.ID), opdTok, "")
	mustCode(t, w, http.StatusOK)
	freeHTML := w.Body.String()
	if !strings.Contains(freeHTML, "Diesel jerry can") || !strings.Contains(freeHTML, "Taxi to depot") {
		t.Fatalf("free-text receipt missing particulars: %s", freeHTML)
	}
}

func postExpenseService(t *testing.T, exp *Expenses, token, body string) expenseService {
	t.Helper()
	w := doJSON(exp, http.MethodPost, "/api/expenses/services", token, body)
	mustCode(t, w, http.StatusCreated)
	var svc expenseService
	if err := json.Unmarshal(w.Body.Bytes(), &svc); err != nil {
		t.Fatal(err)
	}
	return svc
}

func decodeExpenseBill(t *testing.T, w *httptest.ResponseRecorder) expenseBill {
	t.Helper()
	var bill expenseBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatalf("bill json: %v body %s", err, w.Body.String())
	}
	return bill
}

func decodeExpenseBillList(t *testing.T, w *httptest.ResponseRecorder) []expenseBill {
	t.Helper()
	var body struct {
		Bills []expenseBill `json:"bills"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("list json: %v body %s", err, w.Body.String())
	}
	return body.Bills
}

func errorText(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("error json: %v body %s", err, w.Body.String())
	}
	return body["error"]
}

func assertServicePrice(t *testing.T, sqlDB *sql.DB, id int64, want int64) {
	t.Helper()
	var price sql.NullInt64
	if err := sqlDB.QueryRow(`SELECT price_mmk FROM expense_services WHERE id = ?`, id).Scan(&price); err != nil {
		t.Fatal(err)
	}
	if want < 0 {
		if price.Valid {
			t.Fatalf("service %d price %d, want NULL", id, price.Int64)
		}
		return
	}
	if !price.Valid || price.Int64 != want {
		t.Fatalf("service %d price %v, want %d", id, price, want)
	}
}

func expenseAuditCount(t *testing.T, sqlDB *sql.DB, billID int64, action string) int {
	t.Helper()
	var n int
	err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM audit_logs
		WHERE entity = 'expense_bill' AND entity_id = ? AND action = ?
	`, billID, action).Scan(&n)
	if err != nil {
		t.Fatal(err)
	}
	return n
}
