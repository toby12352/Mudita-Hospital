package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"testing"

	"mudita-hospital/server/internal/auth"
)

func insertModeSession(t *testing.T, sqlDB *sql.DB, role, mode string, grants ...string) (int64, string) {
	t.Helper()
	id, token := insertSession(t, sqlDB, role, 0)
	if _, err := sqlDB.Exec(`UPDATE users SET access_mode = ? WHERE id = ?`, mode, id); err != nil {
		t.Fatalf("mode: %v", err)
	}
	for _, grant := range grants {
		if _, err := sqlDB.Exec(`INSERT INTO user_grants (user_id, perm) VALUES (?, ?)`, id, grant); err != nil {
			t.Fatalf("grant %s: %v", grant, err)
		}
	}
	return id, token
}

func TestAccessEnforcement(t *testing.T) {
	sqlDB := openTestDB(t)

	svcRes, err := sqlDB.Exec(`INSERT INTO services (code, name, price_mmk) VALUES ('FEE1', 'Consult', 1000)`)
	if err != nil {
		t.Fatal(err)
	}
	serviceID, _ := svcRes.LastInsertId()
	itemID := insertItem(t, sqlDB, "DRUG1", "Drug", 100, 50)
	insertBatch(t, sqlDB, itemID, "B1", "2027-01-01", 10)

	_, portalOPD := insertSession(t, sqlDB, auth.RoleOPD, 0)
	_, portalPharmacy := insertSession(t, sqlDB, auth.RolePharmacy, 0)
	_, adminTok := insertSession(t, sqlDB, auth.RoleAdmin, 0)

	_, pharmacyClerk := insertModeSession(t, sqlDB, auth.RoleOPD, auth.AccessUnified,
		auth.GrantPharmacyRead, auth.GrantPharmacyCreate)
	_, opdFees := insertModeSession(t, sqlDB, auth.RolePatients, auth.AccessUnified,
		auth.GrantOPDRead, auth.GrantOPDUpdate)
	_, pharmacyUpdate := insertModeSession(t, sqlDB, auth.RolePatients, auth.AccessUnified,
		auth.GrantPharmacyRead, auth.GrantPharmacyUpdate)
	_, dashTok := insertModeSession(t, sqlDB, auth.RolePatients, auth.AccessUnified, auth.GrantDashboard)
	_, chartClerk := insertModeSession(t, sqlDB, auth.RolePharmacy, auth.AccessUnified, auth.GrantPatientsCreate)

	services := &Services{DB: sqlDB}
	pharmacy := &Pharmacy{DB: sqlDB}
	opd := &OPD{DB: sqlDB}
	patients := &Patients{DB: sqlDB}
	feeBody := `{"name":"Consult","code":"FEE1","price_mmk":2500}`
	priceBody := `{"code":"DRUG1","name":"Drug","category":"Tablet","sell_price_mmk":80,"buy_price_mmk":100}`
	adjustBody := `{"qty_delta":1,"reason":"count"}`

	t.Run("portal opd fee", func(t *testing.T) {
		w := doJSON(services, http.MethodPut, fmt.Sprintf("/api/services/%d", serviceID), portalOPD, feeBody)
		mustCode(t, w, http.StatusOK)
		var price int64
		if err := sqlDB.QueryRow(`SELECT price_mmk FROM services WHERE id = ?`, serviceID).Scan(&price); err != nil {
			t.Fatal(err)
		}
		if price != 2500 {
			t.Fatalf("portal fee %d", price)
		}
	})

	t.Run("portal pharmacy price and adjust", func(t *testing.T) {
		w := doJSON(pharmacy, http.MethodPut, fmt.Sprintf("/api/pharmacy/items/%d", itemID), portalPharmacy, priceBody)
		mustCode(t, w, http.StatusOK)
		var sell int64
		if err := sqlDB.QueryRow(`SELECT sell_price_mmk FROM items WHERE id = ?`, itemID).Scan(&sell); err != nil {
			t.Fatal(err)
		}
		if sell != 80 {
			t.Fatalf("portal sell %d", sell)
		}
		before := mainQty(t, sqlDB, itemID)
		w = doJSON(pharmacy, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/restock", itemID), portalPharmacy,
			`{"qty":1,"qty_unit":"stock","buy_price_mmk":111,"sell_price_mmk":222}`)
		mustCode(t, w, http.StatusOK)
		if mainQty(t, sqlDB, itemID) != before+1 {
			t.Fatalf("portal restock qty %d", mainQty(t, sqlDB, itemID))
		}
		var buy int64
		if err := sqlDB.QueryRow(`SELECT buy_price_mmk, sell_price_mmk FROM items WHERE id = ?`, itemID).Scan(&buy, &sell); err != nil {
			t.Fatal(err)
		}
		if buy != 111 || sell != 222 {
			t.Fatalf("portal restock prices %d/%d", buy, sell)
		}
		w = doJSON(pharmacy, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/adjust", itemID), portalPharmacy, adjustBody)
		mustCode(t, w, http.StatusForbidden)
		if mainQty(t, sqlDB, itemID) != before+1 {
			t.Fatalf("portal adjust changed qty to %d", mainQty(t, sqlDB, itemID))
		}
	})

	t.Run("unified pharmacy read create", func(t *testing.T) {
		before := mainQty(t, sqlDB, itemID)
		var buy, sell int64
		if err := sqlDB.QueryRow(`SELECT buy_price_mmk, sell_price_mmk FROM items WHERE id = ?`, itemID).Scan(&buy, &sell); err != nil {
			t.Fatal(err)
		}
		w := doJSON(pharmacy, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/restock", itemID), pharmacyClerk,
			`{"qty":2,"qty_unit":"stock","buy_price_mmk":999,"sell_price_mmk":888}`)
		mustCode(t, w, http.StatusOK)
		if mainQty(t, sqlDB, itemID) != before+2 {
			t.Fatalf("restock qty %d", mainQty(t, sqlDB, itemID))
		}
		var buy2, sell2 int64
		if err := sqlDB.QueryRow(`SELECT buy_price_mmk, sell_price_mmk FROM items WHERE id = ?`, itemID).Scan(&buy2, &sell2); err != nil {
			t.Fatal(err)
		}
		if buy2 != buy || sell2 != sell {
			t.Fatalf("create restock changed prices %d/%d", buy2, sell2)
		}
		w = doJSON(pharmacy, http.MethodPut, fmt.Sprintf("/api/pharmacy/items/%d", itemID), pharmacyClerk, priceBody)
		mustCode(t, w, http.StatusForbidden)
		w = doJSON(pharmacy, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/adjust", itemID), pharmacyClerk, adjustBody)
		mustCode(t, w, http.StatusForbidden)
		if mainQty(t, sqlDB, itemID) != before+2 {
			t.Fatalf("denied adjust qty %d", mainQty(t, sqlDB, itemID))
		}
		w = doJSON(opd, http.MethodGet, "/api/opd/bills", pharmacyClerk, "")
		mustCode(t, w, http.StatusForbidden)
		w = doJSON(services, http.MethodPut, fmt.Sprintf("/api/services/%d", serviceID), pharmacyClerk, feeBody)
		mustCode(t, w, http.StatusForbidden)
	})

	t.Run("unified opd update", func(t *testing.T) {
		body := `{"name":"Consult","code":"FEE1","price_mmk":3300}`
		w := doJSON(services, http.MethodPut, fmt.Sprintf("/api/services/%d", serviceID), opdFees, body)
		mustCode(t, w, http.StatusOK)
		var price int64
		if err := sqlDB.QueryRow(`SELECT price_mmk FROM services WHERE id = ?`, serviceID).Scan(&price); err != nil {
			t.Fatal(err)
		}
		if price != 3300 {
			t.Fatalf("unified fee %d", price)
		}
	})

	t.Run("admin", func(t *testing.T) {
		before := mainQty(t, sqlDB, itemID)
		w := doJSON(pharmacy, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/adjust", itemID), adminTok, adjustBody)
		mustCode(t, w, http.StatusOK)
		if mainQty(t, sqlDB, itemID) != before+1 {
			t.Fatalf("admin adjust qty %d", mainQty(t, sqlDB, itemID))
		}
		w = doJSON(services, http.MethodPut, fmt.Sprintf("/api/services/%d", serviceID), adminTok,
			`{"name":"Consult","code":"FEE1","price_mmk":4400}`)
		mustCode(t, w, http.StatusOK)
		w = doJSON(&Settings{DB: sqlDB}, http.MethodGet, "/api/settings", adminTok, "")
		mustCode(t, w, http.StatusOK)
	})

	t.Run("unified update can adjust", func(t *testing.T) {
		before := mainQty(t, sqlDB, itemID)
		w := doJSON(pharmacy, http.MethodPost, fmt.Sprintf("/api/pharmacy/items/%d/adjust", itemID), pharmacyUpdate, adjustBody)
		mustCode(t, w, http.StatusOK)
		if mainQty(t, sqlDB, itemID) != before+1 {
			t.Fatalf("grant adjust qty %d", mainQty(t, sqlDB, itemID))
		}
	})

	t.Run("dashboard grant", func(t *testing.T) {
		w := doJSON(&Dashboard{DB: sqlDB}, http.MethodGet, "/api/dashboard/overview", dashTok, "")
		mustCode(t, w, http.StatusOK)
		w = doJSON(&Reports{DB: sqlDB}, http.MethodGet, "/api/reports/daily-cash", dashTok, "")
		mustCode(t, w, http.StatusOK)
		w = doJSON(&Reports{DB: sqlDB}, http.MethodGet, "/api/reports/daily-cash/print", dashTok, "")
		mustCode(t, w, http.StatusOK)
		w = doJSON(&Reports{DB: sqlDB}, http.MethodGet, "/api/reports/low-stock", dashTok, "")
		mustCode(t, w, http.StatusOK)
		w = doJSON(&Reports{DB: sqlDB}, http.MethodGet, "/api/reports/near-expiry", dashTok, "")
		mustCode(t, w, http.StatusOK)
		w = doJSON(&Settings{DB: sqlDB}, http.MethodGet, "/api/settings", dashTok, "")
		mustCode(t, w, http.StatusForbidden)
		w = doJSON(&Users{DB: sqlDB}, http.MethodGet, "/api/users", dashTok, "")
		mustCode(t, w, http.StatusForbidden)
		w = doJSON(patients, http.MethodPost, "/api/patients", dashTok, `{"name":"No Chart"}`)
		mustCode(t, w, http.StatusForbidden)
		w = doJSON(&Backup{DB: sqlDB}, http.MethodGet, "/api/backup", dashTok, "")
		mustCode(t, w, http.StatusForbidden)
		w = doJSON(&Expenses{DB: sqlDB}, http.MethodPost, "/api/expenses/services", dashTok, `{"name":"Tea"}`)
		mustCode(t, w, http.StatusForbidden)
	})

	t.Run("role is not the grant", func(t *testing.T) {
		w := doJSON(patients, http.MethodPost, "/api/patients", chartClerk, `{"name":"New Chart"}`)
		mustCode(t, w, http.StatusCreated)
		w = doJSON(pharmacy, http.MethodGet, "/api/pharmacy/items", chartClerk, "")
		mustCode(t, w, http.StatusForbidden)
		w = doJSON(patients, http.MethodDelete, "/api/patients/1", chartClerk, "")
		mustCode(t, w, http.StatusForbidden)
	})
}
