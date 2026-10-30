# Tour: bill-buttons

- Id: bill-buttons
- Roles: Admin, OPD, OT, Pharmacy, and IPD. On IPD Bill the Mark Paid step skips and Charge to IPD is the first button. On the IPD expense rail the Charge to IPD step skips. Patients has no bill rail.
- Depends on: none
- Opens: the sale desk already on screen. Do not switch views during this lesson. OPD Bill is view `opd` with `opdScreen: "bill"`. OT Bill is view `ot` with `otMode: "case"`. Pharmacy Bill (sale) is view `pharmacy_billing` with `billingMode: "edit"`. Expense bill is view `opd` with `opdScreen: "expense"`, view `ot` with `otMode: "expense"`, view `pharmacy_expense`, or view `ipd_expense`. Do not open Return in (`pharmacy_return`) or Transfer to OT (`pharmacy_transfer`) for this lesson.
- Mode: point and explain. Clicks on the highlighted control stay off. This lesson does not tell staff to press Mark Paid or Charge to IPD.
- Entry: Help, not automatic

## Steps

### 1. save-draft
- Anchor to add later: data-guide="bill-save-draft"
- Where the control is now: `client/src/pages/opd/OpdBillForm.tsx`, `client/src/pages/ot/OtPage.tsx`, `client/src/pages/pharmacy/PharmacyBillForm.tsx`, `client/src/pages/expenses/ExpenseBillPage.tsx`, and `client/src/pages/ipd/IpdChargeBillPage.tsx`, each rendering `saveDraft`. Key F5. Shown only when that desk’s create action is allowed.
- Placement: left
- Title EN: Save draft
- Title MY: မူကြမ်းသိမ်း
- Body EN: Save draft (မူကြမ်းသိမ်း), F5, keeps the bill editable. It does not take cash and it does not move stock.
- Body MY: Save draft (မူကြမ်းသိမ်း)၊ F5 သည် ဘေလ်ကို ပြင်နိုင်အောင် ထားသည်။ ငွေမကောက်၊ စတော့လည်း မရွေ့ပါ။
- Must not press: Save draft, F5
- If the control is missing: skip this step

### 2. print
- Anchor to add later: data-guide="bill-print"
- Where the control is now: `client/src/shared/BillPayPrint.tsx` (`BillPrintButton`), i18n `print`. Key F6. Not drawn on Transfer to OT.
- Placement: left
- Title EN: Print
- Title MY: ပရင့်
- Body EN: Print (ပရင့်), F6, can show Printed — Not Paid (ပရင့်ပြီး — မပေးရသေး), and the bill stays editable until Mark Paid (ပေးပြီးမှတ်). Print does not take cash and does not move stock.
- Body MY: Print (ပရင့်)၊ F6 သည် Printed — Not Paid (ပရင့်ပြီး — မပေးရသေး) ပြနိုင်ပြီး Mark Paid (ပေးပြီးမှတ်) မချင်း ဘေလ်ကို ပြင်နိုင်သေးသည်။ ပရင့်သည် ငွေမကောက်၊ စတော့လည်း မရွေ့ပါ။
- Must not press: Print, F6
- If the control is missing: skip this step

### 3. mark-paid
- Anchor to add later: data-guide="bill-mark-paid"
- Where the control is now: `client/src/shared/BillPayPrint.tsx` (`BillMarkPaidButton`), i18n `markPaid`, subtitle `marksPaidFinal`. Key F7. On a sale or expense bill only. On Return in the same component renders `markReturned`, and on Transfer to OT the F7 controls are `transferAction` then `confirmTransfer`. Those are not this step.
- Placement: left
- Title EN: Mark Paid
- Title MY: ပေးပြီးမှတ်
- Body EN: Mark Paid (ပေးပြီးမှတ်), F7, takes desk cash and locks the bill so editing stops; a pharmacy sale also deducts MAIN stock, an OT bill also deducts OT inventory quantity, and an expense bill does not move stock. F7 on Return in is Mark returned (ပြန်သွင်းမှတ်), and F7 on Transfer to OT is Transfer (လွှဲမည်) then Confirm transfer (လွှဲခြင်း အတည်ပြု); those are different lessons.
- Body MY: Mark Paid (ပေးပြီးမှတ်)၊ F7 သည် ကောင်တာငွေကောက်ပြီး ဘေလ်ကို ပိတ်သဖြင့် ပြင်၍မရတော့ပါ — ဆေးဆိုင်အရောင်းသည် MAIN စတော့လျှော့ပြီး၊ OT ဘေလ်သည် OT စာရင်း အရေအတွက်လျှော့ကာ၊ အသုံးစရိတ်ဘေလ်သည် စတော့မရွေ့ပါ။ Return in ၏ F7 သည် Mark returned (ပြန်သွင်းမှတ်) ဖြစ်ပြီး Transfer to OT ၏ F7 သည် Transfer (လွှဲမည်) ပြီးနောက် Confirm transfer (လွှဲခြင်း အတည်ပြု) ဖြစ်သဖြင့် ထိုနှစ်ခုသည် သီးခြားသင်ခန်းစာဖြစ်သည်။
- Must not press: Mark Paid, F7
- If the control is missing: skip this step

### 4. charge-to-ipd
- Anchor to add later: data-guide="bill-charge-ipd"
- Where the control is now: `client/src/shared/BillPayPrint.tsx` (`BillChargeToIpdButton`), i18n `chargeToIpd`, subtitle `chargeToIpdSub`. No function key. On a sale it is passed in from `client/src/pages/opd/OpdPage.tsx`, `client/src/pages/ot/OtPage.tsx`, and `client/src/pages/pharmacy/PharmacyBillingPage.tsx` when the bill is still a draft and the linked chart has an open stay. On IPD Bill it is the first button in `client/src/pages/ipd/IpdChargeBillPage.tsx`, and that page has no Mark Paid. The same component on Return in can render `creditToIpd` instead; that label is not this step. F7 does not charge the stay.
- Placement: left
- Title EN: Charge to IPD
- Title MY: IPD သို့ တင်
- Body EN: Charge to IPD (IPD သို့ တင်) has no function key, and the subtitle is Not desk cash (ကောင်တာငွေ မဟုတ်). On a draft OPD, OT, or pharmacy sale it shows when the chosen chart has an open stay. On IPD Bill (IPD ဘေလ်) it is the first button, and that page has no Mark Paid (ပေးပြီးမှတ်). A typed name, an expense bill, Return in, and Transfer to OT do not show it, and F7 does not charge the stay.
- Body MY: Charge to IPD (IPD သို့ တင်) တွင် ဖန်ရှင်ကီးမရှိဘဲ ခေါင်းစဉ်ခွဲသည် Not desk cash (ကောင်တာငွေ မဟုတ်) ဖြစ်သည်။ မူကြမ်း OPD၊ OT၊ သို့မဟုတ် ဆေးဆိုင်အရောင်းတွင် ရွေးထားသောမှတ်တမ်း၌ ဖွင့်ထားသော တက်ရောက်မှုရှိမှ ပေါ်သည်။ IPD Bill (IPD ဘေလ်) တွင် ပထမခလုတ်ဖြစ်ပြီး ထိုစာမျက်နှာ၌ Mark Paid (ပေးပြီးမှတ်) မရှိပါ။ စာရိုက်အမည်၊ အသုံးစရိတ်၊ Return in၊ Transfer to OT တို့တွင် မပေါ်သလို F7 သည်လည်း တက်ရောက်မှုသို့ မတင်ပါ။
- Must not press: Charge to IPD
- If the control is missing: skip this step

### 5. void
- Anchor to add later: data-guide="bill-void"
- Where the control is now: the same desk files as Save draft, including IPD Bill, rendering `vDelete` (“Void Bills” / “ဘေလ်ပယ်ဖျက်”), not the unused key `voidBill`. Footer key is Ctrl+F8 or Cmd+F8; the footer text is `^F8`. The reason field is `voidReason`. The empty-reason hint is `voidReasonRequired`. The history dialog’s confirm button is `delete`. Shown only when delete is allowed.
- Placement: left
- Title EN: Void Bills
- Title MY: ဘေလ်ပယ်ဖျက်
- Body EN: Void Bills (ဘေလ်ပယ်ဖျက်) is Ctrl+F8 or Cmd+F8 (the footer shows ^F8) and needs a Void reason (ပယ်ဖျက်အကြောင်း); an empty reason is refused with Required to void (ပယ်ဖျက်ရန် လိုအပ်သည်), and the dialog confirm says Delete (ဖျက်ရန်). Void of a paid pharmacy sale or a paid OT bill puts quantity back, and this lesson does not void a bill.
- Body MY: Void Bills (ဘေလ်ပယ်ဖျက်) သည် Ctrl+F8 သို့မဟုတ် Cmd+F8 (အောက်ခြေ ^F8) ဖြစ်ပြီး Void reason (ပယ်ဖျက်အကြောင်း) လိုသည်။ ဗလာဖြစ်လျှင် Required to void (ပယ်ဖျက်ရန် လိုအပ်သည်) ဖြင့် ငြင်းပြီး ဒိုင်ယာလော့ခ်အတည်ပြုခလုတ်သည် Delete (ဖျက်ရန်) ဖြစ်ကာ၊ ပေးပြီးဆေးဆိုင်အရောင်း သို့မဟုတ် ပေးပြီး OT ဘေလ်ကို ပယ်ဖျက်လျှင် အရေအတွက်ပြန်တက်သော်လည်း ဤသင်ခန်းစာတွင် ဘေလ်မပယ်ဖျက်ရ။
- Must not press: Void Bills, Ctrl+F8, Cmd+F8, Delete
- If the control is missing: skip this step

### 6. history
- Anchor to add later: data-guide="bill-history"
- Where the control is now: the same four desk files as Save draft, rendering `history`. Key F9.
- Placement: left
- Title EN: History
- Title MY: မှတ်တမ်း
- Body EN: History (မှတ်တမ်း), F9, opens the bill list. It does not take cash, print, or void.
- Body MY: History (မှတ်တမ်း)၊ F9 သည် ဘေလ်စာရင်းကို ဖွင့်သည်။ ငွေမကောက်၊ မပရင့်၊ မပယ်ဖျက်ပါ။
- Must not press: History, F9
- If the control is missing: skip this step

### 7. new-bill
- Anchor to add later: data-guide="bill-new"
- Where the control is now: the same four desk files as Save draft, rendering `newBill` on a sale or expense bill. Key F2. Return in renders `newReturn` and Transfer to OT renders `newTransfer`; those labels are not this step. Shown only when create is allowed.
- Placement: left
- Title EN: New bill
- Title MY: ဘေလ်အသစ်
- Body EN: New bill (ဘေလ်အသစ်), F2, clears the form for another bill, and a saved bill stays in History (မှတ်တမ်း). It does not mark the open bill paid.
- Body MY: New bill (ဘေလ်အသစ်)၊ F2 သည် ဘေလ်အသစ်အတွက် ဖောင်ကို ရှင်းပြီး သိမ်းပြီးသားဘေလ်သည် History (မှတ်တမ်း) တွင် ကျန်သည်။ ဖွင့်ထားသောဘေလ်ကို ပေးပြီးအဖြစ် မမှတ်ပါ။
- Must not press: New bill, F2
- If the control is missing: skip this step

### 8. cancel
- Anchor to add later: data-guide="bill-cancel"
- Where the control is now: the same four desk files as Save draft, rendering `cancel`. Key F10. OPD, pharmacy, and expense ask `confirmCancelBill`. OT asks `otDeskCancelConfirm`. Both clear the form.
- Placement: left
- Title EN: Cancel
- Title MY: မလုပ်တော့
- Body EN: Cancel (မလုပ်တော့), F10, asks to clear this form. It does not take cash and it does not void a saved bill.
- Body MY: Cancel (မလုပ်တော့)၊ F10 သည် ဤဖောင်ကို ရှင်းမလားဟု မေးသည်။ ငွေမကောက်ဘဲ သိမ်းပြီးသားဘေလ်ကိုလည်း မပယ်ဖျက်ပါ။
- Must not press: Cancel, F10
- If the control is missing: skip this step

## Out of this tour
- Do not press Mark Paid or Charge to IPD. Point at them only.
- Do not press Void Bills, Delete, or enter a void reason on a live bill.
- Do not open Return in or Transfer to OT. F7 there is a different lesson.
- Credit to IPD (IPD သို့ ပြန်ထည့်) on Return in is not Charge to IPD.
- Do not discharge, transfer stock, or seed training data.
