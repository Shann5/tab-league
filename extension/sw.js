// @ts-check
// Service worker: seeds the store, finishes reopened tabs (restore draft or
// unload), and marks pages you've saved when you visit them again.
import { seedIfEmpty, loadAll, getPage, putPage, getTopics, getJob, clearJob, keyOf, hostOf } from './lib/store.js';
import { finishReopened } from './lib/actions.js';
import { showToast, restoreState } from './lib/inject.js';

chrome.runtime.onInstalled.addListener(() => { seedIfEmpty(); });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.tabs.onRemoved.addListener((tabId) => { clearJob(tabId); });

const ago = (/** @type {number} */ t) => {
  const d = Math.round((Date.now() - t) / 864e5);
  return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

/** Saved-page count per site, cached until storage changes. @type {Map<string, number> | null} */
let hostIndex = null;
chrome.storage.onChanged.addListener((_c, area) => { if (area === 'local') hostIndex = null; });
async function savedFromHost(/** @type {string} */ host) {
  if (!hostIndex) {
    hostIndex = new Map();
    for (const p of (await loadAll()).pages) { const h = hostOf(p.url); hostIndex.set(h, (hostIndex.get(h) || 0) + 1); }
  }
  return hostIndex.get(host) || 0;
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url || !/^https?:/.test(tab.url)) return;

  // Tabs we reopened ourselves.
  if (await getJob(tabId)) {
    const p = await finishReopened(tabId);
    if (p) await mark(tabId, p);
    return;
  }

  const p = await getPage(keyOf(tab.url));
  if (p) {
    await mark(tabId, p);
    if (p.parkedAt) {
      // You came back to a parked page on your own: say where it lives.
      const t = (await getTopics())[p.topic];
      chrome.scripting.executeScript({
        target: { tabId }, func: showToast,
        args: [{ key: p.key, path: t ? `${t.area} › ${t.name}` : 'Tab League', when: ago(p.parkedAt), draft: p.state?.fields.length || 0, note: p.note }],
      }).catch(() => {});
      delete p.parkedAt;
      await putPage(p);
    }
    return;
  }
  // Not saved itself, but you have other pages from this site.
  const host = hostOf(tab.url);
  const n = await savedFromHost(host);
  if (n) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#7c766b' });
    chrome.action.setBadgeText({ tabId, text: String(n) });
    chrome.action.setTitle({ tabId, title: `Tab League: ${n} saved page${n > 1 ? 's' : ''} from ${host}` });
  }
});

/** @param {number} tabId  @param {import('./lib/store.js').Page} p */
async function mark(tabId, p) {
  const t = (await getTopics())[p.topic];
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#8a5a2b' });
  chrome.action.setBadgeText({ tabId, text: '★' });
  chrome.action.setTitle({ tabId, title: `Saved in ${t ? `${t.area} › ${t.name}` : 'Tab League'}` + (p.state?.fields.length ? ' · has a draft' : '') });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'restore' && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    getPage(msg.key).then((p) => p?.state &&
      chrome.scripting.executeScript({ target: { tabId }, func: restoreState, args: [p.state] }).catch(() => {}));
  }
});
