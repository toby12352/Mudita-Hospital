package handlers

import "database/sql"

// cashMovement is the one cash-drawer total for an Asia/Yangon civil day.
// income_mmk is desk grand_total_mmk plus IPD net (deposits, collections, refunds).
// expense_mmk is signed: negative means money left the hospital.
// net_cash_mmk is income_mmk + expense_mmk. Do not subtract expense_mmk again.
type cashMovement struct {
	Date         string
	Desk         *cashReport
	IPD          *ipdCashReport
	ExpenseLines []expenseCashLine
	IncomeMMK    int64
	ExpenseMMK   int64
	NetCashMMK   int64
}

// expenseCashLine is one paid expense or the opposite amount on its void day.
// AmountMMK is negative on the payment leg and positive on the reversal leg.
type expenseCashLine struct {
	BillNo    string `json:"bill_no"`
	Portal    string `json:"portal"`
	Name      string `json:"name"`
	AmountMMK int64  `json:"amount_mmk"`
	PaidAt    string `json:"paid_at"`
	Reversal  bool   `json:"reversal,omitempty"`
}

func buildCashMovement(db *sql.DB, date string) (*cashMovement, error) {
	desk, err := buildDailyCash(db, date)
	if err != nil {
		return nil, err
	}
	ipd, err := buildIpdCash(db, date)
	if err != nil {
		return nil, err
	}
	expenses, expenseMMK, err := buildExpenseCash(db, date)
	if err != nil {
		return nil, err
	}
	income := desk.GrandTotal + ipd.NetMMK
	return &cashMovement{
		Date:         date,
		Desk:         desk,
		IPD:          ipd,
		ExpenseLines: expenses,
		IncomeMMK:    income,
		ExpenseMMK:   expenseMMK,
		NetCashMMK:   income + expenseMMK,
	}, nil
}

func buildExpenseCash(db *sql.DB, date string) ([]expenseCashLine, int64, error) {
	lines := []expenseCashLine{}
	start, end, ok := yangonDayUTCRange(date)
	if !ok {
		return lines, 0, nil
	}
	rows, err := db.Query(`
		SELECT bill_no, portal, name, -(total_mmk - discount_mmk), COALESCE(paid_at, '')
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
		return nil, 0, err
	}
	payTotal, err := scanExpenseRows(rows, &lines, false)
	if err != nil {
		return nil, 0, err
	}
	rows, err = db.Query(`
		SELECT bill_no, portal, name, (total_mmk - discount_mmk), COALESCE(paid_at, '')
		FROM expense_bills
		WHERE paid_at IS NOT NULL AND TRIM(paid_at) != ''
		  AND status = 'void'
		  AND voided_at IS NOT NULL AND TRIM(voided_at) != ''
		  AND voided_at >= ? AND voided_at < ?
		ORDER BY voided_at ASC, id ASC
	`, start, end)
	if err != nil {
		return nil, 0, err
	}
	voidTotal, err := scanExpenseRows(rows, &lines, true)
	if err != nil {
		return nil, 0, err
	}
	return lines, payTotal + voidTotal, nil
}

func scanExpenseRows(rows *sql.Rows, lines *[]expenseCashLine, reversal bool) (int64, error) {
	defer rows.Close()
	var sum int64
	for rows.Next() {
		var line expenseCashLine
		line.Reversal = reversal
		if err := rows.Scan(&line.BillNo, &line.Portal, &line.Name, &line.AmountMMK, &line.PaidAt); err != nil {
			return 0, err
		}
		sum += line.AmountMMK
		*lines = append(*lines, line)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	return sum, nil
}
