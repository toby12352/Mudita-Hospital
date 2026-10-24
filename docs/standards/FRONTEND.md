# Frontend standards

Applies to `client/` (clinic) and `dashboard/` (Admin). Prefer matching the **nearest existing screen** over new frameworks.

## Clinic folder layout

```
client/src/
  main.tsx              # Vite entry (stays at src root)
  vite-env.d.ts
  assets/logo.png
    app/                  # Shell: boot, auth gates, fixed desk chrome, help
    App.tsx
    AppNavBar.tsx       # Radio bar + hover menus
    types.ts            # View, NavIntent, ConnState, tab unions
    LanguageSwitcher.tsx
    ServerIpButton.tsx
    ServerSetupForm.tsx
    LoginForm.tsx
    ChangePasswordForm.tsx
    HelpOverlay.tsx
  pages/
    home/HomePage.tsx   # How-to + video placeholder (not module tiles)
    opd/OpdPage.tsx
    ot/OtPage.tsx
    pharmacy/           # PharmacyPage, PharmacyBillingPage, tabs, forms
    settings/           # SettingsPage + hospital/doctors/services/users/backup/training
    reports/ReportsPage.tsx
  features/
    opd/api.ts
    ot/api.ts
    pharmacy/api.ts
    reports/api.ts
    settings/           # masterData.ts, backup.ts, demo.ts
  shared/
    api.ts
    auth.ts
    print.ts
    i18n.ts
    format.ts           # formatMMK
    Typeahead.tsx
    BillLineGrid.tsx  # shared blank-row cart for OPD, OT, and Pharmacy
                      # grows through 10 committed rows then sticks to the
                      # bottom when one row is appended; quantity edits still
                      # reveal that one row inside the cart pane
    FormSection.tsx
    cheatsheet.ts
    styles/App.css
```

Imports use the `@/` alias → `src/` (see `vite.config.ts` and `tsconfig.json`).

Dashboard already uses `pages/`, `components/`, `lib/` — keep that shape; do not invent a third layout.

## Hard rules

1. **Do not add new feature panels inside `app/App.tsx`.** Put screens under `pages/{domain}/`.
2. **No React Router** unless the team explicitly decides otherwise. Use view / page string unions (`app/types.ts`).
3. **No Redux, Zustand, or React Query by default.** Local state + domain API functions are enough.
4. **All new user-visible strings** go through i18n (EN + MY keys). Do not hardcode English in new UI.
5. **Storage key namespaces must not mix:**
   - Clinic: `mudita_*`
   - Dashboard: `mudita_dash_*`

## Domain API modules

- One module under `features/{domain}/` per business domain.
- Named exports for API calls and types colocated with them.
- Always go through `apiFetch` / `shared/api.ts` — never raw `fetch` with duplicated token logic.
- Mirror server JSON field names (`snake_case`, `*_mmk`).

Example:

```typescript
// client/src/features/opd/api.ts
export type OpdBill = { id: number; bill_no: string; /* … */ };
export async function createOpdBill(body: OpdBillWrite): Promise<OpdBill> { /* apiFetch */ }
```

## UI patterns

- Functional components only.
- Permission checks for nav menus/actions: `hasPermission(permissions, "opd")` (etc.). Server still enforces.
- Shared widgets (`Typeahead`, `FormSection`) live in `shared/`.
- Print via existing `openPrintPreview` / server HTML receipts — do not invent a second print path.

## Styling

- Extend existing CSS variables in `shared/styles/App.css` / dashboard `theme.css`.
- Prefer BEM-ish / kebab class names already used (e.g. `.print-preview-card--receipt`).
- Do not introduce Tailwind or a new CSS framework without an explicit team decision.
- Keep brand assets consistent (`assets/logo.png`, Noto Sans Myanmar for MY).
- Clinic desk actions and bill chrome follow **Clinic design system** below. Dashboard keeps its own theme — do not copy clinic action classes into `dashboard/`.

### Clinic design system

Scope: **`client/` only**. Reference screens: Drug Setup / OPD maintenance, OT cupboard, bill desks (OPD, OT, Pharmacy sales / return / transfer). Settings should match when touched.

**Action roles** (pick one look per control; do not invent a fourth):

| Role | Look | Typical use |
|------|------|-------------|
| Primary | Solid accent `#2563EB`, white text | One main commit per context: New, Pay & print while collecting, form Save/Create where that is the submit |
| Secondary / outline | Panel/white fill, light border, dark text | Search, Filter, History, Edit, Cancel, most rail tools |
| Danger outline | Red text + red border, not a solid red fill | V.Delete, Delete, Deactivate, Restore on lists/rails |
| Soft on | Soft blue fill (`--accent-soft`) | Toggle-open only (Filter / Restock / View) — not a second solid primary |

Solid `.btn.danger` (filled red) is reserved for rare confirm dialogs that already use it (e.g. delete-item confirm). Do not use filled red on list rows or the bill rail.

**Classes**

- List / maintenance / settings-style actions: `.btn.action` with optional `.primary`, `.danger`, `.on` in `shared/styles/App.css` (~12px radius, icon + label row).
- Form submits that are not “toolbar” actions may stay plain `.btn.primary` / `.btn.ghost` when matching an existing form footer.
- Bill desks: `.opd-bill-rail-btn` with `.opd-bill-rail-btn--accent` and `.opd-bill-rail-btn--danger`. Extend the shared rail — do not invent a second action column.
- Bill surface tokens on `.opd-bill-desk` / `.opd-bill-dialog`: `--radius-control: 6px`, `--border: #d5dce5`, `--placeholder: #94a3b8`, `--focus-ring` (blue border + soft ring). White panel/input backgrounds. Muted rail `kbd`.

**Icons**

- Leading 16px stroke icons via `shared/ActionIcon.tsx` (`currentColor`). Kinds today: `plus`, `search`, `filter`, `history`, `edit`, `trash`, `undo`, `check`, `print`, `transfer`.
- Use an icon when the metaphor is obvious before reading the label.
- Stay **text only** when an icon would crowd or confuse (e.g. Deactivate, Cancel, Restock/View on a crowded detail row).

**Do not**

- Full pills (`border-radius: 999px`), dark chrome, white primary fills, gradients, glass, heavy shadows.
- New icon packages or Tailwind.
- Change F-keys, rail order, or layout for style alone.
- Apply this system to `dashboard/`.

## i18n

- Custom dictionaries in `shared/i18n.ts` — not i18next.
- Keys: camelCase English identifiers (`tileOpdSub`, `reportDailyCash`).
- `t(key)` with EN fallback; `useI18n()` for locale.
- When adding a key, add **both** EN and MY entries in the same change.

## Boot / connectivity

Preserve the existing clinic/dashboard boot sequence:

1. Server IP setup if API base not configured
2. Health poll (~5s)
3. Login / must-change-password
4. Fixed desk chrome (brand bar + radio bar) or dashboard nav

Do not bypass health or auth for convenience in production paths.

## Clinic chrome / navigation

- Authenticated clinic desk: light Fluent-style chrome — radio bar (`.desk-radio-bar`) for portal sections on a white/neutral surface with accent for the active section, `#F8F9FB` work area, and a bottom status strip (`.desk-status-bar`) with F-key hints, date, and `Day (user)`. Language, help, logout, and Server IP sit on the right of the radio bar.
- Bill screens use the light action column (`.opd-bill-rail`) with Print F7 / Save draft F5 / History F9 / V.Delete ^F8 / Cancel F10 / New bill F2. Accent is class-driven (`.opd-bill-rail-btn--accent` on Pay & print while collecting, New when finished, Transfer when that is the primary step). V.Delete uses `.opd-bill-rail-btn--danger` (outline). List and Drug Setup screens omit the rail. See **Clinic design system** under Styling.
- Admin chooses a portal from `PortalPicker`; desk roles land in one portal. Still **no React Router** — `View` + optional `NavIntent` in `app/types.ts`, remount pages with a changing `key` when the same view opens with a different intent.
- Dashboard signed-in chrome is a left sidebar (logo and the six pages) and a workspace header (page title plus an account menu for name, role, language, server connection, and log out). No radio bar and no bottom status strip. Server setup, login, and change-password use the same canvas and a white card.
- UI zoom: `mudita_ui_scale` in `localStorage` via `shared/uiScale.ts`; Ctrl/Cmd `+` / `-` / `0` anywhere.

## File size guidance

- Prefer pages under ~400–600 lines; extract subcomponents in the same folder when larger.
