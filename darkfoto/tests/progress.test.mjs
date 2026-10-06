import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionProgress, updateButton, updateProgress } from '../src/progress.js';

test('processing progress is bounded, uses real item fractions and clears at terminal state', () => {
  const first = actionProgress('recognition', 0, 4);
  assert.equal(first.type, 'buffer');
  assert.equal(first.value, 0);
  assert.equal(first.label, 'Распознавание 1/4');
  assert.equal(first.itemPercent, null);
  assert.equal(actionProgress('recognition', 1, 4, .5).value, .375);
  assert.equal(actionProgress('recognition', 2, 4).value, .5);
  assert.equal(actionProgress('recognition', 4, 4).value, 1);
  assert.equal(actionProgress('recognition', 99, 4, 2).value, 1);
  assert.equal(actionProgress('cleanup', 1, 4).type, 'indeterminate');
  assert.equal(actionProgress('ninjabox', 1, 4).type, 'indeterminate');
  assert.equal(actionProgress('ninjabox', 1, 4, .25).value, .3125);
  assert.equal(actionProgress('clipboard', 2, 4).label, 'Копирование блоков 2/4');
  assert.equal(actionProgress('clipboard', 2, 4).type, 'determinate');
  assert.equal(actionProgress('recognition', 0, 0), null);
});

test('update progress uses bytes only when total is known and button follows verified state', () => {
  assert.deepEqual(updateProgress({ state: 'downloading', downloadedBytes: 18_400_000, totalBytes: 54_200_000 }), {
    active: true, type: 'determinate', value: 18_400_000 / 54_200_000,
    label: '18.4 / 54.2 MB · 34%',
  });
  assert.equal(updateProgress({ state: 'paused', downloadedBytes: 5, totalBytes: -1 }).active, false);
  assert.equal(updateProgress({ state: 'ready_to_install', downloadedBytes: 5, totalBytes: 5 }).active, false);
  assert.equal(updateButton('idle', '0.3.5'), 'Скачать обновление');
  assert.equal(updateButton('downloading', '0.3.5'), null);
  assert.equal(updateButton('permission_required', '0.3.5'), 'Установить 0.3.5');
  assert.equal(updateButton('ready_to_install', '0.3.5'), 'Установить 0.3.5');
});
