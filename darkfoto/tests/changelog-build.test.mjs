import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { releaseNotes } from '../src/changelog.js';

test('release notes use the canonical Russian source and Stage A cannot supply fictitious 0.5.0 release notes', async () => {
  const source = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  for (const version of ['0.4.0', '0.3.9', '0.3.8']) {
    const notes = releaseNotes(source, version);
    assert.match(notes, /^Версия \d+\.\d+\.\d+ от \d{2}\.\d{2}\.2026 г\./);
    for (const heading of ['Что нового:', 'Изменено:', 'Исправлено:']) assert.ok(notes.includes(heading));
    assert.equal(execFileSync(process.execPath, [new URL('../scripts/release-notes.mjs', import.meta.url).pathname, version], { encoding: 'utf8' }).trim(), notes);
    assert.equal((notes.match(/^Версия /gm) || []).length, 1);
  }
  assert.equal(releaseNotes(source, '0.5.0'), '');
  assert.throws(() => execFileSync(process.execPath, [new URL('../scripts/release-notes.mjs', import.meta.url).pathname, '0.5.0'], { stdio: 'pipe' }));
  const build = JSON.parse(await readFile(new URL('../build-info.json', import.meta.url), 'utf8'));
  assert.deepEqual(build, { version: '0.5.0', versionCode: 15, stage: 'A', releaseReady: false });
  const config = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(config.appId, 'app.darkfoto.mvp');
  assert.equal(config.appName, 'DarkCat Photo');
  assert.equal(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version, build.version);
});
