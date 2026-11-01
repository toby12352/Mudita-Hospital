# Mudita Hospital — Developer Standards

Offline LAN hospital system: **Go + SQLite API** on a server PC; **Tauri 2 + React** clinic client and Admin dashboard on workstations. Clients never open the database.

Start here when joining the codebase or opening a new Agent chat. Read only the doc that matches your task — do not load all of `docs/` unless the work is deploy/ops.

## Where do I look?

| Task | Look here first |
|------|-----------------|
| Clinic UI (OPD, OT, Pharmacy, Settings) | `client/src/pages/` · shell in `client/src/app/` — see [FRONTEND.md](./FRONTEND.md) |
| Admin analytics UI | `dashboard/src/pages/`, `dashboard/src/components/` |
| Domain API client (TS) | `client/src/features/{opd,ot,pharmacy,reports,settings}/` |
| HTTP handlers / SQL | `server/internal/handlers/` |
| Auth, roles, permissions | `server/internal/auth/`, `server/internal/middleware/` |
| Schema / migrations | `server/internal/db/migrate.go` — see [UPGRADES.md](./UPGRADES.md) |
| Upgrade a live hospital install (mandatory for schema / installer / billing / inventory) | [UPGRADES.md](./UPGRADES.md) · always-on gate `.cursor/rules/mudita-production.mdc` · field steps in [FIELD_INSTALL_FAQ.md](../FIELD_INSTALL_FAQ.md) |
| Seed users / demo data | `server/internal/db/seed.go` |
| Route registration | `server/main.go` |
| Deploy / LAN install | [DEPLOY.md](../DEPLOY.md) |
| Staff cheat sheet / field FAQ | [docs/README.md](../README.md) |
| Staff workflow truth and tour scripts | Staff workflow truth is [docs/guidance/WORKFLOWS.md](../guidance/WORKFLOWS.md); tour scripts are [docs/guidance/tours/](../guidance/tours/) |
| Typography, contrast, and portal accessibility rollout | [UNIFIED_DESIGN_SYSTEM.md](../accessibility/UNIFIED_DESIGN_SYSTEM.md) · inventory [PORTAL_INVENTORY.md](../accessibility/PORTAL_INVENTORY.md) · status [IMPLEMENTATION_STATUS.md](../accessibility/IMPLEMENTATION_STATUS.md) |
| Full API table | [README.md](../../README.md) |

## Standards index

| Doc | When to read |
|-----|----------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System map, apps, data flow, dependency rules |
| [FRONTEND.md](./FRONTEND.md) | Folder layout, React patterns, i18n, CSS, storage keys; clinic action buttons / design system (client only) |
| [BACKEND.md](./BACKEND.md) | Handlers, auth, migrations, API shape |
| [CONVENTIONS.md](./CONVENTIONS.md) | Naming, money, errors, roles, bill prefixes |
| [ADDING_A_FEATURE.md](./ADDING_A_FEATURE.md) | Step-by-step playbook for a new domain |
| [UPGRADES.md](./UPGRADES.md) | Live production upgrades: data preservation, migrations, `install-server.ps1`, billing/inventory protection, test checklist |
| [../accessibility/UNIFIED_DESIGN_SYSTEM.md](../accessibility/UNIFIED_DESIGN_SYSTEM.md) | Cross-portal type, contrast, focus, and control sizes. Read the status file before editing UI |

## Ops vs engineering docs

- **Engineering standards** live in this folder (`docs/standards/`).
- **Accessibility rollout** lives in `docs/accessibility/` (design system, portal inventory, implementation status). It is not a field-ops guide.
- **Field / ops** docs live in `docs/` root (DEPLOY, FAQ, cheat sheet, crash card). Edit those only for install/runbook changes — do not treat them as coding guides.

## Cursor

Project rules in `.cursor/rules/` point here. Always-on context is a short map, the live-production gate (`mudita-production.mdc` → [UPGRADES.md](./UPGRADES.md)), and the accessibility rollout (`mudita-a11y.mdc` → `docs/accessibility/`). Detailed frontend/backend standards load when you work under `client/`, `dashboard/`, or `server/`.
