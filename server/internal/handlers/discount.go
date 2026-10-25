package handlers

import "strings"

// normalizeDiscountInput checks the cashier's optional discount.
// An empty unit means percent. MMK is not capped here; applyBillDiscount
// rejects an MMK discount larger than the cart total.
func normalizeDiscountInput(value int64, unit string) (int64, string, string) {
	unit = strings.ToLower(strings.TrimSpace(unit))
	if unit == "" {
		unit = "percent"
	}
	if unit != "percent" && unit != "mmk" {
		return 0, "", "discount_unit must be percent or mmk"
	}
	if value < 0 {
		return 0, "", "discount_value must be >= 0"
	}
	if unit == "percent" && value > 100 {
		return 0, "", "discount percent must be 0-100"
	}
	return value, unit, ""
}

// applyBillDiscount turns a percent or MMK discount into kyats off the cart sum.
// Percent uses half-up to the nearest kyat: (gross*percent + 50) / 100.
// The returned net is what total_mmk stores.
func applyBillDiscount(gross, value int64, unit string) (discountMMK, net int64, unitOut string, errMsg string) {
	if gross < 0 {
		return 0, 0, "", "invalid total"
	}
	value, unitOut, errMsg = normalizeDiscountInput(value, unit)
	if errMsg != "" {
		return 0, 0, "", errMsg
	}
	var off int64
	if unitOut == "percent" {
		off = (gross*value + 50) / 100
		if off > gross {
			off = gross
		}
	} else if value > gross {
		return 0, 0, "", "discount exceeds total"
	} else {
		off = value
	}
	return off, gross - off, unitOut, ""
}
