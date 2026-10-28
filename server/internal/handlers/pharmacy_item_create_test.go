package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestCreatePharmacyItemDuplicateCode(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	h := &Pharmacy{DB: sqlDB}

	body := `{
		"code":"PARA",
		"name":"Paracetamol",
		"pack_l1_qty":1,
		"pack_l1_unit":"Box",
		"pack_l2_qty":10,
		"pack_l2_unit":"Strip",
		"pack_l3_qty":10,
		"pack_l3_unit":"Tablet",
		"buy_price_mmk":1000,
		"sell_price_mmk":100
	}`
	w := doJSON(h, http.MethodPost, "/api/pharmacy/items", token, body)
	mustCode(t, w, http.StatusCreated)

	w = doJSON(h, http.MethodPost, "/api/pharmacy/items", token, `{
		"code":"para",
		"name":"Duplicate",
		"pack_l1_qty":1,
		"pack_l1_unit":"Box",
		"pack_l2_qty":10,
		"pack_l2_unit":"Strip",
		"pack_l3_qty":10,
		"pack_l3_unit":"Tablet",
		"buy_price_mmk":500,
		"sell_price_mmk":50
	}`)
	mustCode(t, w, http.StatusConflict)
	var errBody map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &errBody); err != nil {
		t.Fatal(err)
	}
	if errBody["error"] != "code already exists" {
		t.Fatalf("error %q, want code already exists", errBody["error"])
	}

	var n int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM items WHERE code = 'PARA'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("items with PARA = %d, want 1", n)
	}
}
