package db

import (
	"database/sql"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"mudita-hospital/server/internal/auth"
)

var portalMigrateSeq atomic.Int64

func openPortalMigrateDB(t *testing.T) *sql.DB {
	t.Helper()
	n := portalMigrateSeq.Add(1)
	dsn := fmt.Sprintf("file:portalmigrate%d?mode=memory&cache=shared&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", n)
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

func TestPortalUsersToGrants(t *testing.T) {
	sqlDB := openPortalMigrateDB(t)
	if err := Migrate(sqlDB); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`DELETE FROM schema_migrations WHERE name = '048_portal_users_to_grants'`); err != nil {
		t.Fatal(err)
	}

	hash := "desk-hash"
	res, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash, must_change_password, active, access_mode)
		VALUES ('opd', 'OPD Desk', 'OPD', ?, 0, 1, 'portal')
	`, hash)
	if err != nil {
		t.Fatal(err)
	}
	opdID, _ := res.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO sessions (token, user_id, expires_at) VALUES ('desk-tok', ?, '2099-01-01T00:00:00Z')
	`, opdID); err != nil {
		t.Fatal(err)
	}
	adminRes, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash, active, access_mode)
		VALUES ('admin', 'System Admin', 'Admin', 'admin-hash', 1, 'portal')
	`)
	if err != nil {
		t.Fatal(err)
	}
	adminID, _ := adminRes.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO sessions (token, user_id, expires_at) VALUES ('admin-tok', ?, '2099-01-01T00:00:00Z')
	`, adminID); err != nil {
		t.Fatal(err)
	}
	var billsBefore int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM opd_bills`).Scan(&billsBefore); err != nil {
		t.Fatal(err)
	}

	if err := Migrate(sqlDB); err != nil {
		t.Fatal(err)
	}

	var mode, gotHash string
	var active int
	if err := sqlDB.QueryRow(`
		SELECT access_mode, password_hash, active FROM users WHERE id = ?
	`, opdID).Scan(&mode, &gotHash, &active); err != nil {
		t.Fatal(err)
	}
	if mode != auth.AccessUnified || gotHash != hash || active != 1 {
		t.Fatalf("opd mode=%s hash=%s active=%d", mode, gotHash, active)
	}
	var grants int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM user_grants WHERE user_id = ?`, opdID).Scan(&grants); err != nil {
		t.Fatal(err)
	}
	want := len(auth.GrantsForDeskRole(auth.RoleOPD))
	if grants != want {
		t.Fatalf("grants %d want %d", grants, want)
	}
	for _, perm := range auth.GrantsForDeskRole(auth.RoleOPD) {
		var n int
		if err := sqlDB.QueryRow(`
			SELECT COUNT(1) FROM user_grants WHERE user_id = ? AND perm = ?
		`, opdID, perm).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Fatalf("missing %s", perm)
		}
	}
	var sessions int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM sessions WHERE user_id = ?`, opdID).Scan(&sessions); err != nil {
		t.Fatal(err)
	}
	if sessions != 0 {
		t.Fatalf("desk sessions %d", sessions)
	}

	var adminMode, adminHash string
	var adminSessions int
	if err := sqlDB.QueryRow(`SELECT access_mode, password_hash FROM users WHERE id = ?`, adminID).Scan(&adminMode, &adminHash); err != nil {
		t.Fatal(err)
	}
	if adminMode != auth.AccessPortal || adminHash != "admin-hash" {
		t.Fatalf("admin mode=%s hash=%s", adminMode, adminHash)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM sessions WHERE user_id = ?`, adminID).Scan(&adminSessions); err != nil {
		t.Fatal(err)
	}
	if adminSessions != 1 {
		t.Fatalf("admin sessions %d", adminSessions)
	}
	var adminGrants int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM user_grants WHERE user_id = ?`, adminID).Scan(&adminGrants); err != nil {
		t.Fatal(err)
	}
	if adminGrants != 0 {
		t.Fatalf("admin grants %d", adminGrants)
	}

	var portalLeft int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM users WHERE access_mode = 'portal' AND role != 'Admin'
	`).Scan(&portalLeft); err != nil {
		t.Fatal(err)
	}
	if portalLeft != 0 {
		t.Fatalf("portal desks left %d", portalLeft)
	}
	var billsAfter int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM opd_bills`).Scan(&billsAfter); err != nil {
		t.Fatal(err)
	}
	if billsAfter != billsBefore {
		t.Fatalf("bills %d → %d", billsBefore, billsAfter)
	}
	var recorded int
	if err := sqlDB.QueryRow(`
		SELECT COUNT(1) FROM schema_migrations WHERE name = '048_portal_users_to_grants'
	`).Scan(&recorded); err != nil {
		t.Fatal(err)
	}
	if recorded != 1 {
		t.Fatalf("migration rows %d", recorded)
	}

	if err := Migrate(sqlDB); err != nil {
		t.Fatal(err)
	}
	var grantsAgain int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM user_grants WHERE user_id = ?`, opdID).Scan(&grantsAgain); err != nil {
		t.Fatal(err)
	}
	if grantsAgain != want {
		t.Fatalf("second migrate grants %d", grantsAgain)
	}
	var users int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM users`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if users != 2 {
		t.Fatalf("users %d", users)
	}
}

type codingUser struct {
	id     int64
	name   string
	role   string
	mode   string
	hash   string
	active int
}

func TestCodingDatabase048(t *testing.T) {
	if os.Getenv("MUDITA_CODING_DB") != "1" {
		t.Skip("set MUDITA_CODING_DB=1 to prove migration 048 on server/data/mudita.db")
	}
	live := filepath.Clean(`c:\Mudita_Software\Mudita-Hospital\server\data\mudita.db`)
	if strings.Contains(strings.ToLower(live), `muditahospital\server`) {
		t.Fatal("refusing the hospital install database")
	}
	if _, err := os.Stat(live); err != nil {
		t.Fatal(err)
	}
	busy := codingAPIBusy()
	stamp := time.Now().Format("20060102-150405")
	snap := filepath.Join(filepath.Dir(live), "mudita.db.pre-048-"+stamp)
	if err := vacuumInto(live, snap); err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	t.Logf("snapshot %s", snap)

	target := live
	if busy {
		target = filepath.Join(t.TempDir(), "mudita.db")
		if err := copyFile(snap, target); err != nil {
			t.Fatal(err)
		}
		t.Log("API is listening on 8080; proving the migration on a snapshot copy and leaving server/data/mudita.db unchanged")
	}

	before := readCodingBaseline(t, snap)
	sqlDB, err := Open(target)
	if err != nil {
		restoreCoding(t, live, snap, busy)
		t.Fatal(err)
	}
	failed := true
	defer func() {
		_ = sqlDB.Close()
		if failed {
			restoreCoding(t, live, snap, busy)
		}
	}()

	checkCoding048(t, sqlDB, before)
	if err := Migrate(sqlDB); err != nil {
		t.Fatal(err)
	}
	checkCoding048(t, sqlDB, before)
	failed = false
	if busy {
		t.Log("copy passed; restart the dev API to apply 048 to server/data/mudita.db")
	}
}

func codingAPIBusy() bool {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:8080", 300*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func vacuumInto(src, dest string) error {
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(8000)", filepath.ToSlash(src))
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	sqlDB.SetMaxOpenConns(1)
	quoted := strings.ReplaceAll(filepath.ToSlash(dest), "'", "''")
	if _, err := sqlDB.Exec(`VACUUM INTO '` + quoted + `'`); err != nil {
		return err
	}
	return nil
}

func copyFile(src, dest string) error {
	in, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dest, in, 0o644)
}

func restoreCoding(t *testing.T, live, snap string, busy bool) {
	t.Helper()
	if busy {
		return
	}
	if err := copyFile(snap, live); err != nil {
		t.Errorf("restore snapshot: %v", err)
	}
	_ = os.Remove(live + "-wal")
	_ = os.Remove(live + "-shm")
}

type codingBaseline struct {
	users   []codingUser
	counts  map[string]int
	stock   int64
	samples map[string][]sampleFK
}

type sampleFK struct {
	id  int64
	uid sql.NullInt64
}

func readCodingBaseline(t *testing.T, path string) codingBaseline {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=ro&_pragma=busy_timeout(8000)", filepath.ToSlash(path))
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	sqlDB.SetMaxOpenConns(1)
	var base codingBaseline
	base.counts = map[string]int{}
	base.samples = map[string][]sampleFK{}
	rows, err := sqlDB.Query(`SELECT id, username, role, access_mode, password_hash, active FROM users ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var u codingUser
		if err := rows.Scan(&u.id, &u.name, &u.role, &u.mode, &u.hash, &u.active); err != nil {
			t.Fatal(err)
		}
		base.users = append(base.users, u)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	_ = rows.Close()
	for _, table := range []string{"opd_bills", "ot_bills", "pharmacy_bills", "lab_bills", "expense_bills", "stock_movements"} {
		var n int
		if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ` + table).Scan(&n); err != nil {
			t.Fatal(err)
		}
		base.counts[table] = n
	}
	if err := sqlDB.QueryRow(`SELECT COALESCE(SUM(qty), 0) FROM item_batches`).Scan(&base.stock); err != nil {
		t.Fatal(err)
	}
	var otStock int64
	if err := sqlDB.QueryRow(`SELECT COALESCE(SUM(qty), 0) FROM ot_batches`).Scan(&otStock); err != nil {
		t.Fatal(err)
	}
	base.stock += otStock
	for _, sample := range []struct{ table, col string }{
		{"opd_bills", "paid_by_user_id"},
		{"pharmacy_bills", "paid_by_user_id"},
		{"stock_movements", "actor_user_id"},
	} {
		srows, err := sqlDB.Query(`SELECT id, ` + sample.col + ` FROM ` + sample.table + ` WHERE ` + sample.col + ` IS NOT NULL ORDER BY id LIMIT 5`)
		if err != nil {
			t.Fatal(err)
		}
		var list []sampleFK
		for srows.Next() {
			var s sampleFK
			if err := srows.Scan(&s.id, &s.uid); err != nil {
				t.Fatal(err)
			}
			list = append(list, s)
		}
		_ = srows.Close()
		base.samples[sample.table+"."+sample.col] = list
	}
	return base
}

func checkCoding048(t *testing.T, sqlDB *sql.DB, before codingBaseline) {
	t.Helper()
	var users int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM users`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if users != len(before.users) {
		t.Fatalf("user count %d want %d", users, len(before.users))
	}
	for _, u := range before.users {
		var got codingUser
		if err := sqlDB.QueryRow(`
			SELECT id, username, role, access_mode, password_hash, active FROM users WHERE id = ?
		`, u.id).Scan(&got.id, &got.name, &got.role, &got.mode, &got.hash, &got.active); err != nil {
			t.Fatalf("user %d: %v", u.id, err)
		}
		if got.name != u.name || got.role != u.role || got.hash != u.hash {
			t.Fatalf("user %d changed %+v", u.id, got)
		}
		grants := auth.GrantsForDeskRole(u.role)
		if u.mode == auth.AccessPortal && u.role != auth.RoleAdmin && grants != nil {
			if got.mode != auth.AccessUnified || got.active != u.active {
				t.Fatalf("converted %s mode=%s active=%d", u.name, got.mode, got.active)
			}
			var n int
			if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM user_grants WHERE user_id = ?`, u.id).Scan(&n); err != nil {
				t.Fatal(err)
			}
			if n != len(grants) {
				t.Fatalf("%s grants %d want %d", u.name, n, len(grants))
			}
			for _, perm := range grants {
				var one int
				if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM user_grants WHERE user_id = ? AND perm = ?`, u.id, perm).Scan(&one); err != nil {
					t.Fatal(err)
				}
				if one != 1 {
					t.Fatalf("%s missing %s", u.name, perm)
				}
			}
			var sessions int
			if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM sessions WHERE user_id = ?`, u.id).Scan(&sessions); err != nil {
				t.Fatal(err)
			}
			if sessions != 0 {
				t.Fatalf("%s sessions %d", u.name, sessions)
			}
			continue
		}
		if got.active != u.active || got.mode != u.mode {
			t.Fatalf("untouched %s mode %s→%s active %d→%d", u.name, u.mode, got.mode, u.active, got.active)
		}
	}
	var portalLeft int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM users WHERE access_mode = 'portal' AND role != 'Admin'`).Scan(&portalLeft); err != nil {
		t.Fatal(err)
	}
	if portalLeft != 0 {
		t.Fatalf("portal desks left %d", portalLeft)
	}
	for table, want := range before.counts {
		var n int
		if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM ` + table).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != want {
			t.Fatalf("%s %d want %d", table, n, want)
		}
	}
	var stock int64
	if err := sqlDB.QueryRow(`SELECT COALESCE(SUM(qty), 0) FROM item_batches`).Scan(&stock); err != nil {
		t.Fatal(err)
	}
	var otStock int64
	if err := sqlDB.QueryRow(`SELECT COALESCE(SUM(qty), 0) FROM ot_batches`).Scan(&otStock); err != nil {
		t.Fatal(err)
	}
	if stock+otStock != before.stock {
		t.Fatalf("stock %d want %d", stock+otStock, before.stock)
	}
	for key, list := range before.samples {
		parts := strings.Split(key, ".")
		for _, s := range list {
			var uid sql.NullInt64
			if err := sqlDB.QueryRow(`SELECT `+parts[1]+` FROM `+parts[0]+` WHERE id = ?`, s.id).Scan(&uid); err != nil {
				t.Fatal(err)
			}
			if uid != s.uid {
				t.Fatalf("%s id %d user %v want %v", key, s.id, uid, s.uid)
			}
		}
	}
	var fk int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM pragma_foreign_key_check`).Scan(&fk); err != nil {
		t.Fatal(err)
	}
	if fk != 0 {
		t.Fatalf("foreign key check rows %d", fk)
	}
	var recorded int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '048_portal_users_to_grants'`).Scan(&recorded); err != nil {
		t.Fatal(err)
	}
	if recorded != 1 {
		t.Fatalf("migration rows %d", recorded)
	}
}
