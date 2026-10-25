# Agent instructions (Mudita Hospital)

Engineering standards live in **[docs/standards/README.md](docs/standards/README.md)**. Start there for architecture, folder layout, and how to add a feature.

## Quick map

| Area | Path | Standard |
|------|------|----------|
| System overview | `server/`, `client/`, `dashboard/` | [ARCHITECTURE.md](docs/standards/ARCHITECTURE.md) |
| React / Tauri UI | `client/`, `dashboard/` | [FRONTEND.md](docs/standards/FRONTEND.md) |
| Go API | `server/` | [BACKEND.md](docs/standards/BACKEND.md) |
| Naming / contracts | everywhere | [CONVENTIONS.md](docs/standards/CONVENTIONS.md) |
| New domain checklist | — | [ADDING_A_FEATURE.md](docs/standards/ADDING_A_FEATURE.md) |
| Live upgrades / migrations | `server/internal/db/migrate.go` | [UPGRADES.md](docs/standards/UPGRADES.md) |
| Deploy / field ops | `docs/*.md` (not standards) | [docs/README.md](docs/README.md) |

## Cursor project rules

| Rule | When |
|------|------|
| `.cursor/rules/mudita-core.mdc` | Always |
| `.cursor/rules/mudita-production.mdc` | Always — live production / upgrade safety |
| `.cursor/rules/mudita-frontend.mdc` | `client/**`, `dashboard/**` |
| `.cursor/rules/mudita-backend.mdc` | `server/**` |
| `.cursor/rules/mudita-docs.mdc` | `docs/**` |

Rules stay short and point at `docs/standards/` — do not duplicate full guides into rule files. Full upgrade policy lives in [UPGRADES.md](docs/standards/UPGRADES.md).

## Non-negotiables

- Clients never open SQLite
- New clinic UI: `pages/` / `features/` — do not grow `app/App.tsx` with new panels
- Schema only via `server/internal/db/migrate.go`
- Live production: preserve `data\mudita.db`; schema/upgrade safety — [UPGRADES.md](docs/standards/UPGRADES.md)
- Match nearest domain (OPD / OT / Pharmacy); no new frameworks by default
