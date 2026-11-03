package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestOtCaseRejectsInventoryAndServicesTogether(t *testing.T) {
	sqlDB := openTestDB(t)
	_, tok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ot := &OT{DB: sqlDB}

	itemID := insertItem(t, sqlDB, "OTMIX1", "Mix item", 10, 500)
	_ = insertOtBatch(t, sqlDB, itemID, "MX1", "2031-01-01", 10)

	w := doJSON(ot, http.MethodPost, "/api/ot/services", tok, `{"code":"OTMIXS","name":"Mix svc","price_mmk":2000}`)
	mustCode(t, w, http.StatusCreated)
	var svc otService
	if err := json.Unmarshal(w.Body.Bytes(), &svc); err != nil {
		t.Fatal(err)
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/cases", tok, fmt.Sprintf(`{
		"patient_name":"Mixed Case",
		"items":[{"item_id":%d,"qty_issued":1}],
		"services":[{"ref_id":%d,"unit_price_mmk":2000}]
	}`, itemID, svc.ID))
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(w.Body.String(), "cannot be on the same bill") {
		t.Fatalf("error body %s", w.Body.String())
	}
}

func TestOtBillPrintInventoryThermalServiceA4(t *testing.T) {
	sqlDB := openTestDB(t)
	_, tok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ot := &OT{DB: sqlDB}

	itemID := insertItem(t, sqlDB, "OTPRT1", "Print item", 10, 800)
	_ = insertOtBatch(t, sqlDB, itemID, "PR1", "2031-01-01", 10)

	w := doJSON(ot, http.MethodPost, "/api/ot/cases", tok, fmt.Sprintf(`{
		"patient_name":"Print Items",
		"items":[{"item_id":%d,"qty_issued":1}]
	}`, itemID))
	mustCode(t, w, http.StatusCreated)
	itemCase := decodeOtCase(t, w)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", itemCase.ID), tok, `{"services":[]}`)
	mustCode(t, w, http.StatusCreated)
	itemBill := decodeOtBill(t, w)

	w = doJSON(ot, http.MethodGet, fmt.Sprintf("/api/ot/bills/%d/print", itemBill.ID), tok, "")
	mustCode(t, w, http.StatusOK)
	itemHTML := w.Body.String()
	if !strings.Contains(itemHTML, "@page{size:80mm") {
		t.Fatalf("inventory bill must be thermal:\n%s", itemHTML)
	}
	if !strings.Contains(itemHTML, "OT RECEIPT") {
		t.Fatalf("inventory title missing:\n%s", itemHTML)
	}
	if strings.Contains(itemHTML, "@page{size:A4") {
		t.Fatal("inventory bill must not use A4 CSS")
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/services", tok, `{"code":"OTPRTS","name":"Print svc","price_mmk":3000}`)
	mustCode(t, w, http.StatusCreated)
	var svc otService
	if err := json.Unmarshal(w.Body.Bytes(), &svc); err != nil {
		t.Fatal(err)
	}

	w = doJSON(ot, http.MethodPost, "/api/ot/cases", tok, fmt.Sprintf(`{
		"patient_name":"Print Services",
		"services":[{"ref_id":%d,"unit_price_mmk":3000}]
	}`, svc.ID))
	mustCode(t, w, http.StatusCreated)
	svcCase := decodeOtCase(t, w)
	w = doJSON(ot, http.MethodPost, fmt.Sprintf("/api/ot/cases/%d/bill", svcCase.ID), tok, fmt.Sprintf(`{
		"services":[{"line_type":"service","ref_id":%d,"unit_price_mmk":3000}]
	}`, svc.ID))
	mustCode(t, w, http.StatusCreated)
	svcBill := decodeOtBill(t, w)

	w = doJSON(ot, http.MethodGet, fmt.Sprintf("/api/ot/bills/%d/print", svcBill.ID), tok, "")
	mustCode(t, w, http.StatusOK)
	svcHTML := w.Body.String()
	if !strings.Contains(svcHTML, "@page{size:A4") {
		t.Fatalf("service bill must be A4:\n%s", svcHTML)
	}
	if !strings.Contains(svcHTML, "OPERATION THEATRE PAYMENT RECEIPT") {
		t.Fatalf("service title missing:\n%s", svcHTML)
	}
	if strings.Contains(svcHTML, "@page{size:80mm") {
		t.Fatal("service bill must not use thermal CSS")
	}
}
