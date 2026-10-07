package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// Pharmacy handles inventory items, batches, restock, and stock movements.
// Stock on hand = SUM(item_batches.qty) at a location (default MAIN).
// FEFO (earliest expiry first) is used for Admin adjust-down without batch_id
// and for OPD cash-pay SALE deduct in handlers/opd.go.
type Pharmacy struct {
	DB *sql.DB
}

var itemCategories = map[string]bool{
	"Injection": true,
	"OPD":       true,
	"OT":        true,
	"Tablet":    true,
	"Syrup":     true,
	"Other":     true,
}

type pharmacyItem struct {
	ID            int64          `json:"id"`
	Code          string         `json:"code"`
	Name          string         `json:"name"`
	Category      string         `json:"category"`
	PackSize      int64          `json:"pack_size"`
	BuyPriceMMK   int64          `json:"buy_price_mmk"`
	SellPriceMMK  int64          `json:"sell_price_mmk"`
	ReorderLevel  int64          `json:"reorder_level"`
	Active        bool           `json:"active"`
	StockMain     int64          `json:"stock_main"`
	LowStock      bool           `json:"low_stock"`
	CreatedAt     string         `json:"created_at,omitempty"`
	UpdatedAt     string         `json:"updated_at,omitempty"`
	Batches       []itemBatch    `json:"batches,omitempty"`
	StockByLoc    map[string]int64 `json:"stock_by_location,omitempty"`
}

type itemBatch struct {
	ID           int64  `json:"id"`
	ItemID       int64  `json:"item_id"`
	LocationCode string `json:"location_code"`
	BatchNo      string `json:"batch_no"`
	ExpiryDate   *string `json:"expiry_date"`
	Qty          int64  `json:"qty"`
	CreatedAt    string `json:"created_at,omitempty"`
	UpdatedAt    string `json:"updated_at,omitempty"`
}

type stockMovement struct {
	ID           int64  `json:"id"`
	ItemID       int64  `json:"item_id"`
	ItemCode     string `json:"item_code"`
	ItemName     string `json:"item_name"`
	BatchID      *int64 `json:"batch_id"`
	LocationCode string `json:"location_code"`
	MovementType string `json:"movement_type"`
	QtyDelta     int64  `json:"qty_delta"`
	Reason       string `json:"reason"`
	ActorUserID  *int64 `json:"actor_user_id"`
	CreatedAt    string `json:"created_at"`
}

type itemCreateRequest struct {
	Code         string `json:"code"`
	Name         string `json:"name"`
	Category     string `json:"category"`
	PackSize     *int64 `json:"pack_size,omitempty"`
	BuyPriceMMK  *int64 `json:"buy_price_mmk,omitempty"`
	SellPriceMMK *int64 `json:"sell_price_mmk,omitempty"`
	ReorderLevel *int64 `json:"reorder_level,omitempty"`
	InitialQty   *int64 `json:"initial_qty,omitempty"`
	BatchNo      string `json:"batch_no"`
	ExpiryDate   string `json:"expiry_date"`
}

type itemUpdateRequest struct {
	Code         string `json:"code"`
	Name         string `json:"name"`
	Category     string `json:"category"`
	PackSize     *int64 `json:"pack_size,omitempty"`
	BuyPriceMMK  *int64 `json:"buy_price_mmk,omitempty"`
	SellPriceMMK *int64 `json:"sell_price_mmk,omitempty"`
	ReorderLevel *int64 `json:"reorder_level,omitempty"`
	Active       *bool  `json:"active,omitempty"`
}

type restockRequest struct {
	Qty          int64  `json:"qty"`
	BatchNo      string `json:"batch_no"`
	ExpiryDate   string `json:"expiry_date"`
	BuyPriceMMK  *int64 `json:"buy_price_mmk,omitempty"`
	SellPriceMMK *int64 `json:"sell_price_mmk,omitempty"`
}

type adjustRequest struct {
	QtyDelta int64  `json:"qty_delta"`
	Reason   string `json:"reason"`
	BatchID  *int64 `json:"batch_id,omitempty"`
}

func (h *Pharmacy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(h.DB, auth.PermPharmacy, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/pharmacy")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}

		switch {
		case path == "/locations" && r.Method == http.MethodGet:
			h.listLocations(w, r)
		case path == "/movements" && r.Method == http.MethodGet:
			h.listMovements(w, r)
		case path == "/items" && r.Method == http.MethodGet:
			h.listItems(w, r)
		case path == "/items" && r.Method == http.MethodPost:
			h.createItem(w, r)
		case strings.HasPrefix(path, "/items/") && strings.HasSuffix(path, "/restock") && r.Method == http.MethodPost:
			h.restock(w, r, path)
		case strings.HasPrefix(path, "/items/") && strings.HasSuffix(path, "/adjust") && r.Method == http.MethodPost:
			h.adjust(w, r, path)
		case strings.HasPrefix(path, "/items/") && strings.HasSuffix(path, "/batches") && r.Method == http.MethodGet:
			h.listBatches(w, r, path)
		case strings.HasPrefix(path, "/items/") && r.Method == http.MethodGet:
			h.getItem(w, r, path)
		case strings.HasPrefix(path, "/items/") && r.Method == http.MethodPut:
			h.updateItem(w, r, path)
		case strings.HasPrefix(path, "/items/") && r.Method == http.MethodDelete:
			h.deactivateItem(w, r, path)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		}
	})).ServeHTTP(w, r)
}

func (h *Pharmacy) listLocations(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(`SELECT code, name FROM stock_locations ORDER BY code`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()
	type loc struct {
		Code string `json:"code"`
		Name string `json:"name"`
	}
	list := make([]loc, 0)
	for rows.Next() {
		var l loc
		if err := rows.Scan(&l.Code, &l.Name); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, l)
	}
	writeJSON(w, http.StatusOK, map[string]any{"locations": list})
}

func (h *Pharmacy) listItems(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	codeExact := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("code")))
	includeInactive := r.URL.Query().Get("all") == "1"

	base := `
		SELECT i.id, i.code, i.name, i.category, i.pack_size, i.buy_price_mmk, i.sell_price_mmk,
		       i.reorder_level, i.active, i.created_at, i.updated_at,
		       COALESCE((
		         SELECT SUM(b.qty) FROM item_batches b
		         WHERE b.item_id = i.id AND b.location_code = 'MAIN'
		       ), 0) AS stock_main
		FROM items i
	`
	var rows *sql.Rows
	var err error

	if codeExact != "" {
		rows, err = h.DB.Query(base+` WHERE i.code = ? COLLATE NOCASE ORDER BY i.name COLLATE NOCASE`, codeExact)
	} else if q != "" {
		like := "%" + q + "%"
		if includeInactive {
			rows, err = h.DB.Query(base+`
				WHERE i.code LIKE ? OR i.name LIKE ? OR i.category LIKE ?
				ORDER BY i.name COLLATE NOCASE
			`, like, like, like)
		} else {
			rows, err = h.DB.Query(base+`
				WHERE i.active = 1 AND (i.code LIKE ? OR i.name LIKE ? OR i.category LIKE ?)
				ORDER BY i.name COLLATE NOCASE
			`, like, like, like)
		}
	} else if includeInactive {
		rows, err = h.DB.Query(base + ` ORDER BY i.name COLLATE NOCASE`)
	} else {
		rows, err = h.DB.Query(base + ` WHERE i.active = 1 ORDER BY i.name COLLATE NOCASE`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]pharmacyItem, 0)
	for rows.Next() {
		item, err := scanPharmacyItem(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": list})
}

func (h *Pharmacy) getItem(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/items"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	item, err := loadPharmacyItem(h.DB, id, true)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *Pharmacy) createItem(w http.ResponseWriter, r *http.Request) {
	var req itemCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))
	req.Name = strings.TrimSpace(req.Name)
	req.Category = strings.TrimSpace(req.Category)
	if req.Category == "" {
		req.Category = "Other"
	}
	if req.Code == "" || req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code and name required"})
		return
	}
	if !itemCategories[req.Category] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid category"})
		return
	}

	packSize := int64(1)
	if req.PackSize != nil {
		if *req.PackSize < 1 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "pack_size must be >= 1"})
			return
		}
		packSize = *req.PackSize
	}
	buy, sell, reorder := int64(0), int64(0), int64(0)
	if req.BuyPriceMMK != nil {
		if *req.BuyPriceMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "buy_price_mmk must be >= 0"})
			return
		}
		buy = *req.BuyPriceMMK
	}
	if req.SellPriceMMK != nil {
		if *req.SellPriceMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sell_price_mmk must be >= 0"})
			return
		}
		sell = *req.SellPriceMMK
	}
	if req.ReorderLevel != nil {
		if *req.ReorderLevel < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "reorder_level must be >= 0"})
			return
		}
		reorder = *req.ReorderLevel
	}
	initialQty := int64(0)
	if req.InitialQty != nil {
		if *req.InitialQty < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "initial_qty must be >= 0"})
			return
		}
		initialQty = *req.InitialQty
	}
	expiry, err := normalizeExpiry(req.ExpiryDate)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "expiry_date must be YYYY-MM-DD"})
		return
	}
	batchNo := strings.TrimSpace(req.BatchNo)

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		INSERT INTO items (code, name, category, pack_size, buy_price_mmk, sell_price_mmk, reorder_level, active)
		VALUES (?, ?, ?, ?, ?, ?, ?, 1)
	`, req.Code, req.Name, req.Category, packSize, buy, sell, reorder)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "code already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	itemID, _ := res.LastInsertId()

	user := middleware.UserFromContext(r.Context())
	uid := user.ID

	if initialQty > 0 {
		bres, err := tx.Exec(`
			INSERT INTO item_batches (item_id, location_code, batch_no, expiry_date, qty)
			VALUES (?, 'MAIN', ?, ?, ?)
		`, itemID, batchNo, expiry, initialQty)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "batch create failed"})
			return
		}
		batchID, _ := bres.LastInsertId()
		if _, err := tx.Exec(`
			INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
			VALUES (?, ?, 'MAIN', 'PURCHASE', ?, 'Initial stock', ?)
		`, itemID, batchID, initialQty, uid); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "create", "item", &itemID, map[string]any{
		"code": req.Code, "name": req.Name, "category": req.Category, "initial_qty": initialQty,
	})

	item, err := loadPharmacyItem(h.DB, itemID, true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *Pharmacy) updateItem(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/items"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req itemUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))
	req.Name = strings.TrimSpace(req.Name)
	req.Category = strings.TrimSpace(req.Category)
	if req.Code == "" || req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code and name required"})
		return
	}
	if !itemCategories[req.Category] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid category"})
		return
	}

	existing, err := loadPharmacyItem(h.DB, id, false)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	packSize := existing.PackSize
	if req.PackSize != nil {
		if *req.PackSize < 1 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "pack_size must be >= 1"})
			return
		}
		packSize = *req.PackSize
	}
	buy, sell, reorder := existing.BuyPriceMMK, existing.SellPriceMMK, existing.ReorderLevel
	if req.BuyPriceMMK != nil {
		if *req.BuyPriceMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "buy_price_mmk must be >= 0"})
			return
		}
		buy = *req.BuyPriceMMK
	}
	if req.SellPriceMMK != nil {
		if *req.SellPriceMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sell_price_mmk must be >= 0"})
			return
		}
		sell = *req.SellPriceMMK
	}
	if req.ReorderLevel != nil {
		if *req.ReorderLevel < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "reorder_level must be >= 0"})
			return
		}
		reorder = *req.ReorderLevel
	}
	active := existing.Active
	if req.Active != nil {
		active = *req.Active
	}
	activeInt := 0
	if active {
		activeInt = 1
	}

	_, err = h.DB.Exec(`
		UPDATE items SET code = ?, name = ?, category = ?, pack_size = ?, buy_price_mmk = ?,
		  sell_price_mmk = ?, reorder_level = ?, active = ?, updated_at = datetime('now')
		WHERE id = ?
	`, req.Code, req.Name, req.Category, packSize, buy, sell, reorder, activeInt, id)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "code already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "item", &id, map[string]any{
		"code": req.Code, "name": req.Name, "active": active,
	})

	item, err := loadPharmacyItem(h.DB, id, true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *Pharmacy) deactivateItem(w http.ResponseWriter, r *http.Request, path string) {
	id, ok := parseID(strings.TrimPrefix(path, "/items"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	res, err := h.DB.Exec(`
		UPDATE items SET active = 0, updated_at = datetime('now') WHERE id = ? AND active = 1
	`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "deactivate failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "deactivate", "item", &id, nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Pharmacy) listBatches(w http.ResponseWriter, r *http.Request, path string) {
	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/items/"), "/batches")
	id, ok := parseID("/" + idPart)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if _, err := loadPharmacyItem(h.DB, id, false); err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	batches, err := listItemBatches(h.DB, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"batches": batches})
}

func (h *Pharmacy) restock(w http.ResponseWriter, r *http.Request, path string) {
	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/items/"), "/restock")
	id, ok := parseID("/" + idPart)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var req restockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if req.Qty <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "qty must be > 0"})
		return
	}
	expiry, err := normalizeExpiry(req.ExpiryDate)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "expiry_date must be YYYY-MM-DD"})
		return
	}
	batchNo := strings.TrimSpace(req.BatchNo)

	existing, err := loadPharmacyItem(h.DB, id, false)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "item not found — create the item first"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if !existing.Active {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "item is inactive"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	buy, sell := existing.BuyPriceMMK, existing.SellPriceMMK
	if req.BuyPriceMMK != nil {
		if *req.BuyPriceMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "buy_price_mmk must be >= 0"})
			return
		}
		buy = *req.BuyPriceMMK
	}
	if req.SellPriceMMK != nil {
		if *req.SellPriceMMK < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sell_price_mmk must be >= 0"})
			return
		}
		sell = *req.SellPriceMMK
	}
	if req.BuyPriceMMK != nil || req.SellPriceMMK != nil {
		if _, err := tx.Exec(`
			UPDATE items SET buy_price_mmk = ?, sell_price_mmk = ?, updated_at = datetime('now') WHERE id = ?
		`, buy, sell, id); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "price update failed"})
			return
		}
	}

	batchID, err := findOrCreateBatch(tx, id, "MAIN", batchNo, expiry, req.Qty)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "batch failed"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	uid := user.ID
	if _, err := tx.Exec(`
		INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
		VALUES (?, ?, 'MAIN', 'PURCHASE', ?, 'Restock', ?)
	`, id, batchID, req.Qty, uid); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "restock", "item", &id, map[string]any{
		"qty": req.Qty, "batch_id": batchID, "batch_no": batchNo, "expiry_date": expiry,
	})

	item, err := loadPharmacyItem(h.DB, id, true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *Pharmacy) adjust(w http.ResponseWriter, r *http.Request, path string) {
	user := middleware.UserFromContext(r.Context())
	if user.Role != auth.RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Admin only"})
		return
	}

	idPart := strings.TrimSuffix(strings.TrimPrefix(path, "/items/"), "/adjust")
	id, ok := parseID("/" + idPart)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var req adjustRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.QtyDelta == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "qty_delta must be non-zero"})
		return
	}
	if req.Reason == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "reason required"})
		return
	}

	if _, err := loadPharmacyItem(h.DB, id, false); err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	uid := user.ID

	if req.BatchID != nil {
		var qty int64
		var loc string
		err := tx.QueryRow(`
			SELECT qty, location_code FROM item_batches WHERE id = ? AND item_id = ?
		`, *req.BatchID, id).Scan(&qty, &loc)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "batch not found"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "batch load failed"})
			return
		}
		newQty := qty + req.QtyDelta
		if newQty < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "insufficient batch qty"})
			return
		}
		if _, err := tx.Exec(`
			UPDATE item_batches SET qty = ?, updated_at = datetime('now') WHERE id = ?
		`, newQty, *req.BatchID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "adjust failed"})
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
			VALUES (?, ?, ?, 'ADJUST', ?, ?, ?)
		`, id, *req.BatchID, loc, req.QtyDelta, req.Reason, uid); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
			return
		}
	} else if req.QtyDelta > 0 {
		batchID, err := findOrCreateBatch(tx, id, "MAIN", "ADJ", nil, req.QtyDelta)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "batch failed"})
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
			VALUES (?, ?, 'MAIN', 'ADJUST', ?, ?, ?)
		`, id, batchID, req.QtyDelta, req.Reason, uid); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
			return
		}
	} else {
		// FEFO deduct across MAIN batches (same rule Chat 5 should use for SALE).
		remaining := -req.QtyDelta
		rows, err := tx.Query(`
			SELECT id, qty FROM item_batches
			WHERE item_id = ? AND location_code = 'MAIN' AND qty > 0
			ORDER BY CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
			         expiry_date ASC, id ASC
		`, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "fefo query failed"})
			return
		}
		type take struct {
			id  int64
			qty int64
		}
		takes := make([]take, 0)
		for rows.Next() {
			var t take
			if err := rows.Scan(&t.id, &t.qty); err != nil {
				rows.Close()
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
				return
			}
			takes = append(takes, t)
		}
		rows.Close()

		var total int64
		for _, t := range takes {
			total += t.qty
		}
		if total < remaining {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "insufficient stock"})
			return
		}
		for _, t := range takes {
			if remaining == 0 {
				break
			}
			use := t.qty
			if use > remaining {
				use = remaining
			}
			if _, err := tx.Exec(`
				UPDATE item_batches SET qty = qty - ?, updated_at = datetime('now') WHERE id = ?
			`, use, t.id); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "adjust failed"})
				return
			}
			if _, err := tx.Exec(`
				INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
				VALUES (?, ?, 'MAIN', 'ADJUST', ?, ?, ?)
			`, id, t.id, -use, req.Reason, uid); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "movement failed"})
				return
			}
			remaining -= use
		}
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "adjust", "item", &id, map[string]any{
		"qty_delta": req.QtyDelta, "reason": req.Reason, "batch_id": req.BatchID,
	})

	item, err := loadPharmacyItem(h.DB, id, true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *Pharmacy) listMovements(w http.ResponseWriter, r *http.Request) {
	itemIDStr := strings.TrimSpace(r.URL.Query().Get("item_id"))
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	query := `
		SELECT m.id, m.item_id, i.code, i.name, m.batch_id, m.location_code, m.movement_type,
		       m.qty_delta, m.reason, m.actor_user_id, m.created_at
		FROM stock_movements m
		JOIN items i ON i.id = m.item_id
	`
	args := make([]any, 0)
	where := make([]string, 0)
	if itemIDStr != "" {
		id, ok := parseID("/" + itemIDStr)
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid item_id"})
			return
		}
		where = append(where, "m.item_id = ?")
		args = append(args, id)
	}
	if q != "" {
		like := "%" + q + "%"
		where = append(where, "(i.code LIKE ? OR i.name LIKE ? OR m.movement_type LIKE ? OR m.reason LIKE ?)")
		args = append(args, like, like, like, like)
	}
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY m.created_at DESC, m.id DESC LIMIT 200"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]stockMovement, 0)
	for rows.Next() {
		var m stockMovement
		var batchID sql.NullInt64
		var actor sql.NullInt64
		if err := rows.Scan(
			&m.ID, &m.ItemID, &m.ItemCode, &m.ItemName, &batchID, &m.LocationCode,
			&m.MovementType, &m.QtyDelta, &m.Reason, &actor, &m.CreatedAt,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		if batchID.Valid {
			v := batchID.Int64
			m.BatchID = &v
		}
		if actor.Valid {
			v := actor.Int64
			m.ActorUserID = &v
		}
		list = append(list, m)
	}
	writeJSON(w, http.StatusOK, map[string]any{"movements": list})
}

func normalizeExpiry(raw string) (*string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	if _, err := time.Parse("2006-01-02", raw); err != nil {
		return nil, err
	}
	return &raw, nil
}

func findOrCreateBatch(tx *sql.Tx, itemID int64, location, batchNo string, expiry *string, addQty int64) (int64, error) {
	var batchID int64
	var err error
	if expiry == nil {
		err = tx.QueryRow(`
			SELECT id FROM item_batches
			WHERE item_id = ? AND location_code = ? AND batch_no = ?
			  AND (expiry_date IS NULL OR expiry_date = '')
			ORDER BY id ASC LIMIT 1
		`, itemID, location, batchNo).Scan(&batchID)
	} else {
		err = tx.QueryRow(`
			SELECT id FROM item_batches
			WHERE item_id = ? AND location_code = ? AND batch_no = ? AND expiry_date = ?
			ORDER BY id ASC LIMIT 1
		`, itemID, location, batchNo, *expiry).Scan(&batchID)
	}
	if err == sql.ErrNoRows {
		res, err := tx.Exec(`
			INSERT INTO item_batches (item_id, location_code, batch_no, expiry_date, qty)
			VALUES (?, ?, ?, ?, ?)
		`, itemID, location, batchNo, expiry, addQty)
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(`
		UPDATE item_batches SET qty = qty + ?, updated_at = datetime('now') WHERE id = ?
	`, addQty, batchID); err != nil {
		return 0, err
	}
	return batchID, nil
}

func loadPharmacyItem(db *sql.DB, id int64, withDetail bool) (pharmacyItem, error) {
	row := db.QueryRow(`
		SELECT i.id, i.code, i.name, i.category, i.pack_size, i.buy_price_mmk, i.sell_price_mmk,
		       i.reorder_level, i.active, i.created_at, i.updated_at,
		       COALESCE((
		         SELECT SUM(b.qty) FROM item_batches b
		         WHERE b.item_id = i.id AND b.location_code = 'MAIN'
		       ), 0) AS stock_main
		FROM items i WHERE i.id = ?
	`, id)
	item, err := scanPharmacyItem(row)
	if err != nil {
		return item, err
	}
	if !withDetail {
		return item, nil
	}
	batches, err := listItemBatches(db, id)
	if err != nil {
		return item, err
	}
	item.Batches = batches
	item.StockByLoc = map[string]int64{}
	for _, b := range batches {
		item.StockByLoc[b.LocationCode] += b.Qty
	}
	return item, nil
}

func listItemBatches(db *sql.DB, itemID int64) ([]itemBatch, error) {
	rows, err := db.Query(`
		SELECT id, item_id, location_code, batch_no, expiry_date, qty, created_at, updated_at
		FROM item_batches
		WHERE item_id = ?
		ORDER BY CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
		         expiry_date ASC, id ASC
	`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]itemBatch, 0)
	for rows.Next() {
		var b itemBatch
		var expiry sql.NullString
		if err := rows.Scan(
			&b.ID, &b.ItemID, &b.LocationCode, &b.BatchNo, &expiry, &b.Qty, &b.CreatedAt, &b.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if expiry.Valid && expiry.String != "" {
			s := expiry.String
			b.ExpiryDate = &s
		}
		list = append(list, b)
	}
	return list, nil
}

func scanPharmacyItem(s scanner) (pharmacyItem, error) {
	var item pharmacyItem
	var active int
	err := s.Scan(
		&item.ID, &item.Code, &item.Name, &item.Category, &item.PackSize,
		&item.BuyPriceMMK, &item.SellPriceMMK, &item.ReorderLevel, &active,
		&item.CreatedAt, &item.UpdatedAt, &item.StockMain,
	)
	if err != nil {
		return item, err
	}
	item.Active = active == 1
	item.LowStock = item.StockMain <= item.ReorderLevel
	return item, nil
}
