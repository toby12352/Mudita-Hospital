# Tour: charge-to-ipd

- Id: charge-to-ipd
- Roles: Admin, OPD, OT, and Pharmacy, on a sale desk. IPD Bill has the same label as its first button and is the ipd-stay lesson, not this one. Patients has no bill rail. Do not open this lesson on Return in or on IPD Bill.
- Depends on: bill-buttons, ipd-stay
- Opens: a sale desk that can show the button, and stay there. OPD Bill is view `opd` with `opdScreen: "bill"`. OT Bill is view `ot` with `otMode: "case"`. Pharmacy Bill (sale) is view `pharmacy_billing` with `billingMode: "edit"`. Do not open view `ipd`, an expense view, `pharmacy_return`, or `pharmacy_transfer`.
- Mode: point and explain. Clicks on the highlighted control stay off. This lesson does not tell staff to press Charge to IPD or Mark Paid.
- Entry: Help, not automatic

The chart and the open stay come from the patient-chart and ipd-stay lessons. This lesson does not create either one. `ipd-stay` may not be written yet; the dependency still stands.

## Steps

### 1. charge-button
- Anchor to add later: data-guide="bill-charge-ipd"
- Where the control is now: `client/src/shared/BillPayPrint.tsx` (`BillChargeToIpdButton`), i18n `chargeToIpd`, subtitle `chargeToIpdSub`. No function key. On a sale it is passed in from `client/src/pages/opd/OpdPage.tsx`, `client/src/pages/ot/OtPage.tsx`, and `client/src/pages/pharmacy/PharmacyBillingPage.tsx` when the bill is still a draft and the linked chart has an open stay. Choosing a chart sets that link. Typing in Patient name (`patientName`) clears it. The same component on IPD Bill (`IpdChargeBillPage.tsx`) is the first rail button, with the transfer icon, and that page has no Mark Paid and no F7. The same component on Return in can render `creditToIpd`; if the label is Credit to IPD, this is the wrong screen.
- Placement: left
- Title EN: Charge to IPD
- Title MY: IPD သို့ တင်
- Body EN: Charge to IPD (IPD သို့ တင်) locks this draft onto the chart’s open stay; the subtitle is Not desk cash (ကောင်တာငွေ မဟုတ်), and a typed Patient name (လူနာအမည် *) never shows the button. The same label is the first button on IPD Bill (IPD ဘေလ်), which has no Mark Paid (ပေးပြီးမှတ်) and no F7. A pharmacy sale still deducts MAIN stock and an OT bill still deducts OT inventory quantity. F7 does not charge the stay, and this lesson does not press the button.
- Body MY: Charge to IPD (IPD သို့ တင်) သည် ဤမူကြမ်းကို မှတ်တမ်း၏ ဖွင့်ထားသော တက်ရောက်မှုပေါ်သို့ ပိတ်ပြီး ခေါင်းစဉ်ခွဲသည် Not desk cash (ကောင်တာငွေ မဟုတ်) ဖြစ်ကာ စာရိုက်ထားသော Patient name (လူနာအမည် *) သည် ခလုတ်ကို မပြပါ။ တူညီသောစာသားသည် IPD Bill (IPD ဘေလ်) ၏ ပထမခလုတ်ဖြစ်ပြီး ထိုစာမျက်နှာ၌ Mark Paid (ပေးပြီးမှတ်) မရှိ၊ F7 လည်း မရှိပါ။ ဆေးဆိုင်အရောင်းသည် MAIN စတော့ကို ဆက်လျှော့ပြီး OT ဘေလ်သည် OT စာရင်း အရေအတွက်ကို ဆက်လျှော့သည်။ F7 သည် တက်ရောက်မှုသို့ မတင်ဘဲ ဤသင်ခန်းစာတွင် မနှိပ်ရ။
- Must not press: Charge to IPD
- If the control is missing: skip this step

### 2. leave-mark-paid
- Anchor to add later: data-guide="bill-mark-paid"
- Where the control is now: `client/src/shared/BillPayPrint.tsx` (`BillMarkPaidButton`), i18n `markPaid`. Key F7. On a sale this label is Mark Paid. On Return in the same component renders `markReturned`; that is not this step.
- Placement: left
- Title EN: Leave Mark Paid alone
- Title MY: Mark Paid (ပေးပြီးမှတ်) ကို မနှိပ်ရ
- Body EN: Mark Paid (ပေးပြီးမှတ်), F7, takes desk cash and locks the bill; it does not charge the stay. Charge to IPD (IPD သို့ တင်) is the other button and appears only for a chosen chart with an open stay. IPD Bill (IPD ဘေလ်) has no Mark Paid. Leave Mark Paid unpressed.
- Body MY: Mark Paid (ပေးပြီးမှတ်)၊ F7 သည် ကောင်တာငွေကောက်ပြီး ဘေလ်ကို ပိတ်သော်လည်း တက်ရောက်မှုသို့ မတင်ပါ။ Charge to IPD (IPD သို့ တင်) သည် အခြားခလုတ်ဖြစ်ပြီး ရွေးထားသောမှတ်တမ်း၌ ဖွင့်ထားသော တက်ရောက်မှုရှိမှသာ ပေါ်သည်။ IPD Bill (IPD ဘေလ်) တွင် Mark Paid မရှိပါ။ Mark Paid ကို မနှိပ်ရ။
- Must not press: Mark Paid, F7, Charge to IPD
- If the control is missing: skip this step

## Out of this tour
- Do not press Charge to IPD. Highlight it only.
- Do not press Mark Paid. F7 is desk cash. F7 does not charge the stay.
- Do not press Credit to IPD (IPD သို့ ပြန်ထည့်). That control is on Return in.
- Do not open IPD Bill. Its Charge to IPD button is named in the body and taught on ipd-stay.
- Do not admit, take a deposit, or discharge. Those belong to ipd-stay and ipd-discharge.
- Do not void a bill, transfer stock, or seed training data.
