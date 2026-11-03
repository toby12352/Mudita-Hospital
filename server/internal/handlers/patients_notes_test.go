package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestPatientTimelineNotesAPI(t *testing.T) {
	sqlDB := openTestDB(t)
	adminID, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	otherID, otherTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, opdTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	h := &Patients{DB: sqlDB}

	w := doJSON(h, http.MethodPost, "/api/patients", adminTok, `{"name":"Timeline Patient"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	base := "/api/patients/" + strconv.FormatInt(chart.ID, 10) + "/notes"

	w = doJSON(h, http.MethodGet, base, "", "")
	mustCode(t, w, http.StatusUnauthorized)

	w = doJSON(h, http.MethodGet, base, opdTok, "")
	mustCode(t, w, http.StatusOK)

	w = doJSON(h, http.MethodGet, base, adminTok, "")
	mustCode(t, w, http.StatusOK)
	if got := decodeTimelineNotes(t, w); len(got) != 0 {
		t.Fatalf("expected empty notes, got %+v", got)
	}

	w = doJSON(h, http.MethodPost, base, adminTok, `{"body":"  "}`)
	mustCode(t, w, http.StatusBadRequest)

	w = doJSON(h, http.MethodPost, base, opdTok, `{"body":"desk note"}`)
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(h, http.MethodPost, base, adminTok, `{"body":"  First visit note  "}`)
	mustCode(t, w, http.StatusCreated)
	first := decodeTimelineNote(t, w)
	if first.Body != "First visit note" || first.PatientID != chart.ID {
		t.Fatalf("created %+v", first)
	}
	if first.AuthorUserID == nil || *first.AuthorUserID != adminID {
		t.Fatalf("author %+v want %d", first.AuthorUserID, adminID)
	}
	if first.AuthorName == "" || first.CreatedAt == "" {
		t.Fatalf("missing author/time %+v", first)
	}

	w = doJSON(h, http.MethodPost, base, otherTok, `{"body":"Second note"}`)
	mustCode(t, w, http.StatusCreated)
	second := decodeTimelineNote(t, w)
	if second.AuthorUserID == nil || *second.AuthorUserID != otherID {
		t.Fatalf("second author %+v", second)
	}

	w = doJSON(h, http.MethodGet, base, adminTok, "")
	mustCode(t, w, http.StatusOK)
	list := decodeTimelineNotes(t, w)
	if len(list) != 2 {
		t.Fatalf("list len %d: %+v", len(list), list)
	}
	if list[0].ID != second.ID || list[1].ID != first.ID {
		t.Fatalf("order %+v", list)
	}

	patchPath := base + "/" + strconv.FormatInt(first.ID, 10)
	w = doJSON(h, http.MethodPatch, patchPath, otherTok, `{"body":"hijack"}`)
	mustCode(t, w, http.StatusForbidden)

	w = doJSON(h, http.MethodPatch, patchPath, adminTok, `{"body":"Corrected first note"}`)
	mustCode(t, w, http.StatusOK)
	edited := decodeTimelineNote(t, w)
	if edited.Body != "Corrected first note" {
		t.Fatalf("edited %+v", edited)
	}

	var dbCreated, dbUpdated string
	if err := sqlDB.QueryRow(`
		SELECT created_at, updated_at FROM patient_timeline_notes WHERE id = ?
	`, first.ID).Scan(&dbCreated, &dbUpdated); err != nil {
		t.Fatal(err)
	}
	if dbUpdated < dbCreated {
		t.Fatalf("updated_at before created_at: %s < %s", dbUpdated, dbCreated)
	}

	w = doJSON(h, http.MethodPatch, base+"/999999", adminTok, `{"body":"missing"}`)
	mustCode(t, w, http.StatusNotFound)
}

func decodeTimelineNote(t *testing.T, w *httptest.ResponseRecorder) patientTimelineNote {
	t.Helper()
	var n patientTimelineNote
	if err := json.Unmarshal(w.Body.Bytes(), &n); err != nil {
		t.Fatalf("decode note: %v body=%s", err, w.Body.String())
	}
	return n
}

func decodeTimelineNotes(t *testing.T, w *httptest.ResponseRecorder) []patientTimelineNote {
	t.Helper()
	var out struct {
		Notes []patientTimelineNote `json:"notes"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode notes: %v body=%s", err, w.Body.String())
	}
	return out.Notes
}
