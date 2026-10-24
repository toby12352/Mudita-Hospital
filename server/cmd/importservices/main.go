// Command importservices inserts OPD services from a review CSV into SQLite.
// Default is dry-run. Use -apply to write (after backup).
package main

import (
	"database/sql"
	"encoding/csv"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"mudita-hospital/server/internal/audit"

	_ "modernc.org/sqlite"
)

type row struct {
	Section    string
	Particular string
	PriceMMK   int64
	Name       string
	Code       string
	Line       int
}

func main() {
	csvPath := flag.String("csv", "", "path to opd-services.csv")
	dbPath := flag.String("db", "", "path to mudita.db (must already exist)")
	apply := flag.Bool("apply", false, "insert rows (default: dry-run only)")
	flag.Parse()

	if strings.TrimSpace(*csvPath) == "" || strings.TrimSpace(*dbPath) == "" {
		fmt.Fprintln(os.Stderr, "usage: importservices -csv path/to/opd-services.csv -db path/to/mudita.db [-apply]")
		os.Exit(2)
	}

	rows, err := loadCSV(*csvPath)
	if err != nil {
		fatal(err)
	}
	if len(rows) == 0 {
		fatal(fmt.Errorf("no data rows in %s", *csvPath))
	}

	summary(rows)

	if _, err := os.Stat(*dbPath); err != nil {
		if os.IsNotExist(err) {
			fatal(fmt.Errorf("database file does not exist: %s (refusing to create a new hospital DB)", *dbPath))
		}
		fatal(err)
	}

	db, err := openDB(*dbPath)
	if err != nil {
		fatal(err)
	}
	defer db.Close()

	if err := checkConflicts(db, rows); err != nil {
		fatal(err)
	}

	if !*apply {
		fmt.Println("dry-run OK — no changes written. Re-run with -apply to insert.")
		return
	}

	backup, err := backupDB(*dbPath)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("backup: %s\n", backup)

	if err := insertAll(db, rows); err != nil {
		fatal(err)
	}
	fmt.Printf("applied %d services\n", len(rows))
}

func loadCSV(path string) ([]row, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	idx := map[string]int{}
	for i, h := range header {
		idx[strings.ToLower(strings.TrimSpace(h))] = i
	}
	for _, need := range []string{"section", "particular", "price_mmk", "name", "code"} {
		if _, ok := idx[need]; !ok {
			return nil, fmt.Errorf("csv missing column %q", need)
		}
	}
	out := make([]row, 0)
	line := 1
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		line++
		cell := func(k string) string {
			i := idx[k]
			if i >= len(rec) {
				return ""
			}
			return strings.TrimSpace(rec[i])
		}
		code := strings.ToUpper(cell("code"))
		name := cell("name")
		particular := cell("particular")
		section := cell("section")
		priceStr := cell("price_mmk")
		if code == "" && name == "" && particular == "" {
			continue
		}
		if code == "" || name == "" {
			return nil, fmt.Errorf("line %d: code and name required", line)
		}
		price, err := strconv.ParseInt(priceStr, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("line %d: bad price_mmk %q", line, priceStr)
		}
		if price < 0 {
			return nil, fmt.Errorf("line %d: price_mmk must be >= 0 (got %d)", line, price)
		}
		out = append(out, row{
			Section: section, Particular: particular, PriceMMK: price,
			Name: name, Code: code, Line: line,
		})
	}
	return out, nil
}

func summary(rows []row) {
	bySec := map[string]int{}
	zeros := 0
	var top []row
	for _, r := range rows {
		bySec[r.Section]++
		if r.PriceMMK == 0 {
			zeros++
		}
		top = append(top, r)
	}
	// sort top prices descending (simple insertion for small n)
	for i := 0; i < len(top); i++ {
		for j := i + 1; j < len(top); j++ {
			if top[j].PriceMMK > top[i].PriceMMK {
				top[i], top[j] = top[j], top[i]
			}
		}
	}
	fmt.Printf("rows: %d\n", len(rows))
	fmt.Println("by section:")
	for _, sec := range sortedKeys(bySec) {
		fmt.Printf("  %s: %d\n", sec, bySec[sec])
	}
	fmt.Printf("zero prices: %d\n", zeros)
	fmt.Println("highest prices:")
	n := 15
	if len(top) < n {
		n = len(top)
	}
	for i := 0; i < n; i++ {
		fmt.Printf("  %10d  %s  [%s]\n", top[i].PriceMMK, top[i].Name, top[i].Code)
	}
	// disambiguated names (contain " (")
	dis := 0
	for _, r := range rows {
		if strings.Contains(r.Name, " (") {
			dis++
		}
	}
	fmt.Printf("disambiguated names: %d\n", dis)
}

func sortedKeys(m map[string]int) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	for i := 0; i < len(keys); i++ {
		for j := i + 1; j < len(keys); j++ {
			if keys[j] < keys[i] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
	return keys
}

func openDB(path string) (*sql.DB, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", filepath.ToSlash(path))
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func checkConflicts(db *sql.DB, rows []row) error {
	seen := map[string]int{}
	for _, r := range rows {
		if prev, ok := seen[r.Code]; ok {
			return fmt.Errorf("duplicate code in CSV: %s (lines %d and %d)", r.Code, prev, r.Line)
		}
		seen[r.Code] = r.Line
		var id int64
		err := db.QueryRow(`SELECT id FROM services WHERE code = ? COLLATE NOCASE`, r.Code).Scan(&id)
		if err == nil {
			return fmt.Errorf("code already exists in DB: %s (id %d) — aborting, no changes", r.Code, id)
		}
		if err != sql.ErrNoRows {
			return err
		}
	}
	fmt.Printf("conflict check OK (%d new codes)\n", len(rows))
	return nil
}

func backupDB(path string) (string, error) {
	dir := filepath.Dir(path)
	stamp := time.Now().Format("20060102-150405")
	dest := filepath.Join(dir, fmt.Sprintf("mudita.db.pre-opd-import-%s", stamp))
	in, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer in.Close()
	out, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return "", err
	}
	// also copy WAL/SHM if present
	for _, suf := range []string{"-wal", "-shm"} {
		src := path + suf
		if _, err := os.Stat(src); err == nil {
			_ = copyFile(src, dest+suf)
		}
	}
	return dest, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func insertAll(db *sql.DB, rows []row) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO services (code, name, price_mmk, active) VALUES (?, ?, ?, 1)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, r := range rows {
		if _, err := stmt.Exec(r.Code, r.Name, r.PriceMMK); err != nil {
			return fmt.Errorf("insert %s: %w", r.Code, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}

	n := len(rows)
	audit.WriteAudit(db, nil, "csv_import", "service", nil, map[string]any{
		"reason":  "one-time OPD procedures printout import",
		"applied": n,
		"source":  "content/OPD Services/opd-services.csv",
	})
	return nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
