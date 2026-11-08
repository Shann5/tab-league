import test from 'node:test';
import assert from 'node:assert/strict';
import { findDates, eventStatus } from '../brain/dates.js';

const T = '2026-10-25';
const f = (s, t = T) => findDates(s, t);

test('example', () => {
  const d = f('SF Tech Week · Oct 6–12, 2026 · RSVP by Sept. 30th');
  assert.deepEqual(d, ['2026-09-30', '2026-10-06', '2026-10-12']);
  assert.equal(eventStatus(d, T), 'past');
});
test('forms', () => {
  assert.deepEqual(f('2026-10-22 and 2026/10/23'), ['2026-10-22', '2026-10-23']);
  assert.deepEqual(f('October 22, 2026'), ['2026-10-22']);
  assert.deepEqual(f('oct 22 2026'), ['2026-10-22']);
  assert.deepEqual(f('22nd October 2026'), ['2026-10-22']);
  assert.deepEqual(f('Oct 22'), ['2026-10-22']);
  assert.deepEqual(f('2026年10月22日'), ['2026-10-22']);
  assert.deepEqual(f('10月22日'), ['2026-10-22']);
});
test('rejects', () => {
  assert.deepEqual(f('Octopus 3'), []);
  assert.deepEqual(f('Marching 3'), []);
  assert.deepEqual(f('Feb 30, 2026 2026-13-01'), []);
  assert.deepEqual(f('10/22/2026 22.10.2026'), []);
  assert.deepEqual(f('Oct 223'), []);
  assert.deepEqual(f('12026-10-22'), []);
});
test('ranges', () => {
  assert.deepEqual(f('Dec 28 – Jan 3, 2027'), ['2026-12-28', '2027-01-03']);
  assert.deepEqual(f('Oct 22-24'), ['2026-10-22', '2026-10-24']);
  assert.deepEqual(f('Oct 22—24, 2027'), ['2027-10-22', '2027-10-24']);
  assert.deepEqual(f('Dec 28 – Jan 3'), ['2026-12-28', '2027-01-03']);
});
test('inference', () => {
  assert.deepEqual(f('Apr 28'), ['2026-04-28']); // 180 days before
  assert.deepEqual(f('Apr 27'), ['2027-04-27']);
  assert.deepEqual(f('Feb 29', '2027-03-01'), []);
  assert.deepEqual(f('Feb 29, 2028'), ['2028-02-29']);
});
test('status', () => {
  assert.equal(eventStatus([], T), 'undated');
  assert.equal(eventStatus(['2026-10-25', '2026-01-01'], T), 'today');
  assert.equal(eventStatus(['2027-01-01', '2026-01-01'], T), 'upcoming');
});
