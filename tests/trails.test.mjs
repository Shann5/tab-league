import test from "node:test";
import assert from "node:assert/strict";
import { trails, whyOpen } from "../brain/trails.js";

const T = (id, openerTabId, openedAt, extra = {}) => ({ id, url: "u" + id, title: "t" + id, openerTabId, openedAt, ...extra });

test("example", () => {
  const tabs = [
    T(1, undefined, 1, { title: "Google", query: "eagle speculative decoding" }),
    T(2, 1, 2, { title: "EAGLE-3 - arXiv" }),
    T(3, 2, 3, { title: "" }),
  ];
  assert.equal(whyOpen(tabs, 3), 'Opened from "EAGLE-3 - arXiv" ← opened from "Google" ← searched "eagle speculative decoding"');
  assert.equal(whyOpen(tabs, 1), 'Searched "eagle speculative decoding"');
  assert.equal(whyOpen([T(5, 9, 1)], 5), "Opened directly");
  assert.throws(() => whyOpen(tabs, 99), RangeError);
  assert.deepEqual(trails(tabs), [[1, 2, 3]]);
});

test("closed opener, singles dropped, self-loop", () => {
  assert.deepEqual(trails([T(1, 50, 1), T(2, 1, 2), T(3, undefined, 0), T(4, 4, 0)]), [[1, 2]]);
  assert.deepEqual(trails([]), []);
});

test("cycles", () => {
  const tabs = [T(1, 2, 5), T(2, 1, 4), T(3, 2, 1), T(9, undefined, 0), T(10, 9, 0)];
  assert.deepEqual(trails(tabs), [[9, 10], [3, 2, 1]]);
  assert.equal(whyOpen([T(1, 2, 1), T(2, 1, 2)], 1), 'Opened from "t2"');
  const c3 = [T(1, 3, 3), T(2, 1, 2), T(3, 2, 1)];
  assert.deepEqual(trails(c3), [[3, 2, 1]]);
});

test("ties and middle query", () => {
  assert.deepEqual(trails([T(5, undefined, 1), T(3, 5, 1), T(4, 5, 1)]), [[3, 4, 5]]);
  const tabs = [T(1, undefined, 1, { query: "a" }), T(2, 1, 2, { query: "q" }), T(3, 2, 3), T(4, 3, 4)];
  assert.equal(whyOpen(tabs, 4), 'Opened from "t3" ← opened from "t2" ← searched "q"');
});
