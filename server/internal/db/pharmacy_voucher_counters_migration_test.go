package db

import (
	"database/sql"
	"testing"
)

func TestPharmacyVoucherCountersFreshMigrate(t *testing.T) {
	sqlDB := openUserGrantMem(t)
	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("fresh migrate: %v", err)
	}

	assertSeqNext(t, sqlDB, "pharmacy_bill_number_seq", 1)
	assertSeqNext(t, sqlDB, "pharmacy_return_bill_number_seq", 1)
	assertSeqNext(t, sqlDB, "pharmacy_transfer_bill_number_seq", 1)
	assertSeqNext(t, sqlDB, "pharmacy_purchase_bill_number_seq", 1)

	var billCount int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM pharmacy_bills`).Scan(&billCount); err != nil {
		t.Fatal(err)
	}
	if billCount != 0 {
		t.Fatalf("pharmacy_bills count %d, want 0", billCount)
	}
}

func TestPharmacyVoucherCountersUpgradePreservesBills(t *testing.T) {
	sqlDB := openUserGrantMem(t)
	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("fresh migrate: %v", err)
	}

	res, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bills (bill_no, patient_name, status, total_mmk)
		VALUES
		  ('PH-000010', 'Sale Ten', 'paid', 1000),
		  ('RT-000011', 'Return Eleven', 'paid', 200),
		  ('RT-000004', 'Return Four', 'deleted', 50),
		  ('TO-000012', 'OT', 'paid', 0),
		  ('PH-DESK', 'Label Only', 'draft', 0)
	`)
	if err != nil {
		t.Fatalf("seed pharmacy bills: %v", err)
	}
	if n, _ := res.RowsAffected(); n != 5 {
		t.Fatalf("seeded %d pharmacy bills, want 5", n)
	}

	var phID, rt11ID, rt4ID, toID, deskID int64
	if err := sqlDB.QueryRow(`SELECT id FROM pharmacy_bills WHERE bill_no = 'PH-000010'`).Scan(&phID); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT id FROM pharmacy_bills WHERE bill_no = 'RT-000011'`).Scan(&rt11ID); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT id FROM pharmacy_bills WHERE bill_no = 'RT-000004'`).Scan(&rt4ID); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT id FROM pharmacy_bills WHERE bill_no = 'TO-000012'`).Scan(&toID); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT id FROM pharmacy_bills WHERE bill_no = 'PH-DESK'`).Scan(&deskID); err != nil {
		t.Fatal(err)
	}

	if _, err := sqlDB.Exec(`
		INSERT INTO pharmacy_purchase_bills (bill_no, supplier_name, status, total_mmk)
		VALUES ('PU-000003', 'Supplier', 'paid', 500)
	`); err != nil {
		t.Fatalf("seed purchase: %v", err)
	}
	var puID int64
	if err := sqlDB.QueryRow(`SELECT id FROM pharmacy_purchase_bills WHERE bill_no = 'PU-000003'`).Scan(&puID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`UPDATE pharmacy_purchase_bill_number_seq SET next_num = 4 WHERE id = 1`); err != nil {
		t.Fatal(err)
	}

	// Simulate a pre-049 database: shared sale pointer ahead of the last PH number.
	if _, err := sqlDB.Exec(`DELETE FROM schema_migrations WHERE name = '049_pharmacy_voucher_counters'`); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`DROP TABLE pharmacy_return_bill_number_seq`); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`DROP TABLE pharmacy_transfer_bill_number_seq`); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`UPDATE pharmacy_bill_number_seq SET next_num = 13 WHERE id = 1`); err != nil {
		t.Fatal(err)
	}

	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("upgrade migrate: %v", err)
	}

	assertBillUnchanged(t, sqlDB, phID, "PH-000010")
	assertBillUnchanged(t, sqlDB, rt11ID, "RT-000011")
	assertBillUnchanged(t, sqlDB, rt4ID, "RT-000004")
	assertBillUnchanged(t, sqlDB, toID, "TO-000012")
	assertBillUnchanged(t, sqlDB, deskID, "PH-DESK")

	var puNo string
	if err := sqlDB.QueryRow(`SELECT bill_no FROM pharmacy_purchase_bills WHERE id = ?`, puID).Scan(&puNo); err != nil {
		t.Fatal(err)
	}
	if puNo != "PU-000003" {
		t.Fatalf("purchase bill_no %q", puNo)
	}
	assertSeqNext(t, sqlDB, "pharmacy_purchase_bill_number_seq", 4)

	assertSeqNext(t, sqlDB, "pharmacy_bill_number_seq", 11)
	assertSeqNext(t, sqlDB, "pharmacy_return_bill_number_seq", 12)
	assertSeqNext(t, sqlDB, "pharmacy_transfer_bill_number_seq", 13)

	// Second Migrate must leave counters alone.
	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("re-migrate: %v", err)
	}
	assertSeqNext(t, sqlDB, "pharmacy_bill_number_seq", 11)
	assertSeqNext(t, sqlDB, "pharmacy_return_bill_number_seq", 12)
	assertSeqNext(t, sqlDB, "pharmacy_transfer_bill_number_seq", 13)
	assertSeqNext(t, sqlDB, "pharmacy_purchase_bill_number_seq", 4)
	assertBillUnchanged(t, sqlDB, phID, "PH-000010")
	assertBillUnchanged(t, sqlDB, rt11ID, "RT-000011")
	assertBillUnchanged(t, sqlDB, toID, "TO-000012")
}

func assertSeqNext(t *testing.T, sqlDB *sql.DB, table string, want int64) {
	t.Helper()
	var got int64
	if err := sqlDB.QueryRow(`SELECT next_num FROM ` + table + ` WHERE id = 1`).Scan(&got); err != nil {
		t.Fatalf("%s: %v", table, err)
	}
	if got != want {
		t.Fatalf("%s next_num=%d, want %d", table, got, want)
	}
}

func assertBillUnchanged(t *testing.T, sqlDB *sql.DB, id int64, wantNo string) {
	t.Helper()
	var gotNo string
	var gotID int64
	if err := sqlDB.QueryRow(`SELECT id, bill_no FROM pharmacy_bills WHERE id = ?`, id).Scan(&gotID, &gotNo); err != nil {
		t.Fatalf("bill %d: %v", id, err)
	}
	if gotID != id || gotNo != wantNo {
		t.Fatalf("bill id=%d no=%q, want id=%d no=%q", gotID, gotNo, id, wantNo)
	}
}
