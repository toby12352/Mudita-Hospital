package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func TestUserGrantSaveAndMe(t *testing.T) {
	sqlDB := openTestDB(t)
	users := &Users{DB: sqlDB}
	authH := &Auth{DB: sqlDB}

	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)
	portalID, portalTok := insertSession(t, sqlDB, auth.RoleOPD, 0)
	_, pharmacyTok := insertSession(t, sqlDB, auth.RolePharmacy, 0)

	t.Run("desk cannot save", func(t *testing.T) {
		w := doJSON(users, http.MethodPost, "/api/users", pharmacyTok, `{
			"username":"nope","display_name":"Nope","password":"secret1",
			"grants":["pharmacy.read"]
		}`)
		mustCode(t, w, http.StatusForbidden)
	})

	var created userListItem
	t.Run("create pharmacy matrix", func(t *testing.T) {
		w := doJSON(users, http.MethodPost, "/api/users", adminTok, `{
			"username":"pharmclerk","display_name":"Pharm Clerk","password":"secret1",
			"role":"Admin",
			"grants":["pharmacy.update","pharmacy.read","pharmacy.create","dashboard"]
		}`)
		mustCode(t, w, http.StatusCreated)
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatal(err)
		}
		if created.AccessMode != auth.AccessUnified || created.Role != auth.RolePharmacy {
			t.Fatalf("mode %s role %s", created.AccessMode, created.Role)
		}
		want := []string{auth.GrantPharmacyRead, auth.GrantPharmacyCreate, auth.GrantPharmacyUpdate, auth.GrantDashboard}
		if !sameStrings(created.Grants, want) {
			t.Fatalf("grants %#v", created.Grants)
		}
		if !created.MustChangePassword || !created.Active {
			t.Fatalf("flags %+v", created)
		}
	})

	t.Run("reject broken grants", func(t *testing.T) {
		cases := []string{
			`{"username":"a","display_name":"A","password":"secret1","grants":["opd.update"]}`,
			`{"username":"b","display_name":"B","password":"secret1","grants":["ipd.delete"]}`,
			`{"username":"c","display_name":"C","password":"secret1","grants":["settings"]}`,
			`{"username":"d","display_name":"D","password":"secret1","grants":["manage_users"]}`,
			`{"username":"e","display_name":"E","password":"secret1","grants":[]}`,
		}
		for _, body := range cases {
			w := doJSON(users, http.MethodPost, "/api/users", adminTok, body)
			mustCode(t, w, http.StatusBadRequest)
		}
	})

	t.Run("dashboard only stores patients", func(t *testing.T) {
		w := doJSON(users, http.MethodPost, "/api/users", adminTok, `{
			"username":"dashonly","display_name":"Dash","password":"secret1",
			"grants":["dashboard"]
		}`)
		mustCode(t, w, http.StatusCreated)
		var u userListItem
		if err := json.Unmarshal(w.Body.Bytes(), &u); err != nil {
			t.Fatal(err)
		}
		if u.Role != auth.RolePatients || !sameStrings(u.Grants, []string{auth.GrantDashboard}) {
			t.Fatalf("dash %+v", u)
		}
	})

	t.Run("list returns grants", func(t *testing.T) {
		w := doJSON(users, http.MethodGet, "/api/users?q=pharmclerk", adminTok, "")
		mustCode(t, w, http.StatusOK)
		var body struct {
			Users []userListItem `json:"users"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if len(body.Users) != 1 || !sameStrings(body.Users[0].Grants, created.Grants) {
			t.Fatalf("list %#v", body.Users)
		}
	})

	t.Run("saving a portal user revokes sessions", func(t *testing.T) {
		w := doJSON(users, http.MethodPut, "/api/users/"+strconv.FormatInt(portalID, 10), adminTok, `{
			"display_name":"Was OPD","grants":["pharmacy.read","dashboard"]
		}`)
		mustCode(t, w, http.StatusOK)
		var u userListItem
		if err := json.Unmarshal(w.Body.Bytes(), &u); err != nil {
			t.Fatal(err)
		}
		if u.AccessMode != auth.AccessUnified || u.Role != auth.RolePharmacy {
			t.Fatalf("converted %+v", u)
		}
		if _, err := auth.LookupSession(sqlDB, portalTok); err == nil {
			t.Fatal("old session still valid")
		}
		var n int
		if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM sessions WHERE user_id = ?`, portalID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Fatalf("sessions %d", n)
		}
		var detail string
		if err := sqlDB.QueryRow(`
			SELECT detail FROM audit_logs
			WHERE action = 'update' AND entity = 'user' AND entity_id = ?
			ORDER BY id DESC LIMIT 1
		`, portalID).Scan(&detail); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(detail, `"old_grants":[]`) || !strings.Contains(detail, `"pharmacy.read"`) || !strings.Contains(detail, `"dashboard"`) {
			t.Fatalf("audit %s", detail)
		}
	})

	t.Run("deactivate leaves portal mode", func(t *testing.T) {
		id, _ := insertSession(t, sqlDB, auth.RolePharmacy, 0)
		w := doJSON(users, http.MethodPut, "/api/users/"+strconv.FormatInt(id, 10), adminTok, `{"active":false}`)
		mustCode(t, w, http.StatusOK)
		var mode string
		var grants int
		if err := sqlDB.QueryRow(`SELECT access_mode FROM users WHERE id = ?`, id).Scan(&mode); err != nil {
			t.Fatal(err)
		}
		if err := sqlDB.QueryRow(`SELECT COUNT(1) FROM user_grants WHERE user_id = ?`, id).Scan(&grants); err != nil {
			t.Fatal(err)
		}
		if mode != auth.AccessPortal || grants != 0 {
			t.Fatalf("mode %s grants %d", mode, grants)
		}
	})

	t.Run("cannot edit admin", func(t *testing.T) {
		adminID, _ := insertSession(t, sqlDB, auth.RoleAdmin, 0)
		w := doJSON(users, http.MethodPut, "/api/users/"+strconv.FormatInt(adminID, 10), adminTok, `{
			"display_name":"Other","grants":["pharmacy.read"]
		}`)
		mustCode(t, w, http.StatusBadRequest)
		var mode string
		if err := sqlDB.QueryRow(`SELECT access_mode FROM users WHERE id = ?`, adminID).Scan(&mode); err != nil {
			t.Fatal(err)
		}
		if mode != auth.AccessPortal {
			t.Fatalf("admin mode %s", mode)
		}
	})

	t.Run("me keys", func(t *testing.T) {
		w := doJSON(authH, http.MethodGet, "/api/auth/me", pharmacyTok, "")
		mustCode(t, w, http.StatusOK)
		perms := mePerms(t, w.Body.Bytes())
		if !hasString(perms, "pharmacy") || hasString(perms, "dashboard") || hasString(perms, "settings") {
			t.Fatalf("portal me %#v", perms)
		}

		_, unifiedTok := insertModeSession(t, sqlDB, auth.RoleOPD, auth.AccessUnified,
			auth.GrantPharmacyRead, auth.GrantPharmacyCreate, auth.GrantDashboard)
		w = doJSON(authH, http.MethodGet, "/api/auth/me", unifiedTok, "")
		mustCode(t, w, http.StatusOK)
		var body struct {
			User struct {
				Role       string `json:"role"`
				AccessMode string `json:"access_mode"`
			} `json:"user"`
			Permissions []string `json:"permissions"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.User.AccessMode != auth.AccessUnified {
			t.Fatalf("mode %s", body.User.AccessMode)
		}
		want := []string{auth.GrantPharmacyRead, auth.GrantPharmacyCreate, auth.GrantDashboard}
		if !sameStrings(body.Permissions, want) {
			t.Fatalf("unified me role %s perms %#v", body.User.Role, body.Permissions)
		}

		w = doJSON(authH, http.MethodGet, "/api/auth/me", adminTok, "")
		mustCode(t, w, http.StatusOK)
		adminPerms := mePerms(t, w.Body.Bytes())
		if !hasString(adminPerms, "settings") || !hasString(adminPerms, "manage_users") {
			t.Fatalf("admin me %#v", adminPerms)
		}
	})
}

func mePerms(t *testing.T, raw []byte) []string {
	t.Helper()
	var body struct {
		Permissions []string `json:"permissions"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	return body.Permissions
}

func sameStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range want {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

func hasString(list []string, s string) bool {
	for _, item := range list {
		if item == s {
			return true
		}
	}
	return false
}
