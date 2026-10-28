package handlers

import (
	"strings"
	"testing"
)

func TestRenderThermalReceiptHTMLSingleSlip(t *testing.T) {
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

	if strings.Contains(html, "CUSTOMER COPY") || strings.Contains(html, "MERCHANT COPY") {
		t.Fatalf("receipt must not include customer/merchant copy tags")
	}
	if strings.Contains(html, "copy-tag") || strings.Contains(html, "receipt-copy") {
		t.Fatalf("receipt must not use dual-copy CSS or wrappers")
	}
	if strings.Count(html, "OPD RECEIPT") != 1 {
		t.Fatalf("want exactly one slip title, got %d", strings.Count(html, "OPD RECEIPT"))
	}
	if !strings.Contains(html, `>Bill:</span><span class="val">OPD-00099</span>`) {
		t.Fatalf("expected bill number on the single slip")
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

func TestRenderA4ReceiptHTMLLayout(t *testing.T) {
	age := int64(46)
	hosp := &hospitalSettings{
		HospitalName: "Mudita Hospital",
		Address:      "Yangon",
		Phone:        "09-111",
		Phone2:       "09-222",
	}
	html := renderA4ReceiptHTML(hosp, receiptBill{
		Title:          "OPERATION THEATRE PAYMENT RECEIPT",
		BillNo:         "OT-00025",
		CaseNo:         "OTC-00010",
		Status:         "paid",
		PatientName:    "John Doe",
		PatientPhone:   "091234567",
		PatientAge:     &age,
		PatientGender:  "M",
		DoctorName:     "Dr Tun",
		ProcedureName:  "Appendectomy",
		DateLabel:      "2026-10-25 16:30",
		ShowSettlement: true,
		TotalMMK:       241000,
		DiscountMMK:    0,
		NetMMK:         241000,
		Lines: []receiptLine{
			{Description: "Operation Theatre Charges", Qty: 1, LineTotal: 93000},
			{Description: "Surgeon and Medical Professional Fees", Qty: 1, LineTotal: 105000},
			{Description: "Consumables and Implants", Qty: 2, Unit: "set", LineTotal: 43000},
		},
	})

	if !strings.Contains(html, `@page{size:A4;margin:12mm}`) {
		t.Fatalf("expected A4 @page CSS")
	}
	if strings.Contains(html, `@page{size:80mm`) {
		t.Fatalf("A4 receipt must not use thermal page size")
	}
	for _, want := range []string{
		"Mudita Hospital",
		"Yangon",
		"Tel: 09-111 / 09-222",
		"OPERATION THEATRE PAYMENT RECEIPT",
		`a4-meta-heading">Patient`,
		`a4-meta-heading">Bill`,
		`>Name:</span><span class="val">John Doe</span>`,
		`>Age:</span><span class="val">46</span>`,
		`>Sex:</span><span class="val">M</span>`,
		`>Phone:</span><span class="val">091234567</span>`,
		`>Bill No:</span><span class="val">OT-00025</span>`,
		`>Case No:</span><span class="val">OTC-00010</span>`,
		`>Doctor:</span><span class="val">Dr Tun</span>`,
		`>Procedure:</span><span class="val">Appendectomy</span>`,
		`<th class="col-no">No.</th><th>Description</th><th class="col-qty">Qty</th><th class="col-amt">Amount (MMK)</th>`,
		`>Operation Theatre Charges</td><td class="col-qty">1</td><td class="col-amt">93,000</td>`,
		`>Consumables and Implants</td><td class="col-qty">2 set</td><td class="col-amt">43,000</td>`,
		`>Total</td><td>241,000 MMK</td>`,
		`>Paid</td><td>241,000 MMK</td>`,
		`>Remaining Balance</td><td>0 MMK</td>`,
		`Balance Due: 0 MMK`,
		`PAID IN FULL — Thank you for your payment.`,
		`<th>No.</th><th>Payment Date</th><th>Payment Method</th>`,
		`>Cash</td>`,
		`Received by`,
		`Authorized Signature`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("missing %q in A4 HTML", want)
		}
	}
}

func TestRenderA4ReceiptHTMLUnpaidAndVoid(t *testing.T) {
	hosp := &hospitalSettings{HospitalName: "Mudita Hospital"}
	printed := renderA4ReceiptHTML(hosp, receiptBill{
		Title:          "OPERATION THEATRE PAYMENT RECEIPT",
		BillNo:         "OT-2",
		Status:         "draft",
		PrintedAt:      "2026-10-25 10:00",
		DateLabel:      "2026-10-25 09:00",
		ShowSettlement: true,
		TotalMMK:       5000,
		DiscountMMK:    500,
		NetMMK:         4500,
	})
	for _, want := range []string{
		`>Paid</td><td>0 MMK</td>`,
		`>Remaining Balance</td><td>4,500 MMK</td>`,
		`Balance Due: 4,500 MMK`,
		`PRINTED — NOT PAID`,
	} {
		if !strings.Contains(printed, want) {
			t.Fatalf("missing %q in printed A4 HTML", want)
		}
	}
	if strings.Contains(printed, `class="a4-pay"`) {
		t.Fatalf("unpaid A4 receipt must not show payment table")
	}

	voided := renderA4ReceiptHTML(hosp, receiptBill{
		Title:      "OPERATION THEATRE PAYMENT RECEIPT",
		BillNo:     "OT-3",
		Status:     "void",
		VoidReason: "Wrong case",
		DateLabel:  "2026-10-25",
		TotalMMK:   1000,
		NetMMK:     1000,
	})
	if !strings.Contains(voided, `VOID — Wrong case`) {
		t.Fatalf("expected void reason on A4 receipt")
	}
}
