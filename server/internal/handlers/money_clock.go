package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"mudita-hospital/server/internal/auth"

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

// receiptDate12h is the Date line on slips: Yangon civil clock, 12-hour with AM/PM.
const receiptDate12h = "2006-01-02 3:04 PM"

// formatReceiptCivil prints a Yangon wall-time string as 12-hour AM/PM.
// Unparseable values are returned unchanged.
func formatReceiptCivil(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return raw
	}
	layouts := []string{
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, raw, yangon); err == nil {
			return t.Format(receiptDate12h)
		}
	}
	return raw
}

// receiptDateLabel is the Date line on OPD / OT / pharmacy / expense slips.
// paid_at and billed_at are already Asia/Yangon wall time. created_at is UTC
// from datetime('now') and must be shown in Yangon so it matches the bill form.
// Display is always 12-hour with AM/PM when the stamp parses.
func receiptDateLabel(createdAt string, billedAt, paidAt *string) string {
	if paidAt != nil && strings.TrimSpace(*paidAt) != "" {
		return formatReceiptCivil(*paidAt)
	}
	if billedAt != nil && strings.TrimSpace(*billedAt) != "" {
		return formatReceiptCivil(*billedAt)
	}
	raw := strings.TrimSpace(createdAt)
	if raw == "" {
		return createdAt
	}
	t, err := time.ParseInLocation("2006-01-02 15:04:05", raw, time.UTC)
	if err != nil {
		return createdAt
	}
	return t.In(yangon).Format(receiptDate12h)
}

// billedAtOverride is an Admin-chosen bill civil time.
// Yangon goes in billed_at / paid_at; UTC goes in created_at (and IPD admitted_at).
type billedAtOverride struct {
	Yangon string
	UTC    string
}

// parseAdminBilledAt validates optional billed_at from a create body.
// Empty → nil (real clock). Non-admin with a value → 403. Bad format → 400.
func parseAdminBilledAt(role, raw string) (*billedAtOverride, int, string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, 0, ""
	}
	if role != auth.RoleAdmin {
		return nil, http.StatusForbidden, "admin only"
	}
	t, ok := parseBilledAtInput(raw)
	if !ok {
		return nil, http.StatusBadRequest, "invalid billed_at"
	}
	return &billedAtOverride{
		Yangon: t.In(yangon).Format("2006-01-02 15:04:05"),
		UTC:    t.UTC().Format("2006-01-02 15:04:05"),
	}, 0, ""
}

func parseBilledAtInput(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	raw = strings.ReplaceAll(raw, "T", " ")
	layouts := []string{
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, raw, yangon); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// payAtForBill returns billed_at when set, otherwise the live Yangon clock.
func payAtForBill(tx *sql.Tx, table string, id int64) (string, error) {
	switch table {
	case "opd_bills", "pharmacy_bills", "ot_bills", "expense_bills":
	default:
		return "", fmt.Errorf("unknown bill table")
	}
	var billed sql.NullString
	err := tx.QueryRow(`SELECT billed_at FROM `+table+` WHERE id = ?`, id).Scan(&billed)
	if err != nil {
		return "", err
	}
	if billed.Valid && strings.TrimSpace(billed.String) != "" {
		return billed.String, nil
	}
	return localCivilNow(), nil
}

// execPayDraft marks a draft bill paid only if it is still draft.
// n is 0 when another request already paid or voided it.
// admissionID nil is cash (collected_cash 1). A set id is an account charge (collected_cash 0).
// paid_at uses billed_at when the bill was created with an Admin override.
func execPayDraft(tx *sql.Tx, table string, id, userID int64, admissionID *int64) (int64, error) {
	switch table {
	case "opd_bills", "pharmacy_bills", "ot_bills":
	default:
		return 0, fmt.Errorf("unknown bill table")
	}
	paidAt, err := payAtForBill(tx, table, id)
	if err != nil {
		return 0, err
	}
	collected := 1
	var admission any
	if admissionID != nil {
		collected = 0
		admission = *admissionID
	}
	res, err := tx.Exec(
		`UPDATE `+table+` SET status = 'paid', paid_at = ?, paid_by_user_id = ?, collected_cash = ?, admission_id = ?, updated_at = datetime('now') WHERE id = ? AND status = 'draft'`,
		paidAt, userID, collected, admission, id,
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
