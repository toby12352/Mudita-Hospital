# Implementation status

Updated: 2026-11-01. Bill entry-row inputs share 44px height (particular / qty / fees / unit / expiry). Cart lines stay compact. Cross-portal audit AUDITED. The portal sequence is complete. Not VERIFIED. No WCAG claim.

Read this file at the start of every accessibility chat. Update it before the chat ends. Status values:

- NOT STARTED
- AUDITED
- IN PROGRESS
- IMPLEMENTED
- TESTING
- VERIFIED
- BLOCKED

VERIFIED requires the checks in [UNIFIED_DESIGN_SYSTEM.md](./UNIFIED_DESIGN_SYSTEM.md) to have been run on that portal, including a manual look at both locales. `tsc` alone is not verification. Do not mark WCAG conformance from a scan. There is no scan tool in this repo.

Shared clinic CSS means a token edit is visible on every desk. When that happens, note the sibling desks here. Do not mark those siblings VERIFIED just because they inherited a font.

## Status

| Area | Status | Notes |
|------|--------|-------|
| Foundation documents | IMPLEMENTED | Inventory, spec, this file, standards pointers. No UI. |
| Cursor rule files | IMPLEMENTED | `.cursor/rules/mudita-a11y.mdc` is always on. `mudita-docs.mdc` lists `docs/accessibility/`. |
| Clinic fonts and global type | IMPLEMENTED | Roboto 400/600 + Noto Sans Myanmar 400/600 via Fontsource. Stack and role sizes in `App.css`. Sibling desks inherited the stack through shared CSS. Not marked VERIFIED. |
| Clinic shared controls | IMPLEMENTED | Focus, 44px primary fields/buttons, compact bill exceptions, tables, reduced motion, AlertDialog focus return. Bill entry row (`.bill-line-entry`) locks typeahead, qty, fees, unit, and expiry to `--control-height` (44px) so columns match; committed cart rows stay on `--bill-cart-control-height`. Sibling desks (shell, OPD, Lab, Pharmacy, OT, expenses, patients, IPD, reports, settings) inherited shared control rules through `App.css`. Not marked VERIFIED. |
| Clinic shell and auth | IMPLEMENTED | Login, nav, home, about, help, and print-preview chrome. Skip link, Help and print focus move/return/trap, auth errors as alerts. Header utilities stay 32px. Not marked VERIFIED. No WCAG claim. |
| OPD | IMPLEMENTED | Bill desk (`OpdPage`, `OpdBillForm`, `OpdBillListDialog`) plus full-page maintenance (`OpdMaintenancePage`, `OpdDoctorsPage`, `OpdServicesPage`) matching Pharmacy: list / detail / create / edit, `BillHistoryToolbar` with Search and Filter (no date range), underline Doctor/Service tabs on the list and history. History toggles the same toolbar and swaps to the shared catalog-audit table (no second page). Service list filter includes a Category dropdown in the shared filter row. Compact bill controls stay 32px. Inherited the shared filter-panel dropdown restyle. Not marked VERIFIED. No WCAG claim. |
| Lab | IMPLEMENTED | Bill desk (`LabPage`, `LabBillForm`, `LabBillListDialog`) plus full-page services maintenance (`LabServicesPage`) matching Pharmacy: list / detail / create / edit and `BillHistoryToolbar` (no date range; no second tab). History toggles on the same desk into the shared catalog-audit table. Compact bill controls stay 32px. Inherited the shared filter-panel dropdown restyle. Not marked VERIFIED. No WCAG claim. |
| Pharmacy billing | IMPLEMENTED | Bill desk only (`PharmacyBillingPage`, `PharmacyBillForm`, `PharmacyBillListDialog`; return and transfer reuse the same page). History/void/purge dialog focus move/return/Escape/Tab trap. Patient and medicine typeaheads already named. Catalog, items, movements, and purchase not in this pass. Compact bill controls stay 32px. Discount disabled colors remain the earlier inherited CSS. Inherited the shared filter-panel dropdown restyle. Not marked VERIFIED. No WCAG claim. |
| Pharmacy catalog and purchase | IMPLEMENTED | Maintenance redesigned to one full-page desk like patient charts (`PharmacyPage` list / Drug Info / create / edit). List uses `BillHistoryToolbar` + chart-style `--items` table; History toggles into stock-movement columns on the same desk; restock stays `PharmacyItemsTab` local overlay; purchase desk unchanged. Filter panel adds a Unit dropdown (distinct packing units from the loaded catalog; client-side match on pack chain). Shared `App.css` filter row uses labeled dropdown menus instead of status/sort radio strips — sibling desks that use `BillHistoryToolbar` inherited that restyle. Not marked VERIFIED. No WCAG claim. |
| OT billing | IMPLEMENTED | Bill desk only (`OtPage`, `OtHistoryModal`). History/void/purge dialog focus move/return/Escape/Tab trap. Doctor typeahead named; procedure field associated with its visible label. Patient and cart typeaheads already named. Stock, services, catalog history, and maintenance not in this pass. Compact bill controls stay 32px. Discount disabled colors remain the earlier inherited CSS. Not marked VERIFIED. No WCAG claim. |
| OT stock and services | IMPLEMENTED | Full-page maintenance like Pharmacy (`OtMaintenancePage`, `OtStockPage`, `OtServicesPage`): underline Inventory/Services tabs on the list and history; `BillHistoryToolbar` Search/Filter (no date range); stock has no Add button; Services History toggles the shared catalog-audit table on the same desk. Escape and focus return on detail/form/history. Delete stays on shared `CatalogDeleteDialog`. OT cupboard guide opens the first row on the return step. Compact controls stay 32px. Inherited the shared filter-panel dropdown restyle. Not marked VERIFIED. No WCAG claim. |
| Expenses | IMPLEMENTED | Bill desk only (`ExpenseBillPage`, `ExpenseBillListDialog`). History/purge dialog focus move/return/Escape/Tab trap. History filter has a labeled category dropdown (existing `category` / `all` strings; options from `EXPENSE_CATEGORIES`) presented as a shared `FilterMenu`. No typeahead; header labels and cart `aria-label`s were already present. Compact bill controls stay 32px. Discount disabled colors remain the earlier inherited CSS. Inherited the shared filter-panel dropdown restyle. Not marked VERIFIED. No WCAG claim. |
| Patients | IMPLEMENTED | Desk (`PatientsPage`). Create/edit form and chart detail: focus move, Escape to leave (yields to alert and print), focus return to opener or list row. Form `aria-labelledby`; chart list rows named; detail tablist named with patient name; notes section labelled. No modal history dialog. Primary fields already labeled; history search already named. Chart list search uses an explicit Search button (Enter or click); no typeahead on that field. No App.css edit or other-desk restyle. Not marked VERIFIED. No WCAG claim. |
| IPD | IMPLEMENTED | Stays + charge bills (`IpdPage`, `IpdChargeBillPage`, `IpdChargeBillListDialog`, `IpdDailyStatementPreview`). History/void/purge and daily-statement dialog focus move/return/Escape/Tab trap. Statement preview yields only to alerts (it is itself `.print-preview-overlay`). PatientChartTypeahead already named; charge cart and stay labels already present. Pages reviewed only for F-keys/naming. Compact bill controls stay 32px. Discount disabled colors remain the earlier inherited CSS. Not marked VERIFIED. No WCAG claim. |
| Reports | IMPLEMENTED | Clinic reports (`ReportsPage`). Tablist/tabpanel ids; localized tablist label `t("reports")`; load/print errors `role="alert"`; result lists named; low-stock rows append `t("lowStockLabel")`; past-expiry title also shows days-left text (not color alone). No desk-owned modal — print uses shared `print.ts`. Date/days fields already labeled. No App.css edit. Compact controls stay 32px. Not marked VERIFIED. No WCAG claim. |
| Settings | IMPLEMENTED | Hospital, doctors, categories, users, backup, training (`SettingsPage` + tabs). Tablist/tabpanel ids; localized tablist `t("settings")`. Doctor/category/user edit focus move/return/Escape (no Tab trap; yield to alert/print). Forms `aria-labelledby`; lists named; Backup EN/MY strings; errors `role="alert"`. Delete/restore/reset use shared `AlertDialog` (not edited). Typeaheads already had `label`. No App.css edit. Compact controls stay 32px. Not marked VERIFIED. No WCAG claim. |
| Dashboard fonts and tokens | IMPLEMENTED | Roboto 400/600 + Noto Sans Myanmar 400/600 via Fontsource in `dashboard/`. Stack, accent `#2563EB`, focus ring `0.28`, type roles, and measured `--warn` `#8a6508` in `theme.css`. Chart hex in page TSX left for page chats. Not marked VERIFIED. No WCAG claim. |
| Dashboard Overview | IMPLEMENTED | Chart series from CSS tokens; load errors `role="alert"`; low-stock / near-expiry / voids status text (not color alone); share and trend regions named; EN/MY share labels and days unit. Revenue and other pages not restyled. Not marked VERIFIED. No WCAG claim. |
| Dashboard Revenue | IMPLEMENTED | Chart series from CSS tokens (OPD/OT/Pharmacy/Lab; no IPD bar — stack composition unchanged); load errors `role="alert"`; named trend/tables/KPI strip; preset `aria-pressed` with pressed ink (7 / 30 days, 4 months, 1 year); DatePicker names, typed-date focus stays in the field, icon opens the grid. One Print button opens a Daily-report-style menu (Income, Expense, PowerPoint) with focus move/return and arrow keys; preview keeps EN/MY (Excel on income/expense only); print errors `role="alert"`. Panel titles are h2 under the workspace h1. Overview and clinic not restyled. Not marked VERIFIED. No WCAG claim. |
| Dashboard Stock | IMPLEMENTED | Chart series from CSS tokens (expired `--danger`, ≤30 days `--warn`, 31–60 days `--series-ipd` because `#d4a017` is 2.38:1 and a darker gold matches `--warn`, 61–90 days `--accent`). Grid stroke stays `rgba(26, 31, 46, 0.08)`. Load errors `role="alert"`. Named KPI strip, expiry chart, and tables. Preset `aria-pressed` with pressed ink. Warn KPIs append attention text. Panel titles are h2 at 18px. Overview, Revenue, and clinic not restyled. Not marked VERIFIED. No WCAG claim. |
| Dashboard Daily report | IMPLEMENTED | Native `input[type=date]` kept. Load and print errors `role="alert"`. Named KPI strips, vs-yesterday strip, and tables. Print menu focus move/return and arrow keys. Print preview focus move/return/Escape/Tab trap (stops inside the iframe). Voids append attention text. Portal names localized. Panel titles are h2 at 18px. Scoped 44px toolbar. Overview, Revenue, Stock, and clinic not restyled. Not marked VERIFIED. No WCAG claim. |
| Dashboard Master data | IMPLEMENTED | Tabs match Settings (ids, tabpanel, `t("masterData")`, no arrow roving). Search and CSV paste have visible labels. Load and action errors `role="alert"` (a bulk error shows inside the dialog). Success `role="status"`. Loading `aria-live="polite"`. CSV error list `role="alert"`. List and CSV titles are h2; the table is named from the list heading. Checkbox column and row checks are named. Doctors ID uses `t("idLabel")`. Low-stock rows append `t("lowStock")`. Bulk modal `aria-modal`, focus move/return, Escape, and Tab trap; scrim still closes. UPDATE and IMPORT checks unchanged. Scoped 44px and pressed ink. Overview, Revenue, Stock, Daily report, and clinic not restyled. Not marked VERIFIED. No WCAG claim. |
| Dashboard Audit | IMPLEMENTED | Search and the entity filter have visible labels. Option values stay the API filters; visible labels are localized (`user`, `settings`, `backup` added). Load errors `role="alert"`. Loading `aria-live="polite"` only while there are no rows. The list title is an h2; the table is named from it. The ID header uses `t("idLabel")`. Detail buttons have `aria-expanded`; the title is not the name. Action chips use pressed ink because accent on the chip fill is 4.44:1. Scoped 44px toolbar. Detail controls stay 24px. Overview, Revenue, Stock, Daily report, Master data, and clinic not restyled. Not marked VERIFIED. No WCAG claim. |
| Cross-portal audit | AUDITED | Compared clinic and dashboard with the spec. No portal was restyled. Residuals below stay with their owners. Not VERIFIED. No WCAG claim. Sequence complete. |

## Completed

- 2026-11-01 Bill entry-row input height: `.opd-bill-grid-row.bill-line-entry` sets `--bill-entry-control-height` to `--control-height` (44px) and locks qty, unit, expiry, free-text particular, and bill-line typeahead inputs to that height (min/max). Matches the particular typeahead that already hit 44px via `.field input`. Committed cart rows, Add to bill bar, header fields, and rail stay compact. Sibling bill desks (OPD, Lab, Pharmacy billing/purchase, OT, expenses, IPD charges) inherited through `App.css`. CSSOM probe on running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client): entry typeahead/qty/fees/unit/expiry/free-text all 44px; cart-row qty and Add-to-bill segment stayed ~27px. Demo `admin` / `admin123` rejected; signed-in desks not opened. Status stays IMPLEMENTED (not VERIFIED). No WCAG claim.
- 2026-11-01 Dashboard Ctrl/Cmd zoom: `dashboard/src/uiScale.ts` with `mudita_dash_ui_scale` (0.85–1.4, step 0.05) and App key listener matching clinic. No page restyle. Status stays IMPLEMENTED (not VERIFIED). No WCAG claim.
- 2026-11-01 Dashboard Revenue print menu: one Print button with Income / Expense / PowerPoint items (same pattern as Daily report). Status stays IMPLEMENTED (not VERIFIED). No WCAG claim.
- 2026-11-01 Dashboard Revenue stakeholder presentation: Print PowerPoint in the Revenue print menu; landscape 16:9 HTML slides from the same cash movement (no schema change). Status stays IMPLEMENTED (not VERIFIED). No WCAG claim. Clinic and other dashboard pages left alone.
- 2026-11-01 Dashboard Revenue print: 4-month and 1-year range presets; Print Income Report and Print Expense Report; print-preview language switch (EN/MY) and Excel CSV download. Server HTML/CSV reuse daily cash movement. Status stays IMPLEMENTED (not VERIFIED). No WCAG claim. Clinic and other dashboard pages left alone.
- 2026-11-01 Cross-portal audit: compared clinic and dashboard with the spec on the running login screens and in source. Recorded residuals and owners. Did not restyle an IMPLEMENTED portal. Did not mark VERIFIED. No WCAG claim. Sequence complete.
- 2026-11-01 Dashboard Audit: labeled search and entity filter; error alert and loading live region; named table; detail `aria-expanded`; pressed ink on action chips; scoped 44px toolbar and 24px detail floor. Clinic and other dashboard pages left alone.
- 2026-11-01 Maintenance history on the list desk: OPD doctors/services, Lab services, OT services, and Pharmacy items keep title, tabs, and `BillHistoryToolbar` when History is pressed; table swaps to catalog-audit or stock-movement columns; History is `aria-pressed` toggle; Escape returns focus to the History button. Shared `CatalogAuditHistoryTable` / `StockMovementsHistoryTable` and `--catalog-audit` / `--stock-moves` grids. Removed standalone catalog history pages and `PharmacyMovementsTab`. No schema or API change. Not marked VERIFIED.
- 2026-11-01 Shared filter panel dropdown row: Status / Sort by date / Category / Unit become labeled `FilterMenu`s on one wrapping row with From/To and Reset/Search; Pharmacy maintenance Unit filter; OPD service Category stays on that row. Sibling bill-history and maintenance desks inherited the panel restyle through `BillHistoryToolbar` / `App.css`. No schema or API change. Not marked VERIFIED.
- 2026-11-01 Dashboard Master data: tablist/tabpanel; labeled search and CSV paste; alerts and live regions; named tables; low-stock text; bulk modal focus. Scoped 44px. Clinic and other dashboard pages left alone.
- 2026-11-01 OPD / Lab / OT maintenance full-page redesign: same list / detail / form / history swap as Pharmacy; underline maintenance tabs; `hideDateRange` on `BillHistoryToolbar`; `otStockInventory` EN/MY; OT cupboard guide step sync. Billing desks unchanged.
- 2026-11-01 audit of `client/` and `dashboard/` (frameworks, CSS, fonts, widgets, tests).
- Wrote `docs/accessibility/PORTAL_INVENTORY.md`.
- Wrote `docs/accessibility/UNIFIED_DESIGN_SYSTEM.md`.
- Wrote this status file.
- Installed `.cursor/rules/mudita-a11y.mdc` (always on) and listed `docs/accessibility/` in `.cursor/rules/mudita-docs.mdc`.
- Pointed `docs/standards/README.md`, `docs/standards/FRONTEND.md`, and `AGENTS.md` at these documents.
- 2026-11-01 clinic fonts and global type: installed `@fontsource/roboto`, imported Roboto 400/600 and Noto 600, set the shared stack and role sizes, collapsed 550/650/700 to 600, added tabular-nums on money/qty columns, pointed `guide.css` and cheat-sheet family names at the same stack, deleted the unused public woff2.
- 2026-11-01 clinic shared controls: `--control-height` 44px / `--control-height-compact` 32px; primary `.field` inputs/selects and form commits to 44px; bill toolbar/cart/rail/dialog close stay compact; focus ring darkened; `--checking` darkened for text contrast; bill-history header sentence case; reduced motion covers status pulse and alert badge motion; AlertDialog returns focus to opener.
- 2026-11-01 clinic shell and auth: skip link; Help and print-preview focus move, return, Escape, and Tab trap; auth ledes and fallbacks in both locales; login/change-password/server errors use `FieldError`; brand eyebrow sentence case; nav focus inset; server status in the button name; header language aligned to 32px. Home and about titles were already 28px / 600.
- 2026-11-01 OPD bill desk: `OpdBillListDialog` focus move, return, Escape, and Tab trap (yields to alert and print overlays); doctor typeahead `ariaLabel`; discount disabled style matches bill inputs. Doctors, services, and catalog left alone.
- 2026-11-01 Lab bill desk: `LabBillListDialog` focus move, return, Escape, and Tab trap (yields to alert and print overlays); doctor typeahead `ariaLabel`. Services and catalog left alone. No shared CSS edit.
- 2026-11-01 Pharmacy billing desk: `PharmacyBillListDialog` focus move, return, Escape, and Tab trap (yields to alert and print overlays). Sales, return, and transfer share that dialog. Patient and medicine names were already present. Catalog, items, movements, and purchase left alone. No shared CSS edit.
- 2026-11-01 OT billing desk: `OtHistoryModal` focus move, return, Escape, and Tab trap (yields to alert and print overlays). Doctor typeahead `ariaLabel`; procedure input wrapped in its visible label. Patient and cart names were already present. Stock, services, catalog history, and maintenance left alone. No shared CSS edit.
- 2026-11-01 Expenses bill desk: `ExpenseBillListDialog` focus move, return, Escape, and Tab trap (yields to alert and print overlays). No typeahead; header labels and cart `aria-label`s were already present. No shared CSS edit.
- 2026-11-01 Expenses history category filter: labeled category `<select>` in `BillHistoryToolbar` when `categoryOptions` is set; expense history/purge pass `EXPENSE_CATEGORIES`. Optional `BillHistoryQuery.category` only; other desks unchanged. No App.css edit.
- 2026-11-01 Patients desk: `PatientsPage` create/edit and detail focus move, Escape leave, and focus return; form and notes labelling; chart row and tablist names. No modal history dialog. No shared CSS edit.
- 2026-11-01 Patients chart list search: explicit Search button (Enter or click) via `BillHistoryToolbar` `explicitSearch`; no typeahead on the chart list field. History search inside a chart and other desks unchanged. No App.css edit.
- 2026-11-01 IPD desk: `IpdChargeBillListDialog` and `IpdDailyStatementPreview` focus move, return, Escape, and Tab trap. Patient typeahead and charge cart names were already present. No shared CSS edit.
- 2026-11-01 Pharmacy catalog and purchase: `PharmacyPurchaseListDialog` and `PharmacyItemsTab` restock modal focus move, return, Escape, and Tab trap. Purchase and items typeaheads already named. Movements reviewed only. No shared CSS edit.
- 2026-11-01 OT stock and services: service form and history focus move/return/Escape; stock filter Escape; inactive name text; maintenance tabpanel ids. Delete stays on shared AlertDialog. No shared CSS edit. OT billing left alone.
- 2026-11-01 Reports: tablist/tabpanel ids; localized tablist label; error alerts; named result lists; low-stock and past-expiry text status. No desk modal. No shared CSS edit.
- 2026-11-01 Settings: tablist/tabpanel; edit focus move/return/Escape; Backup i18n; hospital/preview naming; error alerts. Shared AlertDialog not edited. No shared CSS edit.
- 2026-11-01 dashboard fonts and tokens: Roboto + Noto 600 Fontsource; accent and focus ring match clinic; type roles; measured `--warn`; series CSS tokens for share bars. Chart hex in Overview/Revenue/Stock TSX left alone.
- 2026-11-01 Dashboard Overview: chart fills from theme tokens; alert/status text; named regions; localized share strings. Revenue/Stock/Daily report/Master data/Audit left alone.
- 2026-11-01 Pharmacy Maintenance redesign: one `opd-bill-desk` list/detail/form/history swap; chart-style items table; Escape and focus return; `listNo` EN/MY; pharmacy-item guide selectors; purchase and other catalogs left alone.
- 2026-11-01 Dashboard Revenue: chart fills from theme tokens; alert/live regions; named sections/tables; DatePicker a11y; scoped 44px toolbar. Overview/Stock/Daily report/Master data/Audit and clinic left alone.
- 2026-11-01 Dashboard Stock: chart fills from theme tokens; alert/live regions; named sections/tables; day-unit labels; scoped 44px toolbar. Overview/Revenue/Daily report/Master data/Audit and clinic left alone.
- 2026-11-01 Dashboard Daily report: native date field; alert/live regions; named strips and tables; print menu and preview focus; portal names; scoped 44px toolbar. Overview/Revenue/Stock/Master data/Audit and clinic left alone.

## Files modified (Bill entry-row input height chat)

- `client/src/shared/styles/App.css` (`.bill-line-entry` height lock only)
- This status file

No `server/`, `dashboard/`, TSX, schema, billing math, or permission edits.

## Files modified (Maintenance history on list desk chat)

- `client/src/shared/CatalogAuditHistoryTable.tsx` (new)
- `client/src/shared/StockMovementsHistoryTable.tsx` (new)
- `client/src/shared/styles/App.css` (`--catalog-audit`, `--stock-moves` grids only)
- `client/src/shared/i18n.ts` (Action, Change, What, short movement names EN/MY)
- `client/src/pages/opd/OpdDoctorsPage.tsx`, `OpdServicesPage.tsx`
- `client/src/pages/lab/LabServicesPage.tsx`
- `client/src/pages/ot/OtServicesPage.tsx`
- `client/src/pages/pharmacy/PharmacyPage.tsx`
- Deleted `OpdCatalogHistory.tsx`, `LabCatalogHistory.tsx`, `OtCatalogHistory.tsx`, `PharmacyMovementsTab.tsx`
- This status file

No `server/`, `dashboard/`, billing, schema, or permission edits.

## Files modified (Filter panel dropdown row chat)

- `client/src/shared/FilterMenu.tsx` (new labeled listbox dropdown)
- `client/src/shared/BillHistoryToolbar.tsx` (status / category / unit / sort as `FilterMenu`; optional `unit` on query; one wrapping filter row)
- `client/src/shared/CatalogListFilter.tsx` (`CatalogDateSortField` and unused `CatalogFilterPanel` use `FilterMenu`)
- `client/src/shared/styles/App.css` (filter row layout; menu styles; remove status-chip wrap rules)
- `client/src/pages/pharmacy/PharmacyPage.tsx` (unit options from packing chains; client-side unit filter)
- Empty `BillHistoryQuery` helpers on OPD / Lab / OT / patients / pharmacy pages (`unit: ""`)
- This status file

No `server/`, `dashboard/`, schema, billing math, or permission edits.

## Files modified (Cross-portal audit)

- This status file

No `client/`, `dashboard/`, `server/`, or `docs/*.html` edits. No shared token change.

## Files modified (Dashboard Audit chat)

- `dashboard/src/pages/Audit.tsx` (labeled search and entity filter; error alert; loading live region; named table; detail `aria-expanded`; ID header)
- `dashboard/src/theme.css` (`.audit-page` 44px search, entity select, and Refresh; 24px detail control; pressed chip ink; panel h2 18px). Revenue, Stock, Daily report, Master data, and print-preview rules were not restyled.
- `dashboard/src/i18n.ts` (EN/MY `user`, `settings`, `backup`)
- This status file

No `client/`, `server/`, Overview, Revenue, Stock, Daily report, Master data, or `docs/*.html` edits.

## Files modified (Dashboard Master data chat)

- `dashboard/src/pages/MasterData.tsx` (tablist/tabpanel; labeled search and CSV paste; alerts and live regions; named tables; low-stock text; bulk modal focus)
- `dashboard/src/theme.css` (`.master-page` 44px actions, fields, and tabs; visible range-toggle overflow; pressed tab ink; panel h2 18px; paste area 14px). Revenue, Stock, Daily report, and print-preview rules were not restyled.
- `dashboard/src/i18n.ts` (EN/MY `select`, `idLabel`, `csvPasteLabel`)
- This status file

No `client/`, `server/`, Overview, Revenue, Stock, Daily report, Audit, or `docs/*.html` edits.

## Files modified (OPD / Lab / OT maintenance redesign chat)

- `client/src/shared/BillHistoryToolbar.tsx` (`hideDateRange`)
- `client/src/pages/opd/OpdMaintenancePage.tsx` (new shell)
- `client/src/pages/opd/OpdDoctorsPage.tsx`, `OpdServicesPage.tsx`, `OpdCatalogHistory.tsx`
- `client/src/pages/lab/LabServicesPage.tsx`, `LabCatalogHistory.tsx`
- `client/src/pages/ot/OtMaintenancePage.tsx`, `OtStockPage.tsx`, `OtServicesPage.tsx`, `OtCatalogHistory.tsx`
- `client/src/app/App.tsx` (OPD maintenance shell)
- `client/src/shared/styles/App.css` (underline tabs; doctor/service/stock table grids; catalog page shells)
- `client/src/shared/i18n.ts` (`otStockInventory`)
- `client/src/features/guidance/guideControl.ts`, `GuidanceHost.tsx`, `registry.ts`, `lessons/ot-cupboard.ts`
- This status file

No `server/`, `dashboard/`, billing, schema, or permission edits.

## Files modified (Dashboard Daily report chat)

- `dashboard/src/pages/DailyReport.tsx` (error alerts; named regions; print menu focus and arrow keys; portal names; voids attention text; panel h2)
- `dashboard/src/print.ts` (preview focus move/return, Escape, Tab trap; localized Print/Close). Daily report is the only caller.
- `dashboard/src/theme.css` (`.daily-page` 44px actions, date field, menu items, panel h2 18px; `.print-preview-shell` 44px actions and scope focus). Revenue and Stock rule blocks were not restyled.
- `dashboard/src/i18n.ts` (EN/MY `opdPortal`, `otPortal`, `labPortal`, `ipdPortal`, `expensePortal`)
- This status file

No `client/`, `server/`, Overview, Revenue, Stock behavior, Master data, Audit, or `docs/*.html` edits.

## Files modified (Dashboard Stock chat)

- `dashboard/src/pages/Stock.tsx` (tokenized chart colors; error alert; named regions; day units; attention text)
- `dashboard/src/theme.css` (`.stock-page` 44px actions, visible range-toggle overflow, pressed preset ink, panel h2 18px). The Revenue rule block was not restyled; its comment now says the Overview toolbar stays unchanged.
- `dashboard/src/i18n.ts` (EN `slow60` / `slow90` / `slow180` and `batchesNearExpiry` drop the trailing `d`)
- This status file

No `client/`, `server/`, Overview, Revenue behavior, Daily report, Master data, Audit, or `docs/*.html` edits.

## Files modified (Dashboard Revenue stakeholder presentation chat)

- `dashboard/src/pages/Revenue.tsx` (Print PowerPoint PDF beside income/expense)
- `dashboard/src/i18n.ts` (EN/MY `printPresentationReport`)
- `server/internal/handlers/dashboard.go` (presentation route)
- `server/internal/handlers/reports_stakeholder.go` (16:9 HTML slides; SVG charts)
- `server/internal/handlers/reports_stakeholder_test.go` (isolated SQLite)
- `README.md` and `docs/standards/ARCHITECTURE.md` (endpoint + Result definition)
- This status file

No schema or installer change. Clinic and other dashboard pages left alone. No WCAG claim. Status stays IMPLEMENTED (not VERIFIED).

## Files modified (Dashboard Revenue income/expense print chat)

- `dashboard/src/pages/Revenue.tsx` (4-month / 1-year presets; Print Income / Print Expense)
- `dashboard/src/print.ts` (overlay EN/MY language control; Excel CSV download)
- `dashboard/src/theme.css` (`.print-preview-lang` pressed ink; comment that Revenue opens the preview)
- `dashboard/src/i18n.ts` (`months4`, `year1`, `downloadExcel`, print language labels)
- `server/internal/handlers/dashboard.go` (revenue-report print/export routes)
- `server/internal/handlers/reports_revenue.go` (range HTML + CSV; EN/MY)
- `server/internal/handlers/reports_revenue_test.go` (isolated SQLite)
- This status file

No `client/`, Overview, Stock, Daily report, Master data, Audit, or `docs/*.html` edits. Clinic and other desks left alone. No schema change.

## Files modified (Dashboard Revenue chat)

- `dashboard/src/pages/Revenue.tsx` (tokenized chart colors; error alert; named regions; KpiCard; line-type labels; custom 14px tooltips)
- `dashboard/src/components/DatePicker.tsx` (localized control names; focus move/return; `aria-current` on selected day)
- `dashboard/src/theme.css` (`.revenue-page` 44px actions/date wrap/icon; 14px day cells only)
- `dashboard/src/i18n.ts` (EN/MY `consultation`, `lineTypeOtFee`, calendar labels)
- This status file

No `client/`, `server/`, Overview, Stock, Daily report, Master data, Audit, or `docs/*.html` edits.

## Files modified (Pharmacy Maintenance redesign chat)

- `client/src/pages/pharmacy/PharmacyPage.tsx` (full-page list / Drug Info / create / edit / history)
- `client/src/pages/pharmacy/PharmacyItemForm.tsx` (Cancel removed; dismiss via page chrome)
- `client/src/pages/pharmacy/PharmacyMovementsTab.tsx` (`hideTitle` for history page)
- `client/src/features/guidance/lessons/pharmacy-item.ts` (create/edit page selectors)
- `client/src/shared/styles/App.css` (`--items` grid, pharmacy page shells)
- `client/src/shared/i18n.ts` (`listNo`)
- This status file

No `server/`, `dashboard/`, billing, purchase, or other-catalog edits.

## Files modified (Dashboard Overview chat)

- `dashboard/src/pages/Overview.tsx` (tokenized chart colors; error alert; attention text; share/trend labelling)
- `dashboard/src/theme.css` (`--series-lab`, `--series-ipd` only; prior token edits left in place)
- `dashboard/src/i18n.ts` (EN/MY `attentionNeeded`, `daysUnit`, `cashShare`)
- This status file

No `client/`, `server/`, Revenue, Stock, Daily report, Master data, Audit, or `docs/*.html` edits.

## Files modified (dashboard fonts and tokens chat)

- `dashboard/package.json` / `dashboard/package-lock.json` (`@fontsource/roboto`)
- `dashboard/src/main.tsx` (Roboto 400/600 + Noto 400/600 imports)
- `dashboard/src/theme.css` (tokens, focus, type roles, `--warn`, series bars; prior uncommitted edits left in place)
- This status file

No `client/`, `server/`, dashboard page TSX, or `docs/*.html` edits.

## Files modified (shared-controls chat)

- `client/src/shared/styles/App.css` (control height tokens, primary vs compact sizes, focus recipe, tables, reduced motion, `--checking`; prior font and unrelated edits left in place)
- `client/src/shared/AlertDialog.tsx` (restore focus to opener on close)
- `docs/accessibility/UNIFIED_DESIGN_SYSTEM.md` (recorded `--focus-ring` `0.28` and clinic `--checking` `#8a6508`)
- This status file

No `dashboard/`, `server/`, receipt, or `docs/*.html` edits in that chat.

## Files modified (shell and auth chat)

- `client/src/app/App.tsx` (skip link, localized auth ledes and idle lock)
- `client/src/app/LoginForm.tsx`, `ChangePasswordForm.tsx`, `ServerSetupForm.tsx` (`FieldError`)
- `client/src/app/ServerIpButton.tsx` (status name, popover focus return, localized endpoint)
- `client/src/app/HelpOverlay.tsx` (focus move, return, Escape, Tab trap)
- `client/src/shared/print.ts` (same focus behavior; `print-preview-shell` class)
- `client/src/shared/styles/App.css` (skip link, nav focus inset, header language 32px, eyebrow, help type, print-chrome sizes)
- `client/src/shared/i18n.ts` (EN + MY keys for the strings above)
- This status file

No `dashboard/`, `server/`, receipt, IPD statement component, or `docs/*.html` edits.

## Files modified (OPD bill desk chat)

- `client/src/pages/opd/OpdBillListDialog.tsx` (focus move, return, Escape, Tab trap)
- `client/src/pages/opd/OpdBillForm.tsx` (doctor typeahead `ariaLabel`)
- `client/src/shared/styles/App.css` (discount disabled colors only; prior edits left in place)
- This status file

No `dashboard/`, `server/`, Lab TSX, Pharmacy, OT, receipt, or `docs/*.html` edits. Doctors, services, and catalog dialogs were not touched.

## Files modified (Lab bill desk chat)

- `client/src/pages/lab/LabBillListDialog.tsx` (focus move, return, Escape, Tab trap)
- `client/src/pages/lab/LabBillForm.tsx` (doctor typeahead `ariaLabel`)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Pharmacy, OT, receipt, or `docs/*.html` edits. Services and catalog were not touched. `LabPage` was reviewed only.

## Files modified (Pharmacy billing desk chat)

- `client/src/pages/pharmacy/PharmacyBillListDialog.tsx` (focus move, return, Escape, Tab trap)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, catalog, purchase, items, movements, OT, receipt, or `docs/*.html` edits. `PharmacyBillingPage` and `PharmacyBillForm` were reviewed only.

## Files modified (OT billing desk chat)

- `client/src/pages/ot/OtHistoryModal.tsx` (focus move, return, Escape, Tab trap)
- `client/src/pages/ot/OtPage.tsx` (doctor typeahead `ariaLabel`; procedure field as `<label>`)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, Pharmacy, OT stock/services, receipt, or `docs/*.html` edits. `OtPage` F-keys were reviewed only.

## Files modified (Expenses bill desk chat)

- `client/src/pages/expenses/ExpenseBillListDialog.tsx` (focus move, return, Escape, Tab trap)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, Pharmacy, OT, patients, IPD, receipt, or `docs/*.html` edits. `ExpenseBillPage` was reviewed only.

## Files modified (Expenses history category filter)

- `client/src/shared/BillHistoryToolbar.tsx` (optional labeled category select; `BillHistoryQuery.category`)
- `client/src/pages/expenses/ExpenseBillListDialog.tsx` (`categoryOptions` + `portal` on list/suggestions)
- `client/src/pages/patients/PatientsPage.tsx` (`emptyHistoryQuery` includes `category: ""` only)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, Pharmacy, OT, IPD, receipt, or `docs/*.html` edits.

## Files modified (Patients desk chat)

- `client/src/pages/patients/PatientsPage.tsx` (form/detail focus move, Escape leave, focus return; form `aria-labelledby`; list row and tablist names; notes `aria-labelledby`)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, Pharmacy, OT, Expenses, IPD, receipt, or `docs/*.html` edits.

## Files modified (Patients chart list search)

- `client/src/shared/BillHistoryToolbar.tsx` (`explicitSearch` plain field + Search before Filter)
- `client/src/pages/patients/PatientsPage.tsx` (chart list uses `explicitSearch`; list suggestions removed)
- `client/src/shared/i18n.ts` (EN/MY `guidePatientSearchBody`)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, Pharmacy, OT, Expenses, IPD, receipt, or `docs/*.html` edits. Other desks keep typeahead.

## Files modified (IPD desk chat)

- `client/src/pages/ipd/IpdChargeBillListDialog.tsx` (focus move, return, Escape, Tab trap)
- `client/src/pages/ipd/IpdDailyStatementPreview.tsx` (focus move, return, Escape, Tab trap; yields to alert only)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, Pharmacy, OT, Expenses, Patients, receipt, or `docs/*.html` edits. `IpdPage` and `IpdChargeBillPage` were reviewed only.

## Files modified (Pharmacy catalog and purchase chat)

- `client/src/pages/pharmacy/PharmacyPurchaseListDialog.tsx` (focus move, return, Escape, Tab trap)
- `client/src/pages/pharmacy/PharmacyItemsTab.tsx` (restock modal focus move, return, Escape, Tab trap)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, Pharmacy billing, OT, Expenses, Patients, IPD, receipt, or `docs/*.html` edits. `PharmacyPurchasePage` and `PharmacyMovementsTab` were reviewed only.

## Files modified (OT stock and services chat)

- `client/src/pages/ot/OtServicesPage.tsx` (form focus move, return, Escape; form `aria-labelledby`; list error alert; inactive name text)
- `client/src/pages/ot/OtCatalogHistory.tsx` (filter focus on open; error alert)
- `client/src/pages/ot/OtStockPage.tsx` (filter Escape; error alerts; inactive name text)
- `client/src/pages/ot/OtMaintenancePage.tsx` (tab `id` / `aria-controls` / `tabpanel`)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, Pharmacy, OT billing (`OtPage` / `OtHistoryModal`), Expenses, Patients, IPD, receipt, or `docs/*.html` edits. `CatalogDeleteDialog` / `AlertDialog` were not edited.

## Files modified (Reports chat)

- `client/src/pages/reports/ReportsPage.tsx` (tablist/tabpanel; `t("reports")` label; error alert; list names; low-stock / past-expiry text)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, Pharmacy, OT, Expenses, Patients, IPD, settings, receipt, or `docs/*.html` edits.

## Files modified (Settings chat)

- `client/src/pages/settings/SettingsPage.tsx` (tablist/tabpanel; `t("settings")` label)
- `client/src/pages/settings/HospitalTab.tsx` (form `aria-labelledby`; preview/`logoPath` naming; printer errors alert)
- `client/src/pages/settings/DoctorsTab.tsx` (edit focus move/return/Escape; form labelled; list named)
- `client/src/pages/settings/CategoriesTab.tsx` (same; yield Escape to AlertDialog)
- `client/src/pages/settings/UsersTab.tsx` (same; focus display name when editing)
- `client/src/pages/settings/BackupTab.tsx` (EN/MY strings; error alert; labelled panels/list)
- `client/src/pages/settings/TrainingTab.tsx` (error alert)
- `client/src/shared/i18n.ts` (backup EN/MY keys only)
- This status file

No `dashboard/`, `server/`, `App.css`, OPD, Lab, Pharmacy, OT, Expenses, Patients, IPD, Reports, receipt, or `docs/*.html` edits. `AlertDialog` was not edited.

## Tests performed

- 2026-11-01 Cross-portal audit. Ports 8080, 1420, and 1421 were already listening (existing API, clinic, and dashboard Vite; no second copy; live DB not opened). Did not sign in and did not create a user. Clinic login at `http://localhost:1420` was English. Dashboard login at `http://localhost:1421` was measured in Myanmar and English; Myanmar was restored afterward. Signed-in desks were not opened. No WCAG claim. Clinic: stack `Roboto, "Noto Sans Myanmar", Arial, sans-serif`; root 16px; body 17px / 400, line-height 25.5px; `h1` 28px / 600 / 35px; `--accent` `#2563eb`; `--focus-ring` `0.28`; `--checking` `#8a6508` (5.32:1 on white); `--control-height` 44px / `--control-height-compact` 32px; username min-height 44px and height 46.6px at 17px; Sign in 44px at 16px / 600; `html` / `body` / `#root` `overflow: hidden`. Clinic `--border` `#d8dee6` is 1.35:1 on white. Clinic `--border-strong` `#c5ccd6` is 1.62:1 on white. Clinic `--field-border` is 3.05:1 on white (username uses that). Clinic `--muted` `#667085` is 4.97:1 on white. Clinic `--placeholder` `#64748b` is 4.76:1 on white. Dashboard: same stack; English body line-height 25.5px; Myanmar body line-height 26.35px; `h1` 28px / 600 / 35px; `--accent` `#2563eb`; `--warn` `#8a6508` (5.32:1 on white); `--focus-ring` `0.28`; `--checking` `#b8860b` (3.25:1 on white, status dot); `html` / `body` overflow `visible`. Dashboard `--border` `rgba(0, 0, 0, 0.06)` is 1.14:1 on the page background. Dashboard `--border-strong` `rgba(0, 0, 0, 0.12)` is 1.32:1 on white; the username border is that token, height 46.6px, `min-height: auto`. Sign in is 39.6px, `min-height: auto`, 16px / 600. Dashboard `--muted` is 5.20:1 on white and 4.81:1 on the page background. Shared `.code-chip` is accent on `--bg-soft`, 4.44:1 at 14px / 600. `.audit-page .code-chip` is pressed ink, 7.49:1. Chart grid `rgba(26, 31, 46, 0.08)` on white is 1.17:1. `.bar-ot` at opacity 0.75 composites to 2.27:1 on the track; the share bar is `aria-hidden`. Series on white: OT 3.43:1, Pharmacy 5.32:1, Lab 4.92:1, IPD 6.46:1. Stylesheet rule counts: 7 `.revenue-page`, 4 `.stock-page`, 4 `.daily-page`, 2 `.print-preview-shell`, 10 `.master-page`, 6 `.audit-page`. Shared `.range-toggle` still has `overflow: hidden`. Login labels stay one text line in both locales (the label box is taller because it wraps the input).
- Manual check on the running clinic login screen at `http://localhost:1420` (existing `run-client.ps1` / Vite; no second client). Computed `--control-height` 44px / `--control-height-compact` 32px; username input min-height 44px and height ~46.6px at 17px; Sign in button height 44px at 16px/600; Myanmar labels one line (`အသုံးပြုသူအမည်`, `စကားဝှက်`). Focus CSS rule is accent border + `--focus-ring` `0.28`. Tokens `--checking` `#8a6508`. No WCAG claim.
- Bill desk compact check skipped: demo login rejected on this DB (no open session). Compact selectors still pinned in CSS.
- `npm run build` in `client/` (`tsc && vite build`): passed (shared-controls chat).
- 2026-11-01 shell and auth, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). English and Myanmar login: brand eyebrow sentence case, 14px / 600; Sign in title 28px / 600; username min-height 44px and height ~46.6px at 17px; Sign in button 44px at 16px / 600. Myanmar labels one line (`အသုံးပြုသူအမည်`, `စကားဝှက်`). Server IP button name includes the status sentence. Popover opens with focus on Change server IP; Escape closes and returns focus to the Server IP button. Endpoint reads `လိပ်စာ:` in Myanmar. `--focus-ring` still `0.28`. `--checking` still `#8a6508`. The automation tab set `activeElement` but did not match `:focus`, so the painted ring was not observed; the field `:focus` rule is still in the stylesheet. Signed-in skip link, Home, About, Help, and print preview were not opened (no login against the live DB). CSSOM confirmed the new shell rules (skip link 44px, help actions 44px, help headings 18px, help `kbd` 11px, `print-preview-shell` actions 44px and note 14px, nav inset ring, child nav weight 400, header language 32px).
- `npm run build` in `client/` after the shell edits: passed.
- 2026-11-01 OPD bill desk, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected (“That username or password is not correct”). Did not create a user and did not open the live DB. History dialog focus move/return/Tab trap and doctor `ariaLabel` were not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-desk-title` 22px / 600; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No WCAG claim.
- `npm run build` in `client/` after the OPD bill desk edits: passed.
- 2026-11-01 Lab bill desk, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected. Did not create a user and did not open the live DB. History dialog focus move/return/Tab trap and doctor `ariaLabel` were not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No shared CSS edit in this chat. No WCAG claim.
- `npm run build` in `client/` after the Lab bill desk edits: passed.
- 2026-11-01 Pharmacy billing desk, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected. Did not create a user and did not open the live DB. History dialog focus move/return/Tab trap was not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No shared CSS edit in this chat. No WCAG claim.
- `npm run build` in `client/` after the Pharmacy billing desk edits: passed.
- 2026-11-01 OT billing desk, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected. Did not create a user and did not open the live DB. History dialog focus move/return/Tab trap and doctor `ariaLabel` were not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No shared CSS edit in this chat. No WCAG claim.
- `npm run build` in `client/` after the OT billing desk edits: passed.
- 2026-11-01 Expenses bill desk, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected. Did not create a user and did not open the live DB. History dialog focus move/return/Tab trap was not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No shared CSS edit in this chat. No WCAG claim.
- `npm run build` in `client/` after the Expenses bill desk edits: passed.
- 2026-11-01 Patients desk, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected. Did not create a user and did not open the live DB. Form/detail focus move/return/Escape were not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No shared CSS edit in this chat. No WCAG claim.
- `npm run build` in `client/` after the Patients desk edits: passed.
- 2026-11-01 IPD desk, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected. Did not create a user and did not open the live DB. Charge-bill history and daily-statement focus move/return/Tab trap were not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No shared CSS edit in this chat. No WCAG claim.
- `npm run build` in `client/` after the IPD desk edits: passed.
- 2026-11-01 Patients chart list search, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `patients` / `patients123` rejected. Did not create a user and did not open the live DB. Explicit Search button / Enter search were not exercised on the signed-in desk. `npx tsc --noEmit` in `client/` passed after the edits. No App.css edit. No WCAG claim.
- 2026-11-01 Pharmacy catalog and purchase, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected. Did not create a user and did not open the live DB. Purchase history and restock dialog focus move/return/Tab trap were not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No shared CSS edit in this chat. No WCAG claim.
- `npm run build` in `client/` after the Pharmacy catalog and purchase edits: passed.
- 2026-11-01 Expenses history category filter, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `admin` / `admin123` rejected. Did not create a user and did not open the live DB. Category dropdown on History → Filter was not exercised on the signed-in desk. `npx tsc --noEmit` in `client/` passed after the edits. No App.css edit. No WCAG claim.
- 2026-11-01 OT stock and services, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected. Did not create a user and did not open the live DB. Service form / history / stock filter focus move/return/Escape were not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No shared CSS edit in this chat. No WCAG claim.
- `npm run build` in `client/` after the OT stock and services edits: passed.
- 2026-11-01 Reports, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected. Did not create a user and did not open the live DB. Report tabs / print were not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No shared CSS edit in this chat. No WCAG claim.
- `npm run build` in `client/` after the Reports edits: passed.
- 2026-11-01 Settings, same running clinic at `http://localhost:1420` (existing `run-client.ps1`; no second client). Demo `opd` / `opd123` rejected. Did not create a user and did not open the live DB. Settings tabs / edit focus were not exercised on the signed-in desk. CSSOM on the login page confirmed: `--control-height` 44px / `--control-height-compact` 32px; `--focus-ring` `0.28`; `--checking` `#8a6508`; `.opd-bill-input` and `.opd-bill-rail-btn` min-height compact; `.opd-bill-discount-input:disabled` / `.opd-bill-discount-unit:disabled` opacity 1, muted text, fill `#f8fafc`. No shared CSS edit in this chat. No WCAG claim.
- `npm run build` in `client/` after the Settings edits: passed.
- 2026-11-01 dashboard fonts and tokens at `http://localhost:1421` (Vite `npm run dev` in `dashboard/`; `run-dashboard.ps1` failed to parse in this shell — used Vite only; no second copy; ports 8080 and 1420 left alone). English and Myanmar login CSSOM: stack `Roboto, "Noto Sans Myanmar", Arial, sans-serif`; `--accent` `#2563eb`; `--accent-hover` / `--accent-pressed` present; `--focus-ring` `0 0 0 3px rgba(37, 99, 235, 0.28)`; `--warn` `#8a6508`; `--series-ot` / `--series-pharmacy` set; root 16px; body 17px / 400; Myanmar body line-height ratio 1.55; brand `h1` 28px / 600; eyebrow 14px / 600 sentence case; Sign in button 16px / 600; username input 17px. Did not create a user and did not open the live DB. No WCAG claim.
- `npm run build` in `dashboard/` after the token edits: passed (Roboto and Noto 400/600 faces in the bundle).
- 2026-11-01 Dashboard Overview at `http://localhost:1421` (existing Vite `npm run dev`; no second copy; ports 8080 and 1420 left alone). CSSOM on login confirmed `--series-lab` `#a16207`, `--series-ipd` `#6b4fa0`, `--accent` `#2563eb`, `--warn` `#8a6508`, `--focus-ring` `0.28`. Did not sign in (no new user; did not open the live DB). Signed-in Overview KPIs / chart were not exercised. `npx tsc --noEmit` in `dashboard/` passed. No WCAG claim.
- 2026-11-01 Dashboard Revenue at `http://localhost:1421` (existing Vite `npm run dev`; no second copy; ports 8080 and 1420 left alone). CSSOM on login confirmed `--accent` `#2563eb`, `--warn` `#8a6508`, `--focus-ring` `0.28`, `--series-ot` / `--series-pharmacy` / `--series-lab` / `--series-ipd`, and four `.revenue-page` rules (44px actions/date wrap/icon; 14px day cells). English and Myanmar login chrome checked. Did not sign in (no new user; did not open the live DB). Signed-in Revenue charts / DatePicker were not exercised. `npx tsc --noEmit` in `dashboard/` passed. No WCAG claim.
- 2026-11-01 Dashboard Revenue follow-up, same page. Ports 8080, 1420, and 1421 were not listening, so Vite was started once with `npm run dev` in `dashboard/` (no second copy; API was not started; live DB not opened). Login fields stayed disabled because the API was down. English and Myanmar chrome still switch. A hidden `.revenue-page` probe measured: preset active ink `rgb(30, 64, 175)` at 16px/600 and 44px tall; panel `h2` 18px/600; subhead `h3` 16px/600; date wrap 184×46px; icon 44×44; date input 17px with `2026/11/01` not overflowing; day cell 14px; month nav 29.6px. Signed-in charts and the calendar focus path were not exercised. `npx tsc --noEmit` in `dashboard/` passed. No WCAG claim.
- 2026-11-01 Dashboard Stock. Port 1421 was already listening on `[::1]` (existing Vite; no second copy). Ports 8080 and 1420 were not listening. The API was not started and the live DB was not opened. The window opened on the server-address screen, not signed-in Stock. English and Myanmar chrome still switch (`data-locale="my"`, body 17px, line-height 26.35px = 1.55, title 28px/600). A laid-out `.stock-page` probe measured: active preset ink `rgb(30, 64, 175)` at 16px/600 and 44×84.7px; refresh min-height 44px; panel `h2` 18px/600; range group `overflow: visible`. Tokens `--accent` `#2563eb`, `--warn` `#8a6508`, `--danger` `#c62828`, `--series-ipd` `#6b4fa0`, `--focus-ring` `0.28`. Revenue’s seven `.revenue-page` rules were still present. Signed-in Stock charts, tables, and preset clicks were not exercised. `npx tsc --noEmit` in `dashboard/` passed. No WCAG claim.
- 2026-11-01 Dashboard Daily report. Ports 8080, 1420, and 1421 were not listening, so Vite was started once with `npm run dev` in `dashboard/` (no second copy; API was not started; live DB not opened). Login fields stayed disabled because the API was down. English and Myanmar chrome still switch (Myanmar restored afterward). A laid-out `.daily-page` probe measured: Previous and Print 44px at 16px/600; date input 44px at 17px/400; menu item 44px at 16px/600; panel `h2` 18px/600 (line-height 24.3px). Longest menu labels fit on one line (English “Print Overall Daily Report” 202px; Myanmar “ဘေလ် အသေးစိတ် အားလုံး ပရင့်” 245px). Preview Print and scope select 44px. Sign-in stayed 39.6px with `min-height: auto` (global `.btn` unchanged). Stylesheet still had 7 `.revenue-page` rules and 4 `.stock-page` rules, plus 4 `.daily-page` and 2 `.print-preview-shell` rules. Tokens `--accent` `#2563eb`, `--warn` `#8a6508`, `--danger` `#c62828`, `--ok` `#2e7d32`, `--focus-ring` `0.28`. Myanmar body 17px, line-height 26.35px = 1.55, title 28px/600. Signed-in Daily report, the print menu, and the preview were not exercised. `npx tsc --noEmit` in `dashboard/` passed. No WCAG claim.
- 2026-11-01 Dashboard Audit. Ports 8080, 1420, and 1421 were already listening (existing API, clinic, and Vite; no second copy; live DB not opened). Login fields were enabled. Documented `admin` / `admin123` was rejected (“That username or password is not correct.”). Did not create a user and did not open the live DB. Signed-in Audit, search, and detail expand were not exercised. English and Myanmar chrome still switch (Myanmar restored afterward). English body 17px, line-height 25.5px = 1.5, title 28px/600. Myanmar body 17px, line-height 26.35px = 1.55, title 28px/600. A laid-out `.audit-page` probe measured: search, entity select, and Refresh 44px (inputs 17px/400, button 16px/600). Panel `h2` 18px/600 (line-height 24.3px). Labels `ရှာရန်` and `အရာ` 14px/600, nowrap, one line (20.3px tall). Entity options fit in the 192px select (longest about 82px). Detail `.linkish` inside the table is 16px/400, padding 0, height 24px (line-height 24px). Action chip ink `rgb(30, 64, 175)` on `rgb(238, 238, 233)`, 7.49:1. Muted label on the page background 4.81:1. Sign-in stayed 39.6px with `min-height: auto` (global `.btn` unchanged). Stylesheet still had 7 `.revenue-page` rules, 4 `.stock-page` rules, 4 `.daily-page` rules, 2 `.print-preview-shell` rules, and 10 `.master-page` rules, plus 6 `.audit-page` rules. Shared `.range-toggle` is still one rule with `overflow: hidden`. Tokens `--accent` `#2563eb`, `--accent-pressed` `#1e40af`, `--warn` `#8a6508`, `--focus-ring` `0.28`. `npx tsc --noEmit` in `dashboard/` passed. No WCAG claim.
- 2026-11-01 Dashboard Master data. Ports 8080 and 1420 were already listening. Port 1421 was not, so Vite was started once with `npm run dev` in `dashboard/` (no second copy; the API and clinic were left running; live DB not opened). Login fields were enabled. Documented `admin` / `admin123` was rejected (“အသုံးပြုသူအမည် သို့မဟုတ် စကားဝှက် မမှန်ပါ။”). Did not create a user and did not open the live DB. Signed-in Master data, the bulk modal, and CSV were not exercised. English and Myanmar chrome still switch (Myanmar restored afterward). English body 17px, line-height 25.5px = 1.5, title 28px/600. Myanmar body 17px, line-height 26.35px = 1.55, title 28px/600. A laid-out `.master-page` probe measured: Export, Bulk update, tabs, search, Refresh, reason field, Apply, and Close 44px (buttons 16px/600, inputs 17px/400). Active tab ink `rgb(30, 64, 175)` on accent-soft, 7.59:1 (accent on that fill is 4.50:1). Range group `overflow: visible`. Panel `h2` 18px/600 (line-height 24.3px). Modal `h3` stays 18px/600 via `.panel h3`. Search label `ရှာရန်` 14px/600, nowrap, one line (20.3px tall). Myanmar tab `ဝန်ဆောင်မှုများ` 44×133.5px, one line. CSV paste area 14px and about 119px tall at 5 rows. Sign-in stayed 39.6px with `min-height: auto` (global `.btn` unchanged). Stylesheet still had 7 `.revenue-page` rules, 4 `.stock-page` rules, 4 `.daily-page` rules, and 2 `.print-preview-shell` rules, plus 10 `.master-page` rules. Shared `.range-toggle` is still one rule. Tokens `--accent` `#2563eb`, `--warn` `#8a6508`, `--danger` `#c62828`, `--ok` `#2e7d32`, `--focus-ring` `0.28`. Muted label on white 5.20:1. Low-stock name ink on the blended warn-soft fill 14.52:1. `npx tsc --noEmit` in `dashboard/` passed. No WCAG claim.

## Decisions

- 2026-11-01. No shared UI package. Tokens are duplicated into each app’s existing stylesheet.
- 2026-11-01. Font stack is `"Roboto", "Noto Sans Myanmar", Arial, sans-serif`. Local `@fontsource` files, weights 400 and 600 only. No CDN.
- 2026-11-01. Root font size stays 16px. Role sizes are set explicitly. Body is 17px. See the spec table.
- 2026-11-01. Primary form fields and primary form buttons go to 44px. Bill toolbar, cart rows, bill rail, and dialog close stay compact, with a 24px floor.
- 2026-11-01. Canonical accent is `#2563EB`. Dashboard `#1b6bc7` changes in the dashboard token chat.
- 2026-11-01. `font-weight: 650` collapses to 600 when those rules are touched.
- 2026-11-01. One font stack for both locales. Myanmar locale only changes line height (1.55).
- 2026-11-01. No new Settings-page text-size control. Existing clinic Ctrl/Cmd zoom stays.
- 2026-11-01. Server receipts and `docs/*.html` are out of scope.
- 2026-11-01. Working tree on `main` was already dirty (IPD, billing, dashboard report, and CSS). No branch was created. Those edits were left untouched.
- 2026-11-01 font chat deviations (keep compact bill / control sizes):
  - `.desk-header-title` stays 1.05rem (weight → 600). 28px would overflow the shell bar.
  - Dialog titles (`.alert-dialog-title`, `.opd-bill-dialog-title`, `.print-preview-title`) keep their sizes; only 650/700 → 600.
  - Cart (`--bill-cart-font`, row height), `.bill-lines`, bill-rail text including the 0.68rem sub line, `.opd-bill-label`, `.opd-bill-total-row` (0.8125rem), inputs, nav button sizes, date-picker sizes, and `.ipd-day-action-sub` stay as they are.
  - `.form-section-title` is a form label → 14px floor, not 22px section heading.
  - `.ipd-stay-summary-amount` stays on its 14px summary line; weight → 600; tabular-nums added.
  - `.desk-text-link` may keep `font-style: italic`. No italic file is loaded; `font-synthesis: none`, so it draws roman.
  - `.btn` pins `font-size: 16px` after `font: inherit` so buttons do not follow body 17px. Padding/height unchanged.
  - Cheat-sheet `srcdoc` uses the same family names but does not inherit `@font-face`; it falls back to Arial until a later chat inlines faces.
- 2026-11-01 shared-controls chat:
  - `--control-height: 44px` on primary `.field` input/select, `.field .date-picker-input-wrap`, `.card-form > .btn`, unpaired `.btn-row` primary/ghost, `.alert-dialog-ok` / `.alert-dialog-actions .btn`.
  - Compact stay at `--control-height-compact: 32px` (24px floor): bill header inputs, cart, rail, list/settings/drug/catalog toolbars, paired primary+action rows, OT cupboard row, `.btn.compact`, `.alert-dialog-close`, date-picker icon button.
  - Checkbox in `.field`: 24×24 floor; not raised to 44px.
  - Do not set `min-height: 44px` on bare `.btn` (compact buttons also use `.btn`).
  - `--focus-ring` darkened to `0 0 0 3px rgba(37, 99, 235, 0.28)`. Borderless rows use inset accent edge + ring.
  - `--placeholder` `#64748b` (~4.8:1) and `--muted` `#667085` (~5:1) on white: leave as-is.
  - `--checking` `#8a6508` (was `#b8860b` ~3.3:1; fails for `.low-stock` text). No new status word/icon.
  - `.bill-history-table-head` drops uppercase. `.bill-history-print-btn` 24px floor.
  - AlertDialog restores focus to the opener. No focus traps on page dialogs / Help / `print.ts` in that chat.
- 2026-11-01 shell and auth chat:
  - Header Help, Log out, Server IP, and the language pair stay at `--control-height-compact` (32px). They are `.btn.compact` / `.lang-compact` in one chrome row. 44px would grow the bar under the 1.05rem title.
  - Nav font sizes stay. Child and nested parent `font-weight: 500` became 400 (500 is not a loaded face).
  - `.print-preview-title` stays 1rem / 600. Print and Close on the imperative preview are 44px via `.print-preview-shell` only, so the IPD daily statement preview is unchanged.
  - Print note on that shell preview is 14px. IPD’s `.print-preview-note` stays 0.78rem until the IPD chat.
  - Help action buttons in `.help-card .btn-row` are 44px. Dialog close stays 32px.
  - Help `h3` is the card-heading role (18px / 600). Help `kbd` is 11px / 600.
  - Server popover stays non-modal. Escape and the button itself return focus. A click outside does not pull focus back.
  - Help does not take focus back if a tour has already moved it outside the dialog.
  - Once focus is inside the receipt iframe, parent Escape and the Tab trap do not see those keys. Receipt HTML was not changed.
  - `html` / `body` / `#root` stay `overflow: hidden`. A window scroll would change every desk, including bill desks this chat must not restyle. 200% clip of those desks stays open.
- 2026-11-01 OPD bill desk chat:
  - Scope is billing only (`OpdPage`, `OpdBillForm`, `OpdBillListDialog`). Doctors, services, and catalog dialogs stay for a later pass.
  - `OpdBillListDialog` copies the Help focus pattern inline. No shared helper. `LabBillListDialog` is unchanged.
  - Compact bill controls stay at `--control-height-compact` (32px, 24px floor): header fields, cart, rail, dialog close, history toolbar. Void-reason stays a normal `.field` at 44px.
  - `.opd-bill-desk-title` stays 22px / 600 (section heading under the shell `h1`). `.opd-bill-dialog-title` stays `1.05rem`.
  - `.opd-bill-unit` (12px), `.opd-bill-collect-note` (12px), and `.opd-bill-service-count` (~13.6px) stay under the 14px floor so the compact header and footer do not grow on every desk that shares those classes.
  - `.opd-bill-new-badge` weight 800 stays. Synthesis is off, so it already draws with an available face. Setting 600 would darken the watermark on every bill desk.
  - Discount disabled fields drop whole-control fade and match bill-input disabled colors. Lab, Pharmacy, OT, IPD, and expenses inherit that look only; they stay NOT STARTED.
  - English catch fallbacks in `OpdPage` and the list dialog stay. They already surface through `AlertDialog`. Lab has the same literals; this chat did not fork them.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 Lab bill desk chat:
  - Scope is billing only (`LabPage`, `LabBillForm`, `LabBillListDialog`). Services and catalog stay for a later pass.
  - `LabBillListDialog` copies the OPD / Help focus pattern inline. No shared helper. `LabPage` was reviewed only (F-keys already yield to dialog / alert / print).
  - Compact bill controls stay at `--control-height-compact` (32px, 24px floor). No shared `.opd-bill-*` CSS edit; discount disabled colors remain the earlier inherited rule.
  - English catch fallbacks in `LabPage` and the list dialog stay, matching OPD.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 Pharmacy billing desk chat:
  - Scope is billing only (`PharmacyBillingPage`, `PharmacyBillForm`, `PharmacyBillListDialog`). Return and transfer reuse that page and dialog. Catalog, items, movements, and purchase stay for a later pass.
  - `PharmacyBillListDialog` copies the Lab / OPD / Help focus pattern inline. No shared helper. `PharmacyBillingPage` was reviewed only (F-keys already yield to dialog / alert / print). `PharmacyBillForm` naming was already present (patient typeahead, medicine `ariaLabel`, labeled fields, rail).
  - Compact bill controls stay at `--control-height-compact` (32px, 24px floor). No shared `.opd-bill-*` CSS edit; discount disabled colors remain the earlier inherited rule.
  - English catch fallbacks in `PharmacyBillingPage` and the list dialog stay, matching OPD and Lab.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 OT billing desk chat:
  - Scope is billing only (`OtPage`, `OtHistoryModal`). Stock, services, catalog history, and maintenance stay for a later pass because the bill desk is the large surface.
  - `OtHistoryModal` copies the Pharmacy / Lab / OPD / Help focus pattern inline. No shared helper. History, void, and purge share that modal. `OtPage` was reviewed only (F-keys already yield to dialog / alert / print). Patient typeahead and cart cupboard/service `ariaLabel`s were already present.
  - Compact bill controls stay at `--control-height-compact` (32px, 24px floor). No shared `.opd-bill-*` CSS edit; discount disabled colors remain the earlier inherited rule.
  - English catch fallbacks in `OtPage` and the history modal stay, matching OPD, Lab, and Pharmacy.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 Expenses bill desk chat:
  - Scope is the whole expenses desk (`ExpenseBillPage`, `ExpenseBillListDialog`). There is no second expenses surface.
  - `ExpenseBillListDialog` copies the OT / Pharmacy / Lab / OPD / Help focus pattern inline. No shared helper. History, void, and purge share that dialog. `ExpenseBillPage` was reviewed only (F-keys already yield to dialog / alert / print). Header fields are labeled; cart particular/qty/fees `aria-label`s were already present. No typeahead.
  - Compact bill controls stay at `--control-height-compact` (32px, 24px floor). No shared `.opd-bill-*` CSS edit; discount disabled colors remain the earlier inherited rule.
  - English catch fallbacks in `ExpenseBillPage` and the list dialog stay, matching OPD, Lab, Pharmacy, and OT.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 Patients desk chat:
  - Scope is the whole patients desk (`PatientsPage`). There is no separate modal history dialog; create/edit and chart detail are in-page views with `DialogCloseButton`, not `role="dialog"`.
  - Escape leaves create/edit or returns from detail to the list (yields to alert and print). Focus moves to the name field on form open and to the chart title on detail open; return goes to the opener or the list row (`data-patient-row`). No Tab trap — these are page views, not modal overlays. Delete and create-success stay on `AlertDialog`.
  - Compact bill / toolbar controls stay at `--control-height-compact` (32px, 24px floor). No shared CSS edit.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 Patients chart list search:
  - Chart list toolbar only: `explicitSearch` plain field plus Search before Filter. Typing does not suggest; Enter or Search runs `listPatients`. Bill history search inside a chart keeps typeahead. Other desks unchanged.
  - No App.css edit. Compact toolbar row height unchanged.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 IPD desk chat:
  - Scope is the whole IPD desk: stays (`IpdPage` + `IpdDailyStatementPreview`) and charge bills (`IpdChargeBillPage` + `IpdChargeBillListDialog`).
  - `IpdChargeBillListDialog` copies the Expenses / OT / Pharmacy / Lab / OPD / Help focus pattern inline. No shared helper. History, void, and purge share that dialog. Yields to alert and print-preview overlays.
  - `IpdDailyStatementPreview` uses the same focus move/return/Escape/Tab trap inline, but yields only to `.alert-dialog-overlay` because the preview root is itself `.print-preview-overlay`. Keys inside the statement iframe stay in the iframe (same limitation as shell print preview).
  - `IpdPage` and `IpdChargeBillPage` were reviewed only. `PatientChartTypeahead` already sets `ariaLabel={t("patientName")}`. Charge cart particular/qty/fees and stay table/rail labels were already present. Charge-bill F-keys already yield to dialog / alert / print.
  - Compact bill controls stay at `--control-height-compact` (32px, 24px floor). No shared `.opd-bill-*` CSS edit; discount disabled colors remain the earlier inherited rule. IPD `.print-preview-note` size stays as before (shell chat left it alone).
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 Pharmacy catalog and purchase chat:
  - Scope is items, movements, and purchase (`PharmacyItemsTab`, `PharmacyMovementsTab`, `PharmacyPurchasePage`, `PharmacyPurchaseListDialog`). Pharmacy billing stays IMPLEMENTED and was not restyled.
  - `PharmacyPurchaseListDialog` copies the IPD / Expenses / bill-list focus pattern inline. No shared helper. History and purge share that dialog (void is page-level `VoidBillConfirm`). Yields to alert and print-preview overlays.
  - `PharmacyItemsTab` restock portal modal (`role="dialog"`) gets the same focus move/return/Escape/Tab trap when `embedDetail`. In-page (non-embed) restock stays a page panel without a Tab trap. Movements has no modal dialog.
  - `PharmacyPurchasePage` reviewed only (F-keys already yield; medicine typeahead `ariaLabel` already present). Items lookup/search typeaheads use visible `label` (no extra `ariaLabel` needed).
  - Compact bill / toolbar controls stay at `--control-height-compact` (32px, 24px floor). No shared CSS edit.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 OT stock and services chat:
  - Scope is cupboard, services, catalog history, and maintenance (`OtMaintenancePage`, `OtStockPage`, `OtServicesPage`, `OtCatalogHistory`). OT billing stays IMPLEMENTED and was not restyled.
  - No desk-owned history/list overlay. Service delete uses shared `CatalogDeleteDialog` → `AlertDialog` (focus move/return/Escape already present). Do not add a Tab trap there; shared alert was not edited.
  - In-page panels follow Patients: focus move/return and Escape, no Tab trap. Service form Escape yields to alert/print, then closes filter, then form, then history. Stock Escape only closes the catalog filter.
  - Inactive service rows and cupboard item names append `t("inactive")` so status is not color/opacity alone. Shared `.drug-setup-table-row.inactive` opacity rule was not changed.
  - Compact bill / toolbar controls stay at `--control-height-compact` (32px, 24px floor). No shared CSS edit. Detail `h3` inline 1.1rem stays.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 Reports chat:
  - Scope is the clinic reports page (`ReportsPage`) only. Settings was left for the next chat.
  - No desk-owned `role="dialog"` overlay. Print goes through shared `print.ts` (shell focus move/return/Escape/Tab trap already present).
  - Tabs match OT maintenance: `role="tablist"` / `tab` / `tabpanel` with ids; tablist label `t("reports")` (was hard-coded English). No arrow-key roving; tabs stay in Tab order.
  - Load/print errors use `role="alert"`. Result lists get `aria-label` from the active report name. Low-stock rows append existing `t("lowStockLabel")`. Past-expiry (`days_left < 0`) also puts days-left text on the title so `.row-warn` color is not alone.
  - Date and days-ahead fields were already wrapped in visible labels. Native `input[type=date]` left as-is (no DatePicker swap).
  - Compact controls stay at `--control-height-compact` (32px, 24px floor). No shared CSS edit.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 Settings chat:
  - Scope is the whole Settings desk (`SettingsPage`, Hospital, Doctors, Categories, Users, Backup, Training). Last clinic desk before dashboard.
  - No desk-owned history/list overlay. Category delete, backup restore, and training reset use shared `AlertDialog` (focus move/return/Escape already present). Not edited; no Tab trap added there.
  - Tabs match Reports / OT maintenance: `role="tablist"` / `tab` / `tabpanel` with ids; tablist label `t("settings")` (was hard-coded English). No arrow-key roving.
  - Doctors / Categories / Users: in-page edit focus move to name (or display name for users), return to Edit opener, Escape cancels edit (yields to alert/print; Categories also yields while delete confirm is open). No Tab trap. Forms `aria-labelledby`; lists named. Typeaheads already use visible `label`.
  - Hospital: forms labelled; preview `aria-label={t("billHeader")}`; logo line uses `t("logoPath")`; printer/Tauri errors `role="alert"`.
  - Backup: hard-coded English chrome moved to EN/MY keys (`backupTitle`, `backupHint`, `backupServerFolder`, `backupNow`, `backupCreated`, `noBackupsYet`, `backupRestoreQueued`). Errors `role="alert"`.
  - Training: error `role="alert"` only.
  - Compact controls stay at `--control-height-compact` (32px, 24px floor). No shared CSS edit.
  - `--focus-ring` still `0.28`. Clinic `--checking` still `#8a6508`.
- 2026-11-01 dashboard fonts and tokens chat:
  - Scope is `dashboard/src/theme.css` and `dashboard/src/main.tsx` only. Clinic `client/` untouched. Dashboard pages stay NOT STARTED.
  - Font stack `"Roboto", "Noto Sans Myanmar", Arial, sans-serif`; weights 400 and 600 only via local Fontsource. No Google Fonts / CDN.
  - Accent moved `#1b6bc7` → `#2563EB` with hover/pressed/ink/soft/border matching clinic. `--focus-ring` `0 0 0 3px rgba(37, 99, 235, 0.28)`.
  - `--warn` measured: old `#c47a00` ~3.43:1 on white (fails for `.alert-chip`); new `#8a6508` ~5.32:1 on white and ~4.55:1 on `--warn-soft` `#f1ede1` (passes 4.5:1). Soft and chip border retinted to RGB 138,101,8.
  - Measured and left: `--muted` `#6d6d68` ~5.20:1 on white / ~4.81:1 on `#f6f6f4`; `--border` `rgba(0,0,0,0.06)` still ~1.1:1 (too faint for a boundary); `--checking` `#b8860b` status-dot only (paired with text label).
  - `.bar-ot` / `.bar-pharmacy` use `--series-ot` / `--series-pharmacy`. Chart series hex in `Overview.tsx`, `Revenue.tsx`, and `Stock.tsx` (including Stock `WARN = "#c47a00"`) left for those page chats.
  - `--card-radius` stays 16px. No spacing scale. No `--control-height` / 44px primary fields (page chats).
  - Type roles in px; 650/550 → 600; inactive nav and `.check-inline` → 400 (500/550 not loaded). KPI / eyebrow sentence case. Nested `.panel-subhead` 16px under `.panel h3` 18px. Print-preview title stays 1rem / 600. Seven-up KPI clamp `20px`–`22px`. Weekday row stays ~12px. Language compact buttons stay 14px.
  - Focus: `:focus-visible` accent border + ring on fields/inputs/buttons; inset + ring on borderless nav/avatar/linkish/print-menu. Primary hover/pressed use accent tokens. Disabled opacity 0.5. Reduced motion stops status-dot pulse only.
- 2026-11-01 Dashboard Overview chat:
  - Scope is Overview only (`Overview.tsx` + series tokens Overview needs). Shared `KpiCard` / `AlertChip` components were not structurally rewritten; Overview passes status text via existing `sub` / chip `label`.
  - Chart series read `--accent`, `--series-ot`, `--series-pharmacy`, new `--series-lab` / `--series-ipd`, and `--ink` / `--muted` at render via `getComputedStyle`. Fallbacks match those tokens. Revenue and Stock still hardcode series hex until their chats.
  - Low stock / near expiry / voids: warn or danger tone plus visible `attentionNeeded` text (chips append `— Needs attention`). Net cash keeps signed `formatDelta` (+/−) so tone is not alone.
  - Load errors `role="alert"`; loading `aria-live="polite"`. Cash share and 30-day trend sections use `aria-labelledby`; chart box `role="img"` + `aria-label`. Share bar stays `aria-hidden` with text percentages beside it.
  - Share heading uses `t("cashShare")`; portal lines use localized cash labels (no hard-coded English OPD/OT/Pharmacy). Near-expiry window uses `t("daysUnit")`. Tooltip money lines 14px / tabular-nums.
  - Axis tick labels stay 11px (axis chrome, not clinical meaning). No 44px control pass. No clinic edits.
- 2026-11-01 Dashboard Revenue chat:
  - Scope is Revenue only (`Revenue.tsx`, DatePicker used only here, scoped `.revenue-page` CSS, i18n keys). Overview / clinic / Stock / Daily report / Master data / Audit not restyled. Shared `KpiCard` markup not rewritten; local `KpiMini` replaced with `KpiCard`.
  - Chart series read `--accent`, `--series-ot`, `--series-pharmacy`, `--series-lab`, and `--muted` via `getComputedStyle`. Fallbacks match those tokens. Grid stroke stays hardcoded `rgba(26, 31, 46, 0.08)` (no grid token). IPD is **not** added to the stacked bar — Revenue stack stays OPD/OT/Pharmacy/Lab so money composition does not change; `--series-ipd` unused here.
  - Load errors `role="alert"`; loading `aria-live="polite"`. Cash trend, doctor/service/margin tables, and KPI strip named. Preset 7/30 buttons use `aria-pressed`. Tooltips and legend 14px / tabular-nums. Axis ticks stay 11px.
  - Accent KPI tone is emphasis beside a visible label (margin % already text). No warn/danger KPI on this page; no `attentionNeeded`.
  - Service `line_type` mapped EN/MY (`service`, `consultation`, `lineTypeOtFee`). Unknown types stay raw. Server `(unassigned)` doctor names unchanged (no API edit).
  - DatePicker: localized open/choose/prev/next labels; non-modal popover. Focusing the text field opens the grid but leaves the caret there so the date can be typed. The calendar icon moves focus to the selected day (or previous month). Escape and day select return focus to the opener and do not immediately reopen. Click outside closes without pulling focus. Selected day `aria-current="date"` + ISO `aria-label`. Month names and Su–Sa stay English. Weekday chrome ~11.5px; day cells 14px under `.revenue-page` only.
  - Preset 7/30 active text uses `--accent-pressed` on `--accent-soft`. Accent on that soft fill measured ~4.49:1 (fails 4.5:1 at 16px/600). Pressed ink on the same fill is ~7.57:1. Stock’s shared `.range-toggle .btn.active` is unchanged.
  - Panel titles are `h2` (card heading, 18px / 600) under the workspace `h1`. They are not the 22px section size. Margin subheads are `h3` and stay 16px / 600. A scoped rule beats `.panel h3` (18px) so the subhead does not match the panel title.
  - 44px only under `.revenue-page` for page-actions buttons, date wrap, and calendar icon. Calendar month nav stays ~30px (above 24px floor). Global `.btn` untouched so Overview/Stock toolbars do not grow. White on `--accent` for the selected day measured ~5.17:1.
- 2026-11-01 Dashboard Stock chat:
  - Scope is Stock only (`Stock.tsx`, scoped `.stock-page` CSS, EN day-unit strings). Overview / Revenue / clinic / Daily report / Master data / Audit not restyled. Shared `KpiCard` markup not rewritten. Stock passes attention text through the existing `sub`.
  - Chart fills read `--danger` (expired), `--warn` (≤30 days), `--series-ipd` (31–60 days), and `--accent` (61–90 days) via `getComputedStyle`. Fallbacks match those tokens. Axis ticks read `--muted`.
  - The old 60-day gold `#d4a017` is 2.38:1 on white (fails 3:1 for a bar). Darkening that same hue until it passes lands on `--warn` `#8a6508` (the 30-day bar). `--series-lab` `#a16207` is within a few RGB steps of `--warn`. `--series-ipd` `#6b4fa0` stays apart from danger, warn, and accent and is 6.46:1 on white. No new series token.
  - Grid stroke stays hardcoded `rgba(26, 31, 46, 0.08)` (no grid token), same as Revenue.
  - Inventory value stays accent beside its visible label (emphasis, not a status). Value at risk, low stock, and slow movers use warn only when the count or amount is above zero, and the subtitle appends `attentionNeeded`.
  - Load errors `role="alert"`; loading `aria-live="polite"`. KPI strip named. Expiry chart is `role="img"`. The four panels are `h2` with `aria-labelledby` on the section and the table. Bucket names on the chart and in the table use `daysUnit` instead of the English API labels. Y-axis money ticks stay 11px (axis chrome, same as Revenue). Category ticks are 14px. Tooltip money is 14px / tabular-nums.
  - Slow-mover presets keep `slow60` / `slow90` / `slow180` (EN now “60 days” / “90 days” / “180 days”; MY already “ရက်”). COGS presets were already `days7` / `days30`. Counted intervals (COGS window, no-sale window, days since sale, bucket ranges) append `daysUnit`. `batchesNearExpiry` EN no longer ends in `d`.
  - Server `note` and `turns_note` stay the English API sentences. No API edit.
  - Preset buttons use `aria-pressed` inside the existing named groups. No arrow-key roving. Active text uses `--accent-pressed` on `--accent-soft`. Accent on that soft fill is about 4.5:1 (Revenue measured ~4.49:1). Pressed ink on the same fill is 7.59:1.
  - Panel titles are `h2` (card heading, 18px / 600) under the workspace `h1`. Stock has no subheads.
  - 44px only under `.stock-page` for page-action buttons, including the range toggles and Refresh. `.stock-page .range-toggle` is `overflow: visible` so the 3px focus ring is not clipped. The shared `.range-toggle` rule stays `overflow: hidden` (Revenue and later pages unchanged). Global `.btn` untouched.
  - Stock has no dialog. Escape does not apply. Buttons are native.
- 2026-11-01 Dashboard Daily report chat:
  - Scope is Daily report only (`DailyReport.tsx`, `dashboard/src/print.ts` because this page is the only opener, scoped `.daily-page` CSS, portal name strings). Overview / Revenue / Stock / clinic / Master data / Audit not restyled. Shared `KpiCard` markup not rewritten.
  - The date control stays a native `input[type=date]` inside `.date-field`, with the existing visually hidden `pickDate` label. DatePicker stays Revenue-only. Chromium (the dashboard’s WebView) accepts keyboard entry in that control and shows the picker indicator, so both the typed date and the calendar icon work. Not switched.
  - Load and print errors `role="alert"`. Loading `aria-live="polite"`. The income/expense/net panel is named with `t("netCash")` (same trio as Overview). The balance strip is `role="region"` named `t("dailyReport")`. The vs-yesterday strip and the five tables are named from their `h2` ids.
  - `formatDelta` signs stay, including zero as `0`. Net cash and the vs-yesterday KPI keep `deltaTone` (accent when up, warn when down) because the sign is already text. Cash balance and total balance stay accent beside their labels. The vs-yesterday figures that use `.delta-val.pos` / `.neg` keep `--ok` / `--danger` and the sign. OPD, OT, Pharmacy, and Lab figures in that strip stay uncolored; they already show the sign. Voids are an unsigned count, so when the count is above zero the subtitle appends `attentionNeeded`.
  - The expense-table portal column uses `t(...)`. English stays OPD / OT / Lab / IPD / Expenses. Myanmar uses the clinic desk names (`ပြင်ပလူနာ`, `ခွဲစိတ်ခန်း`, `ဓာတ်ခွဲခန်း`, `အတွင်းလူနာ`, `အသုံးစရိတ်`). Pharmacy stays `pharmacyPortal`. An unknown portal value stays the raw API string. Paid-bill `source` stays the API string. `earnedLineMMK` and `expenseDisplayMMK` are unchanged.
  - Print menu: focus moves to the first item on click or ArrowDown, and to the last item on ArrowUp. ArrowUp/ArrowDown wrap. Home and End move to the ends. Escape returns focus to Print. Tab closes the menu and moves as if Tab had been pressed on Print. A click outside closes the menu and returns focus to Print only when that click will not focus something else. Menu items are `tabindex="-1"`.
  - Choosing a menu item focuses Print, then opens the preview, so the preview’s opener is the Print button (the menu item unmounts). The preview moves focus to its Print button, traps Tab, and closes on Escape, Close, or the scrim, then returns focus to Print. A failed fetch returns focus to Print. Keys fired inside the receipt iframe still do not reach the parent listener. Preview Print and Close use `t("print")` and `t("close")`. Server print HTML is unchanged. The empty-preview message still uses Arial.
  - Panel titles are `h2` (card heading, 18px / 600) under the workspace `h1`.
  - 44px only under `.daily-page` for page-action buttons, the date input, and menu items (menu items also 16px / 600). The preview is portaled on `document.body`, so its Print, Close, and scope select are 44px under `.print-preview-shell` only. Global `.btn` is untouched. Revenue and Stock rules were not edited.
- 2026-11-01 Dashboard Master data chat:
  - Scope is Master data only (`MasterData.tsx`, including the bulk modal, scoped `.master-page` CSS, three EN/MY strings). Overview / Revenue / Stock / Daily report / clinic / Audit not restyled. Prices, reorder levels, stock quantities, CSV apply, and the UPDATE / IMPORT token checks are unchanged.
  - Tabs stay in `.range-toggle` and match Settings / Reports: `role="tab"`, `aria-selected`, `aria-controls`, one `tabpanel`, tablist name `t("masterData")`. No arrow-key roving. Tabs stay in Tab order. Active text uses `--accent-pressed` on `--accent-soft`. Accent on that fill measured 4.50:1. Pressed ink on the same fill is 7.59:1. `.master-page .range-toggle` is `overflow: visible` so the 3px focus ring can paint. The shared `.range-toggle` rule stays `overflow: hidden`.
  - Search has a visible label `t("search")`. The placeholder stays and is not the name. Refresh stays `t("refresh")`. The CSV paste area has a visible label (`csvPasteLabel`: EN “Paste CSV”, MY “CSV ကူးထည့်”). Its placeholder stays `t("pasteCsv")`. Reason and confirm labels were already visible.
  - Load and action errors use `role="alert"`. While the bulk dialog is open, that alert renders inside the dialog so it is not left behind `aria-modal`. Success uses `role="status"`. Loading uses `aria-live="polite"`. The CSV error list uses `role="alert"`.
  - The list panel and the CSV panel are `h2` (card heading, 18px / 600) under the workspace `h1`. The table is named from the list heading, which is the active tab name. The bulk title stays an `h3` with the same text (`bulkUpdate — N rows`) and the shared `.panel h3` size (18px / 600).
  - The checkbox column header is visually hidden `t("select")` (EN “Select”, MY “ရွေးရန်”). Each row checkbox is named “Select” plus the row name. Select all stays inside its visible label. The doctors ID header uses `t("idLabel")` (EN “ID”, MY “အိုင်ဒီ”).
  - Low-stock item rows keep `.row-warn` and append `t("lowStock")` on the name. Stock quantities are not recalculated. Name ink on the blended warn-soft fill measured 14.52:1.
  - The bulk dialog has `aria-modal="true"`. Focus moves to the first field on open. Escape, Close, and the scrim close it. Tab wraps inside the dialog. Focus returns to the Bulk update button. If that button is disabled after a successful update, focus returns to the active tab, because a disabled button cannot take focus. A click that has already moved focus elsewhere is left alone.
  - The words the user must type stay UPDATE and IMPORT. The page still compares against those tokens. Placeholders stay those English tokens.
  - The tabpanel is the flex child of the page, so it keeps the page’s 1.25rem gap. Otherwise the search, alerts, and panels would sit flush.
  - The paste area was 0.85rem. That is under the 14px floor and the text can include prices, so `.master-page .input.textarea` is 14px. It stays monospace and five rows. It is not raised to the 17px input size.
  - 44px only under `.master-page` for page-action buttons (Export, Bulk update, Dry-run, and the dialog actions), the tabs, the search field, Refresh, and the bulk/import fields. Row checkboxes stay native. Global `.btn` is untouched. Revenue, Stock, Daily report, and `.print-preview-shell` were not edited.
- 2026-11-01 Dashboard Audit chat:
  - Scope is Audit only (`Audit.tsx`, scoped `.audit-page` CSS, three EN/MY strings). Overview / Revenue / Stock / Daily report / Master data / clinic not restyled. The query, the 150-row limit, and the load effect dependencies are unchanged. `q` is not a dependency, so typing does not search. Enter and Refresh still bump `epoch`. Changing the entity still reloads.
  - Search has a visible label `t("search")`. The placeholder stays and is not the name. Refresh stays `t("refresh")`. The entity select has a visible label `t("entity")`. The empty option stays `t("allEntities")`. Option values stay `item`, `service`, `doctor`, `user`, `bill`, `settings`, `backup`. Visible labels use the existing `item`, `service`, `doctor`, and `bill` keys. `user`, `settings`, and `backup` are new (EN User / Settings / Backup; MY အသုံးပြုသူ / ဆက်တင် / အရန်သိမ်း).
  - Load errors use `role="alert"`. Loading uses `aria-live="polite"` and still renders only when there are no rows yet. A refresh that already has rows does not add a loading line.
  - The list panel is an `h2` (card heading, 18px / 600) under the workspace `h1`. The heading text is `t("audit")`, the same string as that `h1`, so the table name matches the page. The table is named from that heading. The entity-id header uses `t("idLabel")`.
  - The detail control keeps the 80-character short text when collapsed and the full detail when expanded. `aria-expanded` reflects that. The visible text is the name. The `title` attribute stays the full detail and is not the name. `created_at`, `action`, and `entity` stay the API strings. The timestamp and the log text are not reformatted.
  - Shared `.code-chip` is accent `#2563eb` at 14px/600 on `--bg-soft` `#eeeee9`. That pair is 4.44:1 (fails 4.5:1). Accent on white is still 5.17:1. `.audit-page .code-chip` uses `--accent-pressed` `#1e40af`, measured 7.49:1 on the chip fill. The shared chip color stays accent so Stock’s chips are not restyled.
  - `.linkish` stays padding 0. Inside `.data-table` it inherits 16px / 1.45, which is 23.2px in both locales, under the 24px floor. Body line-height does not apply there (English body 25.5px, Myanmar body 26.35px). `.audit-page .linkish` is `line-height: 1.5` and `min-height: 24px`. The control measured 24px. It is not raised to 44px.
  - 44px only under `.audit-page` for the search field, the entity select, and Refresh. Those inputs also have `min-width: 12rem` so they do not collapse beside the labels. Labels are 14px / 600 and `nowrap`. There is no dialog, no tab set, and no print preview. Global `.btn` is untouched. Revenue, Stock, Daily report, Master data, and `.print-preview-shell` were not edited.
- 2026-11-01 Cross-portal audit:
  - Scope is the comparison. No portal TSX or CSS was edited. A shared token change was not required: darkening a border or `.code-chip` would restyle every desk that uses it, and those desks are already IMPLEMENTED.
  - Both apps load Roboto 400/600 and Noto Sans Myanmar 400/600 from Fontsource. One stack. Root stays 16px. Body is 17px / 400. English line-height is 1.5. Myanmar line-height is 1.55. Page titles on both login screens are 28px / 600 / 1.25. Accent is `#2563EB`. Focus ring is `0 0 0 3px rgba(37, 99, 235, 0.28)`. Danger is `#c62828`. Success is `#2e7d32`. Clinic `--checking` and dashboard `--warn` are `#8a6508`.
  - Clinic primary login fields and Sign in are 44px. Compact bill height stays 32px. Dashboard page toolbars stay scoped (rule counts above). Dashboard global `.btn` stays unpinned, so Sign in is 39.6px. The username field renders 46.6px from padding and is not pinned to 44px.
  - Clinic field borders use `--field-border` (3.05:1 on white). Clinic panel and table rules use `--border` (1.35:1) and `--border-strong` (1.62:1). Dashboard inputs and ghost buttons use `--border-strong` (1.32:1). Dashboard cards and the range toggle use `--border` (1.14:1).
  - Overview’s share bar is `aria-hidden`. The percentages beside it are the text. `.bar-ot` opacity 0.75 composites to 2.27:1 on the track. That bar is not the name of the share. It was not restyled.
  - `font-weight: 500` remains on `.bill-add-segment`, `.bill-history-col--name`, and `.bill-history-name-detail`. `font-synthesis: none`, so those paint at 400. `.opd-bill-new-badge` stays 800 (watermark). Uppercase remains on `.form-section-title`, `.grant-matrix th`, `.preview-label`, and `.bill-lines-head`. Cart FOC, grant-matrix, and drug-setup active checkboxes stay 16px. Those are clinic shared CSS. Changing them restyles implemented desks. They were left.

## Known issues

Owners are the portal that would have to change. None of these were fixed in the audit. Fixing any shared token restyles every desk that uses it.

- Clinic shell (`html`, `body`, `#root` `overflow: hidden`). 200% OS zoom is unverified and likely clips bill desks. Owner: clinic shell. Left in place: scrolling the window would change bill-desk layout.
- In-app zoom caps at 1.4 and compounds with OS zoom. Owner: clinic `uiScale.ts` and dashboard `uiScale.ts`.
- Print-preview Escape and Tab trap stop once focus is inside the receipt iframe. Owner: clinic `print.ts`, dashboard `print.ts` (Daily report), and the IPD daily statement preview. Receipt HTML stays out of scope.
- Cheat-sheet `srcdoc` names the stack but does not load Fontsource faces, so it falls back to Arial. Owner: clinic guidance (`cheatsheet.ts`).
- Compact clinic bill surfaces stay 32px (`--control-height-compact`), with a 24px floor, for toolbar, rail, dialog close, and committed cart rows. Bill entry-row controls (`.bill-line-entry`) are an accepted 44px exception so particular and qty match. Owner: clinic shared controls, every bill desk.
- Clinic `--border` `#d8dee6` is 1.35:1 on white. Clinic `--border-strong` `#c5ccd6` is 1.62:1 on white. Those are panel and table boundaries. Field inputs use `--field-border`, measured 3.05:1. Owner: clinic shared tokens. Left: darkening them restyles every desk.
- Dashboard `--border` `rgba(0, 0, 0, 0.06)` is 1.14:1 on the page background. Dashboard `--border-strong` `rgba(0, 0, 0, 0.12)` is 1.32:1 on white. Inputs and ghost buttons use `--border-strong`. Cards and `.range-toggle` use `--border`. Owner: dashboard `theme.css`, every dashboard page. Left: one token change restyles Overview, Revenue, Stock, Daily report, Master data, and Audit.
- Overview, Revenue, and Stock chart grid strokes stay `rgba(26, 31, 46, 0.08)`, measured 1.17:1 on white. Owner: those three pages. There is no grid token. Stock’s 60-day bar uses `--series-ipd`.
- Shared `.code-chip` text stays accent on `--bg-soft` (4.44:1 at 14px / 600). Audit overrides that chip to pressed ink (7.49:1). Owner of the shared color: dashboard Stock. Left: changing it restyles Stock.
- Dashboard Sign in is 39.6px with `min-height: auto`. The username field renders 46.6px from padding and is not pinned to 44px. Owner: dashboard shell (global `.btn` and `.field`). Page toolbars are already 44px under their own page class. Left: pinning global `.btn` would change every dashboard button.
- Dashboard `--checking` `#b8860b` is 3.25:1 on white and is the status dot only, paired with a text label. Owner: dashboard shell.
- Clinic `font-weight: 500` remains on the bill add segment and bill-history name lines. Synthesis is off, so they paint at 400. `.opd-bill-new-badge` stays 800. Owner: clinic shared CSS.
- Uppercase remains on clinic form section titles, grant-matrix headers, the bill-preview label, and bill-line headers. Bill-line headers also stay under 14px (font-chat exception). Owner: clinic shared CSS.
- Clinic cart FOC, grant-matrix, and drug-setup active checkboxes stay 16px, under the 24px floor. `.field` checkboxes are already 24px. Owner: clinic bill cart, Settings, and pharmacy catalog.
- No frontend test runner. `tsc` is not verification. No portal is VERIFIED.

## Outstanding risks

- Prior uncommitted `theme.css` and clinic work remain on `main`. This chat edited only the status file and did not revert them.
- Every clinic desk and every dashboard page in the status table is IMPLEMENTED, not VERIFIED. Signed-in desks were not opened in this audit.
- Raising compact bill controls to 44px would hide cart rows. The spec forbids that unless a future decision reverses the exception.
- Darkening clinic or dashboard borders, or the shared `.code-chip` color, would restyle implemented desks. That was not done.

## Product edit after IPD accessibility (2026-11-01)

Requested IPD daily-bill product work after the IPD desk was already IMPLEMENTED. No shared token change. Titles: Daily Bill / Final Bill. Daily overlay panel moved to the right; Close the Bill toggles to Reopen the bill (issued voucher delete). Stay rail and daily-bill actions use the billing press / wrap pattern. Sibling desks unchanged beyond shared `.opd-bill-rail-btn` already in use.

## Next stage

None. The portal sequence is complete. Residuals stay in Known issues with their owners. Do not open a new portal chat for them. Do not mark VERIFIED from `tsc` or a scan. No WCAG claim.

## Suggested sequence after that

None.
