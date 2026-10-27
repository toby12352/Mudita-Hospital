package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func TestOtServiceCRUDAndCatalogIsolation(t *testing.T) {
	sqlDB := openTestDB(t)
	_, otTok := insertSession(t, sqlDB, "OT", 0)
	_, opdTok := insertSession(t, sqlDB, "OPD", 0)
	_, pharmTok := insertSession(t, sqlDB, "Pharmacy", 0)
	ot := &OT{DB: sqlDB}
	opd := &OPD{DB: sqlDB}
	svc := &Services{DB: sqlDB}

	w := doJSON(ot, http.MethodPost, "/api/ot/services", otTok, `{"name":"Major Surgery"}`)
	mustCode(t, w, http.StatusCreated)
	var created otService
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Name != "Major Surgery" || created.Code != "" || created.PriceMMK != nil {
		t.Fatalf("name-only create %+v", created)
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/services", otTok, `{"code":"OTMAJ","name":"Major priced","price_mmk":500000}`)
	mustCode(t, w, http.StatusCreated)
	var priced otService
	if err := json.Unmarshal(w.Body.Bytes(), &priced); err != nil {
		t.Fatal(err)
	}
	if priced.Code != "OTMAJ" || priced.PriceMMK == nil || *priced.PriceMMK != 500000 {
		t.Fatalf("priced create %+v", priced)
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/services", otTok, `{"name":""}`)
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(ot, http.MethodPost, "/api/ot/services", otTok, `{"name":"Bad","price_mmk":-1}`)
	mustCode(t, w, http.StatusBadRequest)

	w = doJSON(ot, http.MethodPut, fmt.Sprintf("/api/ot/services/%d", created.ID), otTok, `{"name":"Major Surgery revised","price_mmk":1000}`)
	mustCode(t, w, http.StatusOK)
	var updated otService
	if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Name != "Major Surgery revised" || updated.PriceMMK == nil || *updated.PriceMMK != 1000 {
		t.Fatalf("update %+v", updated)
	}

	w = doJSON(ot, http.MethodGet, "/api/ot/services?q=Major", otTok, "")
	mustCode(t, w, http.StatusOK)
	var listed struct {
		Services []otService `json:"services"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Services) < 2 {
		t.Fatalf("search %+v", listed.Services)
	}

	w = doJSON(svc, http.MethodPost, "/api/services", opdTok, `{"code":"DRESS","name":"Dressing","price_mmk":3000}`)
	mustCode(t, w, http.StatusCreated)
	var opdSvc service
	if err := json.Unmarshal(w.Body.Bytes(), &opdSvc); err != nil {
		t.Fatal(err)
	}

	w = doJSON(ot, http.MethodGet, "/api/ot/catalog/services", otTok, "")
	mustCode(t, w, http.StatusOK)
	var otCat struct {
		Services []otCatalogService `json:"services"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &otCat); err != nil {
		t.Fatal(err)
	}
	for _, s := range otCat.Services {
		if s.ID == opdSvc.ID && s.Name == "Dressing" {
			t.Fatal("OT catalog leaked an OPD service")
		}
	}

	w = doJSON(opd, http.MethodGet, "/api/opd/catalog/services", opdTok, "")
	mustCode(t, w, http.StatusOK)
	var opdCat struct {
		Services []catalogService `json:"services"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &opdCat); err != nil {
		t.Fatal(err)
	}
	for _, s := range opdCat.Services {
		if s.Name == "Major Surgery revised" || s.Code == "OTMAJ" {
			t.Fatal("OPD catalog leaked an OT service")
		}
	}

	w = doJSON(ot, http.MethodDelete, fmt.Sprintf("/api/ot/services/%d", created.ID), otTok, "")
	mustCode(t, w, http.StatusOK)
	w = doJSON(ot, http.MethodGet, fmt.Sprintf("/api/ot/catalog/services?q=revised"), otTok, "")
	mustCode(t, w, http.StatusOK)
	if err := json.Unmarshal(w.Body.Bytes(), &otCat); err != nil {
		t.Fatal(err)
	}
	if len(otCat.Services) != 0 {
		t.Fatalf("deactivated service still in catalog %+v", otCat.Services)
	}

	w = doJSON(ot, http.MethodGet, "/api/ot/services/history", pharmTok, "")
	if w.Code == http.StatusOK {
		t.Fatal("pharmacy must not read OT service history")
	}
	w = doJSON(ot, http.MethodGet, "/api/ot/services/history", otTok, "")
	mustCode(t, w, http.StatusOK)
}

func TestOtBillUsesOtServiceCasePrice(t *testing.T) {
	sqlDB := openTestDB(t)
	_, otTok := insertSession(t, sqlDB, "OT", 0)
	_, opdTok := insertSession(t, sqlDB, "OPD", 0)
	ot := &OT{DB: sqlDB}
	svc := &Services{DB: sqlDB}

	w := doJSON(ot, http.MethodPost, "/api/ot/services", otTok, `{"name":"Major Surgery"}`)
	mustCode(t, w, http.StatusCreated)
	var otSvc otService
	if err := json.Unmarshal(w.Body.Bytes(), &otSvc); err != nil {
		t.Fatal(err)
	}
	w = doJSON(svc, http.MethodPost, "/api/services", opdTok, `{"code":"DRESS","name":"Dressing","price_mmk":3000}`)
	mustCode(t, w, http.StatusCreated)
	var opdSvc service
	if err := json.Unmarshal(w.Body.Bytes(), &opdSvc); err != nil {
		t.Fatal(err)
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, `{"patient_name":"Daw A","items":[]}`)
	mustCode(t, w, http.StatusCreated)
	var c otCase
	if err := json.Unmarshal(w.Body.Bytes(), &c); err != nil {
		t.Fatal(err)
	}

	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", c.ID), otTok, fmt.Sprintf(`{
		"services":[{"line_type":"service","ref_id":%d,"qty":4}]
	}`, otSvc.ID))
	mustCode(t, w, http.StatusBadRequest)

	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", c.ID), otTok, fmt.Sprintf(`{
		"services":[{"line_type":"service","ref_id":%d,"qty":4,"unit_price_mmk":500000}]
	}`, otSvc.ID))
	mustCode(t, w, http.StatusCreated)
	var bill otBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if bill.TotalMMK != 500000 {
		t.Fatalf("total %d", bill.TotalMMK)
	}
	if len(bill.Lines) != 1 || bill.Lines[0].Qty != 1 || bill.Lines[0].UnitPriceMMK != 500000 {
		t.Fatalf("lines %+v", bill.Lines)
	}

	var catalogPrice sql.NullInt64
	if err := sqlDB.QueryRow(`SELECT price_mmk FROM ot_services WHERE id = ?`, otSvc.ID).Scan(&catalogPrice); err != nil {
		t.Fatal(err)
	}
	if catalogPrice.Valid {
		t.Fatalf("catalog price changed to %v", catalogPrice.Int64)
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, `{"patient_name":"Daw B","items":[]}`)
	mustCode(t, w, http.StatusCreated)
	var c2 otCase
	if err := json.Unmarshal(w.Body.Bytes(), &c2); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", c2.ID), otTok, fmt.Sprintf(`{
		"services":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":850000}]
	}`, otSvc.ID))
	mustCode(t, w, http.StatusCreated)
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if bill.TotalMMK != 850000 {
		t.Fatalf("case B total %d", bill.TotalMMK)
	}

	if _, err := sqlDB.Exec(`
		INSERT INTO services (id, code, name, price_mmk) VALUES (9001, 'OPDX', 'OPD only', 1)
	`); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, `{"patient_name":"Daw C","items":[]}`)
	mustCode(t, w, http.StatusCreated)
	var c3 otCase
	if err := json.Unmarshal(w.Body.Bytes(), &c3); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", c3.ID), otTok, `{
		"services":[{"line_type":"service","ref_id":9001,"qty":1,"unit_price_mmk":1000}]
	}`)
	mustCode(t, w, http.StatusBadRequest)
	_ = opdSvc
}

func TestOtCatalogItemsRequireOtOnHand(t *testing.T) {
	sqlDB := openTestDB(t)
	_, otTok := insertSession(t, sqlDB, "OT", 0)
	ot := &OT{DB: sqlDB}

	mainOnly := insertItem(t, sqlDB, "MAINONLY", "Pharmacy only", 100, 200)
	insertBatch(t, sqlDB, mainOnly, "A", localToday(), 10)
	otItem := insertItem(t, sqlDB, "OTHAVE", "OT stock", 100, 200)
	insertOtBatch(t, sqlDB, otItem, "B", localToday(), 3)

	w := doJSON(ot, http.MethodGet, "/api/ot/catalog/items?q=ONLY", otTok, "")
	mustCode(t, w, http.StatusOK)
	var res struct {
		Items []otCatalogItem `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if len(res.Items) != 0 {
		t.Fatalf("MAIN-only item suggested %+v", res.Items)
	}

	w = doJSON(ot, http.MethodGet, "/api/ot/catalog/items?code=OTHAVE", otTok, "")
	mustCode(t, w, http.StatusOK)
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if len(res.Items) != 1 || res.Items[0].OtOnHand != 3 {
		t.Fatalf("OT item %+v", res.Items)
	}
}

func TestOtDraftCaseServicesRoundTrip(t *testing.T) {
	sqlDB := openTestDB(t)
	_, otTok := insertSession(t, sqlDB, "OT", 0)
	ot := &OT{DB: sqlDB}

	itemID := insertItem(t, sqlDB, "SUT", "Suture", 50, 100)
	insertOtBatch(t, sqlDB, itemID, "B1", localToday(), 20)

	w := doJSON(ot, http.MethodPost, "/api/ot/services", otTok, `{"code":"OTMAJ","name":"Major Surgery","price_mmk":500000}`)
	mustCode(t, w, http.StatusCreated)
	var priced otService
	if err := json.Unmarshal(w.Body.Bytes(), &priced); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ot, http.MethodPost, "/api/ot/services", otTok, `{"name":"Case priced only"}`)
	mustCode(t, w, http.StatusCreated)
	var blank otService
	if err := json.Unmarshal(w.Body.Bytes(), &blank); err != nil {
		t.Fatal(err)
	}

	body := fmt.Sprintf(`{
		"patient_name":"Daw Draft",
		"items":[{"item_id":%d,"qty_issued":2}],
		"services":[
			{"ref_id":%d,"unit_price_mmk":850000},
			{"ref_id":%d,"unit_price_mmk":null}
		]
	}`, itemID, priced.ID, blank.ID)
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, body)
	mustCode(t, w, http.StatusCreated)
	var created otCase
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if len(created.Items) != 1 || created.Items[0].ItemID != itemID || created.Items[0].QtyIssued != 2 {
		t.Fatalf("items %+v", created.Items)
	}
	if len(created.Services) != 2 {
		t.Fatalf("services %+v", created.Services)
	}
	if created.Services[0].RefID != priced.ID || created.Services[0].UnitPriceMMK == nil || *created.Services[0].UnitPriceMMK != 850000 {
		t.Fatalf("custom priced service %+v", created.Services[0])
	}
	if created.Services[1].RefID != blank.ID || created.Services[1].UnitPriceMMK != nil {
		t.Fatalf("null priced service %+v", created.Services[1])
	}

	w = doJSON(ot, http.MethodGet, fmt.Sprintf("/api/ot/cases/%d", created.ID), otTok, "")
	mustCode(t, w, http.StatusOK)
	var loaded otCase
	if err := json.Unmarshal(w.Body.Bytes(), &loaded); err != nil {
		t.Fatal(err)
	}
	if len(loaded.Items) != 1 || loaded.Items[0].QtyIssued != 2 {
		t.Fatalf("GET items %+v", loaded.Items)
	}
	if len(loaded.Services) != 2 {
		t.Fatalf("GET services %+v", loaded.Services)
	}
	if loaded.Services[0].UnitPriceMMK == nil || *loaded.Services[0].UnitPriceMMK != 850000 {
		t.Fatalf("GET custom price %+v", loaded.Services[0])
	}
	if loaded.Services[1].UnitPriceMMK != nil {
		t.Fatalf("GET null price %+v", loaded.Services[1])
	}

	updateBody := fmt.Sprintf(`{
		"patient_name":"Daw Draft",
		"items":[{"item_id":%d,"qty_issued":2}],
		"services":[
			{"ref_id":%d,"unit_price_mmk":900000},
			{"ref_id":%d,"unit_price_mmk":null}
		]
	}`, itemID, priced.ID, blank.ID)
	w = doJSON(ot, http.MethodPut, fmt.Sprintf("/api/ot/cases/%d", created.ID), otTok, updateBody)
	mustCode(t, w, http.StatusOK)
	var updated otCase
	if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if len(updated.Services) != 2 || updated.Services[0].UnitPriceMMK == nil || *updated.Services[0].UnitPriceMMK != 900000 {
		t.Fatalf("PUT services %+v", updated.Services)
	}

	var catalogPrice sql.NullInt64
	if err := sqlDB.QueryRow(`SELECT price_mmk FROM ot_services WHERE id = ?`, priced.ID).Scan(&catalogPrice); err != nil {
		t.Fatal(err)
	}
	if !catalogPrice.Valid || catalogPrice.Int64 != 500000 {
		t.Fatalf("catalog price changed to %v", catalogPrice.Int64)
	}
}

func TestOtServiceDeleteWhileDraftCaseListsIt(t *testing.T) {
	sqlDB := openTestDB(t)
	var applied int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '027_ot_service_delete'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatal("027_ot_service_delete was not recorded")
	}

	_, otTok := insertSession(t, sqlDB, "OT", 0)
	ot := &OT{DB: sqlDB}

	w := doJSON(ot, http.MethodPost, "/api/ot/services", otTok, `{"code":"OTFEE","name":"Theatre fee","price_mmk":100000}`)
	mustCode(t, w, http.StatusCreated)
	var svc otService
	if err := json.Unmarshal(w.Body.Bytes(), &svc); err != nil {
		t.Fatal(err)
	}

	body := fmt.Sprintf(`{
		"patient_name":"Daw Keep",
		"items":[],
		"services":[{"ref_id":%d,"unit_price_mmk":120000}]
	}`, svc.ID)
	w = doJSON(ot, http.MethodPost, "/api/ot/cases", otTok, body)
	mustCode(t, w, http.StatusCreated)
	var created otCase
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if len(created.Services) != 1 || created.Services[0].Description != "Theatre fee" || created.Services[0].Code != "OTFEE" {
		t.Fatalf("case services %+v", created.Services)
	}

	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/services/%d/delete", svc.ID), otTok, `{}`)
	mustCode(t, w, http.StatusOK)

	w = doJSON(ot, http.MethodGet, fmt.Sprintf("/api/ot/services/%d", svc.ID), otTok, "")
	mustCode(t, w, http.StatusNotFound)

	w = doJSON(ot, http.MethodGet, fmt.Sprintf("/api/ot/cases/%d", created.ID), otTok, "")
	mustCode(t, w, http.StatusOK)
	var loaded otCase
	if err := json.Unmarshal(w.Body.Bytes(), &loaded); err != nil {
		t.Fatal(err)
	}
	if len(loaded.Services) != 1 || loaded.Services[0].Description != "Theatre fee" || loaded.Services[0].Code != "OTFEE" {
		t.Fatalf("case line after catalog delete %+v", loaded.Services)
	}

	updateBody := fmt.Sprintf(`{
		"patient_name":"Daw Keep",
		"items":[],
		"services":[{"ref_id":%d,"code":"OTFEE","description":"Theatre fee","unit_price_mmk":125000}]
	}`, svc.ID)
	w = doJSON(ot, http.MethodPut, fmt.Sprintf("/api/ot/cases/%d", created.ID), otTok, updateBody)
	mustCode(t, w, http.StatusOK)
	var updated otCase
	if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if len(updated.Services) != 1 || updated.Services[0].Description != "Theatre fee" || updated.Services[0].Code != "OTFEE" {
		t.Fatalf("save after catalog delete %+v", updated.Services)
	}
	if updated.Services[0].UnitPriceMMK == nil || *updated.Services[0].UnitPriceMMK != 125000 {
		t.Fatalf("price after catalog delete %+v", updated.Services[0])
	}
}
