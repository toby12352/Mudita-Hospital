/** One-page staff cheat sheet (EN + MY). Printable HTML for laminate. */

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
<h1>Mudita Hospital — Staff cheat sheet / ဝန်ထမ်း လမ်းညွှန်</h1>
<p>Offline LAN · OPD · OT · Pharmacy · Print this page and laminate for the desk.</p>

<div class="grid">
  <section>
    <h2>1. Sign in / ဝင်ရန်</h2>
    <ul>
      <li>Open Mudita → enter <strong>Server IP</strong> once (port 8080).</li>
      <li class="my">မုဒိတာ ဖွင့် → ဆာဗာ IP တစ်ကြိမ်ထည့် (ပို့တ် 8080)။</li>
      <li>OPD: <span class="kbd">opd</span> · OT: <span class="kbd">ot</span> · Pharmacy: <span class="kbd">pharmacy</span> · Patients: <span class="kbd">patients</span> · IPD: <span class="kbd">ipd</span> · Admin: <span class="kbd">admin</span> (picks one portal).</li>
      <li>Idle 15 min → auto lock. Language: EN / မြန်မာ (top bar).</li>
      <li>History shows this desk's bills only.</li>
    </ul>
  </section>
  <section>
    <h2>2. OPD bill (cash) / ပြင်ပဘေလ်</h2>
    <ul>
      <li>Home → <strong>OPD</strong> → Bill.</li>
      <li>Patient name → doctor → add <strong>service</strong> or consultation (no medicines here).</li>
      <li class="my">လူနာအမည် → ဆရာဝန် → ဝန်ဆောင်မှု / consultation။ ဆေးသည် Pharmacy Billing တွင်။</li>
      <li><strong>Save draft (F5)</strong> = unpaid bill. <strong>Print (F6)</strong> = save + receipt (Printed — Not Paid; still editable). <strong>Mark Paid (F7)</strong> = collect cash and lock the bill.</li>
      <li class="my">မူကြမ်းသိမ်း (F5) = မပေးရသေး။ ပရင့် (F6) = သိမ်း + ပြေစာ (ပြင်နိုင်)။ ပေးပြီးမှတ် (F7) = ငွေကောက် + ဘေလ်ပိတ်။</li>
      <li><strong>History (F9)</strong> · <strong>Void Bills (^F8)</strong> void with reason · <strong>Cancel (F10)</strong> clears form · <strong>New bill (F2)</strong> next patient.</li>
      <li><strong>Print (F6)</strong> opens the receipt preview; the preview <strong>Print</strong> button opens the Windows print dialog. Set the EPSON roll to <strong>80 mm</strong> in Windows printer preferences.</li>
    </ul>
  </section>
  <section>
    <h2>3. OT cupboard / ခွဲစိတ် ဆေးဗီရို</h2>
    <ul>
      <li>Pharmacy: <strong>Transfer to OT</strong> → add medicines → <strong>Transfer</strong>, then <strong>Confirm transfer</strong>. Saleable stock moves. Batch number and expiry are optional.</li>
      <li class="my">ဆေးဆိုင်က OT သို့ လွှဲ တွင် ဆေးထည့်ပြီး အတည်ပြုမှ ဆေးဗီရိုသို့ ရောက်သည်။ အသုတ်နံပါတ် မထည့်လည်း ရသည်။</li>
      <li>OT cupboard: <strong>Return to pharmacy</strong> for unused qty.</li>
      <li>New OT bill from cupboard on hand → <strong>Print (F6)</strong> for a receipt you can still edit, or <strong>Mark Paid (F7)</strong> to collect cash and deduct cupboard qty. Void puts paid qty back.</li>
      <li class="my">ပရင့် (F6) = ပြေစာ (ပြင်နိုင်)။ ပေးပြီးမှတ် (F7) = ငွေကောက် + ဆေးဗီရိုလျှော့။ မသုံးသော အရေအတွက်ကို ဆေးဆိုင်သို့ ပြန်ပို့ပါ။</li>
    </ul>
  </section>
  <section>
    <h2>4. Pharmacy Billing / ဆေးဆိုင် ဘေလ်</h2>
    <ul>
      <li>Home → <strong>Pharmacy Billing</strong> → New bill → add medicines by code.</li>
      <li>Enter qty in <strong>billing units</strong> (e.g. mL); system converts to stock units.</li>
      <li><strong>Save draft (F5)</strong> keeps unpaid. <strong>Print (F6)</strong> opens a receipt (still editable). <strong>Mark Paid (F7)</strong> collects cash and deducts stock (FEFO). Void restores stock.</li>
      <li class="my">မူကြမ်းသိမ်း (F5)။ ပရင့် (F6) = ပြေစာ (ပြင်နိုင်)။ ပေးပြီးမှတ် (F7) = ငွေကောက် + စတော့လျှော့။</li>
    </ul>
  </section>
  <section>
    <h2>4b. Pharmacy Return in / ဆေးပြန်သွင်း</h2>
    <ul>
      <li>Pharmacy portal → <strong>Return in</strong> → add returned medicines by code (same form as sales).</li>
      <li><strong>Print (F6)</strong> opens the slip (still editable). <strong>Mark returned (F7)</strong> puts qty back into MAIN and refunds cash on the day book.</li>
      <li class="my">ပရင့် (F6) = စလစ် (ပြင်နိုင်)။ ပြန်သွင်းမှတ် (F7) = MAIN စတော့ပြန်ထည့် + နေ့စာအုပ်တွင် ငွေပြန်အမ်း။</li>
    </ul>
  </section>
  <section>
    <h2>5. Pharmacy Stock / ဆေးဆိုင် စတော့</h2>
    <ul>
      <li><strong>Pharmacy Stock</strong> → set purchase / stock / billing units + conversion.</li>
      <li><strong>Restock</strong> in boxes or stock units (cannot restock unknown code).</li>
      <li class="my">မသိသော ကုဒ်ကို restock မရ — အရင် item ဖန်တီးပါ။</li>
      <li>Low stock / near expiry are MAIN only. Send stock from <strong>Transfer to OT</strong>.</li>
    </ul>
  </section>
  <section>
    <h2>6. Reports / အစီရင်ခံစာ</h2>
    <ul>
      <li><strong>This desk</strong> — history and cash are this portal's paid bills only.</li>
      <li><strong>Admin dashboard</strong> — combined OPD + OT + pharmacy cash, plus one IPD cash total (deposits, collections, refunds).</li>
      <li><strong>Charge to IPD</strong> sits beside Mark Paid only when that chart has an open stay. Pay stays cash. A charged bill is not desk cash.</li>
      <li><strong>IPD discharge</strong> refunds a positive balance, collects a negative balance, or settles zero with no cash line. Then the stay is settled.</li>
      <li><strong>Patients</strong> — attach one bill number that has no chart. The total does not change. <span class="kbd">TO-</span> slips cannot be attached.</li>
      <li><strong>Low stock / near expiry</strong> — MAIN pharmacy batches (Pharmacy/Admin).</li>
    </ul>
  </section>
  <section>
    <h2>7. Daily ops / နေ့စဉ်</h2>
    <ul>
      <li>Morning: check Server connected (green).</li>
      <li>Admin → Settings → <strong>Backup</strong> (or USB copy weekly — see DEPLOY.md).</li>
      <li>Training: Settings → Training → Seed / Reset DEMO- data only.</li>
      <li>Help: click Help tile or press <span class="kbd">?</span>.</li>
    </ul>
  </section>
</div>

<p class="footer">Mudita Hospital cheat sheet · keep beside cash drawer · do not change Server IP unless IT asks.</p>
</body></html>`;
}

export function openCheatSheetPrint(): void {
  openPrintPreview(cheatSheetHTML(), {
    title: "Staff cheat sheet",
    receipt: false,
  });
}
