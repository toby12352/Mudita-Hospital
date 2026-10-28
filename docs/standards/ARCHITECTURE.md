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
| Clinic | `client/` | One window. A portal account opens one desk. Admin and unified accounts use the shared clinic sidebar |
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
- Roles → permissions: `server/internal/auth/roles.go`. Grant keys and `access_mode`: `server/internal/auth/grants.go`. See [CONVENTIONS.md](./CONVENTIONS.md).
- Dashboard login is Admin, or any account with the single `dashboard` grant. The dashboard layout is unchanged. That grant does not open clinic Settings.

## Portals

One clinic window, one API, one SQLite file. `access_mode = portal` (the default) still lands on one desk from `users.role`. Those accounts are not converted until Admin saves them. `access_mode = unified` uses the same clinic sidebar as Admin. A module is shown only when that account has Read on it. Settings, user management, and backup stay full Admin. The dashboard is a separate app, not a clinic module.

Admin opens Home, the modules, Settings, and About, and can move between them without a second login. OPD nav opens Doctors, Services, and Bill (doctors also appear in Admin Settings; services are maintained in OPD). Hospital settings, users, backup, and training open from Settings only; Admin Settings still includes Doctors. The Patients portal searches charts and shows visit history across OPD, pharmacy, OT, and IPD, including each stay’s balance and whether it is settled. A clerk may attach one bill that still has no chart. That sets `patient_id` only (on `ot_cases` for an OT bill). It does not guess a match and does not change totals or stock. The IPD portal admits one open stay per chart, takes deposits, posts ward charges, and discharges from the ledger balance. A positive balance writes a refund. A negative balance writes a collection. Zero writes no cash line. The stay is then `settled` and later deposits, ward charges, and desk charges are refused. A statement prints the ledger and a final balance of 0.

Portal accounts and Admin use this landing. A unified account does not: the shell follows Read grants, and `users.role` is only a stored filler.

| Role | Permission | Lands on |
|------|------------|----------|
| Admin | every permission | Shared clinic sidebar |
| OPD | `opd` | OPD billing |
| OT | `ot` | OT billing |
| Pharmacy | `pharmacy` | Pharmacy billing |
| Patients | `patients` | Patient charts and visit history |
| IPD | `ipd` | Stays, deposits, ward charges, discharge, and IPD cash |

OPD replaced Reception. Existing Reception users were migrated to OPD. Seed desks are `opd`, `ot`, `pharmacy`, `patients`, `ipd`, and `admin`. Migration `019_patients_role` rebuilds `users` with the same ids and password hashes and allows the Patients role. Migration `021_ipd_role_admissions` rebuilds `users` the same way and allows the IPD role. It adds `ipd_admissions` and the `IPD-` number sequence. Migration `022_ipd_ledger` adds `ipd_ledger`. Migration `023_bill_admission` adds nullable `admission_id` and `collected_cash INTEGER NOT NULL DEFAULT 1` on the three bill tables. Existing bills stay cash. Discharge uses `status` and `discharged_at` on `ipd_admissions`. It does not add a column.

Patients, the medicine catalog, doctors, and the service price list stay shared. Bills and on-hand stock do not: `opd_bills` are services and consultation, `pharmacy_bills` sell `MAIN`, and OT bills sell the OT cupboard.

## Cash and the OT cupboard

A desk sees only its own bills and its own daily cash. `GET /api/reports/daily-cash` and `GET /api/reports/daily-cash/print` keep lines and totals for the permissions on that token, and only rows with `collected_cash = 1`. Charge to IPD sets `collected_cash = 0` and is not desk cash. Pharmacy `TO-` slips are not cash. Pharmacy `RT-` amounts stay inside the pharmacy desk total.

Admin overview, the daily report, and the 30-day trend all use `buildCashMovement`. `grand_total_mmk` is desk cash only (OPD + OT + pharmacy). `income_mmk` is that desk total plus IPD net. IPD net is deposits, collections, and refunds; a refund reduces income. Ward lines, IPD `charge` and `reversal` rows, and desk charges are not cash. `expense_mmk` is hospital expense cash and is already signed: negative means money out, and a void of an expense is positive. `net_cash_mmk` is `income_mmk + expense_mmk`. A payment stays on the Asia/Yangon civil day of `paid_at`. A void keeps that original amount and posts the opposite amount on the Asia/Yangon civil day of `voided_at`. A void with a blank `voided_at` is left out of both days. `GET /api/dashboard/daily-report/print` is the admin print of that day (hospital name, the three signed totals, desk lines, IPD lines, and expense lines) and requires settings permission. The clinic print does not include IPD or hospital expenses. IPD daily cash for the IPD portal is `GET /api/ipd/daily-cash`.

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
    auth/                 # roles, grants, sessions, password
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
- Print: server returns HTML; client opens a Tauri-safe iframe overlay (`shared/print.ts`). OPD / Pharmacy / Expense: one 80mm thermal slip. OT patient case bills: one A4 payment receipt. Preview **Print** calls `contentWindow.print()` and opens the system print dialog.

## Ports (local)

| Service | Default |
|---------|---------|
| API | `http://127.0.0.1:8080` |
| Clinic Vite | `http://localhost:1420` |
| Dashboard Vite | `http://localhost:1421` |
| SQLite | `server/data/mudita.db` |
