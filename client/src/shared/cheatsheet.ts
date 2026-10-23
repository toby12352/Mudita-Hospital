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
      <li>OPD: <span class="kbd">opd</span> · OT: <span class="kbd">ot</span> · Pharmacy: <span class="kbd">pharmacy</span> · Admin: <span class="kbd">admin</span> (picks one portal).</li>
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
      <li><strong>Confirm (F5)</strong> = draft. <strong>Print (F7)</strong> = save + pay + print preview.</li>
      <li><strong>History (F9)</strong> · <strong>V.Delete (^F8)</strong> void with reason · <strong>Cancel (F10)</strong> clears form.</li>
      <li>First receipt: printer <strong>EPSON TM-T82 Receipt</strong>, paper <strong>80 mm</strong>.</li>
    </ul>
  </section>
  <section>
    <h2>3. OT cupboard / ခွဲစိတ် ဆေးဗီရို</h2>
    <ul>
      <li>Pharmacy: item → View → <strong>Send to OT</strong> (batch + qty). Stock moves in that step.</li>
      <li class="my">ဆေးဆိုင်က အသုတ်နှင့် အရေအတွက်ကို OT ဆေးဗီရိုသို့ ပို့သည်။</li>
      <li>OT cupboard: <strong>Return to pharmacy</strong> for unused qty.</li>
      <li>New OT bill from cupboard on hand → <strong>Pay cash</strong> → Print. Pay deducts qty. Void puts it back.</li>
      <li class="my">ဘေလ်ပေးချေမှ လက်ကျန်ကျသည်။ မသုံးသော အရေအတွက်ကို ဆေးဆိုင်သို့ ပြန်ပို့ပါ။</li>
    </ul>
  </section>
  <section>
    <h2>4. Pharmacy Billing / ဆေးဆိုင် ဘေလ်</h2>
    <ul>
      <li>Home → <strong>Pharmacy Billing</strong> → New bill → add medicines by code.</li>
      <li>Enter qty in <strong>billing units</strong> (e.g. mL); system converts to stock units.</li>
      <li><strong>Pay cash</strong> deducts stock (FEFO) → Print. Void restores stock.</li>
    </ul>
  </section>
  <section>
    <h2>5. Pharmacy Stock / ဆေးဆိုင် စတော့</h2>
    <ul>
      <li><strong>Pharmacy Stock</strong> → set purchase / stock / billing units + conversion.</li>
      <li><strong>Restock</strong> in boxes or stock units (cannot restock unknown code).</li>
      <li class="my">မသိသော ကုဒ်ကို restock မရ — အရင် item ဖန်တီးပါ။</li>
      <li>View a MAIN batch → <strong>Send to OT</strong>. Low stock / near expiry are MAIN only.</li>
    </ul>
  </section>
  <section>
    <h2>6. Reports / အစီရင်ခံစာ</h2>
    <ul>
      <li><strong>This desk</strong> — history and cash are this portal's paid bills only.</li>
      <li><strong>Admin dashboard</strong> — combined OPD + OT + pharmacy cash for the day.</li>
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
