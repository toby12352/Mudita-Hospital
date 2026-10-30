package handlers

import (
	"strings"
	"testing"
)

func sampleDailyMove() (*hospitalSettings, *cashMovement) {
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}
	move := &cashMovement{
		Date:       "2026-10-28",
		IncomeMMK:  270000,
		ExpenseMMK: -5000,
		NetCashMMK: 435000,
		Desk: &cashReport{Lines: []cashLine{
			{Source: "OT", BillNo: "OTB-000010", Patient: "Desk Verify Patient", Doctor: "Dr. Aung", PaidAt: "2026-10-28 07:18:55", TotalMMK: 140000},
			{Source: "Pharmacy", BillNo: "PH-000015", Patient: "Daw Hla", PaidAt: "2026-10-28 17:28:00", TotalMMK: 0},
		}},
		IPDEarned: &ipdEarnedReport{
			EarnedMMK: 130000,
			Lines: []ipdCashLine{
				{Kind: "ward", AdmissionNo: "IPD-000003", Patient: "Daw Hla", AmountMMK: -35000},
				{Kind: "charge", AdmissionNo: "IPD-000003", Patient: "Daw Hla", AmountMMK: -95000},
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
			{BillNo: "EXP-000001", Portal: "pharmacy", Name: "Supplies", AmountMMK: -5000, PaidAt: "2026-10-28 12:00:00"},
		},
	}
	return hosp, move
}

func TestRenderDashboardDailyHTMLLayout(t *testing.T) {
	hosp, move := sampleDailyMove()
	body := renderDashboardDailyHTML(hosp, move, "overall")
	for _, want := range []string{
		`class="a4-logo"`,
		"data:image/png;base64,",
		"Mudita Hospital",
		"Daily Cash Report",
		"Expenses Cash Report",
		"Date: Oct 28, 2026",
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
		`class="daily-page-break"`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("daily print missing %q", want)
		}
	}
	for _, hide := range []string{
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
	// OT, IPD, Pharmacy income + Pharmacy expense.
	if strings.Count(body, `<section class="block">`) != 4 {
		t.Fatalf("expected 4 titled sections, got %d; body snippet: %s", strings.Count(body, `<section class="block">`), body[:400])
	}
}

func TestRenderDashboardDailyHTMLIncome(t *testing.T) {
	hosp, move := sampleDailyMove()
	body := renderDashboardDailyHTML(hosp, move, "income")
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
	body := renderDashboardDailyHTML(hosp, move, "expense")
	for _, want := range []string{
		"Expenses Cash Report",
		"Date: Oct 28, 2026",
		"Total expenses",
		"-5,000 MMK",
		"<h3>Pharmacy</h3>",
		"EXP-000001",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("expense print missing %q", want)
		}
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
	body := renderDashboardDailyHTML(hosp, move, "income")
	if !strings.Contains(body, "100,000") || strings.Contains(body, "-100,000") {
		t.Fatalf("deposit should print as income:\n%s", body)
	}
}
