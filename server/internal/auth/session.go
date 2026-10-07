package auth

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"
)

const SessionTTL = 12 * time.Hour

type User struct {
	ID                 int64  `json:"id"`
	Username           string `json:"username"`
	DisplayName        string `json:"display_name"`
	Role               string `json:"role"`
	MustChangePassword bool   `json:"must_change_password"`
	Active             bool   `json:"active"`
}

type Session struct {
	Token     string
	UserID    int64
	ExpiresAt time.Time
}

func NewToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func CreateSession(db *sql.DB, userID int64) (token string, expiresAt time.Time, err error) {
	token, err = NewToken()
	if err != nil {
		return "", time.Time{}, err
	}
	expiresAt = time.Now().UTC().Add(SessionTTL)
	_, err = db.Exec(
		`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
		token, userID, expiresAt.Format(time.RFC3339),
	)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("insert session: %w", err)
	}
	return token, expiresAt, nil
}

func DeleteSession(db *sql.DB, token string) error {
	_, err := db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

func DeleteUserSessions(db *sql.DB, userID int64) error {
	_, err := db.Exec(`DELETE FROM sessions WHERE user_id = ?`, userID)
	return err
}

// LookupSession returns the active user for a valid, non-expired token.
func LookupSession(db *sql.DB, token string) (*User, error) {
	if token == "" {
		return nil, sql.ErrNoRows
	}

	var u User
	var expiresStr string
	var active int
	var mustChange int

	err := db.QueryRow(`
		SELECT u.id, u.username, u.display_name, u.role, u.must_change_password, u.active, s.expires_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = ?
	`, token).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &mustChange, &active, &expiresStr)
	if err != nil {
		return nil, err
	}

	expiresAt, err := time.Parse(time.RFC3339, expiresStr)
	if err != nil {
		return nil, fmt.Errorf("parse session expiry: %w", err)
	}
	if time.Now().UTC().After(expiresAt) {
		_ = DeleteSession(db, token)
		return nil, sql.ErrNoRows
	}
	if active == 0 {
		return nil, sql.ErrNoRows
	}

	u.MustChangePassword = mustChange == 1
	u.Active = true
	return &u, nil
}

func GetUserByUsername(db *sql.DB, username string) (*User, string, error) {
	var u User
	var hash string
	var active int
	var mustChange int

	err := db.QueryRow(`
		SELECT id, username, display_name, role, password_hash, must_change_password, active
		FROM users WHERE username = ?
	`, username).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &hash, &mustChange, &active)
	if err != nil {
		return nil, "", err
	}
	u.MustChangePassword = mustChange == 1
	u.Active = active == 1
	return &u, hash, nil
}

func GetUserByID(db *sql.DB, id int64) (*User, error) {
	var u User
	var active int
	var mustChange int

	err := db.QueryRow(`
		SELECT id, username, display_name, role, must_change_password, active
		FROM users WHERE id = ?
	`, id).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &mustChange, &active)
	if err != nil {
		return nil, err
	}
	u.MustChangePassword = mustChange == 1
	u.Active = active == 1
	return &u, nil
}
