package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestServiceCodeOptional(t *testing.T) {
	sqlDB := openTestDB(t)
	_, opdTok := insertSession(t, sqlDB, "OPD", 0)
	services := &Services{DB: sqlDB}
	opd := &OPD{DB: sqlDB}

	w := doJSON(services, http.MethodPost, "/api/services", opdTok, `{"name":"Uncoded A","price_mmk":1000}`)
	mustCode(t, w, http.StatusCreated)
	a := decodeService(t, w)
	if a.Code != "" || a.Name != "Uncoded A" || a.PriceMMK != 1000 {
		t.Fatalf("first blank code: %+v", a)
	}

	w = doJSON(services, http.MethodPost, "/api/services", opdTok, `{"name":"Uncoded B","price_mmk":2000}`)
	mustCode(t, w, http.StatusCreated)
	b := decodeService(t, w)
	if b.Code != "" || b.ID == a.ID {
		t.Fatalf("second blank code: %+v", b)
	}

	var nullCount int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM services WHERE code IS NULL`).Scan(&nullCount); err != nil {
		t.Fatal(err)
	}
	if nullCount < 2 {
		t.Fatalf("expected at least 2 NULL codes, got %d", nullCount)
	}

	w = doJSON(services, http.MethodPost, "/api/services", opdTok, `{"code":"DRS","name":"Dressing","price_mmk":3000}`)
	mustCode(t, w, http.StatusCreated)
	w = doJSON(services, http.MethodPost, "/api/services", opdTok, `{"code":"drs","name":"Dup","price_mmk":1}`)
	if w.Code != http.StatusConflict {
		t.Fatalf("duplicate code: got %d %s", w.Code, w.Body.String())
	}

	w = doJSON(services, http.MethodPost, "/api/services", opdTok, `{"code":"","name":""}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("blank name: got %d %s", w.Code, w.Body.String())
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", opdTok, fmt.Sprintf(`{
		"patient_name":"Walk In",
		"lines":[{"line_type":"service","ref_id":%d,"qty":1}]
	}`, a.ID))
	mustCode(t, w, http.StatusCreated)
	bill := decodeOpdBill(t, w)
	if len(bill.Lines) != 1 {
		t.Fatalf("lines: %+v", bill.Lines)
	}
	line := bill.Lines[0]
	if line.Code != "" || line.Description != "Uncoded A" || line.UnitPriceMMK != 1000 {
		t.Fatalf("no-code bill line: %+v", line)
	}
	if bill.TotalMMK != 1000 {
		t.Fatalf("total %d", bill.TotalMMK)
	}
}

func decodeService(t *testing.T, w *httptest.ResponseRecorder) service {
	t.Helper()
	var svc service
	if err := json.Unmarshal(w.Body.Bytes(), &svc); err != nil {
		t.Fatalf("service json: %v body=%s", err, w.Body.String())
	}
	return svc
}
