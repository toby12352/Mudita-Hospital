package handlers

// normalizeFocFlag accepts 0 (charged) or 1 (free of charge). Omitted JSON is 0.
func normalizeFocFlag(v int) (int, string) {
	if v != 0 && v != 1 {
		return 0, "foc must be 0 or 1"
	}
	return v, ""
}

// billableLineTotal is the amount that counts toward discount gross and bill total_mmk.
func billableLineTotal(lineTotalMMK int64, foc int) int64 {
	if foc == 1 {
		return 0
	}
	return lineTotalMMK
}

// appendReceiptLine adds the priced row, then a FOC companion when foc is set.
func appendReceiptLine(lines []receiptLine, line receiptLine, foc int) []receiptLine {
	lines = append(lines, line)
	if foc == 1 {
		lines = append(lines, receiptLine{
			Description: "FOC",
			BlankQty:    true,
			LineTotal:   -line.LineTotal,
		})
	}
	return lines
}
