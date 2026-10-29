package handlers

import "testing"

func TestReceiptDateLabel(t *testing.T) {
	createdUTC := "2026-10-29 13:00:00"
	wantYangon := "2026-10-29 7:30 PM"

	if got := receiptDateLabel(createdUTC, nil, nil); got != wantYangon {
		t.Fatalf("created_at only: got %q want %q", got, wantYangon)
	}

	billed := "2024-01-15 10:30:00"
	wantBilled := "2024-01-15 10:30 AM"
	if got := receiptDateLabel(createdUTC, &billed, nil); got != wantBilled {
		t.Fatalf("billed_at wins: got %q want %q", got, wantBilled)
	}

	paid := "2026-10-29 20:00:00"
	wantPaid := "2026-10-29 8:00 PM"
	if got := receiptDateLabel(createdUTC, &billed, &paid); got != wantPaid {
		t.Fatalf("paid_at wins: got %q want %q", got, wantPaid)
	}

	morningUTC := "2026-10-29 02:15:00"
	wantMorning := "2026-10-29 8:45 AM"
	if got := receiptDateLabel(morningUTC, nil, nil); got != wantMorning {
		t.Fatalf("morning: got %q want %q", got, wantMorning)
	}

	if got := receiptDateLabel("not-a-date", nil, nil); got != "not-a-date" {
		t.Fatalf("unparseable created_at: got %q", got)
	}
}
