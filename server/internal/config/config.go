package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// Config holds server runtime settings. Env vars override config.json.
type Config struct {
	Host                 string `json:"host"`
	Port                 int    `json:"port"`
	DBPath               string `json:"db_path"`
	BackupDir            string `json:"backup_dir"`
	BackupIntervalHours  int    `json:"backup_interval_hours"`
}

func Default() Config {
	return Config{
		Host:                "127.0.0.1",
		Port:                8080,
		DBPath:              "data/mudita.db",
		BackupDir:           "backups",
		BackupIntervalHours: 24,
	}
}

// Load reads optional configPath (JSON), then applies env overrides:
// MUDITA_HOST, MUDITA_PORT, MUDITA_DB_PATH, MUDITA_BACKUP_DIR, MUDITA_BACKUP_INTERVAL_HOURS.
func Load(configPath string) (Config, error) {
	cfg := Default()

	if configPath == "" {
		configPath = "config.json"
	}

	if data, err := os.ReadFile(configPath); err == nil {
		if err := json.Unmarshal(data, &cfg); err != nil {
			return cfg, fmt.Errorf("parse config %s: %w", configPath, err)
		}
	} else if !os.IsNotExist(err) {
		return cfg, fmt.Errorf("read config %s: %w", configPath, err)
	}

	if v := os.Getenv("MUDITA_HOST"); v != "" {
		cfg.Host = v
	}
	if v := os.Getenv("MUDITA_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			return cfg, fmt.Errorf("MUDITA_PORT: %w", err)
		}
		cfg.Port = p
	}
	if v := os.Getenv("MUDITA_DB_PATH"); v != "" {
		cfg.DBPath = v
	}
	if v := os.Getenv("MUDITA_BACKUP_DIR"); v != "" {
		cfg.BackupDir = v
	}
	if v := os.Getenv("MUDITA_BACKUP_INTERVAL_HOURS"); v != "" {
		h, err := strconv.Atoi(v)
		if err != nil {
			return cfg, fmt.Errorf("MUDITA_BACKUP_INTERVAL_HOURS: %w", err)
		}
		cfg.BackupIntervalHours = h
	}

	return cfg, nil
}

func (c Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// ResolvePath makes relative paths absolute against baseDir (usually install / cwd).
func ResolvePath(baseDir, p string) string {
	if p == "" {
		return p
	}
	if filepath.IsAbs(p) {
		return filepath.Clean(p)
	}
	return filepath.Clean(filepath.Join(baseDir, p))
}
