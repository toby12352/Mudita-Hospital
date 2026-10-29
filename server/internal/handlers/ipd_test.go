package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestIPDAdmissions(t *testing.T) {
	if !auth.HasPermission(auth.RoleAdmin, auth.PermIPD) || !auth.HasPermission(auth.RoleIPD, auth.PermIPD) {
		t.Fatal("Admin or IPD missing ipd")
	}
	for _, role := range []string{auth.RoleOPD, auth.RoleOT, auth.RolePharmacy, auth.RolePatients} {
		if auth.HasPermission(role, auth.PermIPD) {
			t.Fatalf("%s has ipd", role)
		}
	}
	if auth.HasPermission(auth.RoleIPD, auth.PermPatients) || auth.HasPermission(auth.RoleIPD, auth.PermOPD) {
		t.Fatal("IPD has a desk permission it should not")
	}

	sqlDB := openTestDB(t)
	for _, table := range []string{"opd_bills", "ot_bills", "pharmacy_bills"} {
		if !columnExists(t, sqlDB, table, "admission_id") || !columnExists(t, sqlDB, table, "collected_cash") {
			t.Fatalf("%s missing admission columns", table)
		}
	}
	var ledger int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM sqlite_master WHERE type = 'table' AND name = 'ipd_ledger'`).Scan(&ledger); err != nil {
		t.Fatal(err)
	}
	if ledger != 1 {
		t.Fatal("ipd_ledger missing")
	}

	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	ipdUser, ipdTok := insertSession(t, sqlDB, auth.RoleIPD, 0)
	_, patientsTok := insertSession(t, sqlDB, auth.RolePatients, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	h := &IPD{DB: sqlDB}
	charts := &Patients{DB: sqlDB}
	authH := &Auth{DB: sqlDB}

	w := doJSON(authH, http.MethodGet, "/api/auth/me", adminTok, "")
	mustCode(t, w, http.StatusOK)
	if !meHasPerm(t, w, auth.PermIPD) {
		t.Fatal("admin /me missing ipd")
	}
	w = doJSON(authH, http.MethodGet, "/api/auth/me", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	if !meHasPerm(t, w, auth.PermIPD) || meHasPerm(t, w, auth.PermPatients) || meHasPerm(t, w, auth.PermOPD) {
		t.Fatalf("ipd /me %s", w.Body.String())
	}

	var stockBefore int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&stockBefore); err != nil {
		t.Fatal(err)
	}

	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Daw Stay","phone":"091111","age_years":44,"gender":"F"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"U Other","phone":"092222"}`)
	mustCode(t, w, http.StatusCreated)
	other := decodePatient(t, w)

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", patientsTok, `{"patient_id":`+strconv.FormatInt(chart.ID, 10)+`}`)
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", opdTok, `{"patient_id":`+strconv.FormatInt(chart.ID, 10)+`}`)
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(charts, http.MethodGet, "/api/patients?q=Stay", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	found := decodePatientList(t, w)
	if len(found) != 1 || found[0].ID != chart.ID {
		t.Fatalf("ipd search %+v", found)
	}
	w = doJSON(charts, http.MethodPost, "/api/patients", ipdTok, `{"name":"Nope"}`)
	mustCode(t, w, http.StatusForbidden)
	w = doJSON(charts, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", ipdTok, "")
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", ipdTok, `{"patient_id":0}`)
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", ipdTok, `{"patient_id":999999}`)
	mustCode(t, w, http.StatusNotFound)

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", ipdTok, `{"patient_id":`+strconv.FormatInt(chart.ID, 10)+`,"notes":" ward "}`)
	mustCode(t, w, http.StatusCreated)
	first := decodeAdmission(t, w)
	if first.AdmissionNo != "IPD-000001" || first.Status != "open" || first.Notes != "ward" || first.RoomNo != "" || first.Patient.Name != "Daw Stay" {
		t.Fatalf("admit %+v", first)
	}
	if first.Patient.Phone != "091111" || first.Patient.AgeYears == nil || *first.Patient.AgeYears != 44 || first.Patient.Gender != "F" {
		t.Fatalf("demographics %+v", first.Patient)
	}
	if first.DischargedAt != nil || first.CreatedByUserID == nil || *first.CreatedByUserID != ipdUser {
		t.Fatalf("actor %+v discharged %v", first.CreatedByUserID, first.DischargedAt)
	}
	if first.BalanceMMK == nil || *first.BalanceMMK != 0 || len(first.Ledger) != 0 {
		t.Fatalf("fresh stay should have a zero balance and no lines: %s", w.Body.String())
	}

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", adminTok, `{"patient_id":`+strconv.FormatInt(chart.ID, 10)+`}`)
	mustCode(t, w, http.StatusConflict)

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", ipdTok, `{"patient_id":`+strconv.FormatInt(other.ID, 10)+`}`)
	mustCode(t, w, http.StatusCreated)
	second := decodeAdmission(t, w)
	if second.AdmissionNo != "IPD-000002" || second.PatientID != other.ID {
		t.Fatalf("second %+v", second)
	}

	w = doJSON(h, http.MethodGet, "/api/ipd/admissions?status=open", ipdTok, "")
	mustCode(t, w, http.StatusOK)
	open := decodeAdmissionList(t, w)
	if len(open) != 2 || open[0].AdmissionNo != "IPD-000002" || open[1].AdmissionNo != "IPD-000001" {
		t.Fatalf("open list %+v", open)
	}
	w = doJSON(h, http.MethodGet, "/api/ipd/admissions?status=nope", ipdTok, "")
	mustCode(t, w, http.StatusBadRequest)

	w = doJSON(h, http.MethodGet, "/api/ipd/admissions/"+strconv.FormatInt(first.ID, 10), ipdTok, "")
	mustCode(t, w, http.StatusOK)
	if decodeAdmission(t, w).Patient.ID != chart.ID {
		t.Fatal("get lost the chart")
	}
	stayPath := "/api/ipd/admissions/" + strconv.FormatInt(first.ID, 10)
	w = doJSON(h, http.MethodPut, stayPath, ipdTok, `{"notes":" stable "}`)
	mustCode(t, w, http.StatusOK)
	noted := decodeAdmission(t, w)
	if noted.Notes != "stable" || noted.Status != "open" || noted.RoomNo != "" {
		t.Fatalf("notes %+v", noted)
	}
	w = doJSON(h, http.MethodPut, stayPath, ipdTok, `{"notes":"stable","room_no":" 12-A "}`)
	mustCode(t, w, http.StatusOK)
	withRoom := decodeAdmission(t, w)
	if withRoom.Notes != "stable" || withRoom.RoomNo != "12-A" {
		t.Fatalf("room %+v", withRoom)
	}
	w = doJSON(h, http.MethodPut, stayPath, ipdTok, `{"notes":"still stable"}`)
	mustCode(t, w, http.StatusOK)
	kept := decodeAdmission(t, w)
	if kept.Notes != "still stable" || kept.RoomNo != "12-A" {
		t.Fatalf("notes-only put cleared room %+v", kept)
	}
	w = doJSON(h, http.MethodPut, stayPath, ipdTok, `{"notes":"still stable","room_no":"`+strings.Repeat("r", 33)+`"}`)
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(w.Body.String(), "room number too long") {
		t.Fatalf("long room %s", w.Body.String())
	}

	w = doJSON(charts, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", patientsTok, "")
	mustCode(t, w, http.StatusOK)
	hist := decodeHistory(t, w)
	if len(hist.IPD) != 1 || hist.IPD[0].AdmissionNo != "IPD-000001" || hist.IPD[0].Status != "open" || hist.IPD[0].AdmittedAt == "" {
		t.Fatalf("history ipd %+v", hist.IPD)
	}
	if len(hist.OPD) != 0 || len(hist.OT) != 0 {
		t.Fatalf("history changed other desks %+v", hist)
	}
	w = doJSON(charts, http.MethodGet, "/api/patients/"+strconv.FormatInt(other.ID, 10)+"/history", patientsTok, "")
	mustCode(t, w, http.StatusOK)
	otherHist := decodeHistory(t, w)
	if len(otherHist.IPD) != 1 || otherHist.IPD[0].AdmissionNo != "IPD-000002" {
		t.Fatalf("other history %+v", otherHist.IPD)
	}

	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET status = 'settled', discharged_at = datetime('now') WHERE id = ?`, first.ID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(h, http.MethodPut, "/api/ipd/admissions/"+strconv.FormatInt(first.ID, 10), ipdTok, `{"notes":"later"}`)
	mustCode(t, w, http.StatusConflict)
	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", ipdTok, `{"patient_id":`+strconv.FormatInt(chart.ID, 10)+`}`)
	mustCode(t, w, http.StatusCreated)
	again := decodeAdmission(t, w)
	if again.AdmissionNo != "IPD-000003" || again.Status != "open" {
		t.Fatalf("readmit %+v", again)
	}

	var stockAfter int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&stockAfter); err != nil {
		t.Fatal(err)
	}
	if stockBefore != stockAfter {
		t.Fatalf("stock movements %d → %d", stockBefore, stockAfter)
	}
	var ledgerRows int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_ledger`).Scan(&ledgerRows); err != nil {
		t.Fatal(err)
	}
	if ledgerRows != 0 {
		t.Fatalf("admissions wrote ledger rows %d", ledgerRows)
	}
	var auditN int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM audit_logs WHERE entity = 'ipd_admission' AND action = 'create'
	`).Scan(&auditN); err != nil {
		t.Fatal(err)
	}
	if auditN < 3 {
		t.Fatalf("audit creates %d", auditN)
	}
}

func decodeAdmission(t *testing.T, w *httptest.ResponseRecorder) ipdAdmission {
	t.Helper()
	var row ipdAdmission
	if err := json.Unmarshal(w.Body.Bytes(), &row); err != nil {
		t.Fatalf("admission json: %v body=%s", err, w.Body.String())
	}
	return row
}

func decodeAdmissionList(t *testing.T, w *httptest.ResponseRecorder) []ipdAdmission {
	t.Helper()
	var body struct {
		Admissions []ipdAdmission `json:"admissions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("list json: %v body=%s", err, w.Body.String())
	}
	if body.Admissions == nil {
		t.Fatalf("null list: %s", w.Body.String())
	}
	return body.Admissions
}

func columnExists(t *testing.T, sqlDB *sql.DB, table, column string) bool {
	t.Helper()
	rows, err := sqlDB.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var cid, notnull, pk int
		var name, ctype string
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			t.Fatal(err)
		}
		if name == column {
			return true
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return false
}
