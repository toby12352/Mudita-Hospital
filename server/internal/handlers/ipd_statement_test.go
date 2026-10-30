package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"testing"
)

func TestIpdStatementDaysAndDaily(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	charts := &Patients{DB: sqlDB}
	ipd := &IPD{DB: sqlDB}

	if _, err := sqlDB.Exec(`
		UPDATE hospital_settings
		SET hospital_name = 'Verify Hospital', address = '1 Lane', phone = '091000', phone2 = '092000'
		WHERE id = 1
	`); err != nil {
		t.Fatal(err)
	}

	w := doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"Daw Statement","phone":"091111"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)

	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)
	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET admitted_at = '2026-01-01 01:00:00', room_no = '12A' WHERE id = ?`, stay.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, note, created_at) VALUES
			(?, 'deposit', 1000, 'day-one', '2026-01-01 02:00:00'),
			(?, 'ward', -400, 'boundary', '2026-01-01 18:00:00')
	`, stay.ID, stay.ID); err != nil {
		t.Fatal(err)
	}
	path := "/api/ipd/admissions/" + strconv.FormatInt(stay.ID, 10) + "/statement"

	w = doJSON(ipd, http.MethodGet, path, token, "")
	mustCode(t, w, http.StatusOK)
	finalHTML := w.Body.String()
	for _, want := range []string{
		"IPD FINAL STATEMENT",
		"Verify Hospital",
		"1 Lane",
		"Tel: 091000 / 092000",
		"data:image/png;base64,",
		"Daw Statement",
		"091111",
		stay.AdmissionNo,
		"Room no.",
		"12A",
		`class="a4-day">01 Jan 2026`,
		`class="a4-day">02 Jan 2026`,
		"day-one",
		"boundary",
		"08:30",
		"00:30",
		"Day total",
		">ပိုငွေ</td><td>600 MMK</td>",
	} {
		if !strings.Contains(finalHTML, want) {
			t.Fatalf("final statement missing %q:\n%s", want, finalHTML)
		}
	}
	if strings.Contains(finalHTML, "18:00:00") {
		t.Fatalf("raw UTC timestamp leaked onto the sheet:\n%s", finalHTML)
	}
	dayOne := strings.Index(finalHTML, `class="a4-day">01 Jan 2026`)
	noteOne := strings.Index(finalHTML, "day-one")
	dayTwo := strings.Index(finalHTML, `class="a4-day">02 Jan 2026`)
	noteTwo := strings.Index(finalHTML, "boundary")
	if !(dayOne >= 0 && dayOne < noteOne && noteOne < dayTwo && dayTwo < noteTwo) {
		t.Fatalf("day sections out of order: day1 %d note1 %d day2 %d note2 %d", dayOne, noteOne, dayTwo, noteTwo)
	}

	w = doJSON(ipd, http.MethodGet, path+"?date=2026-01-01", token, "")
	mustCode(t, w, http.StatusOK)
	jan1 := w.Body.String()
	for _, want := range []string{
		"IPD DAILY STATEMENT",
		"Room no.",
		"12A",
		"day-one",
		"08:30",
		">Deposited Fee</th>",
		">To Pay</th>",
		">Difference</th>",
		`>Deposit</td><td>day-one</td><td class="a4-time">08:30</td><td class="col-amt">1,000</td><td class="col-amt"></td><td class="col-amt">1,000</td>`,
		">Day deposited</td><td>1,000 MMK</td>",
		">Day to pay</td><td>0 MMK</td>",
		">ပိုငွေ</td><td>1,000 MMK</td>",
	} {
		if !strings.Contains(jan1, want) {
			t.Fatalf("1 Jan daily missing %q:\n%s", want, jan1)
		}
	}
	if strings.Contains(jan1, ">MMK</th>") || strings.Contains(jan1, "Day total") {
		t.Fatalf("1 Jan daily kept the single MMK column:\n%s", jan1)
	}
	if strings.Contains(jan1, "boundary") || strings.Contains(jan1, "00:30") || strings.Contains(jan1, `class="a4-day"`) {
		t.Fatalf("1 Jan daily included the next Yangon day:\n%s", jan1)
	}

	w = doJSON(ipd, http.MethodGet, path+"?date=2026-01-02", token, "")
	mustCode(t, w, http.StatusOK)
	jan2 := w.Body.String()
	for _, want := range []string{
		"IPD DAILY STATEMENT",
		"boundary",
		"00:30",
		`>Ward</td><td>boundary</td><td class="a4-time">00:30</td><td class="col-amt"></td><td class="col-amt">400</td><td class="col-amt">-400</td>`,
		">Day deposited</td><td>0 MMK</td>",
		">Day to pay</td><td>400 MMK</td>",
		">လိုငွေ</td><td>400 MMK</td>",
	} {
		if !strings.Contains(jan2, want) {
			t.Fatalf("2 Jan daily missing %q:\n%s", want, jan2)
		}
	}
	if strings.Contains(jan2, "day-one") || strings.Contains(jan2, "ပိုငွေ") {
		t.Fatalf("2 Jan daily included 1 Jan or a carry without a stored voucher:\n%s", jan2)
	}

	w = doJSON(ipd, http.MethodGet, path+"?date=2026-01-03", token, "")
	mustCode(t, w, http.StatusOK)
	emptyDay := w.Body.String()
	for _, want := range []string{
		"No lines on this date.",
		">Deposited Fee</th>",
		">To Pay</th>",
		">Difference</th>",
		">Day deposited</td><td>0 MMK</td>",
		">Day to pay</td><td>0 MMK</td>",
		">ပိုငွေ</td><td>0 MMK</td>",
	} {
		if !strings.Contains(emptyDay, want) {
			t.Fatalf("empty day missing %q:\n%s", want, emptyDay)
		}
	}
	if strings.Contains(emptyDay, "day-one") || strings.Contains(emptyDay, "boundary") || strings.Contains(emptyDay, "600") {
		t.Fatalf("empty day listed lines or a carry without a stored voucher:\n%s", emptyDay)
	}

	w = doJSON(ipd, http.MethodGet, path+"?date=2026-13-01", token, "")
	mustCode(t, w, http.StatusBadRequest)
	if !strings.Contains(w.Body.String(), "invalid date") {
		t.Fatalf("bad date body %s", w.Body.String())
	}

	w = doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"U One Day","phone":"092222"}`)
	mustCode(t, w, http.StatusCreated)
	oneChart := decodePatient(t, w)
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, oneChart.ID))
	mustCode(t, w, http.StatusCreated)
	one := decodeAdmission(t, w)
	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET admitted_at = '2026-03-01 01:00:00' WHERE id = ?`, one.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, note, created_at)
		VALUES (?, 'deposit', 2500, 'only-day', '2026-03-01 04:00:00')
	`, one.ID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ipd, http.MethodGet, "/api/ipd/admissions/"+strconv.FormatInt(one.ID, 10)+"/statement", token, "")
	mustCode(t, w, http.StatusOK)
	oneDay := w.Body.String()
	for _, want := range []string{"IPD FINAL STATEMENT", "01 Mar 2026", "only-day", "10:30", ">ပိုငွေ</td><td>2,500 MMK</td>"} {
		if !strings.Contains(oneDay, want) {
			t.Fatalf("one-day statement missing %q:\n%s", want, oneDay)
		}
	}
	if strings.Contains(oneDay, `class="a4-day"`) || strings.Contains(oneDay, "Day total") {
		t.Fatalf("one-day statement added day sections:\n%s", oneDay)
	}

	w = doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"Daw Empty","phone":"093333"}`)
	mustCode(t, w, http.StatusCreated)
	blankChart := decodePatient(t, w)
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, blankChart.ID))
	mustCode(t, w, http.StatusCreated)
	blank := decodeAdmission(t, w)
	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET admitted_at = '2026-04-04 01:00:00' WHERE id = ?`, blank.ID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ipd, http.MethodGet, "/api/ipd/admissions/"+strconv.FormatInt(blank.ID, 10)+"/statement", token, "")
	mustCode(t, w, http.StatusOK)
	blankHTML := w.Body.String()
	if !strings.Contains(blankHTML, "No ledger lines.") || !strings.Contains(blankHTML, "04 Apr 2026") || strings.Contains(blankHTML, `class="a4-day"`) {
		t.Fatalf("empty stay sheet:\n%s", blankHTML)
	}
	if !strings.Contains(blankHTML, ">ပိုငွေ</td><td>0 MMK</td>") {
		t.Fatalf("empty stay should show zero ပိုငွေ:\n%s", blankHTML)
	}

	w = doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"Daw Owing","phone":"094444"}`)
	mustCode(t, w, http.StatusCreated)
	owingChart := decodePatient(t, w)
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, owingChart.ID))
	mustCode(t, w, http.StatusCreated)
	owing := decodeAdmission(t, w)
	if _, err := sqlDB.Exec(`UPDATE ipd_admissions SET admitted_at = '2026-05-01 01:00:00' WHERE id = ?`, owing.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, note, created_at)
		VALUES (?, 'ward', -750, 'owing-ward', '2026-05-01 04:00:00')
	`, owing.ID); err != nil {
		t.Fatal(err)
	}
	w = doJSON(ipd, http.MethodGet, "/api/ipd/admissions/"+strconv.FormatInt(owing.ID, 10)+"/statement", token, "")
	mustCode(t, w, http.StatusOK)
	owingHTML := w.Body.String()
	if !strings.Contains(owingHTML, ">လိုငွေ</td><td>750 MMK</td>") {
		t.Fatalf("owing stay missing လိုငွေ:\n%s", owingHTML)
	}
	if strings.Contains(owingHTML, "ပိုငွေ") {
		t.Fatalf("owing stay should not print ပိုငွေ:\n%s", owingHTML)
	}
	if strings.Contains(owingHTML, "Deposited Fee") || strings.Contains(owingHTML, ">To Pay</th>") {
		t.Fatalf("final statement picked up the daily columns:\n%s", owingHTML)
	}
}

func TestIpdDailyStatementOpeningDue(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	charts := &Patients{DB: sqlDB}
	ipd := &IPD{DB: sqlDB}

	w := doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"Daw Carry","phone":"095555"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_day_vouchers (admission_id, civil_date, status, closing_mmk)
		VALUES (?, '2026-06-01', 'credit', -30000)
	`, stay.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, note, created_at)
		VALUES (?, 'ward', -10000, 'nursing', '2026-06-02 02:00:00')
	`, stay.ID); err != nil {
		t.Fatal(err)
	}

	w = doJSON(ipd, http.MethodGet, "/api/ipd/admissions/"+strconv.FormatInt(stay.ID, 10)+"/statement?date=2026-06-02", token, "")
	mustCode(t, w, http.StatusOK)
	page := w.Body.String()
	opening := `>လိုငွေ</td><td></td><td class="a4-time"></td><td class="col-amt"></td><td class="col-amt">30,000</td><td class="col-amt">-30,000</td>`
	ward := `>Ward</td><td>nursing</td><td class="a4-time">08:30</td><td class="col-amt"></td><td class="col-amt">10,000</td><td class="col-amt">-40,000</td>`
	for _, want := range []string{
		"IPD DAILY STATEMENT",
		">Deposited Fee</th>",
		">To Pay</th>",
		">Difference</th>",
		opening,
		ward,
		">Day deposited</td><td>0 MMK</td>",
		">Day to pay</td><td>40,000 MMK</td>",
		`class="emph"><td>လိုငွေ</td><td>40,000 MMK</td>`,
	} {
		if !strings.Contains(page, want) {
			t.Fatalf("opening due sheet missing %q:\n%s", want, page)
		}
	}
	if strings.Index(page, opening) > strings.Index(page, ward) {
		t.Fatalf("opening row is not first:\n%s", page)
	}
	if strings.Contains(page, ">MMK</th>") || strings.Contains(page, "Day total") {
		t.Fatalf("opening due sheet kept the final column layout:\n%s", page)
	}

	w = doJSON(ipd, http.MethodGet, "/api/ipd/admissions/"+strconv.FormatInt(stay.ID, 10)+"/statement", token, "")
	mustCode(t, w, http.StatusOK)
	finalHTML := w.Body.String()
	if !strings.Contains(finalHTML, ">MMK</th>") || strings.Contains(finalHTML, "Deposited Fee") {
		t.Fatalf("final statement changed:\n%s", finalHTML)
	}
	if !strings.Contains(finalHTML, ">လိုငွေ</td><td>10,000 MMK</td>") {
		t.Fatalf("final statement should keep the stay balance:\n%s", finalHTML)
	}
}

func TestIpdDailyStatementRefusesIssuedPrior(t *testing.T) {
	sqlDB := openTestDB(t)
	_, token := insertSession(t, sqlDB, "Admin", 0)
	charts := &Patients{DB: sqlDB}
	ipd := &IPD{DB: sqlDB}

	w := doJSON(charts, http.MethodPost, "/api/patients", token, `{"name":"U Issued","phone":"096666"}`)
	mustCode(t, w, http.StatusCreated)
	chart := decodePatient(t, w)
	w = doJSON(ipd, http.MethodPost, "/api/ipd/admissions", token, fmt.Sprintf(`{"patient_id":%d}`, chart.ID))
	mustCode(t, w, http.StatusCreated)
	stay := decodeAdmission(t, w)
	if _, err := sqlDB.Exec(`
		INSERT INTO ipd_day_vouchers (admission_id, civil_date, status, closing_mmk)
		VALUES (?, '2026-07-01', 'issued', -1000)
	`, stay.ID); err != nil {
		t.Fatal(err)
	}

	w = doJSON(ipd, http.MethodGet, "/api/ipd/admissions/"+strconv.FormatInt(stay.ID, 10)+"/statement?date=2026-07-02", token, "")
	mustCode(t, w, http.StatusConflict)
	if !strings.Contains(w.Body.String(), "still issued") {
		t.Fatalf("issued prior body %s", w.Body.String())
	}
	if strings.Contains(w.Body.String(), "IPD DAILY STATEMENT") {
		t.Fatalf("issued prior still printed a sheet:\n%s", w.Body.String())
	}
}
