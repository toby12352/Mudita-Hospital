# Upgrades (live hospital)

Engineering rules for changing software that already runs at a hospital with real data. Field USB steps: [FIELD_INSTALL_FAQ.md](../FIELD_INSTALL_FAQ.md). Schema mechanics: [BACKEND.md](./BACKEND.md). Always-on agent gate: `.cursor/rules/mudita-production.mdc`.

**This is live hospital software.** It is not a prototype, demo, or development-only project. The hospital install holds real clinical operations, pharmacy inventory, OPD/OT billing, and financial transactions. Every change must be treated as a production upgrade of an existing install.

Highest priorities:

1. Preserve existing production data.
2. Maintain backward compatibility.
3. Support safe, versioned database migrations.
4. Avoid disruption to hospital operations.
5. Stay compatible with the existing install and upgrade process.
6. Never assume the production database is empty.

## Live hospital

| Location | Role |
|----------|------|
| `C:\MuditaHospital\Server\data\mudita.db` | Live production hospital database |
| `server\data\mudita.db` | Developer laptop only |
| Clinic / dashboard apps | Thin clients. They do not store hospital rows |

- Do not copy a development `mudita.db` onto the hospital PC.
- Do not commit hospital databases, PHI dumps, or `dist/` with real data.
- Reinstalling a client or dashboard does not erase server data. Replacing the hospital DB file does.

Existing production databases may contain patient records, pharmacy stock, OPD/OT bills, financial transactions, services, inventory movements, and settings. New features must work on both fresh installs and upgraded production installs. Never require resetting or recreating those records.

## What an update may touch

| Change | Ship | Leave alone |
|--------|------|-------------|
| UI only (labels, layout, screens) | New clinic and/or dashboard package | Server `data\` and `backups\` |
| Schema or API | New `mudita-api.exe` (or re-run `install-server.ps1`) | `data\`, `backups\`, existing `config.json` |
| Both | Server first, then desk apps | Same |

## install-server.ps1 behavior

[`scripts/install-server.ps1`](../../scripts/install-server.ps1) is part of production deployment. Inspect it before changing it.

| Scenario | What the script does today |
|----------|----------------------------|
| Fresh install | Creates `InstallDir`, empty `data\` and `backups\` if missing, copies `mudita-api.exe` and watchdog, writes `config.json` only when absent, registers firewall and startup task |
| Existing upgrade | Overwrites `mudita-api.exe` and watchdog; **keeps** existing `config.json`; creates `data\` / `backups\` only if missing; **does not** open, replace, or wipe `mudita.db` |
| Repeated run | Same as upgrade: binary replace, config preserved, database left alone |

Pending schema migrations are **not** applied by the installer. On the next API start, `db.Open` runs `Migrate()`. Each script name is recorded in `schema_migrations` and skipped if already applied.

**Known gaps (do not invent silent behavior):** the installer does not detect an incompatible database version, validate a restored backup, or version-check `mudita.db`. Those checks are not implemented yet. Future installer work must add them without wiping an existing database. Do not assume that simply re-running `install-server.ps1` is a complete upgrade validation by itself.

## Migration framework

All schema changes go through named migrations in `server/internal/db/migrate.go`.

- `Migrate()` applies pending scripts in order. Each name is tracked in `schema_migrations` and skipped on later starts (repeat-safe).
- `applyMigration` runs each script in its own transaction. On failure the script rolls back and the API fails to start. Do not blindly retry destructive steps after a partial failure.
- Prefer transactions. For operations that cannot safely roll back (rare with SQLite DDL in this setup), document an explicit recovery path.

### Allowed changes

- New tables, nullable columns, indexes, and additive relationships
- New features that use existing structures
- New constraints only after existing data is validated or migrated
- Expand-and-contract for significant schema changes (add → backfill → later drop)

### Do not

- Drop production tables without explicit approval and a copy/rebuild plan
- Delete existing records to accommodate a feature
- Rename columns without a compatibility migration
- Change column types without analyzing existing data
- Add required `NOT NULL` columns without a default or backfill
- Reset sequences or identifiers unnecessarily
- Recreate the production database during an upgrade
- Use development seed data to overwrite production rows
- Edit SQL for a migration name that may already be applied at a hospital

## Migration rules (mechanics)

1. **Append only.** Add a new numbered script (e.g. `014_…`). Do not edit shipped migration SQL.
2. **Add columns with defaults.** Prefer `ALTER TABLE … ADD COLUMN … NOT NULL DEFAULT …` so existing rows stay valid. Pattern: migration `013_ot_sale_unit`.
3. **Backfill in the same migration.** When old values must move into a new column, `UPDATE` them after the `ADD COLUMN` in that script.
4. **Drop later.** Remove or rebuild a column only after a prior migration has copied data. Use `DisableFK` for table rebuilds; copy every existing row; rely on the foreign-key check already in `applyMigration`.
5. **Seeds stay insert-if-missing.** `SeedDefaultUsers` creates desk logins only when the username is absent. Do not reload services, doctors, items, stock, or bills on startup.
6. **Verify on a populated database.** Before shipping: start the API on a DB that already has rows → insert a service and a pharmacy item → add the new migration → restart → confirm those rows (and their IDs) remain.

Unsafe for an upgrade: `DROP TABLE` without a copy, `DELETE` of catalog or bill rows, replacing `mudita.db` with a fresh or laptop file, or editing an already-shipped migration so hospitals diverge from git.

## Existing data compatibility

New application code must handle records created by older versions.

- Newly added nullable fields may be missing or null on older rows; handle them explicitly.
- Existing bills must remain readable with their original transaction values.
- Historical financial calculations must remain unchanged; never silently overwrite historical `*_mmk` values.
- Existing inventory quantities and movements must stay accurate; never duplicate stock movements during migration.
- Existing relationships and identifiers must remain valid.
- New features must not silently reinterpret historical records.

Prefer backward-compatible defaults, null handling, and explicit data migrations over reinterpretation.

## Billing and inventory protection

Billing and inventory records are especially sensitive. Never:

- Reset existing stock quantities
- Recalculate historical bills using newly changed prices
- Remove old service references without a migration
- Change financial records silently
- Duplicate stock movements during migration
- Change historical transaction identifiers
- Introduce migrations that corrupt inventory balances

Keep monetary precision and rounding consistent with existing `*_mmk` integer rules. Existing bills retain their original totals.

## Backup restoration

- Support restoring compatible backups from previous application versions.
- After restore, outstanding migrations apply on the next API start via `Migrate()`.
- Preserve historical data and relationships.
- Validate health (`/api/health`) after restore and migration.
- Never automatically delete or replace a live database during recovery. Use the hospital’s own backups and a documented recovery procedure ([CRASH_RESTORE_CARD.md](../CRASH_RESTORE_CARD.md)).

Application rollback and database rollback are not always equivalent. Plan for both explicitly when shipping a schema-changing release.

## Mandatory engineering gate

Before implementing any change that affects the database or deployment process, explain:

1. What existing structures are affected?
2. Is a database migration required?
3. Will existing production data remain compatible?
4. Will existing backups still be restorable?
5. Will `install-server.ps1` safely upgrade existing installations?
6. What happens if the migration fails?
7. How will the change be tested?

If uncertain, investigate before modifying code. Never claim an upgrade is production-safe without testing it. Never execute a production database migration, destructive operation, or live deployment without explicit authorization.

## Mandatory testing (schema-changing work)

Use an **isolated** database copy. Never the live production file.

| Test | Expectation |
|------|-------------|
| Fresh installation | Correct schema from a clean start |
| Existing database upgrade | Older DB upgrades without data loss; row IDs and counts preserved |
| Backup restoration | Compatible prior backup restores; pending migrations apply |
| Repeated installer | Re-running `install-server.ps1` does not corrupt data, reset config, or duplicate migrations |
| Regression | Pharmacy, OPD, OT, billing, and inventory still work |
| Data integrity | Record counts, critical financial totals, stock balances, and relationships remain valid |

## Release check (hospital PC)

1. Admin → Settings → **Backup now**. Copy `C:\MuditaHospital\Server\backups\` to USB. Confirm the backup can be restored on a test copy and that disk space and permissions are adequate.
2. Identify current application and database migration state. Prefer a maintenance window for schema-changing updates.
3. Stop the API (Administrator PowerShell):

   ```powershell
   Stop-ScheduledTask -TaskName "MuditaHospitalAPI"
   Get-Process mudita-api -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

4. Replace `C:\MuditaHospital\Server\mudita-api.exe` with the new build, or re-run `install-server.ps1` from the server package.
5. Start the scheduled task. Confirm `http://127.0.0.1:8080/api/health` → `"status":"ok"`. If migration fails, the API will not start cleanly — stop, do not blindly retry destructive steps, and follow the recovery procedure from that hospital’s backup.
6. Install or replace clinic (and dashboard) packages on each desk. Server IP stays the same.
7. Spot-check affected workflows (billing, inventory) before resuming normal operations.

**Not the upgrade path**

| Action | Effect |
|--------|--------|
| `uninstall-server.ps1 -RemoveData` | Wipes DB and backups |
| Admin → Restore | Replaces the live database with a backup file |
| Copying laptop `server\data\mudita.db` over the hospital file | Overwrites their services, stock, and bills |

Use Restore only for disaster recovery from that hospital’s own backups. Design rules for additive schema live in this document; short field steps live in [FIELD_INSTALL_FAQ.md](../FIELD_INSTALL_FAQ.md).

## API shape

- New JSON fields are fine. Older clients ignore unknown keys.
- Keep existing field names and money types (`*_mmk`, `snake_case`) until every desk has the new app.
- When a screen needs a new column, update the server (migration + handler) first, then ship the client that reads it.

## Permanent principle

Design every feature as an upgrade to an existing production system. Preserve data. Preserve compatibility. Use versioned migrations. Test upgrades and backup restoration. Protect billing and inventory integrity. When in doubt, prioritize production safety over implementation speed.
