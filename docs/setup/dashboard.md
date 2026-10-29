# How to install and run the dashboard

This program is for the director or the admin person. The window title is **Mudita Dashboard**. The file name is **MuditaDashboard.exe**.

It shows summaries, money for the day, stock, and hospital lists. Reception and pharmacy keep using **Mudita Hospital** (the clinic program). They do not use this one.

Install it on the director’s computer. That computer can be the same one that already has the clinic program. Both can be installed together. Installing this program again does not remove hospital records. The records stay on the server computer.

Finish [the server guide](server.md) first. The server computer must be switched on.

The printable sheet is [dashboard.pdf](dashboard.pdf) in this same folder. Double-click it to read or print.

---

## 1. Copy the dashboard folder onto this computer

Do not run the program from the USB stick.

1. Plug in the USB stick.
2. Open the dashboard folder (the folder that contains **MuditaDashboard.exe**, and sometimes a setup file).
3. Click an empty part of the window.
4. Hold **Ctrl** and press **A**, so every file lights up.
5. Right-click one lit file. Click **Copy**.
6. Open **This PC**, then **Windows (C:)** or **Local Disk (C:)**.
7. If there is no **Mudita** folder yet: right-click an empty area, click **New**, click **Folder**, type `Mudita`, press **Enter**.
8. Open **Mudita**. Right-click an empty area. Click **Paste**.
9. Wait until the copying finishes.

## 2. Install, or open the program

Look in the folder you just pasted.

**If you see a setup file** (the name ends with `setup.exe`, or the name ends with `.msi`):

1. Double-click that setup file. This is the dashboard setup, not the clinic setup. The name includes **Dashboard**.
2. If Windows asks **Do you want to allow this app to make changes to your device?**, click **Yes**.
3. If a window says **Windows protected your PC**, click **More info**, then **Run anyway**.
4. Click **Next**, **Install**, and **Finish** when you see those buttons.
5. If the desktop already shows a picture named **Mudita Dashboard**, go to section 4.

**If you do not see a setup file:**

The program is **MuditaDashboard.exe**. Continue with section 3.

## 3. Put a picture on the desktop

1. Open the folder that contains **MuditaDashboard.exe**.
2. Right-click **MuditaDashboard.exe**.
3. If you see **Show more options**, click that.
4. Click **Send to**.
5. Click **Desktop (create shortcut)**.
6. Close the folder window.
7. The main screen now has a picture named **Mudita Dashboard**.

Deleting that picture does not delete hospital records.

## 4. Connect to the server

1. Double-click the **Mudita Dashboard** picture.
2. The first screen title is **Server IP** (မြန်မာ: **ဆာဗာ IP**). You can click **English** or **မြန်မာ** on that screen.
3. Use the **same number** the clinic desks use.

**The dashboard is on the same computer as the server**

Click **This PC (127.0.0.1)** (မြန်မာ: **ဤကွန်ပျူတာ (127.0.0.1)**).

**The dashboard is on a different computer**

1. Click the box under **Server IP or address**.
2. Type the Server IP from the paper note. Example: `192.168.1.10`. Digits and dots only.
3. Click **Save & test** (မြန်မာ: **သိမ်းပြီး စစ်ဆေး**).

You should see words that include **Connected to**. Then the sign-in screen opens. Under the title it says **Offline LAN · Admin only**.

## 5. Sign in

Only an Admin name can enter.

1. **Username:** type `admin` on a brand-new server, or the admin name the hospital uses now.
2. **Password:** type `admin123` only on the first day, before it was changed. After the first sign-in the program asks for a new password. Write the new password on the hospital paper.
3. Click **Sign in** (မြန်မာ: **ဝင်ရန်**).

If the screen says **Mudita Dashboard is for Admin only** (မြန်မာ: **မုဒိတာ ဒက်ရှ်ဘုတ်သည် Admin သာ။ OPD / OT / Pharmacy အတွက် မုဒိတာ ဆေးရုံ အက်ပ်ကို သုံးပါ။**), this name is a reception or pharmacy name. Open **Mudita Hospital** on that desk instead. Sign in to the dashboard with the admin name.

## 6. Change the Server IP later

1. Open **Mudita Dashboard**.
2. On the sign-in screen, click **Server IP**.
3. After you are signed in, the top of the window shows **Server connected** or **Server offline**. Click **Change server IP** (မြန်မာ: **ဆာဗာ IP ပြောင်း**).
4. Type the new number, or click **This PC (127.0.0.1)** when this program is on the server computer.
5. Click **Save & test**.

## 7. If it says the server is offline

1. Click **Retry** (မြန်မာ: **ထပ်ကြိုးစား**).
2. The server computer must be switched on.
3. The number must match the paper note and the clinic desks. If it does not, use section 6.
4. On the server computer, Edge should open `http://127.0.0.1:8080/api/health` and show `"status":"ok"`. If it does not, follow the server guide.

## 8. Every morning

1. The server computer is already on.
2. Double-click **Mudita Dashboard**.
3. Sign in with the admin name.

You do not type the Server IP again unless the number has changed.

---

# ဒက်ရှ်ဘုတ်ကို တပ်ဆင်ပြီး ဖွင့်နည်း

ဒီပရိုဂရမ်က ညွှန်ကြားရေးမှူး သို့မဟုတ် အက်ဒမင်အတွက်ပါ။ ပြတင်းပေါက်ခေါင်းစဉ်က **Mudita Dashboard** ပါ။ ဖိုင်နာမည်က **MuditaDashboard.exe** ပါ။

အနှစ်ချုပ်၊ ဒီနေ့ငွေ၊ ပစ္စည်းစာရင်း၊ ဆေးရုံစာရင်းတွေကို ပြပါတယ်။ ကြိုတင်ကောင်တာနဲ့ ဆေးဆိုင်က **Mudita Hospital** (ဆေးခန်းပရိုဂရမ်) ကို ဆက်သုံးပါတယ်။ ဒီပရိုဂရမ်ကို သူတို့ မသုံးပါ။

ညွှန်ကြားရေးမှူးကွန်ပျူတာပေါ်မှာ တပ်ပါ။ ဆေးခန်းပရိုဂရမ် ရှိပြီးသား ကွန်ပျူတာမှာလည်း တပ်လို့ ရပါတယ်။ နှစ်ခုလုံး အတူရှိလို့ ရပါတယ်။ ဒီပရိုဂရမ်ကို ပြန်တပ်လို့ ဆေးရုံမှတ်တမ်း မပျက်ပါ။ မှတ်တမ်းက ဆာဗာကွန်ပျူတာပေါ်မှာ ရှိပါတယ်။

[ဆာဗာလမ်းညွှန်](server.md) ကို အရင်ပြီးအောင်လုပ်ပါ။ ဆာဗာကွန်ပျူတာကို ဖွင့်ထားရပါမယ်။

ပုံနှိပ်စာရွက်က ဒီဖိုလ်ဒါထဲက [dashboard.pdf](dashboard.pdf) ပါ။ ဖတ်ရန် သို့မဟုတ် ပုံနှိပ်ရန် နှစ်ချက်နှိပ်ပါ။

Windows ခလုတ်နာမည်တွေကို အင်္ဂလိပ်အတိုင်း နှိပ်ပါ။ ပရိုဂရမ်ထဲက ခလုတ်ကို မျက်နှာပြင်မှာ ပေါ်တဲ့စာအတိုင်း နှိပ်ပါ။

---

## 1. ဒက်ရှ်ဘုတ်ဖိုလ်ဒါကို ဒီကွန်ပျူတာပေါ် ကူးပါ

ပရိုဂရမ်ကို ယူအက်စ်ဘီထဲကနေ မဖွင့်ပါနဲ့။

1. ယူအက်စ်ဘီကို တပ်ပါ။
2. **MuditaDashboard.exe** ပါတဲ့ dashboard ဖိုလ်ဒါကို ဖွင့်ပါ။ တပ်ဆင်ဖိုင်တစ်ခုလည်း ပါနိုင်ပါတယ်။
3. ပြတင်းပေါက်ထဲက နေရာလွတ်ကို နှိပ်ပါ။
4. **Ctrl** ကို ဖိပြီး **A** နှိပ်ပါ။ ဖိုင်အားလုံး လင်းလာပါတယ်။
5. လင်းနေတဲ့ဖိုင်တစ်ခုကို ညာဘက်နှိပ်ပါ။ **Copy** နှိပ်ပါ။
6. **This PC** ကို ဖွင့်ပါ။ **Windows (C:)** သို့မဟုတ် **Local Disk (C:)** ကို ဖွင့်ပါ။
7. **Mudita** ဖိုလ်ဒါ မရှိသေးရင် နေရာလွတ်ကို ညာဘက်နှိပ်ပါ။ **New**၊ **Folder** နှိပ်ပါ။ `Mudita` လို့ ရိုက်ပြီး **Enter** နှိပ်ပါ။
8. **Mudita** ကို ဖွင့်ပါ။ နေရာလွတ်ကို ညာဘက်နှိပ်ပါ။ **Paste** နှိပ်ပါ။
9. ကူးပြီးတဲ့အထိ စောင့်ပါ။

## 2. တပ်ဆင်ပါ၊ သို့မဟုတ် ပရိုဂရမ်ကို ဖွင့်ပါ

အခုကူးထားတဲ့ဖိုလ်ဒါထဲကို ကြည့်ပါ။

**တပ်ဆင်ဖိုင် မြင်ရင်** (နာမည်က `setup.exe` နဲ့ ဆုံးတယ်၊ သို့မဟုတ် `.msi` နဲ့ ဆုံးတယ်)။

1. အဲဒီတပ်ဆင်ဖိုင်ကို နှစ်ချက်နှိပ်ပါ။ ဒါက ဒက်ရှ်ဘုတ်တပ်ဆင်ဖိုင်ပါ။ ဆေးခန်းတပ်ဆင်ဖိုင် မဟုတ်ပါ။ နာမည်ထဲမှာ **Dashboard** ပါပါတယ်။
2. **Do you want to allow this app to make changes to your device?** လို့ မေးရင် **Yes** နှိပ်ပါ။
3. **Windows protected your PC** လို့ ပေါ်ရင် **More info**၊ ပြီးရင် **Run anyway** နှိပ်ပါ။
4. **Next**၊ **Install**၊ **Finish** ပေါ်ရင် နှိပ်ပါ။
5. ဒက်စ်တော့ပေါ်မှာ **Mudita Dashboard** ပုံ ရှိပြီးသားဆိုရင် အပိုင်း ၄ ကို သွားပါ။

**တပ်ဆင်ဖိုင် မမြင်ရင်**

ပရိုဂရမ်က **MuditaDashboard.exe** ပါ။ အပိုင်း ၃ ကို ဆက်လုပ်ပါ။

## 3. ဒက်စ်တော့ပေါ် ပုံတစ်ခု တင်ပါ

1. **MuditaDashboard.exe** ပါတဲ့ဖိုလ်ဒါကို ဖွင့်ပါ။
2. **MuditaDashboard.exe** ကို ညာဘက်နှိပ်ပါ။
3. **Show more options** ကို မြင်ရင် နှိပ်ပါ။
4. **Send to** ကို နှိပ်ပါ။
5. **Desktop (create shortcut)** ကို နှိပ်ပါ။
6. ဖိုလ်ဒါပြတင်းပေါက်ကို ပိတ်ပါ။
7. ပင်မမျက်နှာပြင်မှာ **Mudita Dashboard** ပုံ ပေါ်နေပါတယ်။

အဲဒီပုံကို ဖျက်လို့ ဆေးရုံမှတ်တမ်း မပျက်ပါ။

## 4. ဆာဗာနဲ့ ချိတ်ပါ

1. **Mudita Dashboard** ပုံကို နှစ်ချက်နှိပ်ပါ။
2. ပထမမျက်နှာပြင်ခေါင်းစဉ်က **Server IP** ပါ (မြန်မာ: **ဆာဗာ IP**)။ အဲဒီမျက်နှာပြင်မှာ **English** သို့မဟုတ် **မြန်မာ** ကို နှိပ်နိုင်ပါတယ်။
3. ဆေးခန်းစားပွဲတွေ သုံးတဲ့ **နံပါတ်တူတူ** ကို သုံးပါ။

**ဒက်ရှ်ဘုတ်က ဆာဗာနဲ့ ကွန်ပျူတာတူတူပေါ်မှာ ရှိရင်**

**This PC (127.0.0.1)** ကို နှိပ်ပါ (မြန်မာ: **ဤကွန်ပျူတာ (127.0.0.1)**)။

**ဒက်ရှ်ဘုတ်က တခြားကွန်ပျူတာပေါ်မှာ ရှိရင်**

1. **Server IP or address** အောက်က ကွက်ကို နှိပ်ပါ။
2. စာရွက်ပေါ်က Server IP ကို ရိုက်ပါ။ ဥပမာ `192.168.1.10`။ ဂဏန်းနဲ့ အစက်ပဲ ရိုက်ပါ။
3. **Save & test** ကို နှိပ်ပါ (မြန်မာ: **သိမ်းပြီး စစ်ဆေး**)။

**Connected to** ပါတဲ့ စာကို မြင်ရပါမယ်။ ပြီးရင် ဝင်ရောက်မျက်နှာပြင် ပွင့်လာပါတယ်။ ခေါင်းစဉ်အောက်မှာ **Offline LAN · Admin only** လို့ ပါပါတယ်။

## 5. ဝင်ပါ

Admin နာမည်နဲ့ပဲ ဝင်လို့ ရပါတယ်။

1. **Username:** ဆာဗာအသစ်ဆိုရင် `admin` လို့ ရိုက်ပါ။ ဆေးရုံက အခုသုံးနေတဲ့ admin နာမည်ရှိရင် အဲဒါကို ရိုက်ပါ။
2. **Password:** ပထမနေ့၊ မပြောင်းရသေးခင်မှာပဲ `admin123` လို့ ရိုက်ပါ။ ပထမဆုံးဝင်ပြီးရင် ပရိုဂရမ်က စကားဝှက်အသစ် တောင်းပါတယ်။ စကားဝှက်အသစ်ကို ဆေးရုံစာရွက်ပေါ် ရေးပါ။
3. **Sign in** ကို နှိပ်ပါ (မြန်မာ: **ဝင်ရန်**)။

**Mudita Dashboard is for Admin only** လို့ ပေါ်ရင် (မြန်မာ: **မုဒိတာ ဒက်ရှ်ဘုတ်သည် Admin သာ။ OPD / OT / Pharmacy အတွက် မုဒိတာ ဆေးရုံ အက်ပ်ကို သုံးပါ။**) ဒီနာမည်က ကြိုတင်ကောင်တာ သို့မဟုတ် ဆေးဆိုင်နာမည်ပါ။ အဲဒီစားပွဲမှာ **Mudita Hospital** ကို ဖွင့်ပါ။ ဒက်ရှ်ဘုတ်ကိုတော့ admin နာမည်နဲ့ ဝင်ပါ။

## 6. Server IP ကို နောက်မှ ပြောင်းခြင်း

1. **Mudita Dashboard** ကို ဖွင့်ပါ။
2. ဝင်ရောက်မျက်နှာပြင်မှာ **Server IP** ကို နှိပ်ပါ။
3. ဝင်ပြီးသားဆိုရင် ပြတင်းပေါက်အပေါ်မှာ **Server connected** သို့မဟုတ် **Server offline** ပေါ်ပါတယ်။ **Change server IP** ကို နှိပ်ပါ (မြန်မာ: **ဆာဗာ IP ပြောင်း**)။
4. နံပါတ်အသစ်ကို ရိုက်ပါ။ ဒီပရိုဂရမ်က ဆာဗာကွန်ပျူတာပေါ်မှာပဲ ရှိရင် **This PC (127.0.0.1)** ကို နှိပ်ပါ။
5. **Save & test** ကို နှိပ်ပါ။

## 7. ဆာဗာမရဘူးလို့ ပေါ်ရင်

1. **Retry** ကို နှိပ်ပါ (မြန်မာ: **ထပ်ကြိုးစား**)။
2. ဆာဗာကွန်ပျူတာကို ဖွင့်ထားရပါမယ်။
3. နံပါတ်က စာရွက်နဲ့ ဆေးခန်းစားပွဲတွေနဲ့ တူရပါမယ်။ မတူရင် အပိုင်း ၆ ကို သုံးပါ။
4. ဆာဗာကွန်ပျူတာပေါ်က Edge မှာ `http://127.0.0.1:8080/api/health` ပွင့်ပြီး `"status":"ok"` ပြရပါမယ်။ မပြရင် ဆာဗာလမ်းညွှန်အတိုင်း လုပ်ပါ။

## 8. မနက်တိုင်း

1. ဆာဗာကွန်ပျူတာ ဖွင့်ပြီးသား ဖြစ်နေပါမယ်။
2. **Mudita Dashboard** ကို နှစ်ချက်နှိပ်ပါ။
3. admin နာမည်နဲ့ ဝင်ပါ။

နံပါတ် မပြောင်းသေးရင် Server IP ကို ထပ်ရိုက်စရာ မလိုပါ။
