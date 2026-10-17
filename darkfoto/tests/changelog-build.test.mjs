import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { releaseNotes, compactReleaseNotes, recentReleaseEntries } from '../src/changelog.js';

test('release notes use the canonical Russian source, compact latest three entries and 0.5.3 package continuity', async () => {
  const source = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  for (const version of ['0.5.3', '0.5.2', '0.5.1', '0.5.0', '0.4.0', '0.3.9', '0.3.8']) {
    const notes = releaseNotes(source, version);
    assert.match(notes, /^Версия \d+\.\d+\.\d+ от \d{2}\.\d{2}\.2026 г\./);
    for (const heading of ['Что нового:', 'Изменено:', 'Исправлено:']) assert.ok(notes.includes(heading));
    assert.equal(execFileSync(process.execPath, [new URL('../scripts/release-notes.mjs', import.meta.url).pathname, version], { encoding: 'utf8' }).trim(), notes);
    assert.equal((notes.match(/^Версия /gm) || []).length, 1);
  }
  assert.equal(releaseNotes(source, '9.9.9'), '');
  assert.throws(() => execFileSync(process.execPath, [new URL('../scripts/release-notes.mjs', import.meta.url).pathname, '9.9.9'], { stdio: 'pipe' }));
  const compact = recentReleaseEntries(source);
  assert.deepEqual(compact.map((entry) => entry.version), ['0.5.3', '0.5.2', '0.5.1']);
  assert.equal(recentReleaseEntries('').length, 0);
  assert.equal(compactReleaseNotes(source, '9.9.9'), '');
  for (const entry of compact) {
    assert.equal(entry.text.split('\n').length, 4, 'heading and one useful item per category');
    assert.ok(entry.text.length < releaseNotes(source, entry.version).length);
    for (const line of entry.text.split('\n')) assert.ok(releaseNotes(source, entry.version).includes(line));
  }
  assert.ok(source.includes('Версия 0.3.8'), 'full repository history stays intact');
  const build = JSON.parse(await readFile(new URL('../build-info.json', import.meta.url), 'utf8'));
  assert.deepEqual(build, { version: '0.5.3', versionCode: 18, stage: 'B', releaseReady: false });
  const config = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(config.appId, 'app.darkfoto.mvp');
  assert.equal(config.appName, 'DarkCat Photo');
  assert.equal(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version, build.version);
});
