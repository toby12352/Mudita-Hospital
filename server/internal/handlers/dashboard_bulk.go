package handlers

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

type auditLogRow struct {
	ID            int64   `json:"id"`
	ActorUserID   *int64  `json:"actor_user_id,omitempty"`
	ActorUsername string  `json:"actor_username,omitempty"`
	Action        string  `json:"action"`
	Entity        string  `json:"entity"`
	EntityID      *int64  `json:"entity_id,omitempty"`
	Detail        *string `json:"detail,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

func (h *Dashboard) listAudit(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := strings.TrimSpace(r.URL.Query().Get("limit")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 500 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "limit must be 1–500"})
			return
		}
		limit = n
	}
	entity := strings.TrimSpace(r.URL.Query().Get("entity"))
	action := strings.TrimSpace(r.URL.Query().Get("action"))
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	var args []any
	var where []string
	if entity != "" {
		where = append(where, "a.entity = ?")
		args = append(args, entity)
	}
	if action != "" {
		where = append(where, "a.action = ?")
		args = append(args, action)
	}
	if q != "" {
		like := "%" + q + "%"
		where = append(where, `(COALESCE(u.username, '') LIKE ? OR a.entity LIKE ? OR a.action LIKE ? OR COALESCE(a.detail, '') LIKE ?)`)
		args = append(args, like, like, like, like)
	}
	sqlStr := `
		SELECT a.id, a.actor_user_id, COALESCE(u.username, ''), a.action, a.entity, a.entity_id, a.detail, a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_user_id
	`
	if len(where) > 0 {
		sqlStr += " WHERE " + strings.Join(where, " AND ")
	}
	sqlStr += " ORDER BY a.id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := h.DB.Query(sqlStr, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "audit list failed"})
		return
	}
	defer rows.Close()

	out := make([]auditLogRow, 0)
	for rows.Next() {
		var row auditLogRow
		var actorID sql.NullInt64
		var entityID sql.NullInt64
		var detail sql.NullString
		if err := rows.Scan(&row.ID, &actorID, &row.ActorUsername, &row.Action, &row.Entity, &entityID, &detail, &row.CreatedAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "audit scan failed"})
			return
		}
		if actorID.Valid {
			v := actorID.Int64
			row.ActorUserID = &v
		}
		if entityID.Valid {
			v := entityID.Int64
			row.EntityID = &v
		}
		if detail.Valid {
			s := detail.String
			row.Detail = &s
		}
		out = append(out, row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"logs": out, "limit": limit})
}

type bulkItemsRequest struct {
	Confirm      string  `json:"confirm"`
	Reason       string  `json:"reason"`
	IDs          []int64 `json:"ids"`
	BuyPriceMMK  *int64  `json:"buy_price_mmk,omitempty"`
	SellPriceMMK *int64  `json:"sell_price_mmk,omitempty"`
	ReorderLevel *int64  `json:"reorder_level,omitempty"`
}

type bulkServicesRequest struct {
	Confirm  string  `json:"confirm"`
	Reason   string  `json:"reason"`
	IDs      []int64 `json:"ids"`
	PriceMMK *int64  `json:"price_mmk,omitempty"`
}

type bulkDoctorsRequest struct {
	Confirm         string  `json:"confirm"`
	Reason          string  `json:"reason"`
	IDs             []int64 `json:"ids"`
	ConsultationMMK *int64  `json:"consultation_mmk,omitempty"`
	OTMMK           *int64  `json:"ot_mmk,omitempty"`
}

func requireBulkConfirm(confirm, reason string) string {
	if strings.TrimSpace(confirm) != "UPDATE" {
		return "confirm must be UPDATE"
	}
	if strings.TrimSpace(reason) == "" {
		return "reason is required"
	}
	if len(strings.TrimSpace(reason)) > 500 {
		return "reason too long"
	}
	return ""
}

func (h *Dashboard) bulkItems(w http.ResponseWriter, r *http.Request) {
	var req bulkItemsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if msg := requireBulkConfirm(req.Confirm, req.Reason); msg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
		return
	}
	if len(req.IDs) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "ids required"})
		return
	}
	if req.BuyPriceMMK == nil && req.SellPriceMMK == nil && req.ReorderLevel == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "set buy_price_mmk, sell_price_mmk, and/or reorder_level"})
		return
	}
	if req.BuyPriceMMK != nil && *req.BuyPriceMMK < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "buy_price_mmk must be >= 0"})
		return
	}
	if req.SellPriceMMK != nil && *req.SellPriceMMK < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sell_price_mmk must be >= 0"})
		return
	}
	if req.ReorderLevel != nil && *req.ReorderLevel < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "reorder_level must be >= 0"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	updated := 0
	for _, id := range req.IDs {
		var buy, sell, reorder int64
		err := tx.QueryRow(`SELECT buy_price_mmk, sell_price_mmk, reorder_level FROM items WHERE id = ?`, id).
			Scan(&buy, &sell, &reorder)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("item id %d not found", id)})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup failed"})
			return
		}
		if req.BuyPriceMMK != nil {
			buy = *req.BuyPriceMMK
		}
		if req.SellPriceMMK != nil {
			sell = *req.SellPriceMMK
		}
		if req.ReorderLevel != nil {
			reorder = *req.ReorderLevel
		}
		res, err := tx.Exec(`
			UPDATE items SET buy_price_mmk = ?, sell_price_mmk = ?, reorder_level = ?, updated_at = datetime('now')
			WHERE id = ?
		`, buy, sell, reorder, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
			return
		}
		n, _ := res.RowsAffected()
		updated += int(n)
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	detail := map[string]any{
		"reason": strings.TrimSpace(req.Reason),
		"ids":    req.IDs,
		"count":  updated,
	}
	if req.BuyPriceMMK != nil {
		detail["buy_price_mmk"] = *req.BuyPriceMMK
	}
	if req.SellPriceMMK != nil {
		detail["sell_price_mmk"] = *req.SellPriceMMK
	}
	if req.ReorderLevel != nil {
		detail["reorder_level"] = *req.ReorderLevel
	}
	audit.WriteAudit(h.DB, &uid, "bulk_update", "item", nil, detail)
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "updated": updated})
}

func (h *Dashboard) bulkServices(w http.ResponseWriter, r *http.Request) {
	var req bulkServicesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if msg := requireBulkConfirm(req.Confirm, req.Reason); msg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
		return
	}
	if len(req.IDs) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "ids required"})
		return
	}
	if req.PriceMMK == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "price_mmk required"})
		return
	}
	if *req.PriceMMK < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "price_mmk must be >= 0"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	updated := 0
	for _, id := range req.IDs {
		var exists int
		err := tx.QueryRow(`SELECT 1 FROM services WHERE id = ?`, id).Scan(&exists)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("service id %d not found", id)})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup failed"})
			return
		}
		res, err := tx.Exec(`
			UPDATE services SET price_mmk = ?, updated_at = datetime('now') WHERE id = ?
		`, *req.PriceMMK, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
			return
		}
		n, _ := res.RowsAffected()
		updated += int(n)
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "bulk_update", "service", nil, map[string]any{
		"reason": strings.TrimSpace(req.Reason), "ids": req.IDs, "price_mmk": *req.PriceMMK, "count": updated,
	})
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "updated": updated})
}

func (h *Dashboard) bulkDoctors(w http.ResponseWriter, r *http.Request) {
	var req bulkDoctorsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if msg := requireBulkConfirm(req.Confirm, req.Reason); msg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
		return
	}
	if len(req.IDs) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "ids required"})
		return
	}
	if req.ConsultationMMK == nil && req.OTMMK == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "set consultation_mmk and/or ot_mmk"})
		return
	}
	if req.ConsultationMMK != nil && *req.ConsultationMMK < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "consultation_mmk must be >= 0"})
		return
	}
	if req.OTMMK != nil && *req.OTMMK < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "ot_mmk must be >= 0"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	updated := 0
	for _, id := range req.IDs {
		var exists int
		err := tx.QueryRow(`SELECT 1 FROM doctors WHERE id = ?`, id).Scan(&exists)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("doctor id %d not found", id)})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup failed"})
			return
		}
		if req.ConsultationMMK != nil {
			if err := upsertFeeTx(tx, id, "consultation", *req.ConsultationMMK); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "fees failed"})
				return
			}
		}
		if req.OTMMK != nil {
			if err := upsertFeeTx(tx, id, "ot", *req.OTMMK); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "fees failed"})
				return
			}
		}
		_, _ = tx.Exec(`UPDATE doctors SET updated_at = datetime('now') WHERE id = ?`, id)
		updated++
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	detail := map[string]any{
		"reason": strings.TrimSpace(req.Reason),
		"ids":    req.IDs,
		"count":  updated,
	}
	if req.ConsultationMMK != nil {
		detail["consultation_mmk"] = *req.ConsultationMMK
	}
	if req.OTMMK != nil {
		detail["ot_mmk"] = *req.OTMMK
	}
	audit.WriteAudit(h.DB, &uid, "bulk_update", "doctor", nil, detail)
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "updated": updated})
}

func upsertFeeTx(tx *sql.Tx, doctorID int64, feeType string, amount int64) error {
	_, err := tx.Exec(`
		INSERT INTO doctor_fees (doctor_id, fee_type, amount_mmk, updated_at)
		VALUES (?, ?, ?, datetime('now'))
		ON CONFLICT(doctor_id, fee_type) DO UPDATE SET
			amount_mmk = excluded.amount_mmk,
			updated_at = datetime('now')
	`, doctorID, feeType, amount)
	return err
}

func writeCSV(w http.ResponseWriter, filename string, header []string, rows [][]string) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	cw := csv.NewWriter(w)
	_ = cw.Write(header)
	for _, row := range rows {
		_ = cw.Write(row)
	}
	cw.Flush()
}

func (h *Dashboard) exportItemsCSV(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(`
		SELECT code, name, category, buy_price_mmk, sell_price_mmk, reorder_level, active
		FROM items ORDER BY code COLLATE NOCASE
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "export failed"})
		return
	}
	defer rows.Close()
	out := make([][]string, 0)
	for rows.Next() {
		var code, name, category string
		var buy, sell, reorder int64
		var active int
		if err := rows.Scan(&code, &name, &category, &buy, &sell, &reorder, &active); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "export scan failed"})
			return
		}
		out = append(out, []string{
			code, name, category,
			strconv.FormatInt(buy, 10), strconv.FormatInt(sell, 10), strconv.FormatInt(reorder, 10),
			strconv.Itoa(active),
		})
	}
	writeCSV(w, "mudita-items.csv",
		[]string{"code", "name", "category", "buy_price_mmk", "sell_price_mmk", "reorder_level", "active"},
		out)
}

func (h *Dashboard) exportServicesCSV(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(`
		SELECT code, name, price_mmk, active FROM services ORDER BY code COLLATE NOCASE
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "export failed"})
		return
	}
	defer rows.Close()
	out := make([][]string, 0)
	for rows.Next() {
		var code, name string
		var price int64
		var active int
		if err := rows.Scan(&code, &name, &price, &active); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "export scan failed"})
			return
		}
		out = append(out, []string{code, name, strconv.FormatInt(price, 10), strconv.Itoa(active)})
	}
	writeCSV(w, "mudita-services.csv", []string{"code", "name", "price_mmk", "active"}, out)
}

func (h *Dashboard) exportDoctorsCSV(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(`
		SELECT d.id, d.name, d.specialty,
		       COALESCE(c.amount_mmk, 0), COALESCE(o.amount_mmk, 0), d.active
		FROM doctors d
		LEFT JOIN doctor_fees c ON c.doctor_id = d.id AND c.fee_type = 'consultation'
		LEFT JOIN doctor_fees o ON o.doctor_id = d.id AND o.fee_type = 'ot'
		ORDER BY d.name COLLATE NOCASE
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "export failed"})
		return
	}
	defer rows.Close()
	out := make([][]string, 0)
	for rows.Next() {
		var id, consult, ot int64
		var name, specialty string
		var active int
		if err := rows.Scan(&id, &name, &specialty, &consult, &ot, &active); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "export scan failed"})
			return
		}
		out = append(out, []string{
			strconv.FormatInt(id, 10), name, specialty,
			strconv.FormatInt(consult, 10), strconv.FormatInt(ot, 10), strconv.Itoa(active),
		})
	}
	writeCSV(w, "mudita-doctors.csv",
		[]string{"id", "name", "specialty", "consultation_mmk", "ot_mmk", "active"},
		out)
}

type csvImportRequest struct {
	Confirm string `json:"confirm"`
	Reason  string `json:"reason"`
	DryRun  bool   `json:"dry_run"`
	CSV     string `json:"csv"`
}

type csvImportError struct {
	Line    int    `json:"line"`
	Message string `json:"message"`
}

type csvImportResult struct {
	DryRun   bool             `json:"dry_run"`
	Valid    int              `json:"valid"`
	Applied  int              `json:"applied"`
	Errors   []csvImportError `json:"errors"`
	WouldOK  bool             `json:"would_ok"`
	Status   string           `json:"status,omitempty"`
}

func requireImportConfirm(dryRun bool, confirm, reason string) string {
	if dryRun {
		return ""
	}
	if strings.TrimSpace(confirm) != "IMPORT" {
		return "confirm must be IMPORT"
	}
	if strings.TrimSpace(reason) == "" {
		return "reason is required"
	}
	return ""
}

func parseCSVBody(raw string) ([][]string, error) {
	r := csv.NewReader(strings.NewReader(raw))
	r.TrimLeadingSpace = true
	r.FieldsPerRecord = -1
	all, err := r.ReadAll()
	if err != nil {
		return nil, err
	}
	return all, nil
}

func headerIndex(header []string, name string) int {
	want := strings.ToLower(strings.TrimSpace(name))
	for i, h := range header {
		if strings.ToLower(strings.TrimSpace(h)) == want {
			return i
		}
	}
	return -1
}

func cell(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

func parseNonNegInt(s string, field string) (int64, string) {
	if s == "" {
		return 0, field + " required"
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0, field + " must be an integer"
	}
	if n < 0 {
		return 0, field + " must be >= 0"
	}
	return n, ""
}

func parseActive01(s string) (int, string) {
	if s == "" {
		return 1, ""
	}
	n, err := strconv.Atoi(s)
	if err != nil || (n != 0 && n != 1) {
		return 0, "active must be 0 or 1"
	}
	return n, ""
}

func (h *Dashboard) importItemsCSV(w http.ResponseWriter, r *http.Request) {
	var req csvImportRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if msg := requireImportConfirm(req.DryRun, req.Confirm, req.Reason); msg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
		return
	}
	all, err := parseCSVBody(req.CSV)
	if err != nil || len(all) < 2 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "csv must include header and at least one data row"})
		return
	}
	header := all[0]
	iCode := headerIndex(header, "code")
	iName := headerIndex(header, "name")
	iCat := headerIndex(header, "category")
	iBuy := headerIndex(header, "buy_price_mmk")
	iSell := headerIndex(header, "sell_price_mmk")
	iReorder := headerIndex(header, "reorder_level")
	iActive := headerIndex(header, "active")
	if iCode < 0 || iBuy < 0 || iSell < 0 || iReorder < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "csv header must include code, buy_price_mmk, sell_price_mmk, reorder_level",
		})
		return
	}

	type rowPlan struct {
		line     int
		id       int64
		name     string
		category string
		buy      int64
		sell     int64
		reorder  int64
		active   int
	}
	plans := make([]rowPlan, 0)
	errs := make([]csvImportError, 0)

	for li, row := range all[1:] {
		line := li + 2
		if len(row) == 1 && strings.TrimSpace(row[0]) == "" {
			continue
		}
		code := strings.ToUpper(cell(row, iCode))
		if code == "" {
			errs = append(errs, csvImportError{Line: line, Message: "code required"})
			continue
		}
		buy, msg := parseNonNegInt(cell(row, iBuy), "buy_price_mmk")
		if msg != "" {
			errs = append(errs, csvImportError{Line: line, Message: msg})
			continue
		}
		sell, msg := parseNonNegInt(cell(row, iSell), "sell_price_mmk")
		if msg != "" {
			errs = append(errs, csvImportError{Line: line, Message: msg})
			continue
		}
		reorder, msg := parseNonNegInt(cell(row, iReorder), "reorder_level")
		if msg != "" {
			errs = append(errs, csvImportError{Line: line, Message: msg})
			continue
		}
		active, msg := parseActive01(cell(row, iActive))
		if msg != "" {
			errs = append(errs, csvImportError{Line: line, Message: msg})
			continue
		}
		var id int64
		var curName, curCat string
		err := h.DB.QueryRow(`SELECT id, name, category FROM items WHERE code = ? COLLATE NOCASE`, code).
			Scan(&id, &curName, &curCat)
		if err == sql.ErrNoRows {
			errs = append(errs, csvImportError{Line: line, Message: "unknown code " + code + " (create items in clinic app first)"})
			continue
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup failed"})
			return
		}
		name := curName
		if iName >= 0 && cell(row, iName) != "" {
			name = cell(row, iName)
		}
		category := curCat
		if iCat >= 0 && cell(row, iCat) != "" {
			category = cell(row, iCat)
		}
		plans = append(plans, rowPlan{line: line, id: id, name: name, category: category, buy: buy, sell: sell, reorder: reorder, active: active})
	}

	result := csvImportResult{DryRun: req.DryRun, Valid: len(plans), Errors: errs, WouldOK: len(errs) == 0 && len(plans) > 0}
	if req.DryRun || len(errs) > 0 || len(plans) == 0 {
		if result.Errors == nil {
			result.Errors = []csvImportError{}
		}
		writeJSON(w, http.StatusOK, result)
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()
	for _, p := range plans {
		_, err := tx.Exec(`
			UPDATE items SET name = ?, category = ?, buy_price_mmk = ?, sell_price_mmk = ?, reorder_level = ?,
			  active = ?, updated_at = datetime('now')
			WHERE id = ?
		`, p.name, p.category, p.buy, p.sell, p.reorder, p.active, p.id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}
	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "csv_import", "item", nil, map[string]any{
		"reason": strings.TrimSpace(req.Reason), "applied": len(plans),
	})
	result.Applied = len(plans)
	result.Status = "ok"
	writeJSON(w, http.StatusOK, result)
}

func (h *Dashboard) importServicesCSV(w http.ResponseWriter, r *http.Request) {
	var req csvImportRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if msg := requireImportConfirm(req.DryRun, req.Confirm, req.Reason); msg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
		return
	}
	all, err := parseCSVBody(req.CSV)
	if err != nil || len(all) < 2 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "csv must include header and at least one data row"})
		return
	}
	header := all[0]
	iCode := headerIndex(header, "code")
	iName := headerIndex(header, "name")
	iPrice := headerIndex(header, "price_mmk")
	iActive := headerIndex(header, "active")
	if iCode < 0 || iPrice < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "csv header must include code, price_mmk"})
		return
	}

	type rowPlan struct {
		line   int
		id     int64
		name   string
		price  int64
		active int
	}
	plans := make([]rowPlan, 0)
	errs := make([]csvImportError, 0)

	for li, row := range all[1:] {
		line := li + 2
		if len(row) == 1 && strings.TrimSpace(row[0]) == "" {
			continue
		}
		code := strings.ToUpper(cell(row, iCode))
		if code == "" {
			errs = append(errs, csvImportError{Line: line, Message: "code required"})
			continue
		}
		price, msg := parseNonNegInt(cell(row, iPrice), "price_mmk")
		if msg != "" {
			errs = append(errs, csvImportError{Line: line, Message: msg})
			continue
		}
		active, msg := parseActive01(cell(row, iActive))
		if msg != "" {
			errs = append(errs, csvImportError{Line: line, Message: msg})
			continue
		}
		var id int64
		var curName string
		err := h.DB.QueryRow(`SELECT id, name FROM services WHERE code = ? COLLATE NOCASE`, code).Scan(&id, &curName)
		if err == sql.ErrNoRows {
			errs = append(errs, csvImportError{Line: line, Message: "unknown code " + code})
			continue
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup failed"})
			return
		}
		name := curName
		if iName >= 0 && cell(row, iName) != "" {
			name = cell(row, iName)
		}
		plans = append(plans, rowPlan{line: line, id: id, name: name, price: price, active: active})
	}

	result := csvImportResult{DryRun: req.DryRun, Valid: len(plans), Errors: errs, WouldOK: len(errs) == 0 && len(plans) > 0}
	if req.DryRun || len(errs) > 0 || len(plans) == 0 {
		if result.Errors == nil {
			result.Errors = []csvImportError{}
		}
		writeJSON(w, http.StatusOK, result)
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()
	for _, p := range plans {
		_, err := tx.Exec(`
			UPDATE services SET name = ?, price_mmk = ?, active = ?, updated_at = datetime('now') WHERE id = ?
		`, p.name, p.price, p.active, p.id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}
	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "csv_import", "service", nil, map[string]any{
		"reason": strings.TrimSpace(req.Reason), "applied": len(plans),
	})
	result.Applied = len(plans)
	result.Status = "ok"
	writeJSON(w, http.StatusOK, result)
}

func (h *Dashboard) importDoctorsCSV(w http.ResponseWriter, r *http.Request) {
	var req csvImportRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if msg := requireImportConfirm(req.DryRun, req.Confirm, req.Reason); msg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
		return
	}
	all, err := parseCSVBody(req.CSV)
	if err != nil || len(all) < 2 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "csv must include header and at least one data row"})
		return
	}
	header := all[0]
	iID := headerIndex(header, "id")
	iName := headerIndex(header, "name")
	iSpec := headerIndex(header, "specialty")
	iConsult := headerIndex(header, "consultation_mmk")
	iOT := headerIndex(header, "ot_mmk")
	iActive := headerIndex(header, "active")
	if iID < 0 || iConsult < 0 || iOT < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "csv header must include id, consultation_mmk, ot_mmk",
		})
		return
	}

	type rowPlan struct {
		line     int
		id       int64
		name     string
		specialty string
		consult  int64
		ot       int64
		active   int
	}
	plans := make([]rowPlan, 0)
	errs := make([]csvImportError, 0)

	for li, row := range all[1:] {
		line := li + 2
		if len(row) == 1 && strings.TrimSpace(row[0]) == "" {
			continue
		}
		id, msg := parseNonNegInt(cell(row, iID), "id")
		if msg != "" || id == 0 {
			errs = append(errs, csvImportError{Line: line, Message: "valid id required"})
			continue
		}
		consult, msg := parseNonNegInt(cell(row, iConsult), "consultation_mmk")
		if msg != "" {
			errs = append(errs, csvImportError{Line: line, Message: msg})
			continue
		}
		ot, msg := parseNonNegInt(cell(row, iOT), "ot_mmk")
		if msg != "" {
			errs = append(errs, csvImportError{Line: line, Message: msg})
			continue
		}
		active, msg := parseActive01(cell(row, iActive))
		if msg != "" {
			errs = append(errs, csvImportError{Line: line, Message: msg})
			continue
		}
		var curName, curSpec string
		err := h.DB.QueryRow(`SELECT name, specialty FROM doctors WHERE id = ?`, id).Scan(&curName, &curSpec)
		if err == sql.ErrNoRows {
			errs = append(errs, csvImportError{Line: line, Message: fmt.Sprintf("unknown doctor id %d", id)})
			continue
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup failed"})
			return
		}
		name := curName
		if iName >= 0 && cell(row, iName) != "" {
			name = cell(row, iName)
		}
		spec := curSpec
		if iSpec >= 0 && cell(row, iSpec) != "" {
			spec = cell(row, iSpec)
		}
		plans = append(plans, rowPlan{line: line, id: id, name: name, specialty: spec, consult: consult, ot: ot, active: active})
	}

	result := csvImportResult{DryRun: req.DryRun, Valid: len(plans), Errors: errs, WouldOK: len(errs) == 0 && len(plans) > 0}
	if req.DryRun || len(errs) > 0 || len(plans) == 0 {
		if result.Errors == nil {
			result.Errors = []csvImportError{}
		}
		writeJSON(w, http.StatusOK, result)
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()
	for _, p := range plans {
		_, err := tx.Exec(`
			UPDATE doctors SET name = ?, specialty = ?, active = ?, updated_at = datetime('now') WHERE id = ?
		`, p.name, p.specialty, p.active, p.id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
			return
		}
		if err := upsertFeeTx(tx, p.id, "consultation", p.consult); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "fees failed"})
			return
		}
		if err := upsertFeeTx(tx, p.id, "ot", p.ot); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "fees failed"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}
	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "csv_import", "doctor", nil, map[string]any{
		"reason": strings.TrimSpace(req.Reason), "applied": len(plans),
	})
	result.Applied = len(plans)
	result.Status = "ok"
	writeJSON(w, http.StatusOK, result)
}
