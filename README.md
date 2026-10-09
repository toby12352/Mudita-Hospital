# Mudita Hospital

Offline LAN hospital desktop system (OPD, OT case-cart, pharmacy).

**Stack:** Go API + SQLite (WAL) on the server PC · Tauri 2 + React client on clinic PCs.

## Folder layout

| Path | Role |
|------|------|
| `server/` | Go HTTP API, SQLite DB, `config.json` |
| `client/` | Tauri 2 + React + Vite desktop shell (clinic) |
| `dashboard/` | Tauri 2 + React Admin analytics desktop shell |
| `docs/` | Deploy guide, field install FAQ, staff cheat sheet, risk/continuity, crash card |
| `scripts/` | Local run + package/install helpers |
| `deploy/server/` | Server package templates (LAN `config.json`, watchdog) |
| `dist/` | Output of `package-server.ps1` / `package-client.ps1` / `package-dashboard.ps1` (gitignored) |

## Ports (local dev)

| Service | Default | Config |
|---------|---------|--------|
| API | `http://127.0.0.1:8080` | `server/config.json` or `MUDITA_HOST` / `MUDITA_PORT` |
| Vite (clinic client) | `http://localhost:1420` | `client/vite.config.ts` |
| Vite (dashboard) | `http://localhost:1421` | `dashboard/vite.config.ts` |
| SQLite | `server/data/mudita.db` | `db_path` in config / `MUDITA_DB_PATH` |

## Prerequisites

- **Go** 1.22+ (this machine may use `C:\Mudita_Software\tools\go`)
- **Node.js** 20+ and npm
- **Rust** (stable) + MSVC build tools for Tauri on Windows
- WebView2 (usually preinstalled on Windows 10/11)

### One-time: safe User PATH

So `go` / `node` / `cargo` work in new terminals without touching System PATH:

```powershell
.\scripts\setup-dev-path.ps1
```

Close and reopen the terminal (and Cursor), then check:

```powershell
go version
node -v
```

Only folders that already have the tool `.exe` are added. `.\scripts\package-server.ps1` and `.\scripts\run-server.ps1` also resolve Go by absolute path if PATH is incomplete.

## How to run locally

### 1. API

```powershell
cd server
go mod tidy
go run .
```

Or from repo root:

```powershell
.\scripts\run-server.ps1
```

Smoke check:

```powershell
curl http://127.0.0.1:8080/api/health
```

Expected JSON includes `"status":"ok"` and `"db":"ok"`. First run creates `server/data/mudita.db` (WAL mode) and seeds default users.

### 2. Desktop client

In a second terminal (API already running):

```powershell
cd client
npm install
npm run tauri:dev
```

Or:

```powershell
.\scripts\run-client.ps1
```

If you see `cargo` / `program not found`, run `.\scripts\setup-dev-path.ps1`, reopen the terminal, then use `.\scripts\run-client.ps1` again (it prepends `.cargo\bin` for the session).

Sign in with a seeded user. Admin must change password on first login. Idle lock returns to login after ~15 minutes of inactivity.

### Optional: Vite-only UI (no native window)

```powershell
cd client
npm run dev
```

Open `http://localhost:1420` in a browser.

## Default users (dev)

| Username | Password | Role | Notes |
|----------|----------|------|--------|
| `admin` | `admin123` | Admin | Must change password on first login |
| `pharmacy` | `pharmacy123` | Pharmacy | Demo; cannot open Settings |
| `reception` | `reception123` | Reception | Demo |

## Auth, master data, pharmacy, OPD & OT API

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Bearer |
| GET | `/api/auth/me` | Bearer |
| POST | `/api/auth/change-password` | Bearer |
| GET / PUT | `/api/settings` | Bearer + Admin (`settings`) |
| GET / POST | `/api/doctors` | Bearer + Admin |
| GET / PUT / DELETE | `/api/doctors/{id}` | Bearer + Admin |
| GET / POST | `/api/services` | Bearer + Admin |
| GET / PUT / DELETE | `/api/services/{id}` | Bearer + Admin |
| GET / POST | `/api/users` | Bearer + Admin (`manage_users`) |
| PUT | `/api/users/{id}` | Bearer + Admin (`manage_users`) |
| GET / POST | `/api/pharmacy/items` | Bearer + `pharmacy` |
| GET / PUT / DELETE | `/api/pharmacy/items/{id}` | Bearer + `pharmacy` |
| POST | `/api/pharmacy/items/{id}/restock` | Bearer + `pharmacy` |
| POST | `/api/pharmacy/items/{id}/adjust` | Bearer + Admin only |
| GET | `/api/pharmacy/items/{id}/batches` | Bearer + `pharmacy` |
| GET | `/api/pharmacy/movements` | Bearer + `pharmacy` |
| GET | `/api/pharmacy/locations` | Bearer + `pharmacy` |
| GET | `/api/opd/catalog/doctors` | Bearer + `opd` |
| GET | `/api/opd/catalog/services` | Bearer + `opd` |
| GET | `/api/opd/catalog/items` | Bearer + `opd` |
| GET | `/api/opd/settings` | Bearer + `opd` (read-only bill header) |
| GET / POST | `/api/opd/bills` | Bearer + `opd` |
| GET / PUT | `/api/opd/bills/{id}` | Bearer + `opd` |
| POST | `/api/opd/bills/{id}/pay` | Bearer + `opd` (cash; FEFO `SALE` at MAIN) |
| POST | `/api/opd/bills/{id}/void` | Bearer + `opd` (reason; restores stock if paid) |
| GET | `/api/opd/bills/{id}/print` | Bearer + `opd` (HTML + OS print) |
| GET | `/api/ot/catalog/doctors` | Bearer + `ot` (includes OT fee) |
| GET | `/api/ot/catalog/services` | Bearer + `ot` |
| GET | `/api/ot/catalog/items` | Bearer + `ot` |
| GET | `/api/ot/settings` | Bearer + `ot` (read-only bill header) |
| GET / POST | `/api/ot/cases` | Bearer + `ot` |
| GET / PUT | `/api/ot/cases/{id}` | Bearer + `ot` (edit draft only) |
| POST | `/api/ot/cases/{id}/issue` | Bearer + `ot` (MAIN → OT_RESERVED, FEFO) |
| GET | `/api/ot/cases/{id}/pick-list` | Bearer + `ot` (HTML pick slip) |
| POST | `/api/ot/cases/{id}/reconcile` | Bearer + `ot` (Used/Returned/Wasted/Floor) |
| POST | `/api/ot/cases/{id}/bill` | Bearer + `ot` (used items + OT fee + optional services) |
| GET | `/api/ot/bills` | Bearer + `ot` |
| GET / PUT | `/api/ot/bills/{id}` | Bearer + `ot` |
| POST | `/api/ot/bills/{id}/pay` | Bearer + `ot` (cash; stock already closed) |
| POST | `/api/ot/bills/{id}/void` | Bearer + `ot` (bill only — no stock restore) |
| GET | `/api/ot/bills/{id}/print` | Bearer + `ot` (HTML + OS print) |
| GET / POST | `/api/backup` | Bearer + Admin (`settings`) — list / create |
| POST | `/api/backup/restore` | Bearer + Admin — queue restore + API restart |
| GET | `/api/reports/daily-cash` | Bearer + OPD/OT/Admin — `?date=YYYY-MM-DD` |
| GET | `/api/reports/daily-cash/print` | Bearer — HTML print |
| GET | `/api/reports/low-stock` | Bearer + Pharmacy/Admin |
| GET | `/api/reports/low-stock/print` | Bearer — HTML print |
| GET | `/api/reports/near-expiry` | Bearer + Pharmacy/Admin — `?days=90` |
| GET | `/api/reports/near-expiry/print` | Bearer — HTML print |
| GET | `/api/demo/status` | Bearer + Admin |
| POST | `/api/demo/seed` | Bearer + Admin — DEMO- catalog + sample paid OPD |
| POST | `/api/demo/reset` | Bearer + Admin — wipe DEMO-/[TRAINING] then re-seed |

Send `Authorization: Bearer <token>` (also accepts `mudita_session` cookie).

Reception / Pharmacy cannot open Settings or manage users. Admin Settings tabs: Hospital, Doctors, Services, Users, Backup, **Training**.

**Pharmacy:** Admin + Pharmacy roles. Stock on hand = sum of `item_batches.qty` at location (default `MAIN`). Restock writes a `PURCHASE` movement. Locations `MAIN` / `OT_RESERVED` / `OT_FLOOR`. Item detail shows reserved/floor qty. **FEFO:** earliest `expiry_date` at `MAIN` for Admin adjust-down, OPD cash pay, and OT issue. Unknown item codes cannot be restocked — create the item first.

**OPD:** Admin + Reception. Draft bill → pay cash deducts stock (`SALE` + `bill_stock_allocs` per batch) → print HTML. Void with reason restores exact batches. Bill numbers `OPD-000001`…. Totals in MMK. Catalog endpoints let Reception read doctors/services/items without Admin `settings`/`pharmacy` perms.

**OT:** Admin + Reception. Case cart draft → **Issue** (MAIN→OT_RESERVED via `ISSUE`/`TRANSFER`) → print pick list → **Reconcile** (Used consumed; Returned→MAIN; Wasted written off; KeptOnFloor→OT_FLOOR) → OT bill (used items + doctor OT fee + optional services) → cash pay → print. Case numbers `OT-######`; bills `OTB-######`. Pay does not touch stock (closed at reconcile).

**Reports & polish (Chat 8):** Home **Reports** tile — daily cash (OPD+OT paid), low stock, near expiry (print HTML). UI language **English / မြန်မာ** (Noto Sans Myanmar embedded). Help tile or `?` opens shortcuts; **Print cheat sheet** / [`docs/CHEATSHEET.md`](docs/CHEATSHEET.md) for laminate. Admin **Settings → Training** seeds/resets `DEMO-` / `[TRAINING]` data only.

## Config

`server/config.json` (dev defaults to localhost):

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "db_path": "data/mudita.db",
  "backup_dir": "backups",
  "backup_interval_hours": 24
}
```

Env overrides: `MUDITA_HOST`, `MUDITA_PORT`, `MUDITA_DB_PATH`, `MUDITA_BACKUP_DIR`, `MUDITA_BACKUP_INTERVAL_HOURS`.

- **Localhost bind** (`127.0.0.1`): only this PC (dev default).
- **LAN bind**: packaged server uses `"host": "0.0.0.0"` so clinic clients connect to `http://SERVER_IP:8080`.

Client API base: first-run **Server IP** screen (stored in `localStorage`); optional build-time `VITE_API_BASE`.

## Deploy / packaging (Chat 7)

| Step | Command |
|------|---------|
| Package server | `.\scripts\package-server.ps1` → `dist\server-package\` |
| Install on server PC | Admin PowerShell: `.\install-server.ps1` (startup task + firewall 8080) |
| Package client | `.\scripts\package-client.ps1` → `dist\client-package\` |
| Package dashboard | `.\scripts\package-dashboard.ps1` → `dist\dashboard-package\` |
| Ops guide | [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| Field install FAQ | [`docs/FIELD_INSTALL_FAQ.md`](docs/FIELD_INSTALL_FAQ.md) |
| Risk & continuity | [`docs/RISK_AND_CONTINUITY.pdf`](docs/RISK_AND_CONTINUITY.pdf) ([md](docs/RISK_AND_CONTINUITY.md)) |
| Crash / restore card | [`docs/CRASH_RESTORE_CARD.pdf`](docs/CRASH_RESTORE_CARD.pdf) ([md](docs/CRASH_RESTORE_CARD.md)) |

Backup API (Admin / `settings`): `GET/POST /api/backup`, `POST /api/backup/restore`. UI: Settings → **Backup**.

## Current milestone

**Chat 8 — Polish** complete: EN/MY i18n, reports (daily cash / low stock / near expiry), training seed/reset, in-app help + laminated cheat sheet. All 8 architecture layers shipped.

Ops next: install on hospital PCs per [`docs/DEPLOY.md`](docs/DEPLOY.md); dry-run OPD with [`docs/CHEATSHEET.md`](docs/CHEATSHEET.md); seed Training only on a practice DB if needed; leave [`docs/CRASH_RESTORE_CARD.md`](docs/CRASH_RESTORE_CARD.md) filled in before long absence ([`docs/RISK_AND_CONTINUITY.md`](docs/RISK_AND_CONTINUITY.md)).
