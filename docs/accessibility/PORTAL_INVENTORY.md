# Portal inventory

Audit date: 2026-11-01. This is the architecture record for the typography and accessibility rollout. Progress lives in [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md). Visual rules live in [UNIFIED_DESIGN_SYSTEM.md](./UNIFIED_DESIGN_SYSTEM.md).

## Repository

One monorepo. Two desktop frontends. One Go API. No npm workspaces. No shared UI package. Clinic and dashboard do not import each other's source. Duplicated `api.ts` / `auth.ts` is intentional so sessions do not collide (`mudita_*` vs `mudita_dash_*`).

```
Clinic (Tauri + React, Vite :1420)  ──┐
                                       ├── HTTP JSON ── Go API :8080 ── SQLite
Dashboard (Tauri + React, Vite :1421) ─┘
```

A shared design-system package is not practical. Class names overlap (`.btn`, `.field`, `.shell`) and the rules differ. Each app keeps its own stylesheet and applies the same documented tokens.

Server receipt HTML, `docs/*.html`, and field PDFs are not product UI. They stay out of portal chats so 80mm slips and install guides do not move.

## Applications

### Clinic

- Path: `client/`
- Role: one window. A portal account opens one desk. Admin and unified accounts use the shared sidebar.
- Stack: React 19 (`^19.1.0`, lockfile 19.3.0 at audit), Vite 8 (`^8.0.16`, lockfile 8.3.3), Tauri 2 (`^2`, lockfile 2.12.1), TypeScript `~6.0.3`.
- Extra UI deps: `@fontsource/noto-sans-myanmar` `^5.2.5` (weight 400 only), `driver.js` `^1.10.2`.
- Entry: `client/src/main.tsx`, shell `client/src/app/App.tsx`.
- Routing: `View` string union in `client/src/app/types.ts`. No React Router.
- State: local `useState` / `useEffect`. No Redux, Zustand, or React Query.
- Styles: `client/src/shared/styles/App.css` (about 6,178 lines, global) and `client/src/features/guidance/guide.css` (driver.js popover). No Tailwind, CSS modules, or styled-components.
- Fonts today: Segoe UI Variable first in English; `html[data-locale="my"]` promotes Noto Sans Myanmar. Weight 400 only. `font-synthesis: none`. No Roboto. No Google Fonts.
- i18n: `client/src/shared/i18n.ts` (EN + MY). `mudita_locale`.
- Zoom: `client/src/shared/uiScale.ts`. Ctrl/Cmd + / − / 0. Stored as `mudita_ui_scale`. Range 0.85–1.4. Compounds with OS zoom.
- Tests: no Vitest, Playwright, Cypress, or ESLint. Check is `npm run build` (`tsc && vite build`) in `client/`.
- Window: Tauri 960×640, maximized (`client/src-tauri/tauri.conf.json`).

### Admin dashboard

- Path: `dashboard/`
- Role: analytics and master-data bulk. Separate app. Login is Admin or the `dashboard` grant. That grant does not open clinic Settings.
- Stack: same React, Vite, Tauri, and TypeScript generation as the clinic. Extra dep: `recharts` `^3.10.1`.
- Entry: `dashboard/src/main.tsx`, shell `dashboard/src/App.tsx`.
- Routing: `PageId` in `dashboard/src/nav.ts`. No React Router.
- Styles: `dashboard/src/theme.css` (about 1,413 lines). No other CSS.
- Fonts today: `"Noto Sans Myanmar", "Segoe UI", "Noto Sans", sans-serif` for every locale. Weight 400 only. Line-height rises to 1.55 when `data-locale="my"`. The font stack does not change with locale.
- i18n: `dashboard/src/i18n.ts`. Key `mudita_dash_locale`.
- Zoom: `dashboard/src/uiScale.ts`. Ctrl/Cmd + / − / 0. Stored as `mudita_dash_ui_scale`. Range 0.85–1.4. Compounds with OS zoom.
- Tests: none. Check is `npm run build` in `dashboard/`.
- Window: 1200×800, maximized.

### API

- Path: `server/`
- Not a portal. Do not change handlers, SQL, or migrations for this rollout.
- Go tests exist under `server/internal/handlers/`. A visual chat does not need to change them.

## How styles are shared

They are not shared across apps. Inside the clinic they are shared completely: every desk imports the one `App.css`. A change to `:root`, `.btn`, `.field`, or `.opd-bill-*` restyles OPD, Lab, Pharmacy, OT, IPD, expenses, patients, reports, and settings together.

Lab bills reuse the OPD bill-desk classes. There is no second bill stylesheet.

## Clinic modules

Navigation is a `View`, not a URL. Implementation status for each row starts at NOT STARTED. See the status doc before editing.

- Shell and auth. `client/src/app/`: `App.tsx`, `AppNavBar.tsx`, `LoginForm.tsx`, `ChangePasswordForm.tsx`, `ServerSetupForm.tsx`, `AuthFrame.tsx`, `ServerIpButton.tsx`, `LanguageSwitcher.tsx`, `HelpOverlay.tsx`, `DeskStatusBar.tsx`. Collapsible sidebar. Collapsed labels are in the DOM and appear on hover or `:focus-visible`. No skip link. `html`, `body`, and `#root` are `height: 100%` and `overflow: hidden`.
- Home. `client/src/pages/home/HomePage.tsx`.
- About. `client/src/pages/about/AboutPage.tsx`.
- OPD. `client/src/pages/opd/`: billing (`OpdPage.tsx`, `OpdBillForm.tsx`), doctors, services, bill list dialog. Reference bill desk. Classes `.opd-bill-desk` and `.opd-bill-rail-btn` live in `App.css`.
- Lab. `client/src/pages/lab/`. Same bill-desk classes as OPD. Not a separate login role; opened with lab grants.
- Pharmacy. `client/src/pages/pharmacy/`: items, billing, return, transfer, purchase, movements. Largest screens include `PharmacyItemsTab` and `PharmacyPurchasePage`.
- OT. `client/src/pages/ot/`: billing, stock, services, history modal. `OtPage.tsx` is very large.
- Patients. `client/src/pages/patients/PatientsPage.tsx`. Charts and visit history.
- IPD. `client/src/pages/ipd/`: stays, ledger, charge bills, daily statement preview.
- Expenses. `client/src/pages/expenses/`. Opened from pharmacy, OPD, OT, and IPD views. Not its own role.
- Reports. `client/src/pages/reports/ReportsPage.tsx`.
- Settings. `client/src/pages/settings/`: hospital, doctors, categories, users, backup. `SettingsPage.tsx` is a thin shell over those tabs.

`View` values include `home`, `about`, `settings`, `pharmacy`, `pharmacy_billing`, `pharmacy_return`, `pharmacy_purchase`, `pharmacy_transfer`, `opd`, `lab`, `ot`, `patients`, `ipd`, `ipd_bill`, `expense`, `reports`.

## Dashboard pages

All under `dashboard/src/pages/`. Switched from `App.tsx`.

- Overview. `Overview.tsx`. KPIs, alert chips, share bar, 30-day chart. Series colors are hardcoded hex in the component and in CSS (`.bar-ot`, `.bar-pharmacy`), not tokens.
- Revenue. `Revenue.tsx`. Range, charts, doctor/service/margin tables. Local `KpiMini` duplicates `KpiCard`.
- Stock. `Stock.tsx`.
- Daily report. `DailyReport.tsx`. Date field, print menu, tables. Native `input[type=date]` plus the shared date picker used on Revenue.
- Master data. `MasterData.tsx`. Tabs, search, CSV, bulk modal. The bulk dialog has no `aria-modal`, no Escape handler, and no focus return.
- Audit. `Audit.tsx`.
- `StubPage.tsx` is unused.

Layout: `dashboard/src/components/layout/` (`Sidebar.tsx`, `WorkspaceHeader.tsx`, `AccountMenu.tsx`, `ServerBadge.tsx`). KPI: `components/kpi/KpiCard.tsx`, `AlertChip.tsx`.

## Shared clinic widgets

There is no `client/src/components/` folder. Reusable UI is under `client/src/shared/` and `client/src/app/`.

- Buttons are class names on `<button>`, not a React button component. Roles: `.btn`, `.btn.primary`, `.btn.ghost`, `.btn.danger`, `.btn.action`, `.opd-bill-rail-btn`.
- Icons: `ActionIcon.tsx` (16px stroke, `aria-hidden`), `BillBtnIcon.tsx`, `DialogCloseButton.tsx` (`aria-label` from `t("close")`).
- Fields: `.field` CSS, `FieldError.tsx` (`role="alert"`), `FormSection.tsx`, `Typeahead.tsx`, `DatePicker.tsx`, `BillDateField.tsx`, `CatalogListFilter.tsx`, `ServiceCategoryField.tsx`, `ActiveFilter.tsx`, `numberInputWheel.ts`.
- Tables and carts: `BillLineGrid.tsx`, `BillHistoryTable.tsx`, `BillHistoryToolbar.tsx`, `BillTotals.tsx`. Catalog tables are page markup plus CSS (`.drug-setup-table-row`, `.classic-list-panel`).
- Dialogs: `AlertDialog.tsx` (`role="dialog"`, `aria-modal`). Print preview is built in the DOM by `shared/print.ts`, not React. Domain list dialogs live next to their pages.
- Overlay recipe: `.clinic-overlay` and `.clinic-overlay-panel`. No `backdrop-filter`. Z-index ladder is documented in `docs/standards/FRONTEND.md`.

## Tokens that exist today

Clinic `:root` in `App.css` already has color, radius, overlay, focus, and motion tokens. Examples: `--accent` `#2563EB`, `--ink` `#1f2937`, `--muted` `#667085`, `--placeholder` `#64748b`, `--border` `#d8dee6`, `--danger` `#c62828`, `--checking` `#b8860b`, `--radius-control` `5px` (`6px` on bill desks), `--radius-dialog` `10px`, `--focus-ring` `0 0 0 3px rgba(37, 99, 235, 0.18)`. There is no `--font-*` scale and no `--space-*` scale. Sizes are raw `rem` and `px`. `font-weight: 650` is used. Root `font-size` is 16px. Body line-height is 1.45, and 1.55 in Myanmar.

Bill cart: `--bill-line-row-height: 2.35rem`, `--bill-cart-font: 0.875rem`. The cart body is locked at six row-heights (empty or full), stacks lines from the top, and scrolls within that pane; a short window may scroll `.opd-bill-desk-main` so totals stay reachable.

Dashboard `:root` in `theme.css`: `--accent` `#1b6bc7`, `--bg` `#f6f6f4`, `--ink` `#1c1c1c`, `--muted` `#6d6d68`, `--border` `rgba(0, 0, 0, 0.06)`, `--card-radius` `16px`, `--warn` `#c47a00`. No `--focus-ring`. Buttons and nav items have no `:focus-visible` recipe. Inputs use `:focus { outline: 2px solid var(--accent) }`. No `prefers-reduced-motion` block. Status dots pulse.

## Accessibility already present

Clinic (approximate, `client/src`): on the order of 250 `aria-*` attributes and 100 `role` attributes. Dialogs, the close button, cart delete, field errors, and the language switcher are named. `:focus-visible` exists (about 23 rules) and so does a second `:focus` recipe (about 35 rules). `prefers-reduced-motion` covers sidebar and billing transitions. It does not cover the status-dot pulse or alert badge motion.

Known gaps, for later chats:

- Placeholder and status gold need a measured contrast check. Do not assume they pass.
- `.row-warn` communicates low stock or expiry by color on the title.
- Dashboard warn KPI numbers and chart series are color-primary.
- Date picker chrome is English literals in both apps (`"Open calendar"`, weekday names).
- Dashboard bulk modal, master-data tabs, and form errors are weaker than the clinic dialogs.
- Cheat-sheet HTML in `client/src/shared/cheatsheet.ts` sets `font-family: "Noto Sans Myanmar"` inside `srcdoc` without `@font-face`, so the iframe will not see the Fontsource files.
- `client/public/fonts/noto-sans-myanmar-400.woff2` is not referenced by HTML, CSS, or TS. Remove it only in the font chat, after a fresh search.

## Dependencies a portal chat may add

`@fontsource/roboto` (weights 400 and 600 only) and the matching Noto Sans Myanmar 600 file, installed separately in `client/` and `dashboard/`. Nothing else. No Tailwind, no component kit, no Google Fonts, no new test runner in the foundation.

## Risks

- One clinic stylesheet. Per-desk chats still leak through shared classes. Record sibling desks in the status doc when that happens.
- Non-scrolling shell plus in-app zoom capped at 1.4. 200% OS zoom can clip the bill desk. That is a later shell task, not a token tweak.
- Raising every control to 44px would shrink the six-row cart. Compact bill rows stay compact. See the design spec.
- Myanmar weight 600 is not loaded, and synthesis is off, so semibold labels look regular in Myanmar.
- `App.css` and `theme.css` already have uncommitted work on `main` as of this audit. Later chats must edit on top of that work and must not revert it.
- Print receipts are server HTML. Clinic tokens do not apply to them. Leave receipts alone unless a chat is explicitly about receipt type.
- No automated UI tests. Do not claim a screen was verified because `tsc` passed.
