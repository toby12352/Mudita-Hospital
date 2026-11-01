package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"mudita-hospital/server/internal/auth"
)

func TestIpdVoucherIncomeEpoch(t *testing.T) {
	sqlDB := openTestDB(t)
	setVoucherEpochDate(t, sqlDB, "2026-04-01")

	before := insertStay(t, sqlDB, "IPD-EPOCH-BEFORE")
	insertLedger(t, sqlDB, before, "ward", -400, "2026-03-20 03:00:00")
	insertLedger(t, sqlDB, before, "deposit", 900, "2026-03-20 04:00:00")

	old := mustMove(t, sqlDB, "2026-03-20")
	if old.IncomeMMK != 400 || old.IPDEarned.EarnedMMK != 400 || old.IPD.NetMMK != 900 || old.NetCashMMK != 900 {
		t.Fatalf("before epoch income=%d earned=%d drawer=%d net=%d",
			old.IncomeMMK, old.IPDEarned.EarnedMMK, old.IPD.NetMMK, old.NetCashMMK)
	}
	if len(old.IPDEarned.Lines) != 1 || old.IPDEarned.Lines[0].Kind != "ward" {
		t.Fatalf("before epoch earned lines %+v", old.IPDEarned.Lines)
	}
	if old.IPD.DepositMMK != 900 {
		t.Fatalf("before epoch deposit counted wrong %+v", old.IPD)
	}

	epochStay := insertStay(t, sqlDB, "IPD-EPOCH-DAY")
	insertLedger(t, sqlDB, epochStay, "deposit", 100000, "2026-04-02 03:00:00")
	insertLedger(t, sqlDB, epochStay, "ward", -40000, "2026-04-02 04:00:00")
	insertLedger(t, sqlDB, epochStay, "refund", -5000, "2026-04-03 03:00:00")

	day := mustMove(t, sqlDB, "2026-04-02")
	if day.IncomeMMK != 100000 || day.IPDEarned.EarnedMMK != 100000 || day.IPD.NetMMK != 100000 || day.NetCashMMK != 100000 {
		t.Fatalf("epoch day income=%d earned=%d drawer=%d net=%d",
			day.IncomeMMK, day.IPDEarned.EarnedMMK, day.IPD.NetMMK, day.NetCashMMK)
	}
	for _, line := range day.IPDEarned.Lines {
		if line.Kind == "ward" || line.Kind == "charge" || line.Kind == "reversal" {
			t.Fatalf("epoch day counted a charge %+v", line)
		}
	}
	if day.IPD.DepositMMK != 100000 {
		t.Fatalf("drawer deposit %+v", day.IPD)
	}
	refundDay := mustMove(t, sqlDB, "2026-04-03")
	if refundDay.IncomeMMK != -5000 || refundDay.IPD.RefundMMK != -5000 || refundDay.NetCashMMK != -5000 {
		t.Fatalf("refund day income=%d refund=%d net=%d", refundDay.IncomeMMK, refundDay.IPD.RefundMMK, refundDay.NetCashMMK)
	}
}

func TestIpdVoucherPayCreditUnpay(t *testing.T) {
	sqlDB := openTestDB(t)
	setVoucherEpochDate(t, sqlDB, "2026-04-01")
	_, token := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	ipd := &IPD{DB: sqlDB}
	today := localToday()

	stay := insertStay(t, sqlDB, "IPD-PAY")
	insertLedger(t, sqlDB, stay, "ward", -30000, "2026-04-10 03:00:00")
	if mustMove(t, sqlDB, "2026-04-10").IncomeMMK != 0 {
		t.Fatal("unpaid ward on an epoch day changed income")
	}

	w := postVoucher(ipd, token, stay, "2026-04-10", "issue")
	mustCode(t, w, http.StatusCreated)
	issued := decodeDayVoucher(t, w)
	if issued.Status != "issued" || issued.ClosingMMK != -30000 || issued.CollectionLedgerID != nil {
		t.Fatalf("issued %+v", issued)
	}
	w = postVoucher(ipd, token, stay, "2026-04-10", "issue")
	mustCode(t, w, http.StatusOK)
	again := decodeDayVoucher(t, w)
	if again.ID != issued.ID || again.Status != "issued" || again.ClosingMMK != -30000 {
		t.Fatalf("reissue %+v", again)
	}

	before := mustMove(t, sqlDB, today).IncomeMMK
	w = postVoucher(ipd, token, stay, "2026-04-10", "pay")
	mustCode(t, w, http.StatusOK)
	paid := decodeDayVoucher(t, w)
	if paid.Status != "paid" || paid.ClosingMMK != -30000 || paid.CollectionLedgerID == nil || !paid.CanUnpay {
		t.Fatalf("paid %+v", paid)
	}
	var collected int64
	if err := sqlDB.QueryRow(`SELECT amount_mmk FROM ipd_ledger WHERE id = ? AND kind = 'collection'`, *paid.CollectionLedgerID).Scan(&collected); err != nil {
		t.Fatal(err)
	}
	if collected != 30000 {
		t.Fatalf("collection %d", collected)
	}
	if got := mustMove(t, sqlDB, today).IncomeMMK; got-before != 30000 {
		t.Fatalf("decision-day income delta %d", got-before)
	}
	if mustMove(t, sqlDB, "2026-04-10").IncomeMMK != 0 {
		t.Fatal("pay booked income on the voucher day")
	}
	w = postVoucher(ipd, token, stay, "2026-04-10", "pay")
	mustCode(t, w, http.StatusConflict)

	var audits int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM audit_logs WHERE action = 'pay' AND entity = 'ipd_day_voucher' AND entity_id = ?`, paid.ID).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if audits != 1 {
		t.Fatalf("pay audits %d", audits)
	}

	if _, err := sqlDB.Exec(`UPDATE ipd_ledger SET created_at = '2026-04-11 03:00:00' WHERE id = ?`, *paid.CollectionLedgerID); err != nil {
		t.Fatal(err)
	}
	if mustMove(t, sqlDB, today).IncomeMMK != before {
		t.Fatal("moved collection still in today's income")
	}
	if mustMove(t, sqlDB, "2026-04-11").IncomeMMK != 30000 {
		t.Fatal("collection income did not follow its day")
	}
	page := statementHTML(t, ipd, token, stay, "2026-04-11")
	if strings.Contains(page, ">Patient Paid<") || strings.Contains(page, ">Collection<") || !strings.Contains(page, ">ပိုငွေ</td><td>0 MMK</td>") {
		t.Fatalf("pay collection leaked onto the next sheet:\n%s", page)
	}
	finalHTML := statementHTML(t, ipd, token, stay, "")
	if !strings.Contains(finalHTML, ">Patient Paid<") || !strings.Contains(finalHTML, "IPD Final Bill") {
		t.Fatalf("final statement dropped the collection:\n%s", finalHTML)
	}
	if strings.Contains(finalHTML, ">Collection<") {
		t.Fatalf("final statement still says Collection:\n%s", finalHTML)
	}

	if _, err := sqlDB.Exec(`UPDATE ipd_ledger SET created_at = datetime('now') WHERE id = ?`, *paid.CollectionLedgerID); err != nil {
		t.Fatal(err)
	}
	if got := mustMove(t, sqlDB, today).IncomeMMK; got-before != 30000 {
		t.Fatalf("collection not back on the decision day, delta %d", got-before)
	}
	w = postVoucher(ipd, token, stay, "2026-04-10", "unpay")
	mustCode(t, w, http.StatusOK)
	unpaid := decodeDayVoucher(t, w)
	if unpaid.Status != "credit" || unpaid.CollectionLedgerID != nil || unpaid.ClosingMMK != -30000 || unpaid.CanUnpay {
		t.Fatalf("unpay %+v", unpaid)
	}
	if ledgerCount(t, sqlDB, stay, "collection") != 0 {
		t.Fatal("unpay left the collection")
	}
	if mustMove(t, sqlDB, today).IncomeMMK != before || mustMove(t, sqlDB, "2026-04-11").IncomeMMK != 0 {
		t.Fatal("unpay left collection income")
	}
	carried := statementHTML(t, ipd, token, stay, "2026-04-11")
	opening := `<td class="col-no">1</td><td></td><td></td><td class="col-amt"></td><td class="col-amt">30,000</td><td class="col-amt"></td>`
	if !strings.Contains(carried, opening) || !strings.Contains(carried, `>Total</td><td class="col-amt">0</td><td class="col-amt">30,000</td><td class="col-amt">-30,000</td>`) {
		t.Fatalf("carried sheet missing လိုငွေ opening:\n%s", carried)
	}

	later := insertStay(t, sqlDB, "IPD-LATER")
	insertLedger(t, sqlDB, later, "ward", -1000, "2026-04-20 03:00:00")
	w = postVoucher(ipd, token, later, "2026-04-20", "issue")
	mustCode(t, w, http.StatusCreated)
	w = postVoucher(ipd, token, later, "2026-04-20", "pay")
	mustCode(t, w, http.StatusOK)
	if !decodeDayVoucher(t, w).CanUnpay {
		t.Fatal("latest paid voucher should allow unpay")
	}
	w = postVoucher(ipd, token, later, "2026-04-21", "issue")
	mustCode(t, w, http.StatusCreated)
	w = postVoucher(ipd, token, later, "2026-04-20", "issue")
	mustCode(t, w, http.StatusOK)
	if decodeDayVoucher(t, w).CanUnpay {
		t.Fatal("paid day with a later sheet should not allow unpay")
	}
	w = postVoucher(ipd, token, later, "2026-04-20", "unpay")
	mustCode(t, w, http.StatusConflict)
	if !strings.Contains(w.Body.String(), "later day voucher") {
		t.Fatalf("later voucher body %s", w.Body.String())
	}
	if ledgerCount(t, sqlDB, later, "collection") != 1 {
		t.Fatal("refused unpay removed the collection")
	}

	w = postVoucher(ipd, opdTok, stay, "2026-04-10", "pay")
	mustCode(t, w, http.StatusForbidden)
}

func TestIpdVoucherReopen(t *testing.T) {
	sqlDB := openTestDB(t)
	setVoucherEpochDate(t, sqlDB, "2026-04-01")
	_, token := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ipd := &IPD{DB: sqlDB}

	stay := insertStay(t, sqlDB, "IPD-REOPEN")
	insertLedger(t, sqlDB, stay, "ward", -20000, "2026-04-12 03:00:00")
	w := postVoucher(ipd, token, stay, "2026-04-12", "issue")
	mustCode(t, w, http.StatusCreated)
	issued := decodeDayVoucher(t, w)
	if !issued.CanReopen || issued.CanUnpay {
		t.Fatalf("issued flags %+v", issued)
	}
	if ledgerCount(t, sqlDB, stay, "ward") != 1 {
		t.Fatal("issue changed ledger")
	}

	w = postVoucher(ipd, token, stay, "2026-04-12", "reopen")
	mustCode(t, w, http.StatusOK)
	var left int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_day_vouchers WHERE admission_id = ? AND civil_date = '2026-04-12'`, stay).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if left != 0 {
		t.Fatalf("reopen left %d voucher rows", left)
	}
	if ledgerCount(t, sqlDB, stay, "ward") != 1 {
		t.Fatal("reopen changed ledger")
	}
	var audits int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM audit_logs WHERE action = 'reopen' AND entity = 'ipd_day_voucher' AND entity_id = ?`, issued.ID).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if audits != 1 {
		t.Fatalf("reopen audits %d", audits)
	}

	w = postVoucher(ipd, token, stay, "2026-04-12", "reopen")
	mustCode(t, w, http.StatusNotFound)

	w = postVoucher(ipd, token, stay, "2026-04-12", "issue")
	mustCode(t, w, http.StatusCreated)
	w = postVoucher(ipd, token, stay, "2026-04-12", "pay")
	mustCode(t, w, http.StatusOK)
	paid := decodeDayVoucher(t, w)
	if paid.CanReopen {
		t.Fatal("paid voucher should not reopen")
	}
	w = postVoucher(ipd, token, stay, "2026-04-12", "reopen")
	mustCode(t, w, http.StatusConflict)
	if ledgerCount(t, sqlDB, stay, "collection") != 1 {
		t.Fatal("refused reopen removed collection")
	}

	w = postVoucher(ipd, token, stay, "2026-04-12", "unpay")
	mustCode(t, w, http.StatusOK)
	if decodeDayVoucher(t, w).CanReopen {
		t.Fatal("credit voucher should not reopen")
	}

	stay2 := insertStay(t, sqlDB, "IPD-REOPEN-LATER")
	insertLedger(t, sqlDB, stay2, "ward", -1000, "2026-04-14 03:00:00")
	w = postVoucher(ipd, token, stay2, "2026-04-14", "issue")
	mustCode(t, w, http.StatusCreated)
	if !decodeDayVoucher(t, w).CanReopen {
		t.Fatal("latest issued day should reopen")
	}
	// Insert a later row without issue(), which would auto-credit yesterday.
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_day_vouchers (admission_id, civil_date, status, closing_mmk)
		VALUES (?, '2026-04-15', 'issued', 0)
	`, stay2); err != nil {
		t.Fatal(err)
	}
	w = postVoucher(ipd, token, stay2, "2026-04-14", "issue")
	mustCode(t, w, http.StatusOK)
	if decodeDayVoucher(t, w).CanReopen {
		t.Fatal("issued day with a later sheet should not reopen")
	}
	w = postVoucher(ipd, token, stay2, "2026-04-14", "reopen")
	mustCode(t, w, http.StatusConflict)
	if !strings.Contains(w.Body.String(), "later day voucher") {
		t.Fatalf("later voucher body %s", w.Body.String())
	}
}

func TestIpdVoucherCreditAndAutoCredit(t *testing.T) {
	sqlDB := openTestDB(t)
	setVoucherEpochDate(t, sqlDB, "2026-04-01")
	_, token := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ipd := &IPD{DB: sqlDB}
	today := localToday()

	stay := insertStay(t, sqlDB, "IPD-CREDIT")
	insertLedger(t, sqlDB, stay, "ward", -30000, "2026-04-04 03:00:00")
	before := mustMove(t, sqlDB, today).IncomeMMK
	w := postVoucher(ipd, token, stay, "2026-04-04", "issue")
	mustCode(t, w, http.StatusCreated)
	w = postVoucher(ipd, token, stay, "2026-04-04", "credit")
	mustCode(t, w, http.StatusOK)
	credited := decodeDayVoucher(t, w)
	if credited.Status != "credit" || credited.ClosingMMK != -30000 || credited.CollectionLedgerID != nil {
		t.Fatalf("credit %+v", credited)
	}
	if ledgerCount(t, sqlDB, stay, "collection") != 0 {
		t.Fatal("credit wrote cash")
	}
	if mustMove(t, sqlDB, "2026-04-04").IncomeMMK != 0 || mustMove(t, sqlDB, today).IncomeMMK != before {
		t.Fatal("credit changed income")
	}
	w = postVoucher(ipd, token, stay, "2026-04-04", "credit")
	mustCode(t, w, http.StatusOK)
	page := statementHTML(t, ipd, token, stay, "2026-04-05")
	opening := `<td class="col-no">1</td><td></td><td></td><td class="col-amt"></td><td class="col-amt">30,000</td><td class="col-amt"></td>`
	if !strings.Contains(page, opening) || !strings.Contains(page, `>Total</td><td class="col-amt">0</td><td class="col-amt">30,000</td><td class="col-amt">-30,000</td>`) {
		t.Fatalf("credit next sheet missing လိုငွေ:\n%s", page)
	}

	w = postVoucher(ipd, token, stay, "2026-04-04", "pay")
	mustCode(t, w, http.StatusOK)
	fromCredit := decodeDayVoucher(t, w)
	if fromCredit.Status != "paid" || fromCredit.CollectionLedgerID == nil {
		t.Fatalf("pay from credit %+v", fromCredit)
	}
	settled := statementHTML(t, ipd, token, stay, "2026-04-05")
	if strings.Contains(settled, opening) {
		t.Fatalf("paid shortfall still carried:\n%s", settled)
	}

	surplus := insertStay(t, sqlDB, "IPD-SURPLUS")
	insertLedger(t, sqlDB, surplus, "deposit", 5000, "2026-04-18 03:00:00")
	w = postVoucher(ipd, token, surplus, "2026-04-18", "issue")
	mustCode(t, w, http.StatusCreated)
	if decodeDayVoucher(t, w).ClosingMMK != 5000 {
		t.Fatalf("surplus close %+v", decodeDayVoucher(t, w))
	}
	w = postVoucher(ipd, token, surplus, "2026-04-18", "credit")
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(w.Body.String(), "nothing to defer") {
		t.Fatalf("credit surplus %s", w.Body.String())
	}
	w = postVoucher(ipd, token, surplus, "2026-04-18", "pay")
	mustCode(t, w, http.StatusOK)
	paidSurplus := decodeDayVoucher(t, w)
	if paidSurplus.Status != "paid" || paidSurplus.CollectionLedgerID != nil || ledgerCount(t, sqlDB, surplus, "collection") != 0 {
		t.Fatalf("surplus pay %+v", paidSurplus)
	}
	w = postVoucher(ipd, token, surplus, "2026-04-18", "unpay")
	mustCode(t, w, http.StatusOK)
	if decodeDayVoucher(t, w).Status != "issued" {
		t.Fatalf("unpay surplus %+v", decodeDayVoucher(t, w))
	}

	skipped := insertStay(t, sqlDB, "IPD-AUTO")
	insertLedger(t, sqlDB, skipped, "ward", -8000, "2026-04-15 03:00:00")
	w = postVoucher(ipd, token, skipped, "2026-04-15", "issue")
	mustCode(t, w, http.StatusCreated)
	w = postVoucher(ipd, token, skipped, "2026-04-16", "issue")
	mustCode(t, w, http.StatusCreated)
	var prevStatus string
	var prevClose int64
	if err := sqlDB.QueryRow(`SELECT status, closing_mmk FROM ipd_day_vouchers WHERE admission_id = ? AND civil_date = '2026-04-15'`, skipped).Scan(&prevStatus, &prevClose); err != nil {
		t.Fatal(err)
	}
	if prevStatus != "credit" || prevClose != -8000 {
		t.Fatalf("auto credit status=%s close=%d", prevStatus, prevClose)
	}
	autoPage := statementHTML(t, ipd, token, skipped, "2026-04-16")
	autoOpen := `<td class="col-no">1</td><td></td><td></td><td class="col-amt"></td><td class="col-amt">8,000</td><td class="col-amt"></td>`
	if !strings.Contains(autoPage, autoOpen) || !strings.Contains(autoPage, `>Total</td><td class="col-amt">0</td><td class="col-amt">8,000</td><td class="col-amt">-8,000</td>`) {
		t.Fatalf("auto-credit opening missing:\n%s", autoPage)
	}
}

func TestIpdVoucherDischargeAndGuards(t *testing.T) {
	sqlDB := openTestDB(t)
	setVoucherEpochDate(t, sqlDB, "2026-04-01")
	_, token := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ipd := &IPD{DB: sqlDB}
	today := localToday()

	stay := insertStay(t, sqlDB, "IPD-DISCHARGE")
	insertLedger(t, sqlDB, stay, "ward", -10000, "2026-04-12 03:00:00")
	insertLedger(t, sqlDB, stay, "ward", -20000, "2026-04-13 03:00:00")
	w := postVoucher(ipd, token, stay, "2026-04-12", "issue")
	mustCode(t, w, http.StatusCreated)
	w = postVoucher(ipd, token, stay, "2026-04-12", "credit")
	mustCode(t, w, http.StatusOK)
	w = postVoucher(ipd, token, stay, "2026-04-13", "issue")
	mustCode(t, w, http.StatusCreated)
	issued := decodeDayVoucher(t, w)
	if issued.Status != "issued" || issued.ClosingMMK != -30000 {
		t.Fatalf("second day %+v", issued)
	}

	before := mustMove(t, sqlDB, today).IncomeMMK
	w = doJSON(ipd, http.MethodPost, fmt.Sprintf("/api/ipd/admissions/%d/discharge", stay), token, "")
	mustCode(t, w, http.StatusOK)
	settled := decodeAdmission(t, w)
	if settled.Status != "settled" || settled.BalanceMMK == nil || *settled.BalanceMMK != 0 {
		t.Fatalf("discharge %+v", settled)
	}
	if ledgerCount(t, sqlDB, stay, "collection") != 1 {
		t.Fatal("discharge did not write one collection")
	}
	var amount int64
	if err := sqlDB.QueryRow(`SELECT amount_mmk FROM ipd_ledger WHERE admission_id = ? AND kind = 'collection'`, stay).Scan(&amount); err != nil {
		t.Fatal(err)
	}
	if amount != 30000 {
		t.Fatalf("discharge collection %d", amount)
	}
	var creditStatus, paidStatus string
	if err := sqlDB.QueryRow(`SELECT status FROM ipd_day_vouchers WHERE admission_id = ? AND civil_date = '2026-04-12'`, stay).Scan(&creditStatus); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT status FROM ipd_day_vouchers WHERE admission_id = ? AND civil_date = '2026-04-13'`, stay).Scan(&paidStatus); err != nil {
		t.Fatal(err)
	}
	if creditStatus != "credit" || paidStatus != "paid" {
		t.Fatalf("after discharge credit=%s paid=%s", creditStatus, paidStatus)
	}
	if got := mustMove(t, sqlDB, today).IncomeMMK; got-before != 30000 {
		t.Fatalf("discharge income delta %d", got-before)
	}
	w = postVoucher(ipd, token, stay, "2026-04-13", "unpay")
	mustCode(t, w, http.StatusConflict)
	if !strings.Contains(w.Body.String(), "stay is not open") {
		t.Fatalf("unpay after discharge %s", w.Body.String())
	}

	w = postVoucher(ipd, token, stay, localToday(), "issue")
	mustCode(t, w, http.StatusConflict)
	if !strings.Contains(w.Body.String(), "stay is not open") {
		t.Fatalf("today issue after discharge %s", w.Body.String())
	}
	w = postVoucher(ipd, token, 99999, "2026-04-01", "issue")
	mustCode(t, w, http.StatusNotFound)
	missing := insertStay(t, sqlDB, "IPD-NO-VOUCHER")
	w = postVoucher(ipd, token, missing, "2026-04-01", "pay")
	mustCode(t, w, http.StatusNotFound)
	if !strings.Contains(w.Body.String(), "voucher not found") {
		t.Fatalf("missing voucher %s", w.Body.String())
	}
	w = postVoucher(ipd, token, stay, "nope", "issue")
	mustCode(t, w, http.StatusBadRequest)
}

func TestIpdVoucherCloseTodayAndGet(t *testing.T) {
	sqlDB := openTestDB(t)
	setVoucherEpochDate(t, sqlDB, "2026-04-01")
	_, token := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ipd := &IPD{DB: sqlDB}
	today := localToday()
	tomorrow, ok := nextCivilDate(today)
	if !ok {
		t.Fatal("tomorrow")
	}

	stay := insertStay(t, sqlDB, "IPD-CLOSE-TODAY")
	insertLedger(t, sqlDB, stay, "ward", -15000, "2026-04-20 03:00:00")
	w := postVoucher(ipd, token, stay, "2026-04-20", "issue")
	mustCode(t, w, http.StatusCreated)
	w = postVoucher(ipd, token, stay, "2026-04-20", "credit")
	mustCode(t, w, http.StatusOK)

	getPath := fmt.Sprintf("/api/ipd/admissions/%d/vouchers/%s", stay, today)
	w = doJSON(ipd, http.MethodGet, getPath, token, "")
	mustCode(t, w, http.StatusNotFound)
	if !strings.Contains(w.Body.String(), "voucher not found") {
		t.Fatalf("missing today get %s", w.Body.String())
	}

	w = postVoucher(ipd, token, stay, today, "issue")
	mustCode(t, w, http.StatusCreated)
	issued := decodeDayVoucher(t, w)
	if issued.Status != "issued" || issued.CivilDate != today {
		t.Fatalf("today issue %+v", issued)
	}

	w = doJSON(ipd, http.MethodGet, getPath, token, "")
	mustCode(t, w, http.StatusOK)
	got := decodeDayVoucher(t, w)
	if got.ID != issued.ID || got.Status != "issued" {
		t.Fatalf("today get %+v", got)
	}

	w = postVoucher(ipd, token, stay, tomorrow, "issue")
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(w.Body.String(), "has not started") {
		t.Fatalf("tomorrow issue %s", w.Body.String())
	}
}

func TestIpdVoucherEpochBackdateMigration(t *testing.T) {
	sqlDB := openTestDB(t)

	var applied int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '042_ipd_voucher_epoch_backdate'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("042 not recorded: %d", applied)
	}

	var startedOn string
	if err := sqlDB.QueryRow(`SELECT started_on FROM ipd_voucher_epoch WHERE id = 1`).Scan(&startedOn); err != nil {
		t.Fatal(err)
	}
	tomorrow := time.Now().In(yangon).AddDate(0, 0, 1).Format("2006-01-02")
	if tomorrow > "2026-10-30" && startedOn != "2026-10-30" {
		t.Fatalf("after 042 started_on=%q want 2026-10-30", startedOn)
	}

	setVoucherEpochDate(t, sqlDB, "2026-11-01")
	if _, err := sqlDB.Exec(`
		UPDATE ipd_voucher_epoch
		SET started_on = '2026-10-30'
		WHERE id = 1 AND started_on > '2026-10-30'
	`); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT started_on FROM ipd_voucher_epoch WHERE id = 1`).Scan(&startedOn); err != nil {
		t.Fatal(err)
	}
	if startedOn != "2026-10-30" {
		t.Fatalf("backdate from Nov 1 got %q", startedOn)
	}

	setVoucherEpochDate(t, sqlDB, "2026-10-01")
	if _, err := sqlDB.Exec(`
		UPDATE ipd_voucher_epoch
		SET started_on = '2026-10-30'
		WHERE id = 1 AND started_on > '2026-10-30'
	`); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT started_on FROM ipd_voucher_epoch WHERE id = 1`).Scan(&startedOn); err != nil {
		t.Fatal(err)
	}
	if startedOn != "2026-10-01" {
		t.Fatalf("must not move epoch later: got %q", startedOn)
	}
}

func TestIpdOct30ChargesIncomeOnPayDay(t *testing.T) {
	sqlDB := openTestDB(t)
	setVoucherEpochDate(t, sqlDB, "2026-10-30")
	_, token := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ipd := &IPD{DB: sqlDB}
	today := localToday()

	stay := insertStay(t, sqlDB, "IPD-OCT30-PAY")
	insertLedger(t, sqlDB, stay, "ward", -30000, "2026-10-30 03:00:00")
	insertLedger(t, sqlDB, stay, "charge", -20000, "2026-10-30 04:00:00")

	oct30 := mustMove(t, sqlDB, "2026-10-30")
	if oct30.IncomeMMK != 0 || oct30.IPDEarned.EarnedMMK != 0 {
		t.Fatalf("unpaid Oct 30 charges counted as income: income=%d earned=%d lines=%+v",
			oct30.IncomeMMK, oct30.IPDEarned.EarnedMMK, oct30.IPDEarned.Lines)
	}
	for _, line := range oct30.IPDEarned.Lines {
		if line.Kind == "ward" || line.Kind == "charge" {
			t.Fatalf("Oct 30 earned still has charge %+v", line)
		}
	}

	w := postVoucher(ipd, token, stay, "2026-10-30", "issue")
	mustCode(t, w, http.StatusCreated)
	issued := decodeDayVoucher(t, w)
	if issued.ClosingMMK != -50000 {
		t.Fatalf("closing %+v", issued)
	}

	before := mustMove(t, sqlDB, today).IncomeMMK
	w = postVoucher(ipd, token, stay, "2026-10-30", "pay")
	mustCode(t, w, http.StatusOK)
	paid := decodeDayVoucher(t, w)
	if paid.Status != "paid" || paid.CollectionLedgerID == nil {
		t.Fatalf("paid %+v", paid)
	}
	if got := mustMove(t, sqlDB, today).IncomeMMK; got-before != 50000 {
		t.Fatalf("pay-day income delta %d want 50000", got-before)
	}
	if mustMove(t, sqlDB, "2026-10-30").IncomeMMK != 0 {
		t.Fatal("pay booked income on the voucher day")
	}
	payDay := mustMove(t, sqlDB, today)
	found := false
	for _, line := range payDay.IPDEarned.Lines {
		if line.Kind == "collection" && line.AmountMMK == 50000 {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("pay-day earned missing collection: %+v", payDay.IPDEarned.Lines)
	}
}

func setVoucherEpochDate(t *testing.T, db *sql.DB, startedOn string) {
	t.Helper()
	res, err := db.Exec(`UPDATE ipd_voucher_epoch SET started_on = ? WHERE id = 1`, startedOn)
	if err != nil {
		t.Fatal(err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("epoch rows %d", n)
	}
}

func TestIpdYesterdayVoucherOnList(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ipd := &IPD{DB: sqlDB}
	yesterday, ok := previousCivilDate(localToday())
	if !ok {
		t.Fatal("yesterday")
	}
	stay := insertStay(t, sqlDB, "IPD-YDAY")
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_day_vouchers (admission_id, civil_date, status, closing_mmk)
		VALUES (?, ?, 'credit', -12000)
	`, stay, yesterday); err != nil {
		t.Fatal(err)
	}
	plain := insertStay(t, sqlDB, "IPD-YDAY-NONE")

	w := doJSON(ipd, http.MethodGet, "/api/ipd/admissions?status=open", token, "")
	mustCode(t, w, http.StatusOK)
	var body struct {
		Admissions []ipdAdmission `json:"admissions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	var found, none bool
	for _, row := range body.Admissions {
		if row.ID == stay {
			found = true
			if row.YesterdayVoucherStatus != "credit" {
				t.Fatalf("list status %q", row.YesterdayVoucherStatus)
			}
		}
		if row.ID == plain {
			none = true
			if row.YesterdayVoucherStatus != "" {
				t.Fatalf("blank stay status %q", row.YesterdayVoucherStatus)
			}
		}
	}
	if !found || !none {
		t.Fatalf("list missing stays found=%v none=%v", found, none)
	}

	w = doJSON(ipd, http.MethodGet, fmt.Sprintf("/api/ipd/admissions/%d", stay), token, "")
	mustCode(t, w, http.StatusOK)
	var detail ipdAdmission
	if err := json.Unmarshal(w.Body.Bytes(), &detail); err != nil {
		t.Fatal(err)
	}
	if detail.YesterdayVoucherStatus != "credit" {
		t.Fatalf("detail status %q", detail.YesterdayVoucherStatus)
	}
}

func mustMove(t *testing.T, db *sql.DB, date string) *cashMovement {
	t.Helper()
	move, err := buildCashMovement(db, date)
	if err != nil {
		t.Fatal(err)
	}
	return move
}

func postVoucher(h http.Handler, token string, admissionID int64, date, action string) *httptest.ResponseRecorder {
	path := fmt.Sprintf("/api/ipd/admissions/%d/vouchers/%s/%s", admissionID, date, action)
	return doJSON(h, http.MethodPost, path, token, "")
}

func decodeDayVoucher(t *testing.T, w *httptest.ResponseRecorder) dayVoucher {
	t.Helper()
	var v dayVoucher
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("voucher json: %v body %s", err, w.Body.String())
	}
	return v
}

func statementHTML(t *testing.T, ipd *IPD, token string, admissionID int64, date string) string {
	t.Helper()
	path := fmt.Sprintf("/api/ipd/admissions/%d/statement", admissionID)
	if date != "" {
		path += "?date=" + date
	}
	w := doJSON(ipd, http.MethodGet, path, token, "")
	mustCode(t, w, http.StatusOK)
	return w.Body.String()
}

func ledgerCount(t *testing.T, db *sql.DB, admissionID int64, kind string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT COUNT(1) FROM ipd_ledger WHERE admission_id = ? AND kind = ?`, admissionID, kind).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
