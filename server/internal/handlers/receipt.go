package handlers

import (
	"encoding/base64"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"strings"

	"mudita-hospital/server/internal/assets"
)

// thermalReceiptCSS styles OPD/OT bills for EPSON TM-T82 (80mm) via Windows print.
func thermalReceiptCSS() string {
	return `
@page{size:80mm auto;margin:0}
*{box-sizing:border-box}
body{
  width:72mm;max-width:100%;margin:0 auto;padding:2mm 3mm 4mm;
  font-family:"Consolas","Courier New","Noto Sans Myanmar","Segoe UI",monospace;
  font-size:11px;line-height:1.35;color:#000;background:#fff
}
.center{text-align:center}
.right{text-align:right}
.bold{font-weight:700}
.logo{display:block;width:22mm;height:auto;margin:0 auto 3px}
.hospital{font-size:13px;font-weight:700;margin:0 0 2px;text-transform:uppercase;letter-spacing:0.02em}
.addr,.tel{margin:0;font-size:10px;word-wrap:break-word}
.sep{margin:6px 0;border:0;border-top:1px dashed #000}
.row{display:flex;justify-content:flex-start;gap:6px;margin:1px 0}
.row .label{flex:0 0 12ch;color:#222}
.row .val{flex:1;text-align:left;word-break:break-word}
.section-title{font-weight:700;margin:6px 0 2px}
.note-body{margin:0 0 4px;white-space:pre-wrap;word-wrap:break-word}
.items{width:100%;border-collapse:collapse;table-layout:fixed;margin:2px 0}
.items th,.items td{padding:1px 2px;vertical-align:top}
.items th{font-weight:700;border-bottom:1px solid #000}
.items .col-no{width:4ch;text-align:left}
.items .col-name{text-align:left;word-wrap:break-word;overflow-wrap:break-word}
.items .col-qty{width:10ch;text-align:right;white-space:nowrap}
.items .col-amt{width:10ch;text-align:right;white-space:nowrap}
.total-row{display:flex;justify-content:space-between;align-items:baseline;margin:8px 0 4px;font-size:13px;font-weight:700}
.money-row{display:flex;justify-content:space-between;align-items:baseline;margin:1px 0;font-size:12px}
.money-row.emph{margin-top:4px;font-size:13px;font-weight:700}
.status{text-align:center;font-weight:700;margin:8px 0 4px;font-size:12px}
.footer{text-align:center;font-size:10px;margin-top:8px}
.copy-tag{text-align:center;font-size:11px;font-weight:700;margin:6px 0 0;letter-spacing:0.04em}
.receipt-copy{page-break-after:always}
.receipt-copy:last-child{page-break-after:auto}
@media print{
  html,body{width:80mm;margin:0;padding:2mm 3mm}
}
`
}

type receiptLine struct {
	Code        string
	Description string
	Qty         int64
	Unit        string
	UnitPrice   int64
	LineTotal   int64
}

type receiptBill struct {
	Title         string // e.g. "OPD RECEIPT" or "OT RECEIPT"
	BillNo        string
	CaseNo        string // optional OT
	Status        string
	PatientName   string
	PatientPhone  string
	PatientAge    *int64
	PatientGender string
	DoctorName    string
	ProcedureName string
	Note          string
	DateLabel     string
	TotalMMK      int64
	// ShowSettlement prints Total, Discount, Paid, and Remaining Balance.
	// TotalMMK is the cart sum. NetMMK is the amount due after discount.
	ShowSettlement bool
	DiscountMMK    int64
	DiscountValue  int64
	DiscountUnit   string
	NetMMK         int64
	VoidReason     string
	Lines          []receiptLine
}

func renderThermalReceiptHTML(hosp *hospitalSettings, bill receiptBill) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>`)
	b.WriteString(html.EscapeString(bill.BillNo))
	b.WriteString(`</title><style>`)
	b.WriteString(thermalReceiptCSS())
	b.WriteString(`</style></head><body>`)
	writeThermalReceiptCopy(&b, hosp, bill, "CUSTOMER COPY")
	writeThermalReceiptCopy(&b, hosp, bill, "MERCHANT COPY")
	b.WriteString(`</body></html>`)
	return b.String()
}

// writeThermalReceiptCopy appends one thermal slip (logo through footer copy tag).
func writeThermalReceiptCopy(b *strings.Builder, hosp *hospitalSettings, bill receiptBill, copyTag string) {
	b.WriteString(`<div class="receipt-copy">`)

	if src := receiptLogoDataURI(hosp); src != "" {
		b.WriteString(`<img class="logo" src="`)
		b.WriteString(src)
		b.WriteString(`" alt=""/>`)
	}
	b.WriteString(`<p class="hospital center">`)
	b.WriteString(html.EscapeString(hosp.HospitalName))
	b.WriteString(`</p>`)
	if hosp.Address != "" {
		b.WriteString(`<p class="addr center">`)
		b.WriteString(html.EscapeString(hosp.Address))
		b.WriteString(`</p>`)
	}
	if phones := hospitalPhones(hosp); phones != "" {
		b.WriteString(`<p class="tel center">Tel: `)
		b.WriteString(html.EscapeString(phones))
		b.WriteString(`</p>`)
	}
	b.WriteString(`<p class="center bold" style="margin:6px 0 0">`)
	b.WriteString(html.EscapeString(bill.Title))
	b.WriteString(`</p>`)
	b.WriteString(`<hr class="sep"/>`)

	writeReceiptKV(b, "Bill", bill.BillNo)
	if bill.CaseNo != "" {
		writeReceiptKV(b, "Case", bill.CaseNo)
	}
	writeReceiptKV(b, "Date", bill.DateLabel)
	writeReceiptKV(b, "Status", strings.ToUpper(bill.Status))

	name := strings.TrimSpace(bill.PatientName)
	phone := strings.TrimSpace(bill.PatientPhone)
	gender := strings.TrimSpace(bill.PatientGender)
	hasPatient := name != "" || phone != "" || bill.PatientAge != nil || gender != ""
	if hasPatient {
		b.WriteString(`<p class="section-title">Patient</p>`)
		if name != "" {
			writeReceiptKV(b, "Name", name)
		}
		if bill.PatientAge != nil {
			writeReceiptKV(b, "Age", fmt.Sprintf("%d", *bill.PatientAge))
		}
		if phone != "" {
			writeReceiptKV(b, "Phone", phone)
		}
		if gender != "" {
			writeReceiptKV(b, "Sex", gender)
		}
	}

	if bill.DoctorName != "" {
		writeReceiptKV(b, "Doctor", bill.DoctorName)
	}
	if bill.ProcedureName != "" {
		writeReceiptKV(b, "Procedure", bill.ProcedureName)
	}

	note := strings.TrimSpace(bill.Note)
	if note != "" {
		b.WriteString(`<p class="section-title">Note</p>`)
		b.WriteString(`<p class="note-body">`)
		b.WriteString(html.EscapeString(note))
		b.WriteString(`</p>`)
	}

	b.WriteString(`<hr class="sep"/>`)

	if len(bill.Lines) > 0 {
		b.WriteString(`<table class="items"><thead><tr>`)
		b.WriteString(`<th class="col-no">No.</th><th class="col-name">Name</th><th class="col-qty">Qty</th><th class="col-amt">Amt</th>`)
		b.WriteString(`</tr></thead><tbody>`)
		for i, line := range bill.Lines {
			qtyLabel := fmt.Sprintf("%d", line.Qty)
			if unit := strings.TrimSpace(line.Unit); unit != "" {
				qtyLabel = fmt.Sprintf("%d %s", line.Qty, unit)
			}
			b.WriteString(`<tr><td class="col-no">`)
			b.WriteString(fmt.Sprintf("%d", i+1))
			b.WriteString(`</td><td class="col-name">`)
			b.WriteString(html.EscapeString(line.Description))
			b.WriteString(`</td><td class="col-qty">`)
			b.WriteString(html.EscapeString(qtyLabel))
			b.WriteString(`</td><td class="col-amt">`)
			b.WriteString(formatMMK(line.LineTotal))
			b.WriteString(`</td></tr>`)
		}
		b.WriteString(`</tbody></table>`)
	}

	b.WriteString(`<hr class="sep"/>`)
	if bill.ShowSettlement {
		writeReceiptMoney(b, "TOTAL", bill.TotalMMK, true)
		label := "DISCOUNT"
		if strings.EqualFold(bill.DiscountUnit, "percent") && bill.DiscountValue > 0 {
			label = fmt.Sprintf("DISCOUNT (%d%%)", bill.DiscountValue)
		}
		writeReceiptMoney(b, label, bill.DiscountMMK, false)
		paid := int64(0)
		if strings.EqualFold(bill.Status, "paid") {
			paid = bill.NetMMK
		}
		remain := bill.NetMMK - paid
		if remain < 0 {
			remain = 0
		}
		writeReceiptMoney(b, "PAID", paid, false)
		writeReceiptMoney(b, "REMAINING BALANCE", remain, true)
	} else {
		b.WriteString(`<div class="total-row"><span>TOTAL</span><span>`)
		b.WriteString(formatMMK(bill.TotalMMK))
		b.WriteString(` MMK</span></div>`)
	}

	status := strings.ToLower(bill.Status)
	b.WriteString(`<p class="status">`)
	switch status {
	case "paid":
		b.WriteString(`PAID — CASH`)
	case "void":
		b.WriteString(`VOID`)
		if bill.VoidReason != "" {
			b.WriteString(` — `)
			b.WriteString(html.EscapeString(bill.VoidReason))
		}
	default:
		b.WriteString(`DRAFT — NOT PAID`)
	}
	b.WriteString(`</p>`)

	b.WriteString(`<hr class="sep"/>`)
	b.WriteString(`<p class="footer">Thank you</p>`)
	if phones := hospitalPhones(hosp); phones != "" {
		b.WriteString(`<p class="footer">`)
		b.WriteString(html.EscapeString(phones))
		b.WriteString(`</p>`)
	}
	b.WriteString(`<p class="copy-tag">`)
	b.WriteString(html.EscapeString(copyTag))
	b.WriteString(`</p>`)
	b.WriteString(`</div>`)
}

func writeReceiptMoney(b *strings.Builder, label string, amount int64, emph bool) {
	class := "money-row"
	if emph {
		class = "money-row emph"
	}
	b.WriteString(`<div class="`)
	b.WriteString(class)
	b.WriteString(`"><span>`)
	b.WriteString(html.EscapeString(label))
	b.WriteString(`</span><span>`)
	b.WriteString(formatMMK(amount))
	b.WriteString(` MMK</span></div>`)
}

func writeReceiptKV(b *strings.Builder, label, value string) {
	b.WriteString(`<div class="row"><span class="label">`)
	b.WriteString(html.EscapeString(label))
	b.WriteString(`:</span><span class="val">`)
	b.WriteString(html.EscapeString(value))
	b.WriteString(`</span></div>`)
}

// receiptLogoDataURI returns a self-contained image for thermal HTML.
// Prefers hospital_settings.logo_path when the file exists; otherwise the
// embedded Mudita brand mark.
func receiptLogoDataURI(hosp *hospitalSettings) string {
	data := assets.LogoPNG
	mime := "image/png"
	if hosp != nil {
		path := strings.TrimSpace(hosp.LogoPath)
		if path != "" {
			if raw, err := os.ReadFile(path); err == nil && len(raw) > 0 {
				data = raw
				mime = imageMIMEFromPath(path)
			}
		}
	}
	if len(data) == 0 {
		return ""
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
}

func imageMIMEFromPath(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	default:
		return "image/png"
	}
}
