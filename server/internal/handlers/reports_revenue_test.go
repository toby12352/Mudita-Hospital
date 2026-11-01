package handlers

import (
	"net/http"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestRevenueRangeReportPrintAndExport(t *testing.T) {
	sqlDB := openTestDB(t)
	if _, err := sqlDB.Exec(`DELETE FROM ipd_voucher_epoch`); err != nil {
		t.Fatal(err)
	}
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	dash := &Dashboard{DB: sqlDB}

	const day1 = "2026-04-01"
	const day2 = "2026-04-02"
	insertOPDCash(t, sqlDB, "OPD-REV-1", 1000, "paid", day1+" 09:00:00", "", 1)
	insertOTCash(t, sqlDB, "OT-REV-1", 2000, "paid", day1+" 10:00:00", "", 1)
	insertOPDCash(t, sqlDB, "OPD-REV-2", 500, "paid", day2+" 09:00:00", "", 1)
	insertExpense(t, sqlDB, "EXP-REV-1", "pharmacy", "Supplies", "paid", 3000, 0, day1+" 12:00:00", "", "")
	insertExpense(t, sqlDB, "EXP-REV-2", "opd", "Cleaning", "paid", 700, 0, day2+" 12:00:00", "", "")

	income := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/print?from="+day1+"&to="+day2+"&kind=income&lang=en",
		adminTok, "")
	mustCode(t, income, http.StatusOK)
	incomeBody := income.Body.String()
	for _, want := range []string{
		"Income Cash Report",
		"lang=\"en\"",
		"Total income",
		"3,500 MMK",
		"OPD-REV-1",
		"OT-REV-1",
		"OPD-REV-2",
		"Average per day",
		"Department",
	} {
		if !strings.Contains(incomeBody, want) {
			t.Fatalf("income print missing %q:\n%s", want, incomeBody)
		}
	}
	if strings.Contains(incomeBody, "EXP-REV-1") || strings.Contains(incomeBody, "Expenses Cash Report") {
		t.Fatalf("income print leaked expense:\n%s", incomeBody)
	}

	incomeMY := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/print?from="+day1+"&to="+day2+"&kind=income&lang=my",
		adminTok, "")
	mustCode(t, incomeMY, http.StatusOK)
	myBody := incomeMY.Body.String()
	for _, want := range []string{
		"ဝင်ငွေ ငွေသားအစီရင်ခံစာ",
		"lang=\"my\"",
		"စုစုပေါင်း ဝင်ငွေ",
		"3,500 ကျပ်",
		"ဌာန",
	} {
		if !strings.Contains(myBody, want) {
			t.Fatalf("myanmar income print missing %q:\n%s", want, myBody)
		}
	}

	expense := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/print?from="+day1+"&to="+day2+"&kind=expense&lang=en",
		adminTok, "")
	mustCode(t, expense, http.StatusOK)
	expenseBody := expense.Body.String()
	for _, want := range []string{
		"Expenses Cash Report",
		"Total expenses",
		"3,700 MMK",
		"EXP-REV-1",
		"EXP-REV-2",
	} {
		if !strings.Contains(expenseBody, want) {
			t.Fatalf("expense print missing %q:\n%s", want, expenseBody)
		}
	}
	if strings.Contains(expenseBody, "OPD-REV-1") || strings.Contains(expenseBody, "-3,700") {
		t.Fatalf("expense print leaked income or signed negative total:\n%s", expenseBody)
	}

	expenseMY := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/print?from="+day1+"&to="+day2+"&kind=expense&lang=my",
		adminTok, "")
	mustCode(t, expenseMY, http.StatusOK)
	if !strings.Contains(expenseMY.Body.String(), "အသုံးစရိတ် ငွေသားအစီရင်ခံစာ") {
		t.Fatalf("myanmar expense title missing:\n%s", expenseMY.Body.String())
	}

	csv := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/export?from="+day1+"&to="+day2+"&kind=income&lang=my",
		adminTok, "")
	mustCode(t, csv, http.StatusOK)
	csvBody := csv.Body.String()
	if !strings.HasPrefix(csvBody, "\ufeff") {
		t.Fatalf("csv missing UTF-8 BOM")
	}
	if !strings.Contains(csvBody, "ဝင်ငွေ ငွေသားအစီရင်ခံစာ") || !strings.Contains(csvBody, "OPD-REV-1") {
		t.Fatalf("csv missing content:\n%s", csvBody)
	}
	cd := csv.Header().Get("Content-Disposition")
	if !strings.Contains(cd, "mudita-income-"+day1+"-"+day2+".csv") {
		t.Fatalf("csv disposition %q", cd)
	}

	badKind := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/print?from="+day1+"&to="+day2+"&kind=overall",
		adminTok, "")
	mustCode(t, badKind, http.StatusBadRequest)

	badDetails := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/print?from="+day1+"&to="+day2+"&kind=details",
		adminTok, "")
	mustCode(t, badDetails, http.StatusBadRequest)

	denied := doJSON(dash, http.MethodGet,
		"/api/dashboard/revenue-report/print?from="+day1+"&to="+day2+"&kind=income",
		opdTok, "")
	mustCode(t, denied, http.StatusForbidden)
}

func TestRenderRevenueRangeHTMLMatchesDailyTotals(t *testing.T) {
	sqlDB := openTestDB(t)
	if _, err := sqlDB.Exec(`DELETE FROM ipd_voucher_epoch`); err != nil {
		t.Fatal(err)
	}
	const day = "2026-05-10"
	insertOPDCash(t, sqlDB, "OPD-MATCH", 1500, "paid", day+" 09:00:00", "", 1)
	insertExpense(t, sqlDB, "EXP-MATCH", "lab", "Kit", "paid", 400, 0, day+" 11:00:00", "", "")

	move, err := buildCashMovement(sqlDB, day)
	if err != nil {
		t.Fatal(err)
	}
	rep, err := buildRevenueRangeReport(sqlDB, day, day, "income")
	if err != nil {
		t.Fatal(err)
	}
	if rep.TotalMMK != move.IncomeMMK {
		t.Fatalf("income total %d != daily %d", rep.TotalMMK, move.IncomeMMK)
	}
	expRep, err := buildRevenueRangeReport(sqlDB, day, day, "expense")
	if err != nil {
		t.Fatal(err)
	}
	if expRep.TotalMMK != -move.ExpenseMMK {
		t.Fatalf("expense total %d != daily display %d", expRep.TotalMMK, -move.ExpenseMMK)
	}
}
