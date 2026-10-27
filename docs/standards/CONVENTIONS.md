# Conventions

Shared naming and contract rules for API, DB, and clients.

## JSON and database

| Rule | Example |
|------|---------|
| `snake_case` fields | `must_change_password`, `bill_no` |
| Money as integer kyat | `price_mmk`, `amount_mmk`, `total_mmk` |
| Booleans | `active`, `must_change_password` |
| IDs | numeric `id`; foreign keys `{entity}_id` |

Never send currency as floats. Never camelCase in API JSON.

## Roles and permissions

**Roles** (capitalized English, stored on `users.role`):

- `Admin` — every permission; lands on the admin sidebar Home screen
- `OPD` — `opd` only (replaces Reception)
- `OT` — `ot` only
- `Pharmacy` — `pharmacy` only
- `Patients` — `patients` only (charts and visit history)
- `IPD` — `ipd` only (admit a chart, list stays, edit notes, take deposits, post ward charges)

**Permissions** (lowercase keys):

- `settings`
- `manage_users`
- `opd`
- `ot`
- `pharmacy`
- `patients` — Admin and Patients (chart create, edit, and history). OPD, OT, Pharmacy, and IPD do not have this permission. Those desks may still search and open one chart; the patients handler allows that read without letting them create, edit, or open history
- `ipd` — Admin and IPD (admit, list, open one stay, edit notes, deposits, and ward charges while the stay is open). No discharge and no desk-bill charges yet

Source of truth for portal desks: `server/internal/auth/roles.go`. UI gates use the same string keys.

## Access mode and grants

`users.access_mode` is `portal` or `unified`. The column defaults to `portal`. Existing desk accounts stay on that mode until Admin saves them from Settings → Users. Portal accounts keep the role above and the single desk rail.

Unified accounts are authorized by rows in `user_grants`, not by `users.role`. The role column still holds one of the strings above (a filler for the check constraint). Authorization must not trust it when `access_mode` is `unified`.

Grant keys are `{module}.{action}`:

| Module | Actions |
|--------|---------|
| `patients` | `read`, `create`, `update`, `delete` |
| `ipd` | `read`, `create`, `update` (`ipd.delete` is not stored) |
| `opd` | `read`, `create`, `update`, `delete` |
| `ot` | `read`, `create`, `update`, `delete` |
| `pharmacy` | `read`, `create`, `update`, `delete` |

`settings` and `manage_users` are not grantable. Admin has no grant rows and passes every check.

`dashboard` is one grant, not four cells. It opens the separate dashboard app. It does not open clinic Settings or the user matrix.

Create is daily work: a chart, bill, payment, admission, deposit, ward charge, or restock quantity. Draft-bill edits stay under Create. Update is master data: prices, fees, drug setup, and stock adjust. Delete is removal or void. Creating a drug or a service is Update. Pharmacy Update covers buy/sell prices and stock adjust. OPD Update covers service fees and doctor fees.

The clinic hides those buttons using the keys from `/api/auth/me`. The server check is the boundary. Portal Pharmacy stock adjust stays denied. Unused-chart delete stays Admin-only; `patients.delete` does not open it.

## API paths

- Prefix: `/api/{domain}/…`
- Examples: `/api/opd/bills`, `/api/ot/cases/{id}/…`, `/api/pharmacy/…`
- Public: `GET /api/health`, `POST /api/auth/login`
- Errors: `{"error":"human readable message"}` — clients throw on non-OK using `.error`

When adding endpoints, update the API table in the root [README.md](../../README.md).

## Bill / document numbers

| Domain | Pattern |
|--------|---------|
| OPD bill | `OPD-000001` (`OPD-%06d`) |
| OT case | `OT-000001` |
| OT bill | `OTB-000001` |
| IPD admission | `IPD-000001` |

Keep zero-padded numeric suffixes consistent with existing generators in handlers.

## Stock locations (pharmacy / OT)

Live on-hand is `item_batches` at `MAIN` and `ot_batches` (the OT cupboard). `OT_RESERVED` and `OT_FLOOR` remain as legacy rows and are not valued. Do not invent new location strings without migration + handler support (FEFO / movements).

## File and symbol naming

| Area | Convention | Examples |
|------|------------|----------|
| Client domain modules | camelCase file, domain noun | `opd.ts`, `masterData.ts` |
| Go packages | lowercase, short | `handlers`, `auth`, `db` |
| Go handler types | Exported domain name | `type OPD struct`, `type OT struct` |
| CSS classes | kebab / BEM-ish | `.print-preview-card--receipt` |
| i18n keys | camelCase | `tileOpdSub` |
| localStorage clinic | `mudita_*` | `mudita_token` |
| localStorage dashboard | `mudita_dash_*` | `mudita_dash_token` |

## TypeScript

- Prefer named exports for domain APIs and types.
- Colocate request/response types with the functions that use them.
- Do not duplicate `TOKEN_KEY` / storage key constants across files in new code — import from one module.

## Go

- `gofmt` on save / before commit.
- Package name matches directory; avoid stutter (`auth.AuthToken` → prefer `auth.Token` where clear).
- No new third-party HTTP routers or ORMs without an explicit decision.

## Commits and secrets

- Do not commit `.env` secrets, live DB files with PHI, or packaging `dist/` output.
- Prefer small, domain-scoped changes (migration + handler + client API + UI + i18n together for one feature).
