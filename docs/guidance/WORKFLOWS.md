# Clinic workflows

This file describes the Mudita clinic as the software behaves today. It does not change screens, buttons, or the server. If a screen and this file disagree, the screen wins and this file should be corrected.

Button words are copied from `client/src/shared/i18n.ts`. English and Myanmar are given in that order. Do not retranslate them.

The in-app Help overlay (`?`) uses the same i18n strings in English and Myanmar. It covers the sale rail, patients, IPD, and Charge to IPD, and staff open a lesson from there. A lesson does not start on login. This file still describes the desk buttons.

There is no URL router. A screen is a `View` plus a `NavIntent` from `client/src/app/types.ts`.

## Corrected while writing

The code moved past a few names in the guidance plan. These are the ones that matter:

- The bill-rail void control renders `vDelete` (“Void Bills” / “ဘေလ်ပယ်ဖျက်”), not `voidBill` (“Void bill”). The history dialog’s confirm button is `delete` (“Delete” / “ဖျက်ရန်”). The reason field is `voidReason` (“Void reason” / “ပယ်ဖျက်အကြောင်း”). `voidBill` and `voidBillRestore` are not on the rail.
- The OT stock sidebar item is `navOtCupboard` (“Maintenance” / “ထိန်းသိမ်းရေး”). The page heading is `maintenanceInventory` (“Inventory” / “စာရင်း”). The key `otCupboard` (“OT Stock” / “OT လက်ကျန်”) is not the sidebar label.
- Pharmacy Return in can show `creditToIpd` (“Credit to IPD” / “IPD သို့ ပြန်ထည့်”) when the linked chart has an open stay and at least one charged sale. That is not Charge to IPD and it is not desk cash.
- `patientsAttachHint` and `ipdBalanceHint` exist in i18n and are not rendered. Attach shows the field and the button. Discharge shows its own subtitle (`ipdWillRefund`, `ipdWillCollect`, or `ipdWillZero`).
- Void of a paid pharmacy **sale** or a paid OT bill puts quantity back. Void of a paid pharmacy **return** takes that quantity back off MAIN. Void of a confirmed transfer reverses the move.

## Sign-in and language

Sign-in is `signIn` (“Sign in” / “ဝင်ရန်”) in `client/src/app/LoginForm.tsx`. The language control in `client/src/app/LanguageSwitcher.tsx` is `english` (“English”) and `myanmar` (“မြန်မာ”), on the sign-in screen and on the desk.

Roles stored on the user, from `server/internal/auth/roles.go` and `client/src/app/portal.ts`: Admin, OPD, OT, Pharmacy, Patients, IPD. A desk login opens only its own module. Admin uses the full sidebar. Settings, including training seed, is Admin-only. An unknown role gets no portal.

| Login | Lands on | View | NavIntent |
|---|---|---|---|
| OPD | OPD Bill | `opd` | `opdScreen: "bill"`, `billingMode: "edit"` |
| OT | OT Bill | `ot` | `otMode: "case"` |
| Pharmacy | Pharmacy Bill | `pharmacy_billing` | `billingMode: "edit"` |
| Patients | Patient Charts | `patients` | `patientsScreen: "list"` |
| IPD | Stays | `ipd` | none |
| Admin | Home, then any module | `home` | none |

Sidebar labels, from `client/src/app/AppNavBar.tsx`:

| Item | Key | English | Myanmar | View | NavIntent |
|---|---|---|---|---|---|
| OPD Bill | `navOpd` | OPD Bill | OPD ဘေလ် | `opd` | `opdScreen: "bill"` |
| OT Bill | `navOtBill` | OT Bill | OT ဘေလ် | `ot` | `otMode: "case"` |
| Pharmacy Bill | `navSales` | Pharmacy Bill | ဆေးဆိုင် ဘေလ် | `pharmacy_billing` | `billingMode: "edit"` |
| Return in | `navReturnIn` | Return in | ပြန်သွင်း | `pharmacy_return` | `billingMode: "edit"` |
| Transfer to OT | `navTransferToOt` | Transfer to OT | OT သို့ လွှဲ | `pharmacy_transfer` | `billingMode: "edit"` |
| Expense bill | `navExpenseBill` | Expense bill | အသုံးစရိတ် ဘေလ် | desk’s expense view | see Expense bills |
| Patient Charts | `navPatients` | Patient Charts | လူနာမှတ်တမ်း | `patients` | `patientsScreen: "list"` |
| Create New Patient | `navCreatePatient` | Create New Patient | လူနာအသစ် ဖန်တီးရန် | `patients` | `patientsScreen: "create"` |
| Stays | `navIpd` | Stays | တက်ရောက်မှု | `ipd` | none |
| Maintenance (pharmacy items) | `navMaintenance` | Maintenance | ထိန်းသိမ်းရေး | `pharmacy` | `pharmacyScreen: "browse"` |
| Maintenance (OT stock) | `navOtCupboard` | Maintenance | ထိန်းသိမ်းရေး | `ot` | `otMode: "stock"` |

Create New Patient is shown only when that account may create charts.

## Shared bill rail

Used by OPD Bill, OT Bill, Pharmacy Bill (sale), and Expense bill. Print, Mark Paid, and Charge to IPD are drawn in `client/src/shared/BillPayPrint.tsx`. Save draft, History, Void Bills, Cancel, and New bill are drawn on each desk form.

On a **sale** (OPD, OT, pharmacy sale, expense):

| Key | What it does |
|---|---|
| F5 | Save draft. The bill stays editable. No cash. No stock. |
| F6 | Print. Saves if needed, stamps the bill as printed, and opens the receipt. Status label becomes “Printed — Not Paid”. The bill is still a draft, so it can still be edited. Print does not take cash and does not move stock. |
| F7 | Mark Paid. Takes desk cash and locks the bill. Editing stops. Pharmacy sale also deducts MAIN stock (earliest expiry first). OT Bill also deducts cupboard quantity. Expense does not move stock. |

A printed bill can still be edited because print leaves `status` as `draft` and only sets `printed_at`. The status label is `printedNotPaid` (“Printed — Not Paid” / “ပရင့်ပြီး — မပေးရသေး”) from `moneyStatusLabel` in `BillPayPrint.tsx`. The on-screen note is `printedReceiptReady` (“Printed {bill}. Bill stays editable until Mark Paid.” / “{bill} ပရင့်ပြီး။ ပေးပြီးမှတ်မချင်း ပြင်နိုင်သေးသည်။”). Mark Paid, Charge to IPD, Mark returned, and Credit to IPD are what leave the draft.

| Control | Key | i18n | English | Myanmar | Drawn in |
|---|---|---|---|---|---|
| Save draft | F5 | `saveDraft` | Save draft | မူကြမ်းသိမ်း | `OpdBillForm.tsx`, `OtPage.tsx`, `PharmacyBillForm.tsx`, `ExpenseBillPage.tsx` |
| Print | F6 | `print` | Print | ပရင့် | `BillPayPrint.tsx` (`BillPrintButton`) |
| Mark Paid | F7 | `markPaid` | Mark Paid | ပေးပြီးမှတ် | `BillPayPrint.tsx` (`BillMarkPaidButton`) |
| Mark Paid subtitle | — | `marksPaidFinal` | Final · locks bill | နောက်ဆုံး · ဘေလ်ပိတ်မည် | same button |
| Charge to IPD | none | `chargeToIpd` | Charge to IPD | IPD သို့ တင် | `BillPayPrint.tsx` (`BillChargeToIpdButton`) |
| Charge to IPD subtitle | — | `chargeToIpdSub` | Not desk cash | ကောင်တာငွေ မဟုတ် | same button |
| History | F9 | `history` | History | မှတ်တမ်း | the desk form |
| Void Bills | Ctrl+F8 or Cmd+F8 (footer `^F8`) | `vDelete` | Void Bills | ဘေလ်ပယ်ဖျက် | the desk form |
| Cancel | F10 | `cancel` | Cancel | မလုပ်တော့ | the desk form |
| New bill | F2 | `newBill` | New bill | ဘေလ်အသစ် | the desk form |

The collect note under the totals, when the balance is still to be taken, is `markPaidCollects` (“Mark Paid collects this balance.” / “ပေးပြီးမှတ်သည် ဤလက်ကျန်ကို ကောက်ခံသည်။”). Pharmacy adds `pharmacyStockDeductedOnPay` (“Stock is deducted.” / “စတော့ လျှော့မည်။”). OT adds `otCupboardDeductedOnPay` (“OT inventory qty is deducted.” / “OT စာရင်း အရေအတွက် လျှော့မည်။”).

After Mark Paid the same F7 control shows `paid` (“Paid” / “ပေးပြီး”) and is disabled. A bill charged to a stay with no desk cash shows `chargedToIpdStatus` (“Charged to IPD” / “IPD သို့ တင်ပြီး”) instead of Paid.

Save draft, Mark Paid, Charge to IPD, and New bill render only when that desk’s create action is allowed. Void Bills renders only when delete is allowed. Print, History, and Cancel stay on the rail.

### When Charge to IPD appears

It is not on the IPD screen. It is on OPD Bill, OT Bill, and Pharmacy Bill (sale only). There is no function key. F7 does not charge a stay.

The button is passed in only when the bill is still a draft **and** the linked chart has an open stay (`useOpenAdmission` in `client/src/features/patients/useOpenAdmission.ts`):

- OPD: `client/src/pages/opd/OpdPage.tsx`
- OT: `client/src/pages/ot/OtPage.tsx`
- Pharmacy sale: `client/src/pages/pharmacy/PharmacyBillingPage.tsx`

Choosing a chart sets the linked chart id. Typing a name clears it (`onPatientName` sets the link to null on OPD, OT, and pharmacy). A typed walk-in name never shows the button. Expense bills and Transfer to OT never show it.

Charge to IPD locks the bill onto that open stay. It is not desk cash. The stay ledger gets the charge. Pharmacy sale still deducts MAIN stock. OT Bill still deducts cupboard quantity.

### Void

Ctrl+F8 or Cmd+F8 opens the history dialog in delete mode. The reason field must not be empty (`voidReasonRequired`, “Required to void” / “ပယ်ဖျက်ရန် လိုအပ်သည်”). The dialog confirm button says Delete, not Void bill. OPD’s reason box starts as the English word “Deleted”. Pharmacy, OT, and expense start as “Voided”.

Void of a paid pharmacy sale restores MAIN quantity. Void of a paid OT bill restores cupboard quantity (`restoreOtBillStock` in `server/internal/handlers/ot_stock.go`). Void of a paid return removes the quantity that return had put back. Void of a confirmed transfer reverses the stock move. A bill that was charged to a stay can be voided only while that stay is still open.

## Pharmacy: sale, return, and transfer

One form, `client/src/pages/pharmacy/PharmacyBillForm.tsx`, driven by `PharmacyBillingPage.tsx`. F7 is a different label in each mode. The keys are handled in `PharmacyBillingPage.tsx`.

### Pharmacy Bill (sale)

View `pharmacy_billing`. Sidebar “Pharmacy Bill”.

F5 Save draft. F6 Print (still editable). F7 Mark Paid: desk cash, MAIN stock deducted earliest-expiry-first (`fefoDeductPharmacySale` in `server/internal/handlers/pharmacy_bills.go`), bill locked. Charge to IPD appears only for a linked chart with an open stay.

### Return in

View `pharmacy_return`. Sidebar `navReturnIn` (“Return in” / “ပြန်သွင်း”). This is not the OT cupboard return.

| Key | Label on the button |
|---|---|
| F5 | `saveDraft` — Save draft / မူကြမ်းသိမ်း |
| F6 | `print` — Print / ပရင့်. The slip stays editable. |
| F7 | `markReturned` — Mark returned / ပြန်သွင်းမှတ်. Subtitle `marksReturned` — “Credits stock · refunds cash” / “စတော့ပြန်ထည့် · ငွေပြန်အမ်း” |

Mark returned puts quantity back on MAIN and refunds cash on the day book, then locks the slip. The note is `markReturnedCollects` (“Mark returned refunds this balance.” / “ပြန်သွင်းမှတ်သည် ဤပမာဏကို ပြန်အမ်းသည်။”) plus `pharmacyStockCreditedOnReturn` (“Stock is put back.” / “စတော့ ပြန်ထည့်မည်။”).

New is `newReturn` (“New return” / “ပြန်သွင်းအသစ်”), still F2.

If the linked chart has an open stay and that stay has at least one charged pharmacy sale, the rail also shows `creditToIpd` (“Credit to IPD” / “IPD သို့ ပြန်ထည့်”), subtitle `creditToIpdSub` (“Credits the open stay” / “ဖွင့်ထားသော တက်ရောက်မှုသို့”), drawn with `BillChargeToIpdButton` but with those labels. No function key. It is not desk cash. When several charged sales exist, the field `returnAgainstSale` (“Charged sale” / “တင်ထားသော ဘောင်ချာ”) picks which one. Charge to IPD itself is not on Return in.

### Transfer to OT

View `pharmacy_transfer`. Sidebar `navTransferToOt` (“Transfer to OT” / “OT သို့ လွှဲ”). No cash.

F6 is swallowed and does nothing. The Print button is not on this rail.

| Press | Button | English | Myanmar | Subtitle |
|---|---|---|---|---|
| First F7 | `transferAction` | Transfer | လွှဲမည် | `transferCheckLines` — Check the lines / စာရင်းစစ်ပါ |
| Second F7 | `confirmTransfer` | Confirm transfer | လွှဲခြင်း အတည်ပြု | `movesToOtCupboard` — Moves stock to OT / OT သို့ စတော့ရောက်သည် |

The first press saves the slip and waits. The second press moves saleable MAIN stock into the OT cupboard. The note is `transferConfirmNote` before that, then `transferArmedNote` (“Check the lines, then confirm the transfer.” / “စာရင်းစစ်ပြီး လွှဲခြင်းကို အတည်ပြုပါ။”). Batch number and expiry are optional.

New is `newTransfer` (“New transfer” / “လွှဲစာရင်း အသစ်”), still F2. History lists transfer slips. A transfer number starts with `TO-` and cannot be attached to a chart.

### Pharmacy items (short)

Sidebar Maintenance opens view `pharmacy`. The item form section title is `packingSize` (“Packing Size” / “ထုပ်ပိုးအရွယ်”) in `client/src/pages/pharmacy/PharmacyItemForm.tsx`. The first field there is `smallestUnit` (“Smallest Unit” / “အသေးဆုံးယူနစ်”). Stock on hand is MAIN. Low stock is that MAIN quantity at or below the reorder level (`server/internal/handlers/pharmacy.go`). A code the sale desk does not know is not created on the bill. Restock posts onto an item that already exists, at MAIN. This screen does not capture F5, so F5 reloads the window. Do not use F5 as Save here. The packing rows under Smallest Unit are `packParent` (“Parent” / “မိဘ”), `packPacking` (“Packing” / “ထုပ်ပိုး”), and `packChildUnit` (“Child Unit” / “ကလေးယူနစ်”).

## OT stock (sidebar: Maintenance)

The OT sidebar item is **Maintenance** (`navOtCupboard`), view `ot`, `otMode: "stock"`. The page title is **Inventory** (`maintenanceInventory`, “Inventory” / “စာရင်း”) in `client/src/pages/ot/OtStockPage.tsx`. The hint is `otStockHint`: “OT inventory on hand. Return unused qty to pharmacy. A paid OT bill deducts this qty.” / “OT စာရင်း လက်ကျန်။ မသုံးသော အရေအတွက်ကို ဆေးဆိုင်သို့ ပြန်ပို့နိုင်သည်။ OT ဘေလ် ပေးချေလျှင် ဤလက်ကျန်မှ လျော့သည်။”

Quantity appears here after Confirm transfer. OT Bill Mark Paid deducts it (`fefoDeductOtSale`). Unused quantity goes back with `returnToPharmacy` (“Return to pharmacy” / “ဆေးဆိုင်သို့ ပြန်ပို့ရန်”) on this page. That is not Pharmacy Return in, and it is not Void Bills.

OT Bill itself uses the shared sale rail: F5 Save draft, F6 Print (still editable), F7 Mark Paid (desk cash, cupboard deducted, bill locked). Charge to IPD is on the OT bill when the chart has an open stay, not on this stock page.

## Patients and attach

A chart is the patient record (Patient Charts, view `patients`). A name typed on a bill is not a chart. Typing clears the link, so Charge to IPD disappears.

Attach is on the chart history, under `patientsAddBill` (“+Add Bill” / “+ဘေလ်ထည့်”), in `client/src/pages/patients/PatientsPage.tsx`. The field is `patientsAttachBill` (“Bill number” / “ဘေလ်နံပါတ်”). The button is `patientsAttach` (“Attach bill” / “ဘေလ် တွဲရန်”). The hint key `patientsAttachHint` is not shown.

The server (`server/internal/handlers/patients_attach.go`) sets the chart on one bill that does not have one yet. Totals, status, stock, and cash stay the same. It accepts `OPD-`, `PH-`, `RT-`, and `OTB-` numbers. A `TO-` slip is refused with `errCannotAttachTransfer` (“A transfer slip cannot be attached.” / “လွှဲစာရွက်ကို တွဲ၍မရပါ။”). Any other number is not found. OT stores the chart on the case, not on the bill row.

## IPD stay

Sidebar **Stays** (`navIpd`, “Stays” / “တက်ရောက်မှု”), view `ipd`, `client/src/pages/ipd/IpdPage.tsx`. No function keys are captured on this page. F5 reloads the window.

A stay is the inpatient account other desks can charge. One open stay per chart. A second Admit is refused with `errIpdAlreadyOpen` (“This patient already has an open stay.” / “ဤလူနာတွင် ဖွင့်ထားသော တက်ရောက်မှု ရှိပြီးဖြစ်သည်။”). Admit needs a chosen chart (`ipdAdmit`, “Admit” / “တက်ခွင့်”).

On an open stay the rail shows:

| Button | Key | English | Myanmar | Drawn in |
|---|---|---|---|---|
| Take deposit | `ipdTakeDeposit` | Take deposit | အပ်ငွေ လက်ခံ | `IpdPage.tsx` |
| Post ward charge | `ipdPostWard` | Post ward charge | ဝပ်ကြေး တင် | `IpdPage.tsx` |
| Save notes | `ipdSaveNotes` | Save notes | မှတ်ချက်သိမ်း | `IpdPage.tsx` |
| Discharge | `ipdDischarge` | Discharge | ဆင်းခွင့်ရှင်း | `IpdPage.tsx` |

No F-keys. Post ward charge is a description and an amount (room or nursing). It is not a drug and not an OPD service. Charge to IPD is not on this page. It is on OPD Bill, OT Bill, and Pharmacy Bill.

The list rail also has `ipdDailyCash` (“IPD daily cash” / “IPD နေ့စဉ်ငွေ”) and a toggle between `ipdSettledStays` (“Settled stays” / “ရှင်းပြီး တက်ရောက်မှု”) and `ipdOpenStays` (“Open stays” / “ဖွင့်ထား တက်ရောက်မှု”). An open stay can also print `ipdPrintDailyStatement` (“Print Daily Statement” / “နေ့စဉ်စာရင်းထုတ်”) and `ipdPrintStatement` (“Print Final Statement” / “နောက်ဆုံးစာရင်းထုတ်”), and return with `ipdBackToList` (“Stay list” / “တက်ရောက်စာရင်း”).

### Why discharge is final

Discharge asks first (`confirmIpdDischarge`: “Discharge this stay? The cash line is final.” / “ဤတက်ရောက်မှုကို ဆင်းခွင့်ရှင်းမည်လား။ ငွေစာကြောင်းသည် အပြီးဖြစ်သည်။”). The button subtitle is the settlement, from `settlementSub` in `IpdPage.tsx`:

- Positive balance (the hospital owes the patient): `ipdWillRefund` (“Refund the remainder” / “လက်ကျန်ကို ပြန်အမ်း”). The server writes a refund.
- Negative balance (the patient owes the hospital): `ipdWillCollect` (“Collect the amount owed” / “ပေးရန်ကျန်ကို ကောက်”). The server writes a collection.
- Zero: `ipdWillZero` (“No cash. Balance is zero” / “ငွေမထိ။ လက်ကျန် သုည”). The server writes no cash line.

`server/internal/handlers/ipd_discharge.go` then sets the stay to settled. Deposits, ward charges, and desk charges after that are refused because the stay is not open. The open-stay buttons are hidden. The success line is `ipdDischarged` (“Discharged. Balance is zero.” / “ဆင်းပြီး။ လက်ကျန် သုည။”).

## Expense bills

Each desk has an Expense bill (`navExpenseBill`): OPD `opd` with `opdScreen: "expense"`, OT `ot` with `otMode: "expense"`, pharmacy `pharmacy_expense`, IPD `ipd_expense`. The form is `client/src/pages/expenses/ExpenseBillPage.tsx`. It uses the same F5 Save draft, F6 Print (still editable), and F7 Mark Paid (desk cash, bill locked). There is no Charge to IPD and no stock movement.

## Training seed

Settings → Training is Admin-only (`client/src/pages/settings/TrainingTab.tsx`). The server runs it only when training is turned on (`MUDITA_ALLOW_TRAINING=1` in `server/internal/config/config.go`). Otherwise the screen says `trainingOff`.

`seedTraining` (“Seed training data” / “လေ့ကျင့်ဒေတာ ထည့်ရန်”) creates `DEMO-` items, the doctor “Dr Demo [TRAINING]”, the service `DEMO-DRESS`, and one paid OPD bill plus one paid pharmacy bill named “Training Patient [TRAINING]” for today if those bills are not already there (`server/internal/handlers/demo.go`). Those bills store a typed name. They do not create a patient chart and they do not create an IPD stay.

Reset (`resetTraining`, “Reset & re-seed training” / “ပြန်သန့်ပြီး ထပ်ထည့်”) removes `DEMO-` items, the `DEMO-` service, the training doctor, and `[TRAINING]` bills and cases, then seeds again. Rows outside those tags are kept. This is not a desk step. Do not tell staff to press Seed.

## Retired words

These are not current actions. Do not teach them. Some still exist as unused i18n keys or in older documents.

| Retired | Why it is wrong now |
|---|---|
| Pay & print | Unused key `payAndPrint`. The cash button is Mark Paid (F7). Print is F6 and does not take cash. |
| Confirm (F5) | F5 is Save draft. It does not confirm payment. |
| Print (F7) marks paid | F7 is Mark Paid. F6 is Print and leaves the bill editable. |
| Return & print | Unused key `returnAndPrint`. Return in uses Mark returned (F7). Print is still F6 and does not complete the return. |
| Pay cash → Print | Mark Paid collects. Print does not. |
