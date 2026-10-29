# Tour: pharmacy-transfer

- Id: pharmacy-transfer
- Roles: Admin and Pharmacy. OPD, OT, Patients, and IPD do not open Transfer to OT.
- Depends on: bill-buttons
- Opens: view `pharmacy_transfer`, NavIntent `billingMode: "edit"`. Sidebar Transfer to OT. Do not open Pharmacy Bill (`pharmacy_billing`), Return in (`pharmacy_return`), Drug Setup (`pharmacy`), or OT Maintenance (`ot` with `otMode: "stock"`).
- Mode: point and explain. Clicks on the highlighted control stay off. This lesson does not tell staff to press Transfer or Confirm transfer.
- Entry: Help, not automatic

Transfer to OT moves saleable MAIN stock into the OT cupboard. There is no cash. F6 is swallowed and does nothing, and Print is not on this rail. The first F7 prepares the slip. The second F7 moves the stock. A transfer number starts with `TO-` and cannot be attached to a chart.

## Steps

### 1. transfer
- Anchor to add later: data-guide="pharmacy-transfer"
- Where the control is now: the first rail button in `client/src/pages/pharmacy/PharmacyBillForm.tsx` when the view is a transfer, label `transferAction`, subtitle `transferCheckLines`, key F7 while the slip is not yet waiting. The handler is `doArmTransfer` in `client/src/pages/pharmacy/PharmacyBillingPage.tsx`. That press saves the slip and waits. It does not move stock. The collect note before that press is `transferConfirmNote`. After it, the note is `transferArmedNote` and the status line is `transferArmed`. F6 hits the key handler and returns without printing. `BillPrintButton` is not drawn. F5 is still `saveDraft` and does not move stock. The button is disabled once the slip is waiting. If Transfer is not drawn, skip this step.
- Placement: left
- Title EN: Transfer
- Title MY: လွှဲမည်
- Body EN: Transfer (လွှဲမည်), the first F7, saves the slip and waits. The subtitle is Check the lines (စာရင်းစစ်ပါ). It does not move stock and it does not take cash. F6 does nothing, and Print (ပရင့်) is not on this rail. This lesson does not press Transfer.
- Body MY: Transfer (လွှဲမည်)၊ ပထမ F7 သည် စာရွက်ကို သိမ်းပြီး စောင့်သည်။ ခေါင်းစဉ်ခွဲသည် Check the lines (စာရင်းစစ်ပါ) ဖြစ်သည်။ စတော့မရွေ့၊ ငွေလည်း မကောက်ပါ။ F6 သည် ဘာမှမလုပ်ဘဲ Print (ပရင့်) သည် ဤဘေးတန်းတွင် မရှိပါ။ ဤသင်ခန်းစာတွင် Transfer ကို မနှိပ်ရ။
- Must not press: Transfer, F7, F6, F5, Save draft
- If the control is missing: skip this step

### 2. confirm-transfer
- Anchor to add later: data-guide="pharmacy-transfer-confirm"
- Where the control is now: the second rail button in `client/src/pages/pharmacy/PharmacyBillForm.tsx`, drawn only when the draft is waiting (`awaitingConfirm`), label `confirmTransfer`, subtitle `movesToOtCupboard`, key F7. The handler is `doConfirmTransfer`, which calls `transferPharmacyBill`. That press moves saleable MAIN quantity into the OT cupboard and locks the slip. The success dialog is `itemsTransferredToOt`. The slip has no Batch number field and no Expiry field. There is no Mark Paid and no Charge to IPD. New is `newTransfer`, still F2. If Confirm transfer is not drawn, skip this step.
- Placement: left
- Title EN: Confirm transfer
- Title MY: လွှဲခြင်း အတည်ပြု
- Body EN: Confirm transfer (လွှဲခြင်း အတည်ပြု), the second F7, moves saleable MAIN stock into the OT cupboard. The subtitle is Moves stock to OT (OT သို့ စတော့ရောက်သည်). It does not take cash. This lesson does not press Confirm transfer.
- Body MY: Confirm transfer (လွှဲခြင်း အတည်ပြု)၊ ဒုတိယ F7 သည် ရောင်းနိုင်သော MAIN စတော့ကို OT ဆေးဗီရိုသို့ ရွှေ့သည်။ ခေါင်းစဉ်ခွဲသည် Moves stock to OT (OT သို့ စတော့ရောက်သည်) ဖြစ်သည်။ ငွေမကောက်ပါ။ ဤသင်ခန်းစာတွင် Confirm transfer ကို မနှိပ်ရ။
- Must not press: Confirm transfer, F7
- If the control is missing: skip this step

## Out of this tour
- Do not press Transfer or Confirm transfer. Point at them only.
- Do not press F6. It does nothing on this desk.
- Do not press Mark Paid, Mark returned, Charge to IPD, or Void Bills.
- Do not attach a `TO-` slip to a chart.
- Do not press Return to pharmacy on Inventory (စာရင်း). Stock appears there after a confirmed transfer. Sending it back is a different lesson.
- Do not seed training data.
