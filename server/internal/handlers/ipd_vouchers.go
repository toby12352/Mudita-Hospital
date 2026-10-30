package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"mudita-hospital/server/internal/audit"
	"mudita-hospital/server/internal/middleware"
)

// Day vouchers are the morning decision for one civil date on a stay.
// Issue does not move cash. Pay collects a လိုငွေ shortfall. Credit carries it.
// Unpay removes that collection while this voucher is still the latest one.

type dayVoucher struct {
	ID                 int64   `json:"id"`
	AdmissionID        int64   `json:"admission_id"`
	CivilDate          string  `json:"civil_date"`
	Status             string  `json:"status"`
	ClosingMMK         int64   `json:"closing_mmk"`
	CollectionLedgerID *int64  `json:"collection_ledger_id,omitempty"`
	DecidedAt          *string `json:"decided_at,omitempty"`
	DecidedByUserID    *int64  `json:"decided_by_user_id,omitempty"`
	CanUnpay           bool    `json:"can_unpay"`
}

type voucherOutcome struct {
	Voucher            dayVoucher
	Created            bool
	Changed            bool
	AutoCredit         bool
	AutoCreditDate     string
	CollectionLedgerID int64
	CollectionMMK      int64
	DeletedLedgerID    int64
}

type voucherHTTPError struct {
	status int
	msg    string
}

func (e *voucherHTTPError) Error() string { return e.msg }

func voucherErr(status int, msg string) error {
	return &voucherHTTPError{status: status, msg: msg}
}

func writeVoucherErr(w http.ResponseWriter, err error) {
	var ve *voucherHTTPError
	if errors.As(err, &ve) {
		writeJSON(w, ve.status, map[string]string{"error": ve.msg})
		return
	}
	if errors.Is(err, errPreviousVoucherIssued) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": errPreviousVoucherIssued.Error()})
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "voucher failed"})
}

func (h *IPD) commitVoucher(w http.ResponseWriter, fn func(*sql.Tx) (voucherOutcome, error)) (voucherOutcome, bool) {
	tx, err := h.DB.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "voucher failed"})
		return voucherOutcome{}, false
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	out, err := fn(tx)
	if err != nil {
		writeVoucherErr(w, err)
		return voucherOutcome{}, false
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "voucher failed"})
		return voucherOutcome{}, false
	}
	committed = true
	return out, true
}

func actorFromRequest(r *http.Request) (any, *int64) {
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		return nil, nil
	}
	id := user.ID
	return id, &id
}

func parseDayVoucherPath(path string) (admissionID int64, civilDate, action string, ok bool) {
	const prefix = "/admissions/"
	if !strings.HasPrefix(path, prefix) {
		return 0, "", "", false
	}
	parts := strings.Split(strings.TrimPrefix(path, prefix), "/")
	if len(parts) != 4 || parts[1] != "vouchers" {
		return 0, "", "", false
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || id < 1 {
		return 0, "", "", false
	}
	switch parts[3] {
	case "issue", "pay", "credit", "unpay":
	default:
		return 0, "", "", false
	}
	return id, parts[2], parts[3], true
}

func normalizeCivilDate(date string) (string, bool) {
	date = strings.TrimSpace(date)
	if _, _, ok := yangonDayUTCRange(date); !ok {
		return "", false
	}
	return date, true
}

func (h *IPD) dayVoucher(w http.ResponseWriter, r *http.Request, path string) {
	id, date, action, ok := parseDayVoucherPath(path)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	date, dateOK := normalizeCivilDate(date)
	if !dateOK {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid date"})
		return
	}
	switch action {
	case "issue":
		h.issueDayVoucher(w, r, id, date)
	case "pay":
		h.payDayVoucher(w, r, id, date)
	case "credit":
		h.creditDayVoucher(w, r, id, date)
	case "unpay":
		h.unpayDayVoucher(w, r, id, date)
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}

func (h *IPD) issueDayVoucher(w http.ResponseWriter, r *http.Request, admissionID int64, civilDate string) {
	if civilDate >= localToday() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "this day is still open"})
		return
	}
	actor, auditActor := actorFromRequest(r)
	out, ok := h.commitVoucher(w, func(tx *sql.Tx) (voucherOutcome, error) {
		return issueDayVoucherTx(tx, admissionID, civilDate, actor)
	})
	if !ok {
		return
	}
	if out.Created {
		id := out.Voucher.ID
		audit.WriteAudit(h.DB, auditActor, "issue", "ipd_day_voucher", &id, map[string]any{
			"admission_id": admissionID,
			"civil_date":   civilDate,
			"closing_mmk":  out.Voucher.ClosingMMK,
		})
	}
	if out.AutoCredit {
		audit.WriteAudit(h.DB, auditActor, "credit", "ipd_day_voucher", nil, map[string]any{
			"admission_id": admissionID,
			"civil_date":   out.AutoCreditDate,
			"auto":         true,
		})
	}
	code := http.StatusOK
	if out.Created {
		code = http.StatusCreated
	}
	h.writeDayVoucher(w, code, out.Voucher)
}

func (h *IPD) payDayVoucher(w http.ResponseWriter, r *http.Request, admissionID int64, civilDate string) {
	actor, auditActor := actorFromRequest(r)
	out, ok := h.commitVoucher(w, func(tx *sql.Tx) (voucherOutcome, error) {
		return payDayVoucherTx(tx, admissionID, civilDate, actor)
	})
	if !ok {
		return
	}
	id := out.Voucher.ID
	audit.WriteAudit(h.DB, auditActor, "pay", "ipd_day_voucher", &id, map[string]any{
		"admission_id":   admissionID,
		"civil_date":     civilDate,
		"closing_mmk":    out.Voucher.ClosingMMK,
		"collection_mmk": out.CollectionMMK,
	})
	if out.CollectionLedgerID > 0 {
		lineID := out.CollectionLedgerID
		audit.WriteAudit(h.DB, auditActor, "create", "ipd_ledger", &lineID, map[string]any{
			"admission_id": admissionID,
			"kind":         "collection",
			"amount_mmk":   out.CollectionMMK,
			"civil_date":   civilDate,
		})
	}
	h.writeDayVoucher(w, http.StatusOK, out.Voucher)
}

func (h *IPD) creditDayVoucher(w http.ResponseWriter, r *http.Request, admissionID int64, civilDate string) {
	actor, auditActor := actorFromRequest(r)
	out, ok := h.commitVoucher(w, func(tx *sql.Tx) (voucherOutcome, error) {
		return creditDayVoucherTx(tx, admissionID, civilDate, actor)
	})
	if !ok {
		return
	}
	if out.Changed {
		id := out.Voucher.ID
		audit.WriteAudit(h.DB, auditActor, "credit", "ipd_day_voucher", &id, map[string]any{
			"admission_id": admissionID,
			"civil_date":   civilDate,
			"closing_mmk":  out.Voucher.ClosingMMK,
		})
	}
	h.writeDayVoucher(w, http.StatusOK, out.Voucher)
}

func (h *IPD) unpayDayVoucher(w http.ResponseWriter, r *http.Request, admissionID int64, civilDate string) {
	actor, auditActor := actorFromRequest(r)
	out, ok := h.commitVoucher(w, func(tx *sql.Tx) (voucherOutcome, error) {
		return unpayDayVoucherTx(tx, admissionID, civilDate, actor)
	})
	if !ok {
		return
	}
	id := out.Voucher.ID
	audit.WriteAudit(h.DB, auditActor, "unpay", "ipd_day_voucher", &id, map[string]any{
		"admission_id": admissionID,
		"civil_date":   civilDate,
		"status":       out.Voucher.Status,
		"closing_mmk":  out.Voucher.ClosingMMK,
	})
	if out.DeletedLedgerID > 0 {
		lineID := out.DeletedLedgerID
		audit.WriteAudit(h.DB, auditActor, "delete", "ipd_ledger", &lineID, map[string]any{
			"admission_id": admissionID,
			"kind":         "collection",
			"civil_date":   civilDate,
		})
	}
	h.writeDayVoucher(w, http.StatusOK, out.Voucher)
}

func (h *IPD) writeDayVoucher(w http.ResponseWriter, code int, v dayVoucher) {
	if err := setVoucherCanUnpay(h.DB, &v); err != nil {
		v.CanUnpay = false
	}
	writeJSON(w, code, v)
}

// setVoucherCanUnpay reports whether unpay would succeed for this voucher:
// it is paid, the stay is open, and no later voucher or collection exists.
func setVoucherCanUnpay(db sqlQuery, v *dayVoucher) error {
	if v == nil || v.Status != "paid" {
		if v != nil {
			v.CanUnpay = false
		}
		return nil
	}
	var status string
	err := db.QueryRow(`SELECT status FROM ipd_admissions WHERE id = ?`, v.AdmissionID).Scan(&status)
	if err != nil {
		return err
	}
	if status != "open" {
		v.CanUnpay = false
		return nil
	}
	var later int
	if err := db.QueryRow(`
		SELECT COUNT(1) FROM ipd_day_vouchers
		WHERE admission_id = ? AND civil_date > ?
	`, v.AdmissionID, v.CivilDate).Scan(&later); err != nil {
		return err
	}
	if later > 0 {
		v.CanUnpay = false
		return nil
	}
	if v.CollectionLedgerID != nil && *v.CollectionLedgerID > 0 {
		var newer int
		if err := db.QueryRow(`
			SELECT COUNT(1) FROM ipd_ledger
			WHERE admission_id = ? AND kind = 'collection' AND id > ?
		`, v.AdmissionID, *v.CollectionLedgerID).Scan(&newer); err != nil {
			return err
		}
		if newer > 0 {
			v.CanUnpay = false
			return nil
		}
	}
	v.CanUnpay = true
	return nil
}

func requireOpenAdmission(tx *sql.Tx, admissionID int64) error {
	var status string
	err := tx.QueryRow(`SELECT status FROM ipd_admissions WHERE id = ?`, admissionID).Scan(&status)
	if err == sql.ErrNoRows {
		return voucherErr(http.StatusNotFound, "not found")
	}
	if err != nil {
		return err
	}
	if status != "open" {
		return voucherErr(http.StatusConflict, "stay is not open")
	}
	return nil
}

func issueDayVoucherTx(tx *sql.Tx, admissionID int64, civilDate string, actor any) (voucherOutcome, error) {
	if err := requireOpenAdmission(tx, admissionID); err != nil {
		return voucherOutcome{}, err
	}
	prev, ok := previousCivilDate(civilDate)
	if !ok {
		return voucherOutcome{}, voucherErr(http.StatusBadRequest, "invalid date")
	}
	res, err := tx.Exec(`
		UPDATE ipd_day_vouchers
		SET status = 'credit',
		    decided_at = datetime('now'),
		    decided_by_user_id = ?,
		    updated_at = datetime('now')
		WHERE admission_id = ? AND civil_date = ? AND status = 'issued'
	`, actor, admissionID, prev)
	if err != nil {
		return voucherOutcome{}, err
	}
	n, _ := res.RowsAffected()
	out := voucherOutcome{AutoCredit: n > 0, AutoCreditDate: prev}

	existing, err := loadDayVoucher(tx, admissionID, civilDate)
	if err == nil {
		if existing.Status == "issued" {
			closing, err := sheetClosingTx(tx, admissionID, civilDate)
			if err != nil {
				return voucherOutcome{}, err
			}
			if _, err := tx.Exec(`
				UPDATE ipd_day_vouchers
				SET closing_mmk = ?, updated_at = datetime('now')
				WHERE id = ? AND status = 'issued'
			`, closing, existing.ID); err != nil {
				return voucherOutcome{}, err
			}
			existing.ClosingMMK = closing
		}
		out.Voucher = existing
		return out, nil
	}
	if err != sql.ErrNoRows {
		return voucherOutcome{}, err
	}

	closing, err := sheetClosingTx(tx, admissionID, civilDate)
	if err != nil {
		return voucherOutcome{}, err
	}
	ins, err := tx.Exec(`
		INSERT INTO ipd_day_vouchers (admission_id, civil_date, status, closing_mmk)
		VALUES (?, ?, 'issued', ?)
	`, admissionID, civilDate, closing)
	if isUniqueErr(err) {
		existing, loadErr := loadDayVoucher(tx, admissionID, civilDate)
		if loadErr != nil {
			return voucherOutcome{}, loadErr
		}
		out.Voucher = existing
		return out, nil
	}
	if err != nil {
		return voucherOutcome{}, err
	}
	id, _ := ins.LastInsertId()
	existing, err = loadDayVoucher(tx, admissionID, civilDate)
	if err != nil {
		existing = dayVoucher{
			ID:          id,
			AdmissionID: admissionID,
			CivilDate:   civilDate,
			Status:      "issued",
			ClosingMMK:  closing,
		}
	}
	out.Voucher = existing
	out.Created = true
	return out, nil
}

func payDayVoucherTx(tx *sql.Tx, admissionID int64, civilDate string, actor any) (voucherOutcome, error) {
	if err := requireOpenAdmission(tx, admissionID); err != nil {
		return voucherOutcome{}, err
	}
	v, err := loadDayVoucher(tx, admissionID, civilDate)
	if err == sql.ErrNoRows {
		return voucherOutcome{}, voucherErr(http.StatusNotFound, "voucher not found")
	}
	if err != nil {
		return voucherOutcome{}, err
	}
	if v.Status != "issued" && v.Status != "credit" {
		return voucherOutcome{}, voucherErr(http.StatusConflict, "voucher is already paid")
	}
	res, err := tx.Exec(`
		UPDATE ipd_day_vouchers
		SET status = 'paid',
		    decided_at = datetime('now'),
		    decided_by_user_id = ?,
		    updated_at = datetime('now')
		WHERE id = ? AND status IN ('issued', 'credit')
	`, actor, v.ID)
	if err != nil {
		return voucherOutcome{}, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return voucherOutcome{}, voucherErr(http.StatusConflict, "voucher is already paid")
	}

	var lineID int64
	var amount int64
	if v.ClosingMMK < 0 {
		amount = -v.ClosingMMK
		ins, err := tx.Exec(`
			INSERT INTO ipd_ledger (admission_id, kind, amount_mmk, source, note, actor_user_id)
			VALUES (?, 'collection', ?, '', ?, ?)
		`, admissionID, amount, "Day voucher "+civilDate, actor)
		if err != nil {
			return voucherOutcome{}, err
		}
		lineID, _ = ins.LastInsertId()
		if _, err := tx.Exec(`
			UPDATE ipd_day_vouchers SET collection_ledger_id = ?, updated_at = datetime('now') WHERE id = ?
		`, lineID, v.ID); err != nil {
			return voucherOutcome{}, err
		}
	}
	v, err = loadDayVoucher(tx, admissionID, civilDate)
	if err != nil {
		return voucherOutcome{}, err
	}
	return voucherOutcome{Voucher: v, CollectionLedgerID: lineID, CollectionMMK: amount}, nil
}

func creditDayVoucherTx(tx *sql.Tx, admissionID int64, civilDate string, actor any) (voucherOutcome, error) {
	if err := requireOpenAdmission(tx, admissionID); err != nil {
		return voucherOutcome{}, err
	}
	v, err := loadDayVoucher(tx, admissionID, civilDate)
	if err == sql.ErrNoRows {
		return voucherOutcome{}, voucherErr(http.StatusNotFound, "voucher not found")
	}
	if err != nil {
		return voucherOutcome{}, err
	}
	if v.Status == "credit" {
		return voucherOutcome{Voucher: v}, nil
	}
	if v.Status != "issued" {
		return voucherOutcome{}, voucherErr(http.StatusConflict, "voucher is not issued")
	}
	if v.ClosingMMK >= 0 {
		return voucherOutcome{}, voucherErr(http.StatusBadRequest, "nothing to defer")
	}
	res, err := tx.Exec(`
		UPDATE ipd_day_vouchers
		SET status = 'credit',
		    decided_at = datetime('now'),
		    decided_by_user_id = ?,
		    updated_at = datetime('now')
		WHERE id = ? AND status = 'issued' AND closing_mmk < 0
	`, actor, v.ID)
	if err != nil {
		return voucherOutcome{}, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return voucherOutcome{}, voucherErr(http.StatusConflict, "voucher is not issued")
	}
	v, err = loadDayVoucher(tx, admissionID, civilDate)
	if err != nil {
		return voucherOutcome{}, err
	}
	return voucherOutcome{Voucher: v, Changed: true}, nil
}

func unpayDayVoucherTx(tx *sql.Tx, admissionID int64, civilDate string, actor any) (voucherOutcome, error) {
	if err := requireOpenAdmission(tx, admissionID); err != nil {
		return voucherOutcome{}, err
	}
	v, err := loadDayVoucher(tx, admissionID, civilDate)
	if err == sql.ErrNoRows {
		return voucherOutcome{}, voucherErr(http.StatusNotFound, "voucher not found")
	}
	if err != nil {
		return voucherOutcome{}, err
	}
	if v.Status != "paid" {
		return voucherOutcome{}, voucherErr(http.StatusConflict, "voucher is not paid")
	}
	var later int
	if err := tx.QueryRow(`
		SELECT COUNT(1) FROM ipd_day_vouchers
		WHERE admission_id = ? AND civil_date > ?
	`, admissionID, civilDate).Scan(&later); err != nil {
		return voucherOutcome{}, err
	}
	if later > 0 {
		return voucherOutcome{}, voucherErr(http.StatusConflict, "a later day voucher exists")
	}
	if v.CollectionLedgerID != nil {
		var newer int
		if err := tx.QueryRow(`
			SELECT COUNT(1) FROM ipd_ledger
			WHERE admission_id = ? AND kind = 'collection' AND id > ?
		`, admissionID, *v.CollectionLedgerID).Scan(&newer); err != nil {
			return voucherOutcome{}, err
		}
		if newer > 0 {
			return voucherOutcome{}, voucherErr(http.StatusConflict, "a later collection exists")
		}
	}

	var res sql.Result
	if v.ClosingMMK < 0 {
		res, err = tx.Exec(`
			UPDATE ipd_day_vouchers
			SET status = 'credit',
			    collection_ledger_id = NULL,
			    decided_at = datetime('now'),
			    decided_by_user_id = ?,
			    updated_at = datetime('now')
			WHERE id = ? AND status = 'paid'
		`, actor, v.ID)
	} else {
		res, err = tx.Exec(`
			UPDATE ipd_day_vouchers
			SET status = 'issued',
			    collection_ledger_id = NULL,
			    decided_at = NULL,
			    decided_by_user_id = NULL,
			    updated_at = datetime('now')
			WHERE id = ? AND status = 'paid'
		`, v.ID)
	}
	if err != nil {
		return voucherOutcome{}, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return voucherOutcome{}, voucherErr(http.StatusConflict, "voucher is not paid")
	}

	var deleted int64
	if v.CollectionLedgerID != nil && *v.CollectionLedgerID > 0 {
		if _, err := tx.Exec(`
			DELETE FROM ipd_ledger
			WHERE id = ? AND admission_id = ? AND kind = 'collection'
		`, *v.CollectionLedgerID, admissionID); err != nil {
			return voucherOutcome{}, err
		}
		deleted = *v.CollectionLedgerID
	}
	v, err = loadDayVoucher(tx, admissionID, civilDate)
	if err != nil {
		return voucherOutcome{}, err
	}
	return voucherOutcome{Voucher: v, DeletedLedgerID: deleted}, nil
}

func loadDayVoucher(db sqlQuery, admissionID int64, civilDate string) (dayVoucher, error) {
	row := db.QueryRow(`
		SELECT id, admission_id, civil_date, status, closing_mmk,
		       collection_ledger_id, decided_at, decided_by_user_id
		FROM ipd_day_vouchers
		WHERE admission_id = ? AND civil_date = ?
	`, admissionID, civilDate)
	var v dayVoucher
	var collection, decidedBy sql.NullInt64
	var decidedAt sql.NullString
	if err := row.Scan(
		&v.ID, &v.AdmissionID, &v.CivilDate, &v.Status, &v.ClosingMMK,
		&collection, &decidedAt, &decidedBy,
	); err != nil {
		return v, err
	}
	if collection.Valid {
		id := collection.Int64
		v.CollectionLedgerID = &id
	}
	if decidedAt.Valid {
		s := decidedAt.String
		v.DecidedAt = &s
	}
	if decidedBy.Valid {
		id := decidedBy.Int64
		v.DecidedByUserID = &id
	}
	return v, nil
}

func sheetClosingTx(tx *sql.Tx, admissionID int64, civilDate string) (int64, error) {
	lines, _, err := loadLedger(tx, admissionID)
	if err != nil {
		return 0, err
	}
	skip, err := loadVoucherCollectionIDs(tx, admissionID)
	if err != nil {
		return 0, err
	}
	prior, err := loadPreviousDayVoucher(tx, admissionID, civilDate)
	if err != nil {
		return 0, err
	}
	sheet, err := buildDaySheet(civilDate, linesForCivilDay(lines, civilDate, skip), prior)
	if err != nil {
		return 0, err
	}
	return sheet.ClosingMMK, nil
}

func loadVoucherCollectionIDs(db sqlQuery, admissionID int64) (map[int64]struct{}, error) {
	rows, err := db.Query(`
		SELECT collection_ledger_id
		FROM ipd_day_vouchers
		WHERE admission_id = ? AND collection_ledger_id IS NOT NULL
	`, admissionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]struct{}{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		if id > 0 {
			out[id] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// voucherEpochStartedOn is the first civil date that uses cash income.
// An empty string means the row is missing and the charge rule still applies.
func voucherEpochStartedOn(db sqlQuery) (string, error) {
	var started string
	err := db.QueryRow(`SELECT started_on FROM ipd_voucher_epoch WHERE id = 1`).Scan(&started)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(started), nil
}
