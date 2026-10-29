# How to install and run the server

Read this on the **one computer that stays switched on**. Patient records, bills, and pharmacy stock live on this computer only. The other computers show the screens. They do not keep those records.

Install the server before the clinic program and before the dashboard.

The printable sheet is [server.pdf](server.pdf) in this same folder. Double-click it to read or print.

You will use the mouse for most steps. One part uses a blue window named **Windows PowerShell**. The title bar must say **Administrator**.

---

## 1. Copy the server folder onto this computer

The USB stick is only for carrying the files. If you start the server from the USB stick and then unplug it, the hospital program stops.

1. Plug in the USB stick.
2. Open the USB stick. Open the server folder (the folder that contains `install-server.ps1`).
3. Click once on an empty part of that window so that no file is selected.
4. Hold the **Ctrl** key and press **A**. Every file lights up. Let go of **Ctrl**.
5. Right-click one of the lit files. Click **Copy**.
6. Open **This PC**.
7. Open **Windows (C:)** or **Local Disk (C:)**.
8. Right-click an empty area. Click **New**, then **Folder**.
9. Type `Mudita` and press **Enter**.
10. Open the **Mudita** folder.
11. Right-click an empty area. Click **Paste**.
12. Wait until the copying finishes.

Leave the USB stick plugged in until you have written the Server IP on paper (section 6).

## 2. Allow the installer file

Windows sometimes blocks a file that came from another computer.

1. Open `C:\Mudita` (or wherever you pasted the files).
2. Find `install-server.ps1`.
3. Right-click it. Click **Properties**.
4. On the **General** tab, at the bottom, look for a tick box named **Unblock**.
5. If you see **Unblock**, tick it. Click **OK**.
6. If you do not see **Unblock**, click **OK** and continue. The file is already allowed.

If a blue and yellow window says **Windows protected your PC**, click **More info**, then **Run anyway**.

## 3. Open Windows PowerShell as administrator

1. Click the **Windows** button at the bottom of the screen (the four squares, or the Windows logo).
2. Type `powershell`. Do not press Enter yet.
3. **Windows PowerShell** appears in the list.
4. Right-click **Windows PowerShell**.
5. Click **Run as administrator**.
6. A window asks **Do you want to allow this app to make changes to your device?** Click **Yes**.
7. A blue window opens. The top of that window says **Administrator**.

Leave this blue window open. You will paste lines into it.

## 4. Go into the server folder

The blue window must be looking at the folder you copied.

1. Open the **Mudita** folder in the normal folder window, so you can see `install-server.ps1`.
2. Click once in the long white box at the top of that folder window. The whole line turns blue. That line is the folder location.
3. Right-click the blue line. Click **Copy**.
4. Click inside the blue PowerShell window.
5. Type `cd` then a space, then a quote mark. It looks like this, with nothing after the quote yet:

```text
cd "
```

6. Paste the folder location. Hold **Ctrl** and press **V**. If nothing appears, right-click once inside the blue window.
7. Type the closing quote `"`.
8. Press **Enter**.

The next line in the blue window shows that same folder location. A red message means the quote marks were left off. Type the `cd "` line again.

## 5. First time on this computer

Use this section when this computer has never run Mudita Hospital.

Click the blue window. Paste the first line, press **Enter**, wait until the cursor comes back, then paste the second line and press **Enter**.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\install-server.ps1
```

The first line allows this installer to run in this window only. It does not change the rest of the computer.

The second line installs the server. Wait. Text will scroll. Leave the window open until the scrolling stops.

You should see **Install complete.** You should also see:

- **Folder:** `C:\MuditaHospital\Server`
- **Health:** `http://127.0.0.1:8080/api/health`
- One or more lines that start with **LAN:**

Go to section 6.

If the text is red, go to section 7. If this computer already had Mudita Hospital, stop and use section 8 instead of running these lines on top of a running server.

## 6. Write down the Server IP

On paper, next to this computer, write every line that starts with **LAN:**.

The Server IP is the number between `http://` and `:8080` on that line.

Example: if the line is `http://192.168.1.10:8080/api/health`, the Server IP is `192.168.1.10`.

- Write a number that starts with `192.168` when you see one.
- If you only see a number that starts with `10.` or `172.`, write that number.
- `127.0.0.1` is the **Health** line. Other computers cannot use `127.0.0.1`. A clinic program on **this same computer** uses the **This PC** button instead of the LAN number. That is in the clinic guide.

If there is no **LAN** line, the network cable is unplugged or the Wi-Fi is off. Plug in the cable, then run the two lines in section 5 again.

Check that the server is really running:

1. Open **Microsoft Edge** (the blue and green swirl icon).
2. Click the long box at the top.
3. Type `http://127.0.0.1:8080/api/health` and press **Enter**.
4. The page should include `"status":"ok"` and `"db":"ok"`.

When you see that, you may close the blue window. You do not close it by typing anything. Click the **X** on the blue window.

The server is now installed. It also starts by itself the next time this computer is switched on. You do not open `mudita-api` yourself each morning.

## 7. If the blue window shows an error

Read the red text and use the matching step. Then run the two lines in section 5 again.

**The file cannot be loaded because running scripts is disabled**

The first line in section 5 was skipped, or the line was pasted into a window that is not Windows PowerShell. Close the window. Repeat sections 3, 4, and 5. The window title must say **Administrator**.

**Not digitally signed**, or **the operation is blocked**

Repeat section 2 (the **Unblock** tick). Then repeat sections 3, 4, and 5.

**Must be running as Administrator**, or **Access is denied**

The blue window was opened without **Run as administrator**. Close it. Repeat section 3, and click **Yes** on the allow-changes window. Then repeat sections 4 and 5.

**mudita-api.exe not found**

The blue window is not in the copied folder. Repeat section 4. You must see `install-server.ps1` in that folder before you paste the installer line.

**The process cannot access the file** because it is being used by another program

Mudita is already running on this computer. Use section 8.

## 8. This computer already has Mudita (an update)

Use this when `C:\MuditaHospital\Server` is already there and the hospital already has records.

The installer replaces the program. It leaves these alone:

- `C:\MuditaHospital\Server\data` (the records)
- `C:\MuditaHospital\Server\backups`
- `C:\MuditaHospital\Server\config.json`

The new program updates the records by itself the first time it starts. You do not copy a database file, and you do not delete one.

### 8.1 Copy the backups to a USB stick first

1. Open **This PC**, then **Windows (C:)**, then **MuditaHospital**, then **Server**.
2. Right-click the folder named **backups**. Click **Copy**.
3. Open the USB stick. Right-click an empty area. Click **Paste**.
4. Wait until the copying finishes. Unplug the USB stick only after that.

### 8.2 Stop the old server, then install again

The old program locks its own file. The new file can be copied only after the old program is stopped. Stopping it does not delete the records.

Repeat sections 2, 3, and 4 so the blue **Administrator** window is in the new folder (the one you just copied from the USB stick).

Paste one line at a time. Press **Enter** after each line. Wait until the cursor comes back before the next line.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
Stop-ScheduledTask -TaskName "MuditaHospitalAPI"
Get-Process mudita-api -ErrorAction SilentlyContinue | Stop-Process -Force
.\install-server.ps1
```

What each line does:

1. Allows the installer in this window only.
2. Turns off the job named **MuditaHospitalAPI**. That job is what starts the server when the computer switches on. Turning it off does not delete records.
3. Closes the old server program if it is still open.
4. Installs the new program into `C:\MuditaHospital\Server`, then starts the server again.

A red line that says the task **MuditaHospitalAPI** was not found means this computer does not have the old server. Use section 5 instead.

When the text says **Install complete**, repeat section 6. Open the clinic program and confirm that old bills are still there.

The same Server IP still works. Desk computers do not need a new number unless section 9 shows that the number itself changed.

## 9. Find the Server IP again later

Use this when the paper note is lost.

1. Click the **Windows** button.
2. Type `settings`. Click **Settings**.
3. Click **Network & internet**.
4. If this computer uses a cable, click **Ethernet**. If it uses Wi-Fi, click **Wi-Fi**, then click the connected network name.
5. Find **IPv4 address**. Write that number down. That number is the Server IP.

Skip a number that is `127.0.0.1`. Skip a number that starts with `169.254`. Those are not the Server IP for other computers.

You can also open Edge and visit `http://127.0.0.1:8080/api/health` on the server computer. A page with `"status":"ok"` means the server program is running. That page does not show the number the other computers need. The **IPv4 address** in Settings is that number.

## 10. Keep the same number

Other computers save the Server IP. If this computer picks a new number by itself after a restart, every desk will say the server is offline.

Set the number only when someone who looks after the network has told you it changes, or after the desks have already lost the connection for that reason.

1. Follow section 9 until you see **IPv4 address**. Write down the number you already use, and write down **Gateway** if a gateway number is shown.
2. Find **IP assignment** (Windows 11) or **IP settings**. Click **Edit**.
3. Choose **Manual**. Turn **IPv4** on.
4. **IP address:** the same number you wrote down. Do not invent a new one.
5. **Subnet mask:** `255.255.255.0` (some screens ask for subnet prefix length `24`, which is the same mask).
6. **Gateway:** the gateway you wrote down. If you never saw a gateway, leave it empty.
7. Click **Save**.

If this computer then loses the network, go back to the same screen and set IP assignment to **Automatic (DHCP)**.

On Windows 10 the same settings are often here: **Settings** → **Network & Internet** → **Ethernet** → **Change adapter options** → right-click **Ethernet** → **Properties** → **Internet Protocol Version 4 (TCP/IPv4)** → **Properties** → **Use the following IP address**.

## 11. Every morning

1. Switch this computer on.
2. Leave it on for the whole day.
3. Do not open PowerShell. The server starts by itself.

The other desks can work only while this computer is on and connected to the same network.

## 12. Leave these alone

- Leave the folder `C:\MuditaHospital\Server` where it is. The **data** folder inside it is the hospital records.
- Leave `uninstall-server.ps1` unopened. That file can remove the server. One of its options erases the records.
- Leave other computers’ files out of the **data** folder. Do not replace `mudita.db` with a file from a laptop.

---

# ဆာဗာကို တပ်ဆင်ပြီး ဖွင့်နည်း

ဒီစာကို **အမြဲဖွင့်ထားရမည့် ကွန်ပျူတာတစ်လုံး** ပေါ်မှာ ဖတ်ပါ။ လူနာမှတ်တမ်း၊ ဘေလ်၊ ဆေးဆိုင်ပစ္စည်းစာရင်းတွေဟာ ဒီကွန်ပျူတာထဲမှာပဲ ရှိပါတယ်။ တခြားကွန်ပျူတာတွေက မျက်နှာပြင်ကိုပဲ ပြပါတယ်။ မှတ်တမ်းကို သူတို့ဆီမှာ မသိမ်းပါ။

ဆေးခန်းပရိုဂရမ်နဲ့ ဒက်ရှ်ဘုတ်ကို မတပ်ဆင်ခင် ဆာဗာကို အရင်လုပ်ပါ။

ပုံနှိပ်စာရွက်က ဒီဖိုလ်ဒါထဲက [server.pdf](server.pdf) ပါ။ ဖတ်ရန် သို့မဟုတ် ပုံနှိပ်ရန် နှစ်ချက်နှိပ်ပါ။

အများစုကို မောက်စ်နဲ့ လုပ်ပါတယ်။ အပိုင်းတစ်ခုမှာ **Windows PowerShell** လို့ခေါ်တဲ့ အပြာရောင်ပြတင်းပေါက်ကို သုံးပါတယ်။ ပြတင်းပေါက်ခေါင်းစဉ်မှာ **Administrator** လို့ ပါရပါမယ်။

ကူးထည့်ရမည့် စာကြောင်းတွေကို အင်္ဂလိပ်အတိုင်းပဲ ထားပါ။ ကွန်ပျူတာက အဲဒီစာလုံးတွေကိုပဲ နားလည်ပါတယ်။ ခလုတ်နာမည်တွေဖြစ်တဲ့ **Yes**၊ **Unblock**၊ **Run as administrator** ဟာ အင်္ဂလိပ် Windows မျက်နှာပြင်မှာ အဲဒီအတိုင်း ပေါ်ပါတယ်။

---

## 1. ဆာဗာဖိုလ်ဒါကို ဒီကွန်ပျူတာပေါ် ကူးပါ

ယူအက်စ်ဘီက ဖိုင်သယ်ဖို့ပါ။ ယူအက်စ်ဘီထဲကနေ ဆာဗာကို ဖွင့်ပြီးမှ ယူအက်စ်ဘီကို ပြန်ဖြုတ်ရင် ဆေးရုံပရိုဂရမ် ရပ်သွားပါတယ်။

1. ယူအက်စ်ဘီကို တပ်ပါ။
2. ယူအက်စ်ဘီကို ဖွင့်ပါ။ `install-server.ps1` ပါတဲ့ ဆာဗာဖိုလ်ဒါကို ဖွင့်ပါ။
3. ဖိုင်တစ်ခုမှ မရွေးမိအောင် ပြတင်းပေါက်ထဲက နေရာလွတ်ကို တစ်ချက်နှိပ်ပါ။
4. **Ctrl** ခလုတ်ကို ဖိထားပြီး **A** ကို နှိပ်ပါ။ ဖိုင်အားလုံး လင်းလာပါတယ်။ **Ctrl** ကို လွှတ်ပါ။
5. လင်းနေတဲ့ဖိုင်တစ်ခုကို ညာဘက်နှိပ်ပါ။ **Copy** ကို နှိပ်ပါ။
6. **This PC** ကို ဖွင့်ပါ။
7. **Windows (C:)** သို့မဟုတ် **Local Disk (C:)** ကို ဖွင့်ပါ။
8. နေရာလွတ်ကို ညာဘက်နှိပ်ပါ။ **New** ကို နှိပ်ပြီး **Folder** ကို နှိပ်ပါ။
9. `Mudita` လို့ ရိုက်ပြီး **Enter** နှိပ်ပါ။
10. **Mudita** ဖိုလ်ဒါကို ဖွင့်ပါ။
11. နေရာလွတ်ကို ညာဘက်နှိပ်ပါ။ **Paste** ကို နှိပ်ပါ။
12. ကူးပြီးတဲ့အထိ စောင့်ပါ။

Server IP ကို စာရွက်ပေါ် ရေးပြီးမှ ယူအက်စ်ဘီကို ဖြုတ်ပါ (အပိုင်း ၆)။

## 2. တပ်ဆင်ဖိုင်ကို ခွင့်ပြုပါ

တခြားကွန်ပျူတာက လာတဲ့ဖိုင်ကို Windows က တစ်ခါတစ်ရံ ပိတ်ထားပါတယ်။

1. `C:\Mudita` ကို ဖွင့်ပါ (ဖိုင်တွေကို ကူးထားတဲ့နေရာ)။
2. `install-server.ps1` ကို ရှာပါ။
3. ညာဘက်နှိပ်ပါ။ **Properties** ကို နှိပ်ပါ။
4. **General** စာမျက်နှာရဲ့ အောက်ဆုံးမှာ **Unblock** အကွက်ကို ရှာပါ။
5. **Unblock** ကို မြင်ရင် အမှန်ခြစ်ပါ။ **OK** နှိပ်ပါ။
6. **Unblock** မမြင်ရင် **OK** နှိပ်ပြီး ရှေ့ဆက်ပါ။ ဖိုင်က ခွင့်ပြုပြီးသားပါ။

အပြာနဲ့ အဝါပြတင်းပေါက်က **Windows protected your PC** လို့ ပြရင် **More info** ကို နှိပ်ပါ။ ပြီးရင် **Run anyway** ကို နှိပ်ပါ။

## 3. Windows PowerShell ကို အက်ဒမင်အဖြစ် ဖွင့်ပါ

1. မျက်နှာပြင်အောက်က **Windows** ခလုတ်ကို နှိပ်ပါ (လေးထောင့်ပုံ၊ သို့မဟုတ် ကီးဘုတ်ပေါ်က Windows ပုံ)။
2. `powershell` လို့ ရိုက်ပါ။ **Enter** မနှိပ်ရသေးပါ။
3. စာရင်းထဲမှာ **Windows PowerShell** ပေါ်လာပါတယ်။
4. **Windows PowerShell** ကို ညာဘက်နှိပ်ပါ။
5. **Run as administrator** ကို နှိပ်ပါ။ ကွန်ပျူတာကို ပြင်ခွင့်နဲ့ ဖွင့်တဲ့ခလုတ်ပါ။
6. **Do you want to allow this app to make changes to your device?** လို့ မေးရင် **Yes** နှိပ်ပါ။
7. အပြာရောင်ပြတင်းပေါက် ပွင့်လာပါတယ်။ အပေါ်ခေါင်းစဉ်မှာ **Administrator** လို့ ပါပါတယ်။

ဒီအပြာပြတင်းပေါက်ကို ပိတ်မထားပါနဲ့။ စာကြောင်းတွေကို ဒီထဲကို ကူးထည့်ပါမယ်။

## 4. ဆာဗာဖိုလ်ဒါထဲကို ဝင်ပါ

အပြာပြတင်းပေါက်ဟာ သင်ကူးထားတဲ့ဖိုလ်ဒါကို ကြည့်နေရပါမယ်။

1. `install-server.ps1` မြင်ရအောင် **Mudita** ဖိုလ်ဒါကို ပုံမှန်ဖိုလ်ဒါပြတင်းပေါက်မှာ ဖွင့်ပါ။
2. အဲဒီဖိုလ်ဒါပြတင်းပေါက်ရဲ့ အပေါ်က ရှည်လျားတဲ့ အဖြူကွက်ကို တစ်ချက်နှိပ်ပါ။ စာတစ်ကြောင်းလုံး အပြာဖြစ်သွားပါတယ်။ အဲဒါက ဖိုလ်ဒါနေရာပါ။
3. အပြာစာကြောင်းကို ညာဘက်နှိပ်ပါ။ **Copy** ကို နှိပ်ပါ။
4. အပြာရောင် PowerShell ပြတင်းပေါက်ထဲကို နှိပ်ပါ။
5. `cd` ရိုက်ပါ၊ နေရာလွတ်တစ်ချက်၊ ပြီးရင် အဖွင့်မျက်တောင် `"` ရိုက်ပါ။ မျက်တောင်နောက်မှာ ဘာမှ မပါသေးပါ။ ဒီလို ပုံစံပါ။

```text
cd "
```

6. ဖိုလ်ဒါနေရာကို ကူးထည့်ပါ။ **Ctrl** ကို ဖိပြီး **V** နှိပ်ပါ။ ဘာမှ မပေါ်ရင် အပြာပြတင်းပေါက်ထဲကို ညာဘက်တစ်ချက်နှိပ်ပါ။
7. အပိတ်မျက်တောင် `"` ကို ရိုက်ပါ။
8. **Enter** နှိပ်ပါ။

နောက်တစ်ကြောင်းမှာ အဲဒီဖိုလ်ဒါနေရာ ပြန်ပေါ်ရပါမယ်။ အနီရောင်စာပေါ်ရင် မျက်တောင်မပါလို့ပါ။ `cd "` ကြောင်းကို ပြန်ရိုက်ပါ။

## 5. ဒီကွန်ပျူတာမှာ ပထမဆုံးအကြိမ်

ဒီကွန်ပျူတာမှာ Mudita Hospital ကို တစ်ခါမှ မဖွင့်ဖူးရင် ဒီအပိုင်းကို သုံးပါ။

အပြာပြတင်းပေါက်ကို နှိပ်ပါ။ ပထမစာကြောင်းကို ကူးထည့်ပြီး **Enter** နှိပ်ပါ။ ကာဆာပြန်လာမှ ဒုတိယစာကြောင်းကို ကူးထည့်ပြီး **Enter** နှိပ်ပါ။

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\install-server.ps1
```

ပထမစာကြောင်းက ဒီပြတင်းပေါက်ထဲမှာ တပ်ဆင်ဖိုင်ကို ခွင့်ပြုပါတယ်။ ကွန်ပျူတာတစ်လုံးလုံးကို မပြောင်းပါ။

ဒုတိယစာကြောင်းက ဆာဗာကို တပ်ဆင်ပါတယ်။ စောင့်ပါ။ စာတွေ တက်လာပါမယ်။ စာတက်တာ ရပ်တဲ့အထိ ပြတင်းပေါက်ကို ပိတ်မထားပါနဲ့။

**Install complete.** လို့ မြင်ရပါမယ်။ နောက်ပြီး ဒီစာကြောင်းတွေလည်း မြင်ရပါမယ်။

- **Folder:** `C:\MuditaHospital\Server`
- **Health:** `http://127.0.0.1:8080/api/health`
- **LAN:** နဲ့ စတဲ့ စာကြောင်း တစ်ကြောင်း သို့မဟုတ် အများကြီး

အပိုင်း ၆ ကို ဆက်ပါ။

စာက အနီရောင်ဖြစ်ရင် အပိုင်း ၇ ကို သွားပါ။ ဒီကွန်ပျူတာမှာ Mudita Hospital ရှိနှင့်ပြီးသားဆိုရင် ဒီစာကြောင်းတွေကို ဖွင့်ထားတဲ့ဆာဗာပေါ် ထပ်မလုပ်ပါနဲ့။ အပိုင်း ၈ ကို သုံးပါ။

## 6. Server IP ကို ရေးမှတ်ပါ

ဒီကွန်ပျူတာဘေးက စာရွက်ပေါ်မှာ **LAN:** နဲ့ စတဲ့ စာကြောင်းတိုင်းကို ရေးပါ။

Server IP က အဲဒီစာကြောင်းမှာ `http://` နဲ့ `:8080` ကြားက နံပါတ်ပါ။

ဥပမာ စာကြောင်းက `http://192.168.1.10:8080/api/health` ဆိုရင် Server IP က `192.168.1.10` ပါ။

- `192.168` နဲ့ စတဲ့နံပါတ်ကို မြင်ရင် အဲဒါကို ရေးပါ။
- `10.` သို့မဟုတ် `172.` နဲ့ စတဲ့နံပါတ်ပဲ မြင်ရင် အဲဒီနံပါတ်ကို ရေးပါ။
- `127.0.0.1` က **Health** စာကြောင်းပါ။ တခြားကွန်ပျူတာတွေက `127.0.0.1` ကို မသုံးရပါ။ **ဒီကွန်ပျူတာမှာပဲ** ဆေးခန်းပရိုဂရမ် တပ်ရင် LAN နံပါတ်အစား **ဤကွန်ပျူတာ (127.0.0.1)** ခလုတ်ကို နှိပ်ပါတယ်။ အဲဒါက ဆေးခန်းလမ်းညွှန်ထဲမှာ ပါတယ်။

**LAN** စာကြောင်း မပေါ်ရင် ကြိုးမတပ်ရသေးတာ သို့မဟုတ် Wi-Fi ပိတ်နေတာ ဖြစ်နိုင်ပါတယ်။ ကြိုးတပ်ပြီး အပိုင်း ၅ က စာကြောင်းနှစ်ကြောင်းကို ပြန်လုပ်ပါ။

ဆာဗာ အလုပ်လုပ်နေသလား စစ်ပါ။

1. **Microsoft Edge** ကို ဖွင့်ပါ (အပြာနဲ့ အစိမ်းရောင် ဝဲလုံးပုံ)။
2. အပေါ်က ရှည်လျားတဲ့အကွက်ကို နှိပ်ပါ။
3. `http://127.0.0.1:8080/api/health` လို့ ရိုက်ပြီး **Enter** နှိပ်ပါ။
4. စာမျက်နှာမှာ `"status":"ok"` နဲ့ `"db":"ok"` ပါရပါမယ်။

အဲဒါကို မြင်ရင် အပြာပြတင်းပေါက်ကို ပိတ်လို့ ရပါပြီ။ စာရိုက်ပြီး ပိတ်စရာ မလိုပါ။ အပြာပြတင်းပေါက်က **X** ကို နှိပ်ပါ။

ဆာဗာ တပ်ပြီးပါပြီ။ ဒီကွန်ပျူတာကို နောက်တစ်ခါ ဖွင့်ရင် ဆာဗာက သူ့ဖာသာ ပြန်စပါတယ်။ မနက်တိုင်း `mudita-api` ကို ကိုယ်တိုင် ဖွင့်စရာ မလိုပါ။

## 7. အပြာပြတင်းပေါက်မှာ အမှားပေါ်ရင်

အနီရောင်စာကို ဖတ်ပြီး ကိုက်ညီတဲ့အဆင့်ကို လုပ်ပါ။ ပြီးရင် အပိုင်း ၅ က စာကြောင်းနှစ်ကြောင်းကို ပြန်လုပ်ပါ။

**running scripts is disabled** လို့ ပါရင်

အပိုင်း ၅ ရဲ့ ပထမစာကြောင်းကို ကျော်သွားတာ၊ သို့မဟုတ် Windows PowerShell မဟုတ်တဲ့ ပြတင်းပေါက်ထဲ ကူးထည့်မိတာပါ။ ပြတင်းပေါက်ကို ပိတ်ပါ။ အပိုင်း ၃၊ ၄၊ ၅ ကို ပြန်လုပ်ပါ။ ခေါင်းစဉ်မှာ **Administrator** ပါရပါမယ်။

**Not digitally signed** သို့မဟုတ် **operation is blocked** လို့ ပါရင်

အပိုင်း ၂ (**Unblock** အမှန်ခြစ်) ကို ပြန်လုပ်ပါ။ ပြီးရင် အပိုင်း ၃၊ ၄၊ ၅ ကို ပြန်လုပ်ပါ။

**Administrator** နဲ့ ဖွင့်ရမယ်လို့ ပါရင်၊ သို့မဟုတ် **Access is denied** လို့ ပါရင်

အပြာပြတင်းပေါက်ကို **Run as administrator** မပါဘဲ ဖွင့်ထားပါတယ်။ ပိတ်ပါ။ အပိုင်း ၃ ကို ပြန်လုပ်ပြီး ခွင့်ပြုမေးတဲ့ပြတင်းပေါက်မှာ **Yes** နှိပ်ပါ။ ပြီးရင် အပိုင်း ၄ နဲ့ ၅ ကို ပြန်လုပ်ပါ။

**mudita-api.exe not found** လို့ ပါရင်

အပြာပြတင်းပေါက်က ကူးထားတဲ့ဖိုလ်ဒါထဲမှာ မရှိပါ။ အပိုင်း ၄ ကို ပြန်လုပ်ပါ။ တပ်ဆင်စာကြောင်းကို မကူးခင် အဲဒီဖိုလ်ဒါထဲမှာ `install-server.ps1` ကို မြင်ရပါမယ်။

ဖိုင်ကို တခြားပရိုဂရမ်က သုံးနေလို့ **cannot access the file** လို့ ပါရင်

ဒီကွန်ပျူတာမှာ Mudita ဖွင့်နေပြီးပါပြီ။ အပိုင်း ၈ ကို သုံးပါ။

## 8. ဒီကွန်ပျူတာမှာ Mudita ရှိပြီးသား (အသစ်ပြောင်းခြင်း)

`C:\MuditaHospital\Server` ရှိပြီး ဆေးရုံမှတ်တမ်းတွေ ရှိနေရင် ဒီအပိုင်းကို သုံးပါ။

တပ်ဆင်ဖိုင်က ပရိုဂရမ်ကိုပဲ အစားထိုးပါတယ်။ ဒီအရာတွေကို မထိပါ။

- `C:\MuditaHospital\Server\data` (မှတ်တမ်းများ)
- `C:\MuditaHospital\Server\backups`
- `C:\MuditaHospital\Server\config.json`

ပရိုဂရမ်အသစ်က ပထမဆုံးစတဲ့အခါ မှတ်တမ်းတွေကို သူ့ဖာသာ ပြင်ပါတယ်။ ဒေတာဘေ့စ်ဖိုင်ကို ကူးစရာမလိုပါ။ ဖျက်စရာလည်း မလိုပါ။

### 8.1 အရင်ဆုံး backups ကို ယူအက်စ်ဘီပေါ် ကူးပါ

1. **This PC** ကို ဖွင့်ပါ။ **Windows (C:)**၊ **MuditaHospital**၊ **Server** ကို ဆင့်ဖွင့်ပါ။
2. **backups** ဖိုလ်ဒါကို ညာဘက်နှိပ်ပါ။ **Copy** နှိပ်ပါ။
3. ယူအက်စ်ဘီကို ဖွင့်ပါ။ နေရာလွတ်ကို ညာဘက်နှိပ်ပါ။ **Paste** နှိပ်ပါ။
4. ကူးပြီးတဲ့အထိ စောင့်ပါ။ ပြီးမှ ယူအက်စ်ဘီကို ဖြုတ်ပါ။

### 8.2 ဆာဗာအဟောင်းကို ရပ်ပြီးမှ ပြန်တပ်ပါ

ပရိုဂရမ်အဟောင်းက သူ့ဖိုင်ကို ကိုင်ထားပါတယ်။ ပရိုဂရမ်အဟောင်းကို ရပ်မှ ဖိုင်အသစ်ကို ကူးလို့ ရပါတယ်။ ရပ်လိုက်လို့ မှတ်တမ်းမပျက်ပါ။

အပြာရောင် **Administrator** ပြတင်းပေါက်ဟာ ယူအက်စ်ဘီက အသစ်ကူးထားတဲ့ဖိုလ်ဒါထဲမှာ ရှိအောင် အပိုင်း ၂၊ ၃၊ ၄ ကို ပြန်လုပ်ပါ။

တစ်ကြောင်းချင်း ကူးထည့်ပါ။ ကြောင်းတိုင်းနောက် **Enter** နှိပ်ပါ။ ကာဆာပြန်လာမှ နောက်တစ်ကြောင်းကို ကူးပါ။

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
Stop-ScheduledTask -TaskName "MuditaHospitalAPI"
Get-Process mudita-api -ErrorAction SilentlyContinue | Stop-Process -Force
.\install-server.ps1
```

စာကြောင်းတစ်ကြောင်းစီက ဘာလုပ်သလဲ။

1. ဒီပြတင်းပေါက်ထဲမှာ တပ်ဆင်ဖိုင်ကို ခွင့်ပြုပါတယ်။
2. **MuditaHospitalAPI** အလုပ်ကို ပိတ်ပါတယ်။ ကွန်ပျူတာဖွင့်တိုင်း ဆာဗာကို စပေးတဲ့အလုပ်ပါ။ ပိတ်လိုက်လို့ မှတ်တမ်းမပျက်ပါ။
3. ဆာဗာအဟောင်း ဖွင့်နေသေးရင် ပိတ်ပါတယ်။
4. ပရိုဂရမ်အသစ်ကို `C:\MuditaHospital\Server` ထဲ တပ်ပြီး ဆာဗာကို ပြန်ဖွင့်ပါတယ်။

**MuditaHospitalAPI** အလုပ်ကို ရှာမတွေ့ဘူးလို့ အနီရောင်ပေါ်ရင် ဒီကွန်ပျူတာမှာ ဆာဗာအဟောင်း မရှိပါ။ အပိုင်း ၅ ကို သုံးပါ။

**Install complete** လို့ ပေါ်ရင် အပိုင်း ၆ ကို ပြန်လုပ်ပါ။ ဆေးခန်းပရိုဂရမ်ကို ဖွင့်ပြီး ဘေလ်အဟောင်းတွေ ရှိသေးသလား ကြည့်ပါ။

Server IP က အရင်အတိုင်း သုံးလို့ ရပါတယ်။ နံပါတ်ကိုယ်တိုင် ပြောင်းသွားမှပဲ (အပိုင်း ၉) စားပွဲကွန်ပျူတာတွေမှာ နံပါတ်အသစ် လိုပါတယ်။

## 9. Server IP ကို နောက်မှ ပြန်ရှာခြင်း

စာရွက်ပျောက်ရင် ဒီအပိုင်းကို သုံးပါ။

1. **Windows** ခလုတ်ကို နှိပ်ပါ။
2. `settings` လို့ ရိုက်ပါ။ **Settings** ကို နှိပ်ပါ။
3. **Network & internet** ကို နှိပ်ပါ။
4. ကြိုးသုံးရင် **Ethernet** ကို နှိပ်ပါ။ Wi-Fi သုံးရင် **Wi-Fi** ကို နှိပ်ပြီး ချိတ်ထားတဲ့ ကွန်ရက်နာမည်ကို နှိပ်ပါ။
5. **IPv4 address** ကို ရှာပါ။ အဲဒီနံပါတ်ကို ရေးမှတ်ပါ။ အဲဒါက Server IP ပါ။

`127.0.0.1` ကို ကျော်ပါ။ `169.254` နဲ့ စတဲ့နံပါတ်ကိုလည်း ကျော်ပါ။ အဲဒါတွေက တခြားကွန်ပျူတာအတွက် Server IP မဟုတ်ပါ။

ဆာဗာကွန်ပျူတာပေါ်က Edge မှာ `http://127.0.0.1:8080/api/health` ကို ဖွင့်ကြည့်လို့ ရပါတယ်။ `"status":"ok"` ပါရင် ဆာဗာပရိုဂရမ် အလုပ်လုပ်နေပါတယ်။ အဲဒီစာမျက်နှာက တခြားကွန်ပျူတာတွေ လိုတဲ့နံပါတ်ကို မပြပါ။ Settings ထဲက **IPv4 address** က အဲဒီနံပါတ်ပါ။

## 10. နံပါတ်ကို မပြောင်းအောင် ထားခြင်း

တခြားကွန်ပျူတာတွေက Server IP ကို မှတ်ထားပါတယ်။ ဒီကွန်ပျူတာက ပြန်ဖွင့်တိုင်း နံပါတ်အသစ် ယူသွားရင် စားပွဲတိုင်းမှာ ဆာဗာမရဘူးလို့ ပေါ်ပါမယ်။

ကွန်ရက်ကို ကြည့်တဲ့သူက နံပါတ်ပြောင်းတတ်တယ်လို့ ပြောမှ၊ သို့မဟုတ် ဒီအကြောင်းကြောင့် စားပွဲတွေ ချိတ်လွှတ်ပြီးမှသာ နံပါတ်သတ်မှတ်ပါ။

1. **IPv4 address** မြင်ရတဲ့အထိ အပိုင်း ၉ ကို လုပ်ပါ။ အခုသုံးနေတဲ့နံပါတ်ကို ရေးပါ။ **Gateway** နံပါတ် ပေါ်ရင် အဲဒါကိုလည်း ရေးပါ။
2. **IP assignment** (Windows 11) သို့မဟုတ် **IP settings** ကို ရှာပါ။ **Edit** နှိပ်ပါ။
3. **Manual** ကို ရွေးပါ။ **IPv4** ကို ဖွင့်ပါ။
4. **IP address:** ရေးမှတ်ထားတဲ့ နံပါတ်အတိုင်း ထည့်ပါ။ နံပါတ်အသစ် မတီပါနဲ့။
5. **Subnet mask:** `255.255.255.0` (တစ်ချို့မျက်နှာပြင်က subnet prefix length `24` ကို မေးပါတယ်။ အဲဒါက အတူတူပါပဲ)။
6. **Gateway:** ရေးမှတ်ထားတဲ့ gateway။ gateway တစ်ခါမှ မမြင်ရင် ကွက်လပ်ထားပါ။
7. **Save** နှိပ်ပါ။

ဒီနောက် ကွန်ရက်ပြတ်သွားရင် အဲဒီမျက်နှာပြင်ကို ပြန်သွားပြီး IP assignment ကို **Automatic (DHCP)** ပြန်ထားပါ။

Windows 10 မှာ ဒီနေရာမှာ ရှိတတ်ပါတယ်။ **Settings** → **Network & Internet** → **Ethernet** → **Change adapter options** → **Ethernet** ကို ညာဘက်နှိပ် → **Properties** → **Internet Protocol Version 4 (TCP/IPv4)** → **Properties** → **Use the following IP address**။

## 11. မနက်တိုင်း

1. ဒီကွန်ပျူတာကို ဖွင့်ပါ။
2. တစ်နေ့လုံး ဖွင့်ထားပါ။
3. PowerShell ကို ဖွင့်စရာ မလိုပါ။ ဆာဗာက သူ့ဖာသာ စပါတယ်။

ဒီကွန်ပျူတာ ဖွင့်ထားပြီး ကွန်ရက်တူတူနဲ့ ချိတ်ထားမှ တခြားစားပွဲတွေ အလုပ်လုပ်နိုင်ပါတယ်။

## 12. ဒီအရာတွေကို မထိပါနဲ့

- `C:\MuditaHospital\Server` ဖိုလ်ဒါကို ဒီအတိုင်း ထားပါ။ အထဲက **data** ဖိုလ်ဒါက ဆေးရုံမှတ်တမ်းပါ။
- `uninstall-server.ps1` ကို မဖွင့်ပါနဲ့။ အဲဒီဖိုင်က ဆာဗာကို ဖယ်နိုင်ပါတယ်။ ရွေးချယ်မှုတစ်ခုက မှတ်တမ်းတွေကို ဖျက်ပါတယ်။
- တခြားကွန်ပျူတာက ဖိုင်ကို **data** ဖိုလ်ဒါထဲ မထည့်ပါနဲ့။ လက်တော့ပ်က `mudita.db` နဲ့ အစားမထိုးပါနဲ့။
