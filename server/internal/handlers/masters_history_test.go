package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestDoctorHistoryOPDCanReadPharmacyDenied(t *testing.T) {
	sqlDB := openTestDB(t)
	_, opdTok := insertSession(t, sqlDB, "OPD", 0)
	_, pharmTok := insertSession(t, sqlDB, "Pharmacy", 0)
	h := &Doctors{DB: sqlDB}

	w := doJSON(h, http.MethodPost, "/api/doctors", opdTok, `{
		"name":"Dr History",
		"specialty":"General",
		"consultation_mmk":5000,
		"ot_mmk":10000
	}`)
	mustCode(t, w, http.StatusCreated)

	w = doJSON(h, http.MethodGet, "/api/doctors/history", opdTok, "")
	mustCode(t, w, http.StatusOK)
	var res struct {
		History []struct {
			Action string `json:"action"`
			Name   string `json:"name"`
		} `json:"history"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(res.History) == 0 {
		t.Fatal("expected at least one history row")
	}
	found := false
	for _, row := range res.History {
		if row.Action == "create" && row.Name == "Dr History" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("create for Dr History missing: %+v", res.History)
	}

	w = doJSON(h, http.MethodGet, "/api/doctors/history", pharmTok, "")
	if w.Code == http.StatusOK {
		t.Fatalf("pharmacy must not read doctor history, got %d", w.Code)
	}
}

func TestServiceHistoryOPDCanReadPharmacyDenied(t *testing.T) {
	sqlDB := openTestDB(t)
	_, opdTok := insertSession(t, sqlDB, "OPD", 0)
	_, pharmTok := insertSession(t, sqlDB, "Pharmacy", 0)
	h := &Services{DB: sqlDB}

	w := doJSON(h, http.MethodPost, "/api/services", opdTok, `{
		"code":"DRS",
		"name":"Dressing",
		"price_mmk":2000
	}`)
	mustCode(t, w, http.StatusCreated)

	w = doJSON(h, http.MethodGet, "/api/services/history", opdTok, "")
	mustCode(t, w, http.StatusOK)
	var res struct {
		History []struct {
			Action string `json:"action"`
			Code   string `json:"code"`
			Name   string `json:"name"`
		} `json:"history"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(res.History) == 0 {
		t.Fatal("expected at least one history row")
	}
	found := false
	for _, row := range res.History {
		if row.Action == "create" && row.Code == "DRS" && row.Name == "Dressing" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("create for DRS missing: %+v", res.History)
	}

	w = doJSON(h, http.MethodGet, "/api/services/history", pharmTok, "")
	if w.Code == http.StatusOK {
		t.Fatalf("pharmacy must not read service history, got %d", w.Code)
	}
}
