# Tour index

Lesson scripts for the clinic as it runs today. Each file is one lesson. These markdown files do not change the app. The anchor ids below are the ones on the controls. `help-open` and `lang-switch` are reserved and unused. A lesson opens from Help. It does not start on login.

Button words in the scripts are the English and Myanmar strings in `client/src/shared/i18n.ts`. Retired actions (Pay & print, Confirm (F5), Print (F7) marks paid, Return & print, Pay cash → Print) are not taught.

Roles are the logins that may open the lesson. A desk login only sees its own module. Admin sees the full sidebar.

| Id | Roles | File | Depends on | Anchors |
|---|---|---|---|---|
| bill-buttons | Admin, OPD, OT, Pharmacy, and IPD. IPD only has the expense rail, so the Charge to IPD step skips. Patients has no bill rail. | [bill-buttons.md](bill-buttons.md) | none | `bill-save-draft`, `bill-print`, `bill-mark-paid`, `bill-charge-ipd`, `bill-void`, `bill-history`, `bill-new`, `bill-cancel` |
| charge-to-ipd | Admin, OPD, OT, and Pharmacy, on a sale desk. IPD Bill’s first button uses the same label and is taught on ipd-stay. Patients has no bill rail. Not on Return in. | [charge-to-ipd.md](charge-to-ipd.md) | bill-buttons, ipd-stay | `bill-charge-ipd`, `bill-mark-paid` |
| patient-chart | Admin and Patients. OPD, OT, Pharmacy, and IPD do not open Patient Charts. | [patient-chart.md](patient-chart.md) | none | `patient-create`, `patient-search`, `patient-attach` |
| ipd-stay | Admin and IPD. Patients, OPD, OT, and Pharmacy do not open Stays. | [ipd-stay.md](ipd-stay.md) | patient-chart | `ipd-admit`, `ipd-take-deposit`, `ipd-bill` |
| ipd-discharge | Admin and IPD. Patients, OPD, OT, and Pharmacy do not open Stays. | [ipd-discharge.md](ipd-discharge.md) | ipd-stay | `ipd-discharge` |
| pharmacy-item | Admin and Pharmacy. OPD, OT, Patients, and IPD do not open Drug Setup. | [pharmacy-item.md](pharmacy-item.md) | none | `pharmacy-pack`, `pharmacy-restock` |
| pharmacy-return | Admin and Pharmacy. OPD, OT, Patients, and IPD do not open Return in. | [pharmacy-return.md](pharmacy-return.md) | bill-buttons | `bill-save-draft`, `bill-print`, `pharmacy-return-mark` |
| pharmacy-transfer | Admin and Pharmacy. OPD, OT, Patients, and IPD do not open Transfer to OT. | [pharmacy-transfer.md](pharmacy-transfer.md) | bill-buttons | `pharmacy-transfer`, `pharmacy-transfer-confirm` |
| ot-cupboard | Admin and OT. Pharmacy, OPD, Patients, and IPD do not open this OT Maintenance screen. | [ot-cupboard.md](ot-cupboard.md) | pharmacy-transfer | `ot-cupboard`, `ot-return-pharmacy` |

The same anchor can appear in more than one step or lesson when it is the same control. `bill-save-draft` and `bill-print` are in bill-buttons and pharmacy-return. `bill-charge-ipd` and `bill-mark-paid` are in bill-buttons and charge-to-ipd.

Reserved anchors that no script uses yet: `help-open`, `lang-switch`. Do not invent a second name for an anchor in this list.

## Consistency

Checked against `docs/guidance/WORKFLOWS.md` and `client/src/shared/i18n.ts`.

- The restock hint is `toInStock`: “to In Stock” / “လက်ကျန်သို့”. `pharmacy-item.md` had paired that English with “လက်ကျန်”, which is `inStock` (“In Stock”). The bodies now use “လက်ကျန်သို့”. “In Stock” / “လက်ကျန်” stays where the script means the stock label.
- The OT stock page title is `maintenanceInventory`: “Inventory” / “စာရင်း”. `pharmacy-return.md` and `pharmacy-transfer.md` had “OT Inventory (စာရင်း)”. `otInventory` is a different string (“OT Inventory” / “OT စာရင်း”) on the OT bill line, not the stock page. Those sentences now say Inventory (စာရင်း).
- Every `data-guide` value in these files is in the reserved list. No new tours were added.
