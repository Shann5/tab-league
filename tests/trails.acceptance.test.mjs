import test from "node:test";
import assert from "node:assert/strict";
import { trails, whyOpen } from "../brain/trails.js";

const t = (id, openedAt, openerTabId = undefined, extra = {}) =>
  ({ id, url: `https://example.com/${id}`, title: `Page ${id}`, openerTabId, openedAt, ...extra });

test("spec example", () => {
  const tabs = [
    { id: 1, url: "https://google.com/search?q=x", title: "Google", openedAt: 100, query: "eagle speculative decoding" },
    { id: 2, url: "https://arxiv.org/abs/2503.01840", title: "EAGLE-3 - arXiv", openerTabId: 1, openedAt: 200 },
    { id: 3, url: "https://github.com/SafeAILab/EAGLE", title: "SafeAILab/EAGLE", openerTabId: 2, openedAt: 300 },
  ];
  assert.equal(whyOpen(tabs, 3), 'Opened from "EAGLE-3 - arXiv" ← opened from "Google" ← searched "eagle speculative decoding"');
  assert.equal(whyOpen(tabs, 1), 'Searched "eagle speculative decoding"');
  assert.equal(whyOpen(tabs, 2), 'Opened from "Google" ← searched "eagle speculative decoding"');
  assert.deepEqual(trails(tabs), [[1, 2, 3]]);
});

test("a trail is a root and all its descendants, in the order they were opened", () => {
  const tabs = [t(1, 10), t(2, 50, 1), t(3, 20, 1), t(4, 30, 3), t(5, 40, 2), t(6, 5)];
  assert.deepEqual(trails(tabs), [[1, 3, 4, 5, 2]]);
});

test("single-tab trails are left out; trails are ordered by their root", () => {
  const tabs = [t(10, 300), t(11, 310, 10), t(1, 100), t(2, 110, 1), t(7, 50)];
  assert.deepEqual(trails(tabs), [[1, 2], [10, 11]]);
});

test("ties in openedAt are broken by id", () => {
  const tabs = [t(5, 10), t(9, 20, 5), t(7, 20, 5), t(3, 10), t(4, 10, 3)];
  assert.deepEqual(trails(tabs), [[3, 4], [5, 7, 9]]);
});

test("an opener that is no longer open makes the tab a root", () => {
  const tabs = [t(2, 20, 99), t(3, 30, 2), t(4, 40, null)];
  assert.deepEqual(trails(tabs), [[2, 3]]);
});

test("an opener cycle gets a root at its earliest tab", () => {
  const tabs = [t(1, 30, 2), t(2, 10, 3), t(3, 20, 1), t(4, 40, 1), t(5, 5)];
  assert.deepEqual(trails(tabs), [[2, 3, 1, 4]]);
});

test("cycle root ties on openedAt go to the smaller id; a tab that opened itself is a root", () => {
  const tabs = [t(8, 10, 6), t(6, 10, 8), t(9, 20, 6), t(1, 1, 1), t(2, 2, 1)];
  assert.deepEqual(trails(tabs), [[1, 2], [6, 8, 9]]);
});

test("empty input", () => {
  assert.deepEqual(trails([]), []);
});

test("whyOpen without a query anywhere walks to the root", () => {
  const tabs = [t(1, 1), t(2, 2, 1), t(3, 3, 2)];
  assert.equal(whyOpen(tabs, 3), 'Opened from "Page 2" ← opened from "Page 1"');
  assert.equal(whyOpen(tabs, 1), "Opened directly");
});

test("whyOpen stops at the first ancestor with a query", () => {
  const tabs = [t(1, 1, undefined, { query: "older" }), t(2, 2, 1, { query: "newer" }), t(3, 3, 2), t(4, 4, 3)];
  assert.equal(whyOpen(tabs, 4), 'Opened from "Page 3" ← opened from "Page 2" ← searched "newer"');
});

test("whyOpen uses the URL when the title is empty; empty or null query counts as none", () => {
  const tabs = [t(1, 1, undefined, { title: "", query: "" }), t(2, 2, 1, { query: null })];
  assert.equal(whyOpen(tabs, 2), 'Opened from "https://example.com/1"');
  assert.equal(whyOpen(tabs, 1), "Opened directly");
});

test("whyOpen: closed opener means opened directly", () => {
  assert.equal(whyOpen([t(2, 2, 77)], 2), "Opened directly");
});

test("whyOpen stops at a cycle without repeating tabs", () => {
  const tabs = [t(1, 1, 3), t(2, 2, 1), t(3, 3, 2)];
  assert.equal(whyOpen(tabs, 1), 'Opened from "Page 3" ← opened from "Page 2"');
  assert.equal(whyOpen([t(5, 1, 5)], 5), "Opened directly");
});

test("whyOpen capitalises only the first letter", () => {
  const tabs = [t(1, 1, undefined, { title: "lower case title" }), t(2, 2, 1)];
  assert.equal(whyOpen(tabs, 2), 'Opened from "lower case title"');
  assert.equal(whyOpen([t(1, 1, undefined, { query: "q" })], 1), 'Searched "q"');
});

test("whyOpen throws RangeError for an unknown tab", () => {
  assert.throws(() => whyOpen([t(1, 1)], 2), RangeError);
});
