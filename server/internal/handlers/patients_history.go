package handlers

import (
	"database/sql"
	"net/http"
	"strings"
)

// Visit history is read-only and matches patients.id only.
// OT cases match ot_cases.patient_id. IPD stays match ipd_admissions.patient_id.
// Do not match patient_name.

type patientHistoryOpd struct {
	ID            int64   `json:"id"`
	BillNo        string  `json:"bill_no"`
	Status        string  `json:"status"`
	TotalMMK      int64   `json:"total_mmk"`
	CreatedAt     string  `json:"created_at"`
	DoctorName    string  `json:"doctor_name"`
	PrintedAt     *string `json:"printed_at,omitempty"`
	CollectedCash *int    `json:"collected_cash,omitempty"`
}

type patientHistoryPharmacy struct {
	ID            int64   `json:"id"`
	BillNo        string  `json:"bill_no"`
	Status        string  `json:"status"`
	TotalMMK      int64   `json:"total_mmk"`
	CreatedAt     string  `json:"created_at"`
	PrintedAt     *string `json:"printed_at,omitempty"`
	CollectedCash *int    `json:"collected_cash,omitempty"`
}

type patientHistoryLab struct {
	ID            int64   `json:"id"`
	BillNo        string  `json:"bill_no"`
	Status        string  `json:"status"`
	TotalMMK      int64   `json:"total_mmk"`
	CreatedAt     string  `json:"created_at"`
	DoctorName    string  `json:"doctor_name"`
	PrintedAt     *string `json:"printed_at,omitempty"`
	CollectedCash *int    `json:"collected_cash,omitempty"`
}

type patientHistoryOT struct {
	CaseNo            string `json:"case_no"`
	Status            string `json:"status"`
	BillID            int64  `json:"bill_id,omitempty"`
	BillNo            string `json:"bill_no"`
	BillStatus        string `json:"bill_status"`
	BillTotalMMK      *int64 `json:"bill_total_mmk,omitempty"`
	BillPrintedAt     *string `json:"bill_printed_at,omitempty"`
	BillCollectedCash *int   `json:"bill_collected_cash,omitempty"`
	CreatedAt         string `json:"created_at"`
}

type patientHistoryIPD struct {
	AdmissionNo string `json:"admission_no"`
	Status      string `json:"status"`
	AdmittedAt  string `json:"admitted_at"`
	BalanceMMK  int64  `json:"balance_mmk"`
	Settled     bool   `json:"settled"`
}

func (h *Patients) history(w http.ResponseWriter, _ *http.Request, path string) {
	idPath := strings.TrimSuffix(path, "/history")
	id, ok := parseID(idPath)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if _, err := loadPatient(h.DB, id); err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	opdRows, err := h.DB.Query(`
		SELECT id, bill_no, status, total_mmk, created_at, doctor_name, printed_at, collected_cash
		FROM opd_bills
		WHERE patient_id = ?
		  AND status != 'deleted'
		ORDER BY created_at DESC, id DESC
	`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
		return
	}
	defer opdRows.Close()
	opd := make([]patientHistoryOpd, 0)
	for opdRows.Next() {
		var row patientHistoryOpd
		var printedAt sql.NullString
		var collected sql.NullInt64
		if err := opdRows.Scan(
			&row.ID, &row.BillNo, &row.Status, &row.TotalMMK, &row.CreatedAt, &row.DoctorName,
			&printedAt, &collected,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
			return
		}
		if printedAt.Valid && strings.TrimSpace(printedAt.String) != "" {
			v := printedAt.String
			row.PrintedAt = &v
		}
		if collected.Valid {
			v := int(collected.Int64)
			row.CollectedCash = &v
		}
		opd = append(opd, row)
	}
	if err := opdRows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
		return
	}

	phRows, err := h.DB.Query(`
		SELECT id, bill_no, status, total_mmk, created_at, printed_at, collected_cash
		FROM pharmacy_bills
		WHERE patient_id = ?
		  AND bill_no NOT LIKE 'TO-%'
		  AND status != 'deleted'
		ORDER BY created_at DESC, id DESC
	`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
		return
	}
	defer phRows.Close()
	pharmacy := make([]patientHistoryPharmacy, 0)
	for phRows.Next() {
		var row patientHistoryPharmacy
		var printedAt sql.NullString
		var collected sql.NullInt64
		if err := phRows.Scan(
			&row.ID, &row.BillNo, &row.Status, &row.TotalMMK, &row.CreatedAt,
			&printedAt, &collected,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
			return
		}
		if printedAt.Valid && strings.TrimSpace(printedAt.String) != "" {
			v := printedAt.String
			row.PrintedAt = &v
		}
		if collected.Valid {
			v := int(collected.Int64)
			row.CollectedCash = &v
		}
		pharmacy = append(pharmacy, row)
	}
	if err := phRows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
		return
	}

	otRows, err := h.DB.Query(`
		SELECT c.case_no, c.status,
		       COALESCE(b.id, 0), COALESCE(b.bill_no, ''), COALESCE(b.status, ''),
		       b.total_mmk, b.printed_at, b.collected_cash,
		       c.created_at
		FROM ot_cases c
		LEFT JOIN ot_bills b ON b.id = c.ot_bill_id AND b.status != 'deleted'
		WHERE c.patient_id = ?
		  AND c.status != 'deleted'
		ORDER BY c.created_at DESC, c.id DESC
	`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
		return
	}
	defer otRows.Close()
	ot := make([]patientHistoryOT, 0)
	for otRows.Next() {
		var row patientHistoryOT
		var billTotal sql.NullInt64
		var printedAt sql.NullString
		var collected sql.NullInt64
		if err := otRows.Scan(
			&row.CaseNo, &row.Status, &row.BillID, &row.BillNo, &row.BillStatus,
			&billTotal, &printedAt, &collected, &row.CreatedAt,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
			return
		}
		if billTotal.Valid {
			v := billTotal.Int64
			row.BillTotalMMK = &v
		}
		if printedAt.Valid && strings.TrimSpace(printedAt.String) != "" {
			v := printedAt.String
			row.BillPrintedAt = &v
		}
		if collected.Valid {
			v := int(collected.Int64)
			row.BillCollectedCash = &v
		}
		ot = append(ot, row)
	}
	if err := otRows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
		return
	}

	labRows, err := h.DB.Query(`
		SELECT id, bill_no, status, total_mmk, created_at, doctor_name, printed_at, collected_cash
		FROM lab_bills
		WHERE patient_id = ?
		  AND status != 'deleted'
		ORDER BY created_at DESC, id DESC
	`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
		return
	}
	defer labRows.Close()
	lab := make([]patientHistoryLab, 0)
	for labRows.Next() {
		var row patientHistoryLab
		var printedAt sql.NullString
		var collected sql.NullInt64
		if err := labRows.Scan(
			&row.ID, &row.BillNo, &row.Status, &row.TotalMMK, &row.CreatedAt, &row.DoctorName,
			&printedAt, &collected,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
			return
		}
		if printedAt.Valid && strings.TrimSpace(printedAt.String) != "" {
			v := printedAt.String
			row.PrintedAt = &v
		}
		if collected.Valid {
			v := int(collected.Int64)
			row.CollectedCash = &v
		}
		lab = append(lab, row)
	}
	if err := labRows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
		return
	}

	ipdRows, err := h.DB.Query(`
		SELECT a.admission_no, a.status, a.admitted_at,
		       COALESCE((SELECT SUM(l.amount_mmk) FROM ipd_ledger l WHERE l.admission_id = a.id), 0)
		FROM ipd_admissions a
		WHERE a.patient_id = ?
		ORDER BY a.admitted_at DESC, a.id DESC
	`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
		return
	}
	defer ipdRows.Close()
	ipd := make([]patientHistoryIPD, 0)
	for ipdRows.Next() {
		var row patientHistoryIPD
		if err := ipdRows.Scan(&row.AdmissionNo, &row.Status, &row.AdmittedAt, &row.BalanceMMK); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
			return
		}
		row.Settled = row.Status == "settled"
		ipd = append(ipd, row)
	}
	if err := ipdRows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history failed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"opd":      opd,
		"pharmacy": pharmacy,
		"ot":       ot,
		"lab":      lab,
		"ipd":      ipd,
	})
}
