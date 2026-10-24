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
| `docs/standards/` | Developer standards (architecture, frontend/backend, feature playbook) — see [docs/standards/README.md](docs/standards/README.md) |
| `scripts/` | Local run + package/install helpers |
| `deploy/server/` | Server package templates (LAN `config.json`, watchdog) |
| `dist/` | Output of `package-server.ps1` / `package-client.ps1` / `package-dashboard.ps1` (gitignored) |
| `AGENTS.md` | Short pointer for AI/human agents → standards index |

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
| `admin` | `admin123` | Admin | Must change password on first login. Opens the portal picker |
| `opd` | `opd123` | OPD | Demo. OPD billing only |
| `ot` | `ot123` | OT | Demo. OT billing and cupboard only |
| `pharmacy` | `pharmacy123` | Pharmacy | Demo. Pharmacy billing and stock only |

## Auth, master data, pharmacy, OPD & OT API

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Bearer |
| GET | `/api/auth/me` | Bearer |
| POST | `/api/auth/change-password` | Bearer |
| GET / PUT | `/api/settings` | Bearer + Admin (`settings`) |
| GET / POST | `/api/doctors` | Bearer + Admin (`settings`) or OPD (`opd`) |
| GET | `/api/doctors/history` | Bearer + Admin (`settings`) or OPD (`opd`) — create/update/deactivate audit for doctors |
| GET / PUT / DELETE | `/api/doctors/{id}` | Bearer + Admin (`settings`) or OPD (`opd`) |
| GET / POST | `/api/services` | Bearer + Admin (`settings`) or OPD (`opd`) |
| GET | `/api/services/history` | Bearer + Admin (`settings`) or OPD (`opd`) — create/update/deactivate audit for services |
| GET / PUT / DELETE | `/api/services/{id}` | Bearer + Admin (`settings`) or OPD (`opd`) |
| GET / POST | `/api/users` | Bearer + Admin (`manage_users`) |
| PUT | `/api/users/{id}` | Bearer + Admin (`manage_users`) |
| GET / POST | `/api/pharmacy/items` | Bearer + `pharmacy` |
| GET / PUT / DELETE | `/api/pharmacy/items/{id}` | Bearer + `pharmacy` |
| POST | `/api/pharmacy/items/{id}/restock` | Bearer + `pharmacy` |
| POST | `/api/pharmacy/items/{id}/adjust` | Bearer + Admin only |
| GET | `/api/pharmacy/items/{id}/batches` | Bearer + `pharmacy` |
| POST | `/api/pharmacy/items/{id}/batches/{batchId}/label` | Bearer + `pharmacy` — set batch number and expiry on a MAIN row; qty unchanged |
| GET | `/api/pharmacy/movements` | Bearer + `pharmacy` |
| GET | `/api/pharmacy/locations` | Bearer + `pharmacy` |
| GET / POST | `/api/pharmacy/bills` | Bearer + `pharmacy` — POST body may set `kind: "return"` (`RT-######`) or `kind: "transfer"` (`TO-######`); default sale is `PH-######`. GET `?kind=sale\|return\|transfer` filters history |
| GET / PUT | `/api/pharmacy/bills/{id}` | Bearer + `pharmacy` |
| POST | `/api/pharmacy/bills/{id}/pay` | Bearer + `pharmacy` — sale deducts FEFO; return credits unlabeled MAIN. `TO-` slips are rejected |
| POST | `/api/pharmacy/bills/{id}/transfer` | Bearer + `pharmacy` — confirm a draft `TO-` slip. Saleable MAIN qty moves into the OT cupboard. Batch number and expiry are copied as stored, including blanks |
| POST | `/api/pharmacy/bills/{id}/void` | Bearer + `pharmacy` — sale restores; return reverses credit when stock remains; a confirmed transfer moves qty back from the OT cupboard when that qty is still there |
| GET | `/api/pharmacy/bills/{id}/print` | Bearer + `pharmacy` — HTML receipt / return slip |
| GET | `/api/opd/catalog/doctors` | Bearer + `opd` |
| GET | `/api/opd/catalog/services` | Bearer + `opd` |
| GET | `/api/opd/catalog/items` | Bearer + `opd` |
| GET | `/api/opd/settings` | Bearer + `opd` (read-only bill header) |
| GET / POST | `/api/opd/bills` | Bearer + `opd` |
| GET / PUT | `/api/opd/bills/{id}` | Bearer + `opd` |
| POST | `/api/opd/bills/{id}/pay` | Bearer + `opd` (cash; FEFO `SALE` at MAIN, skips expired) |
| POST | `/api/opd/bills/{id}/void` | Bearer + `opd` (reason; restores stock if paid) |
| GET | `/api/opd/bills/{id}/print` | Bearer + `opd` (HTML + OS print) |
| GET | `/api/ot/stock` | Bearer + `ot` — cupboard on hand |
| POST | `/api/ot/stock/{id}/return` | Bearer + `ot` — cupboard qty back to MAIN |
| POST | `/api/ot/stock/{id}/label` | Bearer + `ot` — set batch number and expiry on a cupboard row; qty unchanged |
| GET | `/api/ot/catalog/doctors` | Bearer + `ot` (includes OT fee) |
| GET | `/api/ot/catalog/services` | Bearer + `ot` |
| GET | `/api/ot/catalog/items` | Bearer + `ot` — on-hand is `ot_batches`, not MAIN |
| GET | `/api/ot/settings` | Bearer + `ot` (read-only bill header) |
| GET / POST | `/api/ot/cases` | Bearer + `ot` |
| GET / PUT | `/api/ot/cases/{id}` | Bearer + `ot` (edit draft only) |
| GET | `/api/ot/cases/{id}/pick-list` | Bearer + `ot` (HTML pick slip) |
| POST | `/api/ot/cases/{id}/bill` | Bearer + `ot` (cupboard items + OT fee + optional services) |
| GET | `/api/ot/bills` | Bearer + `ot` |
| GET / PUT | `/api/ot/bills/{id}` | Bearer + `ot` |
| POST | `/api/ot/bills/{id}/pay` | Bearer + `ot` (cash; FEFO `SALE` on `ot_batches`, skips expired) |
| POST | `/api/ot/bills/{id}/void` | Bearer + `ot` (restores cupboard qty; case returns to draft) |
| GET | `/api/ot/bills/{id}/print` | Bearer + `ot` (HTML + OS print) |
| GET / POST | `/api/backup` | Bearer + Admin (`settings`) — list / create |
| POST | `/api/backup/restore` | Bearer + Admin — queue restore + API restart |
| GET | `/api/reports/daily-cash` | Bearer — desk sees only its own paid bills; Admin sees OPD + OT + pharmacy. `?date=YYYY-MM-DD` |
| GET | `/api/reports/daily-cash/print` | Bearer — HTML print, same scope as the JSON report |
| GET | `/api/reports/low-stock` | Bearer + Pharmacy/Admin — MAIN qty ≤ reorder |
| GET | `/api/reports/low-stock/print` | Bearer — HTML print |
| GET | `/api/reports/near-expiry` | Bearer + Pharmacy/Admin — MAIN batches, `?days=90` |
| GET | `/api/reports/near-expiry/print` | Bearer — HTML print |
| GET | `/api/dashboard/overview` | Bearer + Admin (`settings`) — combined cash for the date |
| GET | `/api/dashboard/daily-report` | Bearer + Admin — combined cash, prior day, and bill lines |
| GET | `/api/demo/status` | Bearer + Admin — `enabled: false` unless training is turned on. Does not write. |
| POST | `/api/demo/seed` | Bearer + Admin — 403 unless `MUDITA_ALLOW_TRAINING=1` (or `allow_training`). DEMO- catalog + sample paid OPD |
| POST | `/api/demo/reset` | Bearer + Admin — 403 unless training is on. Wipe DEMO-/[TRAINING] then re-seed |

Send `Authorization: Bearer <token>` (also accepts `mudita_session` cookie).

OPD, OT, and Pharmacy cannot open hospital Settings, manage users, backup, or training, and cannot list another desk's bills. OPD can maintain doctors and services from its portal (same `/api/doctors` and `/api/services` as Admin). Admin Settings tabs: Hospital, Doctors, Services, Users, Backup, **Training**. Combined cash is on the admin dashboard, not inside a clinic portal.

**Pharmacy:** Admin + Pharmacy. Stock on hand = sum of `item_batches.qty` at `MAIN`. Restock and opening stock accept an optional batch number and expiry, and restock writes a `PURCHASE` movement. A positive adjustment that creates a batch uses the same optional identity. **Transfer to OT** is a `TO-######` slip. Confirm moves saleable MAIN qty into the OT cupboard the same way a sale picks stock: earliest expiry first, then a blank expiry. A date before today stays on the shelf. Batch number and expiry are copied onto the OT row, including blanks. The slip is not pharmacy cash. **FEFO:** pharmacy sale and an OPD item line take the earliest `expiry_date` at `MAIN`. OT bill pay takes the earliest expiry on `ot_batches`. Both skip batches dated before today. A blank expiry is taken after every dated batch. Labeling a row later does not change quantity. Admin adjust-down still uses earliest expiry, including expired and unlabeled batches. Bill prices come from the item catalog. Unknown item codes cannot be restocked — create the item first. Pack quantities and the small unit cannot change while a batch still has quantity.

**OPD:** Admin + OPD. Portal nav: Doctors, Services, Bill. OPD can create, edit, and deactivate doctors and services (not hospital settings, users, backup, or training). Draft bill lines use the service catalog price and the doctor's consultation fee (one consultation, quantity 1). Medicines are billed in Pharmacy. Pay cash → print HTML. Void with reason restores stock when a paid line was an item. Bill numbers `OPD-000001`…. Totals in MMK. Catalog endpoints remain for read-only lookup while billing.

**OT:** Admin + OT. Draft bill from the OT cupboard, doctor OT fee, and optional services → cash pay → print. Case numbers `OT-######`; bills `OTB-######`. Pay writes `SALE` on `ot_batches` and `ot_bill_stock_allocs`. Void restores those batches and returns the case to draft. Issue and reconcile are gone. History lists OT bills only.

**OT cupboard:** Pharmacy confirms a Transfer to OT slip (`POST /api/pharmacy/bills/{id}/transfer`). Saleable MAIN qty moves in one transaction. The same batch number and expiry, including blanks, land in `ot_batches`, with a `stock_movements` row, an `ot_stock_movements` row, and one `stock_transfers` row linked to the slip. OT returns qty the other way. A qty the source does not hold is rejected and changes nothing. Void of that slip puts the qty back only when the cupboard still holds it. Migration `011_ot_stock` copies existing `OT_FLOOR` qty into `ot_batches`. Migration `012_ot_bill_stock` returns leftover `OT_RESERVED` qty to `MAIN` and turns open issued or reconciled cases into draft bill documents. Paying an OT bill deducts `ot_batches`. Dashboard stock value counts MAIN and `ot_batches` only. Transfer slips are excluded from pharmacy cash.

**Reports:** Each clinic desk's daily cash is its own paid bills. Combined OPD + OT + pharmacy cash is the admin dashboard. Low stock and near expiry (pharmacy) are MAIN only. UI language **English / မြန်မာ**. Help or `?` opens shortcuts; **Print cheat sheet** / [`docs/CHEATSHEET.md`](docs/CHEATSHEET.md) for laminate. Admin **Settings → Training** seeds/resets `DEMO-` / `[TRAINING]` data only when the server is started with `MUDITA_ALLOW_TRAINING=1`. A hospital install leaves that off.

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

Env overrides: `MUDITA_HOST`, `MUDITA_PORT`, `MUDITA_DB_PATH`, `MUDITA_BACKUP_DIR`, `MUDITA_BACKUP_INTERVAL_HOURS`, `MUDITA_ALLOW_TRAINING` (`1` turns training seed/reset on). A missing `allow_training` key stays off.

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

**Chat 8 — Polish** complete: EN/MY i18n, reports, training seed/reset, in-app help, and the cheat sheet. The clinic is three portals (OPD, OT, Pharmacy) plus an admin picker. Combined cash stays on the admin dashboard.

Ops next: install on hospital PCs per [`docs/DEPLOY.md`](docs/DEPLOY.md); dry-run OPD with [`docs/CHEATSHEET.md`](docs/CHEATSHEET.md); seed Training only on a practice DB if needed; leave [`docs/CRASH_RESTORE_CARD.md`](docs/CRASH_RESTORE_CARD.md) filled in before long absence ([`docs/RISK_AND_CONTINUITY.md`](docs/RISK_AND_CONTINUITY.md)).
