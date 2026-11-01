package handlers

import (
	"database/sql"
	"fmt"
	"html"
	"math"
	"net/http"
	"strings"
	"time"
)

// Income portals shown on the stakeholder pie (zeros kept for a stable layout).
var stakeholderIncomePortals = []string{"OPD", "OT", "IPD", "Pharmacy", "Lab"}

// Expense portals shown on the stakeholder pie (zeros kept).
var stakeholderExpensePortals = []string{"OPD", "OT", "IPD", "Pharmacy", "Lab", "Expenses"}

var stakeholderPortalColor = map[string]string{
	"OPD":      "#2563EB",
	"OT":       "#4a90c8",
	"IPD":      "#6b4fa0",
	"Pharmacy": "#1f7a4d",
	"Lab":      "#a16207",
	"Expenses": "#b45309",
}

type stakeholderPortalRow struct {
	Portal string
	Bills  int
	Amount int64
}

type stakeholderBucket struct {
	Label       string
	IncomeMMK   int64
	ExpenseMMK  int64 // display positive
	ResultMMK   int64 // income + signed expense
}

type stakeholderTotals struct {
	IncomeMMK  int64
	ExpenseMMK int64 // display positive
	ResultMMK  int64
	CashMMK    int64
	OnlineMMK  int64
}

type stakeholderActivity struct {
	OPDBills      int
	OTBills       int
	PharmacyBills int
	LabBills      int
	IPDLines      int
	Admissions    int
	Discharges    int
	ALOSDays      float64
	OwedToMMK     int64
	OwedByMMK     int64
}

type stakeholderPresentation struct {
	From          string
	To            string
	Days          int
	TitleKind     string // month | year | period
	BucketKind    string // day | month
	Current       stakeholderTotals
	Previous      stakeholderTotals
	PrevFrom      string
	PrevTo        string
	IncomeByPortal []stakeholderPortalRow
	ExpenseByPortal []stakeholderPortalRow
	Buckets       []stakeholderBucket
	Pharmacy      *pharmacyMarginReport
	Activity      stakeholderActivity
}

type stakeholderCopy struct {
	Lang            string
	TitleMonth      string
	TitleYear       string
	TitlePeriod     string
	Period          string
	CashNote        string
	Revenue         string
	Expenses        string
	Result          string
	VsPrevious      string
	PreviousPeriod  string
	IncomeSources   string
	ExpenseSources  string
	Department      string
	Bills           string
	Amount          string
	Share           string
	CashVsOnline    string
	CashPay         string
	OnlinePay       string
	AcrossPeriod    string
	ByDay           string
	ByMonth         string
	PharmacyTrading string
	PharmacySales   string
	PharmacyCOGS    string
	PharmacyMargin  string
	MarginPct       string
	TopItems        string
	Item            string
	Qty             string
	PharmacyNote    string
	ActivityTitle   string
	ActivityNote    string
	OPDBills        string
	OTBills         string
	PharmacyBills   string
	LabBills        string
	IPDLines        string
	Admissions      string
	Discharges      string
	ALOS            string
	DaysUnit        string
	HeldForPatients string
	OwedByPatients  string
	LimitsTitle     string
	LimitsBody      string
	NoData          string
	Currency        string
	PrintedFrom     string
	PharmacyPortal  string
	ExpensesPortal  string
}

func stakeholderStrings(lang string) stakeholderCopy {
	if lang == "my" {
		return stakeholderCopy{
			Lang:            "my",
			TitleMonth:      "လစဉ် စွမ်းဆောင်ရည် အစီရင်ခံစာ",
			TitleYear:       "နှစ်စဉ် စွမ်းဆောင်ရည် အစီရင်ခံစာ",
			TitlePeriod:     "စွမ်းဆောင်ရည် အစီရင်ခံစာ",
			Period:          "ကာလ",
			CashNote:        "ငွေသားမှတ်တမ်း။ ဝင်ငွေနှင့် အသုံးစရိတ် ပရင့်နှင့် တူညီသော စုစုပေါင်း။ စစ်ဆေးပြီး ဘဏ္ဍာရေးစာရင်း မဟုတ်။",
			Revenue:         "ဝင်ငွေ",
			Expenses:        "အသုံးစရိတ်",
			Result:          "ရလဒ်",
			VsPrevious:      "ယခင်ကာလနှင့်",
			PreviousPeriod:  "ယခင်ကာလ",
			IncomeSources:   "ဝင်ငွေ ရင်းမြစ်များ",
			ExpenseSources:  "အသုံးစရိတ် ရင်းမြစ်များ",
			Department:      "ဌာန",
			Bills:           "ဘေလ်",
			Amount:          "ပမာဏ",
			Share:           "အစိတ်အပိုင်း",
			CashVsOnline:    "ငွေသား / အွန်လိုင်း",
			CashPay:         "ငွေသား",
			OnlinePay:       "အွန်လိုင်း",
			AcrossPeriod:    "ကာလတစ်လျှောက်",
			ByDay:           "နေ့အလိုက်",
			ByMonth:         "လအလိုက်",
			PharmacyTrading: "ဆေးဆိုင် ရောင်းဝယ်မှု",
			PharmacySales:   "ရောင်းရငွေ",
			PharmacyCOGS:    "ခန့်မှန်း ကုန်ကျစရိတ်",
			PharmacyMargin:  "ခန့်မှန်း အမြတ်",
			MarginPct:       "အမြတ် %",
			TopItems:        "ထိပ်တန်း ပစ္စည်းများ",
			Item:            "ပစ္စည်း",
			Qty:             "အရေအတွက်",
			PharmacyNote:    "လက်ရှိ ဝယ်ဈေးဖြင့် ခန့်မှန်းချက်။ ဝယ်ကုန်စရိတ်ကို ရလဒ်မှ ထပ်မနှုတ်ပါ (ဝယ်ယူငွေသည် အသုံးစရိတ်ထဲတွင် ရှိပြီးဖြစ်သည်).",
			ActivityTitle:   "လုပ်ငန်းဆောင်တာ (ငွေ မဟုတ်)",
			ActivityNote:    "ဖွင့်နေသော တက်ရောက်မှု လက်ကျန်သည် မှတ်ချက်သာ။ ရလဒ်ကို မပြောင်းလဲ။",
			OPDBills:        "OPD ဘေလ်",
			OTBills:         "OT ဘေလ်",
			PharmacyBills:   "ဆေးဆိုင် ဘေလ်",
			LabBills:        "ဓာတ်ခွဲ ဘေလ်",
			IPDLines:        "IPD လိုင်းများ",
			Admissions:      "တက်ရောက်မှု",
			Discharges:      "ဆင်းခွာမှု",
			ALOS:            "ပျမ်းမျှ နေရက်",
			DaysUnit:        "ရက်",
			HeldForPatients: "လူနာအတွက် ကျန်ငွေ",
			OwedByPatients:  "လူနာ ပေးရန်ကျန်",
			LimitsTitle:     "ဤအစီရင်ခံစာတွင် မပါသော အရာများ",
			LimitsBody:      "ဘဏ်လက်ကျန်၊ အကြွေး၊ လစာစာရင်း၊ ကုတင်နေရာယူမှု၊ လှူဒါန်းမှု၊ ကူညီစောင့်ရှောက်မှု အစီအစဉ်၊ သို့မဟုတ် ဆေးကုသမှု ရလဒ်များ မပါ။ လစာသည် အသုံးစရိတ် ဘေလ်အဖြစ် ရိုက်ထည့်မှသာ ပေါ်သည်။",
			NoData:          "ဤကာလတွင် မှတ်တမ်း မရှိ။",
			Currency:        "ကျပ်",
			PrintedFrom:     "Mudita Hospital မှ ပရင့်",
			PharmacyPortal:  "ဆေးဆိုင်",
			ExpensesPortal:  "အသုံးစရိတ်",
		}
	}
	return stakeholderCopy{
		Lang:            "en",
		TitleMonth:      "Monthly performance report",
		TitleYear:       "Annual performance report",
		TitlePeriod:     "Performance report",
		Period:          "Period",
		CashNote:        "Cash records. Same totals as the income and expense prints. Not an audited financial statement.",
		Revenue:         "Revenue",
		Expenses:        "Expenses",
		Result:          "Result",
		VsPrevious:      "vs previous",
		PreviousPeriod:  "Previous period",
		IncomeSources:   "Where the money came from",
		ExpenseSources:  "Where the money went",
		Department:      "Department",
		Bills:           "Bills",
		Amount:          "Amount",
		Share:           "Share",
		CashVsOnline:    "Cash vs online",
		CashPay:         "Cash",
		OnlinePay:       "Online",
		AcrossPeriod:    "Across the period",
		ByDay:           "By day",
		ByMonth:         "By month",
		PharmacyTrading: "Pharmacy trading",
		PharmacySales:   "Sales",
		PharmacyCOGS:    "Estimated cost",
		PharmacyMargin:  "Estimated gross margin",
		MarginPct:       "Margin %",
		TopItems:        "Top items by revenue",
		Item:            "Item",
		Qty:             "Qty",
		PharmacyNote:    "Estimated from current buy prices. Do not deduct this margin from the result — purchases are already inside expenses.",
		ActivityTitle:   "Activity (not money)",
		ActivityNote:    "Open-stay balances are a memo. They do not change the result.",
		OPDBills:        "OPD bills",
		OTBills:         "OT bills",
		PharmacyBills:   "Pharmacy bills",
		LabBills:        "Lab bills",
		IPDLines:        "IPD lines",
		Admissions:      "Admissions",
		Discharges:      "Discharges",
		ALOS:            "Average length of stay",
		DaysUnit:        "days",
		HeldForPatients: "Still held for patients",
		OwedByPatients:  "Still owed by patients",
		LimitsTitle:     "What this does not show",
		LimitsBody:      "No bank balance, debt, payroll account, bed occupancy, donations, charity program, or clinical outcomes. A salary appears only when someone entered it as an expense bill.",
		NoData:          "No cash recorded in this period.",
		Currency:        "MMK",
		PrintedFrom:     "Printed from Mudita Hospital",
		PharmacyPortal:  "Pharmacy",
		ExpensesPortal:  "Expenses",
	}
}

func localizeStakeholderPortal(portal, lang string, s stakeholderCopy) string {
	if lang != "my" {
		return portal
	}
	switch portal {
	case "Pharmacy":
		return s.PharmacyPortal
	case "Expenses":
		return s.ExpensesPortal
	default:
		return portal
	}
}

func stakeholderTitleKind(from, to string) string {
	fromT, err1 := time.Parse("2006-01-02", from)
	toT, err2 := time.Parse("2006-01-02", to)
	if err1 != nil || err2 != nil {
		return "period"
	}
	if fromT.Day() == 1 && toT.Year() == fromT.Year() && toT.Month() == fromT.Month() {
		last := time.Date(fromT.Year(), fromT.Month()+1, 0, 0, 0, 0, 0, time.UTC)
		if toT.Day() == last.Day() {
			return "month"
		}
	}
	if fromT.Month() == time.January && fromT.Day() == 1 &&
		toT.Month() == time.December && toT.Day() == 31 &&
		fromT.Year() == toT.Year() {
		return "year"
	}
	return "period"
}

func stakeholderBucketKind(days int) string {
	if days > 31 {
		return "month"
	}
	return "day"
}

func previousStakeholderWindow(from, to string) (prevFrom, prevTo string, days int, err error) {
	fromT, err := time.Parse("2006-01-02", from)
	if err != nil {
		return "", "", 0, err
	}
	toT, err := time.Parse("2006-01-02", to)
	if err != nil {
		return "", "", 0, err
	}
	days = int(toT.Sub(fromT).Hours()/24) + 1
	prevToT := fromT.AddDate(0, 0, -1)
	prevFromT := prevToT.AddDate(0, 0, -(days - 1))
	return prevFromT.Format("2006-01-02"), prevToT.Format("2006-01-02"), days, nil
}

func sumStakeholderTotals(db *sql.DB, from, to string) (stakeholderTotals, error) {
	var tot stakeholderTotals
	fromT, err := time.Parse("2006-01-02", from)
	if err != nil {
		return tot, err
	}
	toT, err := time.Parse("2006-01-02", to)
	if err != nil {
		return tot, err
	}
	for d := fromT; !d.After(toT); d = d.AddDate(0, 0, 1) {
		move, err := buildCashMovement(db, d.Format("2006-01-02"))
		if err != nil {
			return tot, err
		}
		tot.IncomeMMK += move.IncomeMMK
		tot.ExpenseMMK += -move.ExpenseMMK
		tot.ResultMMK += move.IncomeMMK + move.ExpenseMMK
		if move.Desk != nil {
			tot.CashMMK += move.Desk.CashTotal
			tot.OnlineMMK += move.Desk.OnlineTotal
		}
	}
	return tot, nil
}

func buildStakeholderIPDActivity(db *sql.DB, from, to string) (admissions, discharges int, alos float64, err error) {
	err = db.QueryRow(`
		SELECT COUNT(*) FROM ipd_admissions
		WHERE status != 'deleted'
		  AND admitted_at IS NOT NULL AND TRIM(admitted_at) != ''
		  AND date(admitted_at) BETWEEN date(?) AND date(?)
	`, from, to).Scan(&admissions)
	if err != nil {
		return 0, 0, 0, err
	}
	err = db.QueryRow(`
		SELECT COUNT(*),
		       COALESCE(AVG(julianday(discharged_at) - julianday(admitted_at)), 0)
		FROM ipd_admissions
		WHERE status = 'settled'
		  AND discharged_at IS NOT NULL AND TRIM(discharged_at) != ''
		  AND admitted_at IS NOT NULL AND TRIM(admitted_at) != ''
		  AND date(discharged_at) BETWEEN date(?) AND date(?)
	`, from, to).Scan(&discharges, &alos)
	if err != nil {
		return admissions, 0, 0, err
	}
	return admissions, discharges, alos, nil
}

func buildStakeholderPresentation(db *sql.DB, from, to string) (*stakeholderPresentation, error) {
	fromT, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, err
	}
	toT, err := time.Parse("2006-01-02", to)
	if err != nil {
		return nil, err
	}
	days := int(toT.Sub(fromT).Hours()/24) + 1
	titleKind := stakeholderTitleKind(from, to)
	bucketKind := stakeholderBucketKind(days)

	incomeAmt := map[string]int64{}
	incomeBills := map[string]int{}
	expenseAmt := map[string]int64{}
	expenseBills := map[string]int{}
	for _, p := range stakeholderIncomePortals {
		incomeAmt[p] = 0
		incomeBills[p] = 0
	}
	for _, p := range stakeholderExpensePortals {
		expenseAmt[p] = 0
		expenseBills[p] = 0
	}

	var current stakeholderTotals
	var activity stakeholderActivity
	dayBuckets := map[string]*stakeholderBucket{}
	monthBuckets := map[string]*stakeholderBucket{}
	var monthOrder []string

	for d := fromT; !d.After(toT); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		move, err := buildCashMovement(db, key)
		if err != nil {
			return nil, err
		}
		dayIncome := move.IncomeMMK
		dayExpense := -move.ExpenseMMK
		dayResult := move.IncomeMMK + move.ExpenseMMK
		current.IncomeMMK += dayIncome
		current.ExpenseMMK += dayExpense
		current.ResultMMK += dayResult
		if move.Desk != nil {
			current.CashMMK += move.Desk.CashTotal
			current.OnlineMMK += move.Desk.OnlineTotal
			activity.OPDBills += move.Desk.OPDCount
			activity.OTBills += move.Desk.OTCount
			activity.PharmacyBills += move.Desk.PharmacyCount
			activity.LabBills += move.Desk.LabCount
			for _, line := range move.Desk.Lines {
				incomeAmt[line.Source] += line.TotalMMK
				incomeBills[line.Source]++
			}
		}
		if move.IPDEarned != nil {
			for _, line := range move.IPDEarned.Lines {
				incomeAmt["IPD"] += ipdEarnedDisplayMMK(line)
				incomeBills["IPD"]++
				activity.IPDLines++
			}
		}
		for _, line := range move.ExpenseLines {
			portal := dailyExpensePortalLabel(line.Portal)
			expenseAmt[portal] += expenseDisplayMMK(line)
			expenseBills[portal]++
		}

		dayBuckets[key] = &stakeholderBucket{
			Label:      dailyReportDateLabel(key),
			IncomeMMK:  dayIncome,
			ExpenseMMK: dayExpense,
			ResultMMK:  dayResult,
		}
		monthKey := d.Format("2006-01")
		mb, ok := monthBuckets[monthKey]
		if !ok {
			mb = &stakeholderBucket{Label: d.Format("Jan 2006")}
			monthBuckets[monthKey] = mb
			monthOrder = append(monthOrder, monthKey)
		}
		mb.IncomeMMK += dayIncome
		mb.ExpenseMMK += dayExpense
		mb.ResultMMK += dayResult
	}

	open, err := buildIpdOpenStays(db, to)
	if err != nil {
		return nil, err
	}
	activity.OwedToMMK = open.OwedToPatientsMMK
	activity.OwedByMMK = open.OwedByPatientsMMK
	admissions, discharges, alos, err := buildStakeholderIPDActivity(db, from, to)
	if err != nil {
		return nil, err
	}
	activity.Admissions = admissions
	activity.Discharges = discharges
	activity.ALOSDays = alos

	prevFrom, prevTo, _, err := previousStakeholderWindow(from, to)
	if err != nil {
		return nil, err
	}
	previous, err := sumStakeholderTotals(db, prevFrom, prevTo)
	if err != nil {
		return nil, err
	}

	margin, err := buildPharmacyMargin(db, from, to)
	if err != nil {
		return nil, err
	}

	incomeRows := make([]stakeholderPortalRow, 0, len(stakeholderIncomePortals))
	for _, p := range stakeholderIncomePortals {
		incomeRows = append(incomeRows, stakeholderPortalRow{
			Portal: p,
			Bills:  incomeBills[p],
			Amount: incomeAmt[p],
		})
	}
	expenseRows := make([]stakeholderPortalRow, 0, len(stakeholderExpensePortals))
	for _, p := range stakeholderExpensePortals {
		expenseRows = append(expenseRows, stakeholderPortalRow{
			Portal: p,
			Bills:  expenseBills[p],
			Amount: expenseAmt[p],
		})
	}

	var buckets []stakeholderBucket
	if bucketKind == "month" {
		buckets = make([]stakeholderBucket, 0, len(monthOrder))
		for _, mk := range monthOrder {
			buckets = append(buckets, *monthBuckets[mk])
		}
	} else {
		buckets = make([]stakeholderBucket, 0, days)
		for d := fromT; !d.After(toT); d = d.AddDate(0, 0, 1) {
			key := d.Format("2006-01-02")
			buckets = append(buckets, *dayBuckets[key])
		}
	}

	return &stakeholderPresentation{
		From:            from,
		To:              to,
		Days:            days,
		TitleKind:       titleKind,
		BucketKind:      bucketKind,
		Current:         current,
		Previous:        previous,
		PrevFrom:        prevFrom,
		PrevTo:          prevTo,
		IncomeByPortal:  incomeRows,
		ExpenseByPortal: expenseRows,
		Buckets:         buckets,
		Pharmacy:        margin,
		Activity:        activity,
	}, nil
}

func (h *Dashboard) revenueReportPresentation(w http.ResponseWriter, r *http.Request) {
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
	rep, err := buildStakeholderPresentation(h.DB, from, to)
	if err != nil {
		http.Error(w, "report failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderStakeholderHTML(hosp, rep, lang)))
}

func stakeholderHeading(rep *stakeholderPresentation, s stakeholderCopy) string {
	switch rep.TitleKind {
	case "month":
		return s.TitleMonth
	case "year":
		return s.TitleYear
	default:
		return s.TitlePeriod
	}
}

func formatStakeholderDelta(cur, prev int64) string {
	d := cur - prev
	if d > 0 {
		return "+" + formatMMK(d)
	}
	return formatMMK(d)
}

func formatStakeholderPct(amount, total int64) string {
	if total == 0 {
		return "—"
	}
	return fmt.Sprintf("%.1f%%", float64(amount)*100/float64(total))
}

func formatALOS(days float64) string {
	if days <= 0 {
		return "—"
	}
	return fmt.Sprintf("%.1f", days)
}

func renderStakeholderHTML(hosp *hospitalSettings, rep *stakeholderPresentation, lang string) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	s := stakeholderStrings(lang)
	heading := stakeholderHeading(rep, s)
	periodLabel := dailyReportDateLabel(rep.From) + " – " + dailyReportDateLabel(rep.To)
	prevLabel := dailyReportDateLabel(rep.PrevFrom) + " – " + dailyReportDateLabel(rep.PrevTo)

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
	b.WriteString(stakeholderPrintCSS())
	b.WriteString("</style></head><body>")

	// 1. Cover
	b.WriteString(`<section class="slide cover">`)
	writeA4Letterhead(&b, hosp)
	b.WriteString(`<h1 class="slide-title">`)
	b.WriteString(html.EscapeString(heading))
	b.WriteString(`</h1><p class="period">`)
	b.WriteString(html.EscapeString(s.Period))
	b.WriteString(`: `)
	b.WriteString(html.EscapeString(periodLabel))
	b.WriteString(`</p><p class="note">`)
	b.WriteString(html.EscapeString(s.CashNote))
	b.WriteString(`</p><p class="footer">`)
	b.WriteString(html.EscapeString(s.PrintedFrom))
	b.WriteString(`</p></section>`)

	// 2. Three numbers
	b.WriteString(`<section class="slide"><h2>`)
	b.WriteString(html.EscapeString(heading))
	b.WriteString(`</h2><p class="sub">`)
	b.WriteString(html.EscapeString(s.PreviousPeriod))
	b.WriteString(`: `)
	b.WriteString(html.EscapeString(prevLabel))
	b.WriteString(`</p><div class="kpi-row">`)
	writeStakeholderKPI(&b, s.Revenue, rep.Current.IncomeMMK, rep.Previous.IncomeMMK, s)
	writeStakeholderKPI(&b, s.Expenses, rep.Current.ExpenseMMK, rep.Previous.ExpenseMMK, s)
	writeStakeholderKPI(&b, s.Result, rep.Current.ResultMMK, rep.Previous.ResultMMK, s)
	b.WriteString(`</div></section>`)

	// 3. Income sources
	b.WriteString(`<section class="slide"><h2>`)
	b.WriteString(html.EscapeString(s.IncomeSources))
	b.WriteString(`</h2><div class="split">`)
	writeStakeholderPie(&b, rep.IncomeByPortal, rep.Current.IncomeMMK, lang, s)
	b.WriteString(`<div class="split-table">`)
	writeStakeholderPortalTable(&b, rep.IncomeByPortal, rep.Current.IncomeMMK, lang, s)
	b.WriteString(`<p class="cash-line"><strong>`)
	b.WriteString(html.EscapeString(s.CashVsOnline))
	b.WriteString(`:</strong> `)
	b.WriteString(html.EscapeString(s.CashPay))
	b.WriteString(` `)
	b.WriteString(html.EscapeString(formatMMK(rep.Current.CashMMK)))
	b.WriteString(` `)
	b.WriteString(html.EscapeString(s.Currency))
	b.WriteString(` · `)
	b.WriteString(html.EscapeString(s.OnlinePay))
	b.WriteString(` `)
	b.WriteString(html.EscapeString(formatMMK(rep.Current.OnlineMMK)))
	b.WriteString(` `)
	b.WriteString(html.EscapeString(s.Currency))
	b.WriteString(`</p></div></div></section>`)

	// 4. Expense sources
	b.WriteString(`<section class="slide"><h2>`)
	b.WriteString(html.EscapeString(s.ExpenseSources))
	b.WriteString(`</h2><div class="split">`)
	writeStakeholderPie(&b, rep.ExpenseByPortal, rep.Current.ExpenseMMK, lang, s)
	b.WriteString(`<div class="split-table">`)
	writeStakeholderPortalTable(&b, rep.ExpenseByPortal, rep.Current.ExpenseMMK, lang, s)
	b.WriteString(`</div></div></section>`)

	// 5. Across the period
	acrossSub := s.ByDay
	if rep.BucketKind == "month" {
		acrossSub = s.ByMonth
	}
	b.WriteString(`<section class="slide"><h2>`)
	b.WriteString(html.EscapeString(s.AcrossPeriod))
	b.WriteString(` — `)
	b.WriteString(html.EscapeString(acrossSub))
	b.WriteString(`</h2><div class="split">`)
	writeStakeholderBars(&b, rep.Buckets, s)
	b.WriteString(`<div class="split-table scroll">`)
	writeStakeholderBucketTable(&b, rep.Buckets, s)
	b.WriteString(`</div></div></section>`)

	// 6. Pharmacy trading
	b.WriteString(`<section class="slide"><h2>`)
	b.WriteString(html.EscapeString(s.PharmacyTrading))
	b.WriteString(`</h2>`)
	ph := rep.Pharmacy
	if ph == nil {
		ph = &pharmacyMarginReport{}
	}
	b.WriteString(`<div class="kpi-row kpi-row-sm">`)
	writeStakeholderSimpleKPI(&b, s.PharmacySales, ph.RevenueMMK, s)
	writeStakeholderSimpleKPI(&b, s.PharmacyCOGS, ph.COGSMMK, s)
	writeStakeholderSimpleKPI(&b, s.PharmacyMargin, ph.MarginMMK, s)
	b.WriteString(`<div class="kpi"><p class="kpi-label">`)
	b.WriteString(html.EscapeString(s.MarginPct))
	b.WriteString(`</p><p class="kpi-value">`)
	if ph.RevenueMMK == 0 {
		b.WriteString("—")
	} else {
		b.WriteString(html.EscapeString(fmt.Sprintf("%.1f%%", ph.MarginPct)))
	}
	b.WriteString(`</p></div></div>`)
	b.WriteString(`<table class="data"><thead><tr><th>`)
	b.WriteString(html.EscapeString(s.Item))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Qty))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.PharmacySales))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.PharmacyMargin))
	b.WriteString(`</th></tr></thead><tbody>`)
	top := ph.TopByRevenue
	if len(top) > 8 {
		top = top[:8]
	}
	if len(top) == 0 {
		b.WriteString(`<tr><td colspan="4">`)
		b.WriteString(html.EscapeString(s.NoData))
		b.WriteString(`</td></tr>`)
	}
	for _, row := range top {
		name := row.Name
		if row.Code != "" {
			name = row.Code + " — " + row.Name
		}
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(name))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(html.EscapeString(formatMMK(row.QtySold)))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(html.EscapeString(formatMMK(row.RevenueMMK)))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(html.EscapeString(formatMMK(row.MarginMMK)))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</tbody></table><p class="note">`)
	b.WriteString(html.EscapeString(s.PharmacyNote))
	b.WriteString(`</p></section>`)

	// 7. Activity
	act := rep.Activity
	b.WriteString(`<section class="slide"><h2>`)
	b.WriteString(html.EscapeString(s.ActivityTitle))
	b.WriteString(`</h2><div class="act-grid">`)
	writeStakeholderActCell(&b, s.OPDBills, formatMMK(int64(act.OPDBills)))
	writeStakeholderActCell(&b, s.OTBills, formatMMK(int64(act.OTBills)))
	writeStakeholderActCell(&b, s.PharmacyBills, formatMMK(int64(act.PharmacyBills)))
	writeStakeholderActCell(&b, s.LabBills, formatMMK(int64(act.LabBills)))
	writeStakeholderActCell(&b, s.IPDLines, formatMMK(int64(act.IPDLines)))
	writeStakeholderActCell(&b, s.Admissions, formatMMK(int64(act.Admissions)))
	writeStakeholderActCell(&b, s.Discharges, formatMMK(int64(act.Discharges)))
	alosLabel := formatALOS(act.ALOSDays)
	if alosLabel != "—" {
		alosLabel = alosLabel + " " + s.DaysUnit
	}
	writeStakeholderActCell(&b, s.ALOS, alosLabel)
	writeStakeholderActCell(&b, s.HeldForPatients, formatMMK(act.OwedToMMK)+" "+s.Currency)
	writeStakeholderActCell(&b, s.OwedByPatients, formatMMK(act.OwedByMMK)+" "+s.Currency)
	b.WriteString(`</div><p class="note">`)
	b.WriteString(html.EscapeString(s.ActivityNote))
	b.WriteString(`</p></section>`)

	// 8. Limits
	b.WriteString(`<section class="slide"><h2>`)
	b.WriteString(html.EscapeString(s.LimitsTitle))
	b.WriteString(`</h2><p class="limits">`)
	b.WriteString(html.EscapeString(s.LimitsBody))
	b.WriteString(`</p><p class="footer">`)
	b.WriteString(html.EscapeString(s.PrintedFrom))
	b.WriteString(`</p></section>`)

	b.WriteString(`</body></html>`)
	return b.String()
}

func writeStakeholderKPI(b *strings.Builder, label string, cur, prev int64, s stakeholderCopy) {
	b.WriteString(`<div class="kpi"><p class="kpi-label">`)
	b.WriteString(html.EscapeString(label))
	b.WriteString(`</p><p class="kpi-value">`)
	b.WriteString(html.EscapeString(formatMMK(cur)))
	b.WriteString(` <span class="unit">`)
	b.WriteString(html.EscapeString(s.Currency))
	b.WriteString(`</span></p><p class="kpi-delta">`)
	b.WriteString(html.EscapeString(s.VsPrevious))
	b.WriteString(` `)
	b.WriteString(html.EscapeString(formatStakeholderDelta(cur, prev)))
	b.WriteString(`</p></div>`)
}

func writeStakeholderSimpleKPI(b *strings.Builder, label string, amount int64, s stakeholderCopy) {
	b.WriteString(`<div class="kpi"><p class="kpi-label">`)
	b.WriteString(html.EscapeString(label))
	b.WriteString(`</p><p class="kpi-value">`)
	b.WriteString(html.EscapeString(formatMMK(amount)))
	b.WriteString(` <span class="unit">`)
	b.WriteString(html.EscapeString(s.Currency))
	b.WriteString(`</span></p></div>`)
}

func writeStakeholderActCell(b *strings.Builder, label, value string) {
	b.WriteString(`<div class="act"><p class="kpi-label">`)
	b.WriteString(html.EscapeString(label))
	b.WriteString(`</p><p class="kpi-value">`)
	b.WriteString(html.EscapeString(value))
	b.WriteString(`</p></div>`)
}

func writeStakeholderPortalTable(b *strings.Builder, rows []stakeholderPortalRow, total int64, lang string, s stakeholderCopy) {
	b.WriteString(`<table class="data"><thead><tr><th>`)
	b.WriteString(html.EscapeString(s.Department))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Bills))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Amount))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Share))
	b.WriteString(`</th></tr></thead><tbody>`)
	any := false
	for _, row := range rows {
		if row.Amount != 0 || row.Bills != 0 {
			any = true
		}
		color := stakeholderPortalColor[row.Portal]
		b.WriteString(`<tr><td><span class="swatch" style="background:`)
		b.WriteString(html.EscapeString(color))
		b.WriteString(`"></span>`)
		b.WriteString(html.EscapeString(localizeStakeholderPortal(row.Portal, lang, s)))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(html.EscapeString(formatMMK(int64(row.Bills))))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(html.EscapeString(formatMMK(row.Amount)))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(html.EscapeString(formatStakeholderPct(row.Amount, total)))
		b.WriteString(`</td></tr>`)
	}
	if !any {
		b.WriteString(`<tr><td colspan="4">`)
		b.WriteString(html.EscapeString(s.NoData))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</tbody></table>`)
}

func writeStakeholderBucketTable(b *strings.Builder, buckets []stakeholderBucket, s stakeholderCopy) {
	b.WriteString(`<table class="data compact"><thead><tr><th>`)
	b.WriteString(html.EscapeString(s.Period))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Revenue))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Expenses))
	b.WriteString(`</th><th class="num">`)
	b.WriteString(html.EscapeString(s.Result))
	b.WriteString(`</th></tr></thead><tbody>`)
	for _, row := range buckets {
		b.WriteString(`<tr><td>`)
		b.WriteString(html.EscapeString(row.Label))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(html.EscapeString(formatMMK(row.IncomeMMK)))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(html.EscapeString(formatMMK(row.ExpenseMMK)))
		b.WriteString(`</td><td class="num">`)
		b.WriteString(html.EscapeString(formatMMK(row.ResultMMK)))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</tbody></table>`)
}

func writeStakeholderPie(b *strings.Builder, rows []stakeholderPortalRow, total int64, lang string, s stakeholderCopy) {
	const size = 280.0
	const cx = 140.0
	const cy = 140.0
	const r = 110.0
	b.WriteString(`<div class="chart"><svg viewBox="0 0 280 280" width="280" height="280" role="img" aria-label="`)
	b.WriteString(html.EscapeString(s.Share))
	b.WriteString(`">`)
	if total <= 0 {
		b.WriteString(`<circle cx="140" cy="140" r="110" fill="#e5e7eb"/>`)
		b.WriteString(`<text x="140" y="145" text-anchor="middle" font-size="16" fill="#6b7280">`)
		b.WriteString(html.EscapeString(s.NoData))
		b.WriteString(`</text></svg></div>`)
		return
	}
	start := -math.Pi / 2
	for _, row := range rows {
		if row.Amount <= 0 {
			continue
		}
		sweep := float64(row.Amount) / float64(total) * 2 * math.Pi
		if sweep >= 2*math.Pi-0.0001 {
			// Full circle
			color := stakeholderPortalColor[row.Portal]
			b.WriteString(`<circle cx="140" cy="140" r="110" fill="`)
			b.WriteString(html.EscapeString(color))
			b.WriteString(`"/>`)
			start += sweep
			continue
		}
		end := start + sweep
		x1 := cx + r*math.Cos(start)
		y1 := cy + r*math.Sin(start)
		x2 := cx + r*math.Cos(end)
		y2 := cy + r*math.Sin(end)
		large := 0
		if sweep > math.Pi {
			large = 1
		}
		color := stakeholderPortalColor[row.Portal]
		b.WriteString(`<path d="M `)
		b.WriteString(fmt.Sprintf("%.2f %.2f L %.2f %.2f A %.0f %.0f 0 %d 1 %.2f %.2f Z",
			cx, cy, x1, y1, r, r, large, x2, y2))
		b.WriteString(`" fill="`)
		b.WriteString(html.EscapeString(color))
		b.WriteString(`"><title>`)
		b.WriteString(html.EscapeString(localizeStakeholderPortal(row.Portal, lang, s)))
		b.WriteString(` </title></path>`)
		start = end
	}
	b.WriteString(`</svg></div>`)
}

func writeStakeholderBars(b *strings.Builder, buckets []stakeholderBucket, s stakeholderCopy) {
	const width = 520.0
	const height = 320.0
	const padL = 48.0
	const padR = 12.0
	const padT = 16.0
	const padB = 56.0
	plotW := width - padL - padR
	plotH := height - padT - padB

	var maxAbs float64
	for _, row := range buckets {
		for _, v := range []int64{row.IncomeMMK, row.ExpenseMMK, abs64(row.ResultMMK)} {
			if float64(v) > maxAbs {
				maxAbs = float64(v)
			}
		}
	}
	if maxAbs == 0 {
		maxAbs = 1
	}

	n := len(buckets)
	if n == 0 {
		b.WriteString(`<div class="chart"><p class="note">`)
		b.WriteString(html.EscapeString(s.NoData))
		b.WriteString(`</p></div>`)
		return
	}
	groupW := plotW / float64(n)
	barW := groupW / 4.2
	if barW > 18 {
		barW = 18
	}

	b.WriteString(`<div class="chart"><svg viewBox="0 0 520 320" width="520" height="320" role="img" aria-label="`)
	b.WriteString(html.EscapeString(s.AcrossPeriod))
	b.WriteString(`">`)
	// Axis
	b.WriteString(fmt.Sprintf(`<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#9ca3af" stroke-width="1"/>`,
		padL, padT+plotH, padL+plotW, padT+plotH))
	b.WriteString(fmt.Sprintf(`<text x="8" y="%.0f" font-size="11" fill="#6b7280">%s</text>`,
		padT+12, html.EscapeString(formatMMK(int64(maxAbs)))))
	b.WriteString(fmt.Sprintf(`<text x="8" y="%.0f" font-size="11" fill="#6b7280">0</text>`, padT+plotH))

	for i, row := range buckets {
		baseX := padL + float64(i)*groupW + groupW*0.15
		vals := []struct {
			v     int64
			color string
		}{
			{row.IncomeMMK, "#2563EB"},
			{row.ExpenseMMK, "#b45309"},
			{row.ResultMMK, "#1f7a4d"},
		}
		for j, bar := range vals {
			h := float64(abs64(bar.v)) / maxAbs * plotH
			x := baseX + float64(j)*(barW+2)
			y := padT + plotH - h
			if bar.v < 0 {
				// Draw below axis slightly for negative result (clip to plot).
				y = padT + plotH
				if h > plotH*0.25 {
					h = plotH * 0.25
				}
			}
			b.WriteString(fmt.Sprintf(
				`<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"><title>%s</title></rect>`,
				x, y, barW, h, bar.color, html.EscapeString(row.Label+" "+formatMMK(bar.v)),
			))
		}
		label := row.Label
		if len(label) > 8 && n > 12 {
			label = label[:6] + "…"
		}
		b.WriteString(fmt.Sprintf(
			`<text x="%.1f" y="%.0f" text-anchor="middle" font-size="10" fill="#374151" transform="rotate(-35 %.1f %.0f)">%s</text>`,
			baseX+barW*1.5, padT+plotH+18, baseX+barW*1.5, padT+plotH+18, html.EscapeString(label),
		))
	}
	// Legend
	legY := height - 10
	b.WriteString(fmt.Sprintf(`<rect x="%.0f" y="%.0f" width="12" height="12" fill="#2563EB"/>`, padL, legY-10))
	b.WriteString(fmt.Sprintf(`<text x="%.0f" y="%.0f" font-size="12" fill="#111">%s</text>`, padL+16, legY, html.EscapeString(s.Revenue)))
	b.WriteString(fmt.Sprintf(`<rect x="%.0f" y="%.0f" width="12" height="12" fill="#b45309"/>`, padL+110, legY-10))
	b.WriteString(fmt.Sprintf(`<text x="%.0f" y="%.0f" font-size="12" fill="#111">%s</text>`, padL+126, legY, html.EscapeString(s.Expenses)))
	b.WriteString(fmt.Sprintf(`<rect x="%.0f" y="%.0f" width="12" height="12" fill="#1f7a4d"/>`, padL+230, legY-10))
	b.WriteString(fmt.Sprintf(`<text x="%.0f" y="%.0f" font-size="12" fill="#111">%s</text>`, padL+246, legY, html.EscapeString(s.Result)))
	b.WriteString(`</svg></div>`)
}

func abs64(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}

func stakeholderPrintCSS() string {
	return `
@page{size:13.333in 7.5in;margin:0.35in}
*{box-sizing:border-box}
html,body{margin:0;padding:0;color:#111;background:#fff;
  font-family:Arial,"Noto Sans Myanmar","Segoe UI",sans-serif;
  font-size:16px;line-height:1.35;font-variant-numeric:tabular-nums}
.slide{width:100%;min-height:6.6in;page-break-after:always;padding:0.15in 0.2in;position:relative}
.slide:last-child{page-break-after:auto}
.cover .slide-title{font-size:42px;font-weight:700;margin:1.2in 0 0.4in;text-align:center}
.cover .period{font-size:22px;text-align:center;margin:0 0 0.5in}
.cover .note{font-size:16px;text-align:center;max-width:9in;margin:0 auto;color:#374151}
.cover .a4-header{margin-bottom:0.4in}
.a4-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:8px}
.a4-brand{display:flex;align-items:center;gap:10px;min-width:0}
.a4-logo{display:block;width:14mm;height:auto}
.a4-hospital{margin:0;font-size:20px;font-weight:700;text-transform:uppercase}
.a4-contact{text-align:right;font-size:13px;max-width:48%}
.a4-contact p{margin:0 0 2px}
h2{font-size:28px;font-weight:700;margin:0 0 0.25in}
.sub{margin:0 0 0.3in;color:#4b5563;font-size:15px}
.note{margin:0.2in 0 0;color:#4b5563;font-size:14px}
.footer{position:absolute;bottom:0.1in;left:0.2in;right:0.2in;font-size:12px;color:#6b7280}
.limits{font-size:22px;line-height:1.5;max-width:10in;margin:0.6in auto;text-align:center}
.kpi-row{display:flex;gap:0.35in;justify-content:space-between}
.kpi-row-sm .kpi-value{font-size:26px}
.kpi{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:0.28in 0.22in;background:#f9fafb}
.kpi-label{margin:0 0 8px;font-size:15px;color:#4b5563;font-weight:600}
.kpi-value{margin:0;font-size:34px;font-weight:700}
.kpi-value .unit{font-size:16px;font-weight:600;color:#6b7280}
.kpi-delta{margin:10px 0 0;font-size:15px;color:#374151}
.split{display:flex;gap:0.4in;align-items:flex-start}
.chart{flex:0 0 auto}
.split-table{flex:1;min-width:0}
.split-table.scroll{max-height:5.6in;overflow:hidden}
table.data{width:100%;border-collapse:collapse;font-size:14px}
table.data.compact{font-size:12px}
table.data th,table.data td{border:1px solid #d1d5db;padding:6px 8px;vertical-align:top}
table.data th{background:#eef2ff;text-align:left;font-weight:700}
table.data .num{text-align:right;white-space:nowrap}
.swatch{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:6px;vertical-align:middle}
.cash-line{margin:0.2in 0 0;font-size:15px}
.act-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:0.22in}
.act{border:1px solid #d1d5db;border-radius:8px;padding:0.2in;background:#f9fafb}
.act .kpi-value{font-size:22px}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`
}
