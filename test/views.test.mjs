// End-to-end check of the views that use brain/: the Action desk's "Dates found in your archive" (brain/dates.js)
// and the graph's person nodes (brain/people.js). Read-only: it never posts marks, so data/status.json is untouched.
//
//   python3 serve.py &   (or let this test start it)
//   node --test test/views.test.mjs          SHOTS=dir also saves screenshots
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { groupPeople } from '../brain/people.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = 'http://localhost:8765';
const SHOTS = process.env.SHOTS;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dir = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
  if (!dir) throw new Error('No Playwright Chromium found; set CHROME=');
  return path.join(base, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}

async function up() {
  try { return (await fetch(`${BASE}/brain/dates.js`)).ok; } catch { return false; }
}

/** @type {import('playwright-core').Browser} */
let browser;
/** @type {import('node:child_process').ChildProcess | undefined} */
let server;

before(async () => {
  if (!(await up())) {
    server = spawn('python3', ['serve.py'], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(await up(), 'serve.py did not start');
  }
  browser = await chromium.launch({ executablePath: findChrome(), headless: true });
});
after(async () => { await browser?.close(); server?.kill(); });

/** A fresh page that records console errors; `block` aborts requests for those brain modules. */
async function open(url, { block = [], time } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  for (const b of block) await page.route(`**/brain/${b}`, (r) => r.abort());
  if (time) await page.clock.setFixedTime(new Date(time));
  await page.goto(BASE + url);
  return { page, errors, close: () => ctx.close() };
}

const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), ...opts }); };

test('Action desk lists dates found in the archive, split into coming up and already happened', async () => {
  const { page, errors, close } = await open('/actions.html');
  const found = page.locator('#found');
  await found.waitFor({ state: 'visible' });
  const intro = await page.locator('#found-intro').textContent();
  const m = /^(\d+) of (\d+) archived pages mention a date: (\d+) coming up, (\d+) already happened\.$/.exec(intro ?? '');
  assert.ok(m, intro ?? '(no intro)');
  const [, total, , up, past] = m.map(Number);
  assert.equal(up + past, total);
  assert.ok(past > 0, 'expected past events in the demo snapshot');
  assert.equal(await page.locator('#found-past li').count(), past);
  assert.equal(await page.locator('#found-up li').count(), up);
  // every row links to its page and shows a date; nothing listed elsewhere on the desk is repeated
  for (const li of await page.locator('#found li').all()) {
    assert.match(await li.locator('a').getAttribute('href') ?? '', /^https?:\/\//);
    assert.match(await li.locator('.when').textContent() ?? '', /^(today|[A-Z][a-z]{2} \d{1,2}, \d{4})$/);
  }
  const elsewhere = await page.$$eval('main a[href]', (as) => as.filter((a) => !a.closest('#found')).map((a) => TG.norm(a.getAttribute('href'))));
  const listed = await page.$$eval('#found a[href]', (as) => as.map((a) => TG.norm(a.getAttribute('href'))));
  assert.deepEqual(listed.filter((u) => elsewhere.includes(u)), []);
  // the hand-curated deadlines still work alongside
  assert.match(await page.locator('.act[data-due] .when').first().textContent() ?? '', /passed|left/);
  await shot(page, 'actions-found.png', { fullPage: true });
  assert.deepEqual(errors, []);
  await close();
});

test('"already happened" follows the browser clock, with no rebuild', async () => {
  /** Rows of each list as [title, date], checked against the page's own clock. */
  const lists = async (time) => {
    const { page, errors, close } = await open('/actions.html', { time });
    await page.locator('#found').waitFor({ state: 'visible' });
    const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));
    const read = (id) => page.$$eval(`#${id} li`, (lis) => lis.map((li) => [li.querySelector('a').textContent,
      new Date(li.querySelector('.when').textContent + ' 12:00').toLocaleDateString('en-CA')]));
    const [up, past] = [await read('found-up'), await read('found-past')];
    for (const [t, d] of past) assert.ok(d < today, `past row "${t}" is dated ${d}, not before ${today}`);
    for (const [t, d] of up) assert.ok(d >= today, `upcoming row "${t}" is dated ${d}, before ${today}`);
    assert.deepEqual(errors, []);
    await close();
    return { past: past.map(([t]) => t).sort() };
  };
  const now = await lists(undefined);
  const june = await lists('2026-06-01T12:00:00');
  assert.notDeepEqual(june.past, now.past, 'moving the clock to 2026-06-01 should change what has already happened');
});

test('Action desk without brain/: the section stays hidden and the rest works', async () => {
  const { page, errors, close } = await open('/actions.html', { block: ['dates.js'] });
  await page.waitForFunction(() => document.querySelector('.act[data-due] .when')?.textContent);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#found').isVisible(), false);
  assert.deepEqual(errors, []);
  await close();
});

/** The Action desk with /api/status faked in memory, so clicks never reach data/status.json. */
async function deskWithFakeStatus() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], posts = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/api/status', (route) => {
    if (route.request().method() === 'POST') { posts.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/close', (route) => route.fulfill({ json: { closed: 0 } }));
  await page.goto(BASE + '/actions.html');
  return { page, errors, posts, close: () => ctx.close() };
}

test('A whole section can be removed from its heading, and undone', async () => {
  const { page, errors, posts, close } = await deskWithFakeStatus();
  const trip = page.locator('section', { has: page.locator('h2', { hasText: 'this trip' }) });
  await trip.waitFor({ state: 'visible' });
  const rows = await trip.locator('li.act').count();
  assert.ok(rows > 0);
  await trip.locator('h2').hover();
  await trip.locator('h2 .tg-x').click();
  await trip.waitFor({ state: 'hidden' });
  assert.equal(posts.length, rows + 1, 'the section key plus every row');
  assert.ok(posts.every((p) => p.value?.s === 'removed'));
  assert.ok(posts.some((p) => p.key.startsWith('sec:actions.html:Lisbon')));
  assert.match(await page.locator('.tg-toast').textContent() ?? '', /Removed "Lisbon — this trip"/);
  await page.locator('.tg-toast button', { hasText: 'Undo' }).click();
  await trip.waitFor({ state: 'visible' });
  assert.ok(posts.slice(rows + 1).every((p) => p.value === null));
  // "Show removed" brings a removed section back into view
  await trip.locator('h2 .tg-x').click();
  await trip.waitFor({ state: 'hidden' });
  await page.locator('.tg-toggle').click();
  await trip.waitFor({ state: 'visible' });
  assert.equal(await trip.locator('h2 .tg-x').textContent(), '↺');
  assert.deepEqual(errors, []);
  await close();
});

test('A section hides once every row in it has been removed one by one', async () => {
  const { page, errors, close } = await deskWithFakeStatus();
  const trip = page.locator('section', { has: page.locator('h2', { hasText: 'this trip' }) });
  await trip.waitFor({ state: 'visible' });
  const xs = trip.locator('li.act .tg-x');
  const n = await xs.count();
  for (let i = 0; i < n; i++) { await trip.locator('li.act').nth(i).hover(); await xs.nth(i).click(); }
  await trip.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  await close();
});

/** Waits for the graph to finish building (its script now awaits brain/people.js). */
async function graphNodes(page) {
  await page.waitForFunction(() => window.graph && window.graph.nodes.length > 0);
  return page.evaluate(() => window.graph.nodes.map((n) => ({ k: n.k, label: n.label, url: n.url ?? null, n: n.n ?? null })));
}

test('Graph shows people as nodes, one per person, linked to their profile pages', async () => {
  const { page, errors, close } = await open('/graph.html');
  const nodes = await graphNodes(page);
  const pages = nodes.filter((n) => n.k === 'p');
  const expected = groupPeople(pages.map((n) => ({ url: n.url, title: n.label })));
  const people = nodes.filter((n) => n.k === 'h');
  assert.ok(expected.length > 0, 'expected profile pages in the demo snapshot');
  assert.deepEqual(people.map((p) => p.label), expected.map((p) => p.name));
  assert.equal(await page.locator('circle.node.person').count(), expected.length);
  assert.equal(await page.locator('line.edge.pedge').count(), expected.reduce((s, p) => s + p.pages.length, 0));
  // hovering a person explains it
  const ring = page.locator('circle.node.person').first();
  await page.waitForFunction(() => window.graph.alpha < 0.05, null, { timeout: 15000 });
  await ring.hover({ force: true });
  const tip = page.locator('.tip');
  await tip.waitFor({ state: 'visible' });
  assert.match(await tip.textContent() ?? '', /Person · \d+ profiles?: .*Profiles merged by brain\/people\.js/);
  await shot(page, 'graph-people.png');
  assert.deepEqual(errors, []);
  await close();
});

test('Graph without brain/: no people, everything else as before', async () => {
  const { page, errors, close } = await open('/graph.html', { block: ['people.js'] });
  const nodes = await graphNodes(page);
  assert.equal(nodes.filter((n) => n.k === 'h').length, 0);
  assert.ok(nodes.filter((n) => n.k === 'p').length > 0);
  assert.equal(await page.locator('circle.node.person').count(), 0);
  assert.deepEqual(errors, []);
  await close();
});
