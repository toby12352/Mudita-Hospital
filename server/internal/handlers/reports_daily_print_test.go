package handlers

import (
	"database/sql"
	"net/http"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestRenderDashboardDailyHTMLIPDCarry(t *testing.T) {
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}
	move := &cashMovement{
		Date:      "2026-04-03",
		IncomeMMK: 100000,
		Desk:      &cashReport{},
		IPDEarned: &ipdEarnedReport{
			EarnedMMK: 100000,
			Lines: []ipdCashLine{{
				Kind: "deposit", AdmissionNo: "IPD-000010", Patient: "Daw New", AmountMMK: 100000,
			}},
		},
		IPD:          &ipdCashReport{},
		ExpenseLines: []expenseCashLine{},
	}
	carry := []ipdPrintCarryRow{
		{Kind: "ပိုငွေ", AdmissionNo: "IPD-000001", Patient: "Daw Surplus", AmountMMK: 20000},
		{Kind: "လိုငွေ", AdmissionNo: "IPD-000002", Patient: "U Short", AmountMMK: -30000},
	}
	income := renderDashboardDailyHTML(hosp, move, "income", carry)
	surplusIdx := strings.Index(income, "ပိုငွေ")
	dueIdx := strings.Index(income, "လိုငွေ")
	depositIdx := strings.Index(income, ">deposit<")
	if surplusIdx < 0 || dueIdx < 0 || depositIdx < 0 {
		t.Fatalf("income print missing carry or deposit:\n%s", income)
	}
	if !(surplusIdx < dueIdx && dueIdx < depositIdx) {
		t.Fatalf("carry rows must print before cash lines: surplus=%d due=%d deposit=%d", surplusIdx, dueIdx, depositIdx)
	}
	for _, want := range []string{
		"IPD-000001",
		"Daw Surplus",
		"20,000",
		"IPD-000002",
		"U Short",
		"-30,000",
		"IPD-000010",
		"100,000",
		"Total income",
		"100,000 MMK",
	} {
		if !strings.Contains(income, want) {
			t.Fatalf("income print missing %q:\n%s", want, income)
		}
	}
	// Subtotal is cash income only; bring-forward must not inflate it to 90,000.
	if !strings.Contains(income, `">Subtotal</td><td class="num">100,000</td>`) {
		t.Fatalf("subtotal must ignore carry:\n%s", income)
	}
	if strings.Contains(income, "90,000") {
		t.Fatalf("carry must not change income totals:\n%s", income)
	}

	carryOnly := renderDashboardDailyHTML(hosp, &cashMovement{
		Date: "2026-04-03", Desk: &cashReport{}, IPDEarned: &ipdEarnedReport{},
		IPD: &ipdCashReport{}, ExpenseLines: []expenseCashLine{},
	}, "income", carry)
	if !strings.Contains(carryOnly, "<h3>IPD</h3>") || !strings.Contains(carryOnly, "ပိုငွေ") {
		t.Fatalf("carry-only day must still print IPD:\n%s", carryOnly)
	}
	if !strings.Contains(carryOnly, `">Subtotal</td><td class="num">0</td>`) {
		t.Fatalf("carry-only subtotal must be 0:\n%s", carryOnly)
	}

	expense := renderDashboardDailyHTML(hosp, move, "expense", carry)
	for _, hide := range []string{"ပိုငွေ", "လိုငွေ", "IPD-000001", "Daw Surplus"} {
		if strings.Contains(expense, hide) {
			t.Fatalf("expense print leaked %q:\n%s", hide, expense)
		}
	}
}

func TestLoadIpdDailyPrintCarry(t *testing.T) {
	sqlDB := openTestDB(t)
	const day = "2026-04-03"
	prev := "2026-04-02"
	start, _, ok := yangonDayUTCRange(day)
	if !ok {
		t.Fatal("day range")
	}

	surplus := insertStay(t, sqlDB, "IPD-CARRY-SURPLUS")
	shortfall := insertStay(t, sqlDB, "IPD-CARRY-DUE")
	issued := insertStay(t, sqlDB, "IPD-CARRY-ISSUED")
	paidShort := insertStay(t, sqlDB, "IPD-CARRY-PAID")
	zero := insertStay(t, sqlDB, "IPD-CARRY-ZERO")
	deleted := insertStay(t, sqlDB, "IPD-CARRY-DEL")
	oldDischarge := insertStay(t, sqlDB, "IPD-CARRY-OLD")
	todayDischarge := insertStay(t, sqlDB, "IPD-CARRY-TODAY")

	insertVoucher := func(admissionID int64, status string, closing int64) {
		t.Helper()
		if _, err := sqlDB.Exec(`
			INSERT INTO ipd_day_vouchers (admission_id, civil_date, status, closing_mmk)
			VALUES (?, ?, ?, ?)
		`, admissionID, prev, status, closing); err != nil {
			t.Fatal(err)
		}
	}
	insertVoucher(surplus, "paid", 20000)
	insertVoucher(shortfall, "credit", -30000)
	insertVoucher(issued, "issued", -5000)
	insertVoucher(paidShort, "paid", -4000)
	insertVoucher(zero, "paid", 0)
	insertVoucher(deleted, "credit", -8000)
	insertVoucher(oldDischarge, "paid", 15000)
	insertVoucher(todayDischarge, "credit", -9000)

	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET status = 'deleted' WHERE id = ?`, deleted); err != nil {
		t.Fatal(err)
	}
	// Discharged before report day (UTC stamp just before Yangon midnight).
	beforeStart := "2026-04-01 17:00:00"
	if _, err := sqlDB.Exec(`
		UPDATE ipd_admissions
		SET status = 'settled', discharged_at = ?
		WHERE id = ?
	`, beforeStart, oldDischarge); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		UPDATE ipd_admissions
		SET status = 'settled', discharged_at = ?
		WHERE id = ?
	`, start, todayDischarge); err != nil {
		t.Fatal(err)
	}

	rows, err := loadIpdDailyPrintCarry(sqlDB, day)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("expected surplus, shortfall, today-discharge; got %+v", rows)
	}
	want := []ipdPrintCarryRow{
		{Kind: "လိုငွေ", AdmissionNo: "IPD-CARRY-DUE", Patient: "IPD-CARRY-DUE", AmountMMK: -30000},
		{Kind: "ပိုငွေ", AdmissionNo: "IPD-CARRY-SURPLUS", Patient: "IPD-CARRY-SURPLUS", AmountMMK: 20000},
		{Kind: "လိုငွေ", AdmissionNo: "IPD-CARRY-TODAY", Patient: "IPD-CARRY-TODAY", AmountMMK: -9000},
	}
	for i, row := range want {
		if rows[i] != row {
			t.Fatalf("row %d: got %+v want %+v", i, rows[i], row)
		}
	}
}

func sampleDailyMove() (*hospitalSettings, *cashMovement) {
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}
	move := &cashMovement{
		Date:       "2026-10-28",
		IncomeMMK:  270000,
		ExpenseMMK: -5000,
		NetCashMMK: 435000,
		Desk: &cashReport{Lines: []cashLine{
			{Source: "OT", BillNo: "OTB-000010", Patient: "Desk Verify Patient", Doctor: "Dr. Aung", Remark: "OT follow-up", PaidAt: "2026-10-28 07:18:55", TotalMMK: 140000},
			{Source: "Pharmacy", BillNo: "PH-000015", Patient: "Daw Hla", Remark: "Chronic refill", PaidAt: "2026-10-28 17:28:00", TotalMMK: 0},
		}},
		IPDEarned: &ipdEarnedReport{
			EarnedMMK: 130000,
			Lines: []ipdCashLine{
				{Kind: "ward", AdmissionNo: "IPD-000003", Patient: "Daw Hla", Note: "Bed day", AmountMMK: -35000},
				{Kind: "charge", AdmissionNo: "IPD-000003", Patient: "Daw Hla", Note: "Dressing", AmountMMK: -95000},
			},
		},
		IPD: &ipdCashReport{Lines: []ipdCashLine{
			{Kind: "deposit", AdmissionNo: "IPD-000003", Patient: "Daw Hla", AmountMMK: 300000},
		}},
		OpenStays: &ipdOpenStayReport{
			OwedToPatientsMMK: 170000,
			Stays: []ipdOpenStayRow{
				{AdmissionNo: "IPD-000003", Patient: "Daw Hla", BalanceMMK: 170000},
			},
		},
		ExpenseLines: []expenseCashLine{
			{BillNo: "EXP-000001", Portal: "pharmacy", Name: "Supplies", Remark: "Gloves restock", AmountMMK: -5000, PaidAt: "2026-10-28 12:00:00"},
		},
	}
	return hosp, move
}

func TestRenderDashboardDailyHTMLLayout(t *testing.T) {
	hosp, move := sampleDailyMove()
	body := renderDashboardDailyHTML(hosp, move, "overall", nil)
	for _, want := range []string{
		`class="a4-logo daily-cover-logo"`,
		"data:image/png;base64,",
		`class="daily-cover"`,
		`class="daily-cover-letterhead"`,
		`class="daily-cover-date"`,
		`class="daily-cover-cashbook"`,
		`class="print-credit"`,
		"Software by TAT",
		"နေ့စဉ် ဝင်ငွေ",
		"နေ့စဉ် ထွက်ငွေ",
		"Daily CashBook - Oct 28, 2026",
		"Date: Oct 28, 2026",
		`class="daily-opening"`,
		"Opening Balance:",
		`class="daily-opening-box"`,
		"<h3>OT</h3>",
		"<h3>IPD</h3>",
		"<h3>Pharmacy</h3>",
		"OTB-000010",
		"PH-000015",
		"35,000",
		"95,000",
		"EXP-000001",
		"Total income",
		"Total expenses",
		"Difference",
		"265,000 MMK",
		`class="daily-cashbook"`,
		"ဝင်ငွေ",
		"ပြန်အင်းငွေ",
		"ထွက်ငွေ",
		"အပ်ငွေ",
		"လက်ကျန်ငွေ",
		"-5,000 MMK",
		`class="daily-page-break"`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("daily print missing %q", want)
		}
	}
	for _, hide := range []string{
		"Printed from Mudita Hospital",
		"Mudita Dashboard",
		"Daily Cash Report",
		"Expenses Cash Report",
		"<h3>Desk</h3>",
		"IPD gains",
		"IPD cash drawer",
		"IPD open stays",
		"Held for patients",
		"Net:",
		"<h3>OPD</h3>",
		"<h3>Lab</h3>",
	} {
		if strings.Contains(body, hide) {
			t.Fatalf("overall print leaked %q", hide)
		}
	}
	if strings.Count(body, `class="daily-cashbook"`) != 1 {
		t.Fatalf("expected 1 cover cashbook table, got %d", strings.Count(body, `class="daily-cashbook"`))
	}
	// Cover: Opening Balance, two ပြန်အင်းငွေ, အပ်ငွေ, လက်ကျန်ငွေ blank.
	if strings.Count(body, `class="blank"`) != 5 {
		t.Fatalf("expected 5 blank cashbook cells, got %d", strings.Count(body, `class="blank"`))
	}
	if strings.Count(body, "ပြန်အင်းငွေ") != 2 {
		t.Fatalf("expected 2 ပြန်အင်းငွေ rows, got %d", strings.Count(body, "ပြန်အင်းငွေ"))
	}
	if strings.Count(body, `class="daily-page-break"`) != 2 {
		t.Fatalf("expected 2 page breaks, got %d", strings.Count(body, `class="daily-page-break"`))
	}
	// OT, IPD, Pharmacy income + Pharmacy expense.
	if strings.Count(body, `<section class="block">`) != 4 {
		t.Fatalf("expected 4 titled sections, got %d; body snippet: %s", strings.Count(body, `<section class="block">`), body[:400])
	}
}

func TestRenderDashboardDailyHTMLIncome(t *testing.T) {
	hosp, move := sampleDailyMove()
	body := renderDashboardDailyHTML(hosp, move, "income", nil)
	for _, want := range []string{
		"Income Cash Report",
		"Date: Oct 28, 2026",
		"Total income",
		"270,000 MMK",
		"<h3>OT</h3>",
		"<h3>IPD</h3>",
		"<h3>Pharmacy</h3>",
		"OTB-000010",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("income print missing %q", want)
		}
	}
	for _, hide := range []string{
		"Expense report",
		"IPD cash drawer",
		"IPD open stays",
		"EXP-000001",
		"Difference",
		"Net:",
		`class="daily-page-break"`,
	} {
		if strings.Contains(body, hide) {
			t.Fatalf("income print leaked %q", hide)
		}
	}
	if strings.Count(body, `<section class="block">`) != 3 {
		t.Fatalf("expected 3 income sections, got %d", strings.Count(body, `<section class="block">`))
	}
}

func TestRenderDashboardDailyHTMLExpense(t *testing.T) {
	hosp, move := sampleDailyMove()
	body := renderDashboardDailyHTML(hosp, move, "expense", nil)
	for _, want := range []string{
		"Expenses Cash Report",
		"Date: Oct 28, 2026",
		"Total expenses",
		"5,000 MMK",
		"<h3>Pharmacy</h3>",
		"EXP-000001",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("expense print missing %q", want)
		}
	}
	if strings.Contains(body, "-5,000") {
		t.Fatalf("expense print should show positive amounts:\n%s", body)
	}
	for _, hide := range []string{
		"Income report",
		"<h3>Desk</h3>",
		"<h3>OT</h3>",
		"OTB-000010",
		"IPD gains",
		"<h3>IPD</h3>",
		"IPD cash drawer",
		"IPD open stays",
		"Difference",
		"Net:",
	} {
		if strings.Contains(body, hide) {
			t.Fatalf("expense print leaked %q", hide)
		}
	}
	if strings.Count(body, `<section class="block">`) != 1 {
		t.Fatalf("expected 1 expense section, got %d", strings.Count(body, `<section class="block">`))
	}
}

func TestIPDIncomePrintKeepsCashSign(t *testing.T) {
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}
	move := &cashMovement{
		Date:      "2026-04-02",
		IncomeMMK: 100000,
		Desk:      &cashReport{},
		IPDEarned: &ipdEarnedReport{
			EarnedMMK: 100000,
			Lines: []ipdCashLine{{
				Kind: "deposit", AdmissionNo: "IPD-000001", Patient: "Daw Cash", AmountMMK: 100000,
			}},
		},
		IPD:          &ipdCashReport{},
		ExpenseLines: []expenseCashLine{},
	}
	body := renderDashboardDailyHTML(hosp, move, "income", nil)
	if !strings.Contains(body, "100,000") || strings.Contains(body, "-100,000") {
		t.Fatalf("deposit should print as income:\n%s", body)
	}
}

func TestRenderDashboardDailyHTMLRemarks(t *testing.T) {
	hosp, move := sampleDailyMove()
	income := renderDashboardDailyHTML(hosp, move, "income", nil)
	for _, want := range []string{
		"<th>Remark</th>",
		"OT follow-up",
		"Chronic refill",
		"Bed day",
		"Dressing",
	} {
		if !strings.Contains(income, want) {
			t.Fatalf("income print missing remark %q", want)
		}
	}
	expense := renderDashboardDailyHTML(hosp, move, "expense", nil)
	for _, want := range []string{
		"<th>Remark</th>",
		"Gloves restock",
	} {
		if !strings.Contains(expense, want) {
			t.Fatalf("expense print missing remark %q", want)
		}
	}
}

func TestRenderDashboardDailyDetailsHTML(t *testing.T) {
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}
	vouchers := []detailVoucher{
		{
			Portal:  "OPD",
			BillNo:  "OPD-000100",
			Party:   "U Aung",
			Doctor:  "Dr. Hla",
			Remark:  "Fever",
			PaidAt:  "2026-10-28 09:00:00",
			CashMMK: 5000,
			Lines: []detailLine{
				{Particular: "SVC01 — Consultation", QtyLabel: "1", RateMMK: 5000, AmountMMK: 5000},
			},
		},
		{
			Portal:  "Pharmacy",
			Expense: true,
			BillNo:  "EXP-000050",
			Party:   "Supplier Co",
			Remark:  "Monthly stock",
			PaidAt:  "2026-10-28 14:00:00",
			CashMMK: -3000,
			Lines: []detailLine{
				{Particular: "Gloves", QtyLabel: "2 Box", RateMMK: -1500, AmountMMK: -3000},
			},
		},
	}
	body := renderDashboardDailyDetailsHTML(nil, hosp, vouchers, "2026-10-28", "")
	for _, want := range []string{
		`class="daily-cover"`,
		`class="daily-cover-letterhead"`,
		`class="daily-cashbook"`,
		"Software by TAT",
		"နေ့စဉ် ဝင်ငွေ",
		"နေ့စဉ် ထွက်ငွေ",
		"Daily CashBook - Oct 28, 2026",
		"Date: Oct 28, 2026",
		"ပြန်အင်းငွေ",
		`@page{size:A4`,
		"<h3>OPD</h3>",
		"OPD-000100",
		"U Aung",
		"Remark: Fever",
		"SVC01 — Consultation",
		">1<",
		"5,000",
		"Voucher total",
		`class="daily-page-break"`,
		"EXP-000050",
		"Gloves",
		"2 Box",
		"-3,000",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("details print missing %q", want)
		}
	}
	for _, hide := range []string{
		"All Bill Details",
		"Expense Bill Details",
		"Total remaining balance",
		"IPD cash drawer",
		"IPD open stays",
		"TO-HIDDEN",
		"deposit",
	} {
		if strings.Contains(body, hide) {
			t.Fatalf("details print leaked %q", hide)
		}
	}
}

func TestBuildDailyBillDetailsSkipsTransfersAndLoadsLines(t *testing.T) {
	sqlDB := openTestDB(t)
	const day = "2026-10-29"
	if _, err := sqlDB.Exec(`
		INSERT INTO opd_bills (
			bill_no, patient_name, doctor_name, description, status, total_mmk,
			discount_mmk, paid_at, collected_cash
		) VALUES (
			'OPD-DET-1', 'Detail Patient', 'Dr. Detail', 'Walk-in note', 'paid', 2500,
			0, ?, 1
		)
	`, day+" 10:00:00"); err != nil {
		t.Fatal(err)
	}
	var opdID int64
	if err := sqlDB.QueryRow(`SELECT id FROM opd_bills WHERE bill_no = 'OPD-DET-1'`).Scan(&opdID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO bill_lines (bill_id, line_type, code, description, qty, unit_price_mmk, line_total_mmk, sort_order)
		VALUES (?, 'service', 'S1', 'Dressing', 1, 2500, 2500, 0)
	`, opdID); err != nil {
		t.Fatal(err)
	}
	insertPharmacyCash(t, sqlDB, "TO-DET-SKIP", 9000, "paid", day+" 11:00:00", "", 1)
	insertExpense(t, sqlDB, "EXP-DET-1", "pharmacy", "Vendor", "paid", 1000, 0, day+" 12:00:00", "", "")
	var expID int64
	if err := sqlDB.QueryRow(`SELECT id FROM expense_bills WHERE bill_no = 'EXP-DET-1'`).Scan(&expID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		UPDATE expense_bills SET description = 'Restock gloves' WHERE id = ?
	`, expID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO expense_bill_lines (bill_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order)
		VALUES (?, 'G1', 'Gloves', 2, 500, 1000, 0)
	`, expID); err != nil {
		t.Fatal(err)
	}
	stay := insertStay(t, sqlDB, "IPD-DET-1")
	insertLedger(t, sqlDB, stay, "deposit", 50000, day+" 03:00:00")

	vouchers, err := buildDailyBillDetails(sqlDB, day)
	if err != nil {
		t.Fatal(err)
	}
	if len(vouchers) != 2 {
		t.Fatalf("expected OPD + expense vouchers, got %+v", vouchers)
	}
	if vouchers[0].BillNo != "OPD-DET-1" || vouchers[0].Remark != "Walk-in note" || len(vouchers[0].Lines) != 1 {
		t.Fatalf("opd voucher %+v", vouchers[0])
	}
	if vouchers[0].Lines[0].Particular != "S1 — Dressing" || vouchers[0].CashMMK != 2500 {
		t.Fatalf("opd line %+v", vouchers[0].Lines[0])
	}
	if vouchers[1].BillNo != "EXP-DET-1" || !vouchers[1].Expense || vouchers[1].Remark != "Restock gloves" {
		t.Fatalf("expense voucher %+v", vouchers[1])
	}
	if vouchers[1].CashMMK != -1000 || len(vouchers[1].Lines) != 1 || vouchers[1].Lines[0].AmountMMK != -1000 {
		t.Fatalf("expense lines %+v cash %d", vouchers[1].Lines, vouchers[1].CashMMK)
	}

	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	dash := &Dashboard{DB: sqlDB}
	printed := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+day+"&kind=details", adminTok, "")
	mustCode(t, printed, http.StatusOK)
	body := printed.Body.String()
	for _, want := range []string{"OPD-DET-1", "S1 — Dressing", "Walk-in note", "EXP-DET-1", "Gloves", "Restock gloves"} {
		if !strings.Contains(body, want) {
			t.Fatalf("details endpoint missing %q: %s", want, body)
		}
	}
	for _, hide := range []string{"TO-DET-SKIP", "IPD-DET-1", "deposit"} {
		if strings.Contains(body, hide) {
			t.Fatalf("details endpoint leaked %q", hide)
		}
	}

	incomePrinted := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+day+"&kind=income", adminTok, "")
	mustCode(t, incomePrinted, http.StatusOK)
	if !strings.Contains(incomePrinted.Body.String(), "Walk-in note") {
		t.Fatalf("income endpoint missing remark: %s", incomePrinted.Body.String())
	}
	expensePrinted := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+day+"&kind=expense", adminTok, "")
	mustCode(t, expensePrinted, http.StatusOK)
	if !strings.Contains(expensePrinted.Body.String(), "Restock gloves") {
		t.Fatalf("expense endpoint missing remark: %s", expensePrinted.Body.String())
	}
}

func TestDetailScopeBalance(t *testing.T) {
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}
	vouchers := []detailVoucher{
		{Portal: "OPD", BillNo: "OPD-SCOPE", CashMMK: 5000, Lines: []detailLine{{Particular: "Consult", QtyLabel: "1", AmountMMK: 5000}}},
		{Portal: "Pharmacy", Expense: true, BillNo: "EXP-SCOPE", CashMMK: -3000, Lines: []detailLine{{Particular: "Gloves", QtyLabel: "1", AmountMMK: -3000}}},
	}
	income := renderDashboardDailyDetailsHTML(nil, hosp, vouchers, "2026-04-20", "income")
	if !strings.Contains(income, "Income Bill Details") || !strings.Contains(income, "OPD-SCOPE") || !strings.Contains(income, "Total income") {
		t.Fatalf("income scope missing bills or total:\n%s", income)
	}
	if strings.Contains(income, "EXP-SCOPE") || strings.Contains(income, "Total remaining balance") || strings.Contains(income, "Expense Bill Details") {
		t.Fatalf("income scope leaked expenses:\n%s", income)
	}
	if !strings.Contains(income, ">5,000 MMK</td>") {
		t.Fatalf("income total: %s", income)
	}

	expense := renderDashboardDailyDetailsHTML(nil, hosp, vouchers, "2026-04-20", "expense")
	if !strings.Contains(expense, "Expense Bill Details") || !strings.Contains(expense, "EXP-SCOPE") || !strings.Contains(expense, "Total expenses") {
		t.Fatalf("expense scope missing bills or total:\n%s", expense)
	}
	if strings.Contains(expense, "OPD-SCOPE") || strings.Contains(expense, "Total remaining balance") {
		t.Fatalf("expense scope leaked income:\n%s", expense)
	}
	if !strings.Contains(expense, ">3,000 MMK</td>") {
		t.Fatalf("expense total: %s", expense)
	}

	all := renderDashboardDailyDetailsHTML(nil, hosp, vouchers, "2026-04-20", "all")
	for _, want := range []string{
		`class="daily-cover"`,
		`class="daily-cashbook"`,
		"နေ့စဉ် ဝင်ငွေ",
		"နေ့စဉ် ထွက်ငွေ",
		"OPD-SCOPE",
		"EXP-SCOPE",
		"5,000 MMK",
		"-3,000 MMK",
	} {
		if !strings.Contains(all, want) {
			t.Fatalf("all scope missing %q:\n%s", want, all)
		}
	}
	for _, hide := range []string{"All Bill Details", "Total income", "Total expenses", "Total remaining balance"} {
		if strings.Contains(all, hide) {
			t.Fatalf("all scope leaked %q:\n%s", hide, all)
		}
	}
}

func TestPaidIpdStatementsOnBillDetails(t *testing.T) {
	sqlDB := openTestDB(t)
	const day = "2026-04-20"
	const payAt = "2026-04-20 02:00:00"
	const otherDay = "2026-04-19 02:00:00"

	if _, err := sqlDB.Exec(`
		INSERT INTO opd_bills (
			bill_no, patient_name, doctor_name, description, status, total_mmk,
			discount_mmk, paid_at, collected_cash
		) VALUES (
			'OPD-IPD-DAY', 'Desk Patient', 'Dr. Day', '', 'paid', 2500,
			0, ?, 1
		)
	`, day+" 10:00:00"); err != nil {
		t.Fatal(err)
	}
	var opdID int64
	if err := sqlDB.QueryRow(`SELECT id FROM opd_bills WHERE bill_no = 'OPD-IPD-DAY'`).Scan(&opdID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO bill_lines (bill_id, line_type, code, description, qty, unit_price_mmk, line_total_mmk, sort_order)
		VALUES (?, 'service', 'S1', 'Consult', 1, 2500, 2500, 0)
	`, opdID); err != nil {
		t.Fatal(err)
	}
	insertExpense(t, sqlDB, "EXP-IPD-DAY", "pharmacy", "Vendor", "paid", 1000, 0, day+" 12:00:00", "", "")

	short := insertStay(t, sqlDB, "IPD-PAY-SHORT")
	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET room_no = '12' WHERE id = ?`, short); err != nil {
		t.Fatal(err)
	}
	insertLedger(t, sqlDB, short, "deposit", 5000, "2026-04-19 02:00:00")
	insertLedger(t, sqlDB, short, "ward", -10000, "2026-04-19 03:00:00")
	insertDayVoucher(t, sqlDB, short, "2026-04-19", "paid", -5000, payAt)

	surplus := insertStay(t, sqlDB, "IPD-PAY-SURPLUS")
	insertLedger(t, sqlDB, surplus, "deposit", 1000, "2026-04-20 01:00:00")
	insertDayVoucher(t, sqlDB, surplus, day, "paid", 1000, payAt)

	stuck := insertStay(t, sqlDB, "IPD-PAY-STUCK")
	insertDayVoucher(t, sqlDB, stuck, "2026-04-19", "issued", -1000, "")
	insertLedger(t, sqlDB, stuck, "ward", -2000, "2026-04-20 01:30:00")
	insertDayVoucher(t, sqlDB, stuck, day, "paid", 0, payAt)

	issued := insertStay(t, sqlDB, "IPD-PAY-ISSUED")
	insertDayVoucher(t, sqlDB, issued, day, "issued", -1000, payAt)
	credit := insertStay(t, sqlDB, "IPD-PAY-CREDIT")
	insertDayVoucher(t, sqlDB, credit, day, "credit", -1000, payAt)
	other := insertStay(t, sqlDB, "IPD-PAY-OTHER")
	insertDayVoucher(t, sqlDB, other, "2026-04-18", "paid", -4000, otherDay)
	deleted := insertStay(t, sqlDB, "IPD-PAY-DEL")
	insertDayVoucher(t, sqlDB, deleted, day, "paid", -9000, payAt)
	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET status = 'deleted' WHERE id = ?`, deleted); err != nil {
		t.Fatal(err)
	}

	vouchers, err := buildDailyBillDetails(sqlDB, day)
	if err != nil {
		t.Fatal(err)
	}
	var sawShort, sawSurplus, sawStuck bool
	for _, v := range vouchers {
		switch v.BillNo {
		case "IPD-PAY-SHORT":
			sawShort = true
			if v.Expense || v.CashMMK != 5000 || !v.IPDCollected || v.Doctor != "12" {
				t.Fatalf("shortfall voucher %+v", v)
			}
		case "IPD-PAY-SURPLUS":
			sawSurplus = true
			if v.CashMMK != 0 || !v.IPDCollected {
				t.Fatalf("surplus collected %d", v.CashMMK)
			}
		case "IPD-PAY-STUCK":
			sawStuck = true
			if v.CashMMK != 0 || !v.IPDCollected {
				t.Fatalf("stuck previous issued should still print: %+v", v)
			}
		case "IPD-PAY-ISSUED", "IPD-PAY-CREDIT", "IPD-PAY-OTHER", "IPD-PAY-DEL":
			t.Fatalf("excluded statement was included: %s", v.BillNo)
		}
	}
	if !sawShort || !sawSurplus || !sawStuck {
		t.Fatalf("missing paid statements short=%v surplus=%v stuck=%v", sawShort, sawSurplus, sawStuck)
	}

	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	dash := &Dashboard{DB: sqlDB}
	printed := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+day+"&kind=details&scope=all", adminTok, "")
	mustCode(t, printed, http.StatusOK)
	body := printed.Body.String()
	for _, want := range []string{
		`class="daily-cover"`,
		`class="daily-cashbook"`,
		"နေ့စဉ် ဝင်ငွေ",
		"နေ့စဉ် ထွက်ငွေ",
		"IPD-PAY-SHORT",
		"Room 12",
		"Statement 19 Apr 2026",
		"Paid 20 Apr 2026 08:30",
		"<h3>IPD</h3>",
		"<th>Kind</th>",
		"<th>Admission</th>",
		">Collected</td>",
		"Subtotal",
		"OPD-IPD-DAY",
		"EXP-IPD-DAY",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("all details missing %q:\n%s", want, body)
		}
	}
	for _, hide := range []string{
		"IPD-PAY-ISSUED", "IPD-PAY-CREDIT", "IPD-PAY-OTHER", "IPD-PAY-DEL",
		">Detail</th>", ">Time</th>",
		">Deposited Fee</th>", ">To Pay</th>", ">Difference</th>",
		">Day deposited</td>", ">Ward</td>",
		"Total remaining balance",
		"All Bill Details",
	} {
		if strings.Contains(body, hide) {
			t.Fatalf("all details leaked %q", hide)
		}
	}

	incomePrinted := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+day+"&kind=details&scope=income", adminTok, "")
	mustCode(t, incomePrinted, http.StatusOK)
	incomeBody := incomePrinted.Body.String()
	if !strings.Contains(incomeBody, "IPD-PAY-SHORT") || !strings.Contains(incomeBody, "OPD-IPD-DAY") || strings.Contains(incomeBody, "EXP-IPD-DAY") {
		t.Fatalf("income scope filter:\n%s", incomeBody)
	}

	expensePrinted := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+day+"&kind=details&scope=expense", adminTok, "")
	mustCode(t, expensePrinted, http.StatusOK)
	expenseBody := expensePrinted.Body.String()
	if !strings.Contains(expenseBody, "EXP-IPD-DAY") || strings.Contains(expenseBody, "IPD-PAY-SHORT") || strings.Contains(expenseBody, "OPD-IPD-DAY") {
		t.Fatalf("expense scope filter:\n%s", expenseBody)
	}

	bad := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+day+"&kind=details&scope=bogus", adminTok, "")
	mustCode(t, bad, http.StatusBadRequest)
}

func insertDayVoucher(t *testing.T, db *sql.DB, admissionID int64, civilDate, status string, closing int64, decidedAt string) {
	t.Helper()
	if _, err := db.Exec(`
		INSERT INTO ipd_day_vouchers (admission_id, civil_date, status, closing_mmk, decided_at)
		VALUES (?, ?, ?, ?, NULLIF(?, ''))
	`, admissionID, civilDate, status, closing, decidedAt); err != nil {
		t.Fatal(err)
	}
}
