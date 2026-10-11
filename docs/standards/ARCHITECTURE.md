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
| Clinic | `client/` | Day-to-day OPD / OT / Pharmacy / Settings / Reports |
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

## Dependency direction

```
UI (pages /)
  → domain API modules (features/{domain}/api.ts)
    → shared apiFetch (shared/api.ts)
      → Go handlers (SQL + business rules)
        → SQLite
```

- Handlers currently own routing, SQL, and domain rules in one package. Do **not** introduce a generic repository/ORM layer unless a concrete need appears.
- Prefer copying the nearest domain pattern (OPD for simple bills; OT for multi-step workflows) over inventing a new stack.

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
  components/layout/      # Sidebar, Topbar, ServerBadge
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
- Print: server returns HTML; client opens a Tauri-safe iframe overlay (`shared/print.ts`).

## Ports (local)

| Service | Default |
|---------|---------|
| API | `http://127.0.0.1:8080` |
| Clinic Vite | `http://localhost:1420` |
| Dashboard Vite | `http://localhost:1421` |
| SQLite | `server/data/mudita.db` |
