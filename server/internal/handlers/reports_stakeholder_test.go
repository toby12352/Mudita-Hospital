package handlers

import (
	"net/http"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestRevenueReportPresentation(t *testing.T) {
	sqlDB := openTestDB(t)
	if _, err := sqlDB.Exec(`DELETE FROM ipd_voucher_epoch`); err != nil {
		t.Fatal(err)
	}
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	dash := &Dashboard{DB: sqlDB}

	const day1 = "2026-04-01"
	const day2 = "2026-04-02"
	insertOPDCash(t, sqlDB, "OPD-STK-1", 1000, "paid", day1+" 09:00:00", "", 1)
	insertOTCash(t, sqlDB, "OT-STK-1", 2000, "paid", day1+" 10:00:00", "", 1)
	insertOPDCash(t, sqlDB, "OPD-STK-2", 500, "paid", day2+" 09:00:00", "", 1)
	insertExpense(t, sqlDB, "EXP-STK-1", "pharmacy", "Supplies", "paid", 3000, 0, day1+" 12:00:00", "", "")
	insertExpense(t, sqlDB, "EXP-STK-2", "opd", "Cleaning", "paid", 700, 0, day2+" 12:00:00", "", "")

	stay := insertStay(t, sqlDB, "ADM-STK-1")
	if _, err := sqlDB.Exec(`
		UPDATE ipd_admissions
		SET admitted_at = ?, status = 'settled', discharged_at = ?
		WHERE id = ?
	`, day1+" 08:00:00", day2+" 16:00:00", stay); err != nil {
		t.Fatal(err)
	}

	en := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/presentation?from="+day1+"&to="+day2+"&lang=en",
		adminTok, "")
	mustCode(t, en, http.StatusOK)
	body := en.Body.String()
	for _, want := range []string{
		"Performance report",
		"lang=\"en\"",
		"3,500",
		"3,700",
		"-200",
		"Where the money came from",
		"Where the money went",
		"Pharmacy trading",
		"Activity (not money)",
		"What this does not show",
		"OPD",
		"OT",
		"@page{size:13.333in 7.5in",
		"Admissions",
		"Discharges",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("presentation missing %q:\n%s", want, body)
		}
	}
	// Result = income 3500 + signed expense (-3700) = -200
	if !strings.Contains(body, "vs previous") {
		t.Fatalf("missing previous comparison:\n%s", body)
	}

	my := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/presentation?from="+day1+"&to="+day2+"&lang=my",
		adminTok, "")
	mustCode(t, my, http.StatusOK)
	myBody := my.Body.String()
	for _, want := range []string{
		"စွမ်းဆောင်ရည် အစီရင်ခံစာ",
		"lang=\"my\"",
		"ဝင်ငွေ",
		"အသုံးစရိတ်",
		"3,500",
		"ကျပ်",
	} {
		if !strings.Contains(myBody, want) {
			t.Fatalf("myanmar presentation missing %q:\n%s", want, myBody)
		}
	}

	empty := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/presentation?from=2026-06-01&to=2026-06-01&lang=en",
		adminTok, "")
	mustCode(t, empty, http.StatusOK)
	emptyBody := empty.Body.String()
	if !strings.Contains(emptyBody, "Performance report") {
		t.Fatalf("empty range missing title:\n%s", emptyBody)
	}
	if !strings.Contains(emptyBody, "No cash recorded in this period.") &&
		!strings.Contains(emptyBody, "0") {
		t.Fatalf("empty range should still render zeros:\n%s", emptyBody)
	}

	// Full calendar month title + daily buckets
	month := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/presentation?from=2026-04-01&to=2026-04-30&lang=en",
		adminTok, "")
	mustCode(t, month, http.StatusOK)
	if !strings.Contains(month.Body.String(), "Monthly performance report") {
		t.Fatalf("full month missing monthly title:\n%s", month.Body.String())
	}

	// Full calendar year title + monthly buckets
	year := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/presentation?from=2026-01-01&to=2026-12-31&lang=en",
		adminTok, "")
	mustCode(t, year, http.StatusOK)
	yearBody := year.Body.String()
	if !strings.Contains(yearBody, "Annual performance report") {
		t.Fatalf("full year missing annual title:\n%s", yearBody)
	}
	if !strings.Contains(yearBody, "By month") {
		t.Fatalf("full year missing monthly bucket label:\n%s", yearBody)
	}

	denied := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/presentation?from="+day1+"&to="+day2,
		opdTok, "")
	mustCode(t, denied, http.StatusForbidden)
}

func TestBuildStakeholderPresentationTotals(t *testing.T) {
	sqlDB := openTestDB(t)
	if _, err := sqlDB.Exec(`DELETE FROM ipd_voucher_epoch`); err != nil {
		t.Fatal(err)
	}
	const day = "2026-05-10"
	insertOPDCash(t, sqlDB, "OPD-STK-T", 1500, "paid", day+" 09:00:00", "", 1)
	insertExpense(t, sqlDB, "EXP-STK-T", "lab", "Kit", "paid", 400, 0, day+" 11:00:00", "", "")

	move, err := buildCashMovement(sqlDB, day)
	if err != nil {
		t.Fatal(err)
	}
	rep, err := buildStakeholderPresentation(sqlDB, day, day)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Current.IncomeMMK != move.IncomeMMK {
		t.Fatalf("income %d != daily %d", rep.Current.IncomeMMK, move.IncomeMMK)
	}
	if rep.Current.ExpenseMMK != -move.ExpenseMMK {
		t.Fatalf("expense display %d != %d", rep.Current.ExpenseMMK, -move.ExpenseMMK)
	}
	if rep.Current.ResultMMK != move.IncomeMMK+move.ExpenseMMK {
		t.Fatalf("result %d != income+signed expense %d", rep.Current.ResultMMK, move.IncomeMMK+move.ExpenseMMK)
	}
	var opdAmt int64
	for _, row := range rep.IncomeByPortal {
		if row.Portal == "OPD" {
			opdAmt = row.Amount
		}
		// Zero rows kept for every income portal.
		found := false
		for _, want := range stakeholderIncomePortals {
			if row.Portal == want {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("unexpected income portal %q", row.Portal)
		}
	}
	if opdAmt != 1500 {
		t.Fatalf("OPD share %d, want 1500", opdAmt)
	}
	if len(rep.IncomeByPortal) != len(stakeholderIncomePortals) {
		t.Fatalf("income portals %d, want %d", len(rep.IncomeByPortal), len(stakeholderIncomePortals))
	}
	if len(rep.ExpenseByPortal) != len(stakeholderExpensePortals) {
		t.Fatalf("expense portals %d, want %d", len(rep.ExpenseByPortal), len(stakeholderExpensePortals))
	}
}
