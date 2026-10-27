package db

import (
	"database/sql"
	"fmt"
	"strings"
	"sync/atomic"
	"testing"
)

var userGrantMemSeq atomic.Int64

func openUserGrantMem(t *testing.T) *sql.DB {
	t.Helper()
	n := userGrantMemSeq.Add(1)
	dsn := fmt.Sprintf("file:usergrants%d?mode=memory&cache=shared&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", n)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := sqlDB.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
	return sqlDB
}

func TestUserGrantsMigrationPreservesUsers(t *testing.T) {
	sqlDB := openUserGrantMem(t)
	if _, err := sqlDB.Exec(`
		CREATE TABLE schema_migrations (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  name TEXT NOT NULL UNIQUE,
		  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE users (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
		  display_name TEXT NOT NULL,
		  role TEXT NOT NULL CHECK (role IN ('Admin', 'OPD', 'OT', 'Pharmacy', 'Patients', 'IPD')),
		  password_hash TEXT NOT NULL,
		  must_change_password INTEGER NOT NULL DEFAULT 0,
		  active INTEGER NOT NULL DEFAULT 1,
		  created_at TEXT NOT NULL DEFAULT (datetime('now')),
		  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		INSERT INTO users (
		  id, username, display_name, role, password_hash, must_change_password, active, created_at, updated_at
		) VALUES
		  (4, 'pharm', 'Pharmacy Desk', 'Pharmacy', 'hash-pharm', 0, 1, '2024-03-03 00:00:00', '2024-08-08 00:00:00'),
		  (8, 'opd', 'OPD Desk', 'OPD', 'hash-opd', 1, 1, '2024-04-04 00:00:00', '2024-09-09 00:00:00');
	`); err != nil {
		t.Fatalf("pre schema: %v", err)
	}

	applied := []string{
		"001_schema_migrations",
		"002_auth",
		"003_master_data",
		"004_pharmacy",
		"005_opd",
		"006_ot",
		"007_pharmacy_units_billing",
		"008_pharmacy_pack_dosage",
		"009_hospital_phone2",
		"010_portal_roles",
		"011_ot_stock",
		"012_ot_bill_stock",
		"013_ot_sale_unit",
		"014_transfer_bill_link",
		"015_ot_services",
		"016_bill_discount",
		"017_service_categories",
		"018_ot_case_services",
		"019_bill_printed_at",
		"019_patients_role",
		"020_ot_case_patient",
		"021_ipd_role_admissions",
		"022_ipd_ledger",
		"023_bill_admission",
		"024_service_code_optional",
		"025_expense_services",
		"026_expense_bills",
		"027_ot_service_delete",
	}
	for _, name := range applied {
		if _, err := sqlDB.Exec(`INSERT INTO schema_migrations (name) VALUES (?)`, name); err != nil {
			t.Fatalf("mark %s: %v", name, err)
		}
	}

	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	type userRow struct {
		id       int64
		username string
		display  string
		role     string
		hash     string
		must     int
		active   int
		created  string
		updated  string
		mode     string
	}
	var got []userRow
	rows, err := sqlDB.Query(`
		SELECT id, username, display_name, role, password_hash, must_change_password, active, created_at, updated_at, access_mode
		FROM users ORDER BY id
	`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var u userRow
		if err := rows.Scan(&u.id, &u.username, &u.display, &u.role, &u.hash, &u.must, &u.active, &u.created, &u.updated, &u.mode); err != nil {
			t.Fatal(err)
		}
		got = append(got, u)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("users %+v", got)
	}
	if got[0].id != 4 || got[0].username != "pharm" || got[0].role != "Pharmacy" || got[0].hash != "hash-pharm" || got[0].mode != "portal" {
		t.Fatalf("pharmacy %+v", got[0])
	}
	if got[0].created != "2024-03-03 00:00:00" || got[0].updated != "2024-08-08 00:00:00" || got[0].must != 0 || got[0].active != 1 {
		t.Fatalf("pharmacy timestamps %+v", got[0])
	}
	if got[1].id != 8 || got[1].username != "opd" || got[1].role != "OPD" || got[1].hash != "hash-opd" || got[1].mode != "portal" || got[1].must != 1 {
		t.Fatalf("opd %+v", got[1])
	}

	var grants int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM user_grants`).Scan(&grants); err != nil {
		t.Fatal(err)
	}
	if grants != 0 {
		t.Fatalf("grants seeded: %d", grants)
	}

	var notnull int
	var dflt string
	if err := sqlDB.QueryRow(`
		SELECT "notnull", dflt_value FROM pragma_table_info('users') WHERE name = 'access_mode'
	`).Scan(&notnull, &dflt); err != nil {
		t.Fatal(err)
	}
	if notnull != 1 || dflt != "'portal'" {
		t.Fatalf("access_mode notnull=%d default=%q", notnull, dflt)
	}

	var tableSQL string
	if err := sqlDB.QueryRow(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_grants'`).Scan(&tableSQL); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(tableSQL, "PRIMARY KEY (user_id, perm)") || !strings.Contains(tableSQL, "ON DELETE CASCADE") {
		t.Fatalf("user_grants sql: %s", tableSQL)
	}
	var indexName string
	if err := sqlDB.QueryRow(`
		SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_user_grants_user_id'
	`).Scan(&indexName); err != nil {
		t.Fatal(err)
	}

	if _, err := sqlDB.Exec(`INSERT INTO user_grants (user_id, perm) VALUES (4, 'pharmacy.read')`); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`INSERT INTO user_grants (user_id, perm) VALUES (4, 'pharmacy.read')`); err == nil {
		t.Fatal("duplicate grant inserted")
	}
	if _, err := sqlDB.Exec(`DELETE FROM users WHERE id = 4`); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM user_grants`).Scan(&grants); err != nil {
		t.Fatal(err)
	}
	if grants != 0 {
		t.Fatalf("grants after user delete: %d", grants)
	}
	var left int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM users WHERE id = 8 AND access_mode = 'portal'`).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if left != 1 {
		t.Fatal("remaining user was rewritten")
	}

	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	var recorded int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '028_user_grants'`).Scan(&recorded); err != nil {
		t.Fatal(err)
	}
	if recorded != 1 {
		t.Fatalf("028 recorded %d times", recorded)
	}
}

func TestUserGrantsDefaultOnFreshMigrate(t *testing.T) {
	sqlDB := openUserGrantMem(t)
	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	res, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash, active)
		VALUES ('desk', 'Desk', 'Pharmacy', 'hash', 1)
	`)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	var mode string
	if err := sqlDB.QueryRow(`SELECT access_mode FROM users WHERE id = ?`, id).Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != "portal" {
		t.Fatalf("default access_mode %q", mode)
	}
}
