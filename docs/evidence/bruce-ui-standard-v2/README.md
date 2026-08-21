# Stage C browser evidence

These screenshots are fresh, real browser renders captured from the local Vite app at the listed CSS viewport sizes. They use an evidence-only deterministic browser `localStorage` session (session 42, one seeded photo); no production/runtime data or backend fixture was changed.

| Surface | Viewport | File |
| --- | ---: | --- |
| Dashboard | 1440x900 | `dashboard-1440x900.png` |
| Processing / Recognition | 1440x900 | `processing-recognition-1440x900.png` |
| Map | 1440x900 | `map-1440x900.png` |
| Processing | 1024x768 | `processing-1024x768.png` |
| Dashboard | 390x844 | `dashboard-390x844.png` |
| Processing / Recognition | 390x844 | `processing-recognition-390x844.png` |
| Map | 390x844 | `map-390x844.png` |

Browser checks also covered 390, 768, 1024, and 1440 CSS widths. `document.documentElement.scrollWidth` matched the viewport at each width; no page-level horizontal overflow was observed. At mobile, the menu was opened and verified as a modal dialog with initial focus on Close, trapped Tab navigation, inert/hidden background, Escape close, and focus return to the opener.
