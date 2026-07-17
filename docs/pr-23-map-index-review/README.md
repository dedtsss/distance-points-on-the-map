# PR 23 map and index OCR review

Baseline screenshots before this fix are the approved Material 3 redesign artifacts in `docs/pr-22-visual-review/`:

- `../pr-22-visual-review/map-desktop.png`
- `../pr-22-visual-review/map-mobile-390.png`

After screenshots in this folder use a synthetic restored session with three points:

- `map-after-desktop.png` — only conflict line is rendered, ordinary marker uses one neutral color, selected conflict marker keeps conflict red plus selection halo.
- `map-after-mobile-390.png` — 390 px map with mobile bottom sheet open.
- `synthetic-index-debug-crop.png` — synthetic lower-line index crop without user photo data.

Checks used for the artifacts:

```bash
npm test
npm run build
npm run test:preview-smoke
npx wrangler deploy --dry-run --config wrangler.toml
```
