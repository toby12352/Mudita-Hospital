# Mudita Hospital — Staff cheat sheet

Print this page (or use **Help → Print cheat sheet** in the app) and laminate for the reception / pharmacy desk.

## 1. Sign in

1. Open Mudita on the clinic PC.
2. First launch: enter **Server IP** (port `8080`), e.g. `192.168.1.10`.
3. Sign in:
   - Reception: `reception` / (hospital password)
   - Pharmacy: `pharmacy` / …
   - Admin: `admin` / …
4. Idle ~15 minutes → auto lock. Switch language **English / မြန်မာ** in the top bar.

## 2. OPD bill (cash)

1. Home → **OPD** → New bill.
2. Patient name → doctor → type item or service **code** → **Enter** to add line.
3. **Pay cash** (stock drops on pay) → **Print** (preview opens in the app).
4. First time printing a receipt: choose **EPSON TM-T82 Receipt**, paper **80 mm**, no scaling / fit to printable width.
5. Void needs a reason (restores stock if already paid).

## 3. OT case cart

1. Home → **OT** → New case → add items → **Issue**.
2. Print pick list → take upstairs.
3. **Reconcile**: Used / Returned / Wasted / Kept on floor.
4. Create OT bill → Pay cash → Print (same 80 mm receipt preview as OPD).

## 4. Pharmacy

1. Home → **Pharmacy** → search by code or name.
2. New item: code, category, prices, reorder level, first batch + expiry.
3. **Restock** an existing code (unknown codes must be created first).
4. Home → **Reports** → Low stock / Near expiry.

## 5. Reports

| Report | Who | What |
|--------|-----|------|
| Daily cash | Reception / Admin | Paid OPD + OT totals for a date |
| Low stock | Pharmacy / Admin | In Stock qty ≤ reorder level |
| Near expiry | Pharmacy / Admin | Batches expiring within N days |

Use **Print** on each report for the day book.

## 6. Daily ops

- Morning: confirm green **Server connected**.
- Admin → Settings → **Backup** (also copy backup folder to USB weekly — see [DEPLOY.md](./DEPLOY.md)).
- If Server offline / restore needed: [CRASH_RESTORE_CARD.md](./CRASH_RESTORE_CARD.md) at the server desk.
- Training dry-run: Settings → **Training** → Seed (uses `DEMO-` codes and `[TRAINING]` patients only).
- Press **?** for in-app help.

## Myanmar summary / မြန်မာ အကျဉ်း

1. **ဝင်ရန်** — ဆာဗာ IP → အကောင့်ဝင် → ဘာသာစကား EN/မြန်မာ။
2. **OPD** — လူနာ + ဆရာဝန် → ကုဒ် Enter → ငွေသားပေး → ပရင့် (TM-T82 / 80 mm)။
3. **OT** — ကေ့စ် → ထုတ် → pick list → စစ်ဆေး → ဘေလ်။
4. **ဆေးဆိုင်** — ကုဒ်ရှာ → restock / item အသစ်။
5. **အစီရင်ခံစာ** — နေ့စဉ်ငွေ / စတော့နည်း / သက်တမ်းနီး။
