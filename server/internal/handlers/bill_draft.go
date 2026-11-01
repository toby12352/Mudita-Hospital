package handlers

import "strings"

// draftBillHasContent is true when a draft create/update has anything worth storing.
// Payment type, billed_at, and discount_unit alone do not count.
func draftBillHasContent(texts []string, lineCount int, discountValue int64, flags ...bool) bool {
	if lineCount > 0 {
		return true
	}
	if discountValue > 0 {
		return true
	}
	for _, f := range flags {
		if f {
			return true
		}
	}
	for _, t := range texts {
		if strings.TrimSpace(t) != "" {
			return true
		}
	}
	return false
}

func ageSet(age *int64) bool {
	return age != nil
}
