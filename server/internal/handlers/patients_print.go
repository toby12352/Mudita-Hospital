package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// printHistoryBill serves receipt HTML for a bill already linked to this chart.
// Read-only: does not mark printed, paid, or void.
func (h *Patients) printHistoryBill(w http.ResponseWriter, r *http.Request, path string) {
	chartID, kind, billID, ok := parseHistoryBillPrintPath(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if _, err := loadPatient(h.DB, chartID); err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	owned, err := historyBillOwnedByChart(h.DB, chartID, kind, billID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if !owned {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}

	printPath := fmt.Sprintf("/bills/%d/print", billID)
	switch kind {
	case "opd":
		(&OPD{DB: h.DB}).printBill(w, r, printPath)
	case "pharmacy":
		(&Pharmacy{DB: h.DB}).printPharmacyBill(w, r, printPath)
	case "ot":
		(&OT{DB: h.DB}).printBill(w, r, printPath)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}
}

// path: /{chartId}/bills/{opd|pharmacy|ot}/{billId}/print
func parseHistoryBillPrintPath(path string) (chartID int64, kind string, billID int64, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) != 5 || parts[1] != "bills" || parts[4] != "print" {
		return 0, "", 0, false
	}
	chartID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || chartID <= 0 {
		return 0, "", 0, false
	}
	kind = parts[2]
	if kind != "opd" && kind != "pharmacy" && kind != "ot" {
		return 0, "", 0, false
	}
	billID, err = strconv.ParseInt(parts[3], 10, 64)
	if err != nil || billID <= 0 {
		return 0, "", 0, false
	}
	return chartID, kind, billID, true
}

func historyBillOwnedByChart(db *sql.DB, chartID int64, kind string, billID int64) (bool, error) {
	var n int
	var err error
	switch kind {
	case "opd":
		err = db.QueryRow(`
			SELECT COUNT(1) FROM opd_bills WHERE id = ? AND patient_id = ?
		`, billID, chartID).Scan(&n)
	case "pharmacy":
		err = db.QueryRow(`
			SELECT COUNT(1) FROM pharmacy_bills
			WHERE id = ? AND patient_id = ? AND bill_no NOT LIKE 'TO-%'
		`, billID, chartID).Scan(&n)
	case "ot":
		err = db.QueryRow(`
			SELECT COUNT(1) FROM ot_cases
			WHERE ot_bill_id = ? AND patient_id = ?
		`, billID, chartID).Scan(&n)
	default:
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return n > 0, nil
}
