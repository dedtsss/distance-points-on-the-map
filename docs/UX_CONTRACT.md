# Dark Cat CRM — UX Contract

This document is a normative implementation contract for the accepted **Command Desk** product UX. Future UI work must preserve these rules unless a later issue explicitly replaces them.

## Global information architecture

The global shell has exactly eight peer sections: **Дашборд, Сессии, Обработка фото, Резерв, Карта, Результаты, Журнал, Настройки**. Processing stages are never global navigation items. Desktop keeps the persistent left sidebar; mobile uses the shell drawer/menu and must not squeeze the desktop sidebar into the viewport.

Dashboard is an overview and drill-down surface, not a working editor. Metrics or warnings may navigate to the exact section, processing step, photo, or problem, but editing belongs to the destination screen.

## Processing workflow

`Обработка фото` is one session-scoped workflow with five ordered steps:

1. **Фотографии** — select files/folder and confirm accepted input.
2. **Распознавание** — obtain and verify index + coordinates.
3. **Карта и точки** — inspect geometry/conflicts and manage ACTIVE/RESERVE.
4. **Очистка и загрузка** — prepare ACTIVE photos and obtain links.
5. **Результат** — format, copy/export and save the session result.

One step has one semantic job. The working surface must not accumulate controls/results from future or unrelated stages.

### Step 1 — Фотографии
Allowed: file selection, folder selection, accepted count, stable-buffer/basic input failures, compact import summary. Primary action: `Далее: распознавание`.
Forbidden: OCR/index details, coordinates, map/conflicts, cleanup/upload providers, color/packing/result blocks.

### Step 2 — Распознавание
Allowed: progress, `N/N распознано`, attention count, issue-first compact rows (preview/index/coordinates/status), intentional photo dossier. The dossier may edit manual index/coordinates, swap lat/lon and show EXIF/OCR source; rerun OCR only when an existing supported mechanism is reused. Primary action: `Далее: карта и точки`.
Forbidden: map conflicts, reserve decisions, cleanup/upload providers, final result blocks.

### Step 3 — Карта и точки
Allowed: map, threshold/conflict geometry, filters `Все | Проблемные | ACTIVE | RESERVE`, recommendation as advice only, point inspector, ACTIVE/RESERVE action, conflict distances, GPX/KML/GeoJSON. Primary action: `Далее: очистка и загрузка`.
Moving a point to RESERVE happens here and recalculates conflicts immediately. The recommendation is never applied automatically. If the operator is viewing a problem set, a just-resolved point remains visible until an explicit refresh/reapply-filter so the action result is understandable.
Forbidden: OCR editor as the main surface, upload provider controls, final result formatting.

### Step 4 — Очистка и загрузка
Allowed: ACTIVE count, cleanup/upload progress, success/error counts, errors first, provider/fallback detail only where operationally needed, retry/run actions. Primary action: `Далее: результат`.
Forbidden: OCR editor, map/conflicts, color/packing, final result blocks.

### Step 5 — Результат
Allowed: ready links count, session color, packing, common/permanent text, generated blocks, copy, TXT/export, save session. Existing Result/TXT output format is the compatibility contract. Primary action: `Сохранить сессию`.
Forbidden: pipeline internals unless exposed as a contextual error/detail.

## Photo dossier

A full photo dossier is never a permanent giant card stream. It opens deliberately from a photo row, dashboard drill-down, problem list, map inspector, or Sessions/History. Desktop uses a right-side drawer/inspector; mobile uses a fullscreen sheet/page. It may contain large preview, original/internal filename, index, coordinates/source, ACTIVE/RESERVE, conflicts, cleanup/provider/URL/errors and technical details. The entry context determines visual emphasis; do not give every field equal weight.

## Workflow state and prerequisites

The UI state is presentation state layered over existing session/domain data; it must not duplicate business truth.

- `selected`: one or more stable input photos exist.
- `recognition ready/error`: recognition has finished for the current batch; attention/errors do not reset selection.
- `map resolved/unresolved`: recognition data is sufficient to inspect map; conflicts may remain unresolved until the operator accepts them or intentionally continues according to existing domain rules.
- `cleanup ready/error`: cleanup has been attempted for ACTIVE photos.
- `upload ready/error`: upload has been attempted and links/errors are visible.
- `result ready/saved`: result has usable links/formatting and session persistence records save state.

`Далее` is enabled only when the current step prerequisite is valid. Completed steps remain manually reopenable. Successful recognition must never send the user back to photo selection merely because a later step has not run.

### Stale/dirty invalidation

Editing an earlier fact preserves that edit and the completed earlier work but marks dependent downstream presentation state stale:

- file batch change invalidates recognition, map, upload and result;
- index/coordinate correction invalidates map-dependent and later result status; cleanup bytes may remain reusable only if the existing privacy/business implementation says they are unaffected;
- ACTIVE/RESERVE or threshold change invalidates conflict-dependent upload/result summaries;
- cleanup/upload retry invalidates only result readiness derived from links.

Stale means “needs recomputation/reconfirmation”; it must not silently erase successful upstream data.

## ACTIVE / RESERVE

ACTIVE is the normal working set. RESERVE is an explicit reversible status. Recommendations are advisory. The map is the primary place for resolving close-point conflicts and moving a point to RESERVE. Existing conflict/reserve algorithms remain the source of truth.

## Drill-down

Dashboard and lists may navigate to `processingStep`, `photoId`, or problem context. Opening a drill-down must preserve the current session and current successful pipeline data; it must not manufacture a separate copy of the session.

## Desktop and mobile composition

Desktop: persistent global sidebar, compact five-step rail/header inside Processing, one working canvas, optional right dossier/inspector. Mobile: global sidebar becomes drawer; five-step navigation becomes horizontally safe compact controls/scroll-free wrapping; dossier/point inspector becomes fullscreen/bottom sheet. At 360×800, 390×844 and 412×915 there must be no page-level horizontal overflow and primary actions remain reachable.

## Business-logic boundary

UI work must preserve: Android/GrapheneOS folder-picker strategy, stable file buffering, metadata-first GPS/OCR, manual index/coordinate correction, coordinate normalization, distance threshold/conflict calculation, reserve recommendation, ACTIVE/RESERVE semantics, cleanup/privacy boundary, upload provider fallback/proxy, local+D1 persistence/migration, session numbering/history, map model/layers, GPX/KML/GeoJSON export, Result/TXT formatting, owner/guest auth. Do not rewrite these mechanisms for visual convenience.
