package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestNormalizePaymentType(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"", "cash", false},
		{"  ", "cash", false},
		{"cash", "cash", false},
		{"CASH", "cash", false},
		{"online", "online", false},
		{"Online", "online", false},
		{"card", "", true},
		{"ipd", "", true},
	}
	for _, c := range cases {
		got, err := normalizePaymentType(c.in)
		if c.wantErr {
			if err == nil {
				t.Fatalf("%q: expected error", c.in)
			}
			continue
		}
		if err != nil || got != c.want {
			t.Fatalf("%q: got %q err %v, want %q", c.in, got, err, c.want)
		}
	}
}

func TestDailyCashSplitsCashAndOnline(t *testing.T) {
	sqlDB := openTestDB(t)
	const day = "2026-04-10"
	insertOPDCash(t, sqlDB, "OPD-CASH-1", 1000, "paid", day+" 09:00:00", "", 1)
	insertOPDCash(t, sqlDB, "OPD-ONLINE-1", 2500, "paid", day+" 10:00:00", "", 1)
	if _, err := sqlDB.Exec(`UPDATE opd_bills SET payment_type = 'online' WHERE bill_no = 'OPD-ONLINE-1'`); err != nil {
		t.Fatal(err)
	}
	insertPharmacyCash(t, sqlDB, "PH-ONLINE-1", 500, "paid", day+" 11:00:00", "", 1)
	if _, err := sqlDB.Exec(`UPDATE pharmacy_bills SET payment_type = 'online' WHERE bill_no = 'PH-ONLINE-1'`); err != nil {
		t.Fatal(err)
	}

	rep, err := buildDailyCash(sqlDB, day)
	if err != nil {
		t.Fatal(err)
	}
	if rep.CashTotal != 1000 {
		t.Fatalf("cash balance %d, want 1000", rep.CashTotal)
	}
	if rep.OnlineTotal != 3000 {
		t.Fatalf("online balance %d, want 3000", rep.OnlineTotal)
	}
	if rep.GrandTotal != 4000 {
		t.Fatalf("total balance %d, want 4000", rep.GrandTotal)
	}
	var sawOnline, sawCash bool
	for _, line := range rep.Lines {
		switch line.BillNo {
		case "OPD-CASH-1":
			if line.PaymentType != "cash" {
				t.Fatalf("cash line type %q", line.PaymentType)
			}
			sawCash = true
		case "OPD-ONLINE-1", "PH-ONLINE-1":
			if line.PaymentType != "online" {
				t.Fatalf("%s type %q", line.BillNo, line.PaymentType)
			}
			sawOnline = true
		}
	}
	if !sawCash || !sawOnline {
		t.Fatalf("missing line types cash=%v online=%v lines=%+v", sawCash, sawOnline, rep.Lines)
	}

	html := renderCashReportHTML(&hospitalSettings{HospitalName: "Test"}, rep, map[string]bool{
		"OPD": true, "Pharmacy": true, "OT": true, "Lab": true,
	})
	for _, want := range []string{"Cash balance", "Online balance", "Total balance", "Online"} {
		if !strings.Contains(html, want) {
			t.Fatalf("print missing %q", want)
		}
	}
}

func TestOpdPayStoresPaymentType(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "OPD", 0)
	h := &OPD{DB: sqlDB}
	res, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('PAY1', 'Pay type visit', 1500)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := res.LastInsertId()
	w := doJSON(h, http.MethodPost, "/api/opd/bills", token, fmt.Sprintf(`{
		"patient_name":"Pay Type Patient",
		"payment_type":"online",
		"lines":[{"line_type":"service","ref_id":%d,"qty":1,"unit_price_mmk":1500,"line_total_mmk":1500}]
	}`, serviceID))
	mustCode(t, w, http.StatusCreated)
	var draft opdBill
	if err := json.Unmarshal(w.Body.Bytes(), &draft); err != nil {
		t.Fatal(err)
	}
	if draft.PaymentType != "online" {
		t.Fatalf("draft payment_type %q", draft.PaymentType)
	}
	w = doJSON(h, http.MethodPost, fmt.Sprintf("/api/opd/bills/%d/pay", draft.ID), token, `{"payment_type":"online"}`)
	mustCode(t, w, http.StatusOK)
	var paid opdBill
	if err := json.Unmarshal(w.Body.Bytes(), &paid); err != nil {
		t.Fatal(err)
	}
	if paid.Status != "paid" || paid.PaymentType != "online" || paid.CollectedCash != 1 {
		t.Fatalf("paid bill %+v", paid)
	}

	today := localToday()
	rep, err := buildDailyCash(sqlDB, today)
	if err != nil {
		t.Fatal(err)
	}
	if rep.OnlineTotal != paid.TotalMMK || rep.CashTotal != 0 {
		t.Fatalf("report cash=%d online=%d grand=%d paid=%d", rep.CashTotal, rep.OnlineTotal, rep.GrandTotal, paid.TotalMMK)
	}
}
