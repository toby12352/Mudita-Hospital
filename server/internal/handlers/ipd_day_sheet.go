package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// ipdPrintCarryRow is yesterday's ပိုငွေ or လိုငွေ shown at the top of the
// hospital IPD income print. AmountMMK is the stay-sheet difference for that
// opening row (surplus positive, shortfall negative). It is display-only and
// is not added to income.
type ipdPrintCarryRow struct {
	Kind        string
	AdmissionNo string
	Patient     string
	AmountMMK   int64
}

// loadIpdDailyPrintCarry returns brought-forward rows for the hospital daily
// income print on civilDate. It uses yesterday's stored vouchers and the same
// rule as openingCarryFromPrior. Issued, paid shortfall, zero close, deleted
// stays, and stays discharged before civilDate are skipped. An issued prior
// day does not block the whole hospital print.
func loadIpdDailyPrintCarry(db *sql.DB, civilDate string) ([]ipdPrintCarryRow, error) {
	civilDate = strings.TrimSpace(civilDate)
	prev, ok := previousCivilDate(civilDate)
	if !ok {
		return nil, nil
	}
	start, _, ok := yangonDayUTCRange(civilDate)
	if !ok {
		return nil, nil
	}
	rows, err := db.Query(`
		SELECT v.status, v.closing_mmk, a.admission_no, p.name
		FROM ipd_day_vouchers v
		JOIN ipd_admissions a ON a.id = v.admission_id
		JOIN patients p ON p.id = a.patient_id
		WHERE v.civil_date = ?
		  AND a.status != 'deleted'
		  AND (
		    a.discharged_at IS NULL
		    OR TRIM(a.discharged_at) = ''
		    OR a.discharged_at >= ?
		  )
		ORDER BY a.admission_no, v.id
	`, prev, start)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]ipdPrintCarryRow, 0)
	for rows.Next() {
		var prior dayVoucherPrior
		var admissionNo, patient string
		if err := rows.Scan(&prior.Status, &prior.ClosingMMK, &admissionNo, &patient); err != nil {
			return nil, err
		}
		label, deposited, toPay, err := openingCarryFromPrior(prior)
		if err != nil || label == "" {
			continue
		}
		out = append(out, ipdPrintCarryRow{
			Kind:        label,
			AdmissionNo: admissionNo,
			Patient:     patient,
			AmountMMK:   deposited - toPay,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// errPreviousVoucherIssued means the previous civil date still has an issued
// voucher, so the next sheet has no legal opening carry.
var errPreviousVoucherIssued = errors.New("previous day voucher is still issued; decide it before building the next sheet")

// dayVoucherPrior is the previous civil date's stored voucher used for the
// opening carry. Empty Status means no voucher yet (opening is zero).
type dayVoucherPrior struct {
	Status     string
	ClosingMMK int64
}

// daySheetRowKind marks whether a row is the opening carry or a ledger line.
type daySheetRowKind string

const (
	daySheetOpening daySheetRowKind = "opening"
	daySheetLedger  daySheetRowKind = "ledger"
)

// daySheetRow is one printable row on a daily voucher.
// DepositedMMK and ToPayMMK are the amounts shown in those columns (charges
// as positive kyats in To Pay). DifferenceMMK is the running net after the row:
// deposited so far minus to-pay so far. Positive is ပိုငွေ; negative is လိုငွေ.
type daySheetRow struct {
	Kind          daySheetRowKind
	Label         string
	Detail        string
	CreatedAt     string
	Ledger        *ipdLedgerLine
	DepositedMMK  int64
	ToPayMMK      int64
	DifferenceMMK int64
}

// daySheet is one Yangon civil day's voucher body and summary.
// ClosingMMK uses the ledger sign: positive ပိုငွေ, negative လိုငွေ.
type daySheet struct {
	CivilDate     string
	Rows          []daySheetRow
	DayDeposited  int64
	DayToPay      int64
	ClosingMMK    int64
	ClosingLabel  string
	ClosingAbsMMK int64
}

// groupLedgerByYangonDay buckets stay ledger lines by Asia/Yangon civil date.
// Dates are returned ascending. Lines with unparseable timestamps are omitted.
func groupLedgerByYangonDay(lines []ipdLedgerLine) map[string][]ipdLedgerLine {
	out := map[string][]ipdLedgerLine{}
	for _, line := range lines {
		key, ok := yangonDateKey(line.CreatedAt)
		if !ok {
			continue
		}
		out[key] = append(out[key], line)
	}
	return out
}

// linesForCivilDay returns one Yangon day's ledger lines. Collection rows that
// settled a day voucher are skipped: they are drawer cash and income, and they
// are not a new deposited fee on a later sheet. The final statement keeps them.
func linesForCivilDay(lines []ipdLedgerLine, civilDate string, skipCollections map[int64]struct{}) []ipdLedgerLine {
	day := groupLedgerByYangonDay(lines)[civilDate]
	if len(skipCollections) == 0 || len(day) == 0 {
		return day
	}
	out := make([]ipdLedgerLine, 0, len(day))
	for _, line := range day {
		if _, skip := skipCollections[line.ID]; skip {
			continue
		}
		out = append(out, line)
	}
	return out
}

// yangonDayKeysSorted returns the Yangon dates present in lines, ascending.
func yangonDayKeysSorted(lines []ipdLedgerLine) []string {
	buckets := groupLedgerByYangonDay(lines)
	keys := make([]string, 0, len(buckets))
	for key := range buckets {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// openingCarryFromPrior returns the first-row label and column amounts from the
// previous day's stored voucher. previous issued is not a legal carry source.
func openingCarryFromPrior(prior dayVoucherPrior) (label string, deposited, toPay int64, err error) {
	status := strings.TrimSpace(prior.Status)
	if status == "" {
		return "", 0, 0, nil
	}
	if status == "issued" {
		return "", 0, 0, errPreviousVoucherIssued
	}
	switch status {
	case "paid", "credit":
		if prior.ClosingMMK > 0 {
			return "ပိုငွေ", prior.ClosingMMK, 0, nil
		}
		if status == "credit" && prior.ClosingMMK < 0 {
			return "လိုငွေ", 0, -prior.ClosingMMK, nil
		}
		// paid with closing <= 0: shortfall was collected or balance is zero.
		return "", 0, 0, nil
	default:
		return "", 0, 0, fmt.Errorf("unknown previous voucher status %q", status)
	}
}

// ledgerColumnSplit puts cash-like kinds in Deposited Fee and charge kinds in
// To Pay. Charge amounts appear as positive kyats; reversals reduce To Pay.
func ledgerColumnSplit(line ipdLedgerLine) (deposited, toPay int64) {
	switch strings.TrimSpace(line.Kind) {
	case "deposit", "collection", "refund":
		return line.AmountMMK, 0
	case "ward", "charge", "reversal":
		return 0, -line.AmountMMK
	default:
		// Unknown kinds do not affect the sheet columns.
		return 0, 0
	}
}

// buildDaySheet builds the daily voucher rows for civilDate from that day's
// ledger lines and the previous day's stored voucher. prior with empty Status
// means no opening carry.
func buildDaySheet(civilDate string, dayLines []ipdLedgerLine, prior dayVoucherPrior) (daySheet, error) {
	civilDate = strings.TrimSpace(civilDate)
	sheet := daySheet{CivilDate: civilDate, Rows: make([]daySheetRow, 0, len(dayLines)+1)}

	label, openDep, openPay, err := openingCarryFromPrior(prior)
	if err != nil {
		return sheet, err
	}

	var deposited, toPay int64
	if label != "" {
		deposited += openDep
		toPay += openPay
		sheet.Rows = append(sheet.Rows, daySheetRow{
			Kind:          daySheetOpening,
			Label:         label,
			DepositedMMK:  openDep,
			ToPayMMK:      openPay,
			DifferenceMMK: deposited - toPay,
		})
	}

	for i := range dayLines {
		line := dayLines[i]
		dep, pay := ledgerColumnSplit(line)
		deposited += dep
		toPay += pay
		lineCopy := line
		sheet.Rows = append(sheet.Rows, daySheetRow{
			Kind:          daySheetLedger,
			Label:         statementKind(line),
			Detail:        strings.TrimSpace(line.Note),
			CreatedAt:     line.CreatedAt,
			Ledger:        &lineCopy,
			DepositedMMK:  dep,
			ToPayMMK:      pay,
			DifferenceMMK: deposited - toPay,
		})
	}

	sheet.DayDeposited = deposited
	sheet.DayToPay = toPay
	sheet.ClosingMMK = deposited - toPay
	sheet.ClosingLabel, sheet.ClosingAbsMMK = statementBalanceLabel(sheet.ClosingMMK)
	return sheet, nil
}
