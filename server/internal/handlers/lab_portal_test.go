package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"testing"
)

func TestLabBillUnassignAttachAndPrint(t *testing.T) {
	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, "Admin", 0)
	lab := &Lab{DB: sqlDB}
	charts := &Patients{DB: sqlDB}

	w := doJSON(lab, http.MethodPost, "/api/lab/services", adminTok, `{"name":"CBC","price_mmk":5000}`)
	mustCode(t, w, http.StatusCreated)
	svc := decodeLabService(t, w)

	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Daw Lab","phone":"091100011"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)

	w = doJSON(lab, http.MethodPost, "/api/lab/bills", adminTok, fmt.Sprintf(`{
		"patient_id":%d,
		"patient_name":"Daw Lab",
		"lines":[{"line_type":"service","ref_id":%d,"qty":1}]
	}`, chart.ID, svc.ID))
	mustCode(t, w, http.StatusCreated)
	bill := decodeLabBill(t, w)
	if bill.TotalMMK != 5000 || !strings.HasPrefix(bill.BillNo, "LAB-") {
		t.Fatalf("bill %+v", bill)
	}

	w = doJSON(charts, http.MethodDelete, "/api/patients/"+strconv.FormatInt(chart.ID, 10), adminTok, "")
	mustCode(t, w, http.StatusOK)

	var name string
	var total int64
	var patient sql.NullInt64
	if err := sqlDB.QueryRow(`
		SELECT patient_name, total_mmk, patient_id FROM lab_bills WHERE id = ?
	`, bill.ID).Scan(&name, &total, &patient); err != nil {
		t.Fatal(err)
	}
	if name != "Daw Lab" || total != 5000 || patient.Valid {
		t.Fatalf("unassign name=%s total=%d patient=%v", name, total, patient)
	}

	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"U Reattach","phone":"091100022"}`)
	mustCode(t, w, http.StatusCreated)
	next := decodePatient(t, w)
	other := next.ID

	w = doJSON(charts, http.MethodGet, fmt.Sprintf("/api/patients/%d/bills/lab/%d/print", other, bill.ID), adminTok, "")
	mustCode(t, w, http.StatusNotFound)

	w = doJSON(charts, http.MethodPost, "/api/patients/"+strconv.FormatInt(other, 10)+"/attach", adminTok,
		`{"bill_no":"`+bill.BillNo+`"}`)
	mustCode(t, w, http.StatusOK)

	var attached int64
	if err := sqlDB.QueryRow(`
		SELECT patient_name, total_mmk, patient_id FROM lab_bills WHERE id = ?
	`, bill.ID).Scan(&name, &total, &attached); err != nil {
		t.Fatal(err)
	}
	if name != "Daw Lab" || total != 5000 || attached != other {
		t.Fatalf("reattach name=%s total=%d patient=%d want %d", name, total, attached, other)
	}

	w = doJSON(charts, http.MethodPost, "/api/patients/"+strconv.FormatInt(other, 10)+"/attach", adminTok,
		`{"bill_no":"`+bill.BillNo+`"}`)
	mustCode(t, w, http.StatusConflict)

	w = doJSON(charts, http.MethodGet, fmt.Sprintf("/api/patients/%d/bills/lab/%d/print", other, bill.ID), adminTok, "")
	mustCode(t, w, http.StatusOK)
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("content-type %s", ct)
	}
	if !strings.Contains(w.Body.String(), bill.BillNo) {
		t.Fatalf("receipt missing %s", bill.BillNo)
	}
	var printed sql.NullString
	if err := sqlDB.QueryRow(`SELECT printed_at FROM lab_bills WHERE id = ?`, bill.ID).Scan(&printed); err != nil {
		t.Fatal(err)
	}
	if printed.Valid && printed.String != "" {
		t.Fatalf("chart print stamped printed_at %q", printed.String)
	}
}

func TestLabRevenueReports(t *testing.T) {
	sqlDB := openTestDB(t)
	res, err := sqlDB.Exec(`
		INSERT INTO lab_bills (
			bill_no, patient_name, doctor_name, status, total_mmk, collected_cash, paid_at
		) VALUES ('LAB-REV1', 'Daw Lab', 'Dr Lab', 'paid', 8000, 1, '2026-06-15 04:00:00')
	`)
	if err != nil {
		t.Fatal(err)
	}
	billID, _ := res.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO lab_bill_lines (
			bill_id, line_type, code, description, qty, unit_price_mmk, line_total_mmk, foc
		) VALUES (?, 'service', 'CBC', 'CBC', 2, 4000, 8000, 0)
	`, billID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO lab_bills (
			bill_no, patient_name, doctor_name, status, total_mmk, collected_cash, paid_at
		) VALUES ('LAB-REV0', 'Charged', 'Dr Lab', 'paid', 1000, 0, '2026-06-15 05:00:00')
	`); err != nil {
		t.Fatal(err)
	}

	doctors, err := buildRevenueByDoctor(sqlDB, "2026-06-15", "2026-06-15")
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, row := range doctors {
		if row.DoctorName == "Dr Lab" {
			found = true
			if row.BillCount != 1 || row.TotalMMK != 8000 {
				t.Fatalf("doctor row %+v", row)
			}
		}
	}
	if !found {
		t.Fatalf("doctors %+v", doctors)
	}

	services, err := buildRevenueByService(sqlDB, "2026-06-15", "2026-06-15")
	if err != nil {
		t.Fatal(err)
	}
	found = false
	for _, row := range services {
		if row.Code == "CBC" && row.Description == "CBC" {
			found = true
			if row.Qty != 2 || row.TotalMMK != 8000 || row.LineType != "service" {
				t.Fatalf("service row %+v", row)
			}
		}
	}
	if !found {
		t.Fatalf("services %+v", services)
	}
}
