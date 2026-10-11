package handlers

import (
	"math"
	"strings"
)

var allowedUnits = map[string]bool{
	"Box": true, "Carton": true, "Bottle": true, "Vial": true, "Ampoule": true,
	"Piece": true, "Tablet": true, "Capsule": true, "Tube": true, "Cylinder": true,
	"Bag": true, "Each": true, "mL": true, "g": true, "oz": true,
	"Strip": true, "Card": true,
}

var packL1Units = map[string]bool{"Box": true, "Bottle": true}
var packL2Units = map[string]bool{"Strip": true, "Card": true}
var packL3Units = map[string]bool{"Tablet": true, "Capsule": true, "mL": true}

type itemUnits struct {
	PurchaseUnit        string
	StockUnit           string
	BillingUnit         string
	UnitsPerPurchase    int64
	BillingPerStock     int64
	ChargeFullStockUnit bool
}

type itemPack struct {
	L1Qty  int64
	L1Unit string
	L2Qty  int64
	L2Unit string
	L3Qty  int64
	L3Unit string
}

func categoryUnitDefaults(category string) itemUnits {
	switch category {
	case "Tablet":
		return itemUnits{
			PurchaseUnit: "Box", StockUnit: "Tablet", BillingUnit: "Tablet",
			UnitsPerPurchase: 1, BillingPerStock: 1, ChargeFullStockUnit: false,
		}
	case "Injection":
		return itemUnits{
			PurchaseUnit: "Box", StockUnit: "Vial", BillingUnit: "mL",
			UnitsPerPurchase: 1, BillingPerStock: 1, ChargeFullStockUnit: true,
		}
	case "Syrup":
		return itemUnits{
			PurchaseUnit: "Bottle", StockUnit: "Bottle", BillingUnit: "mL",
			UnitsPerPurchase: 1, BillingPerStock: 1, ChargeFullStockUnit: false,
		}
	case "OT":
		return itemUnits{
			PurchaseUnit: "Box", StockUnit: "Piece", BillingUnit: "Piece",
			UnitsPerPurchase: 1, BillingPerStock: 1, ChargeFullStockUnit: false,
		}
	default:
		return itemUnits{
			PurchaseUnit: "Box", StockUnit: "Piece", BillingUnit: "Piece",
			UnitsPerPurchase: 1, BillingPerStock: 1, ChargeFullStockUnit: false,
		}
	}
}

func normalizeUnitName(raw string) string {
	return strings.TrimSpace(raw)
}

func validateUnitName(u string) bool {
	return allowedUnits[u]
}

func defaultItemPack() itemPack {
	return itemPack{
		L1Qty: 1, L1Unit: "Box",
		L2Qty: 1, L2Unit: "Strip",
		L3Qty: 1, L3Unit: "Tablet",
	}
}

func resolveItemPack(l1Qty, l2Qty, l3Qty *int64, l1Unit, l2Unit, l3Unit string) (itemPack, string) {
	p := defaultItemPack()
	if l1Qty != nil {
		p.L1Qty = *l1Qty
	}
	if l2Qty != nil {
		p.L2Qty = *l2Qty
	}
	if l3Qty != nil {
		p.L3Qty = *l3Qty
	}
	if u := normalizeUnitName(l1Unit); u != "" {
		p.L1Unit = u
	}
	if u := normalizeUnitName(l2Unit); u != "" {
		p.L2Unit = u
	}
	if u := normalizeUnitName(l3Unit); u != "" {
		p.L3Unit = u
	}
	if p.L1Qty < 1 {
		return p, "pack_l1_qty must be >= 1"
	}
	if p.L2Qty < 1 {
		return p, "pack_l2_qty must be >= 1"
	}
	if p.L3Qty < 1 {
		return p, "pack_l3_qty must be >= 1"
	}
	if !packL1Units[p.L1Unit] {
		return p, "invalid pack_l1_unit (Box or Bottle)"
	}
	if !packL2Units[p.L2Unit] {
		return p, "invalid pack_l2_unit (Strip or Card)"
	}
	if !packL3Units[p.L3Unit] {
		return p, "invalid pack_l3_unit (Tablet, Capsule, or mL)"
	}
	return p, ""
}

// tabletsPerBox is L3 units contained in one L1 unit (box/bottle).
func tabletsPerBox(p itemPack) int64 {
	return p.L2Qty * p.L3Qty
}

// totalTabletsFromPackQtys converts mixed box/strip/tablet sale qty into L3 units.
func totalTabletsFromPackQtys(boxQty, stripQty, tabletQty int64, p itemPack) (int64, string) {
	if boxQty < 0 || stripQty < 0 || tabletQty < 0 {
		return 0, "pack quantities must be >= 0"
	}
	if boxQty == 0 && stripQty == 0 && tabletQty == 0 {
		return 0, "quantity required"
	}
	total := boxQty*tabletsPerBox(p) + stripQty*p.L3Qty + tabletQty
	if total <= 0 {
		return 0, "quantity must be > 0"
	}
	return total, ""
}

func packToItemUnits(p itemPack) itemUnits {
	return itemUnits{
		PurchaseUnit:        p.L1Unit,
		StockUnit:           p.L3Unit,
		BillingUnit:         p.L3Unit,
		UnitsPerPurchase:    tabletsPerBox(p),
		BillingPerStock:     1,
		ChargeFullStockUnit: false,
	}
}

func resolveItemUnits(category string, purchase, stock, billing string, upp, bps *int64, chargeFull *bool, packSizeFallback int64) (itemUnits, string) {
	d := categoryUnitDefaults(category)
	u := d
	if purchase = normalizeUnitName(purchase); purchase != "" {
		u.PurchaseUnit = purchase
	}
	if stock = normalizeUnitName(stock); stock != "" {
		u.StockUnit = stock
	}
	if billing = normalizeUnitName(billing); billing != "" {
		u.BillingUnit = billing
	}
	if upp != nil {
		u.UnitsPerPurchase = *upp
	} else if packSizeFallback >= 1 {
		u.UnitsPerPurchase = packSizeFallback
	}
	if bps != nil {
		u.BillingPerStock = *bps
	}
	if chargeFull != nil {
		u.ChargeFullStockUnit = *chargeFull
	} else if category == "Injection" {
		u.ChargeFullStockUnit = true
	}

	if !validateUnitName(u.PurchaseUnit) {
		return u, "invalid purchase_unit"
	}
	if !validateUnitName(u.StockUnit) {
		return u, "invalid stock_unit"
	}
	if !validateUnitName(u.BillingUnit) {
		return u, "invalid billing_unit"
	}
	if u.UnitsPerPurchase < 1 {
		return u, "units_per_purchase must be >= 1"
	}
	if u.BillingPerStock < 1 {
		return u, "billing_per_stock must be >= 1"
	}
	return u, ""
}

// billingToStockQty converts a billing quantity into whole stock units to deduct/charge.
func billingToStockQty(billingQty, billingPerStock int64, chargeFull bool) (stockQty int64, errMsg string) {
	if billingQty <= 0 {
		return 0, "billing qty must be > 0"
	}
	if billingPerStock < 1 {
		return 0, "billing_per_stock must be >= 1"
	}
	if chargeFull {
		return int64(math.Ceil(float64(billingQty) / float64(billingPerStock))), ""
	}
	if billingQty%billingPerStock != 0 {
		return 0, "billing qty must be a whole number of stock units (or enable charge full stock unit)"
	}
	return billingQty / billingPerStock, ""
}

func lineChargeMMK(billingQty, stockQty, billingPerStock, sellPerBilling int64, chargeFull bool) int64 {
	if chargeFull {
		return stockQty * billingPerStock * sellPerBilling
	}
	return billingQty * sellPerBilling
}
