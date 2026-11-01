package handlers

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"html"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// revenueDayBundle is one civil day's cash movement for a range print.
type revenueDayBundle struct {
	Date  string
	Move  *cashMovement
	Carry []ipdPrintCarryRow // income only; loaded for the first day
}

// revenuePortalAgg is department totals for the summary table.
type revenuePortalAgg struct {
	Portal string
	Bills  int
	Amount int64
}

// revenueRangeReport is the printable income or expense sheet for a date window.
type revenueRangeReport struct {
	From     string
	To       string
	Days     int
	Kind     string // income | expense
	TotalMMK int64  // display total (expenses already positive)
	ByPortal []revenuePortalAgg
	DaysData []revenueDayBundle
}

type revenuePrintStrings struct {
	Lang           string
	IncomeTitle    string
	ExpenseTitle   string
	Period         string
	Date           string
	CashNote       string
	PeriodOpenNote string
	TotalIncome    string
	TotalExpenses  string
	AvgPerDay      string
	Department     string
	Bills          string
	Amount         string
	Share          string
	DailyTotal     string
	Subtotal       string
	NoIncome       string
	NoExpenses     string
	Bill           string
	Patient        string
	Doctor         string
	Paid           string
	Remark         string
	Payee          string
	Kind           string
	Admission      string
	Reversal       string
	Currency       string
	PrintedFrom    string
	Pharmacy       string
	ExpensesPortal string
	Portal         string
}

func revenueStrings(lang string) revenuePrintStrings {
	if lang == "my" {
		return revenuePrintStrings{
			Lang:           "my",
			IncomeTitle:    "ဝင်ငွေ ငွေသားအစီရင်ခံစာ",
			ExpenseTitle:   "အသုံးစရိတ် ငွေသားအစီရင်ခံစာ",
			Period:         "ကာလ",
			Date:           "ရက်စွဲ",
			CashNote:       "ငွေသား ကောက်ခံ/သုံးစွဲမှု (အရှုံးအမြတ်ရှင်းတမ်း မဟုတ်ပါ)",
			PeriodOpenNote: "ယနေ့ ပါဝင်ပြီး ကာလမပြီးသေးပါက ပြောင်းလဲနိုင်သည်။",
			TotalIncome:    "စုစုပေါင်း ဝင်ငွေ",
			TotalExpenses:  "စုစုပေါင်း အသုံးစရိတ်",
			AvgPerDay:      "နေ့စဉ် ပျမ်းမျှ",
			Department:     "ဌာန",
			Bills:          "ဘေလ်အရေအတွက်",
			Amount:         "ပမာဏ (ကျပ်)",
			Share:          "ရာခိုင်နှုန်း",
			DailyTotal:     "နေ့စဉ် စုစုပေါင်း",
			Subtotal:       "အပေါင်းစု",
			NoIncome:       "ဤကာလတွင် ဝင်ငွေ မရှိပါ။",
			NoExpenses:     "ဤကာလတွင် အသုံးစရိတ် မရှိပါ။",
			Bill:           "ဘေလ်",
			Patient:        "လူနာ",
			Doctor:         "ဆရာဝန်",
			Paid:           "ပေးပြီး",
			Remark:         "မှတ်ချက်",
			Payee:          "လက်ခံသူ",
			Kind:           "အမျိုးအစား",
			Admission:      "တက်ရောက်နံပါတ်",
			Reversal:       "ပြန်လှန်",
			Currency:       "ကျပ်",
			PrintedFrom:    "Mudita Hospital မှ ပရင့်",
			Pharmacy:       "ဆေးဆိုင်",
			ExpensesPortal: "အသုံးစရိတ်",
			Portal:         "ဌာန",
		}
	}
	return revenuePrintStrings{
		Lang:           "en",
		IncomeTitle:    "Income Cash Report",
		ExpenseTitle:   "Expenses Cash Report",
		Period:         "Period",
		Date:           "Date",
		CashNote:       "Cash collected / spent (not an accrual profit-and-loss statement)",
		PeriodOpenNote: "Includes today; the period may still change.",
		TotalIncome:    "Total income",
		TotalExpenses:  "Total expenses",
		AvgPerDay:      "Average per day",
		Department:     "Department",
		Bills:          "Bills",
		Amount:         "Amount (MMK)",
		Share:          "Share",
		DailyTotal:     "Daily total",
		Subtotal:       "Subtotal",
		NoIncome:       "No income in this period.",
		NoExpenses:     "No expenses in this period.",
		Bill:           "Bill",
		Patient:        "Patient",
		Doctor:         "Doctor",
		Paid:           "Paid",
		Remark:         "Remark",
		Payee:          "Payee",
		Kind:           "Kind",
		Admission:      "Admission",
		Reversal:       "reversal",
		Currency:       "MMK",
		PrintedFrom:    "Printed from Mudita Hospital",
		Pharmacy:       "Pharmacy",
		ExpensesPortal: "Expenses",
		Portal:         "Portal",
	}
}

func localizeRevenuePortal(portal, lang string, s revenuePrintStrings) string {
	if lang != "my" {
		return portal
	}
	switch portal {
	case "Pharmacy":
		return s.Pharmacy
	case "Expenses":
		return s.ExpensesPortal
	default:
		return portal
	}
}

func parseRevenueReportLang(r *http.Request) string {
	lang := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("lang")))
	if lang == "my" {
		return "my"
	}
	return "en"
}

func parseRevenueReportKind(r *http.Request) (string, error) {
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	switch kind {
	case "income", "expense":
		return kind, nil
	default:
		return "", fmt.Errorf("kind must be income or expense")
	}
}

func buildRevenueRangeReport(db *sql.DB, from, to, kind string) (*revenueRangeReport, error) {
	fromT, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, err
	}
	toT, err := time.Parse("2006-01-02", to)
	if err != nil {
		return nil, err
	}
	days := int(toT.Sub(fromT).Hours()/24) + 1
	portalAmt := map[string]int64{}
	portalBills := map[string]int{}
	daysData := make([]revenueDayBundle, 0, days)
	var total int64
	first := true
	for d := fromT; !d.After(toT); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		move, err := buildCashMovement(db, key)
		if err != nil {
			return nil, err
		}
		bundle := revenueDayBundle{Date: key, Move: move}
		if kind == "income" && first {
			carry, err := loadIpdDailyPrintCarry(db, key)
			if err != nil {
				return nil, err
			}
			bundle.Carry = carry
		}
		first = false
		daysData = append(daysData, bundle)

		if kind == "income" {
			total += move.IncomeMMK
			desk := move.Desk
			if desk != nil {
				for _, line := range desk.Lines {
					portalAmt[line.Source] += line.TotalMMK
					portalBills[line.Source]++
				}
			}
			if move.IPDEarned != nil {
				for _, line := range move.IPDEarned.Lines {
					portalAmt["IPD"] += ipdEarnedDisplayMMK(line)
					portalBills["IPD"]++
				}
			}
		} else {
			total += -move.ExpenseMMK
			for _, line := range move.ExpenseLines {
				portal := dailyExpensePortalLabel(line.Portal)
				portalAmt[portal] += expenseDisplayMMK(line)
				portalBills[portal]++
			}
		}
	}

	byPortal := make([]revenuePortalAgg, 0)
	seen := map[string]bool{}
	for _, portal := range dailyPortalOrder {
		if portalAmt[portal] == 0 && portalBills[portal] == 0 {
			continue
		}
		byPortal = append(byPortal, revenuePortalAgg{
			Portal: portal,
			Bills:  portalBills[portal],
			Amount: portalAmt[portal],
		})
		seen[portal] = true
	}
	for portal, amount := range portalAmt {
		if seen[portal] {
			continue
		}
		byPortal = append(byPortal, revenuePortalAgg{
			Portal: portal,
			Bills:  portalBills[portal],
			Amount: amount,
		})
	}

	return &revenueRangeReport{
		From:     from,
		To:       to,
		Days:     days,
		Kind:     kind,
		TotalMMK: total,
		ByPortal: byPortal,
		DaysData: daysData,
	}, nil
}

func (h *Dashboard) revenueReportPrint(w http.ResponseWriter, r *http.Request) {
	kind, err := parseRevenueReportKind(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	from, to, _, err := parseDashRange(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	lang := parseRevenueReportLang(r)
	hosp, _ := loadHospitalSettings(h.DB)
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	rep, err := buildRevenueRangeReport(h.DB, from, to, kind)
	if err != nil {
		http.Error(w, "report failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderRevenueRangeHTML(hosp, rep, lang)))
}

func (h *Dashboard) revenueReportExport(w http.ResponseWriter, r *http.Request) {
	kind, err := parseRevenueReportKind(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	from, to, _, err := parseDashRange(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	lang := parseRevenueReportLang(r)
	rep, err := buildRevenueRangeReport(h.DB, from, to, kind)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "export failed"})
		return
	}
	s := revenueStrings(lang)
	title := s.IncomeTitle
	if kind == "expense" {
		title = s.ExpenseTitle
	}
	filename := fmt.Sprintf("mudita-%s-%s-%s.csv", kind, from, to)
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	// UTF-8 BOM so Excel keeps Myanmar text.
	_, _ = w.Write([]byte{0xEF, 0xBB, 0xBF})
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{title})
	_ = cw.Write([]string{s.Period, from, to})
	_ = cw.Write([]string{s.CashNote})
	_ = cw.Write([]string{s.PeriodOpenNote})
	totalLabel := s.TotalIncome
	if kind == "expense" {
		totalLabel = s.TotalExpenses
	}
	_ = cw.Write([]string{totalLabel, strconv.FormatInt(rep.TotalMMK, 10)})
	avg := int64(0)
	if rep.Days > 0 {
		avg = rep.TotalMMK / int64(rep.Days)
	}
	_ = cw.Write([]string{s.AvgPerDay, strconv.FormatInt(avg, 10)})
	_ = cw.Write([]string{})
	_ = cw.Write([]string{s.Department, s.Bills, s.Amount, s.Share})
	for _, row := range rep.ByPortal {
		share := ""
		if rep.TotalMMK != 0 {
			share = fmt.Sprintf("%.1f%%", float64(row.Amount)*100/float64(rep.TotalMMK))
		}
		_ = cw.Write([]string{
			localizeRevenuePortal(row.Portal, lang, s),
			strconv.Itoa(row.Bills),
			strconv.FormatInt(row.Amount, 10),
			share,
		})
	}
	_ = cw.Write([]string{})
	if kind == "income" {
		_ = cw.Write([]string{s.Date, s.Portal, s.Bill, s.Patient, s.Doctor, s.Paid, s.Remark, s.Amount})
		for _, day := range rep.DaysData {
			writeRevenueIncomeCSVDay(cw, day, lang, s)
		}
	} else {
		_ = cw.Write([]string{s.Date, s.Portal, s.Bill, s.Payee, s.Paid, s.Remark, s.Amount})
		for _, day := range rep.DaysData {
			writeRevenueExpenseCSVDay(cw, day, lang, s)
		}
	}
	cw.Flush()
}

func writeRevenueIncomeCSVDay(cw *csv.Writer, day revenueDayBundle, lang string, s revenuePrintStrings) {
	move := day.Move
	desk := move.Desk
	if desk == nil {
		desk = &cashReport{}
	}
	bySource := map[string][]cashLine{}
	for _, line := range desk.Lines {
		bySource[line.Source] = append(bySource[line.Source], line)
	}
	for _, portal := range dailyPortalOrder {
		if portal == "IPD" {
			for _, row := range day.Carry {
				_ = cw.Write([]string{
					day.Date, localizeRevenuePortal("IPD", lang, s), row.AdmissionNo, row.Patient, "", "", row.Kind, strconv.FormatInt(row.AmountMMK, 10),
				})
			}
			if move.IPDEarned != nil {
				for _, line := range move.IPDEarned.Lines {
					_ = cw.Write([]string{
						day.Date, localizeRevenuePortal("IPD", lang, s), line.AdmissionNo, line.Patient, "", "", line.Kind, strconv.FormatInt(ipdEarnedDisplayMMK(line), 10),
					})
				}
			}
			continue
		}
		for _, line := range bySource[portal] {
			bill := line.BillNo
			if line.Reversal {
				bill += " (" + s.Reversal + ")"
			}
			_ = cw.Write([]string{
				day.Date, localizeRevenuePortal(portal, lang, s), bill, line.Patient, line.Doctor, line.PaidAt, line.Remark, strconv.FormatInt(line.TotalMMK, 10),
			})
		}
	}
}

func writeRevenueExpenseCSVDay(cw *csv.Writer, day revenueDayBundle, lang string, s revenuePrintStrings) {
	byPortal := map[string][]expenseCashLine{}
	for _, line := range day.Move.ExpenseLines {
		key := dailyExpensePortalLabel(line.Portal)
		byPortal[key] = append(byPortal[key], line)
	}
	writePortal := func(portal string, lines []expenseCashLine) {
		for _, line := range lines {
			bill := line.BillNo
			if line.Reversal {
				bill += " (" + s.Reversal + ")"
			}
			_ = cw.Write([]string{
				day.Date, localizeRevenuePortal(portal, lang, s), bill, line.Name, line.PaidAt, line.Remark, strconv.FormatInt(expenseDisplayMMK(line), 10),
			})
		}
	}
	for _, portal := range dailyPortalOrder {
		writePortal(portal, byPortal[portal])
		delete(byPortal, portal)
	}
	for portal, lines := range byPortal {
		writePortal(portal, lines)
	}
}

func renderRevenueRangeHTML(hosp *hospitalSettings, rep *revenueRangeReport, lang string) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	s := revenueStrings(lang)
	heading := s.IncomeTitle
	if rep.Kind == "expense" {
		heading = s.ExpenseTitle
	}
	periodLabel := dailyReportDateLabel(rep.From) + " – " + dailyReportDateLabel(rep.To)

	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html lang=\"")
	b.WriteString(html.EscapeString(s.Lang))
	b.WriteString("\"><head><meta charset=\"utf-8\"><title>")
	b.WriteString(html.EscapeString(heading))
	b.WriteString(" ")
	b.WriteString(html.EscapeString(rep.From))
	b.WriteString(" – ")
	b.WriteString(html.EscapeString(rep.To))
	b.WriteString("</title><style>")
	b.WriteString(dashboardRevenuePrintCSS())
	b.WriteString("</style></head><body>")
	b.WriteString(`<div class="a4-sheet">`)
	writeA4Letterhead(&b, hosp)
	b.WriteString(`<p class="a4-title">`)
	b.WriteString(html.EscapeString(heading))
	b.WriteString(`</p><p class="daily-date">`)
	b.WriteString(html.EscapeString(s.Period))
	b.WriteString(`: `)
	b.WriteString(html.EscapeString(periodLabel))
	b.WriteString(`</p>`)
	b.WriteString(`<p class="rev-note">`)
	b.WriteString(html.EscapeString(s.CashNote))
	b.WriteString(`</p><p class="rev-note">`)
	b.WriteString(html.EscapeString(s.PeriodOpenNote))
	b.WriteString(`</p>`)

	totalLabel := s.TotalIncome
	if rep.Kind == "expense" {
		totalLabel = s.TotalExpenses
	}
	avg := int64(0)
	if rep.Days > 0 {
		avg = rep.TotalMMK / int64(rep.Days)
	}
	writeRevenueSettle(&b, []dailySettleRow{
		{Label: totalLabel, Amount: rep.TotalMMK, Emph: true},
		{Label: s.AvgPerDay, Amount: avg, Emph: false},
	}, s.Currency)

	b.WriteString(`<table class="rev-summary"><thead><tr><th>`)
	b.WriteString(html.EscapeString(s.Department))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Bills))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Amount))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Share))
	b.WriteString(`</th></tr></thead><tbody>`)
	if len(rep.ByPortal) == 0 {
		b.WriteString(`<tr><td colspan="4">`)
		if rep.Kind == "income" {
			b.WriteString(html.EscapeString(s.NoIncome))
		} else {
			b.WriteString(html.EscapeString(s.NoExpenses))
		}
		b.WriteString(`</td></tr>`)
	}
	for _, row := range rep.ByPortal {
		share := "—"
		if rep.TotalMMK != 0 {
			share = fmt.Sprintf("%.1f%%", float64(row.Amount)*100/float64(rep.TotalMMK))
		}
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(localizeRevenuePortal(row.Portal, lang, s)))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(strconv.Itoa(row.Bills))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(formatMMK(row.Amount))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(html.EscapeString(share))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</tbody></table>`)

	wroteAny := false
	for _, day := range rep.DaysData {
		if rep.Kind == "income" {
			if writeRevenueIncomeDay(&b, day, s) {
				wroteAny = true
			}
		} else {
			if writeRevenueExpenseDay(&b, day, s) {
				wroteAny = true
			}
		}
	}
	if !wroteAny {
		b.WriteString(`<p class="daily-empty">`)
		if rep.Kind == "income" {
			b.WriteString(html.EscapeString(s.NoIncome))
		} else {
			b.WriteString(html.EscapeString(s.NoExpenses))
		}
		b.WriteString(`</p>`)
	}

	b.WriteString(`<p class="meta">`)
	b.WriteString(html.EscapeString(s.PrintedFrom))
	b.WriteString(`</p></div></body></html>`)
	return b.String()
}

func writeRevenueIncomeDay(b *strings.Builder, day revenueDayBundle, s revenuePrintStrings) bool {
	move := day.Move
	desk := move.Desk
	if desk == nil {
		desk = &cashReport{}
	}
	var earned []ipdCashLine
	if move.IPDEarned != nil {
		earned = move.IPDEarned.Lines
	}
	hasDesk := false
	bySource := map[string][]cashLine{}
	for _, line := range desk.Lines {
		bySource[line.Source] = append(bySource[line.Source], line)
		hasDesk = true
	}
	hasIPD := len(earned) > 0 || len(day.Carry) > 0
	if !hasDesk && !hasIPD {
		return false
	}

	b.WriteString(`<p class="rev-day-head">`)
	b.WriteString(html.EscapeString(dailyReportDateLabel(day.Date)))
	b.WriteString(`</p>`)

	dayTotal := move.IncomeMMK
	for _, portal := range dailyPortalOrder {
		if portal == "IPD" {
			if !hasIPD {
				continue
			}
			writeRevenueIPDIncomeTable(b, earned, day.Carry, s)
			continue
		}
		lines := bySource[portal]
		if len(lines) == 0 {
			continue
		}
		writeRevenueDeskIncomeTable(b, portal, lines, s)
	}
	b.WriteString(`<p class="rev-day-total">`)
	b.WriteString(html.EscapeString(s.DailyTotal))
	b.WriteString(`: `)
	b.WriteString(formatMMK(dayTotal))
	b.WriteString(` `)
	b.WriteString(html.EscapeString(s.Currency))
	b.WriteString(`</p>`)
	return true
}

func writeRevenueExpenseDay(b *strings.Builder, day revenueDayBundle, s revenuePrintStrings) bool {
	lines := day.Move.ExpenseLines
	if len(lines) == 0 {
		return false
	}
	b.WriteString(`<p class="rev-day-head">`)
	b.WriteString(html.EscapeString(dailyReportDateLabel(day.Date)))
	b.WriteString(`</p>`)
	writeRevenueExpenseTables(b, lines, s)
	b.WriteString(`<p class="rev-day-total">`)
	b.WriteString(html.EscapeString(s.DailyTotal))
	b.WriteString(`: `)
	b.WriteString(formatMMK(-day.Move.ExpenseMMK))
	b.WriteString(` `)
	b.WriteString(html.EscapeString(s.Currency))
	b.WriteString(`</p>`)
	return true
}

func writeRevenueDeskIncomeTable(b *strings.Builder, portal string, lines []cashLine, s revenuePrintStrings) {
	openDailyPortalSection(b, localizeRevenuePortal(portal, s.Lang, s))
	b.WriteString(`<table class="daily-table"><thead><tr>`)
	b.WriteString(`<th>`)
	b.WriteString(html.EscapeString(s.Bill))
	b.WriteString(`</th><th>`)
	b.WriteString(html.EscapeString(s.Patient))
	b.WriteString(`</th><th>`)
	b.WriteString(html.EscapeString(s.Doctor))
	b.WriteString(`</th><th>`)
	b.WriteString(html.EscapeString(s.Paid))
	b.WriteString(`</th><th>`)
	b.WriteString(html.EscapeString(s.Remark))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Currency))
	b.WriteString(`</th></tr></thead><tbody>`)
	var subtotal int64
	for _, line := range lines {
		bill := line.BillNo
		if line.Reversal {
			bill += " (" + s.Reversal + ")"
		}
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(bill))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Patient))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Doctor))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.PaidAt))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Remark))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(formatMMK(line.TotalMMK))
		b.WriteString(`</td></tr>`)
		subtotal += line.TotalMMK
	}
	writeRevenueSubtotalRow(b, 5, subtotal, s)
	b.WriteString(`</tbody></table></section>`)
}

func writeRevenueIPDIncomeTable(b *strings.Builder, lines []ipdCashLine, carry []ipdPrintCarryRow, s revenuePrintStrings) {
	openDailyPortalSection(b, localizeRevenuePortal("IPD", s.Lang, s))
	b.WriteString(`<table class="daily-table"><thead><tr>`)
	b.WriteString(`<th>`)
	b.WriteString(html.EscapeString(s.Kind))
	b.WriteString(`</th><th>`)
	b.WriteString(html.EscapeString(s.Admission))
	b.WriteString(`</th><th>`)
	b.WriteString(html.EscapeString(s.Patient))
	b.WriteString(`</th><th>`)
	b.WriteString(html.EscapeString(s.Remark))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Currency))
	b.WriteString(`</th></tr></thead><tbody>`)
	for _, row := range carry {
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(row.Kind))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(row.AdmissionNo))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(row.Patient))
		b.WriteString(`</td><td></td><td class="num">`)
		b.WriteString(formatMMK(row.AmountMMK))
		b.WriteString(`</td></tr>`)
	}
	var subtotal int64
	for _, line := range lines {
		earned := ipdEarnedDisplayMMK(line)
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(line.Kind))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.AdmissionNo))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Patient))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Note))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(formatMMK(earned))
		b.WriteString(`</td></tr>`)
		subtotal += earned
	}
	writeRevenueSubtotalRow(b, 4, subtotal, s)
	b.WriteString(`</tbody></table></section>`)
}

func writeRevenueExpenseTables(b *strings.Builder, lines []expenseCashLine, s revenuePrintStrings) {
	byPortal := map[string][]expenseCashLine{}
	for _, line := range lines {
		key := dailyExpensePortalLabel(line.Portal)
		byPortal[key] = append(byPortal[key], line)
	}
	for _, portal := range dailyPortalOrder {
		group := byPortal[portal]
		if len(group) == 0 {
			continue
		}
		writeRevenueExpensePortalTable(b, portal, group, s)
		delete(byPortal, portal)
	}
	for key, group := range byPortal {
		if len(group) == 0 {
			continue
		}
		writeRevenueExpensePortalTable(b, key, group, s)
	}
}

func writeRevenueExpensePortalTable(b *strings.Builder, portal string, lines []expenseCashLine, s revenuePrintStrings) {
	openDailyPortalSection(b, localizeRevenuePortal(portal, s.Lang, s))
	b.WriteString(`<table class="daily-table"><thead><tr>`)
	b.WriteString(`<th>`)
	b.WriteString(html.EscapeString(s.Bill))
	b.WriteString(`</th><th>`)
	b.WriteString(html.EscapeString(s.Payee))
	b.WriteString(`</th><th>`)
	b.WriteString(html.EscapeString(s.Paid))
	b.WriteString(`</th><th>`)
	b.WriteString(html.EscapeString(s.Remark))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Currency))
	b.WriteString(`</th></tr></thead><tbody>`)
	var subtotal int64
	for _, line := range lines {
		bill := line.BillNo
		if line.Reversal {
			bill += " (" + s.Reversal + ")"
		}
		shown := expenseDisplayMMK(line)
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(bill))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Name))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.PaidAt))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(line.Remark))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(formatMMK(shown))
		b.WriteString(`</td></tr>`)
		subtotal += shown
	}
	writeRevenueSubtotalRow(b, 4, subtotal, s)
	b.WriteString(`</tbody></table></section>`)
}

func writeRevenueSubtotalRow(b *strings.Builder, labelColspan int, amount int64, s revenuePrintStrings) {
	b.WriteString(`<tr class="daily-subtotal"><td colspan="`)
	b.WriteString(fmt.Sprintf("%d", labelColspan))
	b.WriteString(`">`)
	b.WriteString(html.EscapeString(s.Subtotal))
	b.WriteString(`</td><td class="num">`)
	b.WriteString(formatMMK(amount))
	b.WriteString(`</td></tr>`)
}

func writeRevenueSettle(b *strings.Builder, rows []dailySettleRow, currency string) {
	b.WriteString(`<table class="a4-settle">`)
	for _, row := range rows {
		class := ""
		if row.Emph {
			class = ` class="emph"`
		}
		b.WriteString(`<tr`)
		b.WriteString(class)
		b.WriteString(`><td>`)
		b.WriteString(html.EscapeString(row.Label))
		b.WriteString(`</td><td>`)
		b.WriteString(formatMMK(row.Amount))
		b.WriteString(` `)
		b.WriteString(html.EscapeString(currency))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</table>`)
}

func dashboardRevenuePrintCSS() string {
	base := dashboardDailyPrintCSS()
	base = strings.Replace(
		base,
		`font-family:Arial,"Noto Sans Myanmar","Segoe UI",sans-serif;`,
		`font-family:"Myanmar Text","Noto Sans Myanmar",Pyidaungsu,Arial,"Segoe UI",sans-serif;`,
		1,
	)
	return base + `
.rev-note{text-align:center;font-size:9pt;margin:0 0 6px;color:#333}
.rev-summary{width:100%;border-collapse:collapse;margin:14px 0 18px}
.rev-summary th,.rev-summary td{border:1px solid #000;padding:5px 8px;text-align:left}
.rev-summary th{background:#eee;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rev-summary .num{text-align:right;white-space:nowrap}
.rev-day-head{margin:18px 0 8px;font-size:12pt;font-weight:700;border-bottom:1px solid #000;padding-bottom:4px;page-break-after:avoid}
.rev-day-total{margin:4px 0 12px;font-size:10.5pt;font-weight:700;text-align:right}
`
}
