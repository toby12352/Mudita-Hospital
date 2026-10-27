package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func TestExpenseServiceCatalog(t *testing.T) {
	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, "Admin", 0)
	_, opdTok := insertSession(t, sqlDB, "OPD", 0)
	exp := &Expenses{DB: sqlDB}

	w := doJSON(exp, http.MethodPost, "/api/expenses/services", adminTok, `{"code":"  ","name":"Generator fuel","price_mmk":null}`)
	mustCode(t, w, http.StatusCreated)
	var created expenseService
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Name != "Generator fuel" || created.Code != "" || created.PriceMMK != nil || !created.Active {
		t.Fatalf("blank code and null price %+v", created)
	}

	w = doJSON(exp, http.MethodPost, "/api/expenses/services", adminTok, `{"code":"fuel","name":"Diesel","price_mmk":15000}`)
	mustCode(t, w, http.StatusCreated)
	var priced expenseService
	if err := json.Unmarshal(w.Body.Bytes(), &priced); err != nil {
		t.Fatal(err)
	}
	if priced.Code != "FUEL" || priced.PriceMMK == nil || *priced.PriceMMK != 15000 {
		t.Fatalf("priced create %+v", priced)
	}

	w = doJSON(exp, http.MethodPost, "/api/expenses/services", adminTok, `{"code":"FUEL","name":"Duplicate"}`)
	mustCode(t, w, http.StatusConflict)
	w = doJSON(exp, http.MethodPost, "/api/expenses/services", adminTok, `{"name":"Bad","price_mmk":-1}`)
	mustCode(t, w, http.StatusBadRequest)

	w = doJSON(exp, http.MethodPut, fmt.Sprintf("/api/expenses/services/%d", priced.ID), adminTok, `{"code":"fuel","name":"Diesel","price_mmk":null}`)
	mustCode(t, w, http.StatusOK)
	var cleared expenseService
	if err := json.Unmarshal(w.Body.Bytes(), &cleared); err != nil {
		t.Fatal(err)
	}
	if cleared.PriceMMK != nil || cleared.Code != "FUEL" {
		t.Fatalf("price not cleared %+v", cleared)
	}

	w = doJSON(exp, http.MethodDelete, fmt.Sprintf("/api/expenses/services/%d", created.ID), adminTok, "")
	mustCode(t, w, http.StatusOK)

	w = doJSON(exp, http.MethodGet, "/api/expenses/catalog/services?q=Generator", adminTok, "")
	mustCode(t, w, http.StatusOK)
	var catalog struct {
		Services []expenseCatalogService `json:"services"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &catalog); err != nil {
		t.Fatal(err)
	}
	if len(catalog.Services) != 0 {
		t.Fatalf("deactivated row still in catalog %+v", catalog.Services)
	}

	w = doJSON(exp, http.MethodGet, "/api/expenses/services?q=Generator", adminTok, "")
	mustCode(t, w, http.StatusOK)
	var listed struct {
		Services []expenseService `json:"services"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Services) != 0 {
		t.Fatalf("deactivated row still in default list %+v", listed.Services)
	}

	w = doJSON(exp, http.MethodGet, "/api/expenses/services?all=1&q=Generator", adminTok, "")
	mustCode(t, w, http.StatusOK)
	if err := json.Unmarshal(w.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Services) != 1 || listed.Services[0].Active {
		t.Fatalf("inactive row missing from admin list %+v", listed.Services)
	}

	w = doJSON(exp, http.MethodGet, "/api/expenses/catalog/services?q=Diesel", opdTok, "")
	mustCode(t, w, http.StatusOK)
	if err := json.Unmarshal(w.Body.Bytes(), &catalog); err != nil {
		t.Fatal(err)
	}
	if len(catalog.Services) != 1 || catalog.Services[0].Name != "Diesel" || catalog.Services[0].PriceMMK != nil {
		t.Fatalf("opd catalog %+v", catalog.Services)
	}
	w = doJSON(exp, http.MethodPost, "/api/expenses/services", opdTok, `{"name":"Not allowed"}`)
	mustCode(t, w, http.StatusForbidden)

	assertTableCount(t, sqlDB, "ot_services", 0)
	assertTableCount(t, sqlDB, "services", 0)
	assertTableCount(t, sqlDB, "opd_bills", 0)
	assertTableCount(t, sqlDB, "ot_bills", 0)
	assertTableCount(t, sqlDB, "pharmacy_bills", 0)
	assertTableCount(t, sqlDB, "expense_services", 2)
}

func TestExpenseServiceHardDeleteKeepsBillLines(t *testing.T) {
	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, "Admin", 0)
	_, opdTok := insertSession(t, sqlDB, "OPD", 0)
	exp := &Expenses{DB: sqlDB}

	w := doJSON(exp, http.MethodPost, "/api/expenses/services", adminTok, `{"code":"tea","name":"Ward tea","price_mmk":1500}`)
	mustCode(t, w, http.StatusCreated)
	var svc expenseService
	if err := json.Unmarshal(w.Body.Bytes(), &svc); err != nil {
		t.Fatal(err)
	}

	w = doJSON(exp, http.MethodPost, "/api/expenses/bills", opdTok, fmt.Sprintf(
		`{"portal":"opd","name":"Break room","lines":[{"ref_id":%d,"qty":2,"unit_price_mmk":1500}]}`, svc.ID,
	))
	mustCode(t, w, http.StatusCreated)
	var bill expenseBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if len(bill.Lines) != 1 || bill.Lines[0].Description != "Ward tea" || bill.Lines[0].Code != "TEA" {
		t.Fatalf("bill line %+v", bill.Lines)
	}

	w = doJSON(exp, http.MethodPost, fmt.Sprintf("/api/expenses/services/%d/delete", svc.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusOK)

	w = doJSON(exp, http.MethodGet, fmt.Sprintf("/api/expenses/services/%d", svc.ID), adminTok, "")
	mustCode(t, w, http.StatusNotFound)
	w = doJSON(exp, http.MethodPost, fmt.Sprintf("/api/expenses/services/%d/delete", svc.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusNotFound)

	w = doJSON(exp, http.MethodGet, fmt.Sprintf("/api/expenses/bills/%d", bill.ID), opdTok, "")
	mustCode(t, w, http.StatusOK)
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if len(bill.Lines) != 1 || bill.Lines[0].Description != "Ward tea" || bill.Lines[0].Code != "TEA" || bill.Lines[0].UnitPriceMMK != 1500 {
		t.Fatalf("stored line after catalog delete %+v", bill.Lines)
	}
	assertTableCount(t, sqlDB, "expense_services", 0)
}

func assertTableCount(t *testing.T, sqlDB *sql.DB, table string, want int) {
	t.Helper()
	var n int
	if err := sqlDB.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&n); err != nil {
		t.Fatalf("%s: %v", table, err)
	}
	if n != want {
		t.Fatalf("%s has %d rows, want %d", table, n, want)
	}
}
