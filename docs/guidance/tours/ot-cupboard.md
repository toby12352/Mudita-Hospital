# Tour: ot-cupboard

- Id: ot-cupboard
- Roles: Admin and OT. Pharmacy, OPD, Patients, and IPD do not open this OT Maintenance screen.
- Depends on: pharmacy-transfer
- Opens: view `ot`, NavIntent `otMode: "stock"`. Sidebar Maintenance. Do not open OT Bill (`ot` with `otMode: "case"`), the OT expense bill (`otMode: "expense"`), Pharmacy Return in (`pharmacy_return`), or Transfer to OT (`pharmacy_transfer`).
- Mode: point and explain. Clicks on the highlighted control stay off. This lesson does not tell staff to press Return to pharmacy, and it does not run a transfer.
- Entry: Help, not automatic

The OT sidebar item is Maintenance (`navOtCupboard`, “Maintenance” / “ထိန်းသိမ်းရေး”). The page title is Inventory. Quantity shows here after Confirm transfer. A paid OT bill deducts this OT inventory quantity. Unused quantity goes back from this page. That is not Pharmacy Return in, and it is not Void Bills. This lesson does not tell staff to press F5.

## Steps

### 1. cupboard
- Anchor to add later: data-guide="ot-cupboard"
- Where the control is now: the inventory list in `client/src/pages/ot/OtStockPage.tsx`. The section label is `maintenanceInventory`. The hint is `otStockHint`. The list label is `cupboardItems`. Columns are `code`, `drugNameTrade`, and `qty`. An empty list says `noOtStock`. Drug Info shows `otOnHand`. Rows appear after Confirm transfer (`confirmTransfer`) has moved saleable MAIN stock here. OT Bill Mark Paid deducts this quantity (`otCupboardDeductedOnPay` on the OT bill, not on this page). Charge to IPD is on the OT bill when the chart has an open stay, not here. The list is on screen even when it is empty.
- Placement: right
- Title EN: Inventory
- Title MY: စာရင်း
- Body EN: Inventory (စာရင်း) is OT on hand (OT လက်ကျန်) after Confirm transfer (လွှဲခြင်း အတည်ပြု). Mark Paid (ပေးပြီးမှတ်) on OT Bill (OT ဘေလ်) deducts this quantity. An empty list says No OT stock yet (OT လက်ကျန် မရှိသေး). This page does not take desk cash, and this lesson does not press F5.
- Body MY: Inventory (စာရင်း) သည် Confirm transfer (လွှဲခြင်း အတည်ပြု) ပြီးနောက် OT on hand (OT လက်ကျန်) ဖြစ်သည်။ OT Bill (OT ဘေလ်) ပေါ်ရှိ Mark Paid (ပေးပြီးမှတ်) သည် ဤအရေအတွက်ကို လျှော့သည်။ စာရင်းဗလာဖြစ်လျှင် No OT stock yet (OT လက်ကျန် မရှိသေး) ဟု ပြသည်။ ဤစာမျက်နှာသည် ကောင်တာငွေမကောက်ဘဲ ဤသင်ခန်းစာတွင် F5 ကို မနှိပ်ရ။
- Must not press: F5
- If the control is missing: skip this step

### 2. return-to-pharmacy
- Anchor to add later: data-guide="ot-return-pharmacy"
- Where the control is now: the per-batch submit button in `OtReturnFields` inside `client/src/pages/ot/OtStockPage.tsx`, label `returnToPharmacy`. Drawn when OT create is allowed, on each batch row beside `batchNumber`, `qty`, and `expiry`. The amount field is `qtyToReturn` and the unit select uses `chooseUnit` (`restockUnit`). A quantity above that batch shows `qtyExceedsOt`. A completed return reports `returnedToPharmacy`, then `otOnHand` and `inStock`. The handler is `returnOtStock`. It is not `markReturned` on Pharmacy Return in, and it is not `vDelete`. If no batch row shows the button, skip this step.
- Placement: left
- Title EN: Return to pharmacy
- Title MY: ဆေးဆိုင်သို့ ပြန်ပို့ရန်
- Body EN: Return to pharmacy (ဆေးဆိုင်သို့ ပြန်ပို့ရန်) sends unused quantity from this OT batch back to pharmacy In Stock (လက်ကျန်). It is not Mark returned (ပြန်သွင်းမှတ်) on Return in (ပြန်သွင်း), and it is not Void Bills (ဘေလ်ပယ်ဖျက်). This lesson does not press Return to pharmacy.
- Body MY: Return to pharmacy (ဆေးဆိုင်သို့ ပြန်ပို့ရန်) သည် ဤ OT အသုတ်မှ မသုံးသော အရေအတွက်ကို ဆေးဆိုင် In Stock (လက်ကျန်) သို့ ပြန်ပို့သည်။ ၎င်းသည် Return in (ပြန်သွင်း) ပေါ်ရှိ Mark returned (ပြန်သွင်းမှတ်) မဟုတ်၊ Void Bills (ဘေလ်ပယ်ဖျက်) လည်း မဟုတ်ပါ။ ဤသင်ခန်းစာတွင် Return to pharmacy ကို မနှိပ်ရ။
- Must not press: Return to pharmacy, F5
- If the control is missing: skip this step

## Out of this tour
- Do not press Return to pharmacy. Point at it only.
- Do not press Transfer or Confirm transfer. Those are the pharmacy lesson that fills this list.
- Do not press Mark Paid or Charge to IPD. Those are on OT Bill, not on this stock page.
- Do not open Pharmacy Return in. Mark returned is a different lesson.
- Do not press Void Bills, and do not seed training data.
