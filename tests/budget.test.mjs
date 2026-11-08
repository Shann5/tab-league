import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, tabDebt } from '../brain/budget.js';

const D = 86_400_000;

test('archive and unload', () => {
  const now = 10 * D;
  const tabs = [
    { id: 1, lastAccessed: 0 },
    { id: 2, lastAccessed: 0, pinned: true },
    { id: 3, lastAccessed: 9 * D, discarded: true },
    { id: 4, lastAccessed: 9 * D + 2 },
    { id: 5, lastAccessed: 9 * D + 1 },
    { id: 6, lastAccessed: 9 * D + 1, active: true },
  ];
  const r = plan(tabs, now, { cap: 2 });
  assert.deepEqual(r, { archive: [1], unload: [5, 4] });
  assert.equal(tabDebt(tabs, now), 1);
});

test('validation and empty', () => {
  assert.throws(() => plan([], 0, { cap: -1 }), RangeError);
  assert.throws(() => plan([], 0, { cap: 1.5 }), RangeError);
  assert.deepEqual(plan([], 0, { cap: 0 }), { archive: [], unload: [] });
});
