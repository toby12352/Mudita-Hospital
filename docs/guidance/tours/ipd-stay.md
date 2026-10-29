# Tour: ipd-stay

- Id: ipd-stay
- Roles: Admin and IPD. Patients, OPD, OT, and Pharmacy do not open Stays.
- Depends on: patient-chart
- Opens: view `ipd`, NavIntent none. Sidebar Stays. Do not open view `ipd_expense`, a sale desk, or Patient Charts.
- Mode: point and explain. Clicks on the highlighted control stay off. This lesson does not tell staff to press Admit, Take deposit, or Post ward charge.
- Entry: Help, not automatic

The chart comes from patient-chart. This lesson does not create one. A stay is the inpatient account other desks can charge. This page does not capture function keys. F5 reloads the window. Charge to IPD is not on this page.

## Steps

### 1. admit
- Anchor to add later: data-guide="ipd-admit"
- Where the control is now: the list rail in `client/src/pages/ipd/IpdPage.tsx`, i18n `ipdAdmit`, drawn only when no stay is open. The chart box above the list is `PatientChartTypeahead` with label `patient`. Choosing a row sets the chart. Typing in that box clears it. An empty choice shows `errIpdPickPatient`. A second open stay is refused with `errIpdAlreadyOpen`. If a stay is already open on screen, this button is not drawn; skip this step.
- Placement: left
- Title EN: Admit
- Title MY: တက်ခွင့်
- Body EN: A stay is the inpatient account other desks can charge, and Admit (တက်ခွင့်) opens one stay after a Patient (လူနာ) chart is chosen; typing in that box clears the chart, Choose a patient chart first (လူနာမှတ်တမ်းကို အရင်ရွေးပါ။) shows if none is chosen, and a second Admit is refused with This patient already has an open stay (ဤလူနာတွင် ဖွင့်ထားသော တက်ရောက်မှု ရှိပြီးဖြစ်သည်။). Charge to IPD (IPD သို့ တင်) is on OPD Bill (OPD ဘေလ်), OT Bill (OT ဘေလ်), and Pharmacy Bill (ဆေးဆိုင် ဘေလ်); this lesson does not press Admit, and F5 reloads the window.
- Body MY: တက်ရောက်မှုသည် အခြားကောင်တာများ တင်နိုင်သော အတွင်းလူနာစာရင်းဖြစ်ပြီး Admit (တက်ခွင့်) သည် Patient (လူနာ) မှတ်တမ်း ရွေးပြီးမှ တက်ရောက်မှုတစ်ခု ဖွင့်သည်။ ထိုအကွက်ထဲ ရိုက်လျှင် မှတ်တမ်းပျောက်ပြီး မရွေးလျှင် Choose a patient chart first (လူနာမှတ်တမ်းကို အရင်ရွေးပါ။) ပြကာ ဒုတိယအကြိမ် Admit ကို This patient already has an open stay (ဤလူနာတွင် ဖွင့်ထားသော တက်ရောက်မှု ရှိပြီးဖြစ်သည်။) ဖြင့် ငြင်းသည်။ Charge to IPD (IPD သို့ တင်) သည် OPD Bill (OPD ဘေလ်)၊ OT Bill (OT ဘေလ်)၊ Pharmacy Bill (ဆေးဆိုင် ဘေလ်) ပေါ်တွင် ရှိပြီး ဤသင်ခန်းစာတွင် Admit ကို မနှိပ်ရဘဲ F5 သည် ဝင်းဒိုးကို ပြန်ဖွင့်သည်။
- Must not press: Admit, F5
- If the control is missing: skip this step

### 2. take-deposit
- Anchor to add later: data-guide="ipd-take-deposit"
- Where the control is now: the open-stay rail in `client/src/pages/ipd/IpdPage.tsx`, i18n `ipdTakeDeposit`. Drawn only while `stay.status` is open. The amount and note fields sit under `ipdDeposit`. The button stays disabled until the amount is greater than zero. If the list rail is showing, or the stay is settled, skip this step.
- Placement: left
- Title EN: Take deposit
- Title MY: အပ်ငွေ လက်ခံ
- Body EN: Take deposit (အပ်ငွေ လက်ခံ) posts a Deposit (အပ်ငွေ) on this open stay. It is separate from Mark Paid (ပေးပြီးမှတ်) desk cash, and it is separate from a drug; this lesson does not press Take deposit.
- Body MY: Take deposit (အပ်ငွေ လက်ခံ) သည် ဤဖွင့်ထားသော တက်ရောက်မှုပေါ်တွင် Deposit (အပ်ငွေ) တင်သည်။ Mark Paid (ပေးပြီးမှတ်) ကောင်တာငွေနှင့်လည်း ဆေးနှင့်လည်း သီးခြားဖြစ်ပြီး ဤသင်ခန်းစာတွင် Take deposit ကို မနှိပ်ရ။
- Must not press: Take deposit
- If the control is missing: skip this step

### 3. ward-charge
- Anchor to add later: data-guide="ipd-ward-charge"
- Where the control is now: the open-stay rail in `client/src/pages/ipd/IpdPage.tsx`, i18n `ipdPostWard`. Drawn only while `stay.status` is open. The description and amount fields sit under `ipdWardCharge`. The button stays disabled until both are filled, and a zero amount is refused with `errIpdAmount` (“Enter an amount greater than zero.” / “သုညထက်ကြီးသော ပမာဏ ထည့်ပါ။”). An empty description is refused with `errIpdDescription` (“Enter a ward charge description.” / “ဝပ်ကြေး ဖော်ပြချက် ထည့်ပါ။”). If the list rail is showing, or the stay is settled, skip this step.
- Placement: left
- Title EN: Post ward charge
- Title MY: ဝပ်ကြေး တင်
- Body EN: Post ward charge (ဝပ်ကြေး တင်) posts a Ward charge (ဝပ်ကြေး) with a Description (ဖော်ပြချက်) and an Amount (ပမာဏ), for room or nursing. It is separate from a drug and from an OPD service, and this lesson does not press Post ward charge.
- Body MY: Post ward charge (ဝပ်ကြေး တင်) သည် အခန်း သို့မဟုတ် သူနာပြုအတွက် Description (ဖော်ပြချက်) နှင့် Amount (ပမာဏ) ပါသော Ward charge (ဝပ်ကြေး) ကို တင်သည်။ ဆေးနှင့်လည်း OPD ဝန်ဆောင်မှုနှင့်လည်း သီးခြားဖြစ်ပြီး ဤသင်ခန်းစာတွင် Post ward charge ကို မနှိပ်ရ။
- Must not press: Post ward charge
- If the control is missing: skip this step

## Out of this tour
- Do not press Admit, Take deposit, or Post ward charge. Point at them only.
- Do not press Open (ဖွင့်မည်) on a real stay in order to reach Take deposit or Post ward charge. If those buttons are missing, skip the step.
- Do not press Discharge (ဆင်းခွင့်ရှင်း). That lesson is ipd-discharge.
- Do not press Save notes (မှတ်ချက်သိမ်း), IPD daily cash (IPD နေ့စဉ်ငွေ), or the Open stays / Settled stays toggle as part of this lesson.
- Charge to IPD (IPD သို့ တင်) is on OPD Bill, OT Bill, and Pharmacy Bill. Do not press it here. It is not on this page.
- Do not void a bill, transfer stock, or seed training data.
