package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// Settings handles hospital bill-header settings (Admin / settings permission).
type Settings struct {
	DB *sql.DB
}

type hospitalSettings struct {
	HospitalName string `json:"hospital_name"`
	Address      string `json:"address"`
	Phone        string `json:"phone"`
	LogoPath     string `json:"logo_path"`
	UpdatedAt    string `json:"updated_at,omitempty"`
}

func (s *Settings) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(s.DB, auth.PermSettings, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			s.get(w, r)
		case http.MethodPut:
			s.put(w, r)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		}
	})).ServeHTTP(w, r)
}

func (s *Settings) get(w http.ResponseWriter, r *http.Request) {
	hs, err := loadHospitalSettings(s.DB)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	writeJSON(w, http.StatusOK, hs)
}

func (s *Settings) put(w http.ResponseWriter, r *http.Request) {
	var req hospitalSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.HospitalName = strings.TrimSpace(req.HospitalName)
	req.Address = strings.TrimSpace(req.Address)
	req.Phone = strings.TrimSpace(req.Phone)
	req.LogoPath = strings.TrimSpace(req.LogoPath)
	if req.HospitalName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "hospital_name required"})
		return
	}

	_, err := s.DB.Exec(`
		UPDATE hospital_settings
		SET hospital_name = ?, address = ?, phone = ?, logo_path = ?, updated_at = datetime('now')
		WHERE id = 1
	`, req.HospitalName, req.Address, req.Phone, req.LogoPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	id := int64(1)
	audit.WriteAudit(s.DB, &uid, "update", "hospital_settings", &id, map[string]string{
		"hospital_name": req.HospitalName,
	})

	hs, err := loadHospitalSettings(s.DB)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, hs)
}

func loadHospitalSettings(db *sql.DB) (*hospitalSettings, error) {
	var hs hospitalSettings
	err := db.QueryRow(`
		SELECT hospital_name, address, phone, logo_path, updated_at
		FROM hospital_settings WHERE id = 1
	`).Scan(&hs.HospitalName, &hs.Address, &hs.Phone, &hs.LogoPath, &hs.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &hs, nil
}
