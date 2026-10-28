package handlers

import (
	"strings"
	"testing"
)

func TestRoundPayableMMK(t *testing.T) {
	cases := []struct {
		in, want int64
	}{
		{0, 0},
		{1, 50},
		{24, 50},
		{25, 50},
		{49, 50},
		{50, 50},
		{167, 150},
		{175, 200},
		{4000, 4000},
		{4008, 4000},
		{4025, 4050},
	}
	for _, c := range cases {
		if got := roundPayableMMK(c.in); got != c.want {
			t.Fatalf("roundPayableMMK(%d) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestPharmacyPackLineChargeBox24Bottles(t *testing.T) {
	// Catalog sell 167/bottle (from typing box sale 4000 with 24 bottles).
	p := padPackTail(itemPack{L1Qty: 1, L1Unit: "Box", L2Qty: 24, L2Unit: "Bottle", L3Qty: 1, L3Unit: "Bottle"})
	sell := int64(167)
	if got := pharmacyPackLineChargeMMK(packSaleQtys{Box: 1}, sell, p); got != 4000 {
		t.Fatalf("1 box charge = %d, want 4000", got)
	}
	if got := pharmacyPackLineChargeMMK(packSaleQtys{Strip: 1}, sell, p); got != 150 {
		t.Fatalf("1 bottle (strip slot) charge = %d, want 150", got)
	}
	if got := pharmacyPackLineChargeMMK(packSaleQtys{Tablet: 1}, sell, p); got != 150 {
		t.Fatalf("1 bottle (tablet slot) charge = %d, want 150", got)
	}
	if got := pharmacyPackLineChargeMMK(packSaleQtys{Strip: 24}, sell, p); got != 3600 {
		t.Fatalf("24 loose bottles = %d, want 3600", got)
	}
}

func TestResolveItemPackTwoUnitBottleTablet(t *testing.T) {
	l1, l2, l3 := int64(1), int64(150), int64(1)
	p, err := resolveItemPack(&l1, &l2, &l3, nil, nil, nil, "Bottle", "Tablet", "Tablet", "", "", "")
	if err != "" {
		t.Fatalf("unexpected error: %s", err)
	}
	if p.L1Unit != "Bottle" || p.L2Unit != "Tablet" || p.L3Unit != "Tablet" {
		t.Fatalf("units = %+v", p)
	}
	if p.L4Unit != "Tablet" || p.L5Unit != "Tablet" || p.L6Unit != "Tablet" {
		t.Fatalf("pad units = %+v", p)
	}
	got, msg := tabletsPerBox(p)
	if msg != "" || got != 150 {
		t.Fatalf("tabletsPerBox = %d %q, want 150", got, msg)
	}
}

func TestResolveItemPackThreeUnitBoxCardTablet(t *testing.T) {
	l1, l2, l3 := int64(1), int64(10), int64(10)
	p, err := resolveItemPack(&l1, &l2, &l3, nil, nil, nil, "Box", "Card", "Tablet", "", "", "")
	if err != "" {
		t.Fatalf("unexpected error: %s", err)
	}
	got, msg := tabletsPerBox(p)
	if msg != "" || got != 100 {
		t.Fatalf("tabletsPerBox = %d %q, want 100", got, msg)
	}
	if packVisibleDepth(p) != 3 {
		t.Fatalf("depth = %d, want 3", packVisibleDepth(p))
	}
}

func TestRestockStockQty(t *testing.T) {
	item := pharmacyItem{
		PackL1Qty: 1, PackL1Unit: "Box",
		PackL2Qty: 10, PackL2Unit: "Card",
		PackL3Qty: 10, PackL3Unit: "Tablet",
		UnitsPerPurchase: 100,
	}
	if q, u, err := restockStockQty(item, 2, ""); err != "" || q != 200 || u != "purchase" {
		t.Fatalf("purchase default = %d %q %q", q, u, err)
	}
	if q, u, err := restockStockQty(item, 2, "purchase"); err != "" || q != 200 || u != "purchase" {
		t.Fatalf("purchase = %d %q %q", q, u, err)
	}
	if q, u, err := restockStockQty(item, 5, "stock"); err != "" || q != 5 || u != "stock" {
		t.Fatalf("stock = %d %q %q", q, u, err)
	}
	if q, u, err := restockStockQty(item, 3, "Card"); err != "" || q != 30 || u != "Card" {
		t.Fatalf("card = %d %q %q", q, u, err)
	}
	if q, u, err := restockStockQty(item, 2, "Box"); err != "" || q != 200 || u != "Box" {
		t.Fatalf("box = %d %q %q", q, u, err)
	}
	if q, u, err := restockStockQty(item, 7, "Tablet"); err != "" || q != 7 || u != "Tablet" {
		t.Fatalf("tablet = %d %q %q", q, u, err)
	}
	if _, _, err := restockStockQty(item, 1, "Bottle"); err != "unknown unit" {
		t.Fatalf("unknown unit err = %q", err)
	}
	if _, _, err := restockStockQty(item, 0, "Card"); err == "" {
		t.Fatal("expected qty must be > 0")
	}
}

func TestSaleUnitFactor(t *testing.T) {
	bottle := padPackTail(itemPack{L1Qty: 1, L1Unit: "Bottle", L2Qty: 150, L2Unit: "Tablet", L3Qty: 1, L3Unit: "Tablet"})
	if f, name, ok := saleUnitFactor(bottle, "bottle"); !ok || f != 150 || name != "Bottle" {
		t.Fatalf("bottle factor = %d %q %v", f, name, ok)
	}
	if f, name, ok := saleUnitFactor(bottle, "Tablet"); !ok || f != 1 || name != "Tablet" {
		t.Fatalf("tablet factor = %d %q %v", f, name, ok)
	}
	if _, _, ok := saleUnitFactor(bottle, "Box"); ok {
		t.Fatal("box is not a level of a bottle/tablet pack")
	}

	box := padPackTail(itemPack{L1Qty: 1, L1Unit: "Box", L2Qty: 10, L2Unit: "Card", L3Qty: 10, L3Unit: "Tablet"})
	if f, _, ok := saleUnitFactor(box, "Box"); !ok || f != 100 {
		t.Fatalf("box factor = %d ok=%v", f, ok)
	}
	if f, _, ok := saleUnitFactor(box, "Card"); !ok || f != 10 {
		t.Fatalf("card factor = %d ok=%v", f, ok)
	}
	if f, _, ok := saleUnitFactor(box, "Tablet"); !ok || f != 1 {
		t.Fatalf("tablet factor = %d ok=%v", f, ok)
	}

	tube := padPackTail(itemPack{L1Qty: 1, L1Unit: "Tube", L2Qty: 1, L2Unit: "Tube", L3Qty: 1, L3Unit: "Tube"})
	if f, name, ok := saleUnitFactor(tube, "Tube"); !ok || f != 1 || name != "Tube" {
		t.Fatalf("tube factor = %d %q %v", f, name, ok)
	}
}

func TestPharmacyReceiptQty(t *testing.T) {
	one := pharmacyBillLine{
		BoxQty: 2, BillingQty: 200, UnitPriceMMK: 100, LineTotalMMK: 20000,
		PackL1Unit: "Box", BillingUnit: "Tablet",
	}
	qty, unit, price := pharmacyReceiptQty(one)
	if qty != 2 || unit != "Box" || price != 10000 {
		t.Fatalf("one unit = %d %q %d", qty, unit, price)
	}

	mixed := pharmacyBillLine{
		BoxQty: 1, StripQty: 2, BillingQty: 30, UnitPriceMMK: 10, LineTotalMMK: 300,
		PackL1Unit: "Box", PackL2Unit: "Card",
	}
	qty, unit, price = pharmacyReceiptQty(mixed)
	if qty != 30 || unit != "" || price != 10 {
		t.Fatalf("mixed = %d %q %d", qty, unit, price)
	}

	l4 := pharmacyBillLine{
		QtyL4: 3, BillingQty: 30, UnitPriceMMK: 10, LineTotalMMK: 900,
		PackL4Unit: "Strip",
	}
	qty, unit, price = pharmacyReceiptQty(l4)
	if qty != 3 || unit != "Strip" || price != 300 {
		t.Fatalf("l4 = %d %q %d", qty, unit, price)
	}
}

func TestResolveItemPackTubeOnly(t *testing.T) {
	l1, l2, l3 := int64(1), int64(1), int64(1)
	p, err := resolveItemPack(&l1, &l2, &l3, nil, nil, nil, "Tube", "Tube", "Tube", "", "", "")
	if err != "" {
		t.Fatalf("unexpected error: %s", err)
	}
	got, msg := tabletsPerBox(p)
	if msg != "" || got != 1 {
		t.Fatalf("tabletsPerBox = %d %q, want 1", got, msg)
	}
}

func TestResolveItemPackSachetAndPack(t *testing.T) {
	l1, l2, l3 := int64(1), int64(10), int64(1)
	p, err := resolveItemPack(&l1, &l2, &l3, nil, nil, nil, "Pack", "Sachet", "Sachet", "", "", "")
	if err != "" {
		t.Fatalf("unexpected error: %s", err)
	}
	if p.L1Unit != "Pack" || p.L2Unit != "Sachet" || p.L3Unit != "Sachet" {
		t.Fatalf("units = %+v", p)
	}
	got, msg := tabletsPerBox(p)
	if msg != "" || got != 10 {
		t.Fatalf("tabletsPerBox = %d %q, want 10", got, msg)
	}
}

func TestResolveItemPackUnknownUnit(t *testing.T) {
	l1, l2, l3 := int64(1), int64(10), int64(10)
	_, err := resolveItemPack(&l1, &l2, &l3, nil, nil, nil, "Pallet", "Strip", "Tablet", "", "", "")
	if err == "" {
		t.Fatal("expected error for unknown pack_l1_unit")
	}
}

func TestResolveItemPackPuffAndPairs(t *testing.T) {
	l1, l2, l3 := int64(1), int64(2), int64(1)
	p, err := resolveItemPack(&l1, &l2, &l3, nil, nil, nil, "Box", "Pairs", "Pairs", "", "", "")
	if err != "" {
		t.Fatalf("pairs: %s", err)
	}
	got, _ := tabletsPerBox(p)
	if got != 2 {
		t.Fatalf("pairs factor = %d", got)
	}

	l1, l2, l3 = 1, 200, 1
	p, err = resolveItemPack(&l1, &l2, &l3, nil, nil, nil, "Tube", "Puff", "Puff", "", "", "")
	if err != "" {
		t.Fatalf("puff: %s", err)
	}
	got, _ = tabletsPerBox(p)
	if got != 200 {
		t.Fatalf("puff factor = %d", got)
	}
}

func TestResolveItemPackSixLevels(t *testing.T) {
	q := []int64{1, 2, 3, 4, 5, 6}
	p, err := resolveItemPack(
		&q[0], &q[1], &q[2], &q[3], &q[4], &q[5],
		"Carton", "Box", "Card", "Strip", "Tablet", "Puff",
	)
	if err != "" {
		t.Fatalf("unexpected error: %s", err)
	}
	if packVisibleDepth(p) != 6 {
		t.Fatalf("depth = %d, want 6", packVisibleDepth(p))
	}
	got, msg := tabletsPerBox(p)
	if msg != "" || got != 2*3*4*5*6 {
		t.Fatalf("tabletsPerBox = %d %q, want %d", got, msg, 2*3*4*5*6)
	}
	levels := visiblePackLevels(p)
	if levels[3].Unit != "Strip" || levels[3].Factor != 5*6 {
		t.Fatalf("strip level = %+v", levels[3])
	}
	sale := packSaleQtys{L4: 2}
	total, msg := totalTabletsFromPackQtys(sale, p)
	if msg != "" || total != 2*5*6 {
		t.Fatalf("qty_l4 total = %d %q, want %d", total, msg, 2*5*6)
	}
	charge := pharmacyPackLineChargeMMK(sale, 10, p)
	wantCharge := int64(2) * roundPayableMMK(10*5*6)
	if charge != wantCharge {
		t.Fatalf("charge = %d, want %d", charge, wantCharge)
	}
}

func TestResolveItemPackDuplicateVisibleUnit(t *testing.T) {
	l1, l2, l3 := int64(1), int64(10), int64(10)
	_, err := resolveItemPack(&l1, &l2, &l3, nil, nil, nil, "Box", "Box", "Tablet", "", "", "")
	if err == "" {
		t.Fatal("expected duplicate unit error")
	}
}

func TestNormalizeRejectsDeepItemWithoutPackDepth(t *testing.T) {
	sqlDB := openTestDB(t)
	q := []int64{1, 2, 2, 2, 2, 2}
	pack, errMsg := resolveItemPack(
		&q[0], &q[1], &q[2], &q[3], &q[4], &q[5],
		"Carton", "Box", "Card", "Strip", "Tablet", "Puff",
	)
	if errMsg != "" {
		t.Fatal(errMsg)
	}
	units := packToItemUnits(pack)
	res, err := sqlDB.Exec(`
		INSERT INTO items (
			code, name, category, buy_price_mmk, sell_price_mmk,
			pack_l1_qty, pack_l1_unit, pack_l2_qty, pack_l2_unit, pack_l3_qty, pack_l3_unit,
			pack_l4_qty, pack_l4_unit, pack_l5_qty, pack_l5_unit, pack_l6_qty, pack_l6_unit,
			units_per_purchase, purchase_unit, stock_unit, billing_unit
		) VALUES (
			'DEEP6', 'Deep pack', 'Other', 1000, 10,
			?,?,?,?,?,?, ?,?,?,?,?,?,
			?,?,?,?
		)
	`, pack.L1Qty, pack.L1Unit, pack.L2Qty, pack.L2Unit, pack.L3Qty, pack.L3Unit,
		pack.L4Qty, pack.L4Unit, pack.L5Qty, pack.L5Unit, pack.L6Qty, pack.L6Unit,
		units.UnitsPerPurchase, units.PurchaseUnit, units.StockUnit, units.BillingUnit)
	if err != nil {
		t.Fatal(err)
	}
	itemID, _ := res.LastInsertId()

	_, _, msg := normalizePharmacyBillLines(sqlDB, []pharmacyBillLine{
		{ItemID: itemID, BoxQty: 1},
	})
	if msg == "" || !strings.Contains(msg, "update the clinic app") {
		t.Fatalf("expected old-client rejection, got %q", msg)
	}

	_, total, msg := normalizePharmacyBillLines(sqlDB, []pharmacyBillLine{
		{ItemID: itemID, BoxQty: 1, PackDepth: maxPackDepth},
	})
	if msg != "" {
		t.Fatalf("new client: %s", msg)
	}
	if total <= 0 {
		t.Fatalf("total = %d", total)
	}

	// Three-level item still accepts a line without pack_depth.
	res, err = sqlDB.Exec(`
		INSERT INTO items (
			code, name, category, buy_price_mmk, sell_price_mmk,
			pack_l1_qty, pack_l1_unit, pack_l2_qty, pack_l2_unit, pack_l3_qty, pack_l3_unit,
			pack_l4_qty, pack_l4_unit, pack_l5_qty, pack_l5_unit, pack_l6_qty, pack_l6_unit,
			units_per_purchase, purchase_unit, stock_unit, billing_unit
		) VALUES (
			'SHALLOW', 'Shallow', 'Tablet', 1000, 10,
			1, 'Box', 10, 'Card', 10, 'Tablet',
			1, 'Tablet', 1, 'Tablet', 1, 'Tablet',
			100, 'Box', 'Tablet', 'Tablet'
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	shallowID, _ := res.LastInsertId()
	_, _, msg = normalizePharmacyBillLines(sqlDB, []pharmacyBillLine{
		{ItemID: shallowID, BoxQty: 1},
	})
	if msg != "" {
		t.Fatalf("shallow without pack_depth: %s", msg)
	}
}
