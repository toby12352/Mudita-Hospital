package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

// Father/Mother name is chart-only: OPD save writes it onto patients, and the bill receipt omits it.
func TestOpdBillFatherMotherNameOnChartNotReceipt(t *testing.T) {
	sqlDB := openTestDB(t)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	opd := &OPD{DB: sqlDB}

	res, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('FATHER', 'Father visit', 1000)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := res.LastInsertId()

	const fatherName = "U Unique Father Name XYZ"
	w := doJSON(opd, http.MethodPost, "/api/opd/bills", opdTok, fmt.Sprintf(`{
		"patient_name":"Daw Child",
		"patient_phone":"0911223344",
		"patient_age_years":12,
		"patient_gender":"F",
		"father_mother_name":%q,
		"save_patient":true,
		"lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1000}]
	}`, fatherName, serviceID))
	mustCode(t, w, http.StatusCreated)
	bill := decodeOpdBill(t, w)
	if bill.PatientID == nil {
		t.Fatal("expected patient chart id")
	}

	var storedFather string
	if err := sqlDB.QueryRow(`SELECT father_mother_name FROM patients WHERE id = ?`, *bill.PatientID).Scan(&storedFather); err != nil {
		t.Fatal(err)
	}
	if storedFather != fatherName {
		t.Fatalf("chart father_mother_name=%q want %q", storedFather, fatherName)
	}

	w = doJSON(opd, http.MethodGet, "/api/opd/bills/"+strconv.FormatInt(bill.ID, 10)+"/print", opdTok, "")
	mustCode(t, w, http.StatusOK)
	html := w.Body.String()
	if !strings.Contains(html, "Daw Child") {
		t.Fatalf("receipt missing patient name: %s", html)
	}
	if strings.Contains(html, fatherName) {
		t.Fatalf("receipt must not include father/mother name: %s", html)
	}
}
