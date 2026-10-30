package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestCashMovement(t *testing.T) {
	sqlDB := openTestDB(t)
	// Fixture dates stay on the charge income rule when the epoch row is absent.
	if _, err := sqlDB.Exec(`DELETE FROM ipd_voucher_epoch`); err != nil {
		t.Fatal(err)
	}
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	_, otTok := insertSession(t, sqlDB, auth.RoleOT, 0)
	dash := &Dashboard{DB: sqlDB}
	reports := &Reports{DB: sqlDB}

	const deskDay = "2026-03-01"
	insertOPDCash(t, sqlDB, "OPD-DESK", 1000, "paid", deskDay+" 09:00:00", "", 1)
	insertOTCash(t, sqlDB, "OT-DESK", 2000, "paid", deskDay+" 10:00:00", "", 1)
	insertPharmacyCash(t, sqlDB, "PH-DESK", 4000, "paid", deskDay+" 11:00:00", "", 1)

	t.Run("desk bills are income", func(t *testing.T) {
		move := requireMove(t, sqlDB, deskDay, 7000, 0, 7000, 0)
		if move.Desk.OPDTotal != 1000 || move.Desk.OTTotal != 2000 || move.Desk.PharmacyTotal != 4000 {
			t.Fatalf("desk totals %+v", move.Desk)
		}
		if move.Desk.OPDCount+move.Desk.OTCount+move.Desk.PharmacyCount != 3 {
			t.Fatalf("counts opd %d ot %d pharmacy %d", move.Desk.OPDCount, move.Desk.OTCount, move.Desk.PharmacyCount)
		}
		assertEndpointsMatch(t, dash, adminTok, deskDay, move)
		daily := getDaily(t, dash, adminTok, deskDay)
		if daily.PrevIncome != 0 || daily.PrevExpense != 0 || daily.PrevNet != 0 || daily.DeltaIncome != 7000 || daily.DeltaNet != 7000 {
			t.Fatalf("yesterday %+v", daily)
		}
		ov := getOverview(t, dash, adminTok, deskDay)
		if ov.Bills != 3 || ov.Avg != 7000/3 {
			t.Fatalf("overview count %d avg %d", ov.Bills, ov.Avg)
		}
	})

	const ipdDay = "2026-03-02"
	stay := insertStay(t, sqlDB, "IPD-CASH-1")
	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET admitted_at = ? WHERE id = ?`, ipdDay+" 01:00:00", stay); err != nil {
		t.Fatal(err)
	}
	insertLedger(t, sqlDB, stay, "ward", -300, ipdDay+" 03:00:00")
	insertLedger(t, sqlDB, stay, "charge", -400, ipdDay+" 03:10:00")
	insertLedger(t, sqlDB, stay, "collection", 1500, ipdDay+" 03:20:00")
	insertLedger(t, sqlDB, stay, "refund", -200, ipdDay+" 03:30:00")
	insertOPDCash(t, sqlDB, "OPD-ACCOUNT", 1500, "paid", ipdDay+" 09:00:00", "", 0)
	insertOPDCash(t, sqlDB, "OPD-ACCOUNT-VOID", 9999, "void", ipdDay+" 09:30:00", ipdDay+" 04:00:00", 0)

	t.Run("ipd charges are income and drawer cash is not", func(t *testing.T) {
		// Earned = 300+400. Drawer = 1500-200. Net cash follows the drawer.
		move := requireMove(t, sqlDB, ipdDay, 700, 0, 0, 1300)
		if move.Desk.OPDTotal != 0 || len(move.Desk.Lines) != 0 {
			t.Fatalf("account bill entered desk cash %+v", move.Desk)
		}
		if len(move.IPD.Lines) != 2 {
			t.Fatalf("ipd lines %+v", move.IPD.Lines)
		}
		for _, line := range move.IPD.Lines {
			if line.Kind == "ward" || line.Kind == "charge" || line.Kind == "reversal" {
				t.Fatalf("non-cash ledger line %+v", line)
			}
		}
		if move.IPD.CollectionMMK != 1500 || move.IPD.RefundMMK != -200 {
			t.Fatalf("ipd parts %+v", move.IPD)
		}
		if move.IPDEarned.EarnedMMK != 700 || len(move.IPDEarned.Lines) != 2 {
			t.Fatalf("ipd earned %+v", move.IPDEarned)
		}
		if move.OpenStays.OwedToPatientsMMK != 600 || move.OpenStays.OwedByPatientsMMK != 0 || len(move.OpenStays.Stays) != 1 {
			t.Fatalf("open stays %+v", move.OpenStays)
		}
		daily := getDaily(t, dash, adminTok, ipdDay)
		if daily.Earned != 700 || daily.OwedTo != 600 || daily.OwedBy != 0 || len(daily.EarnedLines) != 2 || len(daily.OpenStays) != 1 {
			t.Fatalf("daily ipd detail %+v", daily)
		}
	})

	const expDay = "2026-03-03"
	insertExpense(t, sqlDB, "EXP-16200", "opd", "Night generator", "paid", 16200, 2500, expDay+" 11:00:00", "", "")
	insertExpense(t, sqlDB, "EXP-DRAFT", "ot", "Unpaid fuel", "draft", 99999, 0, expDay+" 08:00:00", "", expDay+" 08:05:00")
	insertExpense(t, sqlDB, "EXP-PRINTED", "ipd", "Printed draft", "draft", 4000, 0, "", "", expDay+" 08:10:00")

	t.Run("paid expense is signed and drafts are zero", func(t *testing.T) {
		move := requireMove(t, sqlDB, expDay, 0, -13700, 0, 0)
		if len(move.ExpenseLines) != 1 {
			t.Fatalf("expense lines %+v", move.ExpenseLines)
		}
		line := move.ExpenseLines[0]
		if line.BillNo != "EXP-16200" || line.Portal != "opd" || line.Name != "Night generator" || line.AmountMMK != -13700 || line.Reversal {
			t.Fatalf("expense line %+v", line)
		}
		assertEndpointsMatch(t, dash, adminTok, expDay, move)
		daily := getDaily(t, dash, adminTok, expDay)
		if len(daily.ExpenseLines) != 1 || daily.ExpenseLines[0].AmountMMK != -13700 {
			t.Fatalf("daily expenses %+v", daily.ExpenseLines)
		}
	})

	const phDay = "2026-03-04"
	insertPharmacyCash(t, sqlDB, "PH-500", 500, "paid", phDay+" 09:00:00", "", 1)
	insertPharmacyCash(t, sqlDB, "RT-300", 300, "paid", phDay+" 10:00:00", "", 1)
	insertPharmacyCash(t, sqlDB, "TO-9", 9000, "paid", phDay+" 11:00:00", "", 1)

	t.Run("pharmacy return is inside the desk total and transfers are not", func(t *testing.T) {
		move := requireMove(t, sqlDB, phDay, 200, 0, 200, 0)
		if move.Desk.PharmacyTotal != 200 || move.Desk.PharmacyCount != 2 || len(move.Desk.Lines) != 2 {
			t.Fatalf("pharmacy %+v lines %+v", move.Desk, move.Desk.Lines)
		}
		for _, line := range move.Desk.Lines {
			if line.BillNo == "TO-9" {
				t.Fatal("transfer slip counted")
			}
		}
	})

	const sameDay = "2026-03-05"
	insertOPDCash(t, sqlDB, "OPD-SAME", 1000, "void", sameDay+" 09:00:00", sameDay+" 03:00:00", 1)

	t.Run("same-day void nets to zero and keeps one count", func(t *testing.T) {
		move := requireMove(t, sqlDB, sameDay, 0, 0, 0, 0)
		if move.Desk.OPDCount != 1 || move.Desk.OPDTotal != 0 || len(move.Desk.Lines) != 2 {
			t.Fatalf("same-day %+v", move.Desk)
		}
		if move.Desk.Lines[0].TotalMMK != 1000 || move.Desk.Lines[0].Reversal || move.Desk.Lines[1].TotalMMK != -1000 || !move.Desk.Lines[1].Reversal {
			t.Fatalf("lines %+v", move.Desk.Lines)
		}
		ov := getOverview(t, dash, adminTok, sameDay)
		if ov.Bills != 1 || ov.Avg != 0 || ov.Grand != 0 || ov.Income != 0 {
			t.Fatalf("overview %+v", ov)
		}
		daily := getDaily(t, dash, adminTok, sameDay)
		if len(daily.Lines) != 2 || !daily.Lines[1].Reversal {
			t.Fatalf("daily lines %+v", daily.Lines)
		}
	})

	insertOPDCash(t, sqlDB, "OPD-XDAY", 1000, "void", "2026-03-06 09:00:00", "2026-03-07 03:00:00", 1)

	t.Run("void on the next day leaves the paid day unchanged", func(t *testing.T) {
		paid := requireMove(t, sqlDB, "2026-03-06", 1000, 0, 1000, 0)
		if paid.Desk.OPDCount != 1 || len(paid.Desk.Lines) != 1 || paid.Desk.Lines[0].Reversal {
			t.Fatalf("paid day %+v", paid.Desk)
		}
		voidDay := requireMove(t, sqlDB, "2026-03-07", -1000, 0, -1000, 0)
		if voidDay.Desk.OPDCount != 0 || len(voidDay.Desk.Lines) != 1 || voidDay.Desk.Lines[0].TotalMMK != -1000 || !voidDay.Desk.Lines[0].Reversal {
			t.Fatalf("void day %+v", voidDay.Desk)
		}
		ov := getOverview(t, dash, adminTok, "2026-03-07")
		if ov.Bills != 0 || ov.Avg != 0 || ov.OPD != -1000 || ov.Income != -1000 {
			t.Fatalf("reversal-only overview %+v", ov)
		}
		assertEndpointsMatch(t, dash, adminTok, "2026-03-06", paid)
		assertEndpointsMatch(t, dash, adminTok, "2026-03-07", voidDay)
	})

	insertOPDCash(t, sqlDB, "OPD-BOUND", 1000, "void", "2026-10-21 09:00:00", "2026-10-21 18:00:00", 1)

	t.Run("voided_at just after Yangon midnight posts on the next civil day", func(t *testing.T) {
		paid := requireMove(t, sqlDB, "2026-10-21", 1000, 0, 1000, 0)
		if len(paid.Desk.Lines) != 1 || paid.Desk.Lines[0].Reversal {
			t.Fatalf("boundary paid day %+v", paid.Desk.Lines)
		}
		voidDay := requireMove(t, sqlDB, "2026-10-22", -1000, 0, -1000, 0)
		if len(voidDay.Desk.Lines) != 1 || voidDay.Desk.Lines[0].TotalMMK != -1000 || !voidDay.Desk.Lines[0].Reversal {
			t.Fatalf("boundary void day %+v", voidDay.Desk.Lines)
		}
	})

	insertExpense(t, sqlDB, "EXP-5000", "pharmacy", "Oxygen", "void", 5000, 0, "2026-03-08 11:00:00", "2026-03-09 03:00:00", "")

	t.Run("expense void reverses on the next day and does not change income", func(t *testing.T) {
		paid := requireMove(t, sqlDB, "2026-03-08", 0, -5000, 0, 0)
		if len(paid.ExpenseLines) != 1 || paid.ExpenseLines[0].AmountMMK != -5000 || paid.ExpenseLines[0].Reversal {
			t.Fatalf("expense paid %+v", paid.ExpenseLines)
		}
		voidDay := requireMove(t, sqlDB, "2026-03-09", 0, 5000, 0, 0)
		if len(voidDay.ExpenseLines) != 1 || voidDay.ExpenseLines[0].AmountMMK != 5000 || !voidDay.ExpenseLines[0].Reversal {
			t.Fatalf("expense void %+v", voidDay.ExpenseLines)
		}
	})

	insertPharmacyCash(t, sqlDB, "RT-VOID", 300, "void", "2026-03-10 11:00:00", "2026-03-11 03:00:00", 1)

	t.Run("voided pharmacy return flips sign on the void day", func(t *testing.T) {
		paid := requireMove(t, sqlDB, "2026-03-10", -300, 0, -300, 0)
		if paid.Desk.PharmacyTotal != -300 || paid.Desk.PharmacyCount != 1 || paid.Desk.Lines[0].TotalMMK != -300 || paid.Desk.Lines[0].Reversal {
			t.Fatalf("return paid %+v", paid.Desk)
		}
		voidDay := requireMove(t, sqlDB, "2026-03-11", 300, 0, 300, 0)
		if voidDay.Desk.PharmacyTotal != 300 || voidDay.Desk.PharmacyCount != 0 || voidDay.Desk.Lines[0].TotalMMK != 300 || !voidDay.Desk.Lines[0].Reversal {
			t.Fatalf("return void %+v", voidDay.Desk)
		}
	})

	insertOPDCash(t, sqlDB, "OPD-NOVOID", 1000, "void", "2026-03-12 09:00:00", "", 1)
	insertOPDCash(t, sqlDB, "OPD-BLANKVOID", 1000, "void", "2026-03-12 10:00:00", "   ", 1)

	t.Run("void without voided_at is excluded from both legs", func(t *testing.T) {
		move := requireMove(t, sqlDB, "2026-03-12", 0, 0, 0, 0)
		if len(move.Desk.Lines) != 0 {
			t.Fatalf("blank void lines %+v", move.Desk.Lines)
		}
	})

	const scopeDay = "2026-03-13"
	insertOPDCash(t, sqlDB, "OPD-SCOPE", 1000, "void", scopeDay+" 09:00:00", scopeDay+" 03:00:00", 1)
	insertOTCash(t, sqlDB, "OT-SCOPE", 2000, "paid", scopeDay+" 10:00:00", "", 1)

	t.Run("desk token sees only its own reversal lines", func(t *testing.T) {
		w := doJSON(reports, http.MethodGet, "/api/reports/daily-cash?date="+scopeDay, opdTok, "")
		mustCode(t, w, http.StatusOK)
		var body cashReport
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.OPDTotal != 0 || body.OPDCount != 1 || body.OTTotal != 0 || body.GrandTotal != 0 || len(body.Lines) != 2 {
			t.Fatalf("opd scope %+v", body)
		}
		if !body.Lines[1].Reversal || body.Lines[1].TotalMMK != -1000 || body.Lines[0].Source != "OPD" {
			t.Fatalf("opd reversal lines %+v", body.Lines)
		}
		if strings.Contains(w.Body.String(), "OT-SCOPE") {
			t.Fatalf("opd cash leaked OT: %s", w.Body.String())
		}
		printed := doJSON(reports, http.MethodGet, "/api/reports/daily-cash/print?date="+scopeDay, opdTok, "")
		mustCode(t, printed, http.StatusOK)
		if strings.Contains(printed.Body.String(), "OT-SCOPE") {
			t.Fatalf("opd print leaked OT: %s", printed.Body.String())
		}

		otw := doJSON(reports, http.MethodGet, "/api/reports/daily-cash?date="+scopeDay, otTok, "")
		mustCode(t, otw, http.StatusOK)
		var otBody cashReport
		if err := json.Unmarshal(otw.Body.Bytes(), &otBody); err != nil {
			t.Fatal(err)
		}
		if otBody.OTTotal != 2000 || otBody.GrandTotal != 2000 || len(otBody.Lines) != 1 || otBody.Lines[0].BillNo != "OT-SCOPE" {
			t.Fatalf("ot scope %+v", otBody)
		}
		if strings.Contains(otw.Body.String(), "OPD-SCOPE") {
			t.Fatalf("ot cash leaked OPD reversal: %s", otw.Body.String())
		}
	})

	const printDay = "2026-04-01"
	insertOPDCash(t, sqlDB, "OPD-PRINT", 1000, "paid", printDay+" 09:00:00", "", 1)
	insertOTCash(t, sqlDB, "OT-PRINT", 2000, "paid", printDay+" 10:00:00", "", 1)
	insertPharmacyCash(t, sqlDB, "PH-PRINT", 4000, "paid", printDay+" 11:00:00", "", 1)
	printStay := insertStay(t, sqlDB, "IPD-PRINT")
	insertLedger(t, sqlDB, printStay, "collection", 800, printDay+" 03:00:00")
	insertExpense(t, sqlDB, "EXP-PRINT", "pharmacy", "Supplies", "paid", 5000, 0, printDay+" 12:00:00", "", "")

	t.Run("admin print shows portal tables and difference and the clinic print stays desk scoped", func(t *testing.T) {
		// Collection is drawer cash only; income stays the desk total.
		move := requireMove(t, sqlDB, printDay, 7000, -5000, 7000, 800)
		assertEndpointsMatch(t, dash, adminTok, printDay, move)

		printed := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+printDay, adminTok, "")
		mustCode(t, printed, http.StatusOK)
		body := printed.Body.String()
		diff := move.IncomeMMK + move.ExpenseMMK
		if !strings.Contains(body, "Difference") || !strings.Contains(body, formatMMK(diff)+" MMK") {
			t.Fatalf("admin print missing difference %d: %s", diff, body)
		}
		if !strings.Contains(body, "Total income") || !strings.Contains(body, formatMMK(move.IncomeMMK)+" MMK") {
			t.Fatalf("admin print missing income %d: %s", move.IncomeMMK, body)
		}
		if !strings.Contains(body, "Total expenses") || !strings.Contains(body, "EXP-PRINT") {
			t.Fatalf("admin print missing signed expense: %s", body)
		}
		if !strings.Contains(body, "<h3>OPD</h3>") || !strings.Contains(body, "<h3>OT</h3>") || !strings.Contains(body, "<h3>Pharmacy</h3>") {
			t.Fatalf("admin print missing portal tables: %s", body)
		}
		if !strings.Contains(body, "OPD-PRINT") || !strings.Contains(body, "OT-PRINT") || !strings.Contains(body, "PH-PRINT") {
			t.Fatalf("admin print missing cash lines: %s", body)
		}
		for _, hide := range []string{"Net:", "IPD cash drawer", "IPD open stays", "<h3>Desk</h3>", "IPD-PRINT"} {
			if strings.Contains(body, hide) {
				t.Fatalf("admin print leaked %q: %s", hide, body)
			}
		}

		incomePrinted := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+printDay+"&kind=income", adminTok, "")
		mustCode(t, incomePrinted, http.StatusOK)
		incomeBody := incomePrinted.Body.String()
		if !strings.Contains(incomeBody, "Income Cash Report") || !strings.Contains(incomeBody, "OT-PRINT") || !strings.Contains(incomeBody, "Total income") {
			t.Fatalf("income print missing sections: %s", incomeBody)
		}
		if strings.Contains(incomeBody, "EXP-PRINT") || strings.Contains(incomeBody, "IPD cash drawer") || strings.Contains(incomeBody, "Difference") {
			t.Fatalf("income print leaked expense/drawer: %s", incomeBody)
		}

		expensePrinted := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+printDay+"&kind=expense", adminTok, "")
		mustCode(t, expensePrinted, http.StatusOK)
		expenseBody := expensePrinted.Body.String()
		if !strings.Contains(expenseBody, "Expenses Cash Report") || !strings.Contains(expenseBody, "EXP-PRINT") || !strings.Contains(expenseBody, "Total expenses") {
			t.Fatalf("expense print missing expense: %s", expenseBody)
		}
		if strings.Contains(expenseBody, "OT-PRINT") || strings.Contains(expenseBody, "Difference") {
			t.Fatalf("expense print leaked income: %s", expenseBody)
		}

		badKind := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+printDay+"&kind=other", adminTok, "")
		mustCode(t, badKind, http.StatusBadRequest)

		denied := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report/print?date="+printDay, opdTok, "")
		mustCode(t, denied, http.StatusForbidden)

		clinic := doJSON(reports, http.MethodGet, "/api/reports/daily-cash/print?date="+printDay, opdTok, "")
		mustCode(t, clinic, http.StatusOK)
		clinicBody := clinic.Body.String()
		if !strings.Contains(clinicBody, "OPD-PRINT") {
			t.Fatalf("opd print missing own bill: %s", clinicBody)
		}
		for _, hidden := range []string{"OT-PRINT", "PH-PRINT", "IPD-PRINT", "EXP-PRINT", "Net: " + formatMMK(move.NetCashMMK)} {
			if strings.Contains(clinicBody, hidden) {
				t.Fatalf("opd print leaked %s: %s", hidden, clinicBody)
			}
		}
	})
}

type apiCash struct {
	Income   int64 `json:"income_mmk"`
	Expense  int64 `json:"expense_mmk"`
	Net      int64 `json:"net_cash_mmk"`
	Grand    int64 `json:"grand_total_mmk"`
	OPD      int64 `json:"opd_total_mmk"`
	OT       int64 `json:"ot_total_mmk"`
	Pharmacy int64 `json:"pharmacy_total_mmk"`
	IPD      int64 `json:"ipd_cash_mmk"`
	Bills    int   `json:"bill_count"`
	Avg      int64 `json:"avg_bill_mmk"`
}

type apiDaily struct {
	apiCash
	PrevIncome   int64             `json:"prev_income_mmk"`
	PrevExpense  int64             `json:"prev_expense_mmk"`
	PrevNet      int64             `json:"prev_net_cash_mmk"`
	DeltaIncome  int64             `json:"delta_income_mmk"`
	DeltaExpense int64             `json:"delta_expense_mmk"`
	DeltaNet     int64             `json:"delta_net_cash_mmk"`
	Lines        []cashLine        `json:"lines"`
	ExpenseLines []expenseCashLine `json:"expense_lines"`
	Earned       int64             `json:"ipd_earned_mmk"`
	EarnedLines  []ipdCashLine     `json:"ipd_earned_lines"`
	OpenStays    []ipdOpenStayRow  `json:"ipd_open_stays"`
	OwedTo       int64             `json:"ipd_owed_to_patients_mmk"`
	OwedBy       int64             `json:"ipd_owed_by_patients_mmk"`
}

// requireMove checks income (desk + IPD earned), expense, desk grand, and IPD drawer.
// net_cash_mmk is desk + drawer + expense, which may differ from income + expense.
func requireMove(t *testing.T, db *sql.DB, date string, income, expense, grand, ipdDrawer int64) *cashMovement {
	t.Helper()
	move, err := buildCashMovement(db, date)
	if err != nil {
		t.Fatal(err)
	}
	wantNet := grand + ipdDrawer + expense
	if move.IncomeMMK != income || move.ExpenseMMK != expense || move.NetCashMMK != wantNet {
		t.Fatalf("%s income %d expense %d net %d, want income %d expense %d net %d",
			date, move.IncomeMMK, move.ExpenseMMK, move.NetCashMMK, income, expense, wantNet)
	}
	if move.Desk.GrandTotal != grand || move.IPD.NetMMK != ipdDrawer {
		t.Fatalf("%s grand %d ipd drawer %d, want grand %d drawer %d",
			date, move.Desk.GrandTotal, move.IPD.NetMMK, grand, ipdDrawer)
	}
	if move.IncomeMMK != grand+move.IPDEarned.EarnedMMK {
		t.Fatalf("%s income %d != grand %d + earned %d",
			date, move.IncomeMMK, grand, move.IPDEarned.EarnedMMK)
	}
	return move
}

func insertOPDCash(t *testing.T, db *sql.DB, billNo string, total int64, status, paidAt, voidedAt string, collected int) {
	t.Helper()
	if _, err := db.Exec(`
		INSERT INTO opd_bills (bill_no, patient_name, status, total_mmk, paid_at, voided_at, collected_cash)
		VALUES (?, 'Cash Patient', ?, ?, NULLIF(?, ''), NULLIF(?, ''), ?)
	`, billNo, status, total, paidAt, voidedAt, collected); err != nil {
		t.Fatal(err)
	}
}

func insertOTCash(t *testing.T, db *sql.DB, billNo string, total int64, status, paidAt, voidedAt string, collected int) {
	t.Helper()
	res, err := db.Exec(`INSERT INTO ot_cases (case_no, patient_name, status) VALUES (?, 'OT Patient', 'billed')`, "C-"+billNo)
	if err != nil {
		t.Fatal(err)
	}
	caseID, _ := res.LastInsertId()
	if _, err := db.Exec(`
		INSERT INTO ot_bills (bill_no, case_id, case_no, patient_name, status, total_mmk, paid_at, voided_at, collected_cash)
		VALUES (?, ?, ?, 'OT Patient', ?, ?, NULLIF(?, ''), NULLIF(?, ''), ?)
	`, billNo, caseID, "C-"+billNo, status, total, paidAt, voidedAt, collected); err != nil {
		t.Fatal(err)
	}
}

func insertPharmacyCash(t *testing.T, db *sql.DB, billNo string, total int64, status, paidAt, voidedAt string, collected int) {
	t.Helper()
	if _, err := db.Exec(`
		INSERT INTO pharmacy_bills (bill_no, patient_name, status, total_mmk, paid_at, voided_at, collected_cash)
		VALUES (?, 'Pharmacy Patient', ?, ?, NULLIF(?, ''), NULLIF(?, ''), ?)
	`, billNo, status, total, paidAt, voidedAt, collected); err != nil {
		t.Fatal(err)
	}
}

func insertExpense(t *testing.T, db *sql.DB, billNo, portal, name, status string, total, discount int64, paidAt, voidedAt, printedAt string) {
	t.Helper()
	if _, err := db.Exec(`
		INSERT INTO expense_bills (bill_no, portal, name, status, total_mmk, discount_mmk, paid_at, voided_at, printed_at)
		VALUES (?, ?, ?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''))
	`, billNo, portal, name, status, total, discount, paidAt, voidedAt, printedAt); err != nil {
		t.Fatal(err)
	}
}

func insertStay(t *testing.T, db *sql.DB, admissionNo string) int64 {
	t.Helper()
	res, err := db.Exec(`INSERT INTO patients (name) VALUES (?)`, admissionNo)
	if err != nil {
		t.Fatal(err)
	}
	patientID, _ := res.LastInsertId()
	res, err = db.Exec(`INSERT INTO ipd_admissions (admission_no, patient_id) VALUES (?, ?)`, admissionNo, patientID)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func insertLedger(t *testing.T, db *sql.DB, admissionID int64, kind string, amount int64, createdAt string) {
	t.Helper()
	if _, err := db.Exec(`
		INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, created_at) VALUES (?, ?, ?, ?)
	`, admissionID, kind, amount, createdAt); err != nil {
		t.Fatal(err)
	}
}

func assertEndpointsMatch(t *testing.T, dash *Dashboard, token, date string, move *cashMovement) {
	t.Helper()
	ov := getOverview(t, dash, token, date)
	if ov.Income != move.IncomeMMK || ov.Expense != move.ExpenseMMK || ov.Net != move.NetCashMMK ||
		ov.Grand != move.Desk.GrandTotal || ov.OPD != move.Desk.OPDTotal || ov.OT != move.Desk.OTTotal ||
		ov.Pharmacy != move.Desk.PharmacyTotal || ov.IPD != move.IPD.NetMMK {
		t.Fatalf("%s overview %+v move income %d expense %d net %d", date, ov, move.IncomeMMK, move.ExpenseMMK, move.NetCashMMK)
	}
	daily := getDaily(t, dash, token, date)
	if daily.Income != ov.Income || daily.Expense != ov.Expense || daily.Net != ov.Net ||
		daily.Grand != ov.Grand || daily.OPD != ov.OPD || daily.OT != ov.OT || daily.Pharmacy != ov.Pharmacy || daily.IPD != ov.IPD {
		t.Fatalf("%s daily %+v overview %+v", date, daily.apiCash, ov)
	}
	point := getTrendPoint(t, dash, token, date)
	if point.Income != ov.Income || point.Expense != ov.Expense || point.Net != ov.Net ||
		point.Grand != ov.Grand || point.OPD != ov.OPD || point.OT != ov.OT || point.Pharmacy != ov.Pharmacy || point.IPD != ov.IPD {
		t.Fatalf("%s trend %+v overview %+v", date, point, ov)
	}
}

func getOverview(t *testing.T, dash *Dashboard, token, date string) apiCash {
	t.Helper()
	w := doJSON(dash, http.MethodGet, "/api/dashboard/overview?date="+date, token, "")
	mustCode(t, w, http.StatusOK)
	var body apiCash
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body
}

func getDaily(t *testing.T, dash *Dashboard, token, date string) apiDaily {
	t.Helper()
	w := doJSON(dash, http.MethodGet, "/api/dashboard/daily-report?date="+date, token, "")
	mustCode(t, w, http.StatusOK)
	var body apiDaily
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body
}

func getTrendPoint(t *testing.T, dash *Dashboard, token, date string) apiCash {
	t.Helper()
	w := doJSON(dash, http.MethodGet, "/api/dashboard/trends?from="+date+"&to="+date, token, "")
	mustCode(t, w, http.StatusOK)
	var body struct {
		Points []apiCash `json:"points"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Points) != 1 {
		t.Fatalf("trend points %d", len(body.Points))
	}
	return body.Points[0]
}
