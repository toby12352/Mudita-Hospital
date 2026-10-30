package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
	"time"
)

func TestPharmacyPurchaseBillPayUpdatesBuyPriceAndExpense(t *testing.T) {
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
		"buy_price_mmk":10000,
		"sell_price_mmk":20
	}`
	w := doJSON(h, http.MethodPost, "/api/pharmacy/items", token, body)
	mustCode(t, w, http.StatusCreated)
	var item pharmacyItem
	if err := json.Unmarshal(w.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if item.SellPriceMMK != 20 {
		t.Fatalf("sell before = %d", item.SellPriceMMK)
	}

	createBody := `{
		"supplier_name":"ABC Pharma",
		"description":"Weekly order",
		"lines":[{"item_id":` + itoa(item.ID) + `,"qty":10,"unit":"Tablet","line_total_mmk":1500}]
	}`
	w = doJSON(h, http.MethodPost, "/api/pharmacy/purchase-bills", token, createBody)
	mustCode(t, w, http.StatusCreated)
	var bill pharmacyPurchaseBill
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if bill.BillNo == "" || bill.Status != "draft" || bill.TotalMMK != 1500 {
		t.Fatalf("draft bill = %+v", bill)
	}
	if len(bill.Lines) != 1 || bill.Lines[0].StockQty != 10 {
		t.Fatalf("draft lines = %+v", bill.Lines)
	}

	w = doJSON(h, http.MethodPost, "/api/pharmacy/purchase-bills/"+itoa(bill.ID)+"/pay", token, "{}")
	mustCode(t, w, http.StatusOK)
	if err := json.Unmarshal(w.Body.Bytes(), &bill); err != nil {
		t.Fatal(err)
	}
	if bill.Status != "paid" {
		t.Fatalf("status = %s", bill.Status)
	}

	var mainQty, buy, sell int64
	if err := sqlDB.QueryRow(`
		SELECT COALESCE((SELECT SUM(qty) FROM item_batches WHERE item_id = ? AND location_code = 'MAIN'), 0),
		       buy_price_mmk, sell_price_mmk
		FROM items WHERE id = ?
	`, item.ID, item.ID).Scan(&mainQty, &buy, &sell); err != nil {
		t.Fatal(err)
	}
	if mainQty != 10 {
		t.Fatalf("MAIN qty = %d, want 10", mainQty)
	}
	// 10 tablets for 1500 → unit 150; Box factor 100 → outer buy 15000.
	if buy != 15000 {
		t.Fatalf("buy_price_mmk = %d, want 15000", buy)
	}
	if sell != 20 {
		t.Fatalf("sell_price_mmk changed to %d", sell)
	}

	var moveType string
	var delta int64
	if err := sqlDB.QueryRow(`
		SELECT movement_type, qty_delta FROM stock_movements
		WHERE item_id = ? ORDER BY id DESC LIMIT 1
	`, item.ID).Scan(&moveType, &delta); err != nil {
		t.Fatal(err)
	}
	if moveType != "PURCHASE" || delta != 10 {
		t.Fatalf("movement = %s %d", moveType, delta)
	}

	today := time.Now().In(yangon).Format("2006-01-02")
	lines, _, err := buildExpenseCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, line := range lines {
		if line.BillNo == bill.BillNo {
			found = true
			if line.AmountMMK != -1500 {
				t.Fatalf("expense amount = %d, want -1500", line.AmountMMK)
			}
			if line.Name != "ABC Pharma" || line.Portal != "pharmacy" {
				t.Fatalf("expense line = %+v", line)
			}
		}
	}
	if !found {
		t.Fatalf("purchase bill missing from expense lines: %+v", lines)
	}

	w = doJSON(h, http.MethodPost, "/api/pharmacy/purchase-bills/"+itoa(bill.ID)+"/void", token, `{"reason":"wrong order"}`)
	mustCode(t, w, http.StatusOK)

	if err := sqlDB.QueryRow(`
		SELECT COALESCE((SELECT SUM(qty) FROM item_batches WHERE item_id = ? AND location_code = 'MAIN'), 0),
		       buy_price_mmk, sell_price_mmk
		FROM items WHERE id = ?
	`, item.ID, item.ID).Scan(&mainQty, &buy, &sell); err != nil {
		t.Fatal(err)
	}
	if mainQty != 0 {
		t.Fatalf("MAIN qty after void = %d", mainQty)
	}
	if buy != 15000 || sell != 20 {
		t.Fatalf("prices after void buy=%d sell=%d", buy, sell)
	}

	lines, _, err = buildExpenseCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	var payAmt, voidAmt int64
	for _, line := range lines {
		if line.BillNo != bill.BillNo {
			continue
		}
		if line.Reversal {
			voidAmt = line.AmountMMK
		} else {
			payAmt = line.AmountMMK
		}
	}
	if payAmt != -1500 || voidAmt != 1500 {
		t.Fatalf("void expense legs pay=%d void=%d", payAmt, voidAmt)
	}
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}
