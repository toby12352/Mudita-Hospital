package handlers

import (
	"database/sql"
	"strings"
)

// openStayRoomByPatient returns non-empty room numbers for patients who have an
// open IPD stay. Settled or deleted stays and blank room_no values are omitted.
func openStayRoomByPatient(db *sql.DB, patientIDs []int64) (map[int64]string, error) {
	out := make(map[int64]string)
	if len(patientIDs) == 0 {
		return out, nil
	}
	seen := make(map[int64]struct{}, len(patientIDs))
	ids := make([]int64, 0, len(patientIDs))
	for _, id := range patientIDs {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return out, nil
	}

	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	rows, err := db.Query(`
		SELECT patient_id, COALESCE(room_no, '')
		FROM ipd_admissions
		WHERE status = 'open' AND patient_id IN (`+strings.Join(placeholders, ",")+`)
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var patientID int64
		var room string
		if err := rows.Scan(&patientID, &room); err != nil {
			return nil, err
		}
		room = strings.TrimSpace(room)
		if room == "" {
			continue
		}
		out[patientID] = room
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func collectOptionalPatientIDs(ids []*int64) []int64 {
	out := make([]int64, 0, len(ids))
	for _, p := range ids {
		if p != nil && *p > 0 {
			out = append(out, *p)
		}
	}
	return out
}
