package handlers

import (
	"database/sql"
	"fmt"
	"html"
	"strings"
)

// detailLine is one item row on the All Bill Details sheet.
type detailLine struct {
	Particular string
	QtyLabel   string
	RateMMK    int64
	AmountMMK  int64
}

// detailVoucher is one cash bill with every line for the All Bill Details sheet.
// CashMMK matches the amount already counted on the income or expense sheet.
type detailVoucher struct {
	Portal        string
	Expense       bool
	BillNo        string
	Party         string
	Doctor        string
	Remark        string
	PaidAt        string
	Reversal      bool
	DiscountMMK   int64
	DiscountValue int64
	DiscountUnit  string
	CashMMK       int64
	Lines         []detailLine
	// IPDCollected marks a paid IPD daily voucher printed as one Collected row.
	IPDCollected bool
}

// renderDashboardDailyDetailsHTML prints every cash voucher for one civil day
// with item rows. Desk bills come first (OPD, OT, IPD, Pharmacy, Lab); expenses
// start on a new page. Pharmacy TO- slips are omitted. Paid IPD daily statements
// print as Collected summary rows like the income report IPD table.
// scope is "", "income", "expense", or "all". A non-empty scope adds the end
// balance table. An empty scope keeps the full sheet.
func renderDashboardDailyDetailsHTML(_ *sql.DB, hosp *hospitalSettings, vouchers []detailVoucher, date, scope string) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	vouchers = filterDetailScope(vouchers, scope)
	dateLabel := dailyReportDateLabel(date)
	title := detailScopeTitle(scope)

	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>`)
	b.WriteString(html.EscapeString(title))
	b.WriteString(` `)
	b.WriteString(html.EscapeString(date))
	b.WriteString(`</title><style>`)
	b.WriteString(dashboardDailyDetailsPrintCSS())
	b.WriteString(`</style></head><body>`)
	b.WriteString(`<div class="a4-sheet">`)
	writeA4Letterhead(&b, hosp)
	writeDailyReportTitle(&b, title, dateLabel)

	if len(vouchers) == 0 {
		b.WriteString(`<p class="daily-empty">No bills on this date.</p>`)
		writeDetailScopeSettle(&b, nil, scope)
		b.WriteString(`<p class="meta">Printed from Mudita Hospital</p>`)
		b.WriteString(`</div></body></html>`)
		return b.String()
	}

	wroteExpenseBreak := false
	sawDesk := false
	expenseWrapped := false
	splitExpenses := scope == "" || scope == "all"
	currentPortal := ""
	ipdCollectedOpen := false
	var ipdCollectedMMK int64
	closePortal := func() {
		if ipdCollectedOpen {
			writeDailySubtotalRow(&b, 4, ipdCollectedMMK)
			b.WriteString(`</tbody></table>`)
			ipdCollectedOpen = false
			ipdCollectedMMK = 0
		}
		if currentPortal != "" {
			b.WriteString(`</section>`)
			currentPortal = ""
		}
	}
	for _, v := range vouchers {
		if !v.Expense {
			sawDesk = true
		}
		if splitExpenses && v.Expense && !wroteExpenseBreak {
			closePortal()
			if sawDesk {
				b.WriteString(`<div class="daily-page-break">`)
				expenseWrapped = true
			}
			writeDailyReportTitle(&b, "Expense Bill Details", dateLabel)
			wroteExpenseBreak = true
		}
		if v.Portal != currentPortal {
			closePortal()
			openDailyPortalSection(&b, v.Portal)
			currentPortal = v.Portal
			if v.IPDCollected {
				b.WriteString(`<table class="daily-table"><thead><tr>`)
				b.WriteString(`<th>Kind</th><th>Admission</th><th>Patient</th><th>Remark</th><th class="num">MMK</th>`)
				b.WriteString(`</tr></thead><tbody>`)
				ipdCollectedOpen = true
			}
		}
		if v.IPDCollected {
			writeIpdCollectedDetailRow(&b, v)
			ipdCollectedMMK += v.CashMMK
			continue
		}
		writeDetailVoucher(&b, v)
	}
	closePortal()
	if expenseWrapped {
		b.WriteString(`</div>`)
	}

	writeDetailScopeSettle(&b, vouchers, scope)
	b.WriteString(`<p class="meta">Printed from Mudita Hospital</p>`)
	b.WriteString(`</div></body></html>`)
	return b.String()
}

func detailScopeTitle(scope string) string {
	switch scope {
	case "income":
		return "Income Bill Details"
	case "expense":
		return "Expense Bill Details"
	default:
		return "All Bill Details"
	}
}

func filterDetailScope(vouchers []detailVoucher, scope string) []detailVoucher {
	if scope != "income" && scope != "expense" {
		return vouchers
	}
	wantExpense := scope == "expense"
	out := make([]detailVoucher, 0, len(vouchers))
	for _, v := range vouchers {
		if v.Expense == wantExpense {
			out = append(out, v)
		}
	}
	return out
}

func writeDetailScopeSettle(b *strings.Builder, vouchers []detailVoucher, scope string) {
	if scope != "income" && scope != "expense" && scope != "all" {
		return
	}
	var income, expenseSigned int64
	for _, v := range vouchers {
		if v.Expense {
			expenseSigned += v.CashMMK
		} else {
			income += v.CashMMK
		}
	}
	switch scope {
	case "income":
		writeDailySettle(b, []dailySettleRow{
			{Label: "Total income", Amount: income, Emph: true},
		})
	case "expense":
		writeDailySettle(b, []dailySettleRow{
			{Label: "Total expenses", Amount: -expenseSigned, Emph: true},
		})
	default:
		writeDailySettle(b, []dailySettleRow{
			{Label: "Total income", Amount: income, Emph: false},
			{Label: "Total expenses", Amount: -expenseSigned, Emph: false},
			{Label: "Total remaining balance", Amount: income + expenseSigned, Emph: true},
		})
	}
}

func writeDetailVoucher(b *strings.Builder, v detailVoucher) {
	b.WriteString(`<table class="detail-voucher"><thead>`)
	b.WriteString(`<tr class="detail-voucher-head"><th colspan="5">`)
	b.WriteString(html.EscapeString(detailVoucherHeading(v)))
	b.WriteString(`</th></tr>`)
	b.WriteString(`<tr>`)
	b.WriteString(`<th class="col-no">No.</th><th>Particular</th><th class="col-qty">Qty</th>`)
	b.WriteString(`<th class="col-amt">Rate</th><th class="col-amt">Amount (MMK)</th>`)
	b.WriteString(`</tr></thead><tbody>`)
	if len(v.Lines) == 0 {
		b.WriteString(`<tr><td colspan="5">No line items.</td></tr>`)
	} else {
		for i, line := range v.Lines {
			b.WriteString(`<tr><td class="col-no">`)
			b.WriteString(fmt.Sprintf("%d", i+1))
			b.WriteString(`</td><td>`)
			b.WriteString(html.EscapeString(line.Particular))
			b.WriteString(`</td><td class="col-qty">`)
			b.WriteString(html.EscapeString(line.QtyLabel))
			b.WriteString(`</td><td class="col-amt">`)
			b.WriteString(formatMMK(line.RateMMK))
			b.WriteString(`</td><td class="col-amt">`)
			b.WriteString(formatMMK(line.AmountMMK))
			b.WriteString(`</td></tr>`)
		}
	}
	if v.DiscountMMK != 0 {
		label := "Discount"
		if strings.EqualFold(v.DiscountUnit, "percent") && v.DiscountValue > 0 {
			label = fmt.Sprintf("Discount (%d%%)", v.DiscountValue)
		}
		b.WriteString(`<tr class="detail-foot"><td colspan="4">`)
		b.WriteString(html.EscapeString(label))
		b.WriteString(`</td><td class="col-amt">`)
		b.WriteString(formatMMK(v.DiscountMMK))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`<tr class="detail-total"><td colspan="4">Voucher total</td><td class="col-amt">`)
	b.WriteString(formatMMK(v.CashMMK))
	b.WriteString(`</td></tr>`)
	b.WriteString(`</tbody></table>`)
}

// writeIpdCollectedDetailRow prints one paid IPD day as a Collected summary
// row matching the income report IPD table.
func writeIpdCollectedDetailRow(b *strings.Builder, v detailVoucher) {
	b.WriteString(`<tr><td>Collected</td><td>`)
	b.WriteString(html.EscapeString(v.BillNo))
	b.WriteString(`</td><td>`)
	b.WriteString(html.EscapeString(v.Party))
	b.WriteString(`</td><td>`)
	b.WriteString(html.EscapeString(ipdCollectedRemark(v)))
	b.WriteString(`</td><td class="num">`)
	b.WriteString(formatMMK(v.CashMMK))
	b.WriteString(`</td></tr>`)
}

func ipdCollectedRemark(v detailVoucher) string {
	parts := make([]string, 0, 3)
	if room := strings.TrimSpace(v.Doctor); room != "" {
		parts = append(parts, "Room "+room)
	}
	if statement := strings.TrimSpace(v.Remark); statement != "" {
		parts = append(parts, statement)
	}
	if paid := strings.TrimSpace(v.PaidAt); paid != "" {
		parts = append(parts, "Paid "+paid)
	}
	return strings.Join(parts, " · ")
}

func detailVoucherHeading(v detailVoucher) string {
	parts := []string{v.BillNo}
	if v.Reversal {
		parts[0] += " (Reversal)"
	}
	if p := strings.TrimSpace(v.Party); p != "" {
		parts = append(parts, p)
	}
	if d := strings.TrimSpace(v.Doctor); d != "" {
		parts = append(parts, d)
	}
	if p := strings.TrimSpace(v.PaidAt); p != "" {
		parts = append(parts, p)
	}
	if r := strings.TrimSpace(v.Remark); r != "" {
		parts = append(parts, "Remark: "+r)
	}
	return strings.Join(parts, " · ")
}

func particularLabel(code, description string) string {
	code = strings.TrimSpace(code)
	description = strings.TrimSpace(description)
	if code != "" && description != "" {
		return code + " — " + description
	}
	if description != "" {
		return description
	}
	return code
}

func qtyLabel(qty int64, unit string) string {
	unit = strings.TrimSpace(unit)
	if unit == "" {
		return fmt.Sprintf("%d", qty)
	}
	return fmt.Sprintf("%d %s", qty, unit)
}

// buildDailyBillDetails loads desk cash bills, paid IPD daily statements, and
// expense bills for one civil day. Order is OPD, OT, IPD, Pharmacy, Lab, then expenses.
// An IPD statement is included when staff pressed Pay on this Yangon day.
func buildDailyBillDetails(db *sql.DB, date string) ([]detailVoucher, error) {
	out := make([]detailVoucher, 0)
	voidStart, voidEnd, ok := yangonDayUTCRange(date)
	if !ok {
		return out, nil
	}
	for _, portal := range []string{"OPD", "OT"} {
		list, err := loadDeskDetailVouchers(db, portal, date, voidStart, voidEnd)
		if err != nil {
			return nil, err
		}
		out = append(out, list...)
	}
	ipd, err := loadPaidIpdDetailVouchers(db, voidStart, voidEnd)
	if err != nil {
		return nil, err
	}
	out = append(out, ipd...)
	for _, portal := range []string{"Pharmacy", "Lab"} {
		list, err := loadDeskDetailVouchers(db, portal, date, voidStart, voidEnd)
		if err != nil {
			return nil, err
		}
		out = append(out, list...)
	}
	expenses, err := loadExpenseDetailVouchers(db, date, voidStart, voidEnd)
	if err != nil {
		return nil, err
	}
	out = append(out, expenses...)
	return out, nil
}

// loadPaidIpdDetailVouchers returns daily statements marked paid during the
// Yangon day [start, end). The statement civil date may be earlier. CashMMK is
// the shortfall collected at Pay, or 0 when the close was even or a surplus.
func loadPaidIpdDetailVouchers(db *sql.DB, start, end string) ([]detailVoucher, error) {
	rows, err := db.Query(`
		SELECT v.admission_id, v.civil_date, v.closing_mmk, v.decided_at,
		       a.admission_no, COALESCE(a.room_no, ''), p.name
		FROM ipd_day_vouchers v
		JOIN ipd_admissions a ON a.id = v.admission_id
		JOIN patients p ON p.id = a.patient_id
		WHERE v.status = 'paid'
		  AND a.status != 'deleted'
		  AND v.decided_at >= ? AND v.decided_at < ?
		ORDER BY v.decided_at ASC, a.admission_no ASC, v.id ASC
	`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type paidStatement struct {
		admissionID int64
		closing     int64
		civilDate   string
		decidedAt   string
		admissionNo string
		room        string
		patient     string
	}
	pending := make([]paidStatement, 0)
	for rows.Next() {
		var row paidStatement
		if err := rows.Scan(
			&row.admissionID, &row.civilDate, &row.closing, &row.decidedAt,
			&row.admissionNo, &row.room, &row.patient,
		); err != nil {
			return nil, err
		}
		pending = append(pending, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	out := make([]detailVoucher, 0, len(pending))
	for _, row := range pending {
		collected := int64(0)
		if row.closing < 0 {
			collected = -row.closing
		}
		out = append(out, detailVoucher{
			Portal:       "IPD",
			BillNo:       row.admissionNo,
			Party:        row.patient,
			Doctor:       row.room,
			Remark:       "Statement " + formatCivilDate(row.civilDate),
			PaidAt:       formatLedgerDateTime(row.decidedAt),
			CashMMK:      collected,
			IPDCollected: true,
		})
	}
	return out, nil
}

func loadDeskDetailVouchers(db *sql.DB, source, date, voidStart, voidEnd string) ([]detailVoucher, error) {
	table, pharmacy, err := deskBillTable(source)
	if err != nil {
		return nil, err
	}
	doctorSQL := "COALESCE(b.doctor_name, '')"
	remarkSQL := "COALESCE(b.description, '')"
	fromSQL := table + " b"
	discountSQL := "COALESCE(b.discount_mmk, 0), COALESCE(b.discount_value, 0), COALESCE(b.discount_unit, 'percent')"
	payAmount := "b.total_mmk"
	voidAmount := "-b.total_mmk"
	extra := ""
	if source == "OT" {
		remarkSQL = "COALESCE(c.notes, '')"
		fromSQL = table + " b JOIN ot_cases c ON c.id = b.case_id"
	}
	if pharmacy {
		doctorSQL = "''"
		payAmount = "CASE WHEN b.bill_no LIKE 'RT-%' THEN -b.total_mmk ELSE b.total_mmk END"
		voidAmount = "CASE WHEN b.bill_no LIKE 'RT-%' THEN b.total_mmk ELSE -b.total_mmk END"
		extra = " AND b.bill_no NOT LIKE 'TO-%'"
	}

	type billRow struct {
		ID            int64
		BillNo        string
		Patient       string
		Doctor        string
		Remark        string
		CashMMK       int64
		DiscountMMK   int64
		DiscountValue int64
		DiscountUnit  string
		PaidAt        string
		Reversal      bool
	}
	rowsOut := make([]billRow, 0)

	scanBills := func(rows *sql.Rows, reversal bool) error {
		defer rows.Close()
		for rows.Next() {
			var row billRow
			row.Reversal = reversal
			if err := rows.Scan(
				&row.ID, &row.BillNo, &row.Patient, &row.Doctor, &row.Remark,
				&row.CashMMK, &row.DiscountMMK, &row.DiscountValue, &row.DiscountUnit, &row.PaidAt,
			); err != nil {
				return err
			}
			rowsOut = append(rowsOut, row)
		}
		return rows.Err()
	}

	paySQL := fmt.Sprintf(`
		SELECT b.id, b.bill_no, b.patient_name, %s, %s, %s, %s,
		       COALESCE(b.paid_at, '')
		FROM %s
		WHERE b.collected_cash = 1
		  AND b.paid_at IS NOT NULL AND TRIM(b.paid_at) != ''
		  AND date(b.paid_at) = date(?)
		  AND (
		    b.status = 'paid'
		    OR (b.status = 'void' AND b.voided_at IS NOT NULL AND TRIM(b.voided_at) != '')
		  )%s
		ORDER BY b.paid_at ASC, b.id ASC
	`, doctorSQL, remarkSQL, payAmount, discountSQL, fromSQL, extra)
	rows, err := db.Query(paySQL, date)
	if err != nil {
		return nil, err
	}
	if err := scanBills(rows, false); err != nil {
		return nil, err
	}

	voidSQL := fmt.Sprintf(`
		SELECT b.id, b.bill_no, b.patient_name, %s, %s, %s, %s,
		       COALESCE(b.paid_at, '')
		FROM %s
		WHERE b.collected_cash = 1
		  AND b.paid_at IS NOT NULL AND TRIM(b.paid_at) != ''
		  AND b.status = 'void'
		  AND b.voided_at IS NOT NULL AND TRIM(b.voided_at) != ''
		  AND b.voided_at >= ? AND b.voided_at < ?%s
		ORDER BY b.voided_at ASC, b.id ASC
	`, doctorSQL, remarkSQL, voidAmount, discountSQL, fromSQL, extra)
	rows, err = db.Query(voidSQL, voidStart, voidEnd)
	if err != nil {
		return nil, err
	}
	if err := scanBills(rows, true); err != nil {
		return nil, err
	}

	out := make([]detailVoucher, 0, len(rowsOut))
	for _, row := range rowsOut {
		sign := int64(1)
		if pharmacy && strings.HasPrefix(row.BillNo, "RT-") {
			sign = -1
		}
		if row.Reversal {
			sign = -sign
		}
		lines, err := loadDeskDetailLines(db, source, row.ID, sign)
		if err != nil {
			return nil, err
		}
		discountPrint := int64(0)
		if row.DiscountMMK != 0 {
			discountPrint = -sign * row.DiscountMMK
		}
		out = append(out, detailVoucher{
			Portal:        source,
			BillNo:        row.BillNo,
			Party:         row.Patient,
			Doctor:        row.Doctor,
			Remark:        row.Remark,
			PaidAt:        row.PaidAt,
			Reversal:      row.Reversal,
			DiscountMMK:   discountPrint,
			DiscountValue: row.DiscountValue,
			DiscountUnit:  row.DiscountUnit,
			CashMMK:       row.CashMMK,
			Lines:         lines,
		})
	}
	return out, nil
}

func loadDeskDetailLines(db *sql.DB, source string, billID, sign int64) ([]detailLine, error) {
	switch source {
	case "OPD":
		return loadSimpleDetailLines(db, `
			SELECT COALESCE(code, ''), description, qty, unit_price_mmk, line_total_mmk
			FROM bill_lines WHERE bill_id = ? ORDER BY sort_order, id
		`, billID, sign, "")
	case "OT":
		return loadSimpleDetailLines(db, `
			SELECT COALESCE(code, ''), description, qty, unit_price_mmk, line_total_mmk
			FROM ot_bill_lines WHERE bill_id = ? ORDER BY sort_order, id
		`, billID, sign, "")
	case "Lab":
		return loadSimpleDetailLines(db, `
			SELECT COALESCE(code, ''), description, qty, unit_price_mmk, line_total_mmk
			FROM lab_bill_lines WHERE bill_id = ? ORDER BY sort_order, id
		`, billID, sign, "")
	case "Pharmacy":
		return loadPharmacyDetailLines(db, billID, sign)
	default:
		return nil, fmt.Errorf("unknown detail desk %s", source)
	}
}

func loadSimpleDetailLines(db *sql.DB, query string, billID, sign int64, unit string) ([]detailLine, error) {
	rows, err := db.Query(query, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]detailLine, 0)
	for rows.Next() {
		var code, desc string
		var qty, rate, amount int64
		if err := rows.Scan(&code, &desc, &qty, &rate, &amount); err != nil {
			return nil, err
		}
		out = append(out, detailLine{
			Particular: particularLabel(code, desc),
			QtyLabel:   qtyLabel(qty, unit),
			RateMMK:    sign * rate,
			AmountMMK:  sign * amount,
		})
	}
	return out, rows.Err()
}

func loadPharmacyDetailLines(db *sql.DB, billID, sign int64) ([]detailLine, error) {
	rows, err := db.Query(`
		SELECT l.code, l.description, l.box_qty, l.strip_qty, l.tablet_qty,
		       COALESCE(l.qty_l4, 0), COALESCE(l.qty_l5, 0), COALESCE(l.qty_l6, 0),
		       l.billing_qty, l.billing_unit, l.unit_price_mmk, l.line_total_mmk,
		       COALESCE(i.pack_l1_unit, ''), COALESCE(i.pack_l2_unit, ''), COALESCE(i.pack_l3_unit, ''),
		       COALESCE(i.pack_l4_unit, ''), COALESCE(i.pack_l5_unit, ''), COALESCE(i.pack_l6_unit, '')
		FROM pharmacy_bill_lines l
		LEFT JOIN items i ON i.id = l.item_id
		WHERE l.bill_id = ?
		ORDER BY l.sort_order, l.id
	`, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]detailLine, 0)
	for rows.Next() {
		var line pharmacyBillLine
		if err := rows.Scan(
			&line.Code, &line.Description, &line.BoxQty, &line.StripQty, &line.TabletQty,
			&line.QtyL4, &line.QtyL5, &line.QtyL6,
			&line.BillingQty, &line.BillingUnit, &line.UnitPriceMMK, &line.LineTotalMMK,
			&line.PackL1Unit, &line.PackL2Unit, &line.PackL3Unit,
			&line.PackL4Unit, &line.PackL5Unit, &line.PackL6Unit,
		); err != nil {
			return nil, err
		}
		qty, unit, rate := pharmacyReceiptQty(line)
		out = append(out, detailLine{
			Particular: particularLabel(line.Code, line.Description),
			QtyLabel:   qtyLabel(qty, unit),
			RateMMK:    sign * rate,
			AmountMMK:  sign * line.LineTotalMMK,
		})
	}
	return out, rows.Err()
}

func loadExpenseDetailVouchers(db *sql.DB, date, voidStart, voidEnd string) ([]detailVoucher, error) {
	type billRow struct {
		ID            int64
		BillNo        string
		Portal        string
		Name          string
		Remark        string
		CashMMK       int64
		DiscountMMK   int64
		DiscountValue int64
		DiscountUnit  string
		PaidAt        string
		Reversal      bool
		Purchase      bool
	}
	rowsOut := make([]billRow, 0)

	scan := func(rows *sql.Rows, reversal, purchase bool) error {
		defer rows.Close()
		for rows.Next() {
			var row billRow
			row.Reversal = reversal
			row.Purchase = purchase
			if err := rows.Scan(
				&row.ID, &row.BillNo, &row.Portal, &row.Name, &row.Remark,
				&row.CashMMK, &row.DiscountMMK, &row.DiscountValue, &row.DiscountUnit, &row.PaidAt,
			); err != nil {
				return err
			}
			rowsOut = append(rowsOut, row)
		}
		return rows.Err()
	}

	rows, err := db.Query(`
		SELECT id, bill_no, portal, name, COALESCE(description, ''),
		       -(total_mmk - discount_mmk),
		       COALESCE(discount_mmk, 0), COALESCE(discount_value, 0), COALESCE(discount_unit, 'percent'),
		       COALESCE(paid_at, '')
		FROM expense_bills
		WHERE paid_at IS NOT NULL AND TRIM(paid_at) != ''
		  AND date(paid_at) = date(?)
		  AND (
		    status = 'paid'
		    OR (status = 'void' AND voided_at IS NOT NULL AND TRIM(voided_at) != '')
		  )
		ORDER BY paid_at ASC, id ASC
	`, date)
	if err != nil {
		return nil, err
	}
	if err := scan(rows, false, false); err != nil {
		return nil, err
	}
	rows, err = db.Query(`
		SELECT id, bill_no, portal, name, COALESCE(description, ''),
		       (total_mmk - discount_mmk),
		       COALESCE(discount_mmk, 0), COALESCE(discount_value, 0), COALESCE(discount_unit, 'percent'),
		       COALESCE(paid_at, '')
		FROM expense_bills
		WHERE paid_at IS NOT NULL AND TRIM(paid_at) != ''
		  AND status = 'void'
		  AND voided_at IS NOT NULL AND TRIM(voided_at) != ''
		  AND voided_at >= ? AND voided_at < ?
		ORDER BY voided_at ASC, id ASC
	`, voidStart, voidEnd)
	if err != nil {
		return nil, err
	}
	if err := scan(rows, true, false); err != nil {
		return nil, err
	}

	rows, err = db.Query(`
		SELECT id, bill_no, 'pharmacy',
		       CASE WHEN TRIM(supplier_name) = '' THEN 'Pharmacy purchase' ELSE supplier_name END,
		       COALESCE(description, ''),
		       -total_mmk, 0, 0, 'percent',
		       COALESCE(paid_at, '')
		FROM pharmacy_purchase_bills
		WHERE paid_at IS NOT NULL AND TRIM(paid_at) != ''
		  AND date(paid_at) = date(?)
		  AND (
		    status = 'paid'
		    OR (status = 'void' AND voided_at IS NOT NULL AND TRIM(voided_at) != '')
		  )
		ORDER BY paid_at ASC, id ASC
	`, date)
	if err != nil {
		return nil, err
	}
	if err := scan(rows, false, true); err != nil {
		return nil, err
	}
	rows, err = db.Query(`
		SELECT id, bill_no, 'pharmacy',
		       CASE WHEN TRIM(supplier_name) = '' THEN 'Pharmacy purchase' ELSE supplier_name END,
		       COALESCE(description, ''),
		       total_mmk, 0, 0, 'percent',
		       COALESCE(paid_at, '')
		FROM pharmacy_purchase_bills
		WHERE paid_at IS NOT NULL AND TRIM(paid_at) != ''
		  AND status = 'void'
		  AND voided_at IS NOT NULL AND TRIM(voided_at) != ''
		  AND voided_at >= ? AND voided_at < ?
		ORDER BY voided_at ASC, id ASC
	`, voidStart, voidEnd)
	if err != nil {
		return nil, err
	}
	if err := scan(rows, true, true); err != nil {
		return nil, err
	}

	byPortal := map[string][]detailVoucher{}
	for _, row := range rowsOut {
		sign := int64(-1)
		if row.Reversal {
			sign = 1
		}
		var lines []detailLine
		var err error
		if row.Purchase {
			lines, err = loadPurchaseDetailLines(db, row.ID, sign)
		} else {
			lines, err = loadExpenseBillDetailLines(db, row.ID, sign)
		}
		if err != nil {
			return nil, err
		}
		discountPrint := int64(0)
		if row.DiscountMMK != 0 {
			discountPrint = -sign * row.DiscountMMK
		}
		label := dailyExpensePortalLabel(row.Portal)
		v := detailVoucher{
			Portal:        label,
			Expense:       true,
			BillNo:        row.BillNo,
			Party:         row.Name,
			Remark:        row.Remark,
			PaidAt:        row.PaidAt,
			Reversal:      row.Reversal,
			DiscountMMK:   discountPrint,
			DiscountValue: row.DiscountValue,
			DiscountUnit:  row.DiscountUnit,
			CashMMK:       row.CashMMK,
			Lines:         lines,
		}
		byPortal[label] = append(byPortal[label], v)
	}

	ordered := make([]detailVoucher, 0, len(rowsOut))
	seen := map[string]bool{}
	for _, portal := range dailyPortalOrder {
		if group := byPortal[portal]; len(group) > 0 {
			ordered = append(ordered, group...)
			seen[portal] = true
		}
	}
	for label, group := range byPortal {
		if seen[label] || len(group) == 0 {
			continue
		}
		ordered = append(ordered, group...)
	}
	return ordered, nil
}

func loadExpenseBillDetailLines(db *sql.DB, billID, sign int64) ([]detailLine, error) {
	return loadSimpleDetailLines(db, `
		SELECT COALESCE(code, ''), description, qty, unit_price_mmk, line_total_mmk
		FROM expense_bill_lines WHERE bill_id = ? ORDER BY sort_order, id
	`, billID, sign, "")
}

func loadPurchaseDetailLines(db *sql.DB, billID, sign int64) ([]detailLine, error) {
	rows, err := db.Query(`
		SELECT COALESCE(code, ''), description, qty, COALESCE(unit, ''), line_total_mmk
		FROM pharmacy_purchase_bill_lines
		WHERE bill_id = ?
		ORDER BY sort_order, id
	`, billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]detailLine, 0)
	for rows.Next() {
		var code, desc, unit string
		var qty, amount int64
		if err := rows.Scan(&code, &desc, &qty, &unit, &amount); err != nil {
			return nil, err
		}
		rate := int64(0)
		if qty > 0 {
			rate = amount / qty
		}
		out = append(out, detailLine{
			Particular: particularLabel(code, desc),
			QtyLabel:   qtyLabel(qty, unit),
			RateMMK:    sign * rate,
			AmountMMK:  sign * amount,
		})
	}
	return out, rows.Err()
}

func dashboardDailyDetailsPrintCSS() string {
	return dashboardDailyPrintCSS() + `
.a4-items{width:100%;border-collapse:collapse;margin:0 0 8px}
.a4-items th,.a4-items td{border:1px solid #000;padding:6px 8px;vertical-align:top}
.a4-items th{background:#eee;font-weight:700;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.a4-items .col-no{width:4ch;text-align:center}
.a4-items .col-amt{width:16ch;text-align:right;white-space:nowrap}
.a4-items.a4-daily th.col-amt{white-space:normal;line-height:1.15}
.detail-ipd{margin:0 0 14px;page-break-inside:avoid;break-inside:avoid}
.detail-ipd-head{margin:0 0 6px;padding:6px 8px;background:#ddd;border:1px solid #000;font-weight:700;font-size:10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.detail-voucher{width:100%;border-collapse:collapse;margin:0 0 14px;page-break-inside:avoid;break-inside:avoid}
.detail-voucher th,.detail-voucher td{border:1px solid #000;padding:5px 8px;vertical-align:top;text-align:left}
.detail-voucher th{background:#eee;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.detail-voucher thead{display:table-header-group}
.detail-voucher-head th{background:#ddd;font-size:10pt;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.detail-voucher .col-no{width:4ch;text-align:center}
.detail-voucher .col-qty{width:12ch;text-align:right;white-space:nowrap}
.detail-voucher .col-amt{width:16ch;text-align:right;white-space:nowrap}
.detail-foot td{font-weight:600;background:#f7f7f7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.detail-total td{font-weight:700;background:#f0f0f0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.block .detail-voucher:last-child{margin-bottom:4px}
@media print{
  .detail-voucher-head th,.detail-foot td,.detail-total td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`
}
