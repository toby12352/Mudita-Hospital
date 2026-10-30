package auth

import (
	"database/sql"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"

	_ "modernc.org/sqlite"
)

var grantDBSeq atomic.Int64

func openGrantDB(t *testing.T) *sql.DB {
	t.Helper()
	n := grantDBSeq.Add(1)
	dsn := fmt.Sprintf("file:grants%d?mode=memory&cache=shared&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", n)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := sqlDB.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
	if _, err := sqlDB.Exec(`
		CREATE TABLE users (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  username TEXT NOT NULL UNIQUE,
		  display_name TEXT NOT NULL,
		  role TEXT NOT NULL,
		  password_hash TEXT NOT NULL,
		  active INTEGER NOT NULL DEFAULT 1,
		  access_mode TEXT NOT NULL DEFAULT 'portal'
		);
		CREATE TABLE user_grants (
		  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		  perm TEXT NOT NULL,
		  PRIMARY KEY (user_id, perm)
		);
	`); err != nil {
		t.Fatalf("schema: %v", err)
	}
	return sqlDB
}

func insertGrantUser(t *testing.T, sqlDB *sql.DB, role, mode string) int64 {
	t.Helper()
	n := grantDBSeq.Add(1)
	res, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash, active, access_mode)
		VALUES (?, 'Tester', ?, 'hash', 1, ?)
	`, fmt.Sprintf("user-%d", n), role, mode)
	if err != nil {
		t.Fatalf("user: %v", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func insertGrants(t *testing.T, sqlDB *sql.DB, userID int64, perms ...string) {
	t.Helper()
	for _, perm := range perms {
		if _, err := sqlDB.Exec(
			`INSERT INTO user_grants (user_id, perm) VALUES (?, ?)`, userID, perm,
		); err != nil {
			t.Fatalf("grant %s: %v", perm, err)
		}
	}
}

func TestGrantableKeys(t *testing.T) {
	if !Grantable(GrantPharmacyRead) || !Grantable(GrantDashboard) || !Grantable(GrantIPDRead) || !Grantable(GrantLabRead) {
		t.Fatal("expected clinic and dashboard keys to be grantable")
	}
	rejected := []string{GrantIPDDelete, PermSettings, PermManageUsers, PermPharmacy, "pharmacy.adjust", ""}
	for _, perm := range rejected {
		if Grantable(perm) {
			t.Fatalf("grantable %q", perm)
		}
	}
	if !ValidAccessMode(AccessPortal) || !ValidAccessMode(AccessUnified) || ValidAccessMode("other") {
		t.Fatal("access mode validation")
	}
	if _, err := NormalizeGrants([]string{GrantLabDelete}); !errors.Is(err, ErrGrantNeedsRead) {
		t.Fatalf("lab delete without read: %v", err)
	}
	lab, err := NormalizeGrants([]string{GrantLabRead, GrantLabDelete})
	if err != nil {
		t.Fatal(err)
	}
	if len(lab) != 2 || lab[0] != GrantLabRead || lab[1] != GrantLabDelete {
		t.Fatalf("lab grants %v", lab)
	}
}

func TestAllowAdminPortalAndUnified(t *testing.T) {
	sqlDB := openGrantDB(t)

	adminID := insertGrantUser(t, sqlDB, RoleAdmin, AccessPortal)
	adminPerms := []string{
		PermSettings, PermManageUsers, PermOPD, PermOT, PermPharmacy, PermPatients, PermIPD,
		GrantPharmacyRead, GrantPharmacyUpdate, GrantPharmacyDelete,
		GrantOPDUpdate, GrantIPDDelete, GrantDashboard,
	}
	for _, perm := range adminPerms {
		ok, err := Allow(sqlDB, adminID, perm)
		if err != nil || !ok {
			t.Fatalf("admin %s ok=%v err=%v", perm, ok, err)
		}
	}

	portalID := insertGrantUser(t, sqlDB, RolePharmacy, AccessPortal)
	ok, err := Allow(sqlDB, portalID, PermPharmacy)
	if err != nil || !ok {
		t.Fatalf("portal pharmacy perm ok=%v err=%v", ok, err)
	}
	for _, perm := range []string{PermOPD, PermSettings, GrantPharmacyRead, GrantPharmacyUpdate, GrantPharmacyDelete} {
		ok, err = Allow(sqlDB, portalID, perm)
		if err != nil || ok {
			t.Fatalf("portal pharmacy %s ok=%v err=%v", perm, ok, err)
		}
	}

	unifiedID := insertGrantUser(t, sqlDB, RoleOPD, AccessUnified)
	insertGrants(t, sqlDB, unifiedID,
		GrantPharmacyRead, GrantPharmacyUpdate, PermSettings, GrantIPDDelete,
	)
	want := map[string]bool{
		GrantPharmacyRead:   true,
		GrantPharmacyUpdate: true,
		GrantOPDUpdate:      false,
		GrantPharmacyDelete: false,
		PermOPD:             false,
		GrantOPDRead:        false,
		PermSettings:        false,
		GrantIPDDelete:      false,
		PermManageUsers:     false,
		GrantDashboard:      false,
	}
	for perm, allowed := range want {
		ok, err = Allow(sqlDB, unifiedID, perm)
		if err != nil || ok != allowed {
			t.Fatalf("unified role OPD %s ok=%v want %v err=%v", perm, ok, allowed, err)
		}
	}

	var stored int
	if err := sqlDB.QueryRow(
		`SELECT COUNT(1) FROM user_grants WHERE user_id = ? AND perm IN (?, ?)`,
		unifiedID, PermSettings, GrantIPDDelete,
	).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != 2 {
		t.Fatalf("non-grantable rows stored = %d", stored)
	}

	unknownID := insertGrantUser(t, sqlDB, RolePharmacy, "other")
	ok, err = Allow(sqlDB, unknownID, PermPharmacy)
	if err != nil || ok {
		t.Fatalf("unknown mode ok=%v err=%v", ok, err)
	}

	ok, err = Allow(sqlDB, 999999, PermPharmacy)
	if ok || !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("missing user ok=%v err=%v", ok, err)
	}
}

func TestDeskAllowedIgnoresUnifiedRole(t *testing.T) {
	sqlDB := openGrantDB(t)
	id := insertGrantUser(t, sqlDB, RoleOPD, AccessUnified)
	insertGrants(t, sqlDB, id, GrantPharmacyRead, GrantDashboard)

	cases := []struct {
		perm string
		want bool
	}{
		{PermPharmacy, true},
		{PermOPD, false},
		{PermSettings, false},
		{PermManageUsers, false},
		{PermPatients, false},
	}
	for _, tc := range cases {
		ok, err := DeskAllowed(sqlDB, id, tc.perm)
		if err != nil || ok != tc.want {
			t.Fatalf("desk %s ok=%v want %v err=%v", tc.perm, ok, tc.want, err)
		}
	}
	ok, err := AnyDeskAllowed(sqlDB, id, []string{PermSettings, PermOPD})
	if err != nil || ok {
		t.Fatalf("any settings/opd ok=%v err=%v", ok, err)
	}
	ok, err = ChartReadAllowed(sqlDB, id)
	if err != nil || ok {
		t.Fatalf("chart read ok=%v err=%v", ok, err)
	}

	portalID := insertGrantUser(t, sqlDB, RolePharmacy, AccessPortal)
	ok, err = DeskAllowed(sqlDB, portalID, PermPharmacy)
	if err != nil || !ok {
		t.Fatalf("portal pharmacy desk ok=%v err=%v", ok, err)
	}
	ok, err = DeskAllowed(sqlDB, portalID, PermSettings)
	if err != nil || ok {
		t.Fatalf("portal pharmacy settings ok=%v err=%v", ok, err)
	}
	ok, err = CellAllowed(sqlDB, portalID, GrantPharmacyUpdate)
	if err != nil || !ok {
		t.Fatalf("portal cell ok=%v err=%v", ok, err)
	}
	ok, err = Allow(sqlDB, portalID, GrantPharmacyUpdate)
	if err != nil || ok {
		t.Fatalf("portal allow update ok=%v err=%v", ok, err)
	}
}

func TestNormalizeGrantsAndFillerRole(t *testing.T) {
	got, err := NormalizeGrants([]string{" pharmacy.update ", "pharmacy.read", "pharmacy.read", GrantDashboard})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{GrantPharmacyRead, GrantPharmacyUpdate, GrantDashboard}
	if len(got) != len(want) {
		t.Fatalf("grants %#v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("grants %#v", got)
		}
	}
	if FillerRole(got) != RolePharmacy {
		t.Fatalf("filler %s", FillerRole(got))
	}

	if _, err := NormalizeGrants([]string{GrantOPDUpdate}); !errors.Is(err, ErrGrantNeedsRead) {
		t.Fatalf("needs read: %v", err)
	}
	for _, bad := range []string{GrantIPDDelete, PermSettings, PermManageUsers, "nope"} {
		if _, err := NormalizeGrants([]string{bad}); !errors.Is(err, ErrUnknownGrant) {
			t.Fatalf("%s: %v", bad, err)
		}
	}
	if _, err := NormalizeGrants(nil); !errors.Is(err, ErrGrantRequired) {
		t.Fatalf("empty: %v", err)
	}

	dash, err := NormalizeGrants([]string{GrantDashboard})
	if err != nil || FillerRole(dash) != RolePatients {
		t.Fatalf("dashboard only %#v %v", dash, err)
	}
	both, err := NormalizeGrants([]string{GrantPatientsRead, GrantOPDRead})
	if err != nil || FillerRole(both) != RoleOPD {
		t.Fatalf("opd first %#v %v", both, err)
	}
	ipd, err := NormalizeGrants([]string{GrantIPDRead})
	if err != nil || FillerRole(ipd) != RoleIPD {
		t.Fatalf("ipd %#v %v", ipd, err)
	}
}
