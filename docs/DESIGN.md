# Dark Cat CRM — Command Desk Design Standard

This file is normative for implementation. It describes the accepted Command Desk visual system, not a mood board.

## Palette and surfaces

Use the existing dark graphite/navy tokens as the base. Recommended semantic mapping:

- app background: `#090d14` / near-black navy;
- sidebar: darker than content, approximately `#0d121c`;
- working surface: `#111722`;
- raised/control surface: `#171d2a` → `#202637`;
- outline: `#384154`, stronger outline only for focus/selection;
- primary blue: existing `--color-primary` (`#70b7ff`) and its dark container;
- success green, warning amber and error red only for functional state;
- primary text near-white, secondary text cool gray with WCAG-readable contrast.

Purple is not a decorative accent. No decorative gradients, glassmorphism, glow, AI-orb, neon/sci-fi/cyberpunk effects. Functional map tiles are outside this prohibition; application chrome stays flat.

## Typography

System UI stack. Working hierarchy:

- page title: 24–28px, 650–700;
- section title: 18–20px, 650;
- row/inspector title: 14–16px, 600;
- body/control: 14px desktop, never below 13px for essential information;
- meta/eyebrow: 11–12px with restrained letter spacing.

Use weight, spacing and color before adding boxes.

## Density and spacing

Use a 4px base rhythm. Typical gaps: 8 / 12 / 16 / 20 / 24px. Command Desk is compact/moderate density, not dashboard-card sprawl. Prefer one bordered surface containing a table/list over a separate card per datum.

Control heights: 36–40px compact desktop; touch targets minimum 44px on mobile. Primary action is visually unique per current step. Secondary actions are neutral/outlined. Danger actions use error color only when destructive.

## Shape and elevation

Radii: 6–10px for controls/panels; 12px is the upper normal surface radius. Avoid pill-shaped containers except status chips/tags. Shadows are rare and reserved for floating drawers/modals; ordinary panels use surface contrast + border.

## Sidebar and content

Desktop sidebar is the darkest stable surface and contains only the eight global sections. Step navigation lives inside Processing content. Content uses a clear header → step rail → one working surface → primary action progression. Do not redesign Dashboard while implementing a deep screen.

## Tables and lists

Operational datasets use compact table/list rows: thumbnail where useful, primary identifier, key values, status, one row action. Issues/attention rows sort first by default. Selected row uses blue outline/background; errors use red semantically, not as decoration. On narrow mobile widths the table may become stacked rows, never a horizontally overflowing desktop table.

## Status chips

Chips are small semantic labels: success green, warning amber, error red, neutral graphite, information blue. ACTIVE is success; RESERVE is warning/neutral distinct; conflict is error. Never color every row when a chip/indicator communicates the state.

## Drawers and sheets

Photo dossier and contextual inspectors are secondary surfaces. Desktop: right drawer/side panel, typically 360–440px, with clear close control and scroll inside the drawer. Mobile: fullscreen sheet/page or bottom sheet for point inspector. They must not create page-level horizontal overflow.

## Actions

Each workflow step has one primary forward action:
`Далее: распознавание` → `Далее: карта и точки` → `Далее: очистка и загрузка` → `Далее: результат` → `Сохранить сессию`.
Use secondary buttons for retry, refresh, filters, exports, open dossier. A disabled primary action must have nearby prerequisite/status text when the reason is not obvious.

## Loading / empty / warning / error / success

- Loading: show current stage/progress without replacing already useful completed data.
- Empty: explain the one action that creates content.
- Warning: actionable, amber, names what needs attention.
- Error: red semantic state, exact item/action, retry where possible.
- Success: concise confirmation and next action; do not flood the page with green cards.
- Stale/dirty: information/warning treatment saying downstream data needs recomputation; do not silently reset.

## Mobile rules

At 360×800, 390×844 and 412×915:

- global navigation is the existing drawer/menu;
- step rail wraps/condenses without horizontal page overflow;
- primary action spans available width when helpful;
- rows stack into compact records;
- dossier is fullscreen and point inspector is a bottom/full sheet;
- map remains usable with controls clear of browser safe edges;
- no fixed desktop widths that exceed viewport.

## Do

- data first, controls close to their data;
- one semantic action per step;
- reuse Ant Design/existing components where they reduce code;
- make selection, focus, loading and errors obvious;
- prefer list/table + contextual detail over permanent detail cards;
- maintain keyboard focus and meaningful labels.

## Don't

- no card soup;
- no weak low-contrast gray-on-gray essential text;
- no decorative gradients/glassmorphism/glow;
- no purple as the main accent;
- no giant PhotoCard stream beneath a new stepper;
- no mixing OCR, map, upload and result controls on one working surface;
- no desktop sidebar squeezed into mobile;
- no hidden horizontal overflow as a layout strategy.
