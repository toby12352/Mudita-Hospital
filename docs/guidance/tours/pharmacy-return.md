# Tour: pharmacy-return

- Id: pharmacy-return
- Roles: Admin and Pharmacy. OPD, OT, Patients, and IPD do not open Return in.
- Depends on: bill-buttons
- Opens: view `pharmacy_return`, NavIntent `billingMode: "edit"`. Sidebar Return in. Do not open Pharmacy Bill (`pharmacy_billing`), Purchase Bills (`pharmacy_purchase`), Transfer to OT (`pharmacy_transfer`), Drug Setup (`pharmacy`), or OT Maintenance (`ot` with `otMode: "stock"`).
- Mode: point and explain. Clicks on the highlighted control stay off. This lesson does not tell staff to press Mark returned, Credit to IPD, or Void Bills.
- Entry: Help, not automatic

Return in is a pharmacy slip. F7 here is Mark returned, not Mark Paid. Stock goes back to MAIN and cash is refunded. This is not Purchase Bills (hospital buying stock), not the OT cupboard return, and not Void Bills.

## Steps

### 1. save-draft
- Anchor to add later: data-guide="bill-save-draft"
- Where the control is now: `client/src/pages/pharmacy/PharmacyBillForm.tsx`, i18n `saveDraft`, key F5, handled in `client/src/pages/pharmacy/PharmacyBillingPage.tsx`. Shown when create is allowed and the slip is still a draft. On this view F5 saves the draft. It does not mark the return.
- Placement: left
- Title EN: Save draft
- Title MY: မူကြမ်းသိမ်း
- Body EN: Save draft (မူကြမ်းသိမ်း), F5, keeps the return slip editable. It does not put stock back and it does not refund cash. F7 on this desk is not Mark Paid (ပေးပြီးမှတ်).
- Body MY: Save draft (မူကြမ်းသိမ်း)၊ F5 သည် ပြန်သွင်းစာရွက်ကို ပြင်နိုင်အောင် ထားသည်။ စတော့မပြန်ထည့်၊ ငွေလည်း မပြန်အမ်းပါ။ ဤကောင်တာ၏ F7 သည် Mark Paid (ပေးပြီးမှတ်) မဟုတ်ပါ။
- Must not press: Save draft, F5
- If the control is missing: skip this step

### 2. print
- Anchor to add later: data-guide="bill-print"
- Where the control is now: `client/src/shared/BillPayPrint.tsx` (`BillPrintButton`), i18n `print`, key F6, drawn on Return in. Print leaves the slip editable.
- Placement: left
- Title EN: Print
- Title MY: ပရင့်
- Body EN: Print (ပရင့်), F6, prints the slip and leaves it editable. Print does not mark the return, does not put stock back, and does not refund cash.
- Body MY: Print (ပရင့်)၊ F6 သည် စာရွက်ကို ပရင့်ထုတ်ပြီး ပြင်နိုင်အောင် ထားသည်။ ပရင့်သည် ပြန်သွင်းမှတ်ခြင်း မလုပ်၊ စတော့မပြန်ထည့်၊ ငွေလည်း မပြန်အမ်းပါ။
- Must not press: Print, F6
- If the control is missing: skip this step

### 3. mark-returned
- Anchor to add later: data-guide="pharmacy-return-mark"
- Where the control is now: `BillMarkPaidButton` in `client/src/pages/pharmacy/PharmacyBillForm.tsx` with `collectLabel` `markReturned` and `collectSubLabel` `marksReturned`. Key F7, only on Return in. The notes are `markReturnedCollects` and `pharmacyStockCreditedOnReturn`. Mark returned puts quantity back on MAIN, refunds cash, and locks the slip. When the linked chart has an open stay and at least one charged pharmacy sale, the rail can also show `creditToIpd` and `creditToIpdSub`, with `returnAgainstSale` when several charged sales exist. Credit to IPD has no function key. It is not this button, and it is not desk cash. New is `newReturn`, still F2. The void control is `vDelete`, not this button.
- Placement: left
- Title EN: Mark returned
- Title MY: ပြန်သွင်းမှတ်
- Body EN: Mark returned (ပြန်သွင်းမှတ်), F7, puts quantity back on MAIN and refunds cash, then locks the slip. The subtitle is Credits stock · refunds cash (စတော့ပြန်ထည့် · ငွေပြန်အမ်း). It is not Return to pharmacy (ဆေးဆိုင်သို့ ပြန်ပို့ရန်) on Inventory (စာရင်း), and it is not Void Bills (ဘေလ်ပယ်ဖျက်). Credit to IPD (IPD သို့ ပြန်ထည့်) can show for an open stay and is not desk cash. This lesson does not press Mark returned or Credit to IPD.
- Body MY: Mark returned (ပြန်သွင်းမှတ်)၊ F7 သည် အရေအတွက်ကို MAIN ပေါ် ပြန်တင်ပြီး ငွေပြန်အမ်းကာ စာရွက်ကို ပိတ်သည်။ ခေါင်းစဉ်ခွဲသည် Credits stock · refunds cash (စတော့ပြန်ထည့် · ငွေပြန်အမ်း) ဖြစ်သည်။ ၎င်းသည် Inventory (စာရင်း) ပေါ်ရှိ Return to pharmacy (ဆေးဆိုင်သို့ ပြန်ပို့ရန်) မဟုတ်၊ Void Bills (ဘေလ်ပယ်ဖျက်) လည်း မဟုတ်ပါ။ Credit to IPD (IPD သို့ ပြန်ထည့်) သည် ဖွင့်ထားသော တက်ရောက်မှုအတွက် ပေါ်နိုင်ပြီး ကောင်တာငွေ မဟုတ်ပါ။ ဤသင်ခန်းစာတွင် Mark returned သို့မဟုတ် Credit to IPD ကို မနှိပ်ရ။
- Must not press: Mark returned, F7, Credit to IPD, Void Bills
- If the control is missing: skip this step

## Out of this tour
- Do not press Mark returned, Credit to IPD, or Void Bills. Point at Mark returned only.
- Do not open OT Maintenance or press Return to pharmacy. That return is a different lesson.
- Do not press Mark Paid. F7 on a sale is a different lesson.
- Do not press Transfer or Confirm transfer.
- Do not seed training data.
