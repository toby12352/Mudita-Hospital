package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
)

// stockUnitToItemCodePrefix maps the innermost stock unit to a 3-letter catalog prefix.
func stockUnitToItemCodePrefix(unit string) string {
	switch strings.TrimSpace(unit) {
	case "Tablet":
		return "TAB"
	case "Capsule":
		return "CAP"
	case "Vial":
		return "VIA"
	case "Ampoule":
		return "AMP"
	case "Bottle":
		return "BTL"
	case "Sachet":
		return "SAC"
	case "Tube":
		return "TUB"
	case "Puff":
		return "PUF"
	case "mL":
		return "MLL"
	case "g":
		return "GRM"
	case "oz":
		return "ONZ"
	case "Bag":
		return "BAG"
	case "Strip":
		return "STR"
	case "Card":
		return "CRD"
	case "Box":
		return "BOX"
	case "Carton":
		return "CTN"
	case "Pack":
		return "PCK"
	case "Piece":
		return "PCE"
	case "Each":
		return "EAC"
	case "Pairs":
		return "PAR"
	case "Cylinder":
		return "CYL"
	default:
		return "OTH"
	}
}

func formatItemCode(prefix string, n int64) string {
	if n < 10000 {
		return fmt.Sprintf("%s-%04d", prefix, n)
	}
	return fmt.Sprintf("%s-%d", prefix, n)
}

type itemCodeCounterQuerier interface {
	QueryRow(query string, args ...any) *sql.Row
	Exec(query string, args ...any) (sql.Result, error)
}

// peekNextItemCode returns the next code for unit without incrementing the counter.
func peekNextItemCode(q itemCodeCounterQuerier, unit string) (string, error) {
	prefix := stockUnitToItemCodePrefix(unit)
	var last int64
	err := q.QueryRow(`SELECT last_n FROM item_code_counters WHERE prefix = ?`, prefix).Scan(&last)
	if err == sql.ErrNoRows {
		return formatItemCode(prefix, 1), nil
	}
	if err != nil {
		return "", err
	}
	return formatItemCode(prefix, last+1), nil
}

// allocateNextItemCode increments the counter for unit and returns the assigned code.
// Must run inside the same transaction as the items INSERT.
func allocateNextItemCode(tx *sql.Tx, unit string) (string, error) {
	prefix := stockUnitToItemCodePrefix(unit)
	res, err := tx.Exec(`
		INSERT INTO item_code_counters (prefix, last_n) VALUES (?, 1)
		ON CONFLICT(prefix) DO UPDATE SET last_n = last_n + 1
	`, prefix)
	if err != nil {
		return "", err
	}
	_ = res
	var n int64
	if err := tx.QueryRow(`SELECT last_n FROM item_code_counters WHERE prefix = ?`, prefix).Scan(&n); err != nil {
		return "", err
	}
	return formatItemCode(prefix, n), nil
}

func (h *Pharmacy) nextItemCode(w http.ResponseWriter, r *http.Request) {
	unit := strings.TrimSpace(r.URL.Query().Get("unit"))
	if unit == "" {
		unit = "Tablet"
	}
	code, err := peekNextItemCode(h.DB, unit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "next code failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"code": code, "unit": unit})
}
