package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestCreatePharmacyItemPadsL4ThroughL6(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	h := &Pharmacy{DB: sqlDB}

	body := `{
		"code":"PAD3",
		"name":"Three level",
		"pack_l1_qty":1,
		"pack_l1_unit":"Box",
		"pack_l2_qty":10,
		"pack_l2_unit":"Card",
		"pack_l3_qty":10,
		"pack_l3_unit":"Tablet",
		"buy_price_mmk":1000,
		"sell_price_mmk":10
	}`
	w := doJSON(h, http.MethodPost, "/api/pharmacy/items", token, body)
	mustCode(t, w, http.StatusCreated)
	var item pharmacyItem
	if err := json.Unmarshal(w.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if item.PackL4Unit != "Tablet" || item.PackL5Unit != "Tablet" || item.PackL6Unit != "Tablet" {
		t.Fatalf("pad units = %s/%s/%s", item.PackL4Unit, item.PackL5Unit, item.PackL6Unit)
	}
	if item.PackL4Qty != 1 || item.UnitsPerPurchase != 100 {
		t.Fatalf("pad qty / upp = %d / %d", item.PackL4Qty, item.UnitsPerPurchase)
	}
	if packVisibleDepth(itemPackFromPharmacyItem(item)) != 3 {
		t.Fatalf("visible depth = %d", packVisibleDepth(itemPackFromPharmacyItem(item)))
	}
}

func TestCreatePharmacyItemSixLevels(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	h := &Pharmacy{DB: sqlDB}

	body := `{
		"code":"DEEP",
		"name":"Deep pack",
		"pack_l1_qty":1,
		"pack_l1_unit":"Carton",
		"pack_l2_qty":2,
		"pack_l2_unit":"Box",
		"pack_l3_qty":3,
		"pack_l3_unit":"Card",
		"pack_l4_qty":4,
		"pack_l4_unit":"Strip",
		"pack_l5_qty":5,
		"pack_l5_unit":"Tablet",
		"pack_l6_qty":6,
		"pack_l6_unit":"Puff",
		"buy_price_mmk":10000,
		"sell_price_mmk":5
	}`
	w := doJSON(h, http.MethodPost, "/api/pharmacy/items", token, body)
	mustCode(t, w, http.StatusCreated)
	var item pharmacyItem
	if err := json.Unmarshal(w.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	wantUpp := int64(2 * 3 * 4 * 5 * 6)
	if item.UnitsPerPurchase != wantUpp || item.StockUnit != "Puff" {
		t.Fatalf("upp=%d stock=%s", item.UnitsPerPurchase, item.StockUnit)
	}
	if packVisibleDepth(itemPackFromPharmacyItem(item)) != 6 {
		t.Fatalf("depth=%d", packVisibleDepth(itemPackFromPharmacyItem(item)))
	}
}

func TestPharmacyPackDepthMigrationColumns(t *testing.T) {
	sqlDB := openTestDB(t)
	for _, col := range []string{"pack_l4_qty", "pack_l4_unit", "pack_l5_qty", "pack_l5_unit", "pack_l6_qty", "pack_l6_unit"} {
		var n int
		if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM pragma_table_info('items') WHERE name = ?`, col).Scan(&n); err != nil || n != 1 {
			t.Fatalf("items.%s missing: %v n=%d", col, err, n)
		}
	}
	for _, col := range []string{"qty_l4", "qty_l5", "qty_l6"} {
		var n int
		if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM pragma_table_info('pharmacy_bill_lines') WHERE name = ?`, col).Scan(&n); err != nil || n != 1 {
			t.Fatalf("pharmacy_bill_lines.%s missing: %v n=%d", col, err, n)
		}
	}

	res, err := sqlDB.Exec(`
		INSERT INTO items (
			code, name, category, buy_price_mmk, sell_price_mmk,
			pack_l1_qty, pack_l1_unit, pack_l2_qty, pack_l2_unit, pack_l3_qty, pack_l3_unit,
			units_per_purchase, purchase_unit, stock_unit, billing_unit
		) VALUES (
			'UPG3', 'Upgrade three', 'Tablet', 1000, 10,
			1, 'Box', 10, 'Card', 10, 'Tablet',
			100, 'Box', 'Tablet', 'Tablet'
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	itemID, _ := res.LastInsertId()
	item, err := loadPharmacyItem(sqlDB, itemID, false)
	if err != nil {
		t.Fatal(err)
	}
	if item.PackL3Qty != 10 || item.PackL3Unit != "Tablet" || item.UnitsPerPurchase != 100 {
		t.Fatalf("preserved pack = %+v upp=%d", item, item.UnitsPerPurchase)
	}
	if item.PackL4Unit != "Tablet" || item.PackL4Qty != 1 {
		t.Fatalf("expected pad from L3, got L4 %d %s", item.PackL4Qty, item.PackL4Unit)
	}

	bres, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bills (bill_no, patient_name, status, total_mmk)
		VALUES ('PH-UPG', 'Test', 'draft', 1000)
	`)
	if err != nil {
		t.Fatal(err)
	}
	billID, _ := bres.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bill_lines (
			bill_id, item_id, code, description, box_qty, strip_qty, tablet_qty,
			billing_qty, billing_unit, stock_qty, stock_unit, unit_price_mmk, line_total_mmk, sort_order
		) VALUES (?, ?, 'UPG3', 'Upgrade three', 1, 0, 0, 100, 'Tablet', 100, 'Tablet', 10, 1000, 0)
	`, billID, itemID); err != nil {
		t.Fatal(err)
	}
	var boxQty, stripQty, tabletQty, qtyL4, lineTotal int64
	if err := sqlDB.QueryRow(`
		SELECT box_qty, strip_qty, tablet_qty, qty_l4, line_total_mmk
		FROM pharmacy_bill_lines WHERE bill_id = ?
	`, billID).Scan(&boxQty, &stripQty, &tabletQty, &qtyL4, &lineTotal); err != nil {
		t.Fatal(err)
	}
	if boxQty != 1 || stripQty != 0 || tabletQty != 0 || qtyL4 != 0 || lineTotal != 1000 {
		t.Fatalf("bill line changed: box=%d strip=%d tab=%d l4=%d total=%d", boxQty, stripQty, tabletQty, qtyL4, lineTotal)
	}
}

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
