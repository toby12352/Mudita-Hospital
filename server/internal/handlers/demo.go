package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// Demo handles Admin training seed / reset (settings permission).
// Training rows are tagged with codes/names containing DEMO- or [TRAINING].
type Demo struct {
	DB *sql.DB
}

func (h *Demo) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(h.DB, auth.PermSettings, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/demo")
		path = strings.Trim(path, "/")

		switch {
		case path == "status" && r.Method == http.MethodGet:
			h.status(w, r)
		case path == "seed" && r.Method == http.MethodPost:
			h.seed(w, r)
		case path == "reset" && r.Method == http.MethodPost:
			h.reset(w, r)
		default:
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		}
	})).ServeHTTP(w, r)
}

func (h *Demo) status(w http.ResponseWriter, r *http.Request) {
	var doctors, services, items, opdBills, otBills, phBills int
	_ = h.DB.QueryRow(`SELECT COUNT(1) FROM doctors WHERE name LIKE '%[TRAINING]%' OR name LIKE 'Dr Demo%'`).Scan(&doctors)
	_ = h.DB.QueryRow(`SELECT COUNT(1) FROM services WHERE code LIKE 'DEMO-%'`).Scan(&services)
	_ = h.DB.QueryRow(`SELECT COUNT(1) FROM items WHERE code LIKE 'DEMO-%'`).Scan(&items)
	_ = h.DB.QueryRow(`SELECT COUNT(1) FROM opd_bills WHERE patient_name LIKE '%[TRAINING]%'`).Scan(&opdBills)
	_ = h.DB.QueryRow(`SELECT COUNT(1) FROM ot_bills WHERE patient_name LIKE '%[TRAINING]%'`).Scan(&otBills)
	_ = h.DB.QueryRow(`SELECT COUNT(1) FROM pharmacy_bills WHERE patient_name LIKE '%[TRAINING]%'`).Scan(&phBills)
	writeJSON(w, http.StatusOK, map[string]any{
		"training_doctors":         doctors,
		"training_services":        services,
		"training_items":           items,
		"training_opd_bills":       opdBills,
		"training_ot_bills":        otBills,
		"training_pharmacy_bills":  phBills,
		"seeded":                   doctors > 0 || services > 0 || items > 0,
	})
}

func (h *Demo) seed(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	uid := user.ID

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer func() { _ = tx.Rollback() }()

	created := map[string]int{}

	// Ensure hospital name for training previews
	_, _ = tx.Exec(`
		UPDATE hospital_settings SET hospital_name =
		  CASE WHEN hospital_name = '' OR hospital_name IS NULL THEN 'Mudita Hospital (Training)' ELSE hospital_name END,
		  updated_at = datetime('now')
		WHERE id = 1
	`)

	docID, n, err := ensureTrainingDoctor(tx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	created["doctors"] = n

	svcID, n, err := ensureTrainingService(tx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	created["services"] = n

	itemIDs, n, err := ensureTrainingItems(tx, uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	created["items"] = n

	billN, err := ensureTrainingOpdBill(tx, uid, docID, svcID, itemIDs)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	created["opd_bills"] = billN

	phN, err := ensureTrainingPharmacyBill(tx, uid, itemIDs)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	created["pharmacy_bills"] = phN

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "demo_seed", "training", nil, created)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"created": created,
		"message": "Training data ready. Look for DEMO- codes and [TRAINING] patients.",
	})
}

func (h *Demo) reset(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	uid := user.ID

	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tx failed"})
		return
	}
	defer func() { _ = tx.Rollback() }()

	// Delete training OPD bills (and lines/allocs via cascade or manual)
	opdIDs, err := queryIDs(tx, `SELECT id FROM opd_bills WHERE patient_name LIKE '%[TRAINING]%'`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list opd failed"})
		return
	}
	for _, id := range opdIDs {
		_, _ = tx.Exec(`DELETE FROM bill_stock_allocs WHERE bill_id = ?`, id)
		_, _ = tx.Exec(`DELETE FROM bill_lines WHERE bill_id = ?`, id)
		_, _ = tx.Exec(`DELETE FROM opd_bills WHERE id = ?`, id)
	}

	phIDs, err := queryIDs(tx, `SELECT id FROM pharmacy_bills WHERE patient_name LIKE '%[TRAINING]%'`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list pharmacy bills failed"})
		return
	}
	for _, id := range phIDs {
		_, _ = tx.Exec(`DELETE FROM pharmacy_bill_stock_allocs WHERE bill_id = ?`, id)
		_, _ = tx.Exec(`DELETE FROM pharmacy_bill_lines WHERE bill_id = ?`, id)
		_, _ = tx.Exec(`DELETE FROM pharmacy_bills WHERE id = ?`, id)
	}

	otBillIDs, err := queryIDs(tx, `SELECT id FROM ot_bills WHERE patient_name LIKE '%[TRAINING]%'`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list ot bills failed"})
		return
	}
	for _, id := range otBillIDs {
		_, _ = tx.Exec(`DELETE FROM ot_bill_lines WHERE bill_id = ?`, id)
		_, _ = tx.Exec(`DELETE FROM ot_bills WHERE id = ?`, id)
	}

	otCaseIDs, err := queryIDs(tx, `SELECT id FROM ot_cases WHERE patient_name LIKE '%[TRAINING]%'`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list ot cases failed"})
		return
	}
	for _, id := range otCaseIDs {
		_, _ = tx.Exec(`DELETE FROM ot_case_issue_allocs WHERE case_id = ?`, id)
		_, _ = tx.Exec(`DELETE FROM ot_case_items WHERE case_id = ?`, id)
		_, _ = tx.Exec(`DELETE FROM ot_cases WHERE id = ?`, id)
	}

	itemIDs, err := queryIDs(tx, `SELECT id FROM items WHERE code LIKE 'DEMO-%'`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list items failed"})
		return
	}
	for _, id := range itemIDs {
		_, _ = tx.Exec(`DELETE FROM stock_movements WHERE item_id = ?`, id)
		_, _ = tx.Exec(`DELETE FROM item_batches WHERE item_id = ?`, id)
		_, _ = tx.Exec(`DELETE FROM items WHERE id = ?`, id)
	}

	_, _ = tx.Exec(`DELETE FROM services WHERE code LIKE 'DEMO-%'`)
	_, _ = tx.Exec(`DELETE FROM doctor_fees WHERE doctor_id IN (
		SELECT id FROM doctors WHERE name LIKE '%[TRAINING]%' OR name LIKE 'Dr Demo%')`)
	_, _ = tx.Exec(`DELETE FROM doctors WHERE name LIKE '%[TRAINING]%' OR name LIKE 'Dr Demo%'`)

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "commit failed"})
		return
	}

	audit.WriteAudit(h.DB, &uid, "demo_reset", "training", nil, map[string]any{
		"opd_bills":       len(opdIDs),
		"pharmacy_bills":  len(phIDs),
		"ot_bills":        len(otBillIDs),
		"ot_cases":        len(otCaseIDs),
		"items":           len(itemIDs),
	})

	// Re-seed clean training set
	h.seed(w, r)
}

func queryIDs(tx *sql.Tx, q string) ([]int64, error) {
	rows, err := tx.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func ensureTrainingDoctor(tx *sql.Tx) (int64, int, error) {
	var id int64
	err := tx.QueryRow(`SELECT id FROM doctors WHERE name = 'Dr Demo [TRAINING]' LIMIT 1`).Scan(&id)
	if err == nil {
		return id, 0, nil
	}
	if err != sql.ErrNoRows {
		return 0, 0, err
	}
	res, err := tx.Exec(`
		INSERT INTO doctors (name, specialty, active)
		VALUES ('Dr Demo [TRAINING]', 'General', 1)
	`)
	if err != nil {
		return 0, 0, fmt.Errorf("doctor: %w", err)
	}
	id, _ = res.LastInsertId()
	_, err = tx.Exec(`
		INSERT INTO doctor_fees (doctor_id, fee_type, amount_mmk)
		VALUES (?, 'consultation', 5000), (?, 'ot', 50000)
	`, id, id)
	if err != nil {
		return 0, 0, fmt.Errorf("doctor fees: %w", err)
	}
	return id, 1, nil
}

func ensureTrainingService(tx *sql.Tx) (int64, int, error) {
	var id int64
	err := tx.QueryRow(`SELECT id FROM services WHERE code = 'DEMO-DRESS' LIMIT 1`).Scan(&id)
	if err == nil {
		return id, 0, nil
	}
	if err != sql.ErrNoRows {
		return 0, 0, err
	}
	res, err := tx.Exec(`
		INSERT INTO services (code, name, price_mmk, active)
		VALUES ('DEMO-DRESS', 'Dressing [TRAINING]', 3000, 1)
	`)
	if err != nil {
		return 0, 0, fmt.Errorf("service: %w", err)
	}
	id, _ = res.LastInsertId()
	return id, 1, nil
}

func ensureTrainingItems(tx *sql.Tx, actorUID int64) ([]int64, int, error) {
	type spec struct {
		code, name, category string
		buy, sell, reorder   int64
		qty                  int64
		expiryOffsetDays     int
	}
	specs := []spec{
		{"DEMO-PARA", "Paracetamol 500mg [TRAINING]", "Tablet", 20, 50, 100, 40, 60},   // low stock
		{"DEMO-NS", "Normal Saline 500ml [TRAINING]", "Injection", 200, 500, 20, 80, 30}, // near expiry
		{"DEMO-GLOVE", "Sterile Gloves [TRAINING]", "OT", 100, 250, 10, 200, 180},
	}
	ids := make([]int64, 0, len(specs))
	created := 0
	for _, s := range specs {
		var id int64
		err := tx.QueryRow(`SELECT id FROM items WHERE code = ?`, s.code).Scan(&id)
		if err == sql.ErrNoRows {
			units := categoryUnitDefaults(s.category)
			chargeInt := 0
			if units.ChargeFullStockUnit {
				chargeInt = 1
			}
			res, err := tx.Exec(`
				INSERT INTO items (
					code, name, category, pack_size,
					purchase_unit, stock_unit, billing_unit, units_per_purchase, billing_per_stock, charge_full_stock_unit,
					buy_price_mmk, sell_price_mmk, reorder_level, active
				) VALUES (?, ?, ?, 10, ?, ?, ?, 10, ?, ?, ?, ?, ?, 1)
			`, s.code, s.name, s.category,
				units.PurchaseUnit, units.StockUnit, units.BillingUnit, units.BillingPerStock, chargeInt,
				s.buy, s.sell, s.reorder)
			if err != nil {
				return nil, 0, fmt.Errorf("item %s: %w", s.code, err)
			}
			id, _ = res.LastInsertId()
			created++
			expiry := time.Now().AddDate(0, 0, s.expiryOffsetDays).Format("2006-01-02")
			bres, err := tx.Exec(`
				INSERT INTO item_batches (item_id, location_code, batch_no, expiry_date, qty)
				VALUES (?, 'MAIN', 'TRAIN-1', ?, ?)
			`, id, expiry, s.qty)
			if err != nil {
				return nil, 0, fmt.Errorf("batch %s: %w", s.code, err)
			}
			batchID, _ := bres.LastInsertId()
			_, err = tx.Exec(`
				INSERT INTO stock_movements (item_id, batch_id, location_code, movement_type, qty_delta, reason, actor_user_id)
				VALUES (?, ?, 'MAIN', 'PURCHASE', ?, 'Training seed', ?)
			`, id, batchID, s.qty, actorUID)
			if err != nil {
				return nil, 0, fmt.Errorf("movement %s: %w", s.code, err)
			}
		} else if err != nil {
			return nil, 0, err
		}
		ids = append(ids, id)
	}
	return ids, created, nil
}

func ensureTrainingOpdBill(tx *sql.Tx, actorUID, doctorID, serviceID int64, itemIDs []int64) (int, error) {
	var n int
	err := tx.QueryRow(`
		SELECT COUNT(1) FROM opd_bills
		WHERE patient_name LIKE '%[TRAINING]%' AND status = 'paid' AND date(paid_at) = date('now')
	`).Scan(&n)
	if err != nil {
		return 0, err
	}
	if n > 0 {
		return 0, nil
	}

	billNo, err := nextBillNo(tx)
	if err != nil {
		return 0, fmt.Errorf("bill seq: %w", err)
	}

	var docName string
	_ = tx.QueryRow(`SELECT name FROM doctors WHERE id = ?`, doctorID).Scan(&docName)

	var svcCode, svcName string
	var svcPrice int64
	_ = tx.QueryRow(`SELECT code, name, price_mmk FROM services WHERE id = ?`, serviceID).Scan(&svcCode, &svcName, &svcPrice)

	total := svcPrice

	res, err := tx.Exec(`
		INSERT INTO opd_bills (
			bill_no, patient_name, patient_phone, patient_gender, doctor_id, doctor_name,
			description, status, total_mmk, paid_at, paid_by_user_id, created_by_user_id
		) VALUES (?, 'Training Patient [TRAINING]', '', '', ?, ?, 'Training seed bill', 'paid', ?, datetime('now'), ?, ?)
	`, billNo, doctorID, docName, total, actorUID, actorUID)
	if err != nil {
		return 0, fmt.Errorf("opd bill: %w", err)
	}
	billID, _ := res.LastInsertId()

	_, err = tx.Exec(`
		INSERT INTO bill_lines (bill_id, line_type, ref_id, code, description, qty, unit_price_mmk, line_total_mmk, sort_order)
		VALUES (?, 'service', ?, ?, ?, 1, ?, ?, 0)
	`, billID, serviceID, svcCode, svcName, svcPrice, svcPrice)
	if err != nil {
		return 0, fmt.Errorf("opd line service: %w", err)
	}
	_ = itemIDs
	_ = billID
	return 1, nil
}

func ensureTrainingPharmacyBill(tx *sql.Tx, actorUID int64, itemIDs []int64) (int, error) {
	var n int
	err := tx.QueryRow(`
		SELECT COUNT(1) FROM pharmacy_bills
		WHERE patient_name LIKE '%[TRAINING]%' AND status = 'paid' AND date(paid_at) = date('now')
	`).Scan(&n)
	if err != nil {
		return 0, err
	}
	if n > 0 || len(itemIDs) == 0 {
		return 0, nil
	}

	billNo, err := nextPharmacyBillNo(tx)
	if err != nil {
		return 0, fmt.Errorf("pharmacy bill seq: %w", err)
	}

	itemID := itemIDs[0]
	var itemCode, itemName, stockUnit, billingUnit string
	var itemPrice, billingPerStock int64
	var chargeFull int
	_ = tx.QueryRow(`
		SELECT code, name, sell_price_mmk, stock_unit, billing_unit, billing_per_stock, charge_full_stock_unit
		FROM items WHERE id = ?
	`, itemID).Scan(&itemCode, &itemName, &itemPrice, &stockUnit, &billingUnit, &billingPerStock, &chargeFull)
	if billingPerStock < 1 {
		billingPerStock = 1
	}
	billingQty := int64(2)
	if billingUnit == "" {
		billingUnit = "Piece"
	}
	if stockUnit == "" {
		stockUnit = "Piece"
	}
	stockQty, msg := billingToStockQty(billingQty, billingPerStock, chargeFull == 1)
	if msg != "" {
		stockQty = billingQty
	}
	lineTotal := lineChargeMMK(billingQty, stockQty, billingPerStock, itemPrice, chargeFull == 1)

	res, err := tx.Exec(`
		INSERT INTO pharmacy_bills (
			bill_no, patient_name, patient_phone, patient_gender,
			description, status, total_mmk, paid_at, paid_by_user_id, created_by_user_id
		) VALUES (?, 'Training Patient [TRAINING]', '', '', 'Training pharmacy seed', 'paid', ?, datetime('now'), ?, ?)
	`, billNo, lineTotal, actorUID, actorUID)
	if err != nil {
		return 0, fmt.Errorf("pharmacy bill: %w", err)
	}
	billID, _ := res.LastInsertId()
	lres, err := tx.Exec(`
		INSERT INTO pharmacy_bill_lines (
			bill_id, item_id, code, description, billing_qty, billing_unit,
			stock_qty, stock_unit, unit_price_mmk, line_total_mmk, sort_order
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
	`, billID, itemID, itemCode, itemName, billingQty, billingUnit, stockQty, stockUnit, itemPrice, lineTotal)
	if err != nil {
		return 0, fmt.Errorf("pharmacy line: %w", err)
	}
	lineID, _ := lres.LastInsertId()
	if _, err := fefoDeductPharmacySale(tx, billID, lineID, itemID, stockQty, actorUID); err != nil {
		_ = err
	}
	return 1, nil
}
