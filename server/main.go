package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	bk "mudita-hospital/server/internal/backup"
	"mudita-hospital/server/internal/config"
	"mudita-hospital/server/internal/db"
	"mudita-hospital/server/internal/handlers"
	"mudita-hospital/server/internal/middleware"
)

func main() {
	configPath := flag.String("config", "", "path to config.json (default: ./config.json or beside exe)")
	flag.Parse()

	baseDir, err := workingBase()
	if err != nil {
		log.Fatalf("base dir: %v", err)
	}

	cfgFile := *configPath
	if cfgFile == "" {
		cfgFile = resolveConfigPath(baseDir)
	} else if !filepath.IsAbs(cfgFile) {
		cfgFile = filepath.Join(baseDir, cfgFile)
	}

	cfg, err := config.Load(cfgFile)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	dbPath := config.ResolvePath(baseDir, cfg.DBPath)
	backupDir := config.ResolvePath(baseDir, cfg.BackupDir)

	if err := bk.EnsureDir(backupDir); err != nil {
		log.Fatalf("backup dir: %v", err)
	}

	applied, err := bk.ApplyPendingIfAny(backupDir, dbPath)
	if err != nil {
		log.Fatalf("pending restore: %v", err)
	}
	if applied {
		log.Printf("applied pending database restore → %s", dbPath)
	}

	sqlDB, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer sqlDB.Close()

	mux := http.NewServeMux()
	// Public
	mux.Handle("/api/health", &handlers.Health{DB: sqlDB})
	mux.Handle("/api/auth/", &handlers.Auth{DB: sqlDB})
	// Master data (Admin)
	mux.Handle("/api/settings", &handlers.Settings{DB: sqlDB})
	mux.Handle("/api/doctors", &handlers.Doctors{DB: sqlDB})
	mux.Handle("/api/doctors/", &handlers.Doctors{DB: sqlDB})
	mux.Handle("/api/services", &handlers.Services{DB: sqlDB})
	mux.Handle("/api/services/", &handlers.Services{DB: sqlDB})
	mux.Handle("/api/users", &handlers.Users{DB: sqlDB})
	mux.Handle("/api/users/", &handlers.Users{DB: sqlDB})
	// Pharmacy inventory (Admin + Pharmacy)
	mux.Handle("/api/pharmacy/", &handlers.Pharmacy{DB: sqlDB})
	// OPD billing (Admin + Reception)
	mux.Handle("/api/opd/", &handlers.OPD{DB: sqlDB})
	// OT case cart (Admin + Reception)
	mux.Handle("/api/ot/", &handlers.OT{DB: sqlDB})
	// Backup / restore (Admin)
	mux.Handle("/api/backup", &handlers.Backup{
		DB:                  sqlDB,
		BackupDir:           backupDir,
		RestartAfterRestore: handlers.ExitForRestore,
	})
	mux.Handle("/api/backup/", &handlers.Backup{
		DB:                  sqlDB,
		BackupDir:           backupDir,
		RestartAfterRestore: handlers.ExitForRestore,
	})
	// Reports (role-gated per report) + Admin training/demo
	mux.Handle("/api/reports/", &handlers.Reports{DB: sqlDB})
	// Dashboard analytics (Admin / settings only)
	mux.Handle("/api/dashboard/", &handlers.Dashboard{DB: sqlDB})
	mux.Handle("/api/demo/", &handlers.Demo{DB: sqlDB})
	mux.Handle("/api/demo", &handlers.Demo{DB: sqlDB})

	handlers.StartScheduler(sqlDB, backupDir, cfg.BackupIntervalHours)

	addr := cfg.Addr()
	log.Printf("Mudita Hospital API listening on http://%s", addr)
	log.Printf("config: %s", cfgFile)
	log.Printf("SQLite (WAL): %s", dbPath)
	log.Printf("backups: %s (interval %dh)", backupDir, cfg.BackupIntervalHours)
	if cfg.Host == "127.0.0.1" || cfg.Host == "localhost" {
		log.Printf("bind: localhost only — clinic PCs cannot connect; set host to 0.0.0.0 for LAN")
	} else {
		log.Printf("bind: %s — reachable on LAN (firewall must allow port %d)", cfg.Host, cfg.Port)
	}

	if err := http.ListenAndServe(addr, middleware.CORS(mux)); err != nil {
		fmt.Fprintf(os.Stderr, "server stopped: %v\n", err)
		os.Exit(1)
	}
}

func workingBase() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return wd, nil
}

func resolveConfigPath(baseDir string) string {
	candidates := []string{
		filepath.Join(baseDir, "config.json"),
	}
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "config.json"))
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return filepath.Join(baseDir, "config.json")
}
