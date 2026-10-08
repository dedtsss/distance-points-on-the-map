import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Only resample, center within Android's safe zone, and apply the round mask.
const source = await readFile(new URL('../resources/icon-selected-original.png', import.meta.url));
assert.equal(createHash('sha256').update(source).digest('hex'),
  '0f21b1535d5ae97567365bc64439c1c28c55138eb72b88d51a0f4060542946f7');
const check = process.argv.includes('--check');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [density, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
    for (const kind of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_background']) {
      const file = new URL(`../android/app/src/main/res/mipmap-${density}/${kind}.png`, import.meta.url);
      const actual = check ? (await readFile(file)).toString('base64') : null;
      const result = await page.evaluate(async ({ source, actual, kind, scale }) => {
        const load = async (data) => {
          const img = new Image(); img.src = `data:image/png;base64,${data}`;
          await img.decode(); return img;
        };
        const img = await load(source);
        if (img.width !== 1254 || img.height !== 1254) throw new Error('Source dimensions changed');
        const adaptive = kind.endsWith('foreground') || kind.endsWith('background');
        const canvas = document.createElement('canvas');
        const size = canvas.width = canvas.height = (adaptive ? 108 : 48) * scale;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        if (kind.endsWith('round')) {
          ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
        }
        if (kind.endsWith('foreground')) {
          ctx.drawImage(img, 21 * scale, 21 * scale, 66 * scale, 66 * scale);
        } else if (kind.endsWith('background')) {
          // The outer artwork corner supplies the background, without recoloring.
          ctx.drawImage(img, 0, 0, 1, 1, 0, 0, size, size);
        } else ctx.drawImage(img, 0, 0, size, size);
        if (actual) {
          const stored = await load(actual);
          if (stored.width !== size || stored.height !== size) throw new Error('Resource dimensions changed');
          const other = document.createElement('canvas'); other.width = other.height = size;
          const otherCtx = other.getContext('2d'); otherCtx.drawImage(stored, 0, 0);
          const expected = ctx.getImageData(0, 0, size, size).data;
          const pixels = otherCtx.getImageData(0, 0, size, size).data;
          if (expected.some((value, index) => value !== pixels[index])) throw new Error('Resource differs from exact artwork transform');
        }
        return canvas.toDataURL('image/png').split(',')[1];
      }, { source: source.toString('base64'), actual, kind, scale });
      if (!check) await writeFile(file, Buffer.from(result, 'base64'));
    }
  }
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    const xml = await readFile(new URL(`../android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`, import.meta.url), 'utf8');
    assert.match(xml, /@mipmap\/ic_launcher_foreground/);
    assert.match(xml, /@mipmap\/ic_launcher_background/);
  }
  for (const old of ['drawable-v24/ic_launcher_foreground.xml', 'drawable/ic_launcher_background.xml', 'values/ic_launcher_background.xml']) {
    await assert.rejects(() => access(new URL(`../android/app/src/main/res/${old}`, import.meta.url)), { code: 'ENOENT' });
  }
  const manifest = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  console.log(`Exact selected artwork hash, 20 density resources and adaptive references: ${check ? 'PASS' : 'generated'}`);
} finally { await browser.close(); }
