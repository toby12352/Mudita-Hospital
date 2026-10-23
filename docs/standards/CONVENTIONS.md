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

- `Admin` — every permission; lands on the portal picker
- `OPD` — `opd` only (replaces Reception)
- `OT` — `ot` only
- `Pharmacy` — `pharmacy` only

**Permissions** (lowercase keys):

- `settings`
- `manage_users`
- `opd`
- `ot`
- `pharmacy`

Source of truth: `server/internal/auth/roles.go`. UI gates use the same string keys.

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
