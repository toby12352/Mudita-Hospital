# Tour: pharmacy-item

- Id: pharmacy-item
- Roles: Admin and Pharmacy. OPD, OT, Patients, and IPD do not open Drug Setup.
- Depends on: none
- Opens: view `pharmacy`. The packing steps use NavIntent `pharmacyScreen: "form"` so Create New Item is on screen. The restock steps use NavIntent `pharmacyScreen: "browse"` with the create form closed and an item selected. Do not open Pharmacy Bill (`pharmacy_billing`), Return in (`pharmacy_return`), or Transfer to OT (`pharmacy_transfer`).
- Mode: point and explain. Clicks on the highlighted control stay off. This lesson does not tell staff to press Create, Save, Restock, or F5.
- Entry: Help, not automatic

Sidebar Maintenance (`navMaintenance`, “Maintenance” / “ထိန်းသိမ်းရေး”) opens Drug Setup (`drugSetup`, “Drug Setup” / “ဆေး စနစ်ထည့်”). Stock on hand is MAIN, shown as In Stock. A larger sale unit multiplies into the smallest unit. Drug Setup does not capture F5. F5 reloads the window. Save on this screen is the form button Save (`save`, “Save” / “သိမ်းမည်”) or Create (`create`, “Create” / “ဖန်တီးမည်”). This lesson must never tell staff to press F5 here.

## Steps

### 1. packing-rows
- Anchor to add later: data-guide="pharmacy-pack"
- Where the control is now: the Packing Size section in `client/src/pages/pharmacy/PharmacyItemForm.tsx`, `titleId="pharmacy-item-packing"`, title `packingSize`. The first field is `smallestUnit`. A new item starts that select at Tablet (`packUnitTablet`). Under it, `role="table"` has column headers `packParent`, `packPacking`, and `packChildUnit`. Each row is a parent select, a packing count (placeholder `0`), a child select, and, on the last filled row only, a × button whose label is `packRemoveRelation`. A new form starts with one blank row. A completed row (parent, packing at least 1, and child) keeps a blank row under it, up to five rows. From the second row, Parent is locked to the previous row’s Child Unit. The last child must equal Smallest Unit or the form shows `packChildMustMatch`. A create with no completed row shows `packRequired`. The preview under the table is English unit names in the form `1 Box = 10 Tablet`, with further rows joined by ` · `. The select options are translated (`packUnitBox`, `packUnitTablet`, and the other `packUnit*` keys). The preview is not. The form is on screen for `createNewItemTitle` (opened by `newBadge`, “NEW” / “အသစ်”, or by `pharmacyScreen: "form"`) and for `editItemTitle` (Edit, or double-click). If that form is not open, skip this step.
- Placement: bottom
- Title EN: Packing Size
- Title MY: ထုပ်ပိုးအရွယ်
- Body EN: Packing Size (ထုပ်ပိုးအရွယ်) starts with Smallest Unit (အသေးဆုံးယူနစ်), then rows headed Parent (မိဘ), Packing (ထုပ်ပိုး), and Child Unit (ကလေးယူနစ်). Stock is counted in the smallest unit, a larger unit multiplies, and the last child must match the smallest unit. Do not press F5. Drug Setup (ဆေး စနစ်ထည့်) does not use F5, and F5 reloads the window.
- Body MY: Packing Size (ထုပ်ပိုးအရွယ်) သည် Smallest Unit (အသေးဆုံးယူနစ်) ဖြင့် စပြီး အတန်းခေါင်းစီးများသည် Parent (မိဘ)၊ Packing (ထုပ်ပိုး)၊ Child Unit (ကလေးယူနစ်) ဖြစ်သည်။ စတော့ကို အသေးဆုံးယူနစ်ဖြင့် ရေတွက်ပြီး ပိုကြီးသောယူနစ်သည် မြှောက်ကာ နောက်ဆုံးကလေးယူနစ်သည် အသေးဆုံးယူနစ်နှင့် တူရမည်။ F5 ကို မနှိပ်ရ။ Drug Setup (ဆေး စနစ်ထည့်) သည် F5 ကို မသုံးဘဲ F5 သည် ဝင်းဒိုးကို ပြန်ဖွင့်သည်။
- Must not press: F5, Create, Save, NEW, Edit, Remove relation
- If the control is missing: skip this step

### 2. create-stock
- Anchor to add later: data-guide="pharmacy-pack"
- Where the control is now: the same item form, only while `editing` is null and the title is `createNewItemTitle`. Identity, above packing, is `identity` with `idCode`, `name`, and `dosage`. Under the packing table, create also shows `batchNumber` and `expiry`. The next section is `initialStock` with hint `initialStockDesc`, then `quantityOfUnit` and a unit select (`restockUnit`, empty option `chooseUnit`). When both are set, the hint is `willAdd`, the count times that unit’s factor, the smallest-unit name, and `toInStock`. That quantity is MAIN. `pricing` is `PharmacyPriceGrid`: one row per visible pack unit, headers `purPrice`, a `%` column (`priceMarkupPercent`), and `salePrice`. The hints are `priceMarkupHint` and `pricePayableHint`. Create without a purchase price and a sale price shows `pricesRequired`. The unused keys `buyPricePerBox` and `sellPricePerTablet` are not on this grid. The footer is `create` and `cancel`. `active` is the checkbox. A duplicate code shows `errItemCodeExists`. If the title is Edit item, or the form is closed, skip this step.
- Placement: bottom
- Title EN: Initial stock (optional)
- Title MY: ကနဦးစတော့ (ရွေးချယ်)
- Body EN: Initial stock (optional) (ကနဦးစတော့ (ရွေးချယ်)) can be left empty — Skip if you will restock later (နောက်မှ စတော့ဖြည့်မည်ဆိုလျှင် ကျော်ပါ). Quantity (အရေအတွက်) times Unit (ယူနစ်) is what Will add (ထည့်မည်) to In Stock (လက်ကျန်သို့), and that stock is MAIN. Create (ဖန်တီးမည်) saves the item. Do not press Create, and do not press F5.
- Body MY: Initial stock (optional) (ကနဦးစတော့ (ရွေးချယ်)) ကို ဗလာထားနိုင်သည် — Skip if you will restock later (နောက်မှ စတော့ဖြည့်မည်ဆိုလျှင် ကျော်ပါ)။ Quantity (အရေအတွက်) ကို Unit (ယူနစ်) နှင့် မြှောက်ထားသည်မှာ Will add (ထည့်မည်) to In Stock (လက်ကျန်သို့) ဖြစ်ပြီး ထိုစတော့သည် MAIN ဖြစ်သည်။ Create (ဖန်တီးမည်) သည် ပစ္စည်းကို သိမ်းသည်။ Create ကို မနှိပ်ရဘဲ F5 ကိုလည်း မနှိပ်ရ။
- Must not press: Create, F5, Cancel
- If the control is missing: skip this step

### 3. edit-item
- Anchor to add later: data-guide="pharmacy-pack"
- Where the control is now: the same item form while `editing` is set. The heading is `editItemTitle` plus the code. `idCode` is disabled. Batch number and Expiry under the packing table, and the Initial stock section, are not drawn. `PharmacyItemLots` shows `inStock` from `stock_main` (MAIN), then columns `batchNumber`, `qty`, and `expiry`. An empty lot list says `noBatchesYet`. A MAIN lot line prefixes the English words In Stock from `formatLocationLabel`, not the translated `inStock` label. The footer button is `save`, not `saveDraft`. `backItems` returns to the list. If the title is not Edit item, skip this step.
- Placement: bottom
- Title EN: Save
- Title MY: သိမ်းမည်
- Body EN: Edit item (ပစ္စည်းပြင်) locks ID/Code (ID/ကုဒ်) and shows In Stock (လက်ကျန်) with Batch number (အသုတ်နံပါတ်), Qty (အရေအတွက်), and Expiry (သက်တမ်းကုန်) instead of initial stock. Save (သိမ်းမည်) stores the edit. F5 is not Save, and F5 reloads the window. Do not press Save or F5.
- Body MY: Edit item (ပစ္စည်းပြင်) သည် ID/Code (ID/ကုဒ်) ကို ပိတ်ပြီး ကနဦးစတော့အစား In Stock (လက်ကျန်) နှင့် Batch number (အသုတ်နံပါတ်)၊ Qty (အရေအတွက်)၊ Expiry (သက်တမ်းကုန်) ကို ပြသည်။ Save (သိမ်းမည်) သည် ပြင်ဆင်ချက်ကို သိမ်းသည်။ F5 သည် Save မဟုတ်ဘဲ F5 သည် ဝင်းဒိုးကို ပြန်ဖွင့်သည်။ Save သို့မဟုတ် F5 ကို မနှိပ်ရ။
- Must not press: Save, F5, ← Items
- If the control is missing: skip this step

### 4. restock
- Anchor to add later: data-guide="pharmacy-restock"
- Where the control is now: the Restock button in the Drug Info action row of `client/src/pages/pharmacy/PharmacyItemsTab.tsx` (`embedDetail`), label `restock`. It opens the overlay titled `restock`, the item code, and `inStock` with `stock_main`. The form fields are `quantity`, `restockUnit` (empty option `chooseUnit`), `batchNumber`, and `expiry`. The hint is `willAdd`, the count times the unit factor, the smallest-unit name, and `toInStock`. Submit is `restock` again. That post goes onto an item that already exists, at MAIN. Below it, when adjust is allowed, `adminAdjust` and `applyAdjustment` are a different action. If Drug Info is not showing, or Restock is not drawn, skip this step.
- Placement: left
- Title EN: Restock
- Title MY: စတော့ဖြည့်
- Body EN: Restock (စတော့ဖြည့်) adds Quantity (အရေအတွက်) in a chosen Unit (ယူနစ်) to an item that already exists, and Will add (ထည့်မည်) that count to In Stock (လက်ကျန်သို့), which is MAIN. It does not create a new code. Do not press Restock, and do not press F5.
- Body MY: Restock (စတော့ဖြည့်) သည် ရှိပြီးသားပစ္စည်းပေါ်သို့ ရွေးထားသော Unit (ယူနစ်) ဖြင့် Quantity (အရေအတွက်) ထည့်ပြီး Will add (ထည့်မည်) သည် ထိုအရေအတွက်ကို to In Stock (လက်ကျန်သို့) ထည့်သည်။ ထိုလက်ကျန်သည် MAIN ဖြစ်သည်။ ကုဒ်အသစ် မဖန်တီးပါ။ Restock ကို မနှိပ်ရဘဲ F5 ကိုလည်း မနှိပ်ရ။
- Must not press: Restock, F5, Admin adjust, Apply adjustment
- If the control is missing: skip this step

### 5. main-only
- Anchor to add later: data-guide="pharmacy-restock"
- Where the control is now: the same Restock button. On Pharmacy Bill, `lookupItem` in `client/src/pages/pharmacy/PharmacyBillingPage.tsx` sets the English sentence `Unknown code` plus the typed code when the code is missing or inactive, and it does not create an item. That sentence is not an i18n key. Low stock is `stock_main` at or below `reorder_level` (`server/internal/handlers/pharmacy.go`); the flag text, where a search row shows it, is `lowStockLabel`. Near expiry lists batches with `location_code` MAIN (`server/internal/handlers/reports.go`). The report names are `reportLowStock` and `reportNearExpiry`. The Drug Setup list columns are `code`, `drugNameTrade`, and `active`. They do not show the low-stock word. OT on hand is not included.
- Placement: left
- Title EN: In Stock
- Title MY: လက်ကျန်
- Body EN: A code Pharmacy Bill (ဆေးဆိုင် ဘေလ်) does not know shows the English words Unknown code and is not created on the bill, so create it here before Restock (စတော့ဖြည့်). The flag low stock (စတော့နည်း) means MAIN In Stock (လက်ကျန်) is at or below Reorder level (ပြန်မှာအဆင့်). Near expiry (သက်တမ်းနီး) is MAIN batches only, not OT on hand (OT လက်ကျန်). Do not press Restock or F5.
- Body MY: Pharmacy Bill (ဆေးဆိုင် ဘေလ်) မသိသော ကုဒ်သည် အင်္ဂလိပ်စာ Unknown code ကို ပြပြီး ဘေလ်ပေါ်တွင် မဖန်တီးသဖြင့် Restock (စတော့ဖြည့်) မတိုင်မီ ဤနေရာတွင် ဖန်တီးရသည်။ low stock (စတော့နည်း) အမှတ်အသားဆိုသည်မှာ MAIN In Stock (လက်ကျန်) သည် Reorder level (ပြန်မှာအဆင့်) နှင့် တူသည် သို့မဟုတ် ၎င်းအောက်ရောက်သည်ဟု ဆိုလိုသည်။ Near expiry (သက်တမ်းနီး) သည် MAIN အသုတ်များသာ ဖြစ်ပြီး OT on hand (OT လက်ကျန်) မပါဝင်ပါ။ Restock သို့မဟုတ် F5 ကို မနှိပ်ရ။
- Must not press: Restock, F5
- If the control is missing: skip this step

## Out of this tour
- Do not press F5 on Drug Setup. It reloads the window. It does not save.
- Do not press NEW, Edit, Create, Save, Restock, Remove relation, Delete, or Deactivate.
- Do not press Admin adjust or Apply adjustment. Do not change the Active checkbox.
- Do not type an unknown code on Pharmacy Bill and expect an item to appear.
- Do not press Mark Paid, Mark returned, Transfer, or Confirm transfer.
- Do not seed training data.
