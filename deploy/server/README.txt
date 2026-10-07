Mudita Hospital — Server package
================================

Contents (after package-server.ps1):
  mudita-api.exe     API binary
  config.json        LAN bind 0.0.0.0:8080
  run-watchdog.cmd   Keeps API running (restarts after restore)
  install-server.ps1 Install to C:\MuditaHospital\Server + startup task + firewall
  uninstall-server.ps1

Quick install (Administrator PowerShell):
  .\install-server.ps1

Default install path: C:\MuditaHospital\Server
API: http://SERVER_LAN_IP:8080/api/health

See docs\DEPLOY.md in the repo for switch, static IP, firewall, and USB backup.
