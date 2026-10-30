# Tour: ipd-stay

- Id: ipd-stay
- Roles: Admin and IPD. Patients, OPD, OT, and Pharmacy do not open Stays.
- Depends on: patient-chart
- Opens: view `ipd`, NavIntent none. Sidebar Stays. Do not open view `ipd_expense`, a sale desk, or Patient Charts.
- Mode: point and explain. Clicks on the highlighted control stay off. This lesson does not tell staff to press Admit, Take deposit, or IPD Bill.
- Entry: Help, not automatic

The chart comes from patient-chart. This lesson does not create one. A stay is the inpatient account other desks can charge. This page does not capture function keys. F5 reloads the window. Room and nursing charges are on IPD Bill. F7 does not charge the stay.

## Steps

### 1. admit
- Anchor to add later: data-guide="ipd-admit"
- Where the control is now: the list rail in `client/src/pages/ipd/IpdPage.tsx`, i18n `ipdAdmit`, drawn only when no stay is open. The chart box above the list is `PatientChartTypeahead` with label `patient`. Choosing a row sets the chart. Typing in that box clears it. An empty choice shows `errIpdPickPatient`. A second open stay is refused with `errIpdAlreadyOpen`. If a stay is already open on screen, this button is not drawn; skip this step.
- Placement: left
- Title EN: Admit
- Title MY: တက်ခွင့်
- Body EN: A stay is the inpatient account other desks can charge, and Admit (တက်ခွင့်) opens one stay after a Patient (လူနာ) chart is chosen; typing in that box clears the chart, Choose a patient chart first (လူနာမှတ်တမ်းကို အရင်ရွေးပါ။) shows if none is chosen, and a second Admit is refused with This patient already has an open stay (ဤလူနာတွင် ဖွင့်ထားသော တက်ရောက်မှု ရှိပြီးဖြစ်သည်။). Charge to IPD (IPD သို့ တင်) is on IPD Bill (IPD ဘေလ်), OPD Bill (OPD ဘေလ်), OT Bill (OT ဘေလ်), and Pharmacy Bill (ဆေးဆိုင် ဘေလ်). F7 does not charge the stay. This lesson does not press Admit, and F5 reloads the window.
- Body MY: တက်ရောက်မှုသည် အခြားကောင်တာများ တင်နိုင်သော အတွင်းလူနာစာရင်းဖြစ်ပြီး Admit (တက်ခွင့်) သည် Patient (လူနာ) မှတ်တမ်း ရွေးပြီးမှ တက်ရောက်မှုတစ်ခု ဖွင့်သည်။ ထိုအကွက်ထဲ ရိုက်လျှင် မှတ်တမ်းပျောက်ပြီး မရွေးလျှင် Choose a patient chart first (လူနာမှတ်တမ်းကို အရင်ရွေးပါ။) ပြကာ ဒုတိယအကြိမ် Admit ကို This patient already has an open stay (ဤလူနာတွင် ဖွင့်ထားသော တက်ရောက်မှု ရှိပြီးဖြစ်သည်။) ဖြင့် ငြင်းသည်။ Charge to IPD (IPD သို့ တင်) သည် IPD Bill (IPD ဘေလ်)၊ OPD Bill (OPD ဘေလ်)၊ OT Bill (OT ဘေလ်)၊ Pharmacy Bill (ဆေးဆိုင် ဘေလ်) ပေါ်တွင် ရှိသည်။ F7 သည် တက်ရောက်မှုသို့ မတင်ပါ။ ဤသင်ခန်းစာတွင် Admit ကို မနှိပ်ရဘဲ F5 သည် ဝင်းဒိုးကို ပြန်ဖွင့်သည်။
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

### 3. ipd-bill
- Anchor: data-guide="ipd-bill"
- Where the control is now: the sidebar button in `client/src/app/AppNavBar.tsx`, i18n `navIpdBill`. On an IPD login it sits next to Stays. On Admin it sits under the IPD group, which is open while Stays is showing. This lesson stays on view `ipd` and does not open view `ipd_bill`. If the sidebar button is not in the page, skip this step.
- Placement: right
- Title EN: IPD Bill
- Title MY: IPD ဘေလ်
- Body EN: Room and nursing charges are posted on IPD Bill (IPD ဘေလ်), not on Stays (တက်ရောက်မှု). The first button is Charge to IPD (IPD သို့ တင်), subtitle Not desk cash (ကောင်တာငွေ မဟုတ်), and it has no function key. F7 does not charge the stay, and IPD Bill has no Mark Paid (ပေးပြီးမှတ်). The button stays hidden until the chart has an open stay; a name that is not a chart shows Admit this patient first (ဤလူနာကို အရင် တက်ခွင့်ပေးပါ။). This lesson does not press IPD Bill.
- Body MY: အခန်းနှင့် သူနာပြုကြေးကို Stays (တက်ရောက်မှု) ပေါ်တွင် မတင်ဘဲ IPD Bill (IPD ဘေလ်) တွင် တင်သည်။ ပထမခလုတ်သည် Charge to IPD (IPD သို့ တင်) ဖြစ်ပြီး ခေါင်းစဉ်ခွဲသည် Not desk cash (ကောင်တာငွေ မဟုတ်) ဖြစ်ကာ ဖန်ရှင်ကီးမရှိပါ။ F7 သည် တက်ရောက်မှုသို့ မတင်ဘဲ IPD Bill တွင် Mark Paid (ပေးပြီးမှတ်) မရှိပါ။ မှတ်တမ်း၌ ဖွင့်ထားသော တက်ရောက်မှုမရှိလျှင် ခလုတ်ပျောက်ပြီး မှတ်တမ်းမဟုတ်သော အမည်တွင် Admit this patient first (ဤလူနာကို အရင် တက်ခွင့်ပေးပါ။) ပြသည်။ ဤသင်ခန်းစာတွင် IPD Bill ကို မနှိပ်ရ။
- Must not press: IPD Bill, Charge to IPD, F7
- If the control is missing: skip this step

## Out of this tour
- Do not press Admit, Take deposit, or IPD Bill. Point at them only.
- Do not press Open (ဖွင့်မည်) on a real stay in order to reach Take deposit. If that button is missing, skip the step.
- Do not press Discharge (ဆင်းခွင့်ရှင်း). That lesson is ipd-discharge.
- Do not press Save notes (မှတ်ချက်သိမ်း), Print Daily Statement (နေ့စဉ်စာရင်းထုတ်), Pay this day (ဤနေ့ ပေးမည်), Pay later (နောက်မှ ပေးမည်), Mark unpaid (ပေးထားမှု ပြန်ဖြုတ်), IPD daily cash (IPD နေ့စဉ်ငွေ), or the Open stays / Settled stays toggle as part of this lesson.
- Charge to IPD (IPD သို့ တင်) on a sale is on OPD Bill, OT Bill, and Pharmacy Bill. On IPD Bill it is the first button. Do not press it. F7 does not charge the stay.
- Do not void a bill, transfer stock, or seed training data.
