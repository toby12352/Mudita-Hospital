package auth

// Role names stored on users.role.
const (
	RoleAdmin    = "Admin"
	RoleOPD      = "OPD"
	RoleOT       = "OT"
	RolePharmacy = "Pharmacy"
)

// Permission keys used by RequirePermission / UI gates.
const (
	PermSettings    = "settings"
	PermManageUsers = "manage_users"
	PermOPD         = "opd"
	PermOT          = "ot"
	PermPharmacy    = "pharmacy"
)

// rolePermissions is the desk map. Admin has every permission; each desk has one.
var rolePermissions = map[string]map[string]bool{
	RoleAdmin: {
		PermSettings:    true,
		PermManageUsers: true,
		PermOPD:         true,
		PermOT:          true,
		PermPharmacy:    true,
	},
	RoleOPD: {
		PermOPD: true,
	},
	RoleOT: {
		PermOT: true,
	},
	RolePharmacy: {
		PermPharmacy: true,
	},
}

func ValidRole(role string) bool {
	_, ok := rolePermissions[role]
	return ok
}

func HasPermission(role, perm string) bool {
	perms, ok := rolePermissions[role]
	if !ok {
		return false
	}
	return perms[perm]
}
