# Mudita Hospital — Deploy (LAN)

Staff-readable install for **one server PC** + **clinic client PCs**. No internet required after installers are copied by USB.

## What you need

| Item | Notes |
|------|--------|
| Wired Ethernet switch | 100 Mbps+; avoid Wi‑Fi for billing |
| Static IP on server | e.g. `192.168.1.10` |
| Port **8080** open on server firewall | Install script adds the rule |
| USB stick | Weekly copy of `backups\` folder |
| Crash / restore card | Print [CRASH_RESTORE_CARD.pdf](./CRASH_RESTORE_CARD.pdf); fill Server IP & support contact ([RISK_AND_CONTINUITY.pdf](./RISK_AND_CONTINUITY.pdf)) |

## 1. Server PC

### Prepare network

1. Plug server into the switch with Ethernet.
2. Set a **static IPv4** (Windows → Network → Adapter → IPv4):
   - IP: e.g. `192.168.1.10`
   - Mask: `255.255.255.0`
   - Gateway: your router if any (optional on closed LAN)
3. Note that IP — clients will use it.

### Install API

1. On a build PC (or this repo), run:

   ```powershell
   .\scripts\package-server.ps1
   ```

2. Copy `dist\server-package\` to the server (USB), open **Administrator** PowerShell in that folder:

   ```powershell
   .\install-server.ps1
   ```

3. Default install path: `C:\MuditaHospital\Server`
4. Confirm health in a browser on the server:

   `http://127.0.0.1:8080/api/health`

5. From another PC on the LAN:

   `http://192.168.1.10:8080/api/health`  
   (use your real server IP)

### Autostart

Install registers scheduled task **MuditaHospitalAPI** (runs at startup as SYSTEM via `run-watchdog.cmd`). The watchdog restarts the API after Admin **Restore** (process exits cleanly).

Uninstall:

```powershell
.\uninstall-server.ps1
# optional: .\uninstall-server.ps1 -RemoveData
```

### Config (`C:\MuditaHospital\Server\config.json`)

```json
{
  "host": "0.0.0.0",
  "port": 8080,
  "db_path": "data/mudita.db",
  "backup_dir": "backups",
  "backup_interval_hours": 24
}
```

- `0.0.0.0` = listen on all interfaces (required for LAN clients).
- Do **not** use `127.0.0.1` on the hospital server.

## 2. Client PCs

1. Build:

   ```powershell
   .\scripts\package-client.ps1
   ```

2. Copy `dist\client-package\` (MSI / setup / `MuditaHospital.exe`) to each clinic PC and install or run.
3. **First launch:** enter the server IP (e.g. `192.168.1.10`). Port `8080` is added automatically.
4. Sign in (`admin` / `admin123` on a fresh DB — change password when prompted).

If the badge says **Server offline**:

- Retry
- Change server IP
- Check Ethernet cable, switch, server power, firewall port 8080

## 2b. Admin Dashboard (director PC)

**Mudita Dashboard** is a separate Tauri app for **Admin only** (analytics, daily cash reconciliation, bulk master-data / CSV). Reception and Pharmacy stay on the clinic client.

1. From the repo (dev): `.\scripts\run-dashboard.ps1` — Vite port **1421**, product id `com.mudita.hospital.dashboard`.
2. First launch: enter the same Server IP as the clinic client (`:8080`). Sessions use distinct keys (`mudita_dash_*`) so both apps can run on one PC.
3. Sign in with an **Admin** account. Non-Admin logins are rejected.
4. Bulk price / CSV changes write `audit_logs` and need typed confirm + reason. They do **not** replace USB weekly backups — still copy `backups\` off the server.

Dashboard never opens SQLite directly; reinstalling the app does not lose hospital data.

## 3. Backup & restore

| Action | How |
|--------|-----|
| Backup now | Admin → Settings → **Backup** → Backup now |
| Auto backup | Every `backup_interval_hours` (default 24) into `backups\` |
| USB weekly | Copy `C:\MuditaHospital\Server\backups\` to a labeled USB; keep off-site if possible |
| Restore | Admin → Backup → Restore on a listed file (API restarts; wait ~5s then Retry) |
| Staff card | [CRASH_RESTORE_CARD.md](./CRASH_RESTORE_CARD.md) — crash steps, USB ritual, new PC transfer |

Restore replaces the live database. Only restore from backups created on this hospital. Risk posture (money, remote support, security): [RISK_AND_CONTINUITY.md](./RISK_AND_CONTINUITY.md).

## 4. Smoke checklist (2 PCs)

- [ ] Server boots; task running; `http://SERVER_IP:8080/api/health` → `"status":"ok"`
- [ ] Client first-run IP → green **Server connected**
- [ ] Admin login works; Reception login works
- [ ] Create a tiny OPD draft or pharmacy restock on client
- [ ] Admin **Backup now**; see a new `.db` under `backups\`
- [ ] (Optional) Restore that backup; after restart, data matches
- [ ] Unplug client cable → **Server offline**; plug back → Retry → connected

## Firewall (manual)

If the install script was not used:

```powershell
New-NetFirewallRule -DisplayName "Mudita Hospital API" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080
```
