package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

// payBody is optional on desk pay. Omitting admission_id is today's cash pay.
type payBody struct {
	AdmissionID  *int64 `json:"admission_id"`
	SourceBillID *int64 `json:"source_bill_id"`
}

type stayBind struct {
	AdmissionID *int64
	Code        int
	Error       string
}

var (
	errInvalidAdmission = errors.New("invalid admission_id")
	errInvalidSource    = errors.New("invalid source_bill_id")
)

func decodePayBody(r *http.Request) (payBody, error) {
	var body payBody
	if r == nil || r.Body == nil {
		return body, nil
	}
	err := json.NewDecoder(r.Body).Decode(&body)
	if err == io.EOF {
		return payBody{}, nil
	}
	if err != nil {
		return body, err
	}
	if body.AdmissionID != nil && *body.AdmissionID <= 0 {
		return body, errInvalidAdmission
	}
	if body.SourceBillID != nil && *body.SourceBillID <= 0 {
		return body, errInvalidSource
	}
	return body, nil
}

func rejectPayBody(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	msg := "invalid json"
	if errors.Is(err, errInvalidAdmission) || errors.Is(err, errInvalidSource) {
		msg = err.Error()
	}
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
	return true
}

func (b stayBind) reject(w http.ResponseWriter) bool {
	if b.Code == 0 {
		return false
	}
	writeJSON(w, b.Code, map[string]string{"error": b.Error})
	return true
}

// bindSaleCharge posts a desk sale to an open stay for the same patient.
// A nil admission is cash.
func bindSaleCharge(tx *sql.Tx, billPatient sql.NullInt64, requested *int64) stayBind {
	if requested == nil {
		return stayBind{}
	}
	if !billPatient.Valid {
		return stayBind{Code: http.StatusBadRequest, Error: "bill has no patient"}
	}
	var stayPatient int64
	var status string
	err := tx.QueryRow(`SELECT patient_id, status FROM ipd_admissions WHERE id = ?`, *requested).Scan(&stayPatient, &status)
	if err == sql.ErrNoRows {
		return stayBind{Code: http.StatusNotFound, Error: "stay not found"}
	}
	if err != nil {
		return stayBind{Code: http.StatusInternalServerError, Error: "load failed"}
	}
	if status != "open" {
		return stayBind{Code: http.StatusConflict, Error: "stay is not open"}
	}
	if stayPatient != billPatient.Int64 {
		return stayBind{Code: http.StatusBadRequest, Error: "stay is for a different patient"}
	}
	id := *requested
	return stayBind{AdmissionID: &id}
}

// bindReturnCredit credits an open stay when the named sale was charged to it.
// A cash sale, or a return that names nothing, stays cash.
func bindReturnCredit(tx *sql.Tx, billPatient sql.NullInt64, body payBody) stayBind {
	if body.AdmissionID == nil && body.SourceBillID == nil {
		return stayBind{}
	}
	if !billPatient.Valid {
		return stayBind{Code: http.StatusBadRequest, Error: "bill has no patient"}
	}

	var admissionID int64
	if body.SourceBillID != nil {
		var billNo, status string
		var salePatient, saleAdmission sql.NullInt64
		err := tx.QueryRow(`
			SELECT bill_no, status, patient_id, admission_id FROM pharmacy_bills WHERE id = ?
		`, *body.SourceBillID).Scan(&billNo, &status, &salePatient, &saleAdmission)
		if err == sql.ErrNoRows {
			return stayBind{Code: http.StatusNotFound, Error: "sale not found"}
		}
		if err != nil {
			return stayBind{Code: http.StatusInternalServerError, Error: "load failed"}
		}
		if !strings.HasPrefix(billNo, "PH-") {
			return stayBind{Code: http.StatusBadRequest, Error: "return must name a sale"}
		}
		if status != "paid" {
			return stayBind{Code: http.StatusBadRequest, Error: "sale is not paid"}
		}
		if !salePatient.Valid || salePatient.Int64 != billPatient.Int64 {
			return stayBind{Code: http.StatusBadRequest, Error: "sale is for a different patient"}
		}
		if !saleAdmission.Valid {
			if body.AdmissionID != nil {
				return stayBind{Code: http.StatusBadRequest, Error: "sale was cash"}
			}
			return stayBind{}
		}
		if body.AdmissionID != nil && *body.AdmissionID != saleAdmission.Int64 {
			return stayBind{Code: http.StatusBadRequest, Error: "stay is for a different patient"}
		}
		admissionID = saleAdmission.Int64
	} else {
		admissionID = *body.AdmissionID
		var n int
		err := tx.QueryRow(`
			SELECT COUNT(*) FROM pharmacy_bills
			WHERE admission_id = ? AND patient_id = ? AND status = 'paid'
			  AND bill_no LIKE 'PH-%' AND collected_cash = 0
		`, admissionID, billPatient.Int64).Scan(&n)
		if err != nil {
			return stayBind{Code: http.StatusInternalServerError, Error: "load failed"}
		}
		if n == 0 {
			return stayBind{Code: http.StatusBadRequest, Error: "no charged pharmacy sale on this stay"}
		}
	}

	var stayPatient int64
	var status string
	err := tx.QueryRow(`SELECT patient_id, status FROM ipd_admissions WHERE id = ?`, admissionID).Scan(&stayPatient, &status)
	if err == sql.ErrNoRows {
		return stayBind{Code: http.StatusNotFound, Error: "stay not found"}
	}
	if err != nil {
		return stayBind{Code: http.StatusInternalServerError, Error: "load failed"}
	}
	if status != "open" {
		return stayBind{Code: http.StatusConflict, Error: "stay is not open"}
	}
	if stayPatient != billPatient.Int64 {
		return stayBind{Code: http.StatusBadRequest, Error: "stay is for a different patient"}
	}
	id := admissionID
	return stayBind{AdmissionID: &id}
}

func ensureOpenStay(tx *sql.Tx, admissionID int64) stayBind {
	var status string
	err := tx.QueryRow(`SELECT status FROM ipd_admissions WHERE id = ?`, admissionID).Scan(&status)
	if err == sql.ErrNoRows {
		return stayBind{Code: http.StatusNotFound, Error: "stay not found"}
	}
	if err != nil {
		return stayBind{Code: http.StatusInternalServerError, Error: "load failed"}
	}
	if status != "open" {
		return stayBind{Code: http.StatusConflict, Error: "stay is not open"}
	}
	id := admissionID
	return stayBind{AdmissionID: &id}
}

func postLedgerTx(tx *sql.Tx, admissionID int64, kind string, amount int64, source string, sourceID int64, note string, actor int64) error {
	_, err := tx.Exec(`
		INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, source, source_id, note, actor_user_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, admissionID, kind, amount, source, sourceID, note, actor)
	return err
}

// reverseLedgerTx writes the opposite of the latest charge for this bill.
func reverseLedgerTx(tx *sql.Tx, admissionID int64, source string, billID, actor int64, billNo string) error {
	var amount int64
	err := tx.QueryRow(`
		SELECT amount_mmk FROM ipd_ledger
		WHERE admission_id = ? AND source = ? AND source_id = ? AND kind = 'charge'
		ORDER BY id DESC LIMIT 1
	`, admissionID, source, billID).Scan(&amount)
	if err != nil {
		return err
	}
	return postLedgerTx(tx, admissionID, "reversal", -amount, source, billID, billNo, actor)
}
