# Docs

| Doc | Purpose |
|-----|---------|
| [DEPLOY.md](./DEPLOY.md) | LAN install: switch, static IP, firewall 8080, service/task, USB backup |
| [FIELD_INSTALL_FAQ.pdf](./FIELD_INSTALL_FAQ.pdf) | Customer-site FAQ (print/study). Edit [FIELD_INSTALL_FAQ.md](./FIELD_INSTALL_FAQ.md); print layout [FIELD_INSTALL_FAQ.html](./FIELD_INSTALL_FAQ.html) |
| [CHEATSHEET.pdf](./CHEATSHEET.pdf) | Staff laminate (OPD / OT / Pharmacy / reports). Edit [CHEATSHEET.md](./CHEATSHEET.md); print layout [CHEATSHEET.html](./CHEATSHEET.html) |
| [RISK_AND_CONTINUITY.pdf](./RISK_AND_CONTINUITY.pdf) | Risk & continuity answers (money, crash overseas, staff quit, data loss, security). Edit [RISK_AND_CONTINUITY.md](./RISK_AND_CONTINUITY.md); print layout [RISK_AND_CONTINUITY.html](./RISK_AND_CONTINUITY.html) |
| [CRASH_RESTORE_CARD.pdf](./CRASH_RESTORE_CARD.pdf) | One-page crash / backup / restore / leave-site card. Edit [CRASH_RESTORE_CARD.md](./CRASH_RESTORE_CARD.md); print layout [CRASH_RESTORE_CARD.html](./CRASH_RESTORE_CARD.html) |
| [EXISTING-SYSTEM-DISCOVERY.pdf](./EXISTING-SYSTEM-DISCOVERY.pdf) | Printable checklist: map current reception server ↔ client PCs (SQL Developer, ports, configs). Source: [EXISTING-SYSTEM-DISCOVERY.html](./EXISTING-SYSTEM-DISCOVERY.html) |
| This folder | Ops / architecture notes |

## Dev machine PATH (once)

From repo root (User PATH only; skips tools that are not installed):

```powershell
.\scripts\setup-dev-path.ps1
```

Reopen the terminal, then `go version` / `node -v`. Packaging scripts still find Go at `C:\Mudita_Software\tools\go\bin` if PATH is unset.

## Build packages

```powershell
.\scripts\package-server.ps1
.\scripts\package-client.ps1
.\scripts\package-dashboard.ps1
```

Dev run helpers: `.\scripts\run-server.ps1`, `.\scripts\run-client.ps1`, `.\scripts\run-dashboard.ps1` (Admin analytics app — see [DEPLOY.md](./DEPLOY.md) §2b).
