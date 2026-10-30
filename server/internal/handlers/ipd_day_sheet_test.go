package handlers

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"mudita-hospital/server/internal/db"
)

func TestBuildDaySheet_DepositAndCharges(t *testing.T) {
	lines := []ipdLedgerLine{
		{Kind: "deposit", AmountMMK: 100000, Note: "admit", CreatedAt: "2026-03-10 04:00:00"},
		{Kind: "ward", AmountMMK: -40000, Note: "room", CreatedAt: "2026-03-10 10:00:00"},
	}
	sheet, err := buildDaySheet("2026-03-10", lines, dayVoucherPrior{})
	if err != nil {
		t.Fatal(err)
	}
	if sheet.ClosingLabel != "ပိုငွေ" || sheet.ClosingMMK != 60000 || sheet.ClosingAbsMMK != 60000 {
		t.Fatalf("closing: label=%q mmk=%d abs=%d", sheet.ClosingLabel, sheet.ClosingMMK, sheet.ClosingAbsMMK)
	}
	if sheet.DayDeposited != 100000 || sheet.DayToPay != 40000 {
		t.Fatalf("day totals deposited=%d toPay=%d", sheet.DayDeposited, sheet.DayToPay)
	}
	if len(sheet.Rows) != 2 {
		t.Fatalf("rows=%d", len(sheet.Rows))
	}
	last := sheet.Rows[len(sheet.Rows)-1]
	if last.DifferenceMMK != 60000 || last.ToPayMMK != 40000 || last.DepositedMMK != 0 {
		t.Fatalf("last row: %+v", last)
	}
}

func TestBuildDaySheet_PriorCreditCarry(t *testing.T) {
	lines := []ipdLedgerLine{
		{Kind: "ward", AmountMMK: -10000, Note: "nursing", CreatedAt: "2026-03-11 05:00:00"},
	}
	sheet, err := buildDaySheet("2026-03-11", lines, dayVoucherPrior{
		Status:     "credit",
		ClosingMMK: -30000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(sheet.Rows) < 1 || sheet.Rows[0].Kind != daySheetOpening {
		t.Fatalf("expected opening row, got %+v", sheet.Rows)
	}
	open := sheet.Rows[0]
	if open.Label != "လိုငွေ" || open.ToPayMMK != 30000 || open.DepositedMMK != 0 {
		t.Fatalf("opening: %+v", open)
	}
	if open.DifferenceMMK != -30000 {
		t.Fatalf("opening difference=%d", open.DifferenceMMK)
	}
	if sheet.ClosingLabel != "လိုငွေ" || sheet.ClosingMMK != -40000 || sheet.ClosingAbsMMK != 40000 {
		t.Fatalf("closing: label=%q mmk=%d abs=%d", sheet.ClosingLabel, sheet.ClosingMMK, sheet.ClosingAbsMMK)
	}
	if sheet.DayDeposited != 0 || sheet.DayToPay != 40000 {
		t.Fatalf("day totals deposited=%d toPay=%d", sheet.DayDeposited, sheet.DayToPay)
	}
}

func TestBuildDaySheet_PriorPaidExtraDeposit(t *testing.T) {
	sheet, err := buildDaySheet("2026-03-12", nil, dayVoucherPrior{
		Status:     "paid",
		ClosingMMK: 20000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(sheet.Rows) != 1 || sheet.Rows[0].Kind != daySheetOpening {
		t.Fatalf("expected only opening row, got %+v", sheet.Rows)
	}
	open := sheet.Rows[0]
	if open.Label != "ပိုငွေ" || open.DepositedMMK != 20000 || open.ToPayMMK != 0 {
		t.Fatalf("opening: %+v", open)
	}
	if sheet.ClosingLabel != "ပိုငွေ" || sheet.ClosingMMK != 20000 {
		t.Fatalf("closing: label=%q mmk=%d", sheet.ClosingLabel, sheet.ClosingMMK)
	}
}

func TestBuildDaySheet_PriorPaidZeroNoOpening(t *testing.T) {
	sheet, err := buildDaySheet("2026-03-12", nil, dayVoucherPrior{
		Status:     "paid",
		ClosingMMK: 0,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(sheet.Rows) != 0 {
		t.Fatalf("expected no opening, got %+v", sheet.Rows)
	}
	if sheet.ClosingLabel != "ပိုငွေ" || sheet.ClosingMMK != 0 {
		t.Fatalf("closing: label=%q mmk=%d", sheet.ClosingLabel, sheet.ClosingMMK)
	}
}

func TestBuildDaySheet_PriorPaidShortfallNoCarry(t *testing.T) {
	sheet, err := buildDaySheet("2026-03-12", nil, dayVoucherPrior{
		Status:     "paid",
		ClosingMMK: -5000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(sheet.Rows) != 0 {
		t.Fatalf("paid shortfall must not open next sheet: %+v", sheet.Rows)
	}
}

func TestBuildDaySheet_PriorIssuedRejected(t *testing.T) {
	_, err := buildDaySheet("2026-03-12", nil, dayVoucherPrior{
		Status:     "issued",
		ClosingMMK: -1000,
	})
	if err == nil {
		t.Fatal("expected error for previous issued voucher")
	}
}

func TestGroupLedgerByYangonDay(t *testing.T) {
	lines := []ipdLedgerLine{
		{ID: 1, Kind: "deposit", AmountMMK: 1000, CreatedAt: "2026-01-01 02:00:00"}, // 08:30 Yangon
		{ID: 2, Kind: "ward", AmountMMK: -400, CreatedAt: "2026-01-01 18:00:00"},    // 00:30 next day
		{ID: 3, Kind: "deposit", AmountMMK: 100, CreatedAt: "not-a-stamp"},
	}
	buckets := groupLedgerByYangonDay(lines)
	if len(buckets["2026-01-01"]) != 1 || buckets["2026-01-01"][0].ID != 1 {
		t.Fatalf("1 Jan: %+v", buckets["2026-01-01"])
	}
	if len(buckets["2026-01-02"]) != 1 || buckets["2026-01-02"][0].ID != 2 {
		t.Fatalf("2 Jan: %+v", buckets["2026-01-02"])
	}
	keys := yangonDayKeysSorted(lines)
	if len(keys) != 2 || keys[0] != "2026-01-01" || keys[1] != "2026-01-02" {
		t.Fatalf("keys=%v", keys)
	}
}

func TestIpdDayVoucherMigration(t *testing.T) {
	sqlDB := openTestDB(t)

	var applied int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '037_ipd_day_vouchers'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("037 not recorded: %d", applied)
	}

	var startedOn string
	if err := sqlDB.QueryRow(`SELECT started_on FROM ipd_voucher_epoch WHERE id = 1`).Scan(&startedOn); err != nil {
		t.Fatal(err)
	}
	want := time.Now().In(yangon).AddDate(0, 0, 1).Format("2006-01-02")
	if startedOn != want {
		t.Fatalf("epoch started_on=%q want %q", startedOn, want)
	}

	var voucherTable int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM sqlite_master WHERE type = 'table' AND name = 'ipd_day_vouchers'`).Scan(&voucherTable); err != nil {
		t.Fatal(err)
	}
	if voucherTable != 1 {
		t.Fatal("ipd_day_vouchers missing")
	}

	_, token := insertSession(t, sqlDB, "Admin", 0)
	charts := &Patients{DB: sqlDB}
	ipd := &IPD{DB: sqlDB}
	w := doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"Daw Epoch","phone":"091"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, note, created_at)
		VALUES (?, 'deposit', 5000, 'keep', '2026-01-01 02:00:00')
	`, stay.ID); err != nil {
		t.Fatal(err)
	}
	var beforeKind string
	var beforeAmt int64
	var beforeNote string
	if err := sqlDB.QueryRow(`
		SELECT kind, amount_mmk, note FROM ipd_ledger WHERE admission_id = ?
	`, stay.ID).Scan(&beforeKind, &beforeAmt, &beforeNote); err != nil {
		t.Fatal(err)
	}

	if err := db.Migrate(sqlDB); err != nil {
		t.Fatalf("remigrate: %v", err)
	}

	var afterCount int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_ledger WHERE admission_id = ?`, stay.ID).Scan(&afterCount); err != nil {
		t.Fatal(err)
	}
	if afterCount != 1 {
		t.Fatalf("ledger count changed: %d", afterCount)
	}
	var afterKind string
	var afterAmt int64
	var afterNote string
	if err := sqlDB.QueryRow(`
		SELECT kind, amount_mmk, note FROM ipd_ledger WHERE admission_id = ?
	`, stay.ID).Scan(&afterKind, &afterAmt, &afterNote); err != nil {
		t.Fatal(err)
	}
	if afterKind != beforeKind || afterAmt != beforeAmt || afterNote != beforeNote {
		t.Fatalf("ledger mutated: %s %d %q -> %s %d %q", beforeKind, beforeAmt, beforeNote, afterKind, afterAmt, afterNote)
	}
	var epochCount int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_voucher_epoch`).Scan(&epochCount); err != nil {
		t.Fatal(err)
	}
	if epochCount != 1 {
		t.Fatalf("epoch rows=%d", epochCount)
	}
	var startedAgain string
	if err := sqlDB.QueryRow(`SELECT started_on FROM ipd_voucher_epoch WHERE id = 1`).Scan(&startedAgain); err != nil {
		t.Fatal(err)
	}
	if startedAgain != startedOn {
		t.Fatalf("epoch rewritten: %q -> %q", startedOn, startedAgain)
	}
}
