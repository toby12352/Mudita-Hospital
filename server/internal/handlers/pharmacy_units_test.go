package handlers

import "testing"

func TestResolveItemPackTwoUnitBottleTablet(t *testing.T) {
	l1, l2, l3 := int64(1), int64(150), int64(1)
	p, err := resolveItemPack(&l1, &l2, &l3, "Bottle", "Tablet", "Tablet")
	if err != "" {
		t.Fatalf("unexpected error: %s", err)
	}
	if p.L1Unit != "Bottle" || p.L2Unit != "Tablet" || p.L3Unit != "Tablet" {
		t.Fatalf("units = %+v", p)
	}
	if tabletsPerBox(p) != 150 {
		t.Fatalf("tabletsPerBox = %d, want 150", tabletsPerBox(p))
	}
}

func TestResolveItemPackThreeUnitBoxCardTablet(t *testing.T) {
	l1, l2, l3 := int64(1), int64(10), int64(10)
	p, err := resolveItemPack(&l1, &l2, &l3, "Box", "Card", "Tablet")
	if err != "" {
		t.Fatalf("unexpected error: %s", err)
	}
	if tabletsPerBox(p) != 100 {
		t.Fatalf("tabletsPerBox = %d, want 100", tabletsPerBox(p))
	}
}

func TestSaleUnitFactor(t *testing.T) {
	bottle := itemPack{L1Qty: 1, L1Unit: "Bottle", L2Qty: 150, L2Unit: "Tablet", L3Qty: 1, L3Unit: "Tablet"}
	if f, name, ok := saleUnitFactor(bottle, "bottle"); !ok || f != 150 || name != "Bottle" {
		t.Fatalf("bottle factor = %d %q %v", f, name, ok)
	}
	if f, name, ok := saleUnitFactor(bottle, "Tablet"); !ok || f != 1 || name != "Tablet" {
		t.Fatalf("tablet factor = %d %q %v", f, name, ok)
	}
	if _, _, ok := saleUnitFactor(bottle, "Box"); ok {
		t.Fatal("box is not a level of a bottle/tablet pack")
	}

	box := itemPack{L1Qty: 1, L1Unit: "Box", L2Qty: 10, L2Unit: "Card", L3Qty: 10, L3Unit: "Tablet"}
	if f, _, ok := saleUnitFactor(box, "Box"); !ok || f != 100 {
		t.Fatalf("box factor = %d ok=%v", f, ok)
	}
	if f, _, ok := saleUnitFactor(box, "Card"); !ok || f != 10 {
		t.Fatalf("card factor = %d ok=%v", f, ok)
	}
	if f, _, ok := saleUnitFactor(box, "Tablet"); !ok || f != 1 {
		t.Fatalf("tablet factor = %d ok=%v", f, ok)
	}

	tube := itemPack{L1Qty: 1, L1Unit: "Tube", L2Qty: 1, L2Unit: "Tube", L3Qty: 1, L3Unit: "Tube"}
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
}

func TestResolveItemPackTubeOnly(t *testing.T) {
	l1, l2, l3 := int64(1), int64(1), int64(1)
	p, err := resolveItemPack(&l1, &l2, &l3, "Tube", "Tube", "Tube")
	if err != "" {
		t.Fatalf("unexpected error: %s", err)
	}
	if tabletsPerBox(p) != 1 {
		t.Fatalf("tabletsPerBox = %d, want 1", tabletsPerBox(p))
	}
}

func TestResolveItemPackUnknownUnit(t *testing.T) {
	l1, l2, l3 := int64(1), int64(10), int64(10)
	_, err := resolveItemPack(&l1, &l2, &l3, "Pallet", "Strip", "Tablet")
	if err == "" {
		t.Fatal("expected error for unknown pack_l1_unit")
	}
}
