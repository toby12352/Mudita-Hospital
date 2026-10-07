/** One-page staff cheat sheet (EN + MY). Printable HTML for laminate. */

import { openPrintPreview } from "./print";

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
      <li>Reception: <span class="kbd">reception</span> · Pharmacy: <span class="kbd">pharmacy</span> · Admin: <span class="kbd">admin</span></li>
      <li>Idle 15 min → auto lock. Language: EN / မြန်မာ (top bar).</li>
    </ul>
  </section>
  <section>
    <h2>2. OPD bill (cash) / ပြင်ပဘေလ်</h2>
    <ul>
      <li>Home → <strong>OPD</strong> → New bill.</li>
      <li>Patient name → doctor → type item/service <strong>code</strong> → Enter to add line.</li>
      <li class="my">လူနာအမည် → ဆရာဝန် → ကုဒ်ရိုက် → Enter ဖြင့် လိုင်းထည့်။</li>
      <li><strong>Pay cash</strong> (stock drops) → <strong>Print</strong> (in-app preview).</li>
      <li>First receipt: printer <strong>EPSON TM-T82 Receipt</strong>, paper <strong>80 mm</strong>.</li>
      <li>Void needs a reason (restores stock if paid).</li>
    </ul>
  </section>
  <section>
    <h2>3. OT case cart / ခွဲစိတ်ကာ့တ်</h2>
    <ul>
      <li>Home → <strong>OT</strong> → New case → add items → <strong>Issue</strong>.</li>
      <li>Print pick list → take upstairs.</li>
      <li>Reconcile: Used / Returned / Wasted / Kept on floor.</li>
      <li class="my">အသုံးပြု / ပြန်ပို့ / ပျက် / ကြမ်းပြင်ထား။</li>
      <li>Create OT bill → Pay cash → Print.</li>
    </ul>
  </section>
  <section>
    <h2>4. Pharmacy / ဆေးဆိုင်</h2>
    <ul>
      <li>Home → <strong>Pharmacy</strong> → search code/name.</li>
      <li>New item: code, category, prices, reorder, first batch + expiry.</li>
      <li><strong>Restock</strong> existing code (cannot restock unknown code).</li>
      <li class="my">မသိသော ကုဒ်ကို restock မရ — အရင် item ဖန်တီးပါ။</li>
      <li>Reports → Low stock / Near expiry.</li>
    </ul>
  </section>
  <section>
    <h2>5. Reports / အစီရင်ခံစာ</h2>
    <ul>
      <li><strong>Daily cash</strong> — paid OPD + OT for a date (Reception/Admin).</li>
      <li><strong>Low stock</strong> — In Stock ≤ reorder (Pharmacy/Admin).</li>
      <li><strong>Near expiry</strong> — batches within N days.</li>
      <li>Use <strong>Print</strong> on each report for the day book.</li>
    </ul>
  </section>
  <section>
    <h2>6. Daily ops / နေ့စဉ်</h2>
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
