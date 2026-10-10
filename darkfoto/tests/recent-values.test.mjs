import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRecentValues, rememberValue, forgetValue, matchingValues, RECENT_FIELDS } from '../src/recentValues.js';

test('10 distinct non-empty values per field persist, MRU reorder, filtered matches and deletion', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  for (const field of RECENT_FIELDS) {
    for (let i = 1; i <= 12; i++) rememberValue(field, `${field} ${i}`, storage);
    rememberValue(field, '  ', storage);
    const restarted = readRecentValues(field, { ...storage });
    assert.equal(restarted.length, 10);
    assert.deepEqual(restarted.slice(0, 2), [`${field} 12`, `${field} 11`]);
    assert.equal(restarted.includes(`${field} 2`), false);
    const reordered = rememberValue(field, ` ${field} 7 `, storage);
    assert.equal(reordered.length, 10);
    assert.equal(reordered[0], `${field} 7`);
    assert.deepEqual(matchingValues(reordered, ' 1 '), [`${field} 12`, `${field} 11`, `${field} 10`]);
    assert.equal(forgetValue(field, `${field} 7`, storage).length, 9);
  }
  assert.deepEqual(matchingValues(['Север-2', 'север-1', 'Юг'], 'СЕВЕР'), ['Север-2', 'север-1']);
  assert.throws(() => rememberValue('other', 'secret', storage), /Unknown/);
});
