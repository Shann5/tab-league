// End-to-end test: loads the unpacked extension into Chrome for Testing and
// runs park → reopen → revisit against a local page with a form.
// Run: npm test   (set CHROME=/path/to/chrome to override the browser)
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const EXT = path.resolve(import.meta.dirname, '../extension');
const CHROME = process.env.CHROME || findChrome();
const SHOTS = process.env.SHOTS;   // optional dir for panel screenshots

function findChrome() {
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dir = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
  if (!dir) throw new Error('No Playwright Chromium found; set CHROME=');
  return path.join(base, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}

// --- local pages -----------------------------------------------------------
const PAGES = {
  '/form': `<!doctype html><title>Grant application</title><form>
    <input name="company"><textarea id="why"></textarea>
    <input type="checkbox" name="agree" value="yes"><input type="password" name="pw">
    <input name="card" autocomplete="cc-number"></form>`,
  '/article': `<!doctype html><title>Long article</title><div style="height:6000px">long read</div>`,
  '/plain': `<!doctype html><title>Plain page</title><p>nothing to restore</p>`,
};
const server = http.createServer((req, res) => {
  res.writeHead(PAGES[req.url] ? 200 : 404, { 'Content-Type': 'text/html' });
  res.end(PAGES[req.url] || 'not found');
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['✓', name]); }
  catch (e) { results.push(['✗', name, e.message.split('\n')[0]]); }
}
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 100)); }
};

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-')), {
  executablePath: CHROME, headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const panel = await ctx.newPage();
  await panel.setViewportSize({ width: 380, height: 900 });
  await panel.goto(`chrome-extension://${extId}/panel.html`);
  // helper: run code inside the panel with the extension's modules loaded
  // (extension pages forbid eval, so the source goes in through DevTools, not new Function)
  const run = async (fn, arg) => {
    await panel.evaluate(async () => { window.__s = await import('./lib/store.js'); window.__a = await import('./lib/actions.js'); });
    return panel.evaluate(`(${fn})(window.__s, window.__a, ${JSON.stringify(arg ?? null)})`);
  };
  // match on the topic's own name: every page row's "move" menu lists all topic names too
  const topicRow = (name) => panel.locator('.topic').filter({ has: panel.locator('.name', { hasText: name }) });

  // Chrome segfaults when it discards a tab Playwright is attached to (Chromium 1208–1228, headless
  // and headed; the same build discards fine without Playwright). So the service worker's
  // chrome.tabs.discard only records the call, and clicking into a "discarded" tab is played the way
  // Chrome does it: activate, then reload.
  await sw.evaluate(() => {
    self.__discarded = [];
    chrome.tabs.discard = async (id) => { self.__discarded.push(id); return chrome.tabs.get(id); };
  });
  const discarded = () => sw.evaluate(() => self.__discarded);
  const tabIdOf = (url) => until(() => run(async (_s, _a, url) => (await chrome.tabs.query({})).find((t) => t.url === url && t.status === 'complete')?.id, url));
  const clickInto = async (url) => {
    const id = await tabIdOf(url);
    // wait for the service worker to finish the reopened tab: discarded, or restored and its job cleared
    const wasDiscarded = await until(async () => (await discarded()).includes(id) ? 'yes'
      : !(await run(async (s, _a, id) => s.getJob(id), id)) && 'no') === 'yes';
    await run(async (_s, _a, [id, reload]) => { await chrome.tabs.update(id, { active: true }); if (reload) await chrome.tabs.reload(id); }, [id, wasDiscarded]);
    return until(async () => ctx.pages().find((p) => p.url() === url));
  };

  await step('seeds topics and pages from the snapshot', async () => {
    const seed = JSON.parse(fs.readFileSync(path.join(EXT, 'seed/topics.json'), 'utf8'));
    const urls = seed.flatMap((t) => t.items.map((i) => i.url));
    const n = await until(() => run(async (s, _a, urls) => {
      const want = new Set(urls.map(s.keyOf)).size, { topics, pages } = await s.loadAll();
      return pages.length >= want && [Object.keys(topics).length, pages.length];
    }, urls));
    assert.ok(n[0] >= seed.length, `topics=${n[0]}`);
  });

  await step('keyOf normalizes tracking params, www and trailing slash', async () => {
    const k = await run((s) => [s.keyOf('https://www.a.com/x/?utm_source=x&id=1#top'), s.keyOf('https://mail.google.com/mail/u/0/#inbox/abc'), s.keyOf('https://a.com/')]);
    assert.deepEqual(k, ['https://a.com/x?id=1', 'https://mail.google.com/mail/u/0#inbox/abc', 'https://a.com']);
  });

  // a test topic with three pages
  await run(async (s, _a, base) => {
    const topics = await s.getTopics();
    topics.test = { id: 'test', area: 'Career', name: 'Test applications', order: -1 };
    await s.putTopics(topics);
    for (const p of ['/form', '/article', '/plain'])
      await s.putPage({ key: s.keyOf(base + p), url: base + p, title: p, topic: 'test', addedAt: Date.now() });
  }, BASE);

  const form = await ctx.newPage(); await form.goto(BASE + '/form');
  await form.fill('[name=company]', 'Acme Robotics');
  await form.fill('#why', 'Because tabs should be cheap to close.');
  await form.check('[name=agree]');
  await form.fill('[name=pw]', 'hunter2');
  await form.fill('[name=card]', '4242424242424242');
  const article = await ctx.newPage(); await article.goto(BASE + '/article');
  await article.evaluate(() => window.scrollTo(0, 2400));
  const plain = await ctx.newPage(); await plain.goto(BASE + '/plain');

  await step('panel shows the topic with 3 open tabs', async () => {
    await until(() => topicRow('Test applications').locator('.count').textContent().then((t) => t.includes('3 open')));
  });

  await step('Park closes the tabs and saves the draft + scroll', async () => {
    const closed = await run(async (s, a) => a.parkPages((await s.loadAll()).pages.filter((p) => p.topic === 'test')));
    assert.equal(closed, 3);
    await until(async () => form.isClosed() && article.isClosed());
    const st = await run(async (s, _a, base) => [(await s.getPage(s.keyOf(base + '/form'))).state, (await s.getPage(s.keyOf(base + '/article'))).state], BASE);
    const vals = st[0].fields.map((f) => f.value);
    assert.ok(vals.includes('Acme Robotics') && vals.includes('Because tabs should be cheap to close.'), JSON.stringify(vals));
    assert.ok(st[0].fields.some((f) => f.kind === 'checked'), 'checkbox saved');
    assert.ok(!vals.includes('hunter2'), 'password must not be saved');
    assert.ok(!vals.includes('4242424242424242'), 'card number must not be saved');
    assert.ok(st[1].scrollY >= 2000, `scrollY=${st[1].scrollY}`);
  });

  await step('Open reopens the topic as a named tab group and restores the draft', async () => {
    const opened = await run(async (s, a) => {
      const { topics, pages } = await s.loadAll();
      return a.openPages(pages.filter((p) => p.topic === 'test'), topics.test);
    });
    assert.equal(opened, 3);
    // only the first tab stays loaded; a background tab's draft comes back when you click into it
    const f = await clickInto(BASE + '/form');
    await until(() => f.inputValue('[name=company]').then((v) => v === 'Acme Robotics'));
    assert.equal(await f.inputValue('#why'), 'Because tabs should be cheap to close.');
    assert.equal(await f.isChecked('[name=agree]'), true);
    assert.equal(await f.inputValue('[name=pw]'), '');
    const group = await run(async () => (await chrome.tabGroups.query({})).map((g) => g.title));
    assert.ok(group.includes('Test applications'), JSON.stringify(group));
  });

  await step('restores scroll position on the long article', async () => {
    const a = await clickInto(BASE + '/article');
    await until(() => a.evaluate(() => window.scrollY >= 2000));
  });

  await step('background tab without a draft is discarded after loading', async () => {
    const id = await tabIdOf(BASE + '/plain');
    await until(async () => (await discarded()).includes(id));
    // nothing to restore, so no job is left waiting for it
    assert.equal(await run(async (s, _a, id) => s.getJob(id), id), undefined);
  });

  await step('revisiting a parked page shows where it is saved, and can restore the draft', async () => {
    await run(async (s, a, base) => a.parkPages([await s.getPage(s.keyOf(base + '/form'))]), BASE);
    const again = await ctx.newPage();
    await again.goto(BASE + '/form');
    const toast = again.locator('#tableague-toast');
    await until(() => toast.count());
    const text = await toast.evaluate((el) => el.shadowRoot.textContent);
    assert.ok(text.includes('Career › Test applications'), text);
    assert.ok(text.includes('draft with'), text);
    await toast.evaluate((el) => el.shadowRoot.querySelector('.p').click());
    await until(() => again.inputValue('[name=company]').then((v) => v === 'Acme Robotics'));
    const badge = await run(async (_s, _a, base) => {
      const t = (await chrome.tabs.query({})).find((t) => t.url === base + '/form' && t.active);
      return chrome.action.getBadgeText({ tabId: t.id });
    }, BASE);
    assert.equal(badge, '★');
  });

  await step('panel search filters pages', async () => {
    await panel.bringToFront();
    await panel.fill('#q', 'eagle');
    const shown = await panel.locator('.topic:not(.hide)').count();
    assert.ok(shown >= 1 && shown <= 4, `topics shown=${shown}`);
    await panel.fill('#q', '');
  });

  if (SHOTS) {
    await topicRow('Test applications').locator('.name').click();
    await panel.screenshot({ path: path.join(SHOTS, 'panel.png') });
  }
} catch (e) {
  results.push(['✗', 'test run aborted', e.message.split('\n')[0]]);
} finally {
  await ctx.close().catch(() => {});
  server.close();
}

for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === '✗').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
