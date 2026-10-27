package handlers

import (
	"net/http"
	"strings"
)

// Money filter values for bill history (not the exact status= column match).
const (
	moneyPaid           = "paid"
	moneyVoid           = "void"
	moneyDraft          = "draft"
	moneyPrintedNotPaid = "printed_not_paid"
)

// appendBillHistoryFilters adds money-status and Yangon civil-day created_at
// range clauses from ?money=&from=&to=. statusCol / printedCol / createdCol are
// SQL column refs (e.g. "status" or "b.status"). For OT, pass otBillNull as
// "b.id IS NULL" so cases without a bill count as draft; empty for desk bills.
// Returns errMsg when the query is invalid (caller should write 400).
func appendBillHistoryFilters(
	where []string,
	args []any,
	r *http.Request,
	statusCol, printedCol, createdCol, otBillNull string,
) ([]string, []any, string) {
	money := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("money")))
	from := strings.TrimSpace(r.URL.Query().Get("from"))
	to := strings.TrimSpace(r.URL.Query().Get("to"))

	if money != "" {
		clause, ok := moneyStatusClause(money, statusCol, printedCol, otBillNull)
		if !ok {
			return where, args, "invalid money"
		}
		where = append(where, clause)
	}

	if from != "" || to != "" {
		if from != "" && to != "" && from > to {
			return where, args, "invalid date range"
		}
		rangeFrom := from
		rangeTo := to
		if rangeFrom == "" {
			rangeFrom = rangeTo
		}
		if rangeTo == "" {
			rangeTo = rangeFrom
		}
		start, _, okFrom := yangonDayUTCRange(rangeFrom)
		_, endExclusive, okTo := yangonDayUTCRange(rangeTo)
		if !okFrom || !okTo {
			return where, args, "invalid date"
		}
		where = append(where, createdCol+" >= ? AND "+createdCol+" < ?")
		args = append(args, start, endExclusive)
	}

	return where, args, ""
}

func moneyStatusClause(money, statusCol, printedCol, otBillNull string) (string, bool) {
	printedEmpty := "(" + printedCol + " IS NULL OR " + printedCol + " = '')"
	printedSet := "(" + printedCol + " IS NOT NULL AND " + printedCol + " != '')"
	switch money {
	case moneyPaid:
		return statusCol + " = 'paid'", true
	case moneyVoid:
		return statusCol + " = 'void'", true
	case moneyDraft:
		draft := statusCol + " = 'draft' AND " + printedEmpty
		if otBillNull != "" {
			return "((" + otBillNull + ") OR (" + draft + "))", true
		}
		return "(" + draft + ")", true
	case moneyPrintedNotPaid:
		return "(" + statusCol + " = 'draft' AND " + printedSet + ")", true
	default:
		return "", false
	}
}

// billHistoryOrderBy returns ORDER BY … LIMIT 100 for list endpoints.
// sort query is "asc" or "desc" (default desc / newest first).
func billHistoryOrderBy(r *http.Request, createdCol, idCol string) (string, string) {
	sort := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("sort")))
	dir := "DESC"
	switch sort {
	case "", "desc":
		dir = "DESC"
	case "asc":
		dir = "ASC"
	default:
		return "", "invalid sort"
	}
	return " ORDER BY " + createdCol + " " + dir + ", " + idCol + " " + dir + " LIMIT 100", ""
}
