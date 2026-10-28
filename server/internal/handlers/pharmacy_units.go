package handlers

import (
	"math"
	"strings"
)

const maxPackDepth = 6

var allowedUnits = map[string]bool{
	"Box": true, "Carton": true, "Bottle": true, "Vial": true, "Ampoule": true,
	"Piece": true, "Tablet": true, "Capsule": true, "Tube": true, "Cylinder": true,
	"Bag": true, "Each": true, "mL": true, "g": true, "oz": true,
	"Strip": true, "Card": true, "Sachet": true, "Pack": true,
	"Puff": true, "Pairs": true,
}

// Any allowed pharmacy unit may appear at any pack level (packing chain is free-form).

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
	L4Qty  int64
	L4Unit string
	L5Qty  int64
	L5Unit string
	L6Qty  int64
	L6Unit string
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
		L4Qty: 1, L4Unit: "Tablet",
		L5Qty: 1, L5Unit: "Tablet",
		L6Qty: 1, L6Unit: "Tablet",
	}
}

// padPackTail fills empty L4–L6 with qty 1 and the innermost known unit so
// older 3-slot clients keep a valid six-slot row without changing factors.
func padPackTail(p itemPack) itemPack {
	if p.L1Qty < 1 {
		p.L1Qty = 1
	}
	if p.L2Qty < 1 {
		p.L2Qty = 1
	}
	if p.L3Qty < 1 {
		p.L3Qty = 1
	}
	if p.L4Qty < 1 {
		p.L4Qty = 1
	}
	if p.L5Qty < 1 {
		p.L5Qty = 1
	}
	if p.L6Qty < 1 {
		p.L6Qty = 1
	}
	if p.L1Unit == "" {
		p.L1Unit = "Box"
	}
	if p.L2Unit == "" {
		p.L2Unit = "Strip"
	}
	if p.L3Unit == "" {
		p.L3Unit = "Tablet"
	}
	smallest := p.L3Unit
	if p.L4Unit != "" {
		smallest = p.L4Unit
	}
	if p.L5Unit != "" {
		smallest = p.L5Unit
	}
	if p.L6Unit != "" {
		smallest = p.L6Unit
	}
	if p.L4Unit == "" {
		p.L4Unit = smallest
		p.L4Qty = 1
	}
	if p.L5Unit == "" {
		p.L5Unit = smallest
		p.L5Qty = 1
	}
	if p.L6Unit == "" {
		p.L6Unit = smallest
		p.L6Qty = 1
	}
	return p
}

func packSlotQtys(p itemPack) [6]int64 {
	return [6]int64{p.L1Qty, p.L2Qty, p.L3Qty, p.L4Qty, p.L5Qty, p.L6Qty}
}

func packSlotUnits(p itemPack) [6]string {
	return [6]string{p.L1Unit, p.L2Unit, p.L3Unit, p.L4Unit, p.L5Unit, p.L6Unit}
}

// packInnermostUnit is the stored L6 name after padding (stock / billing unit).
func packInnermostUnit(p itemPack) string {
	p = padPackTail(p)
	return p.L6Unit
}

func resolveItemPack(
	l1Qty, l2Qty, l3Qty, l4Qty, l5Qty, l6Qty *int64,
	l1Unit, l2Unit, l3Unit, l4Unit, l5Unit, l6Unit string,
) (itemPack, string) {
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
	if l4Qty != nil {
		p.L4Qty = *l4Qty
	}
	if l5Qty != nil {
		p.L5Qty = *l5Qty
	}
	if l6Qty != nil {
		p.L6Qty = *l6Qty
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
	if u := normalizeUnitName(l4Unit); u != "" {
		p.L4Unit = u
	} else {
		p.L4Unit = ""
	}
	if u := normalizeUnitName(l5Unit); u != "" {
		p.L5Unit = u
	} else {
		p.L5Unit = ""
	}
	if u := normalizeUnitName(l6Unit); u != "" {
		p.L6Unit = u
	} else {
		p.L6Unit = ""
	}
	// Older clients omit L4–L6: pad from L3 so factors match the three-slot product.
	p = padPackTail(p)

	qtys := packSlotQtys(p)
	units := packSlotUnits(p)
	for i := 0; i < maxPackDepth; i++ {
		if qtys[i] < 1 {
			return p, "pack quantities must be >= 1"
		}
		if !validateUnitName(units[i]) {
			return p, "invalid pack unit"
		}
	}
	if _, err := tabletsPerBox(p); err != "" {
		return p, err
	}
	levels := visiblePackLevels(p)
	if len(levels) > maxPackDepth {
		return p, "at most six packing units"
	}
	seen := map[string]bool{}
	for _, lv := range levels {
		key := strings.ToLower(lv.Unit)
		if seen[key] {
			return p, "pack unit names must be unique in the visible chain"
		}
		seen[key] = true
	}
	return p, ""
}

// roundPayableMMK snaps an amount to the nearest multiple of 50 kyat (Myanmar
// cash notes). Halfway (remainder 25) rounds up. Positive amounts that would
// round to 0 become 50 so a real price never collapses to free.
func roundPayableMMK(n int64) int64 {
	if n <= 0 {
		return 0
	}
	const step int64 = 50
	rem := n % step
	var out int64
	if rem >= 25 {
		out = n - rem + step
	} else {
		out = n - rem
	}
	if out == 0 {
		return step
	}
	return out
}

type packSaleQtys struct {
	Box    int64
	Strip  int64
	Tablet int64
	L4     int64
	L5     int64
	L6     int64
}

// pharmacyPackLineChargeMMK prices mixed pack qtys at payable unit prices
// (each pack slot rounded separately), not as raw smallest-units × catalog sell.
func pharmacyPackLineChargeMMK(q packSaleQtys, sellPerSmallest int64, p itemPack) int64 {
	sell := sellPerSmallest
	if sell < 0 {
		sell = 0
	}
	factors := packSlotFactors(p)
	var total int64
	slots := [6]int64{q.Box, q.Strip, q.Tablet, q.L4, q.L5, q.L6}
	for i, qty := range slots {
		if qty > 0 {
			total += qty * roundPayableMMK(sell*factors[i])
		}
	}
	return total
}

// tabletsPerBox is L6 units contained in one L1 unit (product of L2…L6 qtys).
func tabletsPerBox(p itemPack) (int64, string) {
	p = padPackTail(p)
	product := int64(1)
	for _, q := range []int64{p.L2Qty, p.L3Qty, p.L4Qty, p.L5Qty, p.L6Qty} {
		if q < 1 {
			q = 1
		}
		if product > math.MaxInt64/q {
			return 0, "pack quantities too large"
		}
		product *= q
	}
	return product, ""
}

// packSlotFactors returns how many smallest units one of each stored slot contains.
// Index 0 is L1 (outer), index 5 is L6 (innermost, always 1).
func packSlotFactors(p itemPack) [6]int64 {
	p = padPackTail(p)
	qtys := packSlotQtys(p)
	var factors [6]int64
	factor := int64(1)
	for i := maxPackDepth - 1; i >= 0; i-- {
		factors[i] = factor
		if i > 0 {
			q := qtys[i]
			if q < 1 {
				q = 1
			}
			if factor > math.MaxInt64/q {
				factor = math.MaxInt64
			} else {
				factor *= q
			}
		}
	}
	return factors
}

// totalTabletsFromPackQtys converts mixed sale qtys into L6 (smallest) units.
func totalTabletsFromPackQtys(q packSaleQtys, p itemPack) (int64, string) {
	if q.Box < 0 || q.Strip < 0 || q.Tablet < 0 || q.L4 < 0 || q.L5 < 0 || q.L6 < 0 {
		return 0, "pack quantities must be >= 0"
	}
	if q.Box == 0 && q.Strip == 0 && q.Tablet == 0 && q.L4 == 0 && q.L5 == 0 && q.L6 == 0 {
		return 0, "quantity required"
	}
	factors := packSlotFactors(p)
	slots := [6]int64{q.Box, q.Strip, q.Tablet, q.L4, q.L5, q.L6}
	var total int64
	for i, qty := range slots {
		if qty == 0 {
			continue
		}
		f := factors[i]
		if qty > math.MaxInt64/f {
			return 0, "quantity too large"
		}
		add := qty * f
		if total > math.MaxInt64-add {
			return 0, "quantity too large"
		}
		total += add
	}
	if total <= 0 {
		return 0, "quantity must be > 0"
	}
	return total, ""
}

type packLevel struct {
	Unit   string
	Factor int64
	// Slot is 0-based index into pack_l1…pack_l6 (box/strip/tablet/l4/l5/l6 sale columns).
	Slot int
}

// visiblePackLevels collapses pass-through padding: after the first slot, drop
// any slot whose qty is 1 and unit equals the previous kept unit.
func visiblePackLevels(p itemPack) []packLevel {
	p = padPackTail(p)
	units := packSlotUnits(p)
	qtys := packSlotQtys(p)
	factors := packSlotFactors(p)

	type raw struct {
		unit string
		qty  int64
		slot int
	}
	rawSlots := make([]raw, 0, maxPackDepth)
	for i := 0; i < maxPackDepth; i++ {
		rawSlots = append(rawSlots, raw{unit: units[i], qty: qtys[i], slot: i})
	}

	kept := make([]raw, 0, maxPackDepth)
	for i, s := range rawSlots {
		if i == 0 {
			kept = append(kept, s)
			continue
		}
		prev := kept[len(kept)-1]
		if s.qty == 1 && strings.EqualFold(s.unit, prev.unit) {
			continue
		}
		kept = append(kept, s)
	}

	out := make([]packLevel, len(kept))
	for i, s := range kept {
		out[i] = packLevel{Unit: s.unit, Factor: factors[s.slot], Slot: s.slot}
	}
	return out
}

func packVisibleDepth(p itemPack) int {
	return len(visiblePackLevels(p))
}

func saleUnitFactor(p itemPack, unit string) (factor int64, canonical string, ok bool) {
	want := strings.TrimSpace(unit)
	if want == "" {
		return 0, "", false
	}
	for _, lv := range visiblePackLevels(p) {
		if strings.EqualFold(lv.Unit, want) {
			return lv.Factor, lv.Unit, true
		}
	}
	return 0, "", false
}

// restockStockQty converts a restock qty into smallest (stock) units.
// qty_unit: omitted/"purchase" → boxes × units_per_purchase; "stock" → as-is;
// any other value is a pack unit name resolved via saleUnitFactor.
func restockStockQty(item pharmacyItem, qty int64, qtyUnit string) (stockQty int64, auditUnit string, errMsg string) {
	if qty <= 0 {
		return 0, "", "qty must be > 0"
	}
	unit := strings.TrimSpace(qtyUnit)
	if unit == "" || strings.EqualFold(unit, "purchase") {
		upp := item.UnitsPerPurchase
		if upp < 1 {
			upp = 1
		}
		if qty > math.MaxInt64/upp {
			return 0, "", "qty too large"
		}
		return qty * upp, "purchase", ""
	}
	if strings.EqualFold(unit, "stock") {
		return qty, "stock", ""
	}
	pack := itemPackFromPharmacyItem(item)
	factor, canonical, ok := saleUnitFactor(pack, unit)
	if !ok || factor < 1 {
		return 0, "", "unknown unit"
	}
	if qty > math.MaxInt64/factor {
		return 0, "", "qty too large"
	}
	return qty * factor, canonical, ""
}

func packToItemUnits(p itemPack) itemUnits {
	p = padPackTail(p)
	upp, _ := tabletsPerBox(p)
	if upp < 1 {
		upp = 1
	}
	inner := packInnermostUnit(p)
	return itemUnits{
		PurchaseUnit:        p.L1Unit,
		StockUnit:           inner,
		BillingUnit:         inner,
		UnitsPerPurchase:    upp,
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
