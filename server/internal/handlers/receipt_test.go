package handlers

import (
	"strings"
	"testing"
)

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
