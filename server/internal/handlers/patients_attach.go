package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

// Attach sets patient_id on one bill that is still null. It does not match by
// name, and it does not change totals, status, stock, or cash flags.
// OT stores the chart on ot_cases, not on the bill.

type attachRequest struct {
	BillNo string `json:"bill_no"`
}

type attachResult struct {
	code int
	msg  string
}

func (h *Patients) attach(w http.ResponseWriter, r *http.Request, path string) {
	idPath := strings.TrimSuffix(path, "/attach")
	patientID, ok := parseID(idPath)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if _, err := loadPatient(h.DB, patientID); err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	var req attachRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	billNo := strings.ToUpper(strings.TrimSpace(req.BillNo))
	if billNo == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bill_no required"})
		return
	}
	if strings.HasPrefix(billNo, "TO-") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot attach a transfer"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "attach failed"})
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	var result attachResult
	switch {
	case strings.HasPrefix(billNo, "OPD-"):
		result = attachBillPatient(tx, "opd_bills", billNo, patientID)
	case strings.HasPrefix(billNo, "LAB-"):
		result = attachBillPatient(tx, "lab_bills", billNo, patientID)
	case strings.HasPrefix(billNo, "PH-"), strings.HasPrefix(billNo, "RT-"):
		result = attachBillPatient(tx, "pharmacy_bills", billNo, patientID)
	case strings.HasPrefix(billNo, "OTB-"):
		result = attachOtCase(tx, billNo, patientID)
	default:
		result = attachResult{code: http.StatusNotFound, msg: "bill not found"}
	}
	if result.code != 0 {
		writeJSON(w, result.code, map[string]string{"error": result.msg})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "attach failed"})
		return
	}
	committed = true

	var auditActor *int64
	if user := middleware.UserFromContext(r.Context()); user != nil {
		uid := user.ID
		auditActor = &uid
	}
	audit.WriteAudit(h.DB, auditActor, "update", "patient", &patientID, map[string]any{
		"attach_bill_no": billNo,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"patient_id": patientID,
		"bill_no":    billNo,
	})
}

func attachBillPatient(tx *sql.Tx, table, billNo string, patientID int64) attachResult {
	switch table {
	case "opd_bills", "pharmacy_bills":
	default:
		return attachResult{code: http.StatusNotFound, msg: "bill not found"}
	}
	var id int64
	var existing sql.NullInt64
	err := tx.QueryRow(`SELECT id, patient_id FROM `+table+` WHERE bill_no = ?`, billNo).Scan(&id, &existing)
	if err == sql.ErrNoRows {
		return attachResult{code: http.StatusNotFound, msg: "bill not found"}
	}
	if err != nil {
		return attachResult{code: http.StatusInternalServerError, msg: "attach failed"}
	}
	if existing.Valid {
		return attachResult{code: http.StatusConflict, msg: "bill already has a patient"}
	}
	res, err := tx.Exec(`UPDATE `+table+` SET patient_id = ? WHERE id = ? AND patient_id IS NULL`, patientID, id)
	if err != nil {
		return attachResult{code: http.StatusInternalServerError, msg: "attach failed"}
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return attachResult{code: http.StatusConflict, msg: "bill already has a patient"}
	}
	return attachResult{}
}

func attachOtCase(tx *sql.Tx, billNo string, patientID int64) attachResult {
	var caseID int64
	var existing sql.NullInt64
	err := tx.QueryRow(`
		SELECT c.id, c.patient_id
		FROM ot_bills b
		JOIN ot_cases c ON c.id = b.case_id
		WHERE b.bill_no = ?
	`, billNo).Scan(&caseID, &existing)
	if err == sql.ErrNoRows {
		return attachResult{code: http.StatusNotFound, msg: "bill not found"}
	}
	if err != nil {
		return attachResult{code: http.StatusInternalServerError, msg: "attach failed"}
	}
	if existing.Valid {
		return attachResult{code: http.StatusConflict, msg: "bill already has a patient"}
	}
	res, err := tx.Exec(`
		UPDATE ot_cases SET patient_id = ? WHERE id = ? AND patient_id IS NULL
	`, patientID, caseID)
	if err != nil {
		return attachResult{code: http.StatusInternalServerError, msg: "attach failed"}
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return attachResult{code: http.StatusConflict, msg: "bill already has a patient"}
	}
	return attachResult{}
}
