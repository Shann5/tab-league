import test from "node:test";
import assert from "node:assert/strict";
import { findDates, eventStatus } from "../brain/dates.js";

const T = "2026-10-25";

test("spec example", () => {
  const d = findDates("SF Tech Week · Oct 6–12, 2026 · RSVP by Sept. 30th", T);
  assert.deepEqual(d, ["2026-09-30", "2026-10-06", "2026-10-12"]);
  assert.equal(eventStatus(d, T), "past");
});

test("ISO dates with dashes or slashes", () => {
  assert.deepEqual(findDates("Deadline 2026-11-21, results 2026/12/05", T), ["2026-11-21", "2026-12-05"]);
});

test("ISO dates glued to other digits are not dates", () => {
  assert.deepEqual(findDates("id 12026-11-21 and 2026-11-215", T), []);
});

test("month first with a year, comma optional, full or abbreviated", () => {
  assert.deepEqual(findDates("October 22, 2026", T), ["2026-10-22"]);
  assert.deepEqual(findDates("Oct 22 2026", T), ["2026-10-22"]);
  assert.deepEqual(findDates("Starts DEC. 3, 2027", T), ["2027-12-03"]);
  assert.deepEqual(findDates("on Sept 9, 2026 and Sep 10, 2026", T), ["2026-09-09", "2026-09-10"]);
});

test("day first with a year", () => {
  assert.deepEqual(findDates("Workshop: 22 October 2026, Lisbon", T), ["2026-10-22"]);
  assert.deepEqual(findDates("3 Nov 2026", T), ["2026-11-03"]);
});

test("ordinal suffixes", () => {
  assert.deepEqual(findDates("November 1st, 2026 · Nov 2nd 2026 · 3rd December 2026 · Dec 24th, 2026", T),
    ["2026-11-01", "2026-11-02", "2026-12-03", "2026-12-24"]);
});

test("month names are whole words only", () => {
  assert.deepEqual(findDates("Octopus 3 and Mayday 5 and Junebug 2026", T), []);
  assert.deepEqual(findDates("Marching 4, 2026", T), []);
});

test("no year: this year, or next year when it would be more than 180 days back", () => {
  assert.deepEqual(findDates("Meetup Nov 3", T), ["2026-11-03"]);
  assert.deepEqual(findDates("Kickoff Oct 1", T), ["2026-10-01"]);            // 24 days back: this year
  assert.deepEqual(findDates("Demo day Apr 28", T), ["2026-04-28"]);          // 180 days back exactly: this year
  assert.deepEqual(findDates("Demo day Apr 27", T), ["2027-04-27"]);          // 181 days back: next year
  assert.deepEqual(findDates("Jan 15", "2026-12-20"), ["2027-01-15"]);
});

test("same-month ranges with any dash, spaced or not", () => {
  assert.deepEqual(findDates("October 22-24, 2026", T), ["2026-10-22", "2026-10-24"]);
  assert.deepEqual(findDates("Oct 22 – 24, 2026", T), ["2026-10-22", "2026-10-24"]);
  assert.deepEqual(findDates("Oct 22—24 2026", T), ["2026-10-22", "2026-10-24"]);
});

test("cross-month ranges", () => {
  assert.deepEqual(findDates("Oct 30 – Nov 2, 2026", T), ["2026-10-30", "2026-11-02"]);
  assert.deepEqual(findDates("December 28-January 3, 2027", T), ["2026-12-28", "2027-01-03"]);
});

test("ranges without a year use the inferred year", () => {
  assert.deepEqual(findDates("Hackathon Nov 14-16", T), ["2026-11-14", "2026-11-16"]);
  assert.deepEqual(findDates("Mar 30 – Apr 2", T), ["2027-03-30", "2027-04-02"]);
});

test("Chinese dates", () => {
  assert.deepEqual(findDates("截止日期：2026年11月21日", T), ["2026-11-21"]);
  assert.deepEqual(findDates("展览 11月3日 开幕", T), ["2026-11-03"]);
  assert.deepEqual(findDates("活动 3月1日", T), ["2027-03-01"]);
});

test("impossible dates are ignored; numeric forms are not recognised", () => {
  assert.deepEqual(findDates("Feb 30, 2026 and 2026-13-01 and 2026-02-29 and Feb 29, 2028", T), ["2028-02-29"]);
  assert.deepEqual(findDates("10/22/2026 or 22.10.2026 or 22/10/2026", T), []);
});

test("results are sorted and unique", () => {
  assert.deepEqual(findDates("2026-11-02; Nov 2, 2026; 2 November 2026; Oct 1, 2026", T), ["2026-10-01", "2026-11-02"]);
});

test("no dates at all", () => {
  assert.deepEqual(findDates("", T), []);
  assert.deepEqual(findDates("Read later: speculative decoding notes", T), []);
});

test("eventStatus looks only at the latest date", () => {
  assert.equal(eventStatus([], T), "undated");
  assert.equal(eventStatus(["2026-10-24"], T), "past");
  assert.equal(eventStatus(["2026-10-25"], T), "today");
  assert.equal(eventStatus(["2026-10-26"], T), "upcoming");
  assert.equal(eventStatus(["2026-10-01", "2026-10-30"], T), "upcoming");
  assert.equal(eventStatus(["2026-10-30", "2026-10-01"], T), "upcoming");
  assert.equal(eventStatus(["2025-12-31", "2026-10-25"], T), "today");
});
