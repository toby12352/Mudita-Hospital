package handlers

import (
	"math"
	"strings"
)

var allowedUnits = map[string]bool{
	"Box": true, "Carton": true, "Bottle": true, "Vial": true, "Ampoule": true,
	"Piece": true, "Tablet": true, "Capsule": true, "Tube": true, "Cylinder": true,
	"Bag": true, "Each": true, "mL": true, "g": true, "oz": true,
}

type itemUnits struct {
	PurchaseUnit         string
	StockUnit            string
	BillingUnit          string
	UnitsPerPurchase     int64
	BillingPerStock      int64
	ChargeFullStockUnit  bool
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
