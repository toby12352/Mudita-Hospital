package db

import (
	"database/sql"
	"fmt"
	"log"

	"mudita-hospital/server/internal/auth"
)

// SeedDefaultUsers creates Admin (must change password) and a Pharmacy demo user for role tests.
// Idempotent: skips if username already exists.
func SeedDefaultUsers(sqlDB *sql.DB) error {
	seeds := []struct {
		username    string
		displayName string
		role        string
		password    string
		mustChange  bool
	}{
		{"admin", "System Admin", auth.RoleAdmin, "admin123", true},
		{"pharmacy", "Pharmacy Demo", auth.RolePharmacy, "pharmacy123", false},
		{"reception", "Reception Demo", auth.RoleReception, "reception123", false},
	}

	for _, s := range seeds {
		var n int
		if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM users WHERE username = ?`, s.username).Scan(&n); err != nil {
			return fmt.Errorf("check user %s: %w", s.username, err)
		}
		if n > 0 {
			continue
		}

		hash, err := auth.HashPassword(s.password)
		if err != nil {
			return fmt.Errorf("hash password for %s: %w", s.username, err)
		}

		must := 0
		if s.mustChange {
			must = 1
		}
		_, err = sqlDB.Exec(`
			INSERT INTO users (username, display_name, role, password_hash, must_change_password, active)
			VALUES (?, ?, ?, ?, ?, 1)
		`, s.username, s.displayName, s.role, hash, must)
		if err != nil {
			return fmt.Errorf("insert user %s: %w", s.username, err)
		}
		log.Printf("seeded user %q (%s) — default password set; change in production", s.username, s.role)
	}

	return nil
}
