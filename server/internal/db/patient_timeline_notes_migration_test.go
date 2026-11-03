package db

import "testing"

// Isolated upgrade check: an existing chart survives 047_patient_timeline_notes.
func TestPatientTimelineNotesMigrationPreservesPatients(t *testing.T) {
	sqlDB := openUserGrantMem(t)
	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("fresh migrate: %v", err)
	}

	res, err := sqlDB.Exec(`
		INSERT INTO patients (name, phone, notes)
		VALUES ('Daw Timeline', '0999000111', 'standing note')
	`)
	if err != nil {
		t.Fatalf("seed patient: %v", err)
	}
	patientID, _ := res.LastInsertId()

	var name, notes string
	if err := sqlDB.QueryRow(`SELECT name, notes FROM patients WHERE id = ?`, patientID).Scan(&name, &notes); err != nil {
		t.Fatalf("load patient: %v", err)
	}
	if name != "Daw Timeline" || notes != "standing note" {
		t.Fatalf("patient changed: name=%q notes=%q", name, notes)
	}

	var table string
	if err := sqlDB.QueryRow(`
		SELECT name FROM sqlite_master
		WHERE type = 'table' AND name = 'patient_timeline_notes'
	`).Scan(&table); err != nil {
		t.Fatalf("timeline table missing: %v", err)
	}

	if _, err := sqlDB.Exec(`
		INSERT INTO patient_timeline_notes (patient_id, body, author_name)
		VALUES (?, 'day one', 'Tester')
	`, patientID); err != nil {
		t.Fatalf("insert note: %v", err)
	}

	var body string
	if err := sqlDB.QueryRow(`
		SELECT body FROM patient_timeline_notes WHERE patient_id = ?
	`, patientID).Scan(&body); err != nil {
		t.Fatalf("read note: %v", err)
	}
	if body != "day one" {
		t.Fatalf("note body %q", body)
	}

	// Re-run Migrate: 047 must stay skipped and leave the chart alone.
	if err := Migrate(sqlDB); err != nil {
		t.Fatalf("re-migrate: %v", err)
	}
	if err := sqlDB.QueryRow(`SELECT name, notes FROM patients WHERE id = ?`, patientID).Scan(&name, &notes); err != nil {
		t.Fatalf("patient after remigrate: %v", err)
	}
	if name != "Daw Timeline" || notes != "standing note" {
		t.Fatalf("patient after remigrate: name=%q notes=%q", name, notes)
	}
}
