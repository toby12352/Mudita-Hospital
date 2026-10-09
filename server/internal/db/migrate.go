package db

import (
	"database/sql"
	"fmt"
)

// Migration is a named SQL script applied once in order.
type Migration struct {
	Name string
	SQL  string
}

// migrations grow in later chats.
var migrations = []Migration{
	{
		Name: "001_schema_migrations",
		SQL: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
	},
	{
		Name: "002_auth",
		SQL: `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Reception', 'Pharmacy')),
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
`,
	},
	{
		Name: "003_master_data",
		SQL: `
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_doctors_name ON doctors(name);
CREATE INDEX IF NOT EXISTS idx_doctors_active ON doctors(active);

CREATE TABLE IF NOT EXISTS doctor_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('consultation', 'ot')),
  amount_mmk INTEGER NOT NULL DEFAULT 0 CHECK (amount_mmk >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (doctor_id, fee_type)
);

CREATE INDEX IF NOT EXISTS idx_doctor_fees_doctor ON doctor_fees(doctor_id);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  price_mmk INTEGER NOT NULL DEFAULT 0 CHECK (price_mmk >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_services_name ON services(name);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(active);

CREATE TABLE IF NOT EXISTS hospital_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hospital_name TEXT NOT NULL DEFAULT 'Mudita Hospital',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  logo_path TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO hospital_settings (id, hospital_name, address, phone, logo_path)
VALUES (1, 'Mudita Hospital', '', '', '');
`,
	},
	{
		Name: "004_pharmacy",
		SQL: `
CREATE TABLE IF NOT EXISTS stock_locations (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT OR IGNORE INTO stock_locations (code, name) VALUES
  ('MAIN', 'Main pharmacy'),
  ('OT_RESERVED', 'OT reserved (Chat 6)'),
  ('OT_FLOOR', 'OT floor (Chat 6)');

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other'
    CHECK (category IN ('Injection', 'OPD', 'OT', 'Tablet', 'Syrup', 'Other')),
  pack_size INTEGER NOT NULL DEFAULT 1 CHECK (pack_size >= 1),
  buy_price_mmk INTEGER NOT NULL DEFAULT 0 CHECK (buy_price_mmk >= 0),
  sell_price_mmk INTEGER NOT NULL DEFAULT 0 CHECK (sell_price_mmk >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_items_code ON items(code);
CREATE INDEX IF NOT EXISTS idx_items_active ON items(active);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

CREATE TABLE IF NOT EXISTS item_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  location_code TEXT NOT NULL DEFAULT 'MAIN' REFERENCES stock_locations(code),
  batch_no TEXT NOT NULL DEFAULT '',
  expiry_date TEXT,
  qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_item_batches_item ON item_batches(item_id);
CREATE INDEX IF NOT EXISTS idx_item_batches_location ON item_batches(location_code);
CREATE INDEX IF NOT EXISTS idx_item_batches_expiry ON item_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_item_batches_fefo ON item_batches(item_id, location_code, expiry_date);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  batch_id INTEGER REFERENCES item_batches(id) ON DELETE SET NULL,
  location_code TEXT NOT NULL REFERENCES stock_locations(code),
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('PURCHASE', 'ADJUST', 'SALE', 'ISSUE', 'RETURN', 'WASTE', 'TRANSFER')),
  qty_delta INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
`,
	},
	{
		Name: "005_opd",
		SQL: `
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  age_years INTEGER,
  gender TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);

CREATE TABLE IF NOT EXISTS bill_number_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_num INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO bill_number_seq (id, next_num) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS opd_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no TEXT NOT NULL UNIQUE,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL DEFAULT '',
  patient_age_years INTEGER,
  patient_gender TEXT NOT NULL DEFAULT '',
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  doctor_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'paid', 'void')),
  total_mmk INTEGER NOT NULL DEFAULT 0 CHECK (total_mmk >= 0),
  paid_at TEXT,
  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  voided_at TEXT,
  voided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  void_reason TEXT NOT NULL DEFAULT '',
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_opd_bills_status ON opd_bills(status);
CREATE INDEX IF NOT EXISTS idx_opd_bills_created ON opd_bills(created_at);
CREATE INDEX IF NOT EXISTS idx_opd_bills_bill_no ON opd_bills(bill_no);
CREATE INDEX IF NOT EXISTS idx_opd_bills_patient_name ON opd_bills(patient_name);

CREATE TABLE IF NOT EXISTS bill_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES opd_bills(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL CHECK (line_type IN ('service', 'item', 'consultation')),
  ref_id INTEGER,
  code TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_mmk INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_mmk >= 0),
  line_total_mmk INTEGER NOT NULL DEFAULT 0 CHECK (line_total_mmk >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON bill_lines(bill_id);

-- Exact batch takes recorded at cash pay so void restores the same batches.
CREATE TABLE IF NOT EXISTS bill_stock_allocs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES opd_bills(id) ON DELETE CASCADE,
  bill_line_id INTEGER NOT NULL REFERENCES bill_lines(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  batch_id INTEGER NOT NULL REFERENCES item_batches(id),
  qty INTEGER NOT NULL CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_bill_stock_allocs_bill ON bill_stock_allocs(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_stock_allocs_line ON bill_stock_allocs(bill_line_id);
`,
	},
	{
		Name: "006_ot",
		SQL: `
UPDATE stock_locations SET name = 'OT reserved' WHERE code = 'OT_RESERVED';
UPDATE stock_locations SET name = 'OT floor' WHERE code = 'OT_FLOOR';

CREATE TABLE IF NOT EXISTS ot_case_number_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_num INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO ot_case_number_seq (id, next_num) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS ot_bill_number_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_num INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO ot_bill_number_seq (id, next_num) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS ot_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_no TEXT NOT NULL UNIQUE,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL DEFAULT '',
  patient_age_years INTEGER,
  patient_gender TEXT NOT NULL DEFAULT '',
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  doctor_name TEXT NOT NULL DEFAULT '',
  procedure_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'reconciled', 'billed', 'void')),
  issued_at TEXT,
  issued_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reconciled_at TEXT,
  reconciled_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ot_bill_id INTEGER,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ot_cases_status ON ot_cases(status);
CREATE INDEX IF NOT EXISTS idx_ot_cases_created ON ot_cases(created_at);
CREATE INDEX IF NOT EXISTS idx_ot_cases_case_no ON ot_cases(case_no);
CREATE INDEX IF NOT EXISTS idx_ot_cases_patient ON ot_cases(patient_name);

CREATE TABLE IF NOT EXISTS ot_case_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES ot_cases(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sell_price_mmk INTEGER NOT NULL DEFAULT 0 CHECK (sell_price_mmk >= 0),
  qty_issued INTEGER NOT NULL DEFAULT 0 CHECK (qty_issued >= 0),
  qty_used INTEGER NOT NULL DEFAULT 0 CHECK (qty_used >= 0),
  qty_returned INTEGER NOT NULL DEFAULT 0 CHECK (qty_returned >= 0),
  qty_wasted INTEGER NOT NULL DEFAULT 0 CHECK (qty_wasted >= 0),
  qty_kept_on_floor INTEGER NOT NULL DEFAULT 0 CHECK (qty_kept_on_floor >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ot_case_items_case ON ot_case_items(case_id);

-- Exact MAIN → OT_RESERVED batch takes at issue (reconcile uses reserved_batch_id).
CREATE TABLE IF NOT EXISTS ot_case_issue_allocs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES ot_cases(id) ON DELETE CASCADE,
  case_item_id INTEGER NOT NULL REFERENCES ot_case_items(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  main_batch_id INTEGER NOT NULL REFERENCES item_batches(id),
  reserved_batch_id INTEGER NOT NULL REFERENCES item_batches(id),
  qty INTEGER NOT NULL CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_ot_issue_allocs_case ON ot_case_issue_allocs(case_id);
CREATE INDEX IF NOT EXISTS idx_ot_issue_allocs_item ON ot_case_issue_allocs(case_item_id);

CREATE TABLE IF NOT EXISTS ot_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no TEXT NOT NULL UNIQUE,
  case_id INTEGER NOT NULL REFERENCES ot_cases(id),
  case_no TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL DEFAULT '',
  patient_age_years INTEGER,
  patient_gender TEXT NOT NULL DEFAULT '',
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  doctor_name TEXT NOT NULL DEFAULT '',
  procedure_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'paid', 'void')),
  total_mmk INTEGER NOT NULL DEFAULT 0 CHECK (total_mmk >= 0),
  paid_at TEXT,
  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  voided_at TEXT,
  voided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  void_reason TEXT NOT NULL DEFAULT '',
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ot_bills_status ON ot_bills(status);
CREATE INDEX IF NOT EXISTS idx_ot_bills_case ON ot_bills(case_id);
CREATE INDEX IF NOT EXISTS idx_ot_bills_bill_no ON ot_bills(bill_no);

CREATE TABLE IF NOT EXISTS ot_bill_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES ot_bills(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL CHECK (line_type IN ('service', 'item', 'ot_fee')),
  ref_id INTEGER,
  code TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_mmk INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_mmk >= 0),
  line_total_mmk INTEGER NOT NULL DEFAULT 0 CHECK (line_total_mmk >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ot_bill_lines_bill ON ot_bill_lines(bill_id);
`,
	},
	{
		Name: "007_pharmacy_units_billing",
		SQL: `
-- Dual-unit fields on items (stock ledger stays in stock_unit).
ALTER TABLE items ADD COLUMN purchase_unit TEXT NOT NULL DEFAULT 'Box';
ALTER TABLE items ADD COLUMN stock_unit TEXT NOT NULL DEFAULT 'Piece';
ALTER TABLE items ADD COLUMN billing_unit TEXT NOT NULL DEFAULT 'Piece';
ALTER TABLE items ADD COLUMN units_per_purchase INTEGER NOT NULL DEFAULT 1 CHECK (units_per_purchase >= 1);
ALTER TABLE items ADD COLUMN billing_per_stock INTEGER NOT NULL DEFAULT 1 CHECK (billing_per_stock >= 1);
ALTER TABLE items ADD COLUMN charge_full_stock_unit INTEGER NOT NULL DEFAULT 0;

-- Migrate pack_size → units_per_purchase; set category-based unit defaults.
UPDATE items SET units_per_purchase = pack_size WHERE pack_size >= 1;

UPDATE items SET
  purchase_unit = 'Box',
  stock_unit = 'Tablet',
  billing_unit = 'Tablet',
  billing_per_stock = 1,
  charge_full_stock_unit = 0
WHERE category = 'Tablet';

UPDATE items SET
  purchase_unit = 'Box',
  stock_unit = 'Vial',
  billing_unit = 'mL',
  billing_per_stock = 1,
  charge_full_stock_unit = 1
WHERE category = 'Injection';

UPDATE items SET
  purchase_unit = 'Bottle',
  stock_unit = 'Bottle',
  billing_unit = 'mL',
  billing_per_stock = 1,
  charge_full_stock_unit = 0
WHERE category = 'Syrup';

UPDATE items SET
  purchase_unit = 'Box',
  stock_unit = 'Piece',
  billing_unit = 'Piece',
  billing_per_stock = 1,
  charge_full_stock_unit = 0
WHERE category IN ('OT', 'OPD', 'Other');

CREATE TABLE IF NOT EXISTS pharmacy_bill_number_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_num INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO pharmacy_bill_number_seq (id, next_num) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS pharmacy_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no TEXT NOT NULL UNIQUE,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL DEFAULT '',
  patient_age_years INTEGER,
  patient_gender TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'paid', 'void')),
  total_mmk INTEGER NOT NULL DEFAULT 0 CHECK (total_mmk >= 0),
  paid_at TEXT,
  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  voided_at TEXT,
  voided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  void_reason TEXT NOT NULL DEFAULT '',
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_bills_status ON pharmacy_bills(status);
CREATE INDEX IF NOT EXISTS idx_pharmacy_bills_created ON pharmacy_bills(created_at);
CREATE INDEX IF NOT EXISTS idx_pharmacy_bills_bill_no ON pharmacy_bills(bill_no);
CREATE INDEX IF NOT EXISTS idx_pharmacy_bills_patient_name ON pharmacy_bills(patient_name);

CREATE TABLE IF NOT EXISTS pharmacy_bill_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES pharmacy_bills(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  code TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  billing_qty INTEGER NOT NULL DEFAULT 1 CHECK (billing_qty > 0),
  billing_unit TEXT NOT NULL DEFAULT 'Piece',
  stock_qty INTEGER NOT NULL DEFAULT 1 CHECK (stock_qty > 0),
  stock_unit TEXT NOT NULL DEFAULT 'Piece',
  unit_price_mmk INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_mmk >= 0),
  line_total_mmk INTEGER NOT NULL DEFAULT 0 CHECK (line_total_mmk >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_bill_lines_bill ON pharmacy_bill_lines(bill_id);

CREATE TABLE IF NOT EXISTS pharmacy_bill_stock_allocs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES pharmacy_bills(id) ON DELETE CASCADE,
  bill_line_id INTEGER NOT NULL REFERENCES pharmacy_bill_lines(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  batch_id INTEGER NOT NULL REFERENCES item_batches(id),
  qty INTEGER NOT NULL CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_bill_stock_allocs_bill ON pharmacy_bill_stock_allocs(bill_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_bill_stock_allocs_line ON pharmacy_bill_stock_allocs(bill_line_id);
`,
	},
}

// Migrate applies pending migrations inside a transaction per migration.
func Migrate(sqlDB *sql.DB) error {
	// Bootstrap table so we can track everything (including this first script).
	if _, err := sqlDB.Exec(migrations[0].SQL); err != nil {
		return fmt.Errorf("bootstrap schema_migrations: %w", err)
	}

	for _, m := range migrations {
		var exists int
		err := sqlDB.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = ?`, m.Name).Scan(&exists)
		if err != nil {
			return fmt.Errorf("check migration %s: %w", m.Name, err)
		}
		if exists > 0 {
			continue
		}

		tx, err := sqlDB.Begin()
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", m.Name, err)
		}

		if _, err := tx.Exec(m.SQL); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("run migration %s: %w", m.Name, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (name) VALUES (?)`, m.Name); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", m.Name, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", m.Name, err)
		}
	}

	return nil
}
