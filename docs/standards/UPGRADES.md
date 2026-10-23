# Upgrades (live hospital)

Engineering rules for changing software that already runs at a hospital with real data. Field USB steps: [FIELD_INSTALL_FAQ.md](../FIELD_INSTALL_FAQ.md). Schema mechanics: [BACKEND.md](./BACKEND.md).

Assume the install is live. Services, pharmacy items, bills, stock, users, and settings already exist. Updates change the program around that database. They do not replace the database.

## Live hospital

| Location | Role |
|----------|------|
| `C:\MuditaHospital\Server\data\mudita.db` | Hospital database (production / field test) |
| `server\data\mudita.db` | Developer laptop only |
| Clinic / dashboard apps | Thin clients. They do not store hospital rows |

- Do not copy a development `mudita.db` onto the hospital PC.
- Do not commit hospital databases, PHI dumps, or `dist/` with real data.
- Reinstalling a client or dashboard does not erase server data. Replacing the hospital DB file does.

## What an update may touch

| Change | Ship | Leave alone |
|--------|------|-------------|
| UI only (labels, layout, screens) | New clinic and/or dashboard package | Server `data\` and `backups\` |
| Schema or API | New `mudita-api.exe` (or re-run `install-server.ps1`) | `data\`, `backups\`, existing `config.json` |
| Both | Server first, then desk apps | Same |

`install-server.ps1` overwrites `mudita-api.exe` and keeps `config.json` when it already exists. It creates empty `data\` and `backups\` only if missing. It does not wipe an existing database.

On every API start, `db.Open` runs `Migrate()`. Each script name is recorded in `schema_migrations` and skipped if already applied. Pending scripts run once against the hospital file.

## Migration rules

All schema changes go through named migrations in `server/internal/db/migrate.go`.

1. **Append only.** Add a new numbered script (e.g. `014_…`). Do not edit SQL for a name that may already be applied at a hospital.
2. **Add columns with defaults.** Prefer `ALTER TABLE … ADD COLUMN … NOT NULL DEFAULT …` so existing rows stay valid. Pattern: migration `013_ot_sale_unit`.
3. **Backfill in the same migration.** When old values must move into a new column, `UPDATE` them after the `ADD COLUMN` in that script.
4. **Drop later.** Remove or rebuild a column only after a prior migration has copied data. Use `DisableFK` for table rebuilds; copy every existing row; rely on the foreign-key check already in `applyMigration`.
5. **Seeds stay insert-if-missing.** `SeedDefaultUsers` creates desk logins only when the username is absent. Do not reload services, doctors, items, stock, or bills on startup.
6. **Verify on a populated database.** Before shipping: start the API on a DB that already has rows → insert a service and a pharmacy item → add the new migration → restart → confirm those rows (and their IDs) remain.

Unsafe for an upgrade: `DROP TABLE` without a copy, `DELETE` of catalog or bill rows, replacing `mudita.db` with a fresh or laptop file, or editing an already-shipped migration so hospitals diverge from git.

## API shape

- New JSON fields are fine. Older clients ignore unknown keys.
- Keep existing field names and money types (`*_mmk`, `snake_case`) until every desk has the new app.
- When a screen needs a new column, update the server (migration + handler) first, then ship the client that reads it.

## Release check (hospital PC)

1. Admin → Settings → **Backup now**. Copy `C:\MuditaHospital\Server\backups\` to USB.
2. Stop the API (Administrator PowerShell):

   ```powershell
   Stop-ScheduledTask -TaskName "MuditaHospitalAPI"
   Get-Process mudita-api -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

3. Replace `C:\MuditaHospital\Server\mudita-api.exe` with the new build, or re-run `install-server.ps1` from the server package.
4. Start the scheduled task. Confirm `http://127.0.0.1:8080/api/health` → `"status":"ok"`.
5. Install or replace clinic (and dashboard) packages on each desk. Server IP stays the same.

**Not the upgrade path**

| Action | Effect |
|--------|--------|
| `uninstall-server.ps1 -RemoveData` | Wipes DB and backups |
| Admin → Restore | Replaces the live database with a backup file |
| Copying laptop `server\data\mudita.db` over the hospital file | Overwrites their services, stock, and bills |

Use Restore only for disaster recovery from that hospital’s own backups. Design rules for additive schema live in this document; short field steps live in [FIELD_INSTALL_FAQ.md](../FIELD_INSTALL_FAQ.md).
