# Mudita Hospital — Staff cheat sheet

Print this page and laminate it for the OPD, OT, pharmacy, patients, and IPD desks.

## 1. Sign in

1. Open Mudita on the clinic PC.
2. First launch: enter **Server IP** (port `8080`), e.g. `192.168.1.10`.
3. **Sign in** (ဝင်ရန်). A desk login opens only its own module. Switch language **English** / **မြန်မာ** in the top bar.
   - OPD → **OPD Bill** (OPD ဘေလ်)
   - OT → **OT Bill** (OT ဘေလ်)
   - Pharmacy → **Pharmacy Bill** (ဆေးဆိုင် ဘေလ်)
   - Patients → **Patient Charts** (လူနာမှတ်တမ်း)
   - IPD → **Stays** (တက်ရောက်မှု)
   - Admin → Home, then any module. Settings and training seed are Admin-only.
4. Idle ~15 minutes → auto lock.
5. **History** (မှတ်တမ်း, F9) lists that desk's bills only. Another desk's cash is not on this screen.

## 2. Sale rail

**OPD Bill**, **OT Bill**, **Pharmacy Bill** (sale), and **Expense bill** share this rail.

| Key | On screen | What it does |
|-----|-----------|----------------|
| F5 | **Save draft** · မူကြမ်းသိမ်း | Bill stays editable. No cash. No stock. |
| F6 | **Print** · ပရင့် | Saves if needed and opens the receipt. Status **Printed — Not Paid** · ပရင့်ပြီး — မပေးရသေး. Still editable. No cash. No stock. |
| F7 | **Mark Paid** · ပေးပြီးမှတ် | Desk cash. Subtitle **Final · locks bill** · နောက်ဆုံး · ဘေလ်ပိတ်မည်. Editing stops. Pharmacy sale deducts MAIN stock. OT Bill deducts inventory quantity. Expense does not move stock. |
| none | **Charge to IPD** · IPD သို့ တင် | Not a function key. F7 does not do this. Subtitle **Not desk cash** · ကောင်တာငွေ မဟုတ်. Shown only when the chosen chart has an open stay. A typed name never shows it. Not on Expense bill or Transfer to OT. |
| ^F8 | **Void Bills** · ဘေလ်ပယ်ဖျက် | Ctrl+F8 or Cmd+F8. Reason required (**Required to void** · ပယ်ဖျက်ရန် လိုအပ်သည်). The dialog confirm button is **Delete** · ဖျက်ရန်. |
| F9 | **History** · မှတ်တမ်း | This desk's bills. |
| F10 | **Cancel** · မလုပ်တော့ | Clears the form. |
| F2 | **New bill** · ဘေလ်အသစ် | Next bill. |

A printed bill can still be edited until **Mark Paid** or **Charge to IPD**. After **Mark Paid** the button shows **Paid** · ပေးပြီး. A bill charged to a stay shows **Charged to IPD** · IPD သို့ တင်ပြီး.

OPD, pharmacy, and expense receipts use the **80 mm** roll. OT Bill **Print** uses **A4**.

## 3. OPD Bill

Patient, doctor, then a service or consultation. Medicines are billed on **Pharmacy Bill**. Use the sale rail. **Charge to IPD** appears only for a chart with an open stay, and it still is not desk cash.

## 4. OT

1. Pharmacy: **Transfer to OT** (OT သို့ လွှဲ). No cash. F6 does nothing and **Print** is not on this rail. First F7 is **Transfer** (လွှဲမည်). Second F7 is **Confirm transfer** (လွှဲခြင်း အတည်ပြု) and moves saleable MAIN stock into OT inventory. Batch number and expiry are optional. The slip number starts with `TO-`.
2. OT sidebar **Maintenance** (ထိန်းသိမ်းရေး) opens **Inventory** (စာရင်း). Quantity appears after **Confirm transfer**. **Return to pharmacy** (ဆေးဆိုင်သို့ ပြန်ပို့ရန်) sends unused quantity back. That is not **Return in** and not **Void Bills**. The **Services** (ဝန်ဆောင်မှုများ) tab on the same page holds OT-only services.
3. **OT Bill** uses the sale rail. **Mark Paid** takes desk cash and deducts inventory quantity. Void of a paid OT bill puts that quantity back. **Charge to IPD** is on the bill when the chart has an open stay, not on **Inventory**.

## 5. Pharmacy

1. **Pharmacy Bill** (sale): sale rail. **Mark Paid** takes desk cash and deducts MAIN stock, earliest expiry first. **Charge to IPD** only for a linked chart with an open stay. Void of a paid sale puts MAIN quantity back.
2. **Return in** (ပြန်သွင်း). This is not the OT inventory return. F5 **Save draft**. F6 **Print** (the slip stays editable). F7 **Mark returned** (ပြန်သွင်းမှတ်), subtitle **Credits stock · refunds cash** · စတော့ပြန်ထည့် · ငွေပြန်အမ်း, then the slip locks. F2 is **New return** (ပြန်သွင်းအသစ်). If that chart has an open stay and at least one charged pharmacy sale, the rail can show **Credit to IPD** (IPD သို့ ပြန်ထည့်). No function key. It is not **Charge to IPD** and not desk cash. Void of a paid return takes that quantity off MAIN again.
3. **Transfer to OT**: see section 4. F2 is **New transfer** (လွှဲစာရင်း အသစ်). Void of a confirmed transfer reverses the move.
4. Pharmacy **Maintenance** (ထိန်းသိမ်းရေး): item section **Packing Size** (ထုပ်ပိုးအရွယ်), first field **Smallest Unit** (အသေးဆုံးယူနစ်). Stock on hand is MAIN. Create an unknown code before restock. Low stock and near expiry are MAIN only. This screen does not save on F5. F5 reloads the window.

## 6. Expense bills

Each desk has **Expense bill** (အသုံးစရိတ် ဘေလ်): OPD, OT, pharmacy, and the IPD portal (next to **Stays**). Same F5 **Save draft**, F6 **Print** (still editable), F7 **Mark Paid** (desk cash, bill locked). No **Charge to IPD**. No stock. Each desk lists only its own expense bills.

## 7. Patients and IPD

1. **Patient Charts** (လူနာမှတ်တမ်း). A chart is the patient record. A name typed on a bill is not a chart. Typing a name clears the link, so **Charge to IPD** disappears. **Create New Patient** (လူနာအသစ် ဖန်တီးရန်) is shown only when that account may create charts.
2. On the chart, **Attach bill** (ဘေလ် တွဲရန်) links one bill number that has no chart yet. Totals, status, stock, and cash stay the same. A `TO-` transfer slip cannot be attached.
3. **Stays** (တက်ရောက်မှု). No function keys on this page. F5 reloads the window. **Admit** (တက်ခွင့်) opens one stay per chart. Then **Take deposit** (အပ်ငွေ လက်ခံ), **Post ward charge** (ဝပ်ကြေး တင်), and **Save notes** (မှတ်ချက်သိမ်း). A ward charge is room or nursing, not a drug and not an OPD service. **Charge to IPD** is not on this page. It is on OPD Bill, OT Bill, and Pharmacy Bill.
4. **Discharge** (ဆင်းခွင့်ရှင်း) is final. Positive balance: **Refund the remainder** (လက်ကျန်ကို ပြန်အမ်း). Negative balance: **Collect the amount owed** (ပေးရန်ကျန်ကို ကောက်). Zero: **No cash. Balance is zero** (ငွေမထိ။ လက်ကျန် သုည). After discharge, deposits, ward charges, and desk charges are refused.
5. **IPD daily cash** (IPD နေ့စဉ်ငွေ) counts deposits, collections, and refunds. The admin dashboard shows that net as one IPD total.

## 8. Reports

| Report | Who | What |
|--------|-----|------|
| Daily cash | That desk | Paid cash bills for that portal only. Charged-to-IPD bills are excluded |
| IPD daily cash | IPD | Deposits, collections, and refunds |
| Combined daily cash | Admin dashboard | Paid OPD + OT + pharmacy cash, plus one IPD cash total |
| Low stock | Pharmacy / Admin | MAIN qty at or below the reorder level |
| Near expiry | Pharmacy / Admin | MAIN batches expiring within N days |

The admin dashboard is the day book for the whole hospital. A clinic desk does not open another portal's bills.

## 9. Daily ops

- Morning: confirm green **Server connected** (ဆာဗာ ချိတ်ဆက်ပြီး).
- Admin → Settings → **Backup** (အရန်သိမ်း). Also copy the backup folder to USB weekly — see [DEPLOY.md](./DEPLOY.md).
- If the server is offline or a restore is needed: [CRASH_RESTORE_CARD.md](./CRASH_RESTORE_CARD.md) at the server desk.
- Training seed is Admin-only. It is not a desk step. It does not create a patient chart or an IPD stay.

## Myanmar summary / မြန်မာ အကျဉ်း

1. **ဝင်ရန်** — ဆာဗာ IP → **ဝင်ရန်**။ ဘာသာ **English** / **မြန်မာ**။ မိမိကောင်တာသာ ပွင့်သည်။ ခဏနားလျှင် သော့ကျသည်။ **မှတ်တမ်း** သည် မိမိဘေလ်သာ။
2. **ရောင်းဘေလ်** (OPD ဘေလ်၊ OT ဘေလ်၊ ဆေးဆိုင် ဘေလ်၊ အသုံးစရိတ် ဘေလ်) — F5 **မူကြမ်းသိမ်း** (ပြင်နိုင်၊ ငွေမကောက်၊ စတော့မလှုပ်)။ F6 **ပရင့်** (**ပရင့်ပြီး — မပေးရသေး**၊ ပြင်နိုင်သေး၊ ငွေမကောက်)။ F7 **ပေးပြီးမှတ်** (ကောင်တာငွေ၊ **နောက်ဆုံး · ဘေလ်ပိတ်မည်**)။ **IPD သို့ တင်** သည် ဖွင့်ထားသော တက်ရောက်မှုရှိမှ။ စာတန်း **ကောင်တာငွေ မဟုတ်**။ ဖန်ရှင်ခလုတ်မရှိ။ အမည်ရိုက်ရုံဖြင့် မပေါ်။ ^F8 **ဘေလ်ပယ်ဖျက်** (**ပယ်ဖျက်ရန် လိုအပ်သည်**)။ အတည်ပြုခလုတ်သည် **ဖျက်ရန်**။ F9 **မှတ်တမ်း**။ F10 **မလုပ်တော့**။ F2 **ဘေလ်အသစ်**။
3. **OPD ဘေလ်** — ဝန်ဆောင်မှု။ ဆေးသည် **ဆေးဆိုင် ဘေလ်** တွင်။ ပြေစာ 80 mm။
4. **OT** — **OT သို့ လွှဲ**။ F6 မလုပ်။ ပထမ F7 **လွှဲမည်**၊ ဒုတိယ F7 **လွှဲခြင်း အတည်ပြု**။ ငွေမကောက်။ **ထိန်းသိမ်းရေး** → **စာရင်း**။ မသုံးသော အရေအတွက် **ဆေးဆိုင်သို့ ပြန်ပို့ရန်**။ ၎င်းသည် **ပြန်သွင်း** မဟုတ်၊ **ဘေလ်ပယ်ဖျက်** မဟုတ်။ OT ဘေလ် **ပေးပြီးမှတ်** လျှင် စာရင်းလျော့။ ပရင့်သည် A4။
5. **ဆေးဆိုင်** — **ပေးပြီးမှတ်** လျှင် MAIN လျော့။ **ပြန်သွင်း** တွင် F7 **ပြန်သွင်းမှတ်** (**စတော့ပြန်ထည့် · ငွေပြန်အမ်း**)။ **IPD သို့ ပြန်ထည့်** သည် **IPD သို့ တင်** မဟုတ်၊ ကောင်တာငွေ မဟုတ်။ ဆေးပစ္စည်း **ထိန်းသိမ်းရေး** တွင် F5 သည် **မူကြမ်းသိမ်း** မဟုတ် — ဝင်းဒိုးပြန်ဖွင့်သည်။ မသိသော ကုဒ်ကို အရင်ဖန်တီးပါ။ လက်ကျန်နည်းနှင့် သက်တမ်းနီးသည် MAIN သာ။
6. **အသုံးစရိတ် ဘေလ်** — F5 **မူကြမ်းသိမ်း**၊ F6 **ပရင့်**၊ F7 **ပေးပြီးမှတ်**။ **IPD သို့ တင်** မရှိ။ စတော့မလှုပ်။
7. **လူနာမှတ်တမ်း** — ရိုက်ထားသော အမည်သည် မှတ်တမ်းမဟုတ်။ **ဘေလ် တွဲရန်** တစ်စောင်။ စုစုပေါင်း၊ အခြေအနေ၊ စတော့၊ ငွေ မပြောင်း။ `TO-` တွဲမရ။
8. **တက်ရောက်မှု** — F5 မနှိပ်ပါ (ဝင်းဒိုးပြန်ဖွင့်သည်)။ **တက်ခွင့်** တစ်ခု။ **အပ်ငွေ လက်ခံ**၊ **ဝပ်ကြေး တင်**၊ **မှတ်ချက်သိမ်း**။ **IPD သို့ တင်** သည် ဤစာမျက်နှာတွင် မဟုတ်။ **ဆင်းခွင့်ရှင်း** ပြီးလျှင် **လက်ကျန်ကို ပြန်အမ်း** / **ပေးရန်ကျန်ကို ကောက်** / **ငွေမထိ။ လက်ကျန် သုည**။ နောက်မှ အပ်ငွေနှင့် ကြေးတင်ခြင်း ငြင်းသည်။
9. **အစီရင်ခံစာ** — ကောင်တာနေ့စဉ်ငွေသည် **ပေးပြီး** ငွေသားဘေလ်။ **IPD သို့ တင်ပြီး** မပါ။ **IPD နေ့စဉ်ငွေ** သည် အပ်ငွေ၊ ကောက်ခံ၊ ပြန်အမ်း။
10. **နေ့စဉ်** — မနက် **ဆာဗာ ချိတ်ဆက်ပြီး**။ Admin **အရန်သိမ်း**။ လေ့ကျင့်ဒေတာသည် ကောင်တာအဆင့် မဟုတ်။ **လူနာမှတ်တမ်း** နှင့် **တက်ရောက်မှု** မဖန်တီးပါ။
