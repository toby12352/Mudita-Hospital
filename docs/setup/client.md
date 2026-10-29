# How to install and run the clinic program

This is the program the desk uses all day. The window title is **Mudita Hospital**. The file name is **MuditaHospital.exe**.

Do this on every desk computer (reception, pharmacy, and any other desk that opens patient or bill screens).

If the hospital has only one computer, finish [the server guide](server.md) on that computer first. Then do this guide on the **same** computer.

The server computer must be switched on before these steps will connect.

The printable sheet is [client.pdf](client.pdf) in this same folder. Double-click it to read or print.

---

## 1. Copy the clinic folder onto this computer

Do not run the program from the USB stick. Unplugging the stick closes the program.

1. Plug in the USB stick.
2. Open the client folder (the folder that contains **MuditaHospital.exe**, and sometimes a setup file).
3. Click an empty part of the window.
4. Hold **Ctrl** and press **A**, so every file lights up.
5. Right-click one lit file. Click **Copy**.
6. Open **This PC**, then **Windows (C:)** or **Local Disk (C:)**.
7. Right-click an empty area. Click **New**, then **Folder**.
8. Type `Mudita` and press **Enter**. If a **Mudita** folder is already there, open that folder instead of making a second one.
9. Open **Mudita**. Right-click an empty area. Click **Paste**.
10. Wait until the copying finishes.

## 2. Install, or open the program

Look in the **Mudita** folder you just pasted.

**If you see a setup file** (the name ends with `setup.exe`, or the name ends with `.msi`):

1. Double-click that setup file.
2. If Windows asks **Do you want to allow this app to make changes to your device?**, click **Yes**.
3. If a window says **Windows protected your PC**, click **More info**, then **Run anyway**.
4. Click **Next**, **Install**, and **Finish** when you see those buttons. You may not see every one of them.
5. Look at the desktop (the main screen with pictures). If a picture named **Mudita Hospital** is already there, go to section 4. You can skip section 3.

**If you do not see a setup file:**

The program is **MuditaHospital.exe**. Go to section 3, then open it from the desktop picture.

## 3. Put a picture on the desktop

Do this so the desk does not have to hunt for the folder every morning.

1. Open the **Mudita** folder.
2. Find **MuditaHospital.exe** (the picture may say **Mudita Hospital**).
3. Right-click it.
4. If you see **Show more options**, click that.
5. Click **Send to**.
6. Click **Desktop (create shortcut)**.
7. Close the folder window.
8. Look at the main screen. A new picture says **Mudita Hospital**. That picture is the program.

A shortcut is only a picture that opens the real program. Deleting the picture on the desktop does not delete the hospital records. The records stay on the server computer.

## 4. Connect to the server

1. Double-click the **Mudita Hospital** picture on the desktop.
2. The first screen title is **Server IP** (မြန်မာစာမျက်နှာဆိုရင် **ဆာဗာ IP**). The line under it says to enter the hospital server address. Port 8080 is added for you. You only type the number.
3. On that same screen you can click **English** or **မြန်မာ**.

**This clinic program is on the same computer as the server**

Click **This PC (127.0.0.1)**. In Myanmar that button reads **ဤကွန်ပျူတာ (127.0.0.1)**. Do not type a number.

**This clinic program is on a different computer**

1. Click the empty box under **Server IP or address** (မြန်မာ: **ဆာဗာ IP သို့မဟုတ် လိပ်စာ**).
2. Type the Server IP from the paper note beside the server computer. Example: `192.168.1.10`. Type the digits and the dots only. Do not type `http://`. Do not type `:8080`.
3. Click **Save & test** (မြန်မာ: **သိမ်းပြီး စစ်ဆေး**).

You should see green words that include **Connected to**. Then the sign-in screen opens.

If red words appear, the number is wrong, the server computer is off, or the cable is unplugged. Check those three things. Then click **Save & test** again.

A button named **Save anyway** can appear after an error. Use it only when the number on the paper is certainly right and the server computer is on. Otherwise fix the number and click **Save & test** again.

## 5. Sign in

The screen title is **Sign in** (မြန်မာ: **ဝင်ရန်**).

1. Click **Username** (မြန်မာ: **အသုံးပြုသူအမည်**). Type the name the hospital gave you.
2. Click **Password** (မြန်မာ: **စကားဝှက်**). Type the password.
3. Click **Sign in**.

On a **brand-new** server, before anyone has changed passwords:

| Name you type | Password you type | Who it is for |
| --- | --- | --- |
| `admin` | `admin123` | The person who manages the hospital program |
| `reception` | `reception123` | Reception |
| `pharmacy` | `pharmacy123` | Pharmacy |

The program then asks for a new password. Choose one the desk will remember, and write it on paper kept with the hospital. After that, the old password `admin123` (and the others in the table) no longer work.

If the hospital already changed the passwords, use the new ones. The table above is only for the first day.

## 6. Change the Server IP later

The number is remembered. You only do this when the server computer’s number changes, or when the first number was typed wrong.

1. Open **Mudita Hospital**.
2. Click **Server IP** (မြန်မာ: **ဆာဗာ IP**). It sits at the top of the window. On the sign-in screen it is near the language buttons. After you are signed in it is near **Help** and **Log out**.
3. If you see **Change server IP** (မြန်မာ: **ဆာဗာ IP ပြောင်း**), click it.
4. Type the new number, or click **This PC (127.0.0.1)** when the program is on the server computer itself.
5. Click **Save & test**.

## 7. If it says the server is offline

The button shows **Server offline** (မြန်မာ: **ဆာဗာ မရရှိ**). A green **Server connected** (မြန်မာ: **ဆာဗာ ချိတ်ဆက်ပြီး**) means this desk is fine.

1. Click **Server IP**, then **Retry** (မြန်မာ: **ထပ်ကြိုးစား**).
2. Look at the server computer. It must be switched on. Its screen can be locked. The computer itself must be running.
3. Check the cable at both ends, or check that both computers are on the same Wi-Fi. A cable is the steadier choice for billing.
4. Compare the number on this screen with the paper note. If they differ, use section 6.
5. On the server computer, open Edge and visit `http://127.0.0.1:8080/api/health`. The page should include `"status":"ok"`. If that page does not open, the server program is not running. Use the server guide, section 11 (switch the server computer on) or section 7 (the blue window showed an error).

## 8. Every morning

1. Switch the server computer on first, and leave it on.
2. On this desk, double-click the **Mudita Hospital** picture.
3. Sign in.

You do not type the Server IP again unless the number has changed.

---

# ဆေးခန်းပရိုဂရမ်ကို တပ်ဆင်ပြီး ဖွင့်နည်း

ဒါက စားပွဲမှာ တစ်နေ့လုံး သုံးတဲ့ပရိုဂရမ်ပါ။ ပြတင်းပေါက်ခေါင်းစဉ်က **Mudita Hospital** ပါ။ ဖိုင်နာမည်က **MuditaHospital.exe** ပါ။

လူနာမျက်နှာပြင် သို့မဟုတ် ဘေလ်မျက်နှာပြင် ဖွင့်မည့် စားပွဲတိုင်းမှာ လုပ်ပါ (ကြိုတင်ကောင်တာ၊ ဆေးဆိုင်၊ အခြားစားပွဲ)။

ဆေးရုံမှာ ကွန်ပျူတာတစ်လုံးပဲ ရှိရင် အဲဒီကွန်ပျူတာပေါ်မှာ [ဆာဗာလမ်းညွှန်](server.md) ကို အရင်ပြီးအောင်လုပ်ပါ။ ပြီးမှ **ဒီကွန်ပျူတာမှာပဲ** ဒီလမ်းညွှန်ကို လုပ်ပါ။

ဒီအဆင့်တွေ ချိတ်နိုင်ဖို့ ဆာဗာကွန်ပျူတာကို အရင်ဖွင့်ထားရပါမယ်။

ပုံနှိပ်စာရွက်က ဒီဖိုလ်ဒါထဲက [client.pdf](client.pdf) ပါ။ ဖတ်ရန် သို့မဟုတ် ပုံနှိပ်ရန် နှစ်ချက်နှိပ်ပါ။

Windows ခလုတ်နာမည်တွေ (**Copy**၊ **Paste**၊ **Yes**၊ **Next**) ကို အင်္ဂလိပ်အတိုင်း နှိပ်ပါ။ ပရိုဂရမ်ထဲက ခလုတ်ကိုတော့ မျက်နှာပြင်မှာ ပေါ်တဲ့စာအတိုင်း နှိပ်ပါ။ ပထမဆုံးမျက်နှာပြင်မှာ **English** သို့မဟုတ် **မြန်မာ** ကို ရွေးနိုင်ပါတယ်။

---

## 1. ဆေးခန်းဖိုလ်ဒါကို ဒီကွန်ပျူတာပေါ် ကူးပါ

ပရိုဂရမ်ကို ယူအက်စ်ဘီထဲကနေ မဖွင့်ပါနဲ့။ ယူအက်စ်ဘီဖြုတ်ရင် ပရိုဂရမ် ပိတ်သွားပါတယ်။

1. ယူအက်စ်ဘီကို တပ်ပါ။
2. **MuditaHospital.exe** ပါတဲ့ client ဖိုလ်ဒါကို ဖွင့်ပါ။ တပ်ဆင်ဖိုင်တစ်ခုလည်း ပါနိုင်ပါတယ်။
3. ပြတင်းပေါက်ထဲက နေရာလွတ်ကို နှိပ်ပါ။
4. **Ctrl** ကို ဖိပြီး **A** နှိပ်ပါ။ ဖိုင်အားလုံး လင်းလာပါတယ်။
5. လင်းနေတဲ့ဖိုင်တစ်ခုကို ညာဘက်နှိပ်ပါ။ **Copy** နှိပ်ပါ။
6. **This PC** ကို ဖွင့်ပါ။ **Windows (C:)** သို့မဟုတ် **Local Disk (C:)** ကို ဖွင့်ပါ။
7. နေရာလွတ်ကို ညာဘက်နှိပ်ပါ။ **New**၊ ပြီးရင် **Folder** နှိပ်ပါ။
8. `Mudita` လို့ ရိုက်ပြီး **Enter** နှိပ်ပါ။ **Mudita** ဖိုလ်ဒါ ရှိပြီးသားဆိုရင် အသစ်မလုပ်ဘဲ အဲဒီဖိုလ်ဒါကို ဖွင့်ပါ။
9. **Mudita** ကို ဖွင့်ပါ။ နေရာလွတ်ကို ညာဘက်နှိပ်ပါ။ **Paste** နှိပ်ပါ။
10. ကူးပြီးတဲ့အထိ စောင့်ပါ။

## 2. တပ်ဆင်ပါ၊ သို့မဟုတ် ပရိုဂရမ်ကို ဖွင့်ပါ

အခုကူးထားတဲ့ **Mudita** ဖိုလ်ဒါထဲကို ကြည့်ပါ။

**တပ်ဆင်ဖိုင် မြင်ရင်** (နာမည်က `setup.exe` နဲ့ ဆုံးတယ်၊ သို့မဟုတ် `.msi` နဲ့ ဆုံးတယ်)။

1. အဲဒီတပ်ဆင်ဖိုင်ကို နှစ်ချက်နှိပ်ပါ။
2. **Do you want to allow this app to make changes to your device?** လို့ မေးရင် **Yes** နှိပ်ပါ။
3. **Windows protected your PC** လို့ ပေါ်ရင် **More info**၊ ပြီးရင် **Run anyway** နှိပ်ပါ။
4. **Next**၊ **Install**၊ **Finish** ခလုတ်တွေ ပေါ်ရင် နှိပ်ပါ။ အားလုံး မပေါ်နိုင်ပါ။
5. ဒက်စ်တော့ (ပုံတွေရှိတဲ့ ပင်မမျက်နှာပြင်) ကို ကြည့်ပါ။ **Mudita Hospital** ပုံ ရှိပြီးသားဆိုရင် အပိုင်း ၄ ကို သွားပါ။ အပိုင်း ၃ ကို ကျော်နိုင်ပါတယ်။

**တပ်ဆင်ဖိုင် မမြင်ရင်**

ပရိုဂရမ်က **MuditaHospital.exe** ပါ။ အပိုင်း ၃ ကို လုပ်ပြီး ဒက်စ်တော့ပုံကနေ ဖွင့်ပါ။

## 3. ဒက်စ်တော့ပေါ် ပုံတစ်ခု တင်ပါ

မနက်တိုင်း ဖိုလ်ဒါကို လိုက်ရှာစရာ မလိုအောင် ဒီအဆင့်ကို လုပ်ပါ။

1. **Mudita** ဖိုလ်ဒါကို ဖွင့်ပါ။
2. **MuditaHospital.exe** ကို ရှာပါ (ပုံအောက်မှာ **Mudita Hospital** လို့ ပါနိုင်ပါတယ်)။
3. ညာဘက်နှိပ်ပါ။
4. **Show more options** ကို မြင်ရင် အဲဒါကို နှိပ်ပါ။
5. **Send to** ကို နှိပ်ပါ။
6. **Desktop (create shortcut)** ကို နှိပ်ပါ။ ဒက်စ်တော့ပေါ် ဖွင့်ပုံတစ်ခု လုပ်တဲ့ခလုတ်ပါ။
7. ဖိုလ်ဒါပြတင်းပေါက်ကို ပိတ်ပါ။
8. ပင်မမျက်နှာပြင်ကို ကြည့်ပါ။ **Mudita Hospital** လို့ ပါတဲ့ ပုံအသစ် ပေါ်နေပါတယ်။ အဲဒီပုံက ပရိုဂရမ်ပါ။

ရှော့ကတ်ဆိုတာ ပရိုဂရမ်အမှန်ကို ဖွင့်ပေးတဲ့ ပုံတစ်ပုံပါပဲ။ ဒက်စ်တော့ပေါ်က ပုံကို ဖျက်လို့ ဆေးရုံမှတ်တမ်း မပျက်ပါ။ မှတ်တမ်းက ဆာဗာကွန်ပျူတာပေါ်မှာ ရှိပါတယ်။

## 4. ဆာဗာနဲ့ ချိတ်ပါ

1. ဒက်စ်တော့ပေါ်က **Mudita Hospital** ပုံကို နှစ်ချက်နှိပ်ပါ။
2. ပထမမျက်နှာပြင်ခေါင်းစဉ်က **Server IP** ပါ။ မြန်မာကို ပြောင်းထားရင် **ဆာဗာ IP** ပါ။ အောက်ကစာက ဆေးရုံဆာဗာလိပ်စာ ထည့်ရန်လို့ ပြပါတယ်။ ပို့တ် 8080 ကို ပရိုဂရမ်က ဖြည့်ပေးပါတယ်။ နံပါတ်ကိုပဲ ရိုက်ပါ။
3. အဲဒီမျက်နှာပြင်မှာ **English** သို့မဟုတ် **မြန်မာ** ကို နှိပ်နိုင်ပါတယ်။

**ဆေးခန်းပရိုဂရမ်က ဆာဗာနဲ့ ကွန်ပျူတာတူတူပေါ်မှာ ရှိရင်**

**This PC (127.0.0.1)** ကို နှိပ်ပါ။ မြန်မာမှာ အဲဒီခလုတ်က **ဤကွန်ပျူတာ (127.0.0.1)** ပါ။ နံပါတ်ရိုက်စရာ မလိုပါ။

**ဆေးခန်းပရိုဂရမ်က တခြားကွန်ပျူတာပေါ်မှာ ရှိရင်**

1. **Server IP or address** အောက်က ကွက်လပ်ကို နှိပ်ပါ (မြန်မာ: **ဆာဗာ IP သို့မဟုတ် လိပ်စာ**)။
2. ဆာဗာကွန်ပျူတာဘေးက စာရွက်ပေါ်က Server IP ကို ရိုက်ပါ။ ဥပမာ `192.168.1.10`။ ဂဏန်းနဲ့ အစက်ပဲ ရိုက်ပါ။ `http://` မရိုက်ပါနဲ့။ `:8080` မရိုက်ပါနဲ့။
3. **Save & test** ကို နှိပ်ပါ (မြန်မာ: **သိမ်းပြီး စစ်ဆေး**)။

**Connected to** ပါတဲ့ အစိမ်းရောင်စာကို မြင်ရပါမယ်။ ပြီးရင် ဝင်ရောက်တဲ့မျက်နှာပြင် ပွင့်လာပါတယ်။

အနီရောင်စာ ပေါ်ရင် နံပါတ်မှားတယ်၊ ဆာဗာကွန်ပျူတာ ပိတ်နေတယ်၊ သို့မဟုတ် ကြိုးမတပ်ထားဘူး ဆိုတာပါ။ အဲဒီသုံးခုကို စစ်ပါ။ ပြီးရင် **Save & test** ကို ပြန်နှိပ်ပါ။

အမှားပေါ်ပြီးမှ **Save anyway** ခလုတ် ပေါ်နိုင်ပါတယ်။ စာရွက်ပေါ်က နံပါတ် မှန်ကြောင်း သေချာပြီး ဆာဗာကွန်ပျူတာ ဖွင့်ထားမှသာ သုံးပါ။ မသေချာရင် နံပါတ်ကို ပြင်ပြီး **Save & test** ကို ပြန်နှိပ်ပါ။

## 5. ဝင်ပါ

မျက်နှာပြင်ခေါင်းစဉ်က **Sign in** ပါ (မြန်မာ: **ဝင်ရန်**)။

1. **Username** ကို နှိပ်ပါ (မြန်မာ: **အသုံးပြုသူအမည်**)။ ဆေးရုံက ပေးထားတဲ့ နာမည်ကို ရိုက်ပါ။
2. **Password** ကို နှိပ်ပါ (မြန်မာ: **စကားဝှက်**)။ စကားဝှက်ကို ရိုက်ပါ။
3. **Sign in** ကို နှိပ်ပါ။

ဆာဗာ **အသစ်** မှာ၊ စကားဝှက်ကို ဘယ်သူမှ မပြောင်းရသေးခင် —

| ရိုက်ရမည့်နာမည် | ရိုက်ရမည့်စကားဝှက် | ဘယ်သူအတွက်လဲ |
| --- | --- | --- |
| `admin` | `admin123` | ဆေးရုံပရိုဂရမ်ကို စီမံတဲ့သူ |
| `reception` | `reception123` | ကြိုတင်ကောင်တာ |
| `pharmacy` | `pharmacy123` | ဆေးဆိုင် |

ပရိုဂရမ်က စကားဝှက်အသစ် တောင်းပါမယ်။ စားပွဲက မှတ်နိုင်တဲ့ စကားဝှက်တစ်ခု ရွေးပြီး ဆေးရုံနဲ့အတူ ထားတဲ့စာရွက်ပေါ် ရေးပါ။ အဲဒီနောက် `admin123` နဲ့ ဇယားထဲက အခြားစကားဝှက်အဟောင်းတွေ အလုပ်မလုပ်တော့ပါ။

ဆေးရုံက စကားဝှက်ပြောင်းပြီးသားဆိုရင် အသစ်ကို သုံးပါ။ အပေါ်ကဇယားက ပထမနေ့အတွက်ပါ။

## 6. Server IP ကို နောက်မှ ပြောင်းခြင်း

နံပါတ်ကို ပရိုဂရမ်က မှတ်ထားပါတယ်။ ဆာဗာကွန်ပျူတာရဲ့ နံပါတ်ပြောင်းမှ၊ သို့မဟုတ် ပထမနံပါတ် မှားရိုက်မိမှသာ ဒီအဆင့်ကို လုပ်ပါ။

1. **Mudita Hospital** ကို ဖွင့်ပါ။
2. **Server IP** ကို နှိပ်ပါ (မြန်မာ: **ဆာဗာ IP**)။ ပြတင်းပေါက်အပေါ်မှာ ရှိပါတယ်။ ဝင်ရောက်မျက်နှာပြင်မှာ ဘာသာစကားခလုတ်တွေအနားမှာ ရှိပါတယ်။ ဝင်ပြီးသားဆိုရင် **Help** နဲ့ **Log out** အနားမှာ ရှိပါတယ်။
3. **Change server IP** ကို မြင်ရင် နှိပ်ပါ (မြန်မာ: **ဆာဗာ IP ပြောင်း**)။
4. နံပါတ်အသစ်ကို ရိုက်ပါ။ ပရိုဂရမ်က ဆာဗာကွန်ပျူတာပေါ်မှာပဲ ရှိရင် **This PC (127.0.0.1)** ကို နှိပ်ပါ။
5. **Save & test** ကို နှိပ်ပါ။

## 7. ဆာဗာမရဘူးလို့ ပေါ်ရင်

ခလုတ်မှာ **Server offline** လို့ ပေါ်ပါတယ် (မြန်မာ: **ဆာဗာ မရရှိ**)။ အစိမ်းရောင် **Server connected** (မြန်မာ: **ဆာဗာ ချိတ်ဆက်ပြီး**) ဆိုရင် ဒီစားပွဲက အဆင်ပြေပါတယ်။

1. **Server IP** ကို နှိပ်ပါ။ ပြီးရင် **Retry** ကို နှိပ်ပါ (မြန်မာ: **ထပ်ကြိုးစား**)။
2. ဆာဗာကွန်ပျူတာကို ကြည့်ပါ။ ဖွင့်ထားရပါမယ်။ မျက်နှာပြင်ကို သော့ခတ်ထားလို့ ရပါတယ်။ ကွန်ပျူတာကိုယ်တိုင်ကတော့ ဖွင့်နေရပါမယ်။
3. ကြိုးနှစ်ဖက်လုံးကို စစ်ပါ။ သို့မဟုတ် ကွန်ပျူတာနှစ်လုံး Wi-Fi တူတူပေါ်မှာ ရှိသလား ကြည့်ပါ။ ဘေလ်အတွက် ကြိုးက ပိုတည်ငြိမ်ပါတယ်။
4. ဒီမျက်နှာပြင်က နံပါတ်ကို စာရွက်နဲ့ တိုက်ကြည့်ပါ။ မတူရင် အပိုင်း ၆ ကို သုံးပါ။
5. ဆာဗာကွန်ပျူတာပေါ်မှာ Edge ကို ဖွင့်ပြီး `http://127.0.0.1:8080/api/health` ကို သွားပါ။ `"status":"ok"` ပါရပါမယ်။ အဲဒီစာမျက်နှာ မပွင့်ရင် ဆာဗာပရိုဂရမ် မလုပ်နေပါ။ ဆာဗာလမ်းညွှန် အပိုင်း ၁၁ (ဆာဗာကွန်ပျူတာကို ဖွင့်ပါ) သို့မဟုတ် အပိုင်း ၇ (အပြာပြတင်းပေါက်မှာ အမှားပေါ်ခဲ့ရင်) ကို သုံးပါ။

## 8. မနက်တိုင်း

1. ဆာဗာကွန်ပျူတာကို အရင်ဖွင့်ပါ။ ဖွင့်ထားပါ။
2. ဒီစားပွဲမှာ **Mudita Hospital** ပုံကို နှစ်ချက်နှိပ်ပါ။
3. ဝင်ပါ။

နံပါတ် မပြောင်းသေးရင် Server IP ကို ထပ်ရိုက်စရာ မလိုပါ။
