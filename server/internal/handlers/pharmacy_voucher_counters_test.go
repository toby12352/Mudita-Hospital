package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func TestPharmacySeparateVoucherCounters(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Pharmacy", 0)
	h := &Pharmacy{DB: sqlDB}
	itemID := insertItem(t, sqlDB, "VCNT", "Counter med", 100, 50)

	create := func(kind, name string) string {
		t.Helper()
		body := fmt.Sprintf(`{
			"patient_name": %q,
			"kind": %q,
			"lines": [{"item_id": %d, "tablet_qty": 1}]
		}`, name, kind, itemID)
		if kind == "transfer" {
			body = fmt.Sprintf(`{
				"kind": "transfer",
				"lines": [{"item_id": %d, "tablet_qty": 1}]
			}`, itemID)
		}
		w := doJSON(h, http.MethodPost, "/api/pharmacy/bills", token, body)
		mustCode(t, w, http.StatusCreated)
		var bill struct {
			BillNo string `json:"bill_no"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
			t.Fatal(err)
		}
		return bill.BillNo
	}

	if got := create("sale", "Sale One"); got != "PH-000001" {
		t.Fatalf("first sale %q, want PH-000001", got)
	}
	if got := create("sale", "Sale Two"); got != "PH-000002" {
		t.Fatalf("second sale %q, want PH-000002", got)
	}
	if got := create("return", "Return One"); got != "RT-000001" {
		t.Fatalf("return %q, want RT-000001", got)
	}
	if got := create("transfer", ""); got != "TO-000001" {
		t.Fatalf("transfer %q, want TO-000001", got)
	}
}
