# Mudita Dashboard

Admin-only Tauri sibling of the Mudita Hospital clinic client. Talks to the same Go API on `:8080` — never opens SQLite directly.

```bash
cd dashboard
npm install
npm run tauri:dev
```

Vite port **1421**. Product id `com.mudita.hospital.dashboard`. Sessions use `mudita_dash_*` localStorage keys so they do not collide with the clinic app.
