package handlers

import (
	"fmt"
	"html"
	"strings"
)

// a4ReceiptCSS styles OT patient bills for A4 laser/inkjet (B&W).
func a4ReceiptCSS() string {
	return `
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;padding:0;color:#000;background:#fff;
  font-family:Arial,"Noto Sans Myanmar","Segoe UI",sans-serif;
  font-size:10pt;line-height:1.4;font-variant-numeric:tabular-nums;
  display:flex;justify-content:center;align-items:flex-start
}
.a4-sheet{
  width:100%;max-width:180mm;margin:0 auto;padding:8mm;
  box-sizing:border-box
}
.a4-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:10px}
.a4-brand{display:flex;align-items:center;gap:10px;min-width:0}
.a4-logo{display:block;width:18mm;height:auto}
.a4-hospital{margin:0;font-size:16pt;font-weight:700;text-transform:uppercase}
.a4-contact{text-align:right;font-size:9pt;max-width:48%}
.a4-contact p{margin:0 0 2px}
.a4-title{text-align:center;font-size:14pt;font-weight:700;margin:12px 0 14px;letter-spacing:.02em}
.a4-meta{display:flex;gap:0;border:1px solid #000;margin-bottom:14px}
.a4-meta-col{flex:1;padding:8px 10px;min-width:0}
.a4-meta-col + .a4-meta-col{border-left:1px solid #000}
.a4-meta-heading{margin:0 0 6px;font-size:10pt;font-weight:700;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:3px}
.a4-kv{display:flex;gap:8px;margin:2px 0;font-size:10pt}
.a4-kv .label{flex:0 0 9ch;font-weight:700}
.a4-kv .val{flex:1;word-break:break-word}
.a4-items{width:100%;border-collapse:collapse;margin:0 0 8px}
.a4-items th,.a4-items td{border:1px solid #000;padding:6px 8px;vertical-align:top}
.a4-items th{background:#eee;font-weight:700;text-align:left}
.a4-items .col-no{width:4ch;text-align:center}
.a4-items .col-qty{width:12ch;text-align:right;white-space:nowrap}
.a4-items .col-amt{width:16ch;text-align:right;white-space:nowrap}
.a4-settle{width:100%;max-width:70mm;margin-left:auto;margin-bottom:10px;border-collapse:collapse}
.a4-settle td{padding:3px 0 3px 8px;font-size:10.5pt}
.a4-settle td:last-child{text-align:right;white-space:nowrap}
.a4-settle .emph td{font-weight:700;font-size:11.5pt;padding-top:6px;border-top:1px solid #000}
.a4-pay{width:100%;border-collapse:collapse;margin:0 0 10px}
.a4-pay th,.a4-pay td{border:1px solid #000;padding:6px 8px}
.a4-pay th{background:#eee;font-weight:700;text-align:left}
.a4-pay .right{text-align:right}
.a4-balance{border:2px solid #000;padding:8px 12px;text-align:center;font-size:12pt;font-weight:700;margin:0 0 8px}
.a4-status{text-align:center;font-size:12pt;font-weight:700;margin:8px 0 14px}
.a4-note{margin:0 0 10px;font-size:9.5pt;white-space:pre-wrap}
.a4-remarks{margin:0 0 18px;font-size:9pt}
.a4-remarks p{margin:0 0 2px}
.a4-signs{display:flex;justify-content:space-between;gap:16px;margin-top:28px}
.a4-sign{flex:1;text-align:center;font-size:9.5pt}
.a4-sign .line{border-top:1px solid #000;margin:36px 8px 6px}
@media print{
  body{margin:0;display:flex;justify-content:center;align-items:flex-start}
  .a4-sheet{padding:8mm}
}
`
}

func renderA4ReceiptHTML(hosp *hospitalSettings, bill receiptBill) string {
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>`)
	b.WriteString(html.EscapeString(bill.BillNo))
	b.WriteString(`</title><style>`)
	b.WriteString(a4ReceiptCSS())
	b.WriteString(`</style></head><body>`)
	b.WriteString(`<div class="a4-sheet">`)
	writeA4Receipt(&b, hosp, bill)
	b.WriteString(`</div></body></html>`)
	return b.String()
}

func writeA4Receipt(b *strings.Builder, hosp *hospitalSettings, bill receiptBill) {
	b.WriteString(`<div class="a4-header">`)
	b.WriteString(`<div class="a4-brand">`)
	if src := receiptLogoDataURI(hosp); src != "" {
		b.WriteString(`<img class="a4-logo" src="`)
		b.WriteString(src)
		b.WriteString(`" alt=""/>`)
	}
	b.WriteString(`<p class="a4-hospital">`)
	b.WriteString(html.EscapeString(hosp.HospitalName))
	b.WriteString(`</p></div>`)
	b.WriteString(`<div class="a4-contact">`)
	if hosp.Address != "" {
		b.WriteString(`<p>`)
		b.WriteString(html.EscapeString(hosp.Address))
		b.WriteString(`</p>`)
	}
	if phones := hospitalPhones(hosp); phones != "" {
		b.WriteString(`<p>Tel: `)
		b.WriteString(html.EscapeString(phones))
		b.WriteString(`</p>`)
	}
	b.WriteString(`</div></div>`)

	title := strings.TrimSpace(bill.Title)
	if title == "" {
		title = "OPERATION THEATRE PAYMENT RECEIPT"
	}
	b.WriteString(`<p class="a4-title">`)
	b.WriteString(html.EscapeString(title))
	b.WriteString(`</p>`)

	b.WriteString(`<div class="a4-meta">`)
	b.WriteString(`<div class="a4-meta-col">`)
	b.WriteString(`<p class="a4-meta-heading">Patient</p>`)
	writeA4KV(b, "Name", strings.TrimSpace(bill.PatientName))
	if bill.PatientAge != nil {
		writeA4KV(b, "Age", fmt.Sprintf("%d", *bill.PatientAge))
	}
	writeA4KV(b, "Sex", strings.TrimSpace(bill.PatientGender))
	writeA4KV(b, "Phone", strings.TrimSpace(bill.PatientPhone))
	b.WriteString(`</div>`)
	b.WriteString(`<div class="a4-meta-col">`)
	b.WriteString(`<p class="a4-meta-heading">Bill</p>`)
	writeA4KV(b, "Bill No", bill.BillNo)
	writeA4KV(b, "Case No", bill.CaseNo)
	writeA4KV(b, "Date", bill.DateLabel)
	writeA4KV(b, "Status", strings.ToUpper(bill.Status))
	writeA4KV(b, "Doctor", strings.TrimSpace(bill.DoctorName))
	writeA4KV(b, "Procedure", strings.TrimSpace(bill.ProcedureName))
	b.WriteString(`</div></div>`)

	if note := strings.TrimSpace(bill.Note); note != "" {
		b.WriteString(`<p class="a4-note"><strong>Note:</strong> `)
		b.WriteString(html.EscapeString(note))
		b.WriteString(`</p>`)
	}

	if len(bill.Lines) > 0 {
		b.WriteString(`<table class="a4-items"><thead><tr>`)
		b.WriteString(`<th class="col-no">No.</th><th>Description</th><th class="col-qty">Qty</th><th class="col-amt">Amount (MMK)</th>`)
		b.WriteString(`</tr></thead><tbody>`)
		for i, line := range bill.Lines {
			qtyLabel := fmt.Sprintf("%d", line.Qty)
			if unit := strings.TrimSpace(line.Unit); unit != "" {
				qtyLabel = fmt.Sprintf("%d %s", line.Qty, unit)
			}
			b.WriteString(`<tr><td class="col-no">`)
			b.WriteString(fmt.Sprintf("%d", i+1))
			b.WriteString(`</td><td>`)
			b.WriteString(html.EscapeString(line.Description))
			b.WriteString(`</td><td class="col-qty">`)
			b.WriteString(html.EscapeString(qtyLabel))
			b.WriteString(`</td><td class="col-amt">`)
			b.WriteString(formatMMK(line.LineTotal))
			b.WriteString(`</td></tr>`)
		}
		b.WriteString(`</tbody></table>`)
	}

	paid := int64(0)
	if strings.EqualFold(bill.Status, "paid") {
		if bill.ShowSettlement {
			paid = bill.NetMMK
		} else {
			paid = bill.TotalMMK
		}
	}
	remain := bill.NetMMK - paid
	if !bill.ShowSettlement {
		remain = bill.TotalMMK - paid
	}
	if remain < 0 {
		remain = 0
	}

	if bill.ShowSettlement {
		b.WriteString(`<table class="a4-settle">`)
		writeA4SettleRow(b, "Total", bill.TotalMMK, false)
		label := "Discount"
		if strings.EqualFold(bill.DiscountUnit, "percent") && bill.DiscountValue > 0 {
			label = fmt.Sprintf("Discount (%d%%)", bill.DiscountValue)
		}
		writeA4SettleRow(b, label, bill.DiscountMMK, false)
		writeA4SettleRow(b, "Paid", paid, false)
		writeA4SettleRow(b, "Remaining Balance", remain, true)
		b.WriteString(`</table>`)
	} else {
		b.WriteString(`<table class="a4-settle">`)
		writeA4SettleRow(b, "Total", bill.TotalMMK, true)
		b.WriteString(`</table>`)
	}

	if strings.EqualFold(bill.Status, "paid") {
		b.WriteString(`<table class="a4-pay"><thead><tr>`)
		b.WriteString(`<th>No.</th><th>Payment Date</th><th>Payment Method</th><th class="right">Amount (MMK)</th>`)
		b.WriteString(`</tr></thead><tbody><tr>`)
		b.WriteString(`<td>1</td><td>`)
		b.WriteString(html.EscapeString(bill.DateLabel))
		b.WriteString(`</td><td>Cash</td><td class="right">`)
		b.WriteString(formatMMK(paid))
		b.WriteString(`</td></tr></tbody></table>`)
	}

	b.WriteString(`<div class="a4-balance">Balance Due: `)
	b.WriteString(formatMMK(remain))
	b.WriteString(` MMK</div>`)

	status := strings.ToLower(bill.Status)
	b.WriteString(`<p class="a4-status">`)
	switch status {
	case "paid":
		b.WriteString(`PAID IN FULL — Thank you for your payment.`)
	case "void":
		b.WriteString(`VOID`)
		if bill.VoidReason != "" {
			b.WriteString(` — `)
			b.WriteString(html.EscapeString(bill.VoidReason))
		}
	default:
		if bill.PrintedAt != "" {
			b.WriteString(`PRINTED — NOT PAID`)
		} else {
			b.WriteString(`DRAFT — NOT PAID`)
		}
	}
	b.WriteString(`</p>`)

	b.WriteString(`<div class="a4-remarks">`)
	b.WriteString(`<p><strong>Remarks</strong></p>`)
	b.WriteString(`<p>1. This receipt is valid only for the billed OT case.</p>`)
	b.WriteString(`<p>2. Please keep this copy for your records.</p>`)
	b.WriteString(`<p>3. Contact the hospital if any amount looks incorrect.</p>`)
	b.WriteString(`</div>`)

	b.WriteString(`<div class="a4-signs">`)
	b.WriteString(`<div class="a4-sign"><div class="line"></div>Received by</div>`)
	b.WriteString(`<div class="a4-sign"><div class="line"></div>Date</div>`)
	b.WriteString(`<div class="a4-sign"><div class="line"></div>Authorized Signature</div>`)
	b.WriteString(`</div>`)
}

func writeA4KV(b *strings.Builder, label, value string) {
	if strings.TrimSpace(value) == "" {
		return
	}
	b.WriteString(`<div class="a4-kv"><span class="label">`)
	b.WriteString(html.EscapeString(label))
	b.WriteString(`:</span><span class="val">`)
	b.WriteString(html.EscapeString(value))
	b.WriteString(`</span></div>`)
}

func writeA4SettleRow(b *strings.Builder, label string, amount int64, emph bool) {
	class := ""
	if emph {
		class = ` class="emph"`
	}
	b.WriteString(`<tr`)
	b.WriteString(class)
	b.WriteString(`><td>`)
	b.WriteString(html.EscapeString(label))
	b.WriteString(`</td><td>`)
	b.WriteString(formatMMK(amount))
	b.WriteString(` MMK</td></tr>`)
}
