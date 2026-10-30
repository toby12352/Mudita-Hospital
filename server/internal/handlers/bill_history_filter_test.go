package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestBillHistoryMoneyAndDateFilters(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	opd := &OPD{DB: sqlDB}
	ot := &OT{DB: sqlDB}

	// Yangon civil day 2026-03-10 is UTC [2026-03-09 17:30:00, 2026-03-10 17:30:00).
	// Yangon civil day 2026-03-11 is UTC [2026-03-10 17:30:00, 2026-03-11 17:30:00).
	dayA := "2026-03-10"
	dayB := "2026-03-11"
	createdA, _, okA := yangonDayUTCRange(dayA)
	createdB, _, okB := yangonDayUTCRange(dayB)
	if !okA || !okB {
		t.Fatal("yangon range")
	}
	// Mid-day instants inside each civil day.
	createdAMid := "2026-03-10 01:00:00" // still Yangon dayA (after 17:30 UTC previous)
	if createdAMid < createdA {
		createdAMid = createdA
	}
	createdBMid := "2026-03-10 20:00:00" // Yangon dayB
	if createdBMid < createdB {
		createdBMid = createdB
	}

	seed := []struct {
		billNo, patient, status, printedAt, createdAt string
	}{
		{"OPD-PAID", "Daw Paid", "paid", "", createdAMid},
		{"OPD-VOID", "U Void", "void", "", createdAMid},
		{"OPD-DRAFT", "Daw Draft", "draft", "", createdBMid},
		{"OPD-PRINT", "U Printed", "draft", "2026-03-11 09:00:00", createdBMid},
		{"OPD-DEL", "Daw Deleted", "deleted", "", createdBMid},
	}
	for _, s := range seed {
		var printed any
		if s.printedAt != "" {
			printed = s.printedAt
		}
		if _, err := sqlDB.Exec(`
			INSERT INTO opd_bills (bill_no, patient_name, status, total_mmk, printed_at, created_at, updated_at)
			VALUES (?, ?, ?, 1000, ?, ?, ?)
		`, s.billNo, s.patient, s.status, printed, s.createdAt, s.createdAt); err != nil {
			t.Fatalf("seed %s: %v", s.billNo, err)
		}
	}

	listNos := func(path string) []string {
		t.Helper()
		w := doJSON(opd, http.MethodGet, path, token, "")
		mustCode(t, w, http.StatusOK)
		var body struct {
			Bills []struct {
				BillNo string `json:"bill_no"`
			} `json:"bills"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		out := make([]string, 0, len(body.Bills))
		for _, b := range body.Bills {
			out = append(out, b.BillNo)
		}
		return out
	}

	hasOnly := func(got []string, want ...string) {
		t.Helper()
		if len(got) != len(want) {
			t.Fatalf("got %v, want %v", got, want)
		}
		set := map[string]bool{}
		for _, g := range got {
			set[g] = true
		}
		for _, w := range want {
			if !set[w] {
				t.Fatalf("got %v, missing %s", got, w)
			}
		}
	}

	hasOnly(listNos("/api/opd/bills?money=paid"), "OPD-PAID")
	hasOnly(listNos("/api/opd/bills?money=void"), "OPD-VOID")
	hasOnly(listNos("/api/opd/bills?money=draft"), "OPD-DRAFT")
	hasOnly(listNos("/api/opd/bills?money=printed_not_paid"), "OPD-PRINT")
	hasOnly(listNos("/api/opd/bills?money=deleted"), "OPD-DEL")
	hasOnly(listNos("/api/opd/bills?from="+dayA+"&to="+dayA), "OPD-PAID", "OPD-VOID")
	hasOnly(listNos("/api/opd/bills?from="+dayB+"&to="+dayB), "OPD-DRAFT", "OPD-PRINT", "OPD-DEL")
	hasOnly(listNos("/api/opd/bills?q=Printed&money=printed_not_paid"), "OPD-PRINT")

	w := doJSON(opd, http.MethodGet, "/api/opd/bills?money=bogus", token, "")
	mustCode(t, w, http.StatusBadRequest)
	w = doJSON(opd, http.MethodGet, "/api/opd/bills?from="+dayB+"&to="+dayA, token, "")
	mustCode(t, w, http.StatusBadRequest)

	// Exact status= still works (paid includes only paid column).
	hasOnly(listNos("/api/opd/bills?status=paid"), "OPD-PAID")

	asc := listNos("/api/opd/bills?sort=asc")
	if len(asc) < 1 || asc[0] != "OPD-PAID" {
		t.Fatalf("sort=asc first %v, want OPD-PAID", asc)
	}
	desc := listNos("/api/opd/bills?sort=desc")
	if len(desc) < 1 || (desc[0] != "OPD-PRINT" && desc[0] != "OPD-DEL") {
		t.Fatalf("sort=desc first %v, want OPD-PRINT or OPD-DEL", desc)
	}
	w = doJSON(opd, http.MethodGet, "/api/opd/bills?sort=bogus", token, "")
	mustCode(t, w, http.StatusBadRequest)

	// OT: money filters the joined bill, not case workflow status.
	caseRes, err := sqlDB.Exec(`
		INSERT INTO ot_cases (case_no, patient_name, status, created_at, updated_at)
		VALUES ('OT-PRINT', 'OT Patient', 'billed', ?, ?)
	`, createdBMid, createdBMid)
	if err != nil {
		t.Fatal(err)
	}
	caseID, _ := caseRes.LastInsertId()
	billRes, err := sqlDB.Exec(`
		INSERT INTO ot_bills (bill_no, case_id, case_no, patient_name, status, total_mmk, printed_at, created_at, updated_at)
		VALUES ('OTB-PRINT', ?, 'OT-PRINT', 'OT Patient', 'draft', 500, '2026-03-11 10:00:00', ?, ?)
	`, caseID, createdBMid, createdBMid)
	if err != nil {
		t.Fatal(err)
	}
	billID, _ := billRes.LastInsertId()
	if _, err := sqlDB.Exec(`UPDATE ot_cases SET ot_bill_id = ? WHERE id = ?`, billID, caseID); err != nil {
		t.Fatal(err)
	}
	// Case without a bill counts as draft.
	if _, err := sqlDB.Exec(`
		INSERT INTO ot_cases (case_no, patient_name, status, created_at, updated_at)
		VALUES ('OT-DRAFT', 'Draft Case', 'draft', ?, ?)
	`, createdBMid, createdBMid); err != nil {
		t.Fatal(err)
	}

	listCases := func(path string) []string {
		t.Helper()
		w := doJSON(ot, http.MethodGet, path, token, "")
		mustCode(t, w, http.StatusOK)
		var body struct {
			Cases []struct {
				CaseNo string `json:"case_no"`
			} `json:"cases"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		out := make([]string, 0, len(body.Cases))
		for _, c := range body.Cases {
			out = append(out, c.CaseNo)
		}
		return out
	}

	hasOnly(listCases("/api/ot/cases?money=printed_not_paid"), "OT-PRINT")
	hasOnly(listCases("/api/ot/cases?money=draft"), "OT-DRAFT")
}
