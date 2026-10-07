package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	bk "mudita-hospital/server/internal/backup"
	"mudita-hospital/server/internal/middleware"
)

// Backup handles Admin backup list / create / restore (settings permission).
type Backup struct {
	DB        *sql.DB
	BackupDir string
	// RestartAfterRestore should exit the process so the watchdog / service restarts
	// and ApplyPendingIfAny runs before the next Open.
	RestartAfterRestore func()
}

func (b *Backup) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(b.DB, auth.PermSettings, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/backup")
		path = strings.Trim(path, "/")

		switch {
		case path == "" && r.Method == http.MethodGet:
			b.list(w, r)
		case path == "" && r.Method == http.MethodPost:
			b.create(w, r)
		case path == "restore" && r.Method == http.MethodPost:
			b.restore(w, r)
		default:
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		}
	})).ServeHTTP(w, r)
}

func (b *Backup) list(w http.ResponseWriter, r *http.Request) {
	items, err := bk.List(b.BackupDir)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	type row struct {
		Name      string `json:"name"`
		SizeBytes int64  `json:"size_bytes"`
		CreatedAt string `json:"created_at"`
	}
	out := make([]row, 0, len(items))
	for _, it := range items {
		out = append(out, row{
			Name:      it.Name,
			SizeBytes: it.SizeBytes,
			CreatedAt: it.CreatedAt.Format(time.RFC3339),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"backup_dir": b.BackupDir,
		"backups":    out,
	})
}

func (b *Backup) create(w http.ResponseWriter, r *http.Request) {
	info, err := bk.Create(b.DB, b.BackupDir)
	if err != nil {
		log.Printf("backup create: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "backup failed"})
		return
	}
	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(b.DB, &uid, "backup", "database", nil, map[string]string{
		"name": info.Name,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"name":       info.Name,
		"size_bytes": info.SizeBytes,
		"created_at": info.CreatedAt.Format(time.RFC3339),
		"backup_dir": b.BackupDir,
	})
}

func (b *Backup) restore(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	src, err := bk.ResolveInDir(b.BackupDir, req.Name)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := bk.WritePendingRestore(b.BackupDir, src); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "queue restore failed"})
		return
	}
	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(b.DB, &uid, "restore", "database", nil, map[string]string{
		"name": req.Name,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "Restore queued. API will restart and apply the backup.",
		"name":    req.Name,
	})
	if b.RestartAfterRestore != nil {
		go func() {
			time.Sleep(400 * time.Millisecond)
			b.RestartAfterRestore()
		}()
	}
}

// StartScheduler runs periodic backups. intervalHours <= 0 disables.
func StartScheduler(db *sql.DB, backupDir string, intervalHours int) {
	if intervalHours <= 0 {
		log.Printf("backup scheduler: disabled (interval_hours=%d)", intervalHours)
		return
	}
	interval := time.Duration(intervalHours) * time.Hour
	log.Printf("backup scheduler: every %s → %s", interval, backupDir)
	go func() {
		// First run shortly after boot so install smoke tests see a file.
		timer := time.NewTimer(2 * time.Minute)
		for {
			<-timer.C
			info, err := bk.Create(db, backupDir)
			if err != nil {
				log.Printf("scheduled backup failed: %v", err)
			} else {
				log.Printf("scheduled backup ok: %s (%d bytes)", info.Name, info.SizeBytes)
			}
			timer.Reset(interval)
		}
	}()
}

// ExitForRestore is the default process exit used after queuing a restore.
func ExitForRestore() {
	log.Printf("exiting for restore apply (watchdog/service should restart)")
	os.Exit(0)
}
