# Mudita Hospital — Staff cheat sheet

Print this page (or use **Help → Print cheat sheet** in the app) and laminate for the OPD, OT, and pharmacy desks.

## 1. Sign in

1. Open Mudita on the clinic PC.
2. First launch: enter **Server IP** (port `8080`), e.g. `192.168.1.10`.
3. Sign in. Each desk opens only its own portal:
   - OPD: `opd`
   - OT: `ot`
   - Pharmacy: `pharmacy`
   - Patients: `patients` — charts and visit history
   - IPD: `ipd` — stays, deposits, and discharge
   - Admin: `admin` — pick a portal or Settings, and step back without a second login
4. Idle ~15 minutes → auto lock. Switch language **English / မြန်မာ** in the top bar.
5. History on a desk lists that desk's bills only. Another desk's cash is not on this screen.

## 2. OPD bill (cash)

1. **OPD** → Bill (desk form opens).
2. Patient name → doctor → add a **service** or consultation. Medicines are billed in Pharmacy.
3. **Confirm (F5)** saves a draft. **Print (F7)** saves, marks paid, then opens the print preview.
4. **History (F9)** opens past bills (newest first). **V.Delete (^F8)** voids a selected bill (reason required). **Cancel (F10)** clears the form. **New bill (F2)** clears for the next patient (no prompt after a paid bill).
5. **Pay & print (F7)** opens the receipt preview; **Print** opens the Windows print dialog for a single receipt. Set the EPSON roll to **80 mm** in Windows printer preferences.

## 3. OT Maintenance and bill (nurse handover)

1. Pharmacy: **Transfer to OT** → add medicines → **Transfer**, then **Confirm transfer**. Saleable pharmacy stock moves into OT inventory. Batch number and expiry are optional and go with the qty. A date before today is left on the pharmacy shelf.
2. OT: **Maintenance → Inventory** shows that on-hand. **Return to pharmacy** sends unused qty back. Pharmacy on-hand rises when the return is saved.
3. OT: **Maintenance → Services** holds OT-only services (name required; code and default price optional).
4. OT: **Create new bill** → patient, doctor, procedure → items from OT inventory and services from OT Maintenance. Service quantity is 1; type the case price. **Pay cash** → **Print**. Pay deducts inventory qty. Void puts that qty back.
5. OT **Print** opens an **A4** payment receipt (plain paper / laser). OPD and Pharmacy still use the **80 mm** thermal roll. Print the pick list if the ward wants a paper list of the cart. There is no issue or reconcile step.

## 4. Pharmacy

1. **Pharmacy billing** → new bill → add medicines by code → **Pay cash** (stock drops) → **Print**. Void restores stock.
2. **Return in** → same desk as sales → add returned medicines by code → **Return & print** (qty goes back into MAIN; day cash nets the refund). Void of a return removes that qty again when the batch still has enough.
3. **Pharmacy stock** → search by code or name. New item: code, category, prices, reorder level, first batch + expiry.
4. **Restock** an existing code (unknown codes must be created first).
5. Low stock and near expiry are **MAIN** pharmacy stock. Send saleable stock from **Transfer to OT**, between Return in and Maintenance.

## Expense bills

Each desk (OPD, OT, IPD, and Pharmacy) has **Expense bill** directly under its main bill, and under **Stays** on IPD. Lines come from **Settings → Expenses**. The price typed on the line is the price that is charged. Discount, draft, pay, print, void, and history match the OPD desk. Each desk lists only its own expense bills.

## 5. Patients, IPD, and Charge to IPD

1. **Patients** — search or create a chart. History lists OPD, pharmacy, OT, and IPD for that chart only. To link an old bill that has no chart, type that bill number and **Attach bill**. One bill. The total does not change. A transfer slip (`TO-`) cannot be attached.
2. **IPD** — admit one open stay. **Take deposit** and **Post ward charge**. **Charge to IPD** is on the OPD, OT, or pharmacy sale desk, beside **Mark Paid**, and only when that chart has an open stay. **Mark Paid** stays cash. A charged bill is not desk cash.
3. **Discharge** — a positive balance refunds the remainder, a negative balance collects what is owed, and zero writes no cash line. The stay is then settled and the balance is 0. Print the statement. Later deposits and charges are refused.
4. **IPD daily cash** on the IPD portal counts deposits, collections, and refunds. The admin dashboard shows that net as one IPD total. Desk daily cash is still paid cash bills only.

## 6. Reports

| Report | Who | What |
|--------|-----|------|
| Daily cash | That desk | Paid cash bills for that portal only. Charged-to-IPD bills are excluded |
| IPD daily cash | IPD | Deposits, collections, and refunds |
| Combined daily cash | Admin dashboard | Paid OPD + OT + pharmacy cash, plus one IPD cash total |
| Low stock | Pharmacy / Admin | MAIN qty ≤ reorder level |
| Near expiry | Pharmacy / Admin | MAIN batches expiring within N days |

The admin dashboard is the day book for the whole hospital. A clinic desk does not open another portal's bills.

## 7. Daily ops

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
4b. **အသုံးစရိတ် ဘေလ်** — OPD, OT, IPD, ဆေးဆိုင် ဘေလ်အောက်တွင်။ စာကြောင်းများသည် Settings → Expenses မှ။ ရိုက်ထည့်သော ဈေးကို ကောက်ခံသည်။
5. **လူနာ / IPD** — ဇယားနှင့် ရာဇဝင်။ ဘေလ်ကို IPD သို့ တင်လျှင် ကောင်တာငွေ မဟုတ်။ ဆင်းခွင့်တွင် ပြန်အမ်း သို့မဟုတ် ကောက်ခံ။ ဘေလ်နံပါတ်ဖြင့် ဇယားတွဲလျှင် စုစုပေါင်း မပြောင်း။
6. **အစီရင်ခံစာ** — ကောင်တာငွေသည် မိမိပေးပြီးဘေလ်။ IPD ငွေသည် အပ်ငွေ၊ ကောက်ခံ၊ ပြန်အမ်း။ Admin ဒက်ရှ်ဘုတ်တွင် IPD စုတစ်ခု။
