package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestOpenStayRoomByPatient(t *testing.T) {
	sqlDB := openTestDB(t)
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	_, ipdTok := insertSession(t, sqlDB, auth.RoleIPD, 0)
	charts := &Patients{DB: sqlDB}
	ipd := &IPD{DB: sqlDB}
	opd := &OPD{DB: sqlDB}

	w := doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Room Stay","phone":"091"}`)
	mustCode(t, w, http.StatusCreated)
	withRoom := decodePatient(t, w)

	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Blank Room","phone":"092"}`)
	mustCode(t, w, http.StatusCreated)
	blankRoom := decodePatient(t, w)

	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Settled","phone":"093"}`)
	mustCode(t, w, http.StatusCreated)
	settled := decodePatient(t, w)

	w = doJSON(charts, http.MethodPost, "/api/patients", adminTok, `{"name":"Walk In","phone":"094"}`)
	mustCode(t, w, http.StatusCreated)
	walkIn := decodePatient(t, w)

	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", ipdTok, `{"patient_id":`+strconv.FormatInt(withRoom.ID, 10)+`}`)
	mustCode(t, w, http.StatusCreated)
	stayWithRoom := decodeAdmission(t, w)
	w = doJSON(ipd, http.MethodPut, "/api/ipd/admissions/"+strconv.FormatInt(stayWithRoom.ID, 10), ipdTok, `{"notes":"","room_no":"207"}`)
	mustCode(t, w, http.StatusOK)

	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", ipdTok, `{"patient_id":`+strconv.FormatInt(blankRoom.ID, 10)+`}`)
	mustCode(t, w, http.StatusCreated)

	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", ipdTok, `{"patient_id":`+strconv.FormatInt(settled.ID, 10)+`}`)
	mustCode(t, w, http.StatusCreated)
	staySettled := decodeAdmission(t, w)
	w = doJSON(ipd, http.MethodPut, "/api/ipd/admissions/"+strconv.FormatInt(staySettled.ID, 10), ipdTok, `{"notes":"","room_no":"101"}`)
	mustCode(t, w, http.StatusOK)
	if _, err := sqlDB.Exec(`
		UPDATE ipd_admissions
		SET status = 'settled', discharged_at = datetime('now'), updated_at = datetime('now')
		WHERE id = ?
	`, staySettled.ID); err != nil {
		t.Fatal(err)
	}

	rooms, err := openStayRoomByPatient(sqlDB, []int64{withRoom.ID, blankRoom.ID, settled.ID, walkIn.ID, 0, withRoom.ID, 999999})
	if err != nil {
		t.Fatal(err)
	}
	if rooms[withRoom.ID] != "207" {
		t.Fatalf("open stay room: %+v", rooms)
	}
	if _, ok := rooms[blankRoom.ID]; ok {
		t.Fatalf("blank room should be omitted: %+v", rooms)
	}
	if _, ok := rooms[settled.ID]; ok {
		t.Fatalf("settled stay should be omitted: %+v", rooms)
	}
	if _, ok := rooms[walkIn.ID]; ok {
		t.Fatalf("no stay should be omitted: %+v", rooms)
	}
	if _, ok := rooms[999999]; ok {
		t.Fatalf("unknown patient should be omitted: %+v", rooms)
	}

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", adminTok, `{
		"patient_id":`+strconv.FormatInt(withRoom.ID, 10)+`,
		"patient_name":"Room Stay",
		"lines":[]
	}`)
	mustCode(t, w, http.StatusCreated)

	w = doJSON(opd, http.MethodPost, "/api/opd/bills", adminTok, `{
		"patient_name":"Walk-in",
		"lines":[]
	}`)
	mustCode(t, w, http.StatusCreated)

	w = doJSON(opd, http.MethodGet, "/api/opd/bills", adminTok, "")
	mustCode(t, w, http.StatusOK)
	var payload struct {
		Bills []opdBill `json:"bills"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	var foundRoom, foundWalkIn bool
	for _, b := range payload.Bills {
		if b.PatientID != nil && *b.PatientID == withRoom.ID {
			foundRoom = true
			if b.IpdRoomNo != "207" {
				t.Fatalf("list room tag %+v", b)
			}
		}
		if b.PatientName == "Walk-in" {
			foundWalkIn = true
			if b.IpdRoomNo != "" {
				t.Fatalf("walk-in should have no room %+v", b)
			}
		}
	}
	if !foundRoom || !foundWalkIn {
		t.Fatalf("expected both bills in list: %+v", payload.Bills)
	}
}
