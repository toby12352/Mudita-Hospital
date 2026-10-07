package backup

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const pendingRestoreName = "pending_restore.json"

// Info describes one backup file on disk.
type Info struct {
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	SizeBytes int64     `json:"size_bytes"`
	CreatedAt time.Time `json:"created_at"`
}

type pendingRestore struct {
	Source string `json:"source"`
	At     string `json:"at"`
}

// EnsureDir creates the backup directory if needed.
func EnsureDir(dir string) error {
	if dir == "" {
		return fmt.Errorf("backup_dir empty")
	}
	return os.MkdirAll(dir, 0o755)
}

// Create uses VACUUM INTO for a consistent online copy of the live DB.
func Create(db *sql.DB, backupDir string) (Info, error) {
	if err := EnsureDir(backupDir); err != nil {
		return Info{}, err
	}
	name := fmt.Sprintf("mudita-%s.db", time.Now().Format("20060102-150405"))
	dest := filepath.Join(backupDir, name)

	// VACUUM INTO needs a path SQLite accepts (forward slashes are fine on Windows).
	escaped := strings.ReplaceAll(filepath.ToSlash(dest), "'", "''")
	if _, err := db.Exec(fmt.Sprintf(`VACUUM INTO '%s'`, escaped)); err != nil {
		_ = os.Remove(dest)
		return Info{}, fmt.Errorf("vacuum into: %w", err)
	}

	st, err := os.Stat(dest)
	if err != nil {
		return Info{}, err
	}
	return Info{
		Name:      name,
		Path:      dest,
		SizeBytes: st.Size(),
		CreatedAt: st.ModTime().UTC(),
	}, nil
}

// List returns backups newest-first (*.db in backupDir).
func List(backupDir string) ([]Info, error) {
	if err := EnsureDir(backupDir); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		return nil, err
	}
	var out []Info
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(strings.ToLower(name), ".db") {
			continue
		}
		if strings.EqualFold(name, pendingRestoreName) {
			continue
		}
		path := filepath.Join(backupDir, name)
		st, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, Info{
			Name:      name,
			Path:      path,
			SizeBytes: st.Size(),
			CreatedAt: st.ModTime().UTC(),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out, nil
}

// ResolveInDir ensures name is a basename inside backupDir (no path traversal).
func ResolveInDir(backupDir, name string) (string, error) {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "" || name == "." || name == ".." {
		return "", fmt.Errorf("invalid backup name")
	}
	if !strings.HasSuffix(strings.ToLower(name), ".db") {
		return "", fmt.Errorf("backup must be a .db file")
	}
	full := filepath.Join(backupDir, name)
	absDir, err := filepath.Abs(backupDir)
	if err != nil {
		return "", err
	}
	absFile, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(absDir, absFile)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("backup outside backup_dir")
	}
	if _, err := os.Stat(absFile); err != nil {
		return "", fmt.Errorf("backup not found")
	}
	return absFile, nil
}

// WritePendingRestore queues a restore applied on next process start (before DB open).
func WritePendingRestore(backupDir, sourcePath string) error {
	if err := EnsureDir(backupDir); err != nil {
		return err
	}
	payload, err := json.Marshal(pendingRestore{
		Source: sourcePath,
		At:     time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(backupDir, pendingRestoreName), payload, 0o644)
}

// ApplyPendingIfAny replaces dbPath with the queued backup, then clears the marker.
// Call before opening the live database. Returns true if a restore was applied.
func ApplyPendingIfAny(backupDir, dbPath string) (bool, error) {
	marker := filepath.Join(backupDir, pendingRestoreName)
	data, err := os.ReadFile(marker)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	var p pendingRestore
	if err := json.Unmarshal(data, &p); err != nil {
		_ = os.Remove(marker)
		return false, fmt.Errorf("corrupt pending restore: %w", err)
	}
	src := strings.TrimSpace(p.Source)
	if src == "" {
		_ = os.Remove(marker)
		return false, fmt.Errorf("pending restore missing source")
	}
	if _, err := os.Stat(src); err != nil {
		_ = os.Remove(marker)
		return false, fmt.Errorf("pending restore source missing: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return false, err
	}
	// Remove live DB + WAL sidecars so SQLite starts clean from the restored file.
	for _, suffix := range []string{"", "-wal", "-shm"} {
		_ = os.Remove(dbPath + suffix)
	}
	if err := copyFile(src, dbPath); err != nil {
		return false, fmt.Errorf("copy restore: %w", err)
	}
	_ = os.Remove(marker)
	return true, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	tmp := dst + ".tmp"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return closeErr
	}
	return os.Rename(tmp, dst)
}
