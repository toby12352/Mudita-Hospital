package handlers

// unexpiredBatchSQL selects MAIN (or another location) batches for pharmacy sale,
// OPD sale, and OT issue. Blank expiry still sells and sorts after dated stock.
// Batches dated before today (Asia/Yangon) are left on the shelf.
// Args: item_id, location_code, today YYYY-MM-DD.
func unexpiredBatchSQL(columns string) string {
	return `
		SELECT ` + columns + ` FROM item_batches
		WHERE item_id = ? AND location_code = ? AND qty > 0
		  AND (expiry_date IS NULL OR expiry_date = '' OR date(expiry_date) >= date(?))
		ORDER BY CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
		         expiry_date ASC, id ASC`
}
