/** One-page staff cheat sheet (EN + MY). Printable HTML for laminate.
 * Words match docs/CHEATSHEET.md. Both languages stay on this page.
 */

import { openPrintPreview } from "@/shared/print";

export function cheatSheetHTML(): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Mudita Hospital — Staff cheat sheet</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: "Noto Sans Myanmar", "Segoe UI", sans-serif; font-size: 11px; color: #111; margin: 0; line-height: 1.35; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  h2 { font-size: 12px; margin: 10px 0 4px; border-bottom: 1px solid #333; padding-bottom: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
  ul { margin: 0; padding-left: 16px; }
  li { margin: 1px 0; }
  .kbd { font-family: Consolas, monospace; background: #eee; padding: 0 3px; border: 1px solid #ccc; border-radius: 2px; }
  .my { color: #333; }
  .footer { margin-top: 10px; font-size: 10px; color: #555; }
  @media print { .noprint { display: none; } }
</style></head><body>
<h1>Mudita Hospital — Staff cheat sheet</h1>
<p>Print this page and laminate it for the OPD, OT, pharmacy, patients, and IPD desks.</p>

<div class="grid">
  <section>
    <h2>1. Sign in / ဝင်ရန်</h2>
    <ul>
      <li>Open Mudita on the clinic PC.</li>
      <li>First launch: enter <strong>Server IP</strong> (port <span class="kbd">8080</span>), e.g. <span class="kbd">192.168.1.10</span>.</li>
      <li><strong>Sign in</strong> (ဝင်ရန်). A desk login opens only its own module. Switch language <strong>English</strong> / <strong>မြန်မာ</strong> in the top bar.</li>
      <li>OPD → <strong>OPD Bill</strong> (OPD ဘေလ်). OT → <strong>OT Bill</strong> (OT ဘေလ်). Pharmacy → <strong>Pharmacy Bill</strong> (ဆေးဆိုင် ဘေလ်).</li>
      <li>Patients → <strong>Patient Charts</strong> (လူနာမှတ်တမ်း). IPD → <strong>Stays</strong> (တက်ရောက်မှု) and <strong>IPD Bill</strong> (IPD ဘေလ်).</li>
      <li>Admin → Home, then any module. Settings and training seed are Admin-only.</li>
      <li>Idle ~15 minutes → auto lock.</li>
      <li><strong>History</strong> (မှတ်တမ်း, <span class="kbd">F9</span>) lists that desk's bills only. Another desk's cash is not on this screen.</li>
    </ul>
  </section>
  <section>
    <h2>2. Sale rail / ရောင်းဘေလ်</h2>
    <ul>
      <li><strong>OPD Bill</strong>, <strong>OT Bill</strong>, <strong>Pharmacy Bill</strong> (sale), and <strong>Expense bill</strong> share this rail.</li>
      <li><span class="kbd">F5</span> <strong>Save draft</strong> · မူကြမ်းသိမ်း — Bill stays editable. No cash. No stock.</li>
      <li><span class="kbd">F6</span> <strong>Print</strong> · ပရင့် — Saves if needed and opens the receipt. Status <strong>Printed — Not Paid</strong> · ပရင့်ပြီး — မပေးရသေး. Still editable. No cash. No stock.</li>
      <li><span class="kbd">F7</span> <strong>Mark Paid</strong> · ပေးပြီးမှတ် — Desk cash. Subtitle <strong>Final · locks bill</strong> · နောက်ဆုံး · ဘေလ်ပိတ်မည်. Editing stops. Pharmacy sale deducts MAIN stock. OT Bill deducts inventory quantity. Expense does not move stock.</li>
      <li><strong>Charge to IPD</strong> · IPD သို့ တင် — Not a function key. F7 does not charge the stay. Subtitle <strong>Not desk cash</strong> · ကောင်တာငွေ မဟုတ်. On a sale, shown only when the chosen chart has an open stay. On <strong>IPD Bill</strong> it is the first button, and that page has no <strong>Mark Paid</strong>. A typed name never shows it. Not on Expense bill or Transfer to OT.</li>
      <li><span class="kbd">^F8</span> <strong>Void Bills</strong> · ဘေလ်ပယ်ဖျက် — Ctrl+F8 or Cmd+F8. Reason required (<strong>Required to void</strong> · ပယ်ဖျက်ရန် လိုအပ်သည်). The dialog confirm button is <strong>Delete</strong> · ဖျက်ရန်.</li>
      <li><span class="kbd">F9</span> <strong>History</strong> · မှတ်တမ်း — This desk's bills.</li>
      <li><span class="kbd">F10</span> <strong>Cancel</strong> · မလုပ်တော့ — Clears the form.</li>
      <li><span class="kbd">F2</span> <strong>New bill</strong> · ဘေလ်အသစ် — Next bill.</li>
      <li>A printed bill can still be edited until <strong>Mark Paid</strong> or <strong>Charge to IPD</strong>. After <strong>Mark Paid</strong> the button shows <strong>Paid</strong> · ပေးပြီး. A bill charged to a stay shows <strong>Charged to IPD</strong> · IPD သို့ တင်ပြီး.</li>
      <li>OPD, pharmacy, and expense receipts use the <strong>80 mm</strong> roll. OT Bill <strong>Print</strong> uses <strong>A4</strong>.</li>
    </ul>
  </section>
  <section>
    <h2>3. OPD Bill / OPD ဘေလ်</h2>
    <ul>
      <li>Patient, doctor, then a service or consultation. Medicines are billed on <strong>Pharmacy Bill</strong>.</li>
      <li>Use the sale rail. <strong>Charge to IPD</strong> appears only for a chart with an open stay, and it still is not desk cash.</li>
    </ul>
  </section>
  <section>
    <h2>4. OT / OT</h2>
    <ul>
      <li>Pharmacy: <strong>Transfer to OT</strong> (OT သို့ လွှဲ). No cash. F6 does nothing and <strong>Print</strong> is not on this rail. First F7 is <strong>Transfer</strong> (လွှဲမည်). Second F7 is <strong>Confirm transfer</strong> (လွှဲခြင်း အတည်ပြု) and moves saleable MAIN stock into OT inventory. Batch number and expiry are optional. The slip number starts with <span class="kbd">TO-</span>.</li>
      <li>OT sidebar <strong>Maintenance</strong> (ထိန်းသိမ်းရေး) opens <strong>Inventory</strong> (စာရင်း). Quantity appears after <strong>Confirm transfer</strong>. <strong>Return to pharmacy</strong> (ဆေးဆိုင်သို့ ပြန်ပို့ရန်) sends unused quantity back. That is not <strong>Return in</strong> and not <strong>Void Bills</strong>. The <strong>Services</strong> (ဝန်ဆောင်မှုများ) tab on the same page holds OT-only services.</li>
      <li><strong>OT Bill</strong> uses the sale rail. <strong>Mark Paid</strong> takes desk cash and deducts inventory quantity. Void of a paid OT bill puts that quantity back. <strong>Charge to IPD</strong> is on the bill when the chart has an open stay, not on <strong>Inventory</strong>.</li>
    </ul>
  </section>
  <section>
    <h2>5. Pharmacy / ဆေးဆိုင်</h2>
    <ul>
      <li><strong>Pharmacy Bill</strong> (sale): sale rail. <strong>Mark Paid</strong> takes desk cash and deducts MAIN stock, earliest expiry first. <strong>Charge to IPD</strong> only for a linked chart with an open stay. Void of a paid sale puts MAIN quantity back.</li>
      <li><strong>Return in</strong> (ပြန်သွင်း). This is not the OT inventory return. F5 <strong>Save draft</strong>. F6 <strong>Print</strong> (the slip stays editable). F7 <strong>Mark returned</strong> (ပြန်သွင်းမှတ်), subtitle <strong>Credits stock · refunds cash</strong> · စတော့ပြန်ထည့် · ငွေပြန်အမ်း, then the slip locks. F2 is <strong>New return</strong> (ပြန်သွင်းအသစ်).</li>
      <li>If that chart has an open stay and at least one charged pharmacy sale, the rail can show <strong>Credit to IPD</strong> (IPD သို့ ပြန်ထည့်). No function key. It is not <strong>Charge to IPD</strong> and not desk cash. Void of a paid return takes that quantity off MAIN again.</li>
      <li><strong>Transfer to OT</strong>: see section 4. F2 is <strong>New transfer</strong> (လွှဲစာရင်း အသစ်). Void of a confirmed transfer reverses the move.</li>
      <li>Pharmacy <strong>Maintenance</strong> (ထိန်းသိမ်းရေး): item section <strong>Packing Size</strong> (ထုပ်ပိုးအရွယ်), first field <strong>Smallest Unit</strong> (အသေးဆုံးယူနစ်). Stock on hand is MAIN. Create an unknown code before restock. Low stock and near expiry are MAIN only. This screen does not save on F5. F5 reloads the window.</li>
    </ul>
  </section>
  <section>
    <h2>6. Expense bills / အသုံးစရိတ် ဘေလ်</h2>
    <ul>
      <li>Each desk has <strong>Expense bill</strong> (အသုံးစရိတ် ဘေလ်): OPD, OT, pharmacy, and the IPD portal (next to <strong>Stays</strong> and <strong>IPD Bill</strong>).</li>
      <li>Same F5 <strong>Save draft</strong>, F6 <strong>Print</strong> (still editable), F7 <strong>Mark Paid</strong> (desk cash, bill locked). No <strong>Charge to IPD</strong>. No stock. Each desk lists only its own expense bills. Expense bill is money out. It is not <strong>IPD Bill</strong>.</li>
    </ul>
  </section>
  <section>
    <h2>7. Patients and IPD / လူနာမှတ်တမ်း · တက်ရောက်မှု</h2>
    <ul>
      <li><strong>Patient Charts</strong> (လူနာမှတ်တမ်း). A chart is the patient record. A name typed on a bill is not a chart. Typing a name clears the link, so <strong>Charge to IPD</strong> disappears. <strong>Create New Patient</strong> (လူနာအသစ် ဖန်တီးရန်) is shown only when that account may create charts.</li>
      <li>On the chart, <strong>Attach bill</strong> (ဘေလ် တွဲရန်) links one bill number that has no chart yet. Totals, status, stock, and cash stay the same. A <span class="kbd">TO-</span> transfer slip cannot be attached.</li>
      <li><strong>Stays</strong> (တက်ရောက်မှု). No function keys on this page. F5 reloads the window. <strong>Admit</strong> (တက်ခွင့်) opens one stay per chart. Then <strong>Take deposit</strong> (အပ်ငွေ လက်ခံ) and <strong>Save notes</strong> (မှတ်ချက်သိမ်း). Room and nursing are not posted here. Each open stay shows <strong>Yesterday</strong> (မနေ့) as Still open, Awaiting, Paid, or Carried.</li>
      <li><strong>IPD Bill</strong> (IPD ဘေလ်). Free-text lines. F5 <strong>Save draft</strong>. F6 <strong>Print</strong> (A4, still editable). No F7 and no <strong>Mark Paid</strong>. The first button is <strong>Charge to IPD</strong>, subtitle <strong>Not desk cash</strong>. F7 does not charge the stay. Hidden until the chart has an open stay. A name that is not a chart shows <strong>Admit this patient first</strong> (ဤလူနာကို အရင် တက်ခွင့်ပေးပါ။).</li>
      <li><strong>Print Daily Statement</strong> (နေ့စဉ်စာရင်းထုတ်) opens yesterday when the stay already has an earlier line. <strong>Pay this day</strong> (ဤနေ့ ပေးမည်) collects လိုငွေ after a confirm. <strong>Pay later</strong> (နောက်မှ ပေးမည်) shows only while Awaiting and the family owes. <strong>Mark unpaid</strong> (ပေးထားမှု ပြန်ဖြုတ်) shows only on Paid, before the next day’s sheet. Printing does not choose. Pay stays off for today.</li>
      <li><strong>Discharge</strong> (ဆင်းခွင့်ရှင်း) is final. The dialog says <strong>The final statement settles the whole stay</strong> (နောက်ဆုံးစာရင်းသည် တက်ရောက်မှုတစ်ခုလုံးကို ရှင်းသည်။). If yesterday is Awaiting, it also says <strong>Discharge will collect or refund the balance</strong> (ဆင်းခွင့်ရှင်းလျှင် လက်ကျန်ကို ကောက်မည် သို့မဟုတ် ပြန်အမ်းမည်။). Positive balance: <strong>Refund the remainder</strong> (လက်ကျန်ကို ပြန်အမ်း). Negative balance: <strong>Collect the amount owed</strong> (ပေးရန်ကျန်ကို ကောက်). Zero: <strong>No cash. Balance is zero</strong> (ငွေမထိ။ လက်ကျန် သုည). After discharge, deposits and further charges are refused.</li>
      <li><strong>IPD daily cash</strong> (IPD နေ့စဉ်ငွေ) counts deposits, collections, and refunds. An unpaid day is not income.</li>
    </ul>
  </section>
  <section>
    <h2>8. Reports / အစီရင်ခံစာ</h2>
    <ul>
      <li><strong>Daily cash</strong> — That desk. Paid cash bills for that portal only. Charged-to-IPD bills are excluded.</li>
      <li><strong>IPD daily cash</strong> — IPD. Deposits, collections, and refunds.</li>
      <li><strong>Combined daily cash</strong> — Admin dashboard. Paid OPD + OT + pharmacy cash, plus one IPD cash total.</li>
      <li><strong>Low stock</strong> — Pharmacy / Admin. MAIN qty at or below the reorder level.</li>
      <li><strong>Near expiry</strong> — Pharmacy / Admin. MAIN batches expiring within N days.</li>
      <li>The admin dashboard is the day book for the whole hospital. A clinic desk does not open another portal's bills.</li>
    </ul>
  </section>
  <section>
    <h2>9. Daily ops / နေ့စဉ်</h2>
    <ul>
      <li>Morning: confirm green <strong>Server connected</strong> (ဆာဗာ ချိတ်ဆက်ပြီး).</li>
      <li>Admin → Settings → <strong>Backup</strong> (အရန်သိမ်း). Also copy the backup folder to USB weekly — see DEPLOY.md.</li>
      <li>If the server is offline or a restore is needed: CRASH_RESTORE_CARD.md at the server desk.</li>
      <li>Training seed is Admin-only. It is not a desk step. It does not create a patient chart or an IPD stay.</li>
    </ul>
  </section>
</div>

<section>
  <h2>Myanmar summary / မြန်မာ အကျဉ်း</h2>
  <ul class="my">
    <li><strong>ဝင်ရန်</strong> — ဆာဗာ IP → <strong>ဝင်ရန်</strong>။ ဘာသာ <strong>English</strong> / <strong>မြန်မာ</strong>။ မိမိကောင်တာသာ ပွင့်သည်။ ခဏနားလျှင် သော့ကျသည်။ <strong>မှတ်တမ်း</strong> သည် မိမိဘေလ်သာ။</li>
    <li><strong>ရောင်းဘေလ်</strong> (OPD ဘေလ်၊ OT ဘေလ်၊ ဆေးဆိုင် ဘေလ်၊ အသုံးစရိတ် ဘေလ်) — F5 <strong>မူကြမ်းသိမ်း</strong> (ပြင်နိုင်၊ ငွေမကောက်၊ စတော့မလှုပ်)။ F6 <strong>ပရင့်</strong> (<strong>ပရင့်ပြီး — မပေးရသေး</strong>၊ ပြင်နိုင်သေး၊ ငွေမကောက်)။ F7 <strong>ပေးပြီးမှတ်</strong> (ကောင်တာငွေ၊ <strong>နောက်ဆုံး · ဘေလ်ပိတ်မည်</strong>)။ <strong>IPD သို့ တင်</strong> သည် ဖွင့်ထားသော တက်ရောက်မှုရှိမှ။ စာတန်း <strong>ကောင်တာငွေ မဟုတ်</strong>။ ဖန်ရှင်ခလုတ်မရှိ။ F7 သည် တက်ရောက်မှုသို့ မတင်ပါ။ <strong>IPD ဘေလ်</strong> တွင် ပထမခလုတ်ဖြစ်ပြီး <strong>ပေးပြီးမှတ်</strong> မရှိ။ အမည်ရိုက်ရုံဖြင့် မပေါ်။ ^F8 <strong>ဘေလ်ပယ်ဖျက်</strong> (<strong>ပယ်ဖျက်ရန် လိုအပ်သည်</strong>)။ အတည်ပြုခလုတ်သည် <strong>ဖျက်ရန်</strong>။ F9 <strong>မှတ်တမ်း</strong>။ F10 <strong>မလုပ်တော့</strong>။ F2 <strong>ဘေလ်အသစ်</strong>။</li>
    <li><strong>OPD ဘေလ်</strong> — ဝန်ဆောင်မှု။ ဆေးသည် <strong>ဆေးဆိုင် ဘေလ်</strong> တွင်။ ပြေစာ 80 mm။</li>
    <li><strong>OT</strong> — <strong>OT သို့ လွှဲ</strong>။ F6 မလုပ်။ ပထမ F7 <strong>လွှဲမည်</strong>၊ ဒုတိယ F7 <strong>လွှဲခြင်း အတည်ပြု</strong>။ ငွေမကောက်။ <strong>ထိန်းသိမ်းရေး</strong> → <strong>စာရင်း</strong>။ မသုံးသော အရေအတွက် <strong>ဆေးဆိုင်သို့ ပြန်ပို့ရန်</strong>။ ၎င်းသည် <strong>ပြန်သွင်း</strong> မဟုတ်၊ <strong>ဘေလ်ပယ်ဖျက်</strong> မဟုတ်။ OT ဘေလ် <strong>ပေးပြီးမှတ်</strong> လျှင် စာရင်းလျော့။ ပရင့်သည် A4။</li>
    <li><strong>ဆေးဆိုင်</strong> — <strong>ပေးပြီးမှတ်</strong> လျှင် MAIN လျော့။ <strong>ပြန်သွင်း</strong> တွင် F7 <strong>ပြန်သွင်းမှတ်</strong> (<strong>စတော့ပြန်ထည့် · ငွေပြန်အမ်း</strong>)။ <strong>IPD သို့ ပြန်ထည့်</strong> သည် <strong>IPD သို့ တင်</strong> မဟုတ်၊ ကောင်တာငွေ မဟုတ်။ ဆေးပစ္စည်း <strong>ထိန်းသိမ်းရေး</strong> တွင် F5 သည် <strong>မူကြမ်းသိမ်း</strong> မဟုတ် — ဝင်းဒိုးပြန်ဖွင့်သည်။ မသိသော ကုဒ်ကို အရင်ဖန်တီးပါ။ လက်ကျန်နည်းနှင့် သက်တမ်းနီးသည် MAIN သာ။</li>
    <li><strong>အသုံးစရိတ် ဘေလ်</strong> — F5 <strong>မူကြမ်းသိမ်း</strong>၊ F6 <strong>ပရင့်</strong>၊ F7 <strong>ပေးပြီးမှတ်</strong>။ <strong>IPD သို့ တင်</strong> မရှိ။ စတော့မလှုပ်။ <strong>IPD ဘေလ်</strong> မဟုတ်။</li>
    <li><strong>လူနာမှတ်တမ်း</strong> — ရိုက်ထားသော အမည်သည် မှတ်တမ်းမဟုတ်။ <strong>ဘေလ် တွဲရန်</strong> တစ်စောင်။ စုစုပေါင်း၊ အခြေအနေ၊ စတော့၊ ငွေ မပြောင်း။ <span class="kbd">TO-</span> တွဲမရ။</li>
    <li><strong>တက်ရောက်မှု</strong> — F5 မနှိပ်ပါ (ဝင်းဒိုးပြန်ဖွင့်သည်)။ <strong>တက်ခွင့်</strong> တစ်ခု။ <strong>အပ်ငွေ လက်ခံ</strong>၊ <strong>မှတ်ချက်သိမ်း</strong>။ အခန်းကြေးသည် <strong>IPD ဘေလ်</strong> တွင်။ F7 မရှိ။ <strong>ဤနေ့ ပေးမည်</strong> / <strong>နောက်မှ ပေးမည်</strong> / <strong>ပေးထားမှု ပြန်ဖြုတ်</strong> သည် နေ့စဉ်စာရင်းတွင်။ <strong>ဆင်းခွင့်ရှင်း</strong> သည် တက်ရောက်မှုတစ်ခုလုံးကို ရှင်းသည်။ မနေ့က ဆုံးဖြတ်ရန် ကျန်လျှင် လက်ကျန်ကို ကောက်မည် သို့မဟုတ် ပြန်အမ်းမည်။ ပြီးလျှင် <strong>လက်ကျန်ကို ပြန်အမ်း</strong> / <strong>ပေးရန်ကျန်ကို ကောက်</strong> / <strong>ငွေမထိ။ လက်ကျန် သုည</strong>။ နောက်မှ အပ်ငွေနှင့် ကြေးတင်ခြင်း ငြင်းသည်။</li>
    <li><strong>အစီရင်ခံစာ</strong> — ကောင်တာနေ့စဉ်ငွေသည် <strong>ပေးပြီး</strong> ငွေသားဘေလ်။ <strong>IPD သို့ တင်ပြီး</strong> မပါ။ <strong>IPD နေ့စဉ်ငွေ</strong> သည် အပ်ငွေ၊ ကောက်ခံ၊ ပြန်အမ်း။</li>
    <li><strong>နေ့စဉ်</strong> — မနက် <strong>ဆာဗာ ချိတ်ဆက်ပြီး</strong>။ Admin <strong>အရန်သိမ်း</strong>။ လေ့ကျင့်ဒေတာသည် ကောင်တာအဆင့် မဟုတ်။ <strong>လူနာမှတ်တမ်း</strong> နှင့် <strong>တက်ရောက်မှု</strong> မဖန်တီးပါ။</li>
  </ul>
</section>

<p class="footer">Mudita Hospital cheat sheet · laminate for the OPD, OT, pharmacy, patients, and IPD desks.</p>
</body></html>`;
}

export function openCheatSheetPrint(): void {
  openPrintPreview(cheatSheetHTML(), {
    title: "Staff cheat sheet",
    receipt: false,
  });
}
