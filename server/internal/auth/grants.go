package auth

import (
	"database/sql"
	"errors"
	"strings"
)

// Access modes stored on users.access_mode. Checked in Go, not by a SQL constraint.
const (
	AccessPortal  = "portal"
	AccessUnified = "unified"
)

// Actions on a clinic module. Combined with a module as module.action.
const (
	ActionRead   = "read"
	ActionCreate = "create"
	ActionUpdate = "update"
	ActionDelete = "delete"
)

// Grant keys stored in user_grants.perm. GrantIPDDelete is named so callers
// can reject it; it is not grantable because no IPD delete exists.
const (
	GrantPatientsRead   = "patients.read"
	GrantPatientsCreate = "patients.create"
	GrantPatientsUpdate = "patients.update"
	GrantPatientsDelete = "patients.delete"

	GrantIPDRead   = "ipd.read"
	GrantIPDCreate = "ipd.create"
	GrantIPDUpdate = "ipd.update"
	GrantIPDDelete = "ipd.delete"

	GrantOPDRead   = "opd.read"
	GrantOPDCreate = "opd.create"
	GrantOPDUpdate = "opd.update"
	GrantOPDDelete = "opd.delete"

	GrantOTRead   = "ot.read"
	GrantOTCreate = "ot.create"
	GrantOTUpdate = "ot.update"
	GrantOTDelete = "ot.delete"

	GrantPharmacyRead   = "pharmacy.read"
	GrantPharmacyCreate = "pharmacy.create"
	GrantPharmacyUpdate = "pharmacy.update"
	GrantPharmacyDelete = "pharmacy.delete"

	// GrantDashboard is the single dashboard checkbox, not a clinic module.
	GrantDashboard = "dashboard"
)

// grantablePerms is the closed set that may be stored. settings, manage_users,
// and ipd.delete are absent on purpose.
var grantablePerms = map[string]struct{}{
	GrantPatientsRead:   {},
	GrantPatientsCreate: {},
	GrantPatientsUpdate: {},
	GrantPatientsDelete: {},

	GrantIPDRead:   {},
	GrantIPDCreate: {},
	GrantIPDUpdate: {},

	GrantOPDRead:   {},
	GrantOPDCreate: {},
	GrantOPDUpdate: {},
	GrantOPDDelete: {},

	GrantOTRead:   {},
	GrantOTCreate: {},
	GrantOTUpdate: {},
	GrantOTDelete: {},

	GrantPharmacyRead:   {},
	GrantPharmacyCreate: {},
	GrantPharmacyUpdate: {},
	GrantPharmacyDelete: {},

	GrantDashboard: {},
}

// ValidAccessMode reports whether mode is portal or unified.
func ValidAccessMode(mode string) bool {
	return mode == AccessPortal || mode == AccessUnified
}

// Grantable reports whether perm may be stored on user_grants.
// ipd.delete, settings, and manage_users are rejected.
func Grantable(perm string) bool {
	_, ok := grantablePerms[perm]
	return ok
}

// Errors from NormalizeGrants. The text is the API error.
var (
	ErrUnknownGrant   = errors.New("unknown grant")
	ErrGrantNeedsRead = errors.New("create, update, or delete requires read")
	ErrGrantRequired  = errors.New("select at least one module or dashboard")
)

// grantCanon is the stable order for stored keys and audit lists.
var grantCanon = []string{
	GrantPatientsRead, GrantPatientsCreate, GrantPatientsUpdate, GrantPatientsDelete,
	GrantIPDRead, GrantIPDCreate, GrantIPDUpdate,
	GrantOPDRead, GrantOPDCreate, GrantOPDUpdate, GrantOPDDelete,
	GrantOTRead, GrantOTCreate, GrantOTUpdate, GrantOTDelete,
	GrantPharmacyRead, GrantPharmacyCreate, GrantPharmacyUpdate, GrantPharmacyDelete,
	GrantDashboard,
}

// grantModules pair each Read key with the actions that require it.
// ipd.delete is absent.
var grantModules = []struct {
	read  string
	extra []string
}{
	{GrantPatientsRead, []string{GrantPatientsCreate, GrantPatientsUpdate, GrantPatientsDelete}},
	{GrantIPDRead, []string{GrantIPDCreate, GrantIPDUpdate}},
	{GrantOPDRead, []string{GrantOPDCreate, GrantOPDUpdate, GrantOPDDelete}},
	{GrantOTRead, []string{GrantOTCreate, GrantOTUpdate, GrantOTDelete}},
	{GrantPharmacyRead, []string{GrantPharmacyCreate, GrantPharmacyUpdate, GrantPharmacyDelete}},
}

// NormalizeGrants checks a client grant list.
// Unknown keys, ipd.delete, settings, and manage_users are rejected.
// Create, Update, or Delete without Read on that module is rejected.
// A list with no clinic Read and no dashboard grant is rejected.
// The result is deduped and ordered.
func NormalizeGrants(in []string) ([]string, error) {
	seen := make(map[string]struct{}, len(in))
	for _, raw := range in {
		perm := strings.TrimSpace(raw)
		if !Grantable(perm) {
			return nil, ErrUnknownGrant
		}
		seen[perm] = struct{}{}
	}
	for _, mod := range grantModules {
		if _, ok := seen[mod.read]; ok {
			continue
		}
		for _, extra := range mod.extra {
			if _, ok := seen[extra]; ok {
				return nil, ErrGrantNeedsRead
			}
		}
	}
	_, dash := seen[GrantDashboard]
	if !dash && !hasModuleRead(seen) {
		return nil, ErrGrantRequired
	}
	return orderedFrom(seen), nil
}

// OrderedGrants returns the grantable keys from perms, in matrix order.
// Unknown stored values, including settings and ipd.delete, are dropped.
func OrderedGrants(perms []string) []string {
	seen := make(map[string]struct{}, len(perms))
	for _, perm := range perms {
		if Grantable(perm) {
			seen[perm] = struct{}{}
		}
	}
	return orderedFrom(seen)
}

func orderedFrom(seen map[string]struct{}) []string {
	out := make([]string, 0, len(seen))
	for _, perm := range grantCanon {
		if _, ok := seen[perm]; ok {
			out = append(out, perm)
		}
	}
	return out
}

func hasModuleRead(seen map[string]struct{}) bool {
	for _, mod := range grantModules {
		if _, ok := seen[mod.read]; ok {
			return true
		}
	}
	return false
}

// FillerRole is the users.role stored for a unified account.
// It is the first Read module in order OPD, OT, Pharmacy, Patients, IPD.
// A dashboard-only account stores Patients. Authorization must not trust this role.
func FillerRole(grants []string) string {
	held := make(map[string]struct{}, len(grants))
	for _, perm := range grants {
		held[perm] = struct{}{}
	}
	order := []struct{ read, role string }{
		{GrantOPDRead, RoleOPD},
		{GrantOTRead, RoleOT},
		{GrantPharmacyRead, RolePharmacy},
		{GrantPatientsRead, RolePatients},
		{GrantIPDRead, RoleIPD},
	}
	for _, item := range order {
		if _, ok := held[item.read]; ok {
			return item.role
		}
	}
	return RolePatients
}

// LoadAccess reads role and access_mode. Session lookup does not.
func LoadAccess(db *sql.DB, userID int64) (role, mode string, err error) {
	err = db.QueryRow(
		`SELECT role, access_mode FROM users WHERE id = ?`, userID,
	).Scan(&role, &mode)
	return role, mode, err
}

func grantHeld(db *sql.DB, userID int64, perm string) (bool, error) {
	var n int
	err := db.QueryRow(
		`SELECT COUNT(1) FROM user_grants WHERE user_id = ? AND perm = ?`,
		userID, perm,
	).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// Allow decides one permission for a user id.
// Admin is allowed. Portal uses the desk role map. Unified is allowed only
// when a grantable user_grants row exists; users.role is ignored in that mode.
// access_mode is loaded here. Session lookup does not read it.
func Allow(db *sql.DB, userID int64, perm string) (bool, error) {
	role, mode, err := LoadAccess(db, userID)
	if err != nil {
		return false, err
	}
	if role == RoleAdmin {
		return true, nil
	}
	switch mode {
	case AccessPortal:
		return HasPermission(role, perm), nil
	case AccessUnified:
		if !Grantable(perm) {
			return false, nil
		}
		return grantHeld(db, userID, perm)
	default:
		return false, nil
	}
}

// moduleGrants are the cells that open a clinic module for a unified account.
// settings and manage_users are absent, so those routes stay Admin-only.
func moduleGrants(perm string) []string {
	switch perm {
	case PermPatients:
		return []string{GrantPatientsRead, GrantPatientsCreate, GrantPatientsUpdate, GrantPatientsDelete}
	case PermIPD:
		return []string{GrantIPDRead, GrantIPDCreate, GrantIPDUpdate}
	case PermOPD:
		return []string{GrantOPDRead, GrantOPDCreate, GrantOPDUpdate, GrantOPDDelete}
	case PermOT:
		return []string{GrantOTRead, GrantOTCreate, GrantOTUpdate, GrantOTDelete}
	case PermPharmacy:
		return []string{GrantPharmacyRead, GrantPharmacyCreate, GrantPharmacyUpdate, GrantPharmacyDelete}
	default:
		return nil
	}
}

func unifiedHasModule(db *sql.DB, userID int64, perm string) (bool, error) {
	grants := moduleGrants(perm)
	var n int
	var err error
	switch len(grants) {
	case 3:
		err = db.QueryRow(
			`SELECT COUNT(1) FROM user_grants WHERE user_id = ? AND perm IN (?, ?, ?)`,
			userID, grants[0], grants[1], grants[2],
		).Scan(&n)
	case 4:
		err = db.QueryRow(
			`SELECT COUNT(1) FROM user_grants WHERE user_id = ? AND perm IN (?, ?, ?, ?)`,
			userID, grants[0], grants[1], grants[2], grants[3],
		).Scan(&n)
	default:
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// DeskAllowed is the route gate in front of a clinic module.
// Admin is allowed. Portal uses the role map. Unified is allowed when any
// cell on that module is stored. users.role is ignored for unified accounts.
// settings and manage_users are never opened by a grant, including dashboard.
func DeskAllowed(db *sql.DB, userID int64, perm string) (bool, error) {
	role, mode, err := LoadAccess(db, userID)
	if err != nil {
		return false, err
	}
	if role == RoleAdmin {
		return true, nil
	}
	switch mode {
	case AccessPortal:
		return HasPermission(role, perm), nil
	case AccessUnified:
		return unifiedHasModule(db, userID, perm)
	default:
		return false, nil
	}
}

// AnyDeskAllowed is DeskAllowed across alternate portal permissions.
// A unified account still needs a grant on one of those modules.
// It does not treat a pharmacy grant as patients.read.
func AnyDeskAllowed(db *sql.DB, userID int64, perms []string) (bool, error) {
	role, mode, err := LoadAccess(db, userID)
	if err != nil {
		return false, err
	}
	if role == RoleAdmin {
		return true, nil
	}
	switch mode {
	case AccessPortal:
		for _, perm := range perms {
			if HasPermission(role, perm) {
				return true, nil
			}
		}
		return false, nil
	case AccessUnified:
		for _, perm := range perms {
			ok, err := unifiedHasModule(db, userID, perm)
			if err != nil {
				return false, err
			}
			if ok {
				return true, nil
			}
		}
		return false, nil
	default:
		return false, nil
	}
}

// CellAllowed is the action check after the desk gate.
// Admin is allowed. Portal is allowed: the desk gate already matched today's
// role. Unified is allowed only when that grant row exists.
// Stock adjust must use Allow, not CellAllowed, so portal Pharmacy stays denied.
func CellAllowed(db *sql.DB, userID int64, perm string) (bool, error) {
	role, mode, err := LoadAccess(db, userID)
	if err != nil {
		return false, err
	}
	if role == RoleAdmin {
		return true, nil
	}
	switch mode {
	case AccessPortal:
		return true, nil
	case AccessUnified:
		if !Grantable(perm) {
			return false, nil
		}
		return grantHeld(db, userID, perm)
	default:
		return false, nil
	}
}

// ChartReadAllowed is patient search and opening one chart.
// Portal keeps today's rule: any desk may read. Unified needs patients.read.
func ChartReadAllowed(db *sql.DB, userID int64) (bool, error) {
	role, mode, err := LoadAccess(db, userID)
	if err != nil {
		return false, err
	}
	if role == RoleAdmin {
		return true, nil
	}
	switch mode {
	case AccessPortal:
		for _, perm := range []string{PermPatients, PermOPD, PermOT, PermPharmacy, PermIPD} {
			if HasPermission(role, perm) {
				return true, nil
			}
		}
		return false, nil
	case AccessUnified:
		return grantHeld(db, userID, GrantPatientsRead)
	default:
		return false, nil
	}
}

// PatientsCell is create, update, history, and attach on the chart desk.
// Portal still requires the Patients role. Unified requires the grant.
// Hard delete is not this function; it stays on settings.
func PatientsCell(db *sql.DB, userID int64, perm string) (bool, error) {
	role, mode, err := LoadAccess(db, userID)
	if err != nil {
		return false, err
	}
	if role == RoleAdmin {
		return true, nil
	}
	switch mode {
	case AccessPortal:
		return HasPermission(role, PermPatients), nil
	case AccessUnified:
		if !Grantable(perm) {
			return false, nil
		}
		return grantHeld(db, userID, perm)
	default:
		return false, nil
	}
}

// ExpenseAction is one expense-bill call for a desk portal.
// Portal uses the desk role. Unified uses module.action. The catalog stays
// on settings and does not come through here.
func ExpenseAction(db *sql.DB, userID int64, coarse, action string) (bool, error) {
	role, mode, err := LoadAccess(db, userID)
	if err != nil {
		return false, err
	}
	if role == RoleAdmin {
		return true, nil
	}
	switch mode {
	case AccessPortal:
		return HasPermission(role, coarse), nil
	case AccessUnified:
		return grantHeld(db, userID, coarse+"."+action)
	default:
		return false, nil
	}
}
