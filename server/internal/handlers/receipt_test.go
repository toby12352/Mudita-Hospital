package handlers

import (
	"strings"
	"testing"
)

func TestRenderThermalReceiptHTMLDualCopies(t *testing.T) {
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}
	html := renderThermalReceiptHTML(hosp, receiptBill{
		Title:     "OPD RECEIPT",
		BillNo:    "OPD-00099",
		Status:    "paid",
		DateLabel: "2026-10-25",
		TotalMMK:  1000,
		Lines: []receiptLine{
			{Description: "Consult", Qty: 1, UnitPrice: 1000, LineTotal: 1000},
		},
	})

	customer := strings.Count(html, `class="copy-tag">CUSTOMER COPY</p>`)
	merchant := strings.Count(html, `class="copy-tag">MERCHANT COPY</p>`)
	if customer != 1 {
		t.Fatalf("want exactly one CUSTOMER COPY tag, got %d", customer)
	}
	if merchant != 1 {
		t.Fatalf("want exactly one MERCHANT COPY tag, got %d", merchant)
	}
	if strings.Count(html, `class="receipt-copy"`) != 2 {
		t.Fatalf("want two receipt-copy blocks")
	}
	if !strings.Contains(html, `.receipt-copy{page-break-after:always}`) {
		t.Fatalf("expected page-break between copies")
	}
	// Customer slip must come before merchant.
	ci := strings.Index(html, "CUSTOMER COPY")
	mi := strings.Index(html, "MERCHANT COPY")
	if ci < 0 || mi < 0 || ci > mi {
		t.Fatalf("CUSTOMER COPY must appear before MERCHANT COPY")
	}
}

func TestRenderThermalReceiptHTMLHeaderLayout(t *testing.T) {
	age := int64(34)
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}

	full := renderThermalReceiptHTML(hosp, receiptBill{
		Title:         "OPD RECEIPT",
		BillNo:        "OPD-00012",
		Status:        "paid",
		PatientName:   "Ma Hla",
		PatientPhone:  "091234567",
		PatientAge:    &age,
		PatientGender: "F",
		DoctorName:    "Dr Tun",
		Note:          "Follow up in 1 week",
		DateLabel:     "2026-10-24 10:00",
		TotalMMK:      1000,
		Lines: []receiptLine{
			{Description: "Consult", Qty: 1, UnitPrice: 1000, LineTotal: 1000},
		},
	})

	if !strings.Contains(full, `.row .val{flex:1;text-align:left;`) {
		t.Fatalf("expected left-aligned header values")
	}
	if strings.Contains(full, `.row .val{flex:1;text-align:right;`) {
		t.Fatalf("header values must not be right-aligned")
	}
	for _, want := range []string{
		`>Bill:</span><span class="val">OPD-00012</span>`,
		`>Date:</span><span class="val">2026-10-24 10:00</span>`,
		`>Status:</span><span class="val">PAID</span>`,
		`<p class="section-title">Patient</p>`,
		`>Name:</span><span class="val">Ma Hla</span>`,
		`>Age:</span><span class="val">34</span>`,
		`>Phone:</span><span class="val">091234567</span>`,
		`>Sex:</span><span class="val">F</span>`,
		`>Doctor:</span><span class="val">Dr Tun</span>`,
		`<p class="section-title">Note</p>`,
		`<p class="note-body">Follow up in 1 week</p>`,
	} {
		if !strings.Contains(full, want) {
			t.Fatalf("missing %q in receipt HTML", want)
		}
	}
	if strings.Contains(full, `>Patient:</span>`) {
		t.Fatalf("combined Patient row should be gone")
	}
	if strings.Contains(full, `>Note:</span>`) {
		t.Fatalf("Note must be a section, not a header KV row")
	}

	nameOnly := renderThermalReceiptHTML(hosp, receiptBill{
		Title:       "OPD RECEIPT",
		BillNo:      "OPD-00013",
		Status:      "draft",
		PatientName: "Ko Aung",
		DateLabel:   "2026-10-24",
		TotalMMK:    0,
	})
	if !strings.Contains(nameOnly, `>Name:</span><span class="val">Ko Aung</span>`) {
		t.Fatalf("name-only receipt missing Name row")
	}
	for _, omit := range []string{
		`>Age:</span>`,
		`>Phone:</span>`,
		`>Sex:</span>`,
		`<p class="section-title">Note</p>`,
		`class="note-body"`,
	} {
		if strings.Contains(nameOnly, omit) {
			t.Fatalf("blank field should be omitted: %q", omit)
		}
	}

	blankPatient := renderThermalReceiptHTML(hosp, receiptBill{
		Title:     "PHARMACY RECEIPT",
		BillNo:    "PH-1",
		Status:    "draft",
		DateLabel: "2026-10-24",
		TotalMMK:  0,
	})
	if strings.Contains(blankPatient, `<p class="section-title">Patient</p>`) {
		t.Fatalf("Patient heading must hide when all patient fields are blank")
	}

	zeroAge := int64(0)
	withZeroAge := renderThermalReceiptHTML(hosp, receiptBill{
		Title:       "OPD RECEIPT",
		BillNo:      "OPD-00014",
		Status:      "draft",
		PatientName: "Baby",
		PatientAge:  &zeroAge,
		DateLabel:   "2026-10-24",
		TotalMMK:    0,
	})
	if !strings.Contains(withZeroAge, `>Age:</span><span class="val">0</span>`) {
		t.Fatalf("age 0 should still print")
	}
}

func TestRenderThermalReceiptSettlement(t *testing.T) {
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}
	paid := renderThermalReceiptHTML(hosp, receiptBill{
		Title:          "OT RECEIPT",
		BillNo:         "OT-1",
		Status:         "paid",
		DateLabel:      "2026-10-25",
		ShowSettlement: true,
		TotalMMK:       10000,
		DiscountMMK:    1000,
		DiscountValue:  10,
		DiscountUnit:   "percent",
		NetMMK:         9000,
	})
	for _, want := range []string{
		`>TOTAL</span><span>10,000 MMK</span>`,
		`>DISCOUNT (10%)</span><span>1,000 MMK</span>`,
		`>PAID</span><span>9,000 MMK</span>`,
		`>REMAINING BALANCE</span><span>0 MMK</span>`,
	} {
		if !strings.Contains(paid, want) {
			t.Fatalf("missing %q", want)
		}
	}

	draft := renderThermalReceiptHTML(hosp, receiptBill{
		Title:          "OPD RECEIPT",
		BillNo:         "OPD-1",
		Status:         "draft",
		DateLabel:      "2026-10-25",
		ShowSettlement: true,
		TotalMMK:       5000,
		DiscountMMK:    500,
		DiscountValue:  500,
		DiscountUnit:   "mmk",
		NetMMK:         4500,
	})
	for _, want := range []string{
		`>DISCOUNT</span><span>500 MMK</span>`,
		`>PAID</span><span>0 MMK</span>`,
		`>REMAINING BALANCE</span><span>4,500 MMK</span>`,
	} {
		if !strings.Contains(draft, want) {
			t.Fatalf("missing %q", want)
		}
	}
	if strings.Contains(draft, "DISCOUNT (") {
		t.Fatalf("mmk discount must not print a percent")
	}

	plain := renderThermalReceiptHTML(hosp, receiptBill{
		Title:     "TRANSFER TO OT",
		BillNo:    "TO-1",
		Status:    "paid",
		DateLabel: "2026-10-25",
		TotalMMK:  800,
	})
	if strings.Contains(plain, "REMAINING BALANCE") {
		t.Fatalf("transfer slip keeps a single total")
	}
	if !strings.Contains(plain, `class="total-row"`) {
		t.Fatalf("transfer slip still prints TOTAL")
	}
}

func TestRenderThermalReceiptHTMLCartColumns(t *testing.T) {
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}
	html := renderThermalReceiptHTML(hosp, receiptBill{
		Title:     "PHARMACY RECEIPT",
		BillNo:    "PH-42",
		Status:    "paid",
		DateLabel: "2026-10-25",
		TotalMMK:  4500,
		Lines: []receiptLine{
			{
				Code:        "AMX500",
				Description: "Amoxicillin 500mg",
				Qty:         2,
				Unit:        "tab",
				UnitPrice:   1500,
				LineTotal:   3000,
			},
			{
				Code:        "SVC01",
				Description: "Consult",
				Qty:         1,
				UnitPrice:   1500,
				LineTotal:   1500,
			},
		},
	})

	for _, want := range []string{
		`<th class="col-no">No.</th><th class="col-name">Name</th><th class="col-qty">Qty</th><th class="col-amt">Amt</th>`,
		`<td class="col-no">1</td><td class="col-name">Amoxicillin 500mg</td><td class="col-qty">2 tab</td><td class="col-amt">3,000</td>`,
		`<td class="col-no">2</td><td class="col-name">Consult</td><td class="col-qty">1</td><td class="col-amt">1,500</td>`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("missing %q in cart HTML", want)
		}
	}
	for _, omit := range []string{
		"AMX500",
		"SVC01",
		"2 tab x ",
		"1 x 1,500",
		`class="line-desc"`,
		`class="line-meta"`,
	} {
		if strings.Contains(html, omit) {
			t.Fatalf("cart must not include %q", omit)
		}
	}
}
