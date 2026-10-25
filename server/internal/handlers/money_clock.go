package handlers

import (
	"database/sql"
	"fmt"
	"time"

	_ "time/tzdata"
)

// yangon is the clinic civil clock. Cash days and expiry use this, not UTC.
var yangon = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Yangon")
	if err != nil {
		return time.FixedZone("Asia/Yangon", 6*3600+30*60)
	}
	return loc
}()

// localCivilNow is Asia/Yangon wall time as YYYY-MM-DD HH:MM:SS for paid_at.
func localCivilNow() string {
	return time.Now().In(yangon).Format("2006-01-02 15:04:05")
}

// localToday is the Asia/Yangon calendar date. Batches before this date are expired.
func localToday() string {
	return time.Now().In(yangon).Format("2006-01-02")
}

// execPayDraft marks a draft bill paid only if it is still draft.
// n is 0 when another request already paid or voided it.
func execPayDraft(tx *sql.Tx, table string, id, userID int64) (int64, error) {
	switch table {
	case "opd_bills", "pharmacy_bills", "ot_bills":
	default:
		return 0, fmt.Errorf("unknown bill table")
	}
	res, err := tx.Exec(
		`UPDATE `+table+` SET status = 'paid', paid_at = ?, paid_by_user_id = ?, updated_at = datetime('now') WHERE id = ? AND status = 'draft'`,
		localCivilNow(), userID, id,
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// execMarkPrinted stamps printed_at on a draft bill (Printed — Not Paid).
// n is 0 when the bill is no longer draft. Re-print refreshes the timestamp.
func execMarkPrinted(tx *sql.Tx, table string, id int64) (int64, error) {
	switch table {
	case "opd_bills", "pharmacy_bills", "ot_bills":
	default:
		return 0, fmt.Errorf("unknown bill table")
	}
	res, err := tx.Exec(
		`UPDATE `+table+` SET printed_at = ?, updated_at = datetime('now') WHERE id = ? AND status = 'draft'`,
		localCivilNow(), id,
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
