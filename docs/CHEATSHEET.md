# Mudita Hospital — Staff cheat sheet

Print this page (or use **Help → Print cheat sheet** in the app) and laminate for the OPD, OT, and pharmacy desks.

## 1. Sign in

1. Open Mudita on the clinic PC.
2. First launch: enter **Server IP** (port `8080`), e.g. `192.168.1.10`.
3. Sign in. Each desk opens only its own portal:
   - OPD: `opd`
   - OT: `ot`
   - Pharmacy: `pharmacy`
   - Admin: `admin` — pick OPD, OT, Pharmacy, or Settings, and step back without a second login
4. Idle ~15 minutes → auto lock. Switch language **English / မြန်မာ** in the top bar.
5. History on a desk lists that desk's bills only. Another desk's cash is not on this screen.

## 2. OPD bill (cash)

1. **OPD** → Bill (desk form opens).
2. Patient name → doctor → add a **service** or consultation. Medicines are billed in Pharmacy.
3. **Confirm (F5)** saves a draft. **Print (F7)** saves, marks paid, then opens the print preview.
4. **History (F9)** opens past bills (newest first). **V.Delete (^F8)** voids a selected bill (reason required). **Cancel (F10)** clears the form. **New bill (F2)** clears for the next patient (no prompt after a paid bill).
5. First time printing a receipt: choose **EPSON TM-T82 Receipt**, paper **80 mm**, no scaling / fit to printable width.

## 3. OT cupboard and bill (nurse handover)

1. Pharmacy: **Transfer to OT** → add medicines → **Transfer**, then **Confirm transfer**. Saleable pharmacy stock moves into the OT cupboard. Batch number and expiry are optional and go with the qty. A date before today is left on the pharmacy shelf.
2. OT: **OT cupboard** shows that on-hand. **Return to pharmacy** sends unused qty back. Pharmacy on-hand rises when the return is saved.
3. OT: **Create new bill** → patient, doctor, procedure → services and items from cupboard on-hand → **Pay cash** → **Print**. Pay deducts cupboard qty. Void puts that qty back. Qty left in the cupboard is not touched.
4. Print the pick list if the ward wants a paper list of the cart. There is no issue or reconcile step.

## 4. Pharmacy

1. **Pharmacy billing** → new bill → add medicines by code → **Pay cash** (stock drops) → **Print**. Void restores stock.
2. **Return in** → same desk as sales → add returned medicines by code → **Return & print** (qty goes back into MAIN; day cash nets the refund). Void of a return removes that qty again when the batch still has enough.
3. **Pharmacy stock** → search by code or name. New item: code, category, prices, reorder level, first batch + expiry.
4. **Restock** an existing code (unknown codes must be created first).
5. Low stock and near expiry are **MAIN** pharmacy stock. Send saleable stock from **Transfer to OT**, between Return in and Maintenance.

## 5. Reports

| Report | Who | What |
|--------|-----|------|
| Daily cash | That desk | Paid bills for that portal only |
| Combined daily cash | Admin dashboard | Paid OPD + OT + pharmacy for a date |
| Low stock | Pharmacy / Admin | MAIN qty ≤ reorder level |
| Near expiry | Pharmacy / Admin | MAIN batches expiring within N days |

The admin dashboard is the day book for the whole hospital. A clinic desk does not open another portal's bills.

## 6. Daily ops

- Morning: confirm green **Server connected**.
- Admin → Settings → **Backup** (also copy backup folder to USB weekly — see [DEPLOY.md](./DEPLOY.md)).
- If Server offline / restore needed: [CRASH_RESTORE_CARD.md](./CRASH_RESTORE_CARD.md) at the server desk.
- Training dry-run: Settings → **Training** → Seed (uses `DEMO-` codes and `[TRAINING]` patients only).
- Press **?** for in-app help.

## Myanmar summary / မြန်မာ အကျဉ်း

1. **ဝင်ရန်** — ဆာဗာ IP → အကောင့်ဝင် → ဘာသာစကား EN/မြန်မာ။
2. **OPD** — လူနာ + ဆရာဝန် → ဝန်ဆောင်မှု → Confirm (မူကြမ်း) / Print (ပေးချေ + ပရင့်) (TM-T82 / 80 mm)။ ဆေးသည် ဆေးဆိုင်တွင်။
3. **OT** — ဆေးဆိုင်က Transfer to OT ဖြင့် ဆေးဗီရိုသို့ ပို့ → ဘေလ်ဆွဲ → ငွေသားပေး (လက်ကျန်ကျ) → မသုံးတာ ပြန်ပို့။
4. **ဆေးဆိုင်** — ကုဒ်ရှာ → restock / item အသစ် → OT သို့ လွှဲ။
5. **အစီရင်ခံစာ** — မိမိဘေလ်သာ။ ဆေးရုံတစ်ခုလုံး ငွေစုသည် Admin ဒက်ရှ်ဘုတ်။
