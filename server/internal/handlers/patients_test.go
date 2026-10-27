package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestPatientChartAPI(t *testing.T) {
	if !auth.HasPermission(auth.RoleAdmin, auth.PermPatients) {
		t.Fatal("Admin missing patients")
	}
	for _, role := range []string{auth.RoleOPD, auth.RoleOT, auth.RolePharmacy, auth.RoleIPD} {
		if auth.HasPermission(role, auth.PermPatients) {
			t.Fatalf("%s has patients", role)
		}
	}

	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	h := &Patients{DB: sqlDB}
	opd := &OPD{DB: sqlDB}

	w := doJSON(h, http.MethodPost, "/api/patients", "", `{"name":"No Auth"}`)
	mustCode(t, w, http.StatusUnauthorized)

	w = doJSON(h, http.MethodPost, "/api/patients", opdTok, `{"name":"Desk"}`)
	mustCode(t, w, http.StatusForbidden)

	authH := &Auth{DB: sqlDB}
	w = doJSON(authH, http.MethodGet, "/api/auth/me", adminTok, "")
	mustCode(t, w, http.StatusOK)
	if !meHasPerm(t, w, auth.PermPatients) {
		t.Fatal("admin /me missing patients")
	}
	w = doJSON(authH, http.MethodGet, "/api/auth/me", opdTok, "")
	mustCode(t, w, http.StatusOK)
	if meHasPerm(t, w, auth.PermPatients) {
		t.Fatal("opd /me has patients")
	}

	w = doJSON(h, http.MethodPost, "/api/patients", adminTok, `{"name":"  "}`)
	mustCode(t, w, http.StatusBadRequest)

	w = doJSON(h, http.MethodPost, "/api/patients", adminTok, `{"name":"Bad Age","age_years":-1}`)
	mustCode(t, w, http.StatusBadRequest)

	body := `{"name":"Daw Hla","phone":"091111222","age_years":40,"gender":"F","notes":"first"}`
	w = doJSON(h, http.MethodPost, "/api/patients", adminTok, body)
	mustCode(t, w, http.StatusCreated)
	first := decodePatient(t, w)
	if first.ID < 1 || first.Name != "Daw Hla" || first.Phone != "091111222" || first.Notes != "first" {
		t.Fatalf("created %+v", first)
	}
	if first.AgeYears == nil || *first.AgeYears != 40 || first.Gender != "F" || first.UpdatedAt == "" {
		t.Fatalf("created fields %+v", first)
	}

	w = doJSON(h, http.MethodPost, "/api/patients", adminTok, body)
	mustCode(t, w, http.StatusCreated)
	second := decodePatient(t, w)
	if second.ID == first.ID {
		t.Fatal("chart create deduped")
	}

	w = doJSON(h, http.MethodGet, "/api/patients?q=091111222", adminTok, "")
	mustCode(t, w, http.StatusOK)
	found := decodePatientList(t, w)
	if len(found) != 2 {
		t.Fatalf("phone search %d: %+v", len(found), found)
	}

	w = doJSON(h, http.MethodGet, "/api/patients?q="+strconv.FormatInt(first.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	byID := decodePatientList(t, w)
	if !patientListHas(byID, first.ID) {
		t.Fatalf("id search missed %d: %+v", first.ID, byID)
	}

	w = doJSON(h, http.MethodPut, "/api/patients/"+strconv.FormatInt(first.ID, 10), adminTok,
		`{"name":"Daw Hla","phone":"091111222","age_years":40,"gender":"F","notes":"ward note"}`)
	mustCode(t, w, http.StatusOK)
	updated := decodePatient(t, w)
	if updated.Notes != "ward note" || updated.ID != first.ID {
		t.Fatalf("update %+v", updated)
	}

	w = doJSON(h, http.MethodGet, "/api/patients/"+strconv.FormatInt(first.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	got := decodePatient(t, w)
	if got.Notes != "ward note" {
		t.Fatalf("get notes %q", got.Notes)
	}

	w = doJSON(h, http.MethodGet, "/api/patients/999999", adminTok, "")
	mustCode(t, w, http.StatusNotFound)
	w = doJSON(h, http.MethodPut, "/api/patients/999999", adminTok, `{"name":"Missing"}`)
	mustCode(t, w, http.StatusNotFound)

	_, patientsTok := insertSession(t, sqlDB, auth.RolePatients, 0)
	w = doJSON(h, http.MethodDelete, "/api/patients/"+strconv.FormatInt(second.ID, 10), patientsTok, "")
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(h, http.MethodDelete, "/api/patients/"+strconv.FormatInt(second.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
	var secondGone int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM patients WHERE id = ?`, second.ID).Scan(&secondGone); err != nil {
		t.Fatal(err)
	}
	if secondGone != 0 {
		t.Fatalf("unused chart still present after delete")
	}
	var deletes int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM audit_logs WHERE entity = 'patient' AND action = 'delete'`).Scan(&deletes); err != nil {
		t.Fatal(err)
	}
	if deletes != 1 {
		t.Fatalf("audit delete=%d", deletes)
	}

	var creates, updates int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM audit_logs WHERE entity = 'patient' AND action = 'create'`).Scan(&creates); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM audit_logs WHERE entity = 'patient' AND action = 'update'`).Scan(&updates); err != nil {
		t.Fatal(err)
	}
	if creates != 2 || updates != 1 {
		t.Fatalf("audit create=%d update=%d", creates, updates)
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", opdTok, `{
		"patient_name":"U Mya","patient_phone":"099988877","patient_age_years":55,"patient_gender":"M",
		"save_patient":true,"lines":[]
	}`)
	mustCode(t, w, http.StatusCreated)
	bill := decodeOpdBill(t, w)
	if bill.PatientID == nil || bill.BillNo == "" || bill.TotalMMK != 0 || bill.Status != "draft" {
		t.Fatalf("opd bill %+v", bill)
	}
	opdPatientID := *bill.PatientID

	w = doJSON(h, http.MethodDelete, "/api/patients/"+strconv.FormatInt(opdPatientID, 10), adminTok, "")
	mustCode(t, w, http.StatusConflict)
	var stillThere int
	var stillLinked int64
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM patients WHERE id = ?`, opdPatientID).Scan(&stillThere); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT patient_id FROM opd_bills WHERE id = ?`, bill.ID).Scan(&stillLinked); err != nil {
		t.Fatal(err)
	}
	if stillThere != 1 || stillLinked != opdPatientID {
		t.Fatalf("served chart detached: patients=%d bill.patient_id=%d", stillThere, stillLinked)
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", opdTok, `{
		"patient_name":"U Mya","patient_phone":"099988877","patient_age_years":60,"patient_gender":"M",
		"save_patient":true,"lines":[]
	}`)
	mustCode(t, w, http.StatusCreated)
	bill2 := decodeOpdBill(t, w)
	if bill2.PatientID == nil || *bill2.PatientID != opdPatientID {
		t.Fatalf("opd upsert patient %v want %d", bill2.PatientID, opdPatientID)
	}
	var samePhone int
	var age int64
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM patients WHERE phone = '099988877'`).Scan(&samePhone); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT age_years FROM patients WHERE id = ?`, opdPatientID).Scan(&age); err != nil {
		t.Fatal(err)
	}
	if samePhone != 1 || age != 60 {
		t.Fatalf("upsert rows=%d age=%d", samePhone, age)
	}

	w = doJSON(h, http.MethodPut, "/api/patients/"+strconv.FormatInt(opdPatientID, 10), adminTok,
		`{"name":"U Mya Edited","phone":"099988877","age_years":60,"gender":"M","notes":"chart only"}`)
	mustCode(t, w, http.StatusOK)

	var snapName string
	var snapTotal int64
	var snapPatientID int64
	if err := sqlDB.QueryRow(`
		SELECT patient_name, total_mmk, patient_id FROM opd_bills WHERE id = ?
	`, bill.ID).Scan(&snapName, &snapTotal, &snapPatientID); err != nil {
		t.Fatal(err)
	}
	if snapName != "U Mya" || snapTotal != 0 || snapPatientID != opdPatientID {
		t.Fatalf("bill rewritten name=%s total=%d patient=%d", snapName, snapTotal, snapPatientID)
	}

	var movements int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM stock_movements`).Scan(&movements); err != nil {
		t.Fatal(err)
	}
	if movements != 0 {
		t.Fatalf("stock movements %d", movements)
	}

	// first was updated but never billed — admin may delete
	w = doJSON(h, http.MethodDelete, "/api/patients/"+strconv.FormatInt(first.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)
}

func decodePatient(t *testing.T, w *httptest.ResponseRecorder) patientChart {
	t.Helper()
	var p patientChart
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatalf("patient json: %v body=%s", err, w.Body.String())
	}
	return p
}

func decodePatientList(t *testing.T, w *httptest.ResponseRecorder) []patientChart {
	t.Helper()
	var body struct {
		Patients []patientChart `json:"patients"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("list json: %v body=%s", err, w.Body.String())
	}
	return body.Patients
}

func decodeOpdBill(t *testing.T, w *httptest.ResponseRecorder) opdBill {
	t.Helper()
	var b opdBill
	if err := json.Unmarshal(w.Body.Bytes(), &b); err != nil {
		t.Fatalf("bill json: %v body=%s", err, w.Body.String())
	}
	return b
}

func meHasPerm(t *testing.T, w *httptest.ResponseRecorder, perm string) bool {
	t.Helper()
	var body struct {
		Permissions []string `json:"permissions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("me json: %v body=%s", err, w.Body.String())
	}
	for _, p := range body.Permissions {
		if p == perm {
			return true
		}
	}
	return false
}

func patientListHas(list []patientChart, id int64) bool {
	for _, p := range list {
		if p.ID == id {
			return true
		}
	}
	return false
}
