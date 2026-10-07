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
.row{display:flex;justify-content:space-between;gap:4px;margin:1px 0}
.row .label{flex:0 0 auto;color:#222}
.row .val{flex:1;text-align:right;word-break:break-word}
.line{margin:6px 0 2px}
.line-desc{word-wrap:break-word}
.line-meta{display:flex;justify-content:space-between;gap:6px;font-size:10px}
.total-row{display:flex;justify-content:space-between;align-items:baseline;margin:8px 0 4px;font-size:13px;font-weight:700}
.status{text-align:center;font-weight:700;margin:8px 0 4px;font-size:12px}
.footer{text-align:center;font-size:10px;margin-top:8px}
@media print{
  html,body{width:80mm;margin:0;padding:2mm 3mm}
}
`
}

type receiptLine struct {
	Code        string
	Description string
	Qty         int64
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
	VoidReason    string
	Lines         []receiptLine
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
	if hosp.Phone != "" {
		b.WriteString(`<p class="tel center">Tel: `)
		b.WriteString(html.EscapeString(hosp.Phone))
		b.WriteString(`</p>`)
	}
	b.WriteString(`<p class="center bold" style="margin:6px 0 0">`)
	b.WriteString(html.EscapeString(bill.Title))
	b.WriteString(`</p>`)
	b.WriteString(`<hr class="sep"/>`)

	writeReceiptKV(&b, "Bill", bill.BillNo)
	if bill.CaseNo != "" {
		writeReceiptKV(&b, "Case", bill.CaseNo)
	}
	writeReceiptKV(&b, "Date", bill.DateLabel)
	writeReceiptKV(&b, "Status", strings.ToUpper(bill.Status))

	patient := bill.PatientName
	if bill.PatientPhone != "" {
		patient += " · " + bill.PatientPhone
	}
	if bill.PatientAge != nil {
		patient += fmt.Sprintf(" · Age %d", *bill.PatientAge)
	}
	if bill.PatientGender != "" {
		patient += " · " + bill.PatientGender
	}
	writeReceiptKV(&b, "Patient", patient)

	if bill.DoctorName != "" {
		writeReceiptKV(&b, "Doctor", bill.DoctorName)
	}
	if bill.ProcedureName != "" {
		writeReceiptKV(&b, "Procedure", bill.ProcedureName)
	}
	if bill.Note != "" {
		writeReceiptKV(&b, "Note", bill.Note)
	}

	b.WriteString(`<hr class="sep"/>`)

	for _, line := range bill.Lines {
		desc := line.Description
		if line.Code != "" {
			desc = line.Code + " " + desc
		}
		b.WriteString(`<div class="line"><div class="line-desc">`)
		b.WriteString(html.EscapeString(desc))
		b.WriteString(`</div><div class="line-meta"><span>`)
		b.WriteString(fmt.Sprintf("%d x %s", line.Qty, formatMMK(line.UnitPrice)))
		b.WriteString(`</span><span class="bold">`)
		b.WriteString(formatMMK(line.LineTotal))
		b.WriteString(`</span></div></div>`)
	}

	b.WriteString(`<hr class="sep"/>`)
	b.WriteString(`<div class="total-row"><span>TOTAL</span><span>`)
	b.WriteString(formatMMK(bill.TotalMMK))
	b.WriteString(` MMK</span></div>`)

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
	if hosp.Phone != "" {
		b.WriteString(`<p class="footer">`)
		b.WriteString(html.EscapeString(hosp.Phone))
		b.WriteString(`</p>`)
	}
	b.WriteString(`</body></html>`)
	return b.String()
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
