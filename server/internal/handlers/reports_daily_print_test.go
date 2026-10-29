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
		`class="sheet-logo"`,
		"data:image/png;base64,",
		"Mudita Hospital",
		"Daily cash report — 2026-10-28",
		"Income: 270,000 MMK",
		"Expenses: -5,000 MMK",
		"Net: 435,000 MMK",
		"<h3>Desk</h3>",
		"<h3>IPD gains<span class=\"section-note\">130,000 MMK</span></h3>",
		"<h3>IPD cash drawer</h3>",
		"Held for patients: 170,000 MMK",
		"Owed by patients: 0 MMK",
		"<h3>Expenses</h3>",
		"OTB-000010",
		"EXP-000001",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("daily print missing %q", want)
		}
	}
	if strings.Count(body, `<section class="block">`) != 5 {
		t.Fatalf("expected 5 titled sections, body snippet: %s", body[:400])
	}
}

func TestRenderDashboardDailyHTMLIncome(t *testing.T) {
	hosp, move := sampleDailyMove()
	body := renderDashboardDailyHTML(hosp, move, "income")
	for _, want := range []string{
		"Income report — 2026-10-28",
		"<strong>Income: 270,000 MMK</strong>",
		"<h3>Desk</h3>",
		"<h3>IPD gains",
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
		"<h3>Expenses</h3>",
		"EXP-000001",
		"Net:",
	} {
		if strings.Contains(body, hide) {
			t.Fatalf("income print leaked %q", hide)
		}
	}
	if strings.Count(body, `<section class="block">`) != 2 {
		t.Fatalf("expected 2 income sections, got %d", strings.Count(body, `<section class="block">`))
	}
}

func TestRenderDashboardDailyHTMLExpense(t *testing.T) {
	hosp, move := sampleDailyMove()
	body := renderDashboardDailyHTML(hosp, move, "expense")
	for _, want := range []string{
		"Expense report — 2026-10-28",
		"<strong>Expenses: -5,000 MMK</strong>",
		"<h3>Expenses</h3>",
		"EXP-000001",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("expense print missing %q", want)
		}
	}
	for _, hide := range []string{
		"Income report",
		"<h3>Desk</h3>",
		"OTB-000010",
		"IPD gains",
		"IPD cash drawer",
		"IPD open stays",
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
