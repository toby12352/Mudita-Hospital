package handlers

import (
	"database/sql"
	"strings"
)

// refreshLinkedPatient writes the desk header onto an existing chart.
// Notes are left as they are. sql.ErrNoRows means the id is not a chart.
// father nil leaves patients.father_mother_name unchanged; a non-nil value (including "") writes it.
func refreshLinkedPatient(tx *sql.Tx, id int64, name, phone, gender string, age *int64, father *string) error {
	var exists int
	err := tx.QueryRow(`SELECT 1 FROM patients WHERE id = ?`, id).Scan(&exists)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`
		UPDATE patients
		SET name = ?, phone = ?, age_years = ?, gender = ?,
			father_mother_name = COALESCE(?, father_mother_name),
			updated_at = datetime('now')
		WHERE id = ?
	`, strings.TrimSpace(name), strings.TrimSpace(phone), age, strings.TrimSpace(gender), optionalStringArg(father), id)
	return err
}

// resolveDeskPatient uses an explicit chart when the client sends one.
// Omitting the id keeps the caller's current save path (OPD upsert, or no chart).
// A blank name never creates or overwrites a chart; an explicit id is still kept as a link.
// father is chart-only (not a bill column); nil leaves the chart value alone.
func resolveDeskPatient(tx *sql.Tx, explicit *int64, save bool, name, phone, gender string, age *int64, father *string, upsert func() (int64, error)) (*int64, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		if explicit != nil && *explicit > 0 {
			var exists int
			if err := tx.QueryRow(`SELECT 1 FROM patients WHERE id = ?`, *explicit).Scan(&exists); err != nil {
				return nil, err
			}
			id := *explicit
			return &id, nil
		}
		return nil, nil
	}
	if explicit != nil && *explicit > 0 {
		if err := refreshLinkedPatient(tx, *explicit, name, phone, gender, age, father); err != nil {
			return nil, err
		}
		id := *explicit
		return &id, nil
	}
	if !save {
		return nil, nil
	}
	id, err := upsert()
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// storedCasePatientID checks a chart id for an OT case. It does not change the chart.
// A missing or omitted id stores null on the case.
func storedCasePatientID(tx *sql.Tx, explicit *int64) (*int64, error) {
	if explicit == nil || *explicit <= 0 {
		return nil, nil
	}
	var n int
	err := tx.QueryRow(`SELECT 1 FROM patients WHERE id = ?`, *explicit).Scan(&n)
	if err != nil {
		return nil, err
	}
	id := *explicit
	return &id, nil
}
