package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"mudita-hospital/server/internal/auth"
)

func TestAdminBilledAtOnOpdBill(t *testing.T) {
	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	opd := &OPD{DB: sqlDB}

	res, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('BA1', 'Billed at svc', 2000)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := res.LastInsertId()

	chosen := "2024-01-15T10:30"
	wantYangon := "2024-01-15 10:30:00"
	wantUTC := time.Date(2024, 1, 15, 10, 30, 0, 0, yangon).UTC().Format("2006-01-02 15:04:05")

	w := doJSON(opd, http.MethodPost, "/api/opd/bills", opdTok, fmt.Sprintf(`{
		"patient_name":"Non Admin",
		"save_patient":false,
		"billed_at":%q,
		"lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1}]
	}`, chosen, serviceID))
	mustCode(t, w, http.StatusForbidden)
	var n int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM opd_bills WHERE patient_name = 'Non Admin'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("non-admin create wrote %d rows", n)
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", adminTok, fmt.Sprintf(`{
		"patient_name":"Bad Date",
		"save_patient":false,
		"billed_at":"not-a-date",
		"lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1}]
	}`, serviceID))
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(w.Body.String(), "invalid billed_at") {
		t.Fatalf("body %s", w.Body.String())
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", adminTok, fmt.Sprintf(`{
		"patient_name":"Backdated",
		"save_patient":false,
		"billed_at":%q,
		"lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1}]
	}`, chosen, serviceID))
	mustCode(t, w, http.StatusCreated)
	bill := decodeOpdBill(t, w)
	if bill.BilledAt == nil || *bill.BilledAt != wantYangon {
		t.Fatalf("billed_at %+v want %s", bill.BilledAt, wantYangon)
	}
	if bill.CreatedAt != wantUTC {
		t.Fatalf("created_at %q want %q", bill.CreatedAt, wantUTC)
	}

	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", bill.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusOK)
	paid := decodeOpdBill(t, w)
	if paid.PaidAt == nil || *paid.PaidAt != wantYangon {
		t.Fatalf("paid_at %+v want %s", paid.PaidAt, wantYangon)
	}

	cash, err := buildDailyCash(sqlDB, "2024-01-15")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, line := range cash.Lines {
		if line.BillNo == paid.BillNo {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("daily cash 2024-01-15 missing %s: %+v", paid.BillNo, cash.Lines)
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", adminTok, fmt.Sprintf(`{
		"patient_name":"Live Clock",
		"save_patient":false,
		"lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1}]
	}`, serviceID))
	mustCode(t, w, http.StatusCreated)
	live := decodeOpdBill(t, w)
	if live.BilledAt != nil {
		t.Fatalf("unexpected billed_at %+v", live.BilledAt)
	}
	beforePay := time.Now().In(yangon)
	w = doJSON(opd, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", live.ID), adminTok, `{}`)
	mustCode(t, w, http.StatusOK)
	livePaid := decodeOpdBill(t, w)
	if livePaid.PaidAt == nil {
		t.Fatal("paid_at missing")
	}
	paidAt, err := time.ParseInLocation("2006-01-02 15:04:05", *livePaid.PaidAt, yangon)
	if err != nil {
		t.Fatal(err)
	}
	if paidAt.Before(beforePay.Add(-2*time.Minute)) || paidAt.After(time.Now().In(yangon).Add(2*time.Minute)) {
		t.Fatalf("live paid_at %s not near now", *livePaid.PaidAt)
	}
}

func TestAdminBilledAtOnIpdAdmit(t *testing.T) {
	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, ipdTok := insertSession(t, sqlDB, auth.RoleIPD, 0)
	h := &IPD{DB: sqlDB}
	charts := &Patients{DB: sqlDB}

	w := doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Admin Admit","phone":"099"}`)
	mustCode(t, w, http.StatusCreated)
	adminChart := decodePatient(t, w)
	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Staff Admit","phone":"098"}`)
	mustCode(t, w, http.StatusCreated)
	staffChart := decodePatient(t, w)

	chosen := "2023-06-01T08:15"
	wantUTC := time.Date(2023, 6, 1, 8, 15, 0, 0, yangon).UTC().Format("2006-01-02 15:04:05")

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", ipdTok, fmt.Sprintf(`{
		"patient_id":%d,"billed_at":%q
	}`, staffChart.ID, chosen))
	mustCode(t, w, http.StatusForbidden)
	var n int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ipd_admissions WHERE patient_id = ?`, staffChart.ID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("non-admin admit wrote %d rows", n)
	}

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", adminTok, fmt.Sprintf(`{
		"patient_id":%d,"billed_at":%q
	}`, adminChart.ID, chosen))
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)
	if stay.AdmittedAt != wantUTC {
		t.Fatalf("admitted_at %q want %q", stay.AdmittedAt, wantUTC)
	}

	w = doJSON(h, http.MethodPost, "/api/ipd/admissions", ipdTok, fmt.Sprintf(`{
		"patient_id":%d
	}`, staffChart.ID))
	mustCode(t, w, http.StatusCreated)
	staffStay := decodeAdmission(t, w)
	if staffStay.AdmittedAt == wantUTC {
		t.Fatalf("staff admit should use live clock, got %s", staffStay.AdmittedAt)
	}
}

func TestParseAdminBilledAt(t *testing.T) {
	override, status, msg := parseAdminBilledAt(auth.RoleOPD, "2024-01-01T12:00")
	if override != nil || status != http.StatusForbidden || msg != "admin only" {
		t.Fatalf("non-admin %+v %d %q", override, status, msg)
	}
	override, status, msg = parseAdminBilledAt(auth.RoleAdmin, "")
	if override != nil || status != 0 || msg != "" {
		t.Fatalf("empty %+v %d %q", override, status, msg)
	}
	override, status, msg = parseAdminBilledAt(auth.RoleAdmin, "bogus")
	if override != nil || status != http.StatusBadRequest || msg != "invalid billed_at" {
		t.Fatalf("bogus %+v %d %q", override, status, msg)
	}
	override, status, msg = parseAdminBilledAt(auth.RoleAdmin, "2024-01-15 10:30:00")
	if status != 0 || msg != "" || override == nil {
		t.Fatalf("ok space %+v %d %q", override, status, msg)
	}
	if override.Yangon != "2024-01-15 10:30:00" {
		t.Fatalf("yangon %q", override.Yangon)
	}
}
