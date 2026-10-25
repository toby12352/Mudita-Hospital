# Architecture

## System map

```
┌─────────────────┐     ┌─────────────────┐
│  Clinic client  │     │ Admin dashboard │
│  Tauri + React  │     │ Tauri + React   │
│  :1420 (Vite)   │     │ :1421 (Vite)    │
└────────┬────────┘     └────────┬────────┘
         │  HTTPS/HTTP JSON      │
         │  Bearer / cookie      │
         └──────────┬────────────┘
                    ▼
         ┌─────────────────────┐
         │  Go API  :8080      │
         │  server/            │
         └──────────┬──────────┘
                    ▼
         ┌─────────────────────┐
         │  SQLite (WAL)       │
         │  server/data/       │
         └─────────────────────┘
```

| App | Path | Role |
|-----|------|------|
| API | `server/` | Auth, domain handlers, migrations, backup, receipts |
| Clinic | `client/` | One window. Login opens OPD, OT, or Pharmacy. Admin picks a portal or Settings |
| Dashboard | `dashboard/` | Admin analytics (overview, revenue, stock, audit, master data bulk) |

Shared brand asset: `assets/logo.png`. Packaging: `scripts/`, `deploy/server/`, output in `dist/`.

## Hard boundaries

1. **SQLite is server-only.** Never open or migrate the DB from Tauri/React.
2. **One API.** Clinic and dashboard call the same `/api/...` surface; they do not share a private JS package today (duplicate `api.ts` / `auth.ts` with different storage key prefixes is intentional).
3. **Permission gates** live on the server (`RequirePermission`). UI hides tiles as UX only — never trust the client alone.
4. **LAN-first.** First-run Server IP setup; optional `VITE_API_BASE`; env overrides `MUDITA_*` on the server.

## Auth and sessions

- Login → session token in SQLite (`sessions`); clients send `Authorization: Bearer` (and may use cookie).
- Clinic localStorage: `mudita_*` (e.g. `mudita_token`, `mudita_api_base`).
- Dashboard localStorage: `mudita_dash_*` so sessions do not collide.
- Idle lock (~15 min) returns to login on clinic.
- Roles → permissions: `server/internal/auth/roles.go`. Dashboard requires Admin.

## Portals

One clinic window, one API, one SQLite file. The role on the session decides the portal. Admin opens a picker (OPD, OT, Pharmacy, Settings) and can step back without a second login. The nav shows only that portal. OPD nav opens Doctors, Services, and Bill (same doctor and service screens as Admin Settings). Hospital settings, users, backup, and training open from the admin picker only; Admin Settings still includes Doctors and Services.

| Role | Permission | Lands on |
|------|------------|----------|
| Admin | every permission | Portal picker |
| OPD | `opd` | OPD billing |
| OT | `ot` | OT billing |
| Pharmacy | `pharmacy` | Pharmacy billing |

OPD replaced Reception. Existing Reception users were migrated to OPD. Seed desks are `opd`, `ot`, `pharmacy`, and `admin`.

Patients, the medicine catalog, doctors, and the service price list stay shared. Bills and on-hand stock do not: `opd_bills` are services and consultation, `pharmacy_bills` sell `MAIN`, and OT bills sell the OT cupboard.

## Cash and the OT cupboard

A desk sees only its own bills and its own daily cash. `GET /api/reports/daily-cash` keeps lines and totals for the permissions on that token. Combined daily cash (OPD + OT + pharmacy) stays on the admin dashboard (`/api/dashboard/overview`, `/api/dashboard/daily-report`, and the admin print of daily cash).

Pharmacy confirms a Transfer to OT slip (`POST /api/pharmacy/bills/{id}/transfer`). One transaction moves saleable `MAIN` qty into `ot_batches` the same way a sale would pick it. Batch number and expiry are optional and are copied as stored, including blanks. The slip writes both ledgers and links them with `stock_transfers`. OT stock increases on confirm. OT returns qty the other way. An OT bill still lists the case; item lines read OT on-hand, and stock drops only when that bill is paid. Void of a paid OT bill puts those batches back. Void of a transfer puts the qty back only when the cupboard still holds it. Unused cupboard qty is not touched. There is no issue or reconcile step. Transfer slips are not pharmacy cash.

Live on-hand is `item_batches` at `MAIN` plus `ot_batches`. `OT_RESERVED` and `OT_FLOOR` are legacy rows. Dashboard inventory values MAIN and the OT cupboard and does not add those rows, because floor qty was copied into `ot_batches`.

## Dependency direction

```
UI (pages /)
  → domain API modules (features/{domain}/api.ts)
    → shared apiFetch (shared/api.ts)
      → Go handlers (SQL + business rules)
        → SQLite
```

- Handlers currently own routing, SQL, and domain rules in one package. Do **not** introduce a generic repository/ORM layer unless a concrete need appears.
- Prefer copying the nearest domain pattern (OPD for simple bills; OT for cupboard billing; Pharmacy for stock) over inventing a new stack.

## Server layout (current — keep)

```
server/
  main.go                 # mux registration + ListenAndServe
  config.json
  internal/
    handlers/             # one ServeHTTP type per domain
    middleware/           # CORS, RequireAuth, RequirePermission
    auth/                 # roles, sessions, password
    db/                   # Open, Migrate, Seed
    audit/
    backup/
    config/
    assets/
```

Follow [Go module layout](https://go.dev/doc/modules/layout): application code stays under `internal/`. Do not add a root `pkg/` folder.

## Frontend layout

### Dashboard (reference — already modular)

```
dashboard/src/
  App.tsx                 # shell: boot, auth, page switch
  pages/                  # one page component per nav item
  components/layout/      # Sidebar, WorkspaceHeader, AccountMenu, ServerBadge (no radio bar or status footer)
  components/kpi/         # reusable widgets
  lib/                    # format helpers
  api.ts, auth.ts, i18n.ts, …
```

### Clinic (current)

```
client/src/
  app/           # shell, view routing, boot / login
  pages/         # one folder per view (opd, ot, pharmacy, …)
  features/      # domain API + types colocated (opd/, ot/, …)
  shared/        # Typeahead, print, api, auth, i18n, css
```

Align clinic vocabulary with dashboard: pages for screens, shared for cross-cutting UI/infra. Full Feature-Sliced Design layers are **out of scope**. Details: [FRONTEND.md](./FRONTEND.md).

## Routing and state

- No React Router. Clinic uses a `View` string union + `setView`; dashboard uses `PageId` + `setPage`.
- No Redux / Zustand / React Query by default. Panel-local `useState` / `useEffect` is the norm.
- Print: server returns HTML (one receipt slip); client opens a Tauri-safe iframe overlay (`shared/print.ts`). Preview **Print** calls `contentWindow.print()` and opens the system print dialog.

## Ports (local)

| Service | Default |
|---------|---------|
| API | `http://127.0.0.1:8080` |
| Clinic Vite | `http://localhost:1420` |
| Dashboard Vite | `http://localhost:1421` |
| SQLite | `server/data/mudita.db` |
