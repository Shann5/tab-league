// @ts-check
// Park (save state + close) and open (reopen as a tab group) — shared by the
// side panel and the service worker.
import { keyOf, putPage, getPage, getJob, setJob, clearJob } from './store.js';
import { captureState, restoreState } from './inject.js';

/** @typedef {import('./store.js').Page} Page */
/** @typedef {import('./store.js').Topic} Topic */
/** @typedef {NonNullable<chrome.tabGroups.UpdateProperties['color']>} GroupColor */

/** @type {Record<string, GroupColor>} */
const COLORS = {
  Work: 'blue', Career: 'green', 'Events & travel': 'yellow', Research: 'purple', Build: 'cyan', Personal: 'pink',
};
export const colorFor = (/** @type {string} */ area) => COLORS[area] || /** @type {GroupColor} */ ('grey');

const worthRestoring = (/** @type {Page | undefined} */ p) => !!p?.state && (p.state.fields.length > 0 || p.state.scrollY > 300);

/** Save each open tab's draft + scroll, then close it.
 *  @param {Page[]} pages  @returns {Promise<number>} tabs closed */
export async function parkPages(pages) {
  const byKey = new Map(pages.map((p) => [p.key, p]));
  /** @type {number[]} */ const close = [];
  for (const t of await chrome.tabs.query({})) {
    const p = t.url ? byKey.get(keyOf(t.url)) : undefined;
    if (!p || t.id == null) continue;
    if (!t.discarded && /^https?:/.test(t.url || '')) {
      try {
        const [r] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: captureState });
        const s = r?.result;
        if (s && (s.fields.length || s.scrollY > 300)) p.state = { ...s, capturedAt: Date.now() };
        else if (s) delete p.state;   // nothing left to keep (e.g. the form was submitted)
      } catch { /* page blocks scripting (Web Store, PDF viewer…): park without state */ }
    }
    p.parkedAt = Date.now();
    if (t.title) p.title = t.title;
    await putPage(p);
    close.push(t.id);
  }
  if (close.length) await chrome.tabs.remove(close);
  return close.length;
}

/** Reopen pages that aren't already open, in a new window, as one named tab
 *  group. Background tabs are unloaded as soon as they load (no memory); a
 *  saved draft or scroll position comes back when you click into the tab.
 *  @param {Page[]} pages  @param {Topic} topic  @returns {Promise<number>} tabs opened */
export async function openPages(pages, topic) {
  const live = await chrome.tabs.query({});
  const liveKeys = new Set(live.map((t) => keyOf(t.url || t.pendingUrl || '')));
  const todo = pages.filter((p) => !liveKeys.has(p.key));
  if (!todo.length) {
    const t = live.find((t) => pages.some((p) => p.key === keyOf(t.url || '')));
    if (t?.id != null) { await chrome.tabs.update(t.id, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); }
    return 0;
  }
  // Clear "parked" first so the revisit reminder doesn't fire in these tabs.
  for (const p of todo) { delete p.parkedAt; await putPage(p); }

  // Each tab starts blank, gets its job recorded, then navigates — so the
  // service worker always knows what to do when it finishes loading.
  const win = await chrome.windows.create({ url: 'about:blank', focused: true });
  const first = win?.tabs?.[0]?.id;
  if (!win || first == null) return 0;
  const ids = [first];
  for (let i = 1; i < todo.length; i++) {
    const t = await chrome.tabs.create({ windowId: win.id, url: 'about:blank', active: false });
    if (t.id != null) ids.push(t.id);
  }
  const gid = await chrome.tabs.group({ tabIds: /** @type {[number, ...number[]]} */ (ids), createProperties: { windowId: win.id } });
  await chrome.tabGroups.update(gid, { title: topic.name, color: colorFor(topic.area), collapsed: false });
  for (let i = 0; i < ids.length; i++) {
    await setJob(ids[i], { key: todo[i].key, restore: worthRestoring(todo[i]), discard: i > 0 });
    await chrome.tabs.update(ids[i], { url: todo[i].url });
  }
  return todo.length;
}

/** Finish a tab we reopened once it loads: unload it if it's in the
 *  background (keeping the job so its state returns when you click in), or
 *  restore its draft/scroll if you're looking at it.
 *  @returns {Promise<Page | undefined>} */
export async function finishReopened(/** @type {number} */ tabId) {
  const job = await getJob(tabId);
  if (!job) return;
  const t = await chrome.tabs.get(tabId).catch(() => null);
  if (!t || keyOf(t.url || '') !== job.key) { await clearJob(tabId); return; }   // navigated elsewhere
  const p = await getPage(job.key);
  if (job.discard && !t.active) {
    await clearJob(tabId);
    const d = await chrome.tabs.discard(tabId).catch(() => null);
    const id = d?.id ?? tabId;
    if (worthRestoring(p)) await setJob(id, { key: job.key, restore: true, discard: false });
    return p;
  }
  await clearJob(tabId);
  if (job.restore && p?.state) {
    await chrome.scripting.executeScript({ target: { tabId }, func: restoreState, args: [p.state] }).catch(() => {});
  }
  return p;
}

/** Bring an open tab to the front, or open the page in the current window
 *  (restoring its draft). */
export async function focusOrOpen(/** @type {Page} */ p) {
  const t = (await chrome.tabs.query({})).find((t) => keyOf(t.url || '') === p.key);
  if (t?.id != null) {
    await chrome.tabs.update(t.id, { active: true });
    await chrome.windows.update(t.windowId, { focused: true });
    return;
  }
  delete p.parkedAt;
  await putPage(p);
  const nt = await chrome.tabs.create({ url: 'about:blank', active: true });
  if (nt.id == null) return;
  await setJob(nt.id, { key: p.key, restore: worthRestoring(p), discard: false });
  await chrome.tabs.update(nt.id, { url: p.url });
}
