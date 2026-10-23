# Adding a feature (playbook)

Use this checklist for a **new domain** (e.g. Lab billing) or a substantial extension of an existing one. Keep clinic and server changes in the same effort so the API and UI stay aligned.

## Choose a template

| If your feature is like… | Copy patterns from… |
|--------------------------|---------------------|
| Simple bill create → pay → void / print | OPD: `server/internal/handlers/opd.go`, `client/src/features/opd/api.ts`, `client/src/pages/opd/` |
| Multi-step case + stock + bill | OT: `server/internal/handlers/ot.go`, `client/src/features/ot/api.ts`, `client/src/pages/ot/` |
| Inventory / FEFO / movements | Pharmacy: `server/internal/handlers/pharmacy*.go`, `client/src/features/pharmacy/api.ts`, `client/src/pages/pharmacy/` |
| Admin-only master data CRUD | Doctors/Services handlers + Settings UI / dashboard MasterData |
| Admin analytics page | `dashboard/src/pages/*` + dashboard API modules |

## Checklist

### 1. Schema

- [ ] Add a named migration in `server/internal/db/migrate.go`
- [ ] Migration is additive and keeps existing hospital rows (see [UPGRADES.md](./UPGRADES.md))
- [ ] Seed defaults in `seed.go` only if first-run data is required
- [ ] Use `snake_case` columns and `*_mmk` for money

### 2. Permissions

- [ ] Add `Perm*` in `server/internal/auth/roles.go` if this is a new capability
- [ ] Assign roles (Admin / OPD / OT / Pharmacy) deliberately
- [ ] Gate every mutating (and most read) route with `RequirePermission`

### 3. Handler + routes

- [ ] Add handler type under `server/internal/handlers/`
- [ ] Implement `ServeHTTP` with path/method switch (see [BACKEND.md](./BACKEND.md))
- [ ] Register in `server/main.go`
- [ ] Return `{"error":"…"}` on failures; use transactions for multi-step money/stock
- [ ] Audit money-moving and auth-sensitive mutations
- [ ] Receipt HTML on the server if printable output is needed

### 4. Client API module

- [ ] Add `client/src/features/{domain}/api.ts`
- [ ] Types + named `apiFetch` wrappers only — no duplicated auth headers
- [ ] Mirror JSON `snake_case` / `*_mmk`

### 5. UI

- [ ] New page under `client/src/pages/{domain}/` (do **not** grow `app/App.tsx` with a new panel)
- [ ] Wire view id + home tile + permission check in `app/App.tsx` / `pages/home/HomePage.tsx`
- [ ] Dashboard-only features go under `dashboard/src/pages/`
- [ ] Reuse Typeahead / print / layout patterns from existing screens

### 6. i18n

- [ ] Add EN and MY keys in `shared/i18n.ts` for every new user-visible string

### 7. Docs

- [ ] Add rows to the API table in root `README.md`
- [ ] Update staff cheat sheet only if frontline workflow changed (`docs/CHEATSHEET.md`)

## Minimal “hello domain” order

```
migrate.go → roles.go → handlers/{domain}.go → main.go
  → client features/{domain}/api.ts → pages/{domain}/
  → shell tile + i18n → README API table
```

## What not to do

- Do not open SQLite from the client
- Do not add React Router / Redux / a new HTTP framework for one feature
- Do not mix `mudita_*` and `mudita_dash_*` storage keys
- Do not skip server permission checks because the tile is hidden
- Do not edit schema outside migrations

## After the feature ships

Keep new UI in `pages/` and APIs in `features/` so the shell stays thin. See [FRONTEND.md](./FRONTEND.md).
