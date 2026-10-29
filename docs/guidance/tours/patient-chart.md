# Tour: patient-chart

- Id: patient-chart
- Roles: Admin and Patients. OPD, OT, Pharmacy, and IPD do not open Patient Charts.
- Depends on: none
- Opens: view `patients`. The create step uses NavIntent `patientsScreen: "create"`. Search and attach stay on `patientsScreen: "list"`. Do not open a bill desk, Stays, or Settings.
- Mode: point and explain. Clicks on the highlighted control stay off. This lesson does not tell staff to press Create or Attach bill.
- Entry: Help, not automatic

A chart is the patient record. A name typed on a bill is not a chart. This page does not capture function keys. F5 reloads the window.

## Steps

### 1. create
- Anchor to add later: data-guide="patient-create"
- Where the control is now: the form submit in `client/src/pages/patients/PatientsPage.tsx`, which renders `create` while creating and `save` while editing. The form title is `createNewPatientTitle`. The screen is opened from `client/src/app/AppNavBar.tsx`, item `navCreatePatient`, view `patients`, NavIntent `patientsScreen: "create"`. Shown only when that account may create charts. If the list is showing instead of the create form, skip this step.
- Placement: top
- Title EN: Create
- Title MY: ဖန်တီးမည်
- Body EN: Create New Patient (လူနာအသစ် ဖန်တီးရန်) opens Add new patient (လူနာအသစ် ထည့်ရန်), and Create (ဖန်တီးမည်) saves the chart. This lesson does not press Create, and F5 reloads the window.
- Body MY: Create New Patient (လူနာအသစ် ဖန်တီးရန်) သည် Add new patient (လူနာအသစ် ထည့်ရန်) ကို ဖွင့်ပြီး Create (ဖန်တီးမည်) သည် မှတ်တမ်းကို သိမ်းသည်။ ဤသင်ခန်းစာတွင် Create ကို မနှိပ်ရဘဲ F5 သည် ဝင်းဒိုးကို ပြန်ဖွင့်သည်။
- Must not press: Create, F5
- If the control is missing: skip this step

### 2. search
- Anchor to add later: data-guide="patient-search"
- Where the control is now: the list pane in `client/src/pages/patients/PatientsPage.tsx`. The heading renders `patients` (“Patients” / “လူနာ”). The sidebar item is `navPatients` (“Patient Charts” / “လူနာမှတ်တမ်း”). `CatalogFilterButton` in `client/src/shared/CatalogListFilter.tsx` renders `filter`. The search field label is `searchPatients` and the placeholder is `patientSearchPlaceholder`, passed into `CatalogFilterPanel`. The field is shown only while that panel is open. View `patients`, `patientsScreen: "list"`.
- Placement: bottom
- Title EN: Search charts
- Title MY: မှတ်တမ်း ရှာရန်
- Body EN: Search charts (မှတ်တမ်း ရှာရန်), under Filter (စစ်ထုတ်), finds a chart by Name, phone, NRC, or chart number (အမည်၊ ဖုန်း၊ NRC သို့မဟုတ် မှတ်တမ်းနံပါတ်). A Patient name (လူနာအမည် *) typed on a bill is not a chart.
- Body MY: Search charts (မှတ်တမ်း ရှာရန်) သည် Filter (စစ်ထုတ်) အောက်တွင် ရှိပြီး Name, phone, NRC, or chart number (အမည်၊ ဖုန်း၊ NRC သို့မဟုတ် မှတ်တမ်းနံပါတ်) ဖြင့် မှတ်တမ်းကို ရှာသည်။ ဘေလ်ပေါ်တွင် ရိုက်ထားသော Patient name (လူနာအမည် *) သည် မှတ်တမ်းမဟုတ်ပါ။
- Must not press: Search charts
- If the control is missing: skip this step

### 3. attach
- Anchor to add later: data-guide="patient-attach"
- Where the control is now: the History tab on the chart detail pane in `client/src/pages/patients/PatientsPage.tsx`, beside `patientsAllBills`. The `patientsAddBill` control is shown only when that tab is open and update is allowed. Choosing it shows the field `patientsAttachBill` and the button `patientsAttach`. The unused key `patientsAttachHint` is not rendered. A chart must be selected. If +Add Bill is not showing, skip this step.
- Placement: top
- Title EN: Attach bill
- Title MY: ဘေလ် တွဲရန်
- Body EN: +Add Bill (+ဘေလ်ထည့်) shows Bill number (ဘေလ်နံပါတ်). Attach bill (ဘေလ် တွဲရန်) sets the chart on one bill that has none yet; totals, status, stock, and cash stay the same. This lesson does not press Attach bill.
- Body MY: +Add Bill (+ဘေလ်ထည့်) သည် Bill number (ဘေလ်နံပါတ်) ကို ပြသည်။ Attach bill (ဘေလ် တွဲရန်) သည် မှတ်တမ်းမရှိသေးသော ဘေလ်တစ်စောင်ပေါ်တွင် မှတ်တမ်းကို တွဲပြီး စုစုပေါင်း၊ အခြေအနေ၊ စတော့၊ ငွေတို့ မပြောင်းပါ။ ဤသင်ခန်းစာတွင် Attach bill ကို မနှိပ်ရ။
- Must not press: Attach bill, +Add Bill
- If the control is missing: skip this step

### 4. transfer-slip
- Anchor to add later: data-guide="patient-attach"
- Where the control is now: the same Attach bill button as the previous step, `patientsAttach` in `client/src/pages/patients/PatientsPage.tsx`. The refusal strings are `errCannotAttachTransfer` and `errBillAlreadyLinked` in `client/src/shared/errors.ts`.
- Placement: top
- Title EN: A transfer slip cannot be attached
- Title MY: လွှဲစာရွက်ကို တွဲ၍မရပါ။
- Body EN: A number that starts with TO- is refused with A transfer slip cannot be attached (လွှဲစာရွက်ကို တွဲ၍မရပါ။). OPD-, PH-, RT-, and OTB- can be attached only when that bill has no chart yet; That bill is already on a chart (ဤဘေလ်သည် ဇယားတွင် ရှိပြီးပါပြီ။) refuses one that already has a chart, and any other number is not found. This lesson does not press Attach bill.
- Body MY: TO- ဖြင့် စသောနံပါတ်ကို A transfer slip cannot be attached (လွှဲစာရွက်ကို တွဲ၍မရပါ။) ဖြင့် ငြင်းသည်။ OPD-၊ PH-၊ RT-၊ OTB- တို့ကို ထိုဘေလ်၌ မှတ်တမ်းမရှိသေးမှသာ တွဲနိုင်ပြီး ရှိပြီးသားကို That bill is already on a chart (ဤဘေလ်သည် ဇယားတွင် ရှိပြီးပါပြီ။) ဖြင့် ငြင်းကာ အခြားနံပါတ်ကို မတွေ့ပါ။ ဤသင်ခန်းစာတွင် Attach bill ကို မနှိပ်ရ။
- Must not press: Attach bill
- If the control is missing: skip this step

## Out of this tour
- Do not press Create. Do not save a new chart during the lesson.
- Do not press Attach bill, and do not type a live bill number in order to attach it.
- Do not edit or delete a chart.
- Do not admit, take a deposit, post a ward charge, or discharge. Those belong to ipd-stay and ipd-discharge.
- Do not press Mark Paid, Charge to IPD, or Seed training data.
