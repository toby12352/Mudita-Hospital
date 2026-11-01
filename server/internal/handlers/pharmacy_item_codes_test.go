package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
)

func TestPharmacyItemCodeMigrationRewrite(t *testing.T) {
	sqlDB := openTestDB(t)

	// Simulate a pre-rewrite catalog: old free-text codes, known stock units.
	res1, err := sqlDB.Exec(`
		INSERT INTO items (
			code, name, category, buy_price_mmk, sell_price_mmk,
			pack_l1_qty, pack_l1_unit, pack_l2_qty, pack_l2_unit, pack_l3_qty, pack_l3_unit,
			pack_l4_qty, pack_l4_unit, pack_l5_qty, pack_l5_unit, pack_l6_qty, pack_l6_unit,
			units_per_purchase, purchase_unit, stock_unit, billing_unit
		) VALUES (
			'OLD-A', 'Alpha tab', 'Tablet', 1000, 10,
			1, 'Box', 10, 'Strip', 10, 'Tablet',
			1, 'Tablet', 1, 'Tablet', 1, 'Tablet',
			100, 'Box', 'Tablet', 'Tablet'
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	idA, _ := res1.LastInsertId()

	res2, err := sqlDB.Exec(`
		INSERT INTO items (
			code, name, category, buy_price_mmk, sell_price_mmk,
			pack_l1_qty, pack_l1_unit, pack_l2_qty, pack_l2_unit, pack_l3_qty, pack_l3_unit,
			pack_l4_qty, pack_l4_unit, pack_l5_qty, pack_l5_unit, pack_l6_qty, pack_l6_unit,
			units_per_purchase, purchase_unit, stock_unit, billing_unit
		) VALUES (
			'OLD-B', 'Beta tab', 'Tablet', 2000, 20,
			1, 'Box', 10, 'Strip', 10, 'Tablet',
			1, 'Tablet', 1, 'Tablet', 1, 'Tablet',
			100, 'Box', 'Tablet', 'Tablet'
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	idB, _ := res2.LastInsertId()

	res3, err := sqlDB.Exec(`
		INSERT INTO items (
			code, name, category, buy_price_mmk, sell_price_mmk,
			pack_l1_qty, pack_l1_unit, pack_l2_qty, pack_l2_unit, pack_l3_qty, pack_l3_unit,
			pack_l4_qty, pack_l4_unit, pack_l5_qty, pack_l5_unit, pack_l6_qty, pack_l6_unit,
			units_per_purchase, purchase_unit, stock_unit, billing_unit
		) VALUES (
			'OLD-V', 'Vial item', 'Injection', 5000, 500,
			1, 'Box', 1, 'Vial', 1, 'Vial',
			1, 'Vial', 1, 'Vial', 1, 'Vial',
			1, 'Box', 'Vial', 'Vial'
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	idV, _ := res3.LastInsertId()

	if _, err := sqlDB.Exec(`
		INSERT INTO item_batches (item_id, location_code, batch_no, qty)
		VALUES (?, 'MAIN', 'B1', 50)
	`, idA); err != nil {
		t.Fatal(err)
	}

	bres, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bills (bill_no, patient_name, status, total_mmk)
		VALUES ('PH-CODE', 'Test', 'draft', 100)
	`)
	if err != nil {
		t.Fatal(err)
	}
	billID, _ := bres.LastInsertId()
	if _, err := sqlDB.Exec(`
		INSERT INTO pharmacy_bill_lines (
			bill_id, item_id, code, description,
			billing_qty, billing_unit, stock_qty, stock_unit,
			unit_price_mmk, line_total_mmk, sort_order
		) VALUES (?, ?, 'OLD-A', 'Alpha tab', 1, 'Tablet', 1, 'Tablet', 10, 10, 0)
	`, billID, idA); err != nil {
		t.Fatal(err)
	}

	// Re-apply the rewrite steps against these rows (044 already ran on empty catalog).
	if _, err := sqlDB.Exec(`UPDATE items SET code = '~' || id WHERE id IN (?, ?, ?)`, idA, idB, idV); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
UPDATE items SET code = (
  SELECT p.prefix || '-' || printf('%04d', p.rn)
  FROM (
    SELECT
      id AS iid,
      CASE TRIM(COALESCE(stock_unit, ''))
        WHEN 'Tablet' THEN 'TAB'
        WHEN 'Capsule' THEN 'CAP'
        WHEN 'Vial' THEN 'VIA'
        WHEN 'Ampoule' THEN 'AMP'
        WHEN 'Bottle' THEN 'BTL'
        WHEN 'Sachet' THEN 'SAC'
        WHEN 'Tube' THEN 'TUB'
        WHEN 'Puff' THEN 'PUF'
        WHEN 'mL' THEN 'MLL'
        WHEN 'g' THEN 'GRM'
        WHEN 'oz' THEN 'ONZ'
        WHEN 'Bag' THEN 'BAG'
        WHEN 'Strip' THEN 'STR'
        WHEN 'Card' THEN 'CRD'
        WHEN 'Box' THEN 'BOX'
        WHEN 'Carton' THEN 'CTN'
        WHEN 'Pack' THEN 'PCK'
        WHEN 'Piece' THEN 'PCE'
        WHEN 'Each' THEN 'EAC'
        WHEN 'Pairs' THEN 'PAR'
        WHEN 'Cylinder' THEN 'CYL'
        ELSE 'OTH'
      END AS prefix,
      ROW_NUMBER() OVER (
        PARTITION BY CASE TRIM(COALESCE(stock_unit, ''))
          WHEN 'Tablet' THEN 'TAB'
          WHEN 'Capsule' THEN 'CAP'
          WHEN 'Vial' THEN 'VIA'
          WHEN 'Ampoule' THEN 'AMP'
          WHEN 'Bottle' THEN 'BTL'
          WHEN 'Sachet' THEN 'SAC'
          WHEN 'Tube' THEN 'TUB'
          WHEN 'Puff' THEN 'PUF'
          WHEN 'mL' THEN 'MLL'
          WHEN 'g' THEN 'GRM'
          WHEN 'oz' THEN 'ONZ'
          WHEN 'Bag' THEN 'BAG'
          WHEN 'Strip' THEN 'STR'
          WHEN 'Card' THEN 'CRD'
          WHEN 'Box' THEN 'BOX'
          WHEN 'Carton' THEN 'CTN'
          WHEN 'Pack' THEN 'PCK'
          WHEN 'Piece' THEN 'PCE'
          WHEN 'Each' THEN 'EAC'
          WHEN 'Pairs' THEN 'PAR'
          WHEN 'Cylinder' THEN 'CYL'
          ELSE 'OTH'
        END
        ORDER BY id
      ) AS rn
    FROM items
  ) AS p
  WHERE p.iid = items.id
)
WHERE id IN (?, ?, ?)
`, idA, idB, idV); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`DELETE FROM item_code_counters`); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
INSERT INTO item_code_counters (prefix, last_n)
SELECT
  CASE TRIM(COALESCE(stock_unit, ''))
    WHEN 'Tablet' THEN 'TAB'
    WHEN 'Capsule' THEN 'CAP'
    WHEN 'Vial' THEN 'VIA'
    WHEN 'Ampoule' THEN 'AMP'
    WHEN 'Bottle' THEN 'BTL'
    WHEN 'Sachet' THEN 'SAC'
    WHEN 'Tube' THEN 'TUB'
    WHEN 'Puff' THEN 'PUF'
    WHEN 'mL' THEN 'MLL'
    WHEN 'g' THEN 'GRM'
    WHEN 'oz' THEN 'ONZ'
    WHEN 'Bag' THEN 'BAG'
    WHEN 'Strip' THEN 'STR'
    WHEN 'Card' THEN 'CRD'
    WHEN 'Box' THEN 'BOX'
    WHEN 'Carton' THEN 'CTN'
    WHEN 'Pack' THEN 'PCK'
    WHEN 'Piece' THEN 'PCE'
    WHEN 'Each' THEN 'EAC'
    WHEN 'Pairs' THEN 'PAR'
    WHEN 'Cylinder' THEN 'CYL'
    ELSE 'OTH'
  END AS prefix,
  COUNT(*) AS last_n
FROM items
GROUP BY prefix
`); err != nil {
		t.Fatal(err)
	}

	var codeA, codeB, codeV string
	if err := sqlDB.QueryRow(`SELECT code FROM items WHERE id = ?`, idA).Scan(&codeA); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT code FROM items WHERE id = ?`, idB).Scan(&codeB); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT code FROM items WHERE id = ?`, idV).Scan(&codeV); err != nil {
		t.Fatal(err)
	}
	if codeA != "TAB-0001" || codeB != "TAB-0002" || codeV != "VIA-0001" {
		t.Fatalf("codes A=%s B=%s V=%s", codeA, codeB, codeV)
	}

	var qty int64
	if err := sqlDB.QueryRow(`SELECT qty FROM item_batches WHERE item_id = ?`, idA).Scan(&qty); err != nil {
		t.Fatal(err)
	}
	if qty != 50 {
		t.Fatalf("batch qty=%d, want 50", qty)
	}

	var billCode string
	if err := sqlDB.QueryRow(`SELECT code FROM pharmacy_bill_lines WHERE bill_id = ?`, billID).Scan(&billCode); err != nil {
		t.Fatal(err)
	}
	if billCode != "OLD-A" {
		t.Fatalf("bill line code %q, want OLD-A snapshot", billCode)
	}

	var tabN, viaN int64
	if err := sqlDB.QueryRow(`SELECT last_n FROM item_code_counters WHERE prefix = 'TAB'`).Scan(&tabN); err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.QueryRow(`SELECT last_n FROM item_code_counters WHERE prefix = 'VIA'`).Scan(&viaN); err != nil {
		t.Fatal(err)
	}
	if tabN != 2 || viaN != 1 {
		t.Fatalf("counters TAB=%d VIA=%d", tabN, viaN)
	}
}

func TestUpdatePharmacyItemKeepsCode(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	h := &Pharmacy{DB: sqlDB}

	w := doJSON(h, http.MethodPost, "/api/pharmacy/items", token, `{
		"name":"Keep code",
		"pack_l1_qty":1,
		"pack_l1_unit":"Box",
		"pack_l2_qty":10,
		"pack_l2_unit":"Strip",
		"pack_l3_qty":10,
		"pack_l3_unit":"Tablet",
		"buy_price_mmk":1000,
		"sell_price_mmk":10
	}`)
	mustCode(t, w, http.StatusCreated)
	var created pharmacyItem
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Code != "TAB-0001" {
		t.Fatalf("created %q", created.Code)
	}

	w = doJSON(h, http.MethodPut, "/api/pharmacy/items/"+strconv.FormatInt(created.ID, 10), token, `{
		"code":"HACKED",
		"name":"Keep code",
		"pack_l1_qty":1,
		"pack_l1_unit":"Box",
		"pack_l2_qty":1,
		"pack_l2_unit":"Vial",
		"pack_l3_qty":1,
		"pack_l3_unit":"Vial",
		"pack_l4_qty":1,
		"pack_l4_unit":"Vial",
		"pack_l5_qty":1,
		"pack_l5_unit":"Vial",
		"pack_l6_qty":1,
		"pack_l6_unit":"Vial",
		"buy_price_mmk":1000,
		"sell_price_mmk":10,
		"active":true
	}`)
	mustCode(t, w, http.StatusOK)
	var updated pharmacyItem
	if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Code != "TAB-0001" {
		t.Fatalf("code changed to %q", updated.Code)
	}
	if updated.StockUnit != "Vial" {
		t.Fatalf("stock_unit=%s, want Vial", updated.StockUnit)
	}
}

func TestStockUnitToItemCodePrefix(t *testing.T) {
	if stockUnitToItemCodePrefix("Tablet") != "TAB" {
		t.Fatal("Tablet")
	}
	if stockUnitToItemCodePrefix("mL") != "MLL" {
		t.Fatal("mL")
	}
	if stockUnitToItemCodePrefix("") != "OTH" {
		t.Fatal("blank")
	}
	if formatItemCode("TAB", 42) != "TAB-0042" {
		t.Fatal(formatItemCode("TAB", 42))
	}
	if formatItemCode("TAB", 10000) != "TAB-10000" {
		t.Fatal(formatItemCode("TAB", 10000))
	}
}
