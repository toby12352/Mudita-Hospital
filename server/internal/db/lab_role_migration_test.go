package db

import "testing"

func TestLabRoleMigrationPreservesUsers(t *testing.T) {
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
		  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
		  access_mode TEXT NOT NULL DEFAULT 'portal'
		);
		CREATE TABLE sessions (
		  token TEXT PRIMARY KEY,
		  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		  expires_at TEXT NOT NULL
		);
		CREATE TABLE user_grants (
		  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		  perm TEXT NOT NULL,
		  PRIMARY KEY (user_id, perm)
		);
		INSERT INTO users (
		  id, username, display_name, role, password_hash, must_change_password, active, created_at, updated_at, access_mode
		) VALUES
		  (4, 'pharm', 'Pharmacy Desk', 'Pharmacy', 'hash-pharm', 0, 1, '2024-03-03 00:00:00', '2024-08-08 00:00:00', 'portal'),
		  (8, 'opd', 'OPD Desk', 'OPD', 'hash-opd', 1, 1, '2024-04-04 00:00:00', '2024-09-09 00:00:00', 'unified');
		INSERT INTO sessions (token, user_id, expires_at) VALUES ('keep-tok', 4, '2099-01-01T00:00:00Z');
		INSERT INTO user_grants (user_id, perm) VALUES (8, 'opd.read');
	`); err != nil {
		t.Fatalf("pre schema: %v", err)
	}
	for _, m := range migrations {
		if m.Name == "046_lab_role" {
			continue
		}
		if _, err := sqlDB.Exec(`INSERT INTO schema_migrations (name) VALUES (?)`, m.Name); err != nil {
			t.Fatalf("mark %s: %v", m.Name, err)
		}
	}

	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	type userRow struct {
		id       int64
		username string
		role     string
		hash     string
		must     int
		created  string
		updated  string
		mode     string
	}
	var got []userRow
	rows, err := sqlDB.Query(`
		SELECT id, username, role, password_hash, must_change_password, created_at, updated_at, access_mode
		FROM users ORDER BY id
	`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var u userRow
		if err := rows.Scan(&u.id, &u.username, &u.role, &u.hash, &u.must, &u.created, &u.updated, &u.mode); err != nil {
			t.Fatal(err)
		}
		got = append(got, u)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].id != 4 || got[1].id != 8 {
		t.Fatalf("users %+v", got)
	}
	if got[0].username != "pharm" || got[0].role != "Pharmacy" || got[0].hash != "hash-pharm" || got[0].mode != "portal" || got[0].must != 0 {
		t.Fatalf("pharmacy %+v", got[0])
	}
	if got[0].created != "2024-03-03 00:00:00" || got[0].updated != "2024-08-08 00:00:00" {
		t.Fatalf("pharmacy timestamps %+v", got[0])
	}
	if got[1].username != "opd" || got[1].role != "OPD" || got[1].hash != "hash-opd" || got[1].mode != "unified" || got[1].must != 1 {
		t.Fatalf("opd %+v", got[1])
	}

	var token string
	var sessionUser int64
	if err := sqlDB.QueryRow(`SELECT token, user_id FROM sessions`).Scan(&token, &sessionUser); err != nil {
		t.Fatal(err)
	}
	if token != "keep-tok" || sessionUser != 4 {
		t.Fatalf("session %s user %d", token, sessionUser)
	}
	var grant string
	if err := sqlDB.QueryRow(`SELECT perm FROM user_grants WHERE user_id = 8`).Scan(&grant); err != nil {
		t.Fatal(err)
	}
	if grant != "opd.read" {
		t.Fatalf("grant %s", grant)
	}

	if _, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash)
		VALUES ('labdesk', 'Lab Desk', 'Lab', 'hash-lab')
	`); err != nil {
		t.Fatalf("Lab insert: %v", err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO users (username, display_name, role, password_hash)
		VALUES ('old', 'Old', 'Reception', 'hash-old')
	`); err == nil {
		t.Fatal("Reception role accepted")
	}

	var nextID int64
	if err := sqlDB.QueryRow(`
		INSERT INTO users (username, display_name, role, password_hash)
		VALUES ('next', 'Next', 'OPD', 'hash-next')
		RETURNING id
	`).Scan(&nextID); err != nil {
		t.Fatal(err)
	}
	if nextID <= 8 {
		t.Fatalf("next id reused %d", nextID)
	}

	var applied int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '046_lab_role'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("046 applied %d", applied)
	}
	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = '046_lab_role'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("046 reapplied %d", applied)
	}

	var still int
	if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM users WHERE id = 4 AND password_hash = 'hash-pharm'`).Scan(&still); err != nil {
		t.Fatal(err)
	}
	if still != 1 {
		t.Fatal("pharmacy row lost")
	}
}
