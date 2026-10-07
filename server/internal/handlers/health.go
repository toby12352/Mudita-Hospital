package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"
)

type HealthResponse struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Time      string `json:"time"`
	DB        string `json:"db"`
}

type Health struct {
	DB *sql.DB
}

func (h *Health) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	dbStatus := "ok"
	if h.DB != nil {
		if err := h.DB.Ping(); err != nil {
			dbStatus = "error"
		}
	} else {
		dbStatus = "unavailable"
	}

	status := "ok"
	if dbStatus != "ok" {
		status = "degraded"
	}

	w.Header().Set("Content-Type", "application/json")
	if status != "ok" {
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	_ = json.NewEncoder(w).Encode(HealthResponse{
		Status:  status,
		Service: "mudita-hospital",
		Time:    time.Now().UTC().Format(time.RFC3339),
		DB:      dbStatus,
	})
}
