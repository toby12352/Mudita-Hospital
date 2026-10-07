# Mudita Hospital — Crash / restore card

Print [CRASH_RESTORE_CARD.pdf](./CRASH_RESTORE_CARD.pdf) (layout: [CRASH_RESTORE_CARD.html](./CRASH_RESTORE_CARD.html)). Keep at the **server PC** and with the director. Full risk answers: [RISK_AND_CONTINUITY.pdf](./RISK_AND_CONTINUITY.pdf) / [RISK_AND_CONTINUITY.md](./RISK_AND_CONTINUITY.md).

## Fill in at install

| Item | Write here |
|------|------------|
| Server IP | ________________ |
| Server PC location | ________________ |
| Backup USB location | ________________ |
| Support contact (phone) | ________________ |
| Second Admin name | ________________ |
| Remote tool (if any) | ________________ |

## When the app will not work

1. Is the **server PC** powered on and plugged into Ethernet?
2. On a clinic PC: does the badge say **Server connected**? If offline → **Retry**, then check Server IP (table above).
3. On the **server PC**, open a browser:

   `http://127.0.0.1:8080/api/health`

   Expect `"status":"ok"` and `"db":"ok"`.
4. Restart the API (Administrator PowerShell):

   ```
   Stop-ScheduledTask -TaskName "MuditaHospitalAPI"
   Get-Process mudita-api -ErrorAction SilentlyContinue | Stop-Process -Force
   Start-ScheduledTask -TaskName "MuditaHospitalAPI"
   ```

5. Wait ~10 seconds; Retry on clients.
6. If still broken: call support with photos of the badge and the health page.

## Backup (every week — Admin)

1. Admin → Settings → **Backup** → Backup now (also runs automatically every 24h into `C:\MuditaHospital\Server\backups\`).
2. Copy the whole `backups\` folder to the **labeled USB**.
3. Keep the USB locked away (treat like patient / cash records).

## Restore (replaces live data — Admin only)

1. Prefer a backup from **this** hospital only.
2. Admin → Settings → **Backup** → Restore on the chosen file.
3. Wait ~5–10 seconds; clients **Retry**.
4. Confirm a known bill or stock count still looks right.
5. If the app was uninstalled: reinstall server from USB package **without** wiping data, then Restore. Never use `uninstall-server.ps1 -RemoveData` unless the director ordered a full wipe.

## New server PC

1. Backup now on old PC; copy `backups\` to USB.
2. Install server on new PC; set static IP; write new IP above.
3. Restore from USB backup.
4. Point every client at the new Server IP; check health + one tiny bill.

## Daily money / stock safety

- End of day: **Reports → Daily cash** vs cash drawer.
- Weekly: low stock / near expiry vs shelf when possible.
- Two people should know Admin (or sealed emergency password with director).
