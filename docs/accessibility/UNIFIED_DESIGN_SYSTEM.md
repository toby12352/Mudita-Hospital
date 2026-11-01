# Unified design system

Single source of truth for typography, contrast, and control consistency across the clinic (`client/`) and the admin dashboard (`dashboard/`).

Read [PORTAL_INVENTORY.md](./PORTAL_INVENTORY.md) for where each app lives, and [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for what is already done. Action roles, overlay class names, bill-rail class names, and F-keys stay in [docs/standards/FRONTEND.md](../standards/FRONTEND.md).

Where this document and FRONTEND.md disagree on type size, contrast, font stack, or target size, this document wins. Do not invent a second styling system. Do not add Tailwind, a component library, or a shared UI package. Put tokens in the app that is in scope: `client/src/shared/styles/App.css` or `dashboard/src/theme.css`.

This rollout does not change database schemas, API contracts, billing math, medication math, stock quantities, permissions, authentication, or routing.

## Typography

Root `font-size` stays **16px**. Do not set `html { font-size: 17px }` or any other root size. Thousands of layout sizes are in `rem`. Growing the root rescales the bill grid, the sidebar, and the non-scrolling shell.

Apply the sizes below on the text roles. Prefer `px` for these roles so they do not follow a future root change.

| Role | Size | Weight | Line height | Notes |
|------|-----:|-------:|------------:|-------|
| Page title | 28px | 600 | 1.25 | Was specified as 26–30px |
| Section heading | 22px | 600 | 1.3 | 21–24px |
| Card heading | 18px | 600 | 1.35 | 18–20px |
| Body | 17px | 400 | 1.5 | 17–18px. Myanmar locale 1.55 |
| Input text | 17px | 400 | 1.4 | Same size as body |
| Button text | 16px | 600 | 1.25 | 16–17px. Compact bill rows may stay smaller; see exceptions |
| Table content | 16px | 400 | 1.45 | |
| Secondary | 14px | 400 | 1.45 | Floor for supporting text |
| Important totals | 22px | 600 | 1.3 | 20–24px. Use tabular numerals |

Weights in use are **400 and 600 only**. When a rule says `font-weight: 650`, `550`, or `700`, set it to 600 in the chat that touches that rule. Do not load a face for those values.

Other type rules:

- Line height for body text stays in the 1.4–1.6 range. Myanmar (`html[data-locale="my"]`) uses 1.55 because stacked marks need it.
- Do not set long labels in uppercase. Existing dashboard KPI labels that are uppercase become sentence case in the dashboard type chat.
- Do not put a clinical or money meaning in type smaller than 14px.
- Money, quantities, and numeric table columns use `font-variant-numeric: tabular-nums`.
- `kbd` shortcut hints stay **11px** and weight 600. The visible button label carries the meaning. Do not enlarge `kbd` to body size on the bill rail.
- Headings stay in document order. Do not skip a level to get a size.

## Fonts

Stack, both apps, both locales:

```css
font-family: "Roboto", "Noto Sans Myanmar", Arial, sans-serif;
```

Roboto draws Latin. Noto Sans Myanmar draws Myanmar. The browser falls through per character. One stack is enough. Do not keep the clinic rule that swaps the whole family when the locale is Myanmar. That swap makes Noto draw English as well, and Noto is loaded with a Latin unicode range. Locale may still change line height.

Load locally with `@fontsource`. The hospital runs on a LAN without relying on the public internet. Do not add a Google Fonts `<link>`, a `@import` of a remote CSS file, or any other network font URL.

Files to import, and no others:

- `@fontsource/roboto/400.css`
- `@fontsource/roboto/600.css`
- `@fontsource/noto-sans-myanmar/400.css`
- `@fontsource/noto-sans-myanmar/600.css`

`font-display: swap` (Fontsource default). Keep `font-synthesis: none`, which is why 600 must be a real file for both families. No italics. No weights 100, 300, 500, 700, or 900.

Install the packages in the app being updated. Clinic and dashboard have separate `node_modules`.

After fonts load, check on a real screen:

- English UI chrome
- Myanmar UI chrome
- Digits and `MMK` amounts
- A string that mixes Myanmar and English
- Weight 600 in both languages

`client/src/features/guidance/guide.css` and the cheat-sheet `srcdoc` in `client/src/shared/cheatsheet.ts` must use the same family names. An `srcdoc` iframe does not inherit `@font-face` from the parent. The font chat records what the cheat sheet actually falls back to. Do not inline font files into that HTML unless a later chat is scoped to it.

`client/public/fonts/noto-sans-myanmar-400.woff2` is unused. Delete it only in the font chat, after a search shows no references.

Server receipt HTML is out of scope. Thermal and A4 slips keep their current faces until a receipt-specific chat.

## Color and contrast

Target WCAG 2.2 Level AA.

- Normal text: 4.5:1 against the adjacent background.
- Large text (18px and weight 600 or more, or 24px and up): 3:1.
- Borders, icons, and other meaningful non-text: 3:1 against the adjacent color.
- Placeholder text is content. It needs 4.5:1. It must not replace the label.

Canonical accent is the clinic blue already in FRONTEND.md:

- `--accent`: `#2563EB`
- `--accent-hover`: `#1d4ed8`
- `--accent-pressed`: `#1e40af`
- `--accent-ink`: `#ffffff`
- Text and white-on-accent pairs that fail 4.5:1 get a darker ink or a darker fill in the chat that owns that surface. Do not invent a second brand blue.

Dashboard `--accent` `#1b6bc7` moves to `#2563EB` in the dashboard token chat. Chart series that are hardcoded in `Overview.tsx` and `theme.css` move to tokens in that same chat, or the status doc explains why a series color stayed.

Preserve meaning:

- Danger stays the existing red family (`#c62828` and its border).
- Success stays the existing green (`#2e7d32`).
- Do not encode Paid, Pending, Overdue, Approved, Rejected, Completed, or Cancelled by color alone. Pair the color with a text label. Add an icon only when the icon set already has a clear metaphor.

Suspected failures, not yet measured with a contrast tool. The chat that touches the surface measures before and after:

- Clinic `--checking` is now `#8a6508` (was `#b8860b`; ~3.3:1 on white failed for `.low-stock` text). Dashboard `--warn` `#c47a00` on white, for text under 18px, still open.
- Dashboard `--border` `rgba(0, 0, 0, 0.06)` as an input or button boundary.
- Muted secondary text on a panel that is not pure white.

Clinic `--placeholder` `#64748b` and `--muted` `#667085` are close to the 4.5:1 line. Measure them. Do not lighten them.

Disabled buttons stay at opacity 0.5, matching the clinic rule. Disabled fields stay at opacity 1, with muted text and fill `#f8fafc`. Do not gray out a field by fading the whole control.

## Spacing, radius, and elevation

No spacing scale exists yet. When a chat adds tokens, use this scale and do not invent intermediate steps: 4, 8, 12, 16, 24, 32px. Map them to variables in the app stylesheet. Do not rewrite every padding in the same chat that introduces the variables.

Radius, clinic, unchanged:

- `--radius-control`: 5px. Bill desks set 6px. Do not collapse those into one value.
- `.btn.action` standing alone in a toolbar group: 12px, as FRONTEND.md already says. In a row with a field, radius matches `--radius-control`.
- `--radius-dialog`: 10px.
- Dashboard cards may keep 16px until the dashboard token chat. Record the choice there. Do not copy 16px cards into the clinic.

Shadows stay the single clinic `--overlay-shadow` on overlays. No glass, no `backdrop-filter`, no extra glow.

## Controls

Primary form fields and the primary commit button on a form: **min-height 44px**. Input text 17px. Button text 16px and weight 600. Labels are visible elements, not placeholders. A label stays on one line in both English and Myanmar. The label column sizes to the text. Do not clip either locale.

Icon-only buttons outside a dense grid: **44×44px**, with an accessible name.

### Exceptions (dense clinical surfaces)

These stay compact. WCAG 2.2 AA target size (2.5.8) is 24×24 CSS pixels. 44px is the AAA / touch size (2.5.5). Forcing 44px here clips a desk that does not scroll.

- Bill-desk toolbar search, filter, and the action button in that same row. Today about 32px tall. Keep them on one shared height and one shared radius. Floor 24px.
- Bill cart row (`--bill-line-row-height: 2.35rem`) and its typeahead, quantity, unit, and delete control. They share one height. Floor 24px.
- Dialog close (`DialogCloseButton`, today 32px). Floor 24px.
- Bill-rail buttons (`.opd-bill-rail-btn`). They may stay denser than 44px. They still share one height and one radius with each other. Mark Paid may stay taller when it has the second line, as FRONTEND.md already allows.
- Table row actions that sit in a compact list: at least 24px, aim for 40px when the row has the room.

Adjacent actions keep a visible gap. Do not remove padding to make a 44px control fit.

Focus, one recipe, both apps:

- Keyboard focus uses `:focus-visible`.
- Indicator: accent border plus `--focus-ring: 0 0 0 3px rgba(37, 99, 235, 0.28)` (darkened in the clinic shared-controls chat from `0.18` so borderless targets stay visible).
- The indicator must be visible against the control’s background. If a measurement shows the ring is too faint, darken the ring in the controls chat and record the value here.
- Do not leave a second recipe of `outline: 2px solid` with an offset.
- Do not remove focus styles to satisfy a mouse-click outline.

Hover and pressed colors stay `--accent-hover` and `--accent-pressed` for primary actions. Transitions stay short (the clinic motion tokens, about 120–200ms). Honor `prefers-reduced-motion: reduce`: no pulse, no press scale, no non-essential transition. Status-dot pulse is included. Motion must not delay a bill, a dose, or a payment.

## Tables

- Body text 16px, weight 400.
- Header text is at least as large as the body, weight 600, and is not color alone.
- Money and quantity columns: `tabular-nums`, lined up on the decimal. Do not change the formatted value or the calculation.
- Row hover may tint the background. Selection and warning states also use text (for example a status word), not only a red title.
- Wide tables scroll inside `.table-scroll` or the existing cart body. The page behind them must still reach the actions.

## Icons

- Clinic: `ActionIcon` at 16px, `currentColor`, decorative icons `aria-hidden`.
- Icon-only controls need `aria-label` from `t(...)`.
- Do not add an icon package.
- Dashboard inline SVGs stay `aria-hidden` when a text label is beside them.

## Overlays

Clinic continues to use `.clinic-overlay` and `.clinic-overlay-panel` (scrim, opaque panel, one shadow, no blur). Keep the z-index ladder in FRONTEND.md.

Every dialog that blocks the desk:

- `role="dialog"` and `aria-modal="true"` when it is modal.
- Focus moves inside on open and returns to the opener on close.
- Escape closes it when the existing dialog is dismissible. Do not make a destructive confirm dismiss on scrim click if it does not today.
- Title is text, not color.

The dashboard bulk modal and the imperative print overlays in `print.ts` are brought up to that behavior in their own chats. Do not rewrite both apps in one pass.

## Keyboard and screen readers

- Tab and Shift+Tab reach every control that a pointer can operate, in visual order.
- Enter and Space activate buttons.
- Escape closes dismissible dialogs and menus.
- Names come from visible labels, `aria-label`, or `aria-labelledby`. Placeholder is not the name.
- Errors use `role="alert"` or `aria-describedby`, matching clinic `FieldError`.
- Live status (connection, save, busy) uses an existing polite live region when one is already on that widget. Do not announce every keystroke.
- Collapsed sidebar: the control has an accessible name even when the label is visually hidden.

## Zoom and layout

- Support OS or browser zoom to 200% without losing a control. The current shell sets `overflow: hidden` on `html`, `body`, and `#root`, and in-app zoom stops at 1.4. Fixing clip is a shell task. Do not “fix” it by lowering font sizes.
- In-app zoom (`mudita_ui_scale`) stays. Do not add a second text-size control on the Settings page unless a chat is explicitly asked to.
- The product is a maximized desktop window. Do not build a phone layout. Existing breakpoints (clinic 40rem / 720px / 480px, dashboard 1280px / 800px) may stack panels that already stack. Do not restack the bill grid to chase a phone width.
- Avoid new fixed heights that clip enlarged text. Existing cart `max-height` of six rows may stay, because that region scrolls.

## What a portal chat does not change

- The operation a button performs.
- Validation rules, totals, stock movements, and payment type.
- Which role can see a nav item. Hiding is still UX. The server still enforces.
- F-key bindings and bill-rail order.
- Print paper size (80mm vs A4) and the server HTML for receipts.
- Storage key prefixes.

If an accessibility fix seems to require a behavior change, stop and write the conflict in the status doc. Do not ship the behavior change in the same edit.

## Deviations

Any departure from this file (a size, a weight, a color, a compact control that went to 44px, or the reverse) is recorded in [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) with the reason. Do not leave the departure only in a chat.
