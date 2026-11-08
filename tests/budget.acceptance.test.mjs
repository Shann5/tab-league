import test from "node:test";
import assert from "node:assert/strict";
import { plan, tabDebt } from "../brain/budget.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 7, 12);
const ago = (days) => NOW - days * DAY;
const tab = (id, days, extra = {}) => ({ id, lastAccessed: ago(days), ...extra });

test("under the cap and nothing idle: nothing to do", () => {
  const tabs = [tab(1, 0.1), tab(2, 1), tab(3, 2)];
  assert.deepEqual(plan(tabs, NOW, { cap: 5 }), { archive: [], unload: [] });
});

test("defaults: cap 25 and archive after 7 days", () => {
  const tabs = Array.from({ length: 27 }, (_, i) => tab(i + 1, i * 0.1));    // all idle under 3 days
  assert.deepEqual(plan(tabs, NOW), { archive: [], unload: [27, 26] });
  assert.deepEqual(plan([tab(1, 7), tab(2, 6.99)], NOW), { archive: [1], unload: [] });
});

test("over the cap: least recently used tabs are unloaded first, in that order", () => {
  const tabs = [tab(1, 0.5), tab(2, 3), tab(3, 1), tab(4, 2), tab(5, 0.1)];
  assert.deepEqual(plan(tabs, NOW, { cap: 2 }), { archive: [], unload: [2, 4, 3] });
});

test("ties in lastAccessed go to the smaller id", () => {
  const tabs = [tab(9, 2), tab(3, 2), tab(5, 2), tab(1, 0)];
  assert.deepEqual(plan(tabs, NOW, { cap: 2 }), { archive: [], unload: [3, 5] });
});

test("protected tabs count toward the cap but are never chosen", () => {
  const tabs = [tab(1, 5, { pinned: true }), tab(2, 4, { audible: true }), tab(3, 3, { hasForm: true }),
    tab(4, 2.5, { active: true }), tab(5, 1), tab(6, 0.5)];
  assert.deepEqual(plan(tabs, NOW, { cap: 4 }), { archive: [], unload: [5, 6] });
});

test("when only protected tabs are left, the plan stops above the cap", () => {
  const tabs = [tab(1, 1, { pinned: true }), tab(2, 1, { active: true }), tab(3, 2)];
  assert.deepEqual(plan(tabs, NOW, { cap: 0 }), { archive: [], unload: [3] });
});

test("discarded tabs are not loaded: they neither count nor get unloaded", () => {
  const tabs = [tab(1, 3, { discarded: true }), tab(2, 2), tab(3, 1), tab(4, 0.2, { discarded: true })];
  assert.deepEqual(plan(tabs, NOW, { cap: 1 }), { archive: [], unload: [2] });
});

test("idle unprotected tabs are archived, loaded or not, oldest first", () => {
  const tabs = [tab(1, 8), tab(2, 30, { discarded: true }), tab(3, 7), tab(4, 1), tab(5, 9, { pinned: true }),
    tab(6, 10, { hasForm: true })];
  assert.deepEqual(plan(tabs, NOW, { cap: 10 }), { archive: [2, 1, 3], unload: [] });
});

test("archiving frees room before anything is unloaded, and no tab is in both lists", () => {
  const tabs = [tab(1, 20), tab(2, 10), tab(3, 3), tab(4, 2), tab(5, 1)];
  assert.deepEqual(plan(tabs, NOW, { cap: 2 }), { archive: [1, 2], unload: [3] });
  assert.deepEqual(plan(tabs, NOW, { cap: 3 }), { archive: [1, 2], unload: [] });
});

test("archiveAfterDays is configurable and the boundary is inclusive", () => {
  const tabs = [tab(1, 3), tab(2, 2.999), tab(3, 0)];
  assert.deepEqual(plan(tabs, NOW, { cap: 10, archiveAfterDays: 3 }), { archive: [1], unload: [] });
});

test("archive ties are ordered by id", () => {
  const tabs = [tab(8, 9), tab(2, 9), tab(5, 12)];
  assert.deepEqual(plan(tabs, NOW).archive, [5, 2, 8]);
});

test("missing booleans count as false", () => {
  const tabs = [{ id: 1, lastAccessed: ago(1) }, { id: 2, lastAccessed: ago(2), pinned: false, discarded: false }];
  assert.deepEqual(plan(tabs, NOW, { cap: 1 }), { archive: [], unload: [2] });
});

test("cap 0 unloads every unprotected tab", () => {
  const tabs = [tab(1, 1), tab(2, 2), tab(3, 0, { active: true })];
  assert.deepEqual(plan(tabs, NOW, { cap: 0 }), { archive: [], unload: [2, 1] });
});

test("a negative or fractional cap throws RangeError", () => {
  assert.throws(() => plan([], NOW, { cap: -1 }), RangeError);
  assert.throws(() => plan([], NOW, { cap: 2.5 }), RangeError);
});

test("empty input and inputs left untouched", () => {
  assert.deepEqual(plan([], NOW), { archive: [], unload: [] });
  const tabs = [tab(3, 9), tab(1, 2), tab(2, 1)];
  const copy = structuredClone(tabs);
  plan(tabs, NOW, { cap: 1 });
  assert.deepEqual(tabs, copy);
});

test("tabDebt counts unpinned tabs idle for the given days", () => {
  const tabs = [tab(1, 7), tab(2, 6.9), tab(3, 30, { pinned: true }), tab(4, 10, { discarded: true }),
    tab(5, 8, { audible: true }), tab(6, 0)];
  assert.equal(tabDebt(tabs, NOW), 3);
  assert.equal(tabDebt(tabs, NOW, 1), 4);
  assert.equal(tabDebt([], NOW), 0);
});
