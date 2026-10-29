# Tour: ipd-discharge

- Id: ipd-discharge
- Roles: Admin and IPD. Patients, OPD, OT, Pharmacy do not open Stays.
- Depends on: ipd-stay
- Opens: view `ipd`, with an open stay already on screen. NavIntent none. Do not open view `ipd_expense`. If Discharge is not on screen, skip every step. Do not open a stay in order to discharge it.
- Mode: point and explain. Clicks on the highlighted control stay off. This lesson does not tell the reader to press Discharge on a real stay.
- Entry: Help, not automatic

Discharge is its own lesson because it is final. Read the cash line on the button, then look at the button. Do not press it. This page does not capture function keys. F5 reloads the window. The unused key `ipdBalanceHint` is not rendered. The subtitle on the button is the settlement.

## Steps

### 1. cash-line
- Anchor to add later: data-guide="ipd-discharge"
- Where the control is now: the subtitle on the Discharge button in `client/src/pages/ipd/IpdPage.tsx`, from `settlementSub`. Positive `balance_mmk` renders `ipdWillRefund`, negative renders `ipdWillCollect`, and zero renders `ipdWillZero`. The balance figure is `ipdRemainingBalance` in the stay summary. The button is drawn only while `stay.status` is open. If the list is showing, or the stay is settled, skip this step.
- Placement: left
- Title EN: Read the cash line
- Title MY: ငွေစာကြောင်းကို ဖတ်ပါ
- Body EN: Read the subtitle on Discharge (ဆင်းခွင့်ရှင်း) and leave the button unpressed. A positive Patient's Remaining Balance (လူနာ လက်ကျန်ငွေ) shows Refund the remainder (လက်ကျန်ကို ပြန်အမ်း) and would write a refund; a negative balance shows Collect the amount owed (ပေးရန်ကျန်ကို ကောက်) and would write a collection; zero shows No cash. Balance is zero (ငွေမထိ။ လက်ကျန် သုည) and would write no cash line.
- Body MY: Discharge (ဆင်းခွင့်ရှင်း) ၏ ခေါင်းစဉ်ခွဲကို ဖတ်ပြီး ခလုတ်ကို မနှိပ်ရ။ Patient's Remaining Balance (လူနာ လက်ကျန်ငွေ) အပေါင်းဖြစ်လျှင် Refund the remainder (လက်ကျန်ကို ပြန်အမ်း) ပြပြီး ပြန်အမ်းငွေ ရေးမည်ဖြစ်ကာ၊ အနှုတ်ဖြစ်လျှင် Collect the amount owed (ပေးရန်ကျန်ကို ကောက်) ပြပြီး ကောက်ခံငွေ ရေးမည်ဖြစ်ကာ၊ သုညဖြစ်လျှင် No cash. Balance is zero (ငွေမထိ။ လက်ကျန် သုည) ပြပြီး ငွေစာကြောင်း မရေးပါ။
- Must not press: Discharge
- If the control is missing: skip this step

### 2. discharge
- Anchor to add later: data-guide="ipd-discharge"
- Where the control is now: the same rail button in `client/src/pages/ipd/IpdPage.tsx`, label `ipdDischarge`. Pressing it opens `AlertDialog` with message `confirmIpdDischarge` and confirm label `ipdDischarge`. After a real discharge the success line is `ipdDischarged`, the stay is settled, and later deposits, ward charges, and desk charges are refused with `errIpdNotOpen`. The open-stay buttons are then hidden. If the button is not on screen, skip this step.
- Placement: left
- Title EN: Discharge
- Title MY: ဆင်းခွင့်ရှင်း
- Body EN: Discharge (ဆင်းခွင့်ရှင်း) asks Discharge this stay? The cash line is final. (ဤတက်ရောက်မှုကို ဆင်းခွင့်ရှင်းမည်လား။ ငွေစာကြောင်းသည် အပြီးဖြစ်သည်။). After a real discharge, Take deposit (အပ်ငွေ လက်ခံ), Post ward charge (ဝပ်ကြေး တင်), and desk charges are refused with This stay is not open (ဤတက်ရောက်မှုကို မဖွင့်ထားပါ။), and the success line is Discharged. Balance is zero. (ဆင်းပြီး။ လက်ကျန် သုည။). Do not press Discharge on a real stay during this lesson, and do not confirm the dialog.
- Body MY: Discharge (ဆင်းခွင့်ရှင်း) သည် Discharge this stay? The cash line is final. (ဤတက်ရောက်မှုကို ဆင်းခွင့်ရှင်းမည်လား။ ငွေစာကြောင်းသည် အပြီးဖြစ်သည်။) ဟု မေးသည်။ တကယ်ဆင်းပြီးနောက် Take deposit (အပ်ငွေ လက်ခံ)၊ Post ward charge (ဝပ်ကြေး တင်)၊ ကောင်တာတင်ကြေးတို့ကို This stay is not open (ဤတက်ရောက်မှုကို မဖွင့်ထားပါ။) ဖြင့် ငြင်းပြီး အောင်မြင်စာကြောင်းသည် Discharged. Balance is zero. (ဆင်းပြီး။ လက်ကျန် သုည။) ဖြစ်သည်။ ဤသင်ခန်းစာတွင် တကယ်ဖွင့်ထားသော တက်ရောက်မှုကို Discharge မနှိပ်ရဘဲ ဒိုင်ယာလော့ခ်ကိုလည်း အတည်မပြုရ။
- Must not press: Discharge, and the confirm button that also says Discharge
- If the control is missing: skip this step

## Out of this tour
- Do not press Discharge on a real stay. Do not confirm the dialog.
- Do not press Open (ဖွင့်မည်) in order to reach Discharge. If the button is missing, skip the step.
- Do not press Admit, Take deposit, Post ward charge, or Save notes during this lesson.
- Do not press Charge to IPD, Mark Paid, or Credit to IPD. Charges after discharge are refused because the stay is not open.
- Do not void a bill, transfer stock, or seed training data.
