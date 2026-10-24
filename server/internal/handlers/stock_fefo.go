package handlers

// unexpiredBatchSQL selects saleable MAIN (or another location) batches for
// pharmacy and OPD. Dated stock sells FEFO: earliest expiry first. A null or
// blank expiry sells after every unexpired dated batch. Batches dated before
// today (Asia/Yangon) stay on the shelf.
// Args: item_id, location_code, today YYYY-MM-DD.
func unexpiredBatchSQL(columns string) string {
	return `
		SELECT ` + columns + ` FROM item_batches
		WHERE item_id = ? AND location_code = ? AND qty > 0
		  AND (
		    expiry_date IS NULL OR expiry_date = ''
		    OR date(expiry_date) >= date(?)
		  )
		ORDER BY
		  CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
		  expiry_date ASC, id ASC`
}
