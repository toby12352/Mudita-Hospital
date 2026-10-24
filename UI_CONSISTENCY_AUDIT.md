# Clinic UI consistency audit

Audit only. No application code was changed.

Scope is the clinic client (`client/`). The admin dashboard was not inspected.

## How this was checked

Rendered inspection used the running clinic dev server at `http://localhost:1420` (Vite listens on IPv6 `::1` only; `http://127.0.0.1:1420` refuses the connection).

| Item | Value |
|---|---|
| Layout viewport | 1440 × 900 CSS pixels |
| Device pixel ratio | 1 |
| Visual viewport scale | 1 |
| Page zoom | `1` (`document.documentElement` style `zoom: 1`) |
| Method | `getBoundingClientRect` and `getComputedStyle` on the live page, plus screenshots |

Screenshots from the audit browser are cropped to the browser panel (about 954 × 631). A control can be inside the 1440-wide layout and still fall outside the image. Dimensions below come from the 1440 × 900 layout, not from the cropped image. Where a screenshot and a measurement disagree, the measurement is the one to trust.

The clinic session expired near the end (`Your sign-in has expired`) while Settings → Training was open. Measurements taken before that still stand. Training action buttons never rendered.

Focus styles on bill inputs were checked by forcing the `:focus` pseudo-class in DevTools. The audit browser reported `document.hasFocus() === false`, so a real keyboard focus ring was not photographed.

## Summary

| | Count |
|---|---|
| Surfaces discovered | 26 |
| Surfaces inspected in the browser | 11 |
| Confirmed issues | 17 |
| Suspected or needs a manual look | 5 |
| Issues total | 22 |

### By category

| Category | Issues |
|---|---|
| Control height | UI-001, UI-002, UI-003, UI-004, UI-005, UI-022 |
| Alignment | UI-007, UI-008, UI-009 |
| Spacing | UI-006 |
| Tables | UI-010, UI-011 |
| Icons | UI-012, UI-013 |
| Corner radius | UI-014, UI-015 |
| Typography | UI-016, UI-017 |
| Interactive states | UI-018, UI-019 |
| Borders and selects | UI-020, UI-021 |

### By severity

| Severity | Count | Issues |
|---|---|---|
| Critical | 0 | — |
| High | 4 | UI-003, UI-006, UI-010, UI-012 |
| Medium | 11 | UI-001, UI-002, UI-004, UI-005, UI-007, UI-008, UI-009, UI-011, UI-014, UI-016, UI-018 |
| Low | 7 | UI-013, UI-015, UI-017, UI-019, UI-020, UI-021, UI-022 |

### Top 10 most noticeable

1. **UI-006** — Settings “Create user” and “Save hospital settings”, and Drug Setup “Restock”, stretch to the full width of the form (about 800–1360px).
2. **UI-003** — Settings → Users search field is 44px tall; the Search button beside it is 32px, with bottoms aligned and tops 12px apart.
3. **UI-010** — Drug Setup code column is 72px. `TESTPACK1` paints into the name column. `DEMO-GLOVE` and `DEMO-NS` wrap mid-code.
4. **UI-012** — OPD bill shows “+ + Consultation” (plus icon plus a label that already starts with “+”).
5. **UI-002** — On every bill cart measured, the medicine/service field is 26.8px and the Qty field is 23.6px.
6. **UI-007** — Pharmacy “Patient name *” wraps inside an 88px label column, so that row is much taller than Phone, Age, and Gender.
7. **UI-001** — Header language buttons are 29.7px; Help, Log out, and Server IP are 32.9px.
8. **UI-009** — OPD Doctor Info “Edit” is centered in the wide detail pane, far from the fields.
9. **UI-008** — “Buy Price (Per Box)” and “Sell Price (Per Tablet)” wrap to extra lines in the 7.5rem label column.
10. **UI-011** — List rows jump from about 34px to 57px when a name wraps (OPD doctors, OT cupboard).

### Shared sources

| Source | Issues |
|---|---|
| `.field` / `.list-toolbar` paired with `.btn.action` | UI-003, UI-005 |
| `.card-form` and `.drug-setup-panel-form` (`flex-direction: column`, default `align-items: stretch`) | UI-006 |
| `BillLineGrid` entry row (`.bill-line-typeahead input` vs `.qty-input`) | UI-002, UI-013, UI-022 |
| Fixed label columns (`.opd-bill-label` 5.5rem, `.drug-info-label` 7.5rem) | UI-007, UI-008 |
| `.drug-setup-table` code column `4.5rem` | UI-010 |
| `.btn-row.drug-setup-actions` (`flex-direction: column` plus `.btn-row`’s `align-items: center`) | UI-009 |
| `.lang-compact .btn` vs `.btn.compact` | UI-001 |
| `DialogCloseButton` / `.alert-dialog-close` | UI-014 |
| Two focus recipes (2px outline vs 3px ring) and several controls with neither | UI-018 |

### Suggested fix order

1. **UI-006** — Stop column flex from stretching submit buttons. One rule fixes Hospital, Users, Doctors, Services, Backup, and Drug Setup Restock.
2. **UI-003 and UI-004** — Give toolbar search fields and their Search buttons one height and one radius.
3. **UI-010** — Widen the code column, or keep codes on one line with ellipsis, so they cannot run into the name.
4. **UI-012** — Remove the extra plus from the consultation label, or drop the icon.
5. **UI-002** — Use one padding and line-height for the cart code field, Qty field, unit select, and row delete control.
6. **UI-007 and UI-008** — Widen label columns, or allow labels to sit above the field when the text does not fit.
7. **UI-009** — Make maintenance action rows left-aligned horizontal groups, matching Drug Setup Edit / Delete.
8. **UI-001** — Use `.btn.compact` padding for the language buttons as well.
9. **UI-014, UI-016, UI-018** — Decide the dialog close shape, placeholder color, and one focus ring.
10. **UI-005, UI-013, UI-015, UI-017, UI-022** — Check on screen, then align only if they still look wrong.

### Surfaces that were not inspected

Not opened, or opened only as source:

- Pharmacy Return in, Pharmacy Transfer to OT (same bill form as Sales; cart issue is expected there)
- Pharmacy filter row, item create/edit form, item history
- OPD Services tab, OPD catalog history, OPD bill history dialog
- OT bill history
- V.Delete dialog (not opened, so nothing was voided)
- Settings → Doctors, Services, Backup
- Settings → Training action buttons (tab opened after the session expired)
- Help overlay, Server IP popover, login, change-password, server setup, print preview, alert dialog body
- `HomePage` and `ReportsPage` exist under `client/src/pages/` but are not mounted from `client/src/app/App.tsx`

### Not treated as defects

These showed up in measurements and were left out of the issue list on purpose.

- Pay & print is 49.8px and the other rail buttons are 38.4px because Pay & print has a second line of text (“Marks paid”). Same padding, same radius (6px), same 13px label.
- `.btn.action` at 12px radius is what `docs/standards/FRONTEND.md` asks for. UI-015 only flags that radius when it sits in the same row as a 5px input.
- Bill desks set `--radius-control: 6px`. The rest of the clinic uses 5px. That split is written into the bill tokens.
- The date-picker wrap on Drug Setup is 34.13px, the same height as `.drug-info-input`.
- Gender `<select>` is 31.9px and the text inputs beside it are 31.2px (0.7px). That is native select chrome, not a separate size variant.
- Radio dots are the browser’s 13px control next to a 20px label. That is normal for a radio.
- The huge faint “NEW” watermark is intentional bill chrome.

## Issues

### UI-001 — Header language buttons are shorter than the buttons beside them

- **Module / screen:** Clinic chrome (every signed-in screen)
- **Controls:** English, မြန်မာ, Help, Log out, Server IP
- **Category:** Control height, alignment
- **Severity:** Medium
- **Status:** Confirmed

**Finding**

| Control | Height | Padding | Top |
|---|---|---|---|
| English, မြန်မာ (`.btn.ghost` inside `.lang-compact`) | 29.70px | 4px 8.8px | 12.7px |
| Help, Log out, Server IP (`.btn.ghost.compact`) | 32.89px | 5.6px 11.2px | 11.1px |

Difference: **3.19px**. Tops differ by about 1.6px, so the language buttons sit slightly low in the header.

**Expected:** One compact height for every button in `.desk-header-actions`.

**Source:** `.lang-compact .btn` padding `0.25rem 0.55rem` at `client/src/shared/styles/App.css` line 1366. `.btn.compact` padding `0.35rem 0.7rem` at line 852.

**Correction:** Use the same padding as `.btn.compact` on the language buttons.

**Manual check:** On any signed-in screen, compare the tops and bottoms of English and Help.

### UI-002 — Bill cart code field is taller than Qty

- **Module / screen:** Pharmacy Sales, OPD Bill, OT Bill. The same component is used by Pharmacy Return and Transfer to OT.
- **Controls:** `BillLineGrid` entry typeahead and `.qty-input`
- **Category:** Control height, alignment
- **Severity:** Medium
- **Status:** Confirmed on Sales, OPD, and OT. Return and Transfer were not opened.

**Finding** (same numbers on all three screens)

| Control | Height | Padding | Top (Pharmacy Sales) |
|---|---|---|---|
| Code / particular typeahead | 26.80px | 4px 5.6px | 504.48px |
| Qty | 23.58px | 2.4px 4.8px | 506.09px |

Difference: **3.22px**. The row itself is 37.59px (`2.35rem`). The code field is vertically centered, so it sticks out about 1.6px above and below Qty. Radius matches (6px). Font size matches (14px).

**Expected:** Code, Qty, unit, and the row delete control share one height inside the cart row.

**Source:**

- Typeahead padding `0.25rem 0.35rem` — `client/src/shared/styles/App.css` line 2234
- Qty padding `0.15rem 0.3rem` — line 2184
- Markup — `client/src/shared/BillLineGrid.tsx` lines 551–609

**Correction:** One padding and line-height token for cart inputs.

**Manual check:** Open Sales, Return, Transfer to OT, OPD Bill, and OT Bill. Compare the empty code field with the disabled Qty box on the entry row. No need to save a bill.

### UI-003 — Search field and Search button do not share a height

- **Module / screen:** Settings → Users. The same `.list-toolbar` pattern is in Settings → Doctors, Settings → Services, OPD catalog history, and item history.
- **Controls:** Typeahead input and `.btn.action` Search
- **Category:** Control height, spacing, corner radius
- **Severity:** High
- **Status:** Confirmed on Users. The other toolbars were not opened; they use the same classes.

**Finding** (Settings → Users, 1440 × 900)

| Control | Height | Top | Bottom | Radius | Font |
|---|---|---|---|---|---|
| “Username or name” input | 44.11px | 360.92px after scroll (640.92px before) | shared bottom | 6px | 14.72px |
| Search (`.btn.action`) | 31.67px | 12.44px lower than the input | same bottom as the input | 12px | 14.08px |

`.list-toolbar` is `align-items: flex-end` (`App.css` line 1096), so the shorter button sits on the input’s bottom edge. The input is also about 1253px wide, which pushes Search to the far right of the card.

Create-user inputs on the same screen are 44.11px and radius 6px. The Search button does not match them.

**Expected:** Search field and Search button use one height, one radius, and sit in a row that does not stretch the field across the whole card.

**Source:** `client/src/pages/settings/UsersTab.tsx` lines 133–165. Input sizing from `.field input` (`App.css` line 761) plus the settings override at line 944. Button from `.btn.action` at line 3117.

**Correction:** A toolbar size variant for both the field and the button, and `align-items: center`.

**Manual check:** Settings → Users, Doctors, and Services. Look at the search row under the form. Also open OPD Maintenance → History and Pharmacy Maintenance → Item history.

### UI-004 — Drug Setup filter field and Search button are different sizes

- **Module / screen:** Pharmacy, OPD, and OT maintenance filter rows
- **Controls:** `.drug-info-input` and `.btn.action` inside `.drug-setup-filter`
- **Category:** Control height, corner radius
- **Severity:** Medium
- **Status:** Suspected. The filter row was not opened. Both pieces were measured separately on Drug Setup.

**Finding**

On Drug Setup, `.drug-info-input` is **34.13px**, radius **5px**. `.btn.action` is **31.67px**, radius **12px**. `.drug-setup-filter` lays them out in one row with `align-items: center` (`App.css` line 3309). Expected on-screen difference is about **2.5px** plus the radius change.

**Source:** `client/src/pages/pharmacy/PharmacyPage.tsx` lines 297–329. The same filter block exists on the OPD and OT maintenance pages.

**Manual check:** Pharmacy → Maintenance → Filter. Compare the text field and the Search button.

### UI-005 — Solid primary and 12px action buttons share a row

- **Module / screen:** Settings → Doctors and Services (edit/cancel row). Settings → Training (seed and reset).
- **Controls:** `.btn.primary` next to `.btn.action`
- **Category:** Control height, corner radius
- **Severity:** Medium
- **Status:** Suspected. Computed from CSS. Training was open but the session had expired, so the buttons were not on screen.

**Finding**

`.btn` padding is `0.65rem 1rem` at 16px type, which comes out near **46px** tall and radius **5px** (`App.css` lines 800–804). `.btn.action` measured **31.67px** and radius **12px**. Training puts them in one `.btn-row` (`client/src/pages/settings/TrainingTab.tsx` lines 74–80). Settings doctors does the same when editing (`DoctorsTab.tsx` lines 131–138).

**Expected:** Buttons in one row use one height. The danger action can keep the red outline.

**Manual check:** Settings → Training, and Settings → Doctors while editing a doctor. Do not seed or reset training data.

### UI-006 — Submit buttons stretch to the full form width

- **Module / screen:** Settings → Hospital, Settings → Users, Pharmacy Drug Setup restock (and the same form pattern on Doctors, Services, Backup, and the item form)
- **Controls:** `.btn.primary` inside a column flex form
- **Category:** Spacing
- **Severity:** High
- **Status:** Confirmed

**Finding**

| Screen | Button | Width | Height | Radius |
|---|---|---|---|---|
| Settings → Hospital | Save hospital settings | 798.19px | 45.97px | 5px |
| Settings → Users | Create user | 1359.03px | 45.97px | 5px |
| Drug Setup restock | Restock | 1019.05px | 33.59px | 5px |

The parent is a column flex (`align-items` stays `stretch`):

- Settings: `.card-form` — measured `display: flex; flex-direction: column`
- Restock: `.drug-setup-panel-form` — `App.css` line 3058

Inputs on Hospital and Users are 44.11px and radius 6px, so the stretched button is also 1.9px taller, 1px less round, and 16px type instead of 14.72px. On Drug Setup the toolbar actions (NEW, Edit, Delete) are 31.67px and radius 12px, while Restock is a full-width 5px bar.

**Expected:** Submit buttons hug their label, or share a button row with the other actions. They should not span the card.

**Source:** `HospitalTab.tsx` line 113, `UsersTab.tsx` line 127, `PharmacyItemsTab.tsx` lines 603–609.

**Correction:** `align-self: flex-start` on those submits, or put them in a row that does not stretch its children.

**Manual check:** Settings → Hospital and Users (the blue bar under the fields). Pharmacy → Maintenance, select an item, open Restock, scroll to the submit button. Do not save or restock.

### UI-007 — “Patient name *” wraps in the bill label column

- **Module / screen:** Pharmacy Sales (also Return, which uses the same header)
- **Control:** `.opd-bill-label`
- **Category:** Alignment, spacing
- **Severity:** Medium
- **Status:** Confirmed

**Finding**

Every bill label is **88px** wide (`flex: 0 0 5.5rem`, `App.css` line 1991). “Patient name *” is **44.06px** tall. Phone, Age, Gender, and Remark labels are **25.22px**. The screenshot shows “Patient” on the first line and “name *” on the second, and that row is visibly taller. OPD uses the shorter label “ID/Name”, which stays on one line (25.22px).

**Expected:** Labels in one column stay on one line, or the column grows to fit the longest label.

**Source:** `client/src/pages/pharmacy/PharmacyBillForm.tsx` lines 107–108. CSS `App.css` lines 1991–1998.

**Manual check:** Pharmacy → Sales. Compare the Patient name row with Phone.

### UI-008 — Drug Setup labels wrap to two or three lines

- **Module / screen:** Pharmacy Drug Setup, OT Cupboard detail (same label class). OPD Doctor Info uses it for “Consultation (MMK)” and “OT fee (MMK)”.
- **Control:** `.drug-info-label`
- **Category:** Alignment
- **Severity:** Medium
- **Status:** Confirmed

**Finding**

The label column is `7.5rem` (`App.css` line 2950). On Drug Setup, “Buy Price (Per Box)” and “Sell Price (Per Tablet)” wrap. On OPD Doctor Info, “Consultation (MMK)” and “OT fee (MMK)” wrap. Short labels such as “Brand Name” stay on one line, so the rows do not line up.

**Expected:** One label line, with the column wide enough for the longest label used on that form.

**Source:** `PharmacyItemsTab.tsx` around lines 580–598. CSS line 2950.

**Manual check:** Pharmacy → Maintenance, select an item, scroll the detail pane to the restock prices. Also OPD → Maintenance → Doctors.

### UI-009 — Maintenance action buttons are centered in the detail pane

- **Module / screen:** OPD Doctors. OPD Services uses the same row class.
- **Control:** `.btn-row.drug-setup-actions`
- **Category:** Alignment
- **Severity:** Medium
- **Status:** Confirmed on Doctors. Services was not opened.

**Finding**

`.btn-row` sets `align-items: center` (line 889). `.drug-setup-actions` comes later and sets `flex-direction: column` (line 3033) without changing alignment. The Edit button is therefore centered across the detail pane. On the 1440px layout it sits far to the right of the fields. Pharmacy Drug Setup uses `.btn-row.drug-setup-action-row`, which stays a left-aligned row, so Edit / Delete / Restock sit under the fields.

**Expected:** OPD maintenance actions sit at the left, in a row, like Drug Setup.

**Source:** `OpdDoctorsPage.tsx` lines 336–345. `OpdServicesPage.tsx` line 322. CSS lines 889 and 3033.

**Manual check:** OPD → Maintenance → Doctors, and the Services tab. Compare with Pharmacy → Maintenance.

### UI-010 — Item codes wrap or collide with the name

- **Module / screen:** Pharmacy Drug Setup. OT Cupboard uses a 4.5rem code column as well.
- **Control:** `.drug-setup-table` first column
- **Category:** Tables
- **Severity:** High
- **Status:** Confirmed

**Finding**

The column is `4.5rem` (`App.css` line 2879), measured at **72px**, `white-space: normal`, `overflow: visible`.

| Code | What happened |
|---|---|
| DEMO-NS, DEMO-GLOVE, DEMO-PARA | Wrapped inside the 72px cell. Row text breaks as “DEMO-” / “NS”. |
| TESTPACK1 | `scrollWidth` 79px vs `clientWidth` 72px. The extra 7px paints over “Test Pack Item”, so the screenshot reads `TESTPACK1Test Pack Item`. |
| PARA500, INLINE01, 100002 | Fit on one line. |

The header “Drug Name (Trade Name)” also wraps on the cupboard list.

**Expected:** Codes stay on one line. Overflow uses ellipsis instead of covering the next column.

**Source:** `App.css` lines 2876–2884. Row markup `PharmacyPage.tsx` lines 357–358.

**Manual check:** Pharmacy → Maintenance. Look at DEMO- and TESTPACK1. OT → Cupboard, look at the code column and the wrapped name header.

### UI-011 — List rows change height when the name wraps

- **Module / screen:** OPD Doctors, OT Cupboard
- **Control:** `.drug-setup-table-row`
- **Category:** Tables
- **Severity:** Medium
- **Status:** Confirmed

**Finding**

| Row | Height |
|---|---|
| “Dr Demo [TRAINING]” | 56.97px |
| “Dr Test OPD”, “Dr. Aung”, “Wah Wah Nwe” | 33.78px |
| OT “PARA500 / Paracetamol 500mg” | 56.97px |
| OT “100002 / Pennicilin” | 33.78px |

Name cells are about 154px wide in the doctors list because the list pane maxes out near 22rem and the two columns split it. There is no ellipsis.

**Expected:** Either a wider name column or one-line text with ellipsis, so row height stays even.

**Source:** `App.css` lines 2789–2794 and 2886–2888. `OpdDoctorsPage.tsx` lines 240–241.

**Manual check:** OPD → Maintenance → Doctors. OT → Cupboard.

### UI-012 — Consultation button shows two plus signs

- **Module / screen:** OPD Bill
- **Control:** `.btn.action.opd-bill-consult`
- **Category:** Icons
- **Severity:** High
- **Status:** Confirmed

**Finding**

The button renders an `ActionIcon` plus and the label `"+ Consultation"`. On screen the label reads **“+ + Consultation”**. The button height (30.78px) is within 0.5px of the doctor field (31.23px), so the height is fine. The doubled plus is the defect.

**Source:** `OpdBillForm.tsx` lines 172–179. English string `addConsultation: "+ Consultation"` in `client/src/shared/i18n.ts` line 181. Myanmar string line 826 also starts with “+”.

**Correction:** Drop the “+” from both locale strings, or remove the icon.

**Manual check:** OPD → OPD Bill, Doctor row. The button stays disabled until a doctor is chosen; the label is still visible.

### UI-013 — Cart delete control is a text “×”, not the trash icon

- **Module / screen:** Bill carts (OPD, OT, Pharmacy sales / return / transfer)
- **Control:** Row remove button in `BillLineGrid`
- **Category:** Icons
- **Severity:** Low
- **Status:** Needs manual review. No line was added during the audit, so the button was not measured.

**Finding**

Committed rows render `<button class="btn ghost danger">×</button>` (`BillLineGrid.tsx` lines 316–319). List and rail deletes use `ActionIcon` trash at 16px. CSS for the cart button sets padding `0.15rem 0.35rem` and font-size `0.8125rem` (`App.css` lines 2165–2169), which is a different size recipe from the 26.8px code field in UI-002.

**Expected:** If the row has an icon button, it should match the other row controls in height, and use the same trash icon as the rest of the clinic.

**Manual check:** Add a medicine on a draft bill, do not save, and compare the × button with Qty. Cancel the draft afterward.

### UI-014 — Dialog close button is a circle on a 10px dialog

- **Module / screen:** Pharmacy bill history. The same button is used on alert dialogs and other bill dialogs.
- **Control:** `DialogCloseButton` / `.alert-dialog-close`
- **Category:** Corner radius, icons
- **Severity:** Medium
- **Status:** Confirmed

**Finding**

The history dialog measured **576 × 640px**, radius **10px**, border `1px solid rgb(213, 220, 229)`. The close button measured **32 × 32px**, radius **999px**, red border. The icon inside is **14 × 14px** (`DialogCloseButton.tsx` line 20). Action icons elsewhere are 16px.

`docs/standards/FRONTEND.md` says not to use full pills (`border-radius: 999px`). The close button is a pill. Alert dialogs also use radius **28px** (`.alert-dialog`, `App.css` line 2538) against the dialog token of 10px. The alert body was not opened.

**Expected:** Close control matches dialog radius (10px) and the 16px icon size, unless the team explicitly keeps the circle.

**Source:** `App.css` lines 2543–2553 and 2676–2678. `DialogCloseButton.tsx` lines 13–28.

**Manual check:** Pharmacy → Sales → History. Look at the X in the dialog corner. Also trigger a harmless validation message if you want the alert dialog (do not void a bill).

### UI-015 — A 5px input sits beside a 12px action button

- **Module / screen:** OT Cupboard return row. Same pairing as UI-004.
- **Controls:** Return qty input and “Return to pharmacy”
- **Category:** Corner radius
- **Severity:** Low
- **Status:** Confirmed measurement. This is a spec clash, not an accidental one-off.

**Finding**

| Control | Height | Radius |
|---|---|---|
| Qty input | 30.64px | 5px |
| Return to pharmacy (`.btn.action`) | 31.67px | 12px |

Height difference is **1.0px**, which is acceptable. The radius is not. The design system asks for about 12px on `.btn.action` and 5px on ordinary inputs, so both values are “correct” and still look unlike each other in one row.

**Source:** `App.css` lines 3402–3408 and 3117–3122. Button in `OtStockPage.tsx` around line 300.

**Manual check:** OT → Cupboard, select PARA500, look at the batch row. Do not submit a return.

### UI-016 — Placeholder gray is low contrast

- **Module / screen:** Bill carts, settings search, Drug Setup filter and dates
- **Control:** `::placeholder`
- **Category:** Typography
- **Severity:** Medium
- **Status:** Confirmed color. Contrast is calculated, not measured with a contrast meter.

**Finding**

Bill placeholders compute to `rgb(148, 163, 184)` (`#94a3b8`) at 14px, opacity 1, on white. That pair is about **2.6:1**. WCAG AA for normal text is 4.5:1, and 3:1 is the usual floor for UI text. The Users search placeholder “Username or name” looks faint in the screenshot. Settings uses the same `#94a3b8` (`App.css` line 963). Fields outside the bill desk and settings panel do not set a placeholder color, so they use the browser default.

**Expected:** One placeholder color that stays readable on white. A slate nearer `#64748b` is typically around 4.5:1.

**Source:** `--placeholder` at `App.css` line 1901. Applied at lines 2014–2017.

**Manual check:** Pharmacy Sales, empty code field “e.g. PARA500”. Settings → Users search.

### UI-017 — Shortcut labels use two sizes

- **Module / screen:** Bill rail and the bottom status bar
- **Control:** `kbd`
- **Category:** Typography
- **Severity:** Low
- **Status:** Confirmed

**Finding**

| Place | Size | Weight |
|---|---|---|
| Rail button `kbd` (F7, F5, F9, ^F8, F10, F2) | 11px | 500 |
| Status bar `kbd` | 12px | 700 |

**Source:** `App.css` lines 2500–2509 (rail) and 279–286 (status bar).

**Expected:** One shortcut style.

**Manual check:** Any bill screen. Compare F7 on the right rail with F7 on the bottom strip.

### UI-018 — Focus styles are not one system

- **Module / screen:** Clinic-wide
- **Category:** Interactive states
- **Severity:** Medium
- **Status:** Confirmed for the style recipes (bill input via forced `:focus`). Live keyboard focus was not photographed.

**Finding**

| Control | Focus treatment |
|---|---|
| `.opd-bill-input` | No outline. Border `#2563eb`. Shadow `0 0 0 3px rgba(37, 99, 235, 0.18)`. Forced `:focus` confirmed this. |
| `.field input` outside settings | `outline: 2px solid` accent, offset 1px (`App.css` line 772) |
| Settings fields | Outline removed, 3px ring (line 955) |
| Date picker wrap on Drug Setup | `0 0 0 2px` accent-soft, a weaker ring (line 3210) |
| Rail buttons | `:focus-visible` ring only (line 2484) |
| `.date-picker-icon-btn`, `.date-picker-nav`, `.date-picker-cell`, `.drug-setup-table-row`, `.opd-bill-dialog-row`, `.tile` | No `:focus-visible` rule found |

History rows are `<button>` elements, so they get a browser outline unless something removes it. Drug Setup rows are `role="option"` divs with `tabIndex={0}` and no focus style of their own.

**Expected:** One focus ring for text fields, and a visible focus style on every keyboard control.

**Manual check:** Click the page so it has window focus, then Tab through Pharmacy Sales (patient name, code, rail) and Drug Setup (list rows, date button).

### UI-019 — Disabled buttons fade out; disabled fields do not

- **Module / screen:** Bill desks vs toolbar buttons
- **Category:** Interactive states
- **Severity:** Low
- **Status:** Suspected. The recipes are in CSS. A disabled button and a disabled field were not compared in one focused screenshot.

**Finding**

`.btn:disabled` is `opacity: 0.5` (`App.css` line 810). Rail buttons use `opacity: 0.45` (line 2495). Bill inputs and settings inputs set `opacity: 1`, muted text, and background `#f8fafc` (lines 2037–2045 and 967–973). A disabled Qty box therefore stays solid gray, while a disabled Consultation button is expected to go half transparent.

**Expected:** One disabled look for buttons, and one for fields. Do not mix opacity-fade and gray-fill on controls in the same row.

**Manual check:** OPD Bill with no doctor selected (Consultation is disabled) next to the doctor field. Then pick a doctor and compare.

### UI-020 — Two neutral border colors

- **Module / screen:** Chrome vs bill desks and settings
- **Category:** Borders and colors
- **Severity:** Low
- **Status:** Confirmed

**Finding**

`:root --border` is `#d8dee6` (line 14). Header buttons measured `rgb(216, 222, 230)`, which is that value. Bill desks and settings override the border to `#d5dce5` (lines 1899 and 947). Bill inputs measured `rgb(213, 220, 229)`.

**Expected:** One neutral border token, unless the bill surface is meant to stay slightly cooler.

**Manual check:** Look at Help’s border and a bill input’s border on the same screen.

### UI-021 — Bill selects use the native arrow; settings selects use a custom one

- **Module / screen:** OPD / Pharmacy / OT bill Gender field vs Settings selects
- **Category:** Borders and colors, icons
- **Severity:** Low
- **Status:** Confirmed

**Finding**

The OPD Gender `<select class="opd-bill-input">` shows the browser dropdown arrow. Settings selects set `appearance: none` and a custom SVG chevron, with `padding-right: 2rem` (`App.css` lines 976–982). The Users Role select measured padding `10.4px 32px 10.4px 12px` and the same 44.11px height as its neighbor input, so the height is fine. The arrow graphic is not.

**Expected:** One select chrome for the clinic.

**Source:** Gender markup `PharmacyBillForm.tsx` lines 145–157 and `OpdBillForm.tsx`. Settings rule `App.css` line 976.

**Manual check:** OPD Bill Gender, then Settings → Users Role.

### UI-022 — Unit select padding does not match Qty

- **Module / screen:** Pharmacy and OT bill carts, after an item is chosen
- **Control:** `.bill-unit-select` inside `.opd-bill-grid-row`
- **Category:** Control height
- **Severity:** Low
- **Status:** Needs manual review. No item was added, so the select was not on screen.

**Finding**

The row rule sets unit-select padding to `0.1rem 0.2rem` (`App.css` line 2201). Qty uses `0.15rem 0.3rem` (line 2188). The base `.bill-unit-select` also uses a smaller font, `0.8125rem` (line 2287), while Qty is `0.875rem`. That combination is likely a few pixels shorter than Qty, in the same direction as UI-002.

**Manual check:** On a Pharmacy Sales draft, enter a real code such as PARA500, do not save, and compare the unit menu with Qty. Cancel the draft when finished.

## Manual checklist

Use a wide window (about 1440px). Do not save, pay, transfer, restock, void, seed, or restore.

### Chrome

- [ ] UI-001 English / မြန်မာ vs Help, Log out, Server IP
- [ ] UI-017 Status-bar shortcuts vs the bill rail shortcuts
- [ ] UI-018 Tab through the header once the window is focused
- [ ] UI-020 Header border vs a bill field border

### Portal picker

- [ ] Tiles are even (measured 89.6px, radius 7px, no mismatch found)

### Pharmacy → Sales

- [ ] UI-002 Code field vs Qty
- [ ] UI-007 Patient name label wrap
- [ ] UI-016 Placeholder “e.g. PARA500”
- [ ] UI-014 History dialog close button
- [ ] UI-013 and UI-022 Only if you add a line locally and then cancel
- [ ] Rail: Pay & print is taller because of the subtitle; that one is intentional

### Pharmacy → Return in

- [ ] Same cart and patient-name checks as Sales (not opened in this audit)

### Pharmacy → Transfer to OT

- [ ] UI-002 on the medicine row
- [ ] Patient block is hidden on transfer; UI-007 should not appear

### Pharmacy → Maintenance

- [ ] UI-010 Code column, especially TESTPACK1 and DEMO- codes
- [ ] UI-004 Filter, then Search
- [ ] UI-006 Restock submit width
- [ ] UI-008 Price labels
- [ ] UI-015-style radius on any input next to Edit / Delete (height of those actions matched each other at 31.67px)

### OPD → OPD Bill

- [ ] UI-012 “+ + Consultation”
- [ ] UI-002 Particular field vs Qty
- [ ] UI-021 Gender arrow
- [ ] UI-019 Disabled Consultation button before a doctor is chosen

### OPD → Maintenance → Doctors

- [ ] UI-009 Edit position
- [ ] UI-008 Wrapped fee labels
- [ ] UI-011 “Dr Demo [TRAINING]” row vs the rows under it

### OPD → Maintenance → Services

- [ ] Same action-row and label checks as Doctors (not opened; same classes)

### OT → Bill

- [ ] UI-002 on both the cupboard row and the service row

### OT → Cupboard

- [ ] UI-010 / UI-011 Code and wrapped trade name
- [ ] UI-015 Qty vs “Return to pharmacy” (do not return stock)

### Settings → Hospital

- [ ] UI-006 Save button width
- [ ] Input radius 6px vs button radius 5px

### Settings → Doctors and Services

- [ ] UI-003 Search row
- [ ] UI-005 Update button beside the action button while editing
- [ ] UI-006 Create button width

### Settings → Users

- [ ] UI-003 Search vs the username field
- [ ] UI-006 Create user bar
- [ ] UI-021 Role select arrow

### Settings → Backup and Training

- [ ] UI-006 Backup now width (direct child of `.card-form`)
- [ ] UI-005 Seed button beside Reset (do not click them)
- [ ] Restore row: `.btn.action.danger` next to the backup name

### Dialogs not fully covered

- [ ] UI-014 Alert dialog, if you can raise one without changing data
- [ ] Help overlay (radius token is 10px in CSS; not opened)
- [ ] V.Delete only if you are willing to open it and close it without confirming

## Screen inventory

| Surface | Inspected |
|---|---|
| Portal picker | Yes |
| Pharmacy Sales | Yes |
| Pharmacy bill history | Yes |
| Pharmacy Return | No (shared bill form) |
| Pharmacy Transfer to OT | No (shared bill form) |
| Pharmacy Drug Setup | Yes |
| Pharmacy filter, item form, item history | No |
| OPD Bill | Yes |
| OPD Doctors | Yes |
| OPD Services, catalog history, bill history | No |
| OT Bill | Yes |
| OT Cupboard | Yes |
| OT history | No |
| Settings Hospital | Yes |
| Settings Users | Yes |
| Settings Training shell | Yes, session expired, buttons absent |
| Settings Doctors, Services, Backup | No |
| Help, Server IP, login, print preview, alert body, V.Delete | No |
| Home, Reports | Not mounted in the app |
