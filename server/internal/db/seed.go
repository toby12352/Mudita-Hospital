package db

import (
	"database/sql"
	"fmt"
	"log"

	"mudita-hospital/server/internal/auth"
)

// SeedDefaultUsers creates the four desk logins: admin, opd, ot, and pharmacy.
// New accounts must change the seeded password. On every startup, an account
// that still matches that password is flagged must_change_password.
// Existing reception usernames are left in place; migration 010 sets their role to OPD.
func SeedDefaultUsers(sqlDB *sql.DB) error {
	seeds := []struct {
		username    string
		displayName string
		role        string
		password    string
	}{
		{"admin", "System Admin", auth.RoleAdmin, "admin123"},
		{"opd", "OPD Desk", auth.RoleOPD, "opd123"},
		{"ot", "OT Desk", auth.RoleOT, "ot123"},
		{"pharmacy", "Pharmacy Desk", auth.RolePharmacy, "pharmacy123"},
	}

	for _, s := range seeds {
		var n int
		if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM users WHERE username = ?`, s.username).Scan(&n); err != nil {
			return fmt.Errorf("check user %s: %w", s.username, err)
		}
		if n > 0 {
			if err := flagSeededPassword(sqlDB, s.username, s.password); err != nil {
				return err
			}
			continue
		}

		hash, err := auth.HashPassword(s.password)
		if err != nil {
			return fmt.Errorf("hash password for %s: %w", s.username, err)
		}
		_, err = sqlDB.Exec(`
			INSERT INTO users (username, display_name, role, password_hash, must_change_password, active)
			VALUES (?, ?, ?, ?, 1, 1)
		`, s.username, s.displayName, s.role, hash)
		if err != nil {
			return fmt.Errorf("insert user %s: %w", s.username, err)
		}
		log.Printf("seeded user %q (%s) — default password set; change before use", s.username, s.role)
	}

	return nil
}

func flagSeededPassword(sqlDB *sql.DB, username, password string) error {
	_, hash, err := auth.GetUserByUsername(sqlDB, username)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load user %s: %w", username, err)
	}
	if !auth.CheckPassword(hash, password) {
		return nil
	}
	res, err := sqlDB.Exec(`
		UPDATE users SET must_change_password = 1, updated_at = datetime('now')
		WHERE username = ? AND must_change_password = 0
	`, username)
	if err != nil {
		return fmt.Errorf("flag password change for %s: %w", username, err)
	}
	n, _ := res.RowsAffected()
	if n > 0 {
		log.Printf("user %q still has the seeded password; must change it before use", username)
	}
	return nil
}
