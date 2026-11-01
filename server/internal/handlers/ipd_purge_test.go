package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestIpdAdmissionPurgeAdminOnly(t *testing.T) {
	sqlDB := openTestDB(t)
	today := localToday()
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, ipdTok := insertSession(t, sqlDB, auth.RoleIPD, 0)
	ipd := &IPD{DB: sqlDB}
	charts := &Patients{DB: sqlDB}

	w := doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Daw Purge","phone":"091234"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)

	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", adminTok, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)
	stayPath := "/api/ipd/admissions/" + strconv.FormatInt(stay.ID, 10)

	w = doJSON(ipd, http.MethodPost, stayPath+"/deposits", adminTok, `{"amount_mmk":5000,"note":"advance"}`)
	mustCode(t, w, http.StatusCreated)
	var ledgerBefore int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_ledger WHERE admission_id = ?`, stay.ID).Scan(&ledgerBefore); err != nil {
		t.Fatal(err)
	}
	if ledgerBefore < 1 {
		t.Fatalf("expected deposit ledger rows, got %d", ledgerBefore)
	}

	cashBefore, err := buildIpdCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	if cashBefore.DepositMMK < 5000 {
		t.Fatalf("cash before purge deposit %d", cashBefore.DepositMMK)
	}
	openBefore, err := buildIpdOpenStays(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	foundOpen := false
	for _, row := range openBefore.Stays {
		if row.AdmissionNo == stay.AdmissionNo {
			foundOpen = true
			break
		}
	}
	if !foundOpen {
		t.Fatal("open stays missing stay before purge")
	}

	w = doJSON(ipd, http.MethodDelete, stayPath, ipdTok, "")
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(ipd, http.MethodDelete, stayPath, adminTok, "")
	mustCode(t, w, http.StatusOK)

	var status string
	if err := sqlDB.QueryRow(`SELECT status FROM ipd_admissions WHERE id = ?`, stay.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "deleted" {
		t.Fatalf("status after purge %q", status)
	}
	var ledgerAfter int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_ledger WHERE admission_id = ?`, stay.ID).Scan(&ledgerAfter); err != nil {
		t.Fatal(err)
	}
	if ledgerAfter != ledgerBefore {
		t.Fatalf("ledger count changed %d -> %d", ledgerBefore, ledgerAfter)
	}

	w = doJSON(ipd, http.MethodGet, "/api/ipd/admissions", adminTok, "")
	mustCode(t, w, http.StatusOK)
	for _, row := range decodeAdmissionList(t, w) {
		if row.ID == stay.ID {
			t.Fatal("deleted stay still in unfiltered list")
		}
	}
	w = doJSON(ipd, http.MethodGet, "/api/ipd/admissions?status=open", adminTok, "")
	mustCode(t, w, http.StatusOK)
	for _, row := range decodeAdmissionList(t, w) {
		if row.ID == stay.ID {
			t.Fatal("deleted stay still in open list")
		}
	}
	w = doJSON(ipd, http.MethodGet, "/api/ipd/admissions?status=deleted", adminTok, "")
	mustCode(t, w, http.StatusOK)
	deletedList := decodeAdmissionList(t, w)
	foundDeleted := false
	for _, row := range deletedList {
		if row.ID == stay.ID && row.Status == "deleted" {
			foundDeleted = true
			break
		}
	}
	if !foundDeleted {
		t.Fatalf("deleted filter missing stay: %s", w.Body.String())
	}

	w = doJSON(charts, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10)+"/history", adminTok, "")
	mustCode(t, w, http.StatusOK)
	hist := decodeHistory(t, w)
	for _, row := range hist.IPD {
		if row.AdmissionNo == stay.AdmissionNo {
			t.Fatal("deleted stay still on patient history")
		}
	}

	cashAfter, err := buildIpdCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	if cashAfter.DepositMMK != cashBefore.DepositMMK-5000 {
		t.Fatalf("cash after purge deposit %d want %d", cashAfter.DepositMMK, cashBefore.DepositMMK-5000)
	}
	for _, line := range cashAfter.Lines {
		if line.AdmissionNo == stay.AdmissionNo {
			t.Fatal("deleted stay still in daily cash lines")
		}
	}

	openAfter, err := buildIpdOpenStays(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range openAfter.Stays {
		if row.AdmissionNo == stay.AdmissionNo {
			t.Fatal("deleted stay still in open stays")
		}
	}

	w = doJSON(charts, http.MethodGet, "/api/patients/"+strconv.FormatInt(chart.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	reloaded := decodePatient(t, w)
	if reloaded.OpenAdmissionID != nil {
		t.Fatalf("open_admission_id still set %+v", reloaded.OpenAdmissionID)
	}

	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", adminTok, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	again := decodeAdmission(t, w)
	if again.Status != "open" || again.ID == stay.ID {
		t.Fatalf("readmit %+v", again)
	}

	// Settled stay cannot be purged.
	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"U Settled","phone":"099999"}`)
	mustCode(t, w, http.StatusCreated)
	settledChart := decodePatient(t, w)
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", adminTok, fmt.Sprintf(`{"patient_id":%d}`, settledChart.ID))
	mustCode(t, w, http.StatusCreated)
	settledStay := decodeAdmission(t, w)
	settledPath := "/api/ipd/admissions/" + strconv.FormatInt(settledStay.ID, 10)
	w = doJSON(ipd, http.MethodPost, settledPath+"/discharge", adminTok, ``)
	mustCode(t, w, http.StatusOK)
	if decodeAdmission(t, w).Status != "settled" {
		t.Fatal("expected settled")
	}
	w = doJSON(ipd, http.MethodDelete, settledPath, adminTok, "")
	mustCode(t, w, http.StatusBadRequest)
	var still string
	if err := sqlDB.QueryRow(`SELECT status FROM ipd_admissions WHERE id = ?`, settledStay.ID).Scan(&still); err != nil {
		t.Fatal(err)
	}
	if still != "settled" {
		t.Fatalf("settled stay status became %q", still)
	}

	// Second delete of already-deleted stay is refused.
	w = doJSON(ipd, http.MethodDelete, stayPath, adminTok, "")
	mustCode(t, w, http.StatusBadRequest)

	var auditN int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM audit_logs WHERE entity = 'ipd_admission' AND action = 'delete'
	`).Scan(&auditN); err != nil {
		t.Fatal(err)
	}
	if auditN < 1 {
		t.Fatalf("audit deletes %d", auditN)
	}

	// Migration applied: status check accepts deleted.
	var applied int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '039_ipd_admission_deleted'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatal("039_ipd_admission_deleted not applied")
	}
}
