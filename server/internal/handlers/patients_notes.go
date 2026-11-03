package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

const patientTimelineNoteMaxRunes = 4000

type patientTimelineNote struct {
	ID           int64  `json:"id"`
	PatientID    int64  `json:"patient_id"`
	Body         string `json:"body"`
	AuthorUserID *int64 `json:"author_user_id,omitempty"`
	AuthorName   string `json:"author_name"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

type patientTimelineNoteWrite struct {
	Body string `json:"body"`
}

func (h *Patients) listNotes(w http.ResponseWriter, _ *http.Request, path string) {
	patientID, ok := parseNotesPatientID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if _, err := loadPatient(h.DB, patientID); err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	rows, err := h.DB.Query(`
		SELECT id, patient_id, body, author_user_id, author_name, created_at, updated_at
		FROM patient_timeline_notes
		WHERE patient_id = ?
		ORDER BY created_at DESC, id DESC
	`, patientID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	defer rows.Close()

	list := make([]patientTimelineNote, 0)
	for rows.Next() {
		n, err := scanTimelineNote(rows)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, n)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"notes": list})
}

func (h *Patients) createNote(w http.ResponseWriter, r *http.Request, path string) {
	patientID, ok := parseNotesPatientID(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if _, err := loadPatient(h.DB, patientID); err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	body, ok := decodeTimelineNoteBody(w, r)
	if !ok {
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user == nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	authorName := strings.TrimSpace(user.DisplayName)
	if authorName == "" {
		authorName = user.Username
	}

	res, err := h.DB.Exec(`
		INSERT INTO patient_timeline_notes (patient_id, body, author_user_id, author_name)
		VALUES (?, ?, ?, ?)
	`, patientID, body, user.ID, authorName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create failed"})
		return
	}
	noteID, _ := res.LastInsertId()
	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "create", "patient_timeline_note", &noteID, map[string]any{
		"patient_id": patientID,
	})

	n, err := loadTimelineNote(h.DB, noteID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusCreated, n)
}

func (h *Patients) updateNote(w http.ResponseWriter, r *http.Request, path string) {
	patientID, noteID, ok := parseNoteIDs(path)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if _, err := loadPatient(h.DB, patientID); err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}

	existing, err := loadTimelineNote(h.DB, noteID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "load failed"})
		return
	}
	if existing.PatientID != patientID {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}

	user := middleware.UserFromContext(r.Context())
	if user == nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	if existing.AuthorUserID == nil || *existing.AuthorUserID != user.ID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	body, ok := decodeTimelineNoteBody(w, r)
	if !ok {
		return
	}

	res, err := h.DB.Exec(`
		UPDATE patient_timeline_notes
		SET body = ?, updated_at = datetime('now')
		WHERE id = ? AND patient_id = ?
	`, body, noteID, patientID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}

	uid := user.ID
	audit.WriteAudit(h.DB, &uid, "update", "patient_timeline_note", &noteID, map[string]any{
		"patient_id": patientID,
	})

	updated, err := loadTimelineNote(h.DB, noteID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "reload failed"})
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func decodeTimelineNoteBody(w http.ResponseWriter, r *http.Request) (string, bool) {
	var req patientTimelineNoteWrite
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return "", false
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body required"})
		return "", false
	}
	if utf8.RuneCountInString(body) > patientTimelineNoteMaxRunes {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body too long"})
		return "", false
	}
	return body, true
}

func parseNotesPatientID(path string) (int64, bool) {
	idPath := strings.TrimSuffix(path, "/notes")
	return parseID(idPath)
}

func parseNoteIDs(path string) (patientID, noteID int64, ok bool) {
	raw := strings.TrimPrefix(path, "/")
	parts := strings.Split(raw, "/")
	if len(parts) != 3 || parts[1] != "notes" {
		return 0, 0, false
	}
	patientID, err1 := strconv.ParseInt(parts[0], 10, 64)
	noteID, err2 := strconv.ParseInt(parts[2], 10, 64)
	if err1 != nil || err2 != nil || patientID < 1 || noteID < 1 {
		return 0, 0, false
	}
	return patientID, noteID, true
}

func loadTimelineNote(db *sql.DB, id int64) (patientTimelineNote, error) {
	row := db.QueryRow(`
		SELECT id, patient_id, body, author_user_id, author_name, created_at, updated_at
		FROM patient_timeline_notes
		WHERE id = ?
	`, id)
	return scanTimelineNote(row)
}

type timelineNoteScanner interface {
	Scan(dest ...any) error
}

func scanTimelineNote(sc timelineNoteScanner) (patientTimelineNote, error) {
	var n patientTimelineNote
	var authorID sql.NullInt64
	err := sc.Scan(&n.ID, &n.PatientID, &n.Body, &authorID, &n.AuthorName, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		return n, err
	}
	if authorID.Valid {
		v := authorID.Int64
		n.AuthorUserID = &v
	}
	return n, nil
}
