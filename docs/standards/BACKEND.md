# Backend standards

Applies to `server/`. Stack: Go stdlib `net/http` ServeMux, SQLite via `modernc.org/sqlite`, no Gin/Echo/chi.

## Package layout

Keep application code under `internal/`. Register routes in `main.go`. One exported handler type per domain (e.g. `OPD`, `OT`, `Pharmacy`) implementing `http.Handler`.

| Package | Responsibility |
|---------|----------------|
| `internal/handlers` | HTTP routing switch, request/response, SQL, domain rules |
| `internal/middleware` | CORS, `RequireAuth`, `RequirePermission` |
| `internal/auth` | Roles, permissions, sessions, passwords |
| `internal/db` | Open DB, migrations, seed |
| `internal/audit` | Audit log writes |
| `internal/backup` | Backup / restore |
| `internal/config` | Config load |
| `internal/assets` | Embedded brand assets for receipts |

Do not add empty `pkg/`, `models/`, or `controllers/` trees. Split by domain, not by layer.

## Handler pattern

1. Register in `main.go` under `/api/{domain}/...`.
2. Wrap with `middleware.RequirePermission` (or leave public only for health + login).
3. Trim prefix and `switch` on path + method.
4. Return JSON errors as `{"error":"…"}`.

Canonical shape (see `server/internal/handlers/opd.go`):

```go
func (h *OPD) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequirePermission(h.DB, auth.PermOPD, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/opd")
		switch {
		case path == "/bills" && r.Method == http.MethodGet:
			h.listBills(w, r)
		// …
		default:
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		}
	})).ServeHTTP(w, r)
}
```

## Auth and permissions

- Permission constants and role map: `server/internal/auth/roles.go`.
- New domain capabilities need a new `Perm*` key and role assignments in the same change.
- Catalog / read endpoints for non-admin roles must stay intentional (e.g. OPD reading the OPD catalog without `settings`).
- Never skip `RequirePermission` on mutating routes.

## Schema and migrations

- **Only** change schema via named migrations in `server/internal/db/migrate.go` (ordered `001_…`, `002_…`, …).
- Do not edit production DBs by hand or alter columns in place without a migration plan (add → backfill → drop in separate steps when needed).
- Seed data belongs in `seed.go` for first-run defaults.
- Live hospitals already have data: additive migrations, seed rules, and the ship checklist are in [UPGRADES.md](./UPGRADES.md).

## SQL and transactions

- SQL lives with the handler methods today — acceptable.
- Use transactions for multi-table mutations (pay + stock + audit).
- Respect WAL / foreign keys / busy_timeout already configured in `db.Open`.

## Money, JSON, receipts

- Amounts: integer `*_mmk` (kyat), never floating currency in JSON.
- JSON field names: `snake_case`.
- Receipts / printable HTML: generate on the server; clients open print preview only.

## Audit and backup

- Write audit events on auth-sensitive and money-moving mutations (`internal/audit`).
- Backup/restore flows go through existing backup handlers — do not invent a second path.

## File size and splitting

- When a domain handler file exceeds ~800–1000 lines, split helpers into additional files in the **same** `handlers` package (e.g. `pharmacy_bills.go`), not a new framework.
- Prefer clarity over premature abstraction.

## Formatting and style

- Run `gofmt` / `go fmt` on changed files.
- Short, lowercase package names; avoid `util`, `common`, `helpers` dumping grounds.
- Exported handler types and clear method names (`listBills`, `payBill`).

## Tests

Automated tests are sparse today. When adding critical money or stock logic, prefer a focused `_test.go` beside the package over large end-to-end suites — but do not block features solely for test scaffolding unless asked.
