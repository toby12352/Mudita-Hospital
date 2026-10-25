package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestServiceCategoryCRUDAndServiceLink(t *testing.T) {
	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, "Admin", 0)
	_, opdTok := insertSession(t, sqlDB, "OPD", 0)
	_, pharmTok := insertSession(t, sqlDB, "Pharmacy", 0)
	cats := &ServiceCategories{DB: sqlDB}
	services := &Services{DB: sqlDB}

	w := doJSON(cats, http.MethodGet, "/api/service-categories", pharmTok, "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("pharmacy list: got %d", w.Code)
	}

	w = doJSON(cats, http.MethodPost, "/api/service-categories", opdTok, `{"name":"Dressing"}`)
	if w.Code != http.StatusForbidden {
		t.Fatalf("opd create category: got %d", w.Code)
	}

	w = doJSON(cats, http.MethodPost, "/api/service-categories", adminTok, `{"name":" Dressing "}`)
	mustCode(t, w, http.StatusCreated)
	var created struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode category: %v", err)
	}
	if created.Name != "Dressing" || created.ID == 0 {
		t.Fatalf("category: %+v", created)
	}

	w = doJSON(cats, http.MethodPost, "/api/service-categories", adminTok, `{"name":"dressing"}`)
	if w.Code != http.StatusConflict {
		t.Fatalf("duplicate name: got %d %s", w.Code, w.Body.String())
	}

	w = doJSON(cats, http.MethodGet, "/api/service-categories", opdTok, "")
	mustCode(t, w, http.StatusOK)

	w = doJSON(services, http.MethodPost, "/api/services", opdTok, `{
		"code":"DRS",
		"name":"Wound dressing",
		"price_mmk":2000,
		"category_id":`+jsonNumber(created.ID)+`
	}`)
	mustCode(t, w, http.StatusCreated)
	var svc struct {
		ID           int64  `json:"id"`
		CategoryID   *int64 `json:"category_id"`
		CategoryName string `json:"category_name"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &svc); err != nil {
		t.Fatalf("decode service: %v", err)
	}
	if svc.CategoryID == nil || *svc.CategoryID != created.ID || svc.CategoryName != "Dressing" {
		t.Fatalf("linked service: %+v", svc)
	}

	w = doJSON(services, http.MethodPut, "/api/services/"+jsonNumber(svc.ID), opdTok, `{
		"code":"DRS",
		"name":"Wound dressing",
		"price_mmk":2500,
		"active":true
	}`)
	mustCode(t, w, http.StatusOK)
	if err := json.Unmarshal(w.Body.Bytes(), &svc); err != nil {
		t.Fatalf("decode kept category: %v", err)
	}
	if svc.CategoryID == nil || *svc.CategoryID != created.ID {
		t.Fatalf("omitted category_id cleared the link: %+v", svc)
	}

	w = doJSON(services, http.MethodPut, "/api/services/"+jsonNumber(svc.ID), opdTok, `{
		"code":"DRS",
		"name":"Wound dressing",
		"price_mmk":2500,
		"active":true,
		"category_id":null
	}`)
	mustCode(t, w, http.StatusOK)
	if err := json.Unmarshal(w.Body.Bytes(), &svc); err != nil {
		t.Fatalf("decode cleared category: %v", err)
	}
	if svc.CategoryID != nil || svc.CategoryName != "" {
		t.Fatalf("null category_id should clear: %+v", svc)
	}

	w = doJSON(services, http.MethodPut, "/api/services/"+jsonNumber(svc.ID), opdTok, `{
		"code":"DRS",
		"name":"Wound dressing",
		"price_mmk":2500,
		"active":true,
		"category_id":`+jsonNumber(created.ID)+`
	}`)
	mustCode(t, w, http.StatusOK)

	w = doJSON(cats, http.MethodDelete, "/api/service-categories/"+jsonNumber(created.ID), adminTok, "")
	if w.Code != http.StatusConflict {
		t.Fatalf("delete in use: got %d %s", w.Code, w.Body.String())
	}

	w = doJSON(services, http.MethodPost, "/api/services", opdTok, `{
		"code":"X",
		"name":"Bad",
		"category_id":99999
	}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("unknown category: got %d", w.Code)
	}

	w = doJSON(cats, http.MethodPost, "/api/service-categories", adminTok, `{"name":"Lab"}`)
	mustCode(t, w, http.StatusCreated)
	var lab struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &lab); err != nil {
		t.Fatalf("decode lab: %v", err)
	}
	w = doJSON(cats, http.MethodDelete, "/api/service-categories/"+jsonNumber(lab.ID), adminTok, "")
	mustCode(t, w, http.StatusOK)
}

func jsonNumber(id int64) string {
	b, _ := json.Marshal(id)
	return string(b)
}
