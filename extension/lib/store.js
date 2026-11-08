// @ts-check
// Storage model. Each page lives under its own key ("p:<url key>") so the
// panel and the service worker can write different pages without clobbering.

/** @typedef {{ sel: string, kind: 'value' | 'checked' | 'text', value: string }} Field */
/** @typedef {{ scrollY: number, fields: Field[], capturedAt: number }} PageState */
/**
 * @typedef {{
 *   key: string, url: string, title: string, topic: string,
 *   note?: string, addedAt: number, parkedAt?: number, state?: PageState
 * }} Page
 */
/** @typedef {{ id: string, area: string, name: string, order: number }} Topic */

const DROP_PARAMS = /^(utm_|gclid$|fbclid$|spm$|_gl$|twclid$|mc_cid$|mc_eid$|ref_src$|si$)/;

/** Stable identity for a URL: no tracking params, no www, no trailing slash,
 *  and no #fragment unless it looks like an app route (#/..., #inbox/...). */
export function keyOf(/** @type {string} */ url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return url;
    // always re-serialize the query so encodings match whether or not a param was dropped
    const kept = [...u.searchParams].filter(([k]) => !DROP_PARAMS.test(k));
    const search = kept.length ? '?' + new URLSearchParams(kept).toString() : '';
    const hash = u.hash.includes('/') ? u.hash : '';
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host.replace(/^www\./, '')}${path}${search}${hash}`;
  } catch {
    return url;
  }
}

export const hostOf = (/** @type {string} */ url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

/** @returns {Promise<{ topics: Record<string, Topic>, pages: Page[] }>} */
export async function loadAll() {
  const d = await chrome.storage.local.get(null);
  const pages = Object.entries(d).filter(([k]) => k.startsWith('p:')).map(([, v]) => /** @type {Page} */ (v));
  return { topics: /** @type {Record<string, Topic>} */ (d.topics || {}), pages };
}

/** @returns {Promise<Page | undefined>} */
export async function getPage(/** @type {string} */ key) {
  return /** @type {Page | undefined} */ ((await chrome.storage.local.get('p:' + key))['p:' + key]);
}

/** @returns {Promise<Record<string, Topic>>} */
export async function getTopics() {
  return /** @type {Record<string, Topic>} */ ((await chrome.storage.local.get('topics')).topics || {});
}

/** A tab we reopened, waiting to finish loading. One session key per tab so
 *  concurrent loads don't overwrite each other.
 *  @typedef {{ key: string, restore: boolean, discard: boolean }} PendingJob */
/** @returns {Promise<PendingJob | undefined>} */
export async function getJob(/** @type {number} */ tabId) {
  return /** @type {PendingJob | undefined} */ ((await chrome.storage.session.get('job:' + tabId))['job:' + tabId]);
}
export const setJob = (/** @type {number} */ tabId, /** @type {PendingJob} */ job) => chrome.storage.session.set({ ['job:' + tabId]: job });
export const clearJob = (/** @type {number} */ tabId) => chrome.storage.session.remove('job:' + tabId);

export const putPage = (/** @type {Page} */ p) => chrome.storage.local.set({ ['p:' + p.key]: p });
export const deletePage = (/** @type {string} */ key) => chrome.storage.local.remove('p:' + key);
export const putTopics = (/** @type {Record<string, Topic>} */ t) => chrome.storage.local.set({ topics: t });

/** Load the snapshot (seed/topics.json, made from data/topics.json) into an empty store. */
export async function seedIfEmpty() {
  const { topics } = await chrome.storage.local.get('topics');
  if (topics) return false;
  /** @type {{ area: string, topic: string, items: { url: string, title: string }[] }[]} */
  const seed = await (await fetch(chrome.runtime.getURL('seed/topics.json'))).json();
  /** @type {Record<string, Topic>} */ const t = {};
  /** @type {Record<string, Page>} */ const pages = {};
  const now = Date.now();
  const open = new Set((await chrome.tabs.query({})).map((t) => keyOf(t.url || '')));
  seed.forEach((s, i) => {
    const id = 't' + i;
    t[id] = { id, area: s.area, name: s.topic, order: i };
    for (const it of s.items) {
      const key = keyOf(it.url);
      pages['p:' + key] = { key, url: it.url, title: it.title, topic: id, addedAt: now, ...(open.has(key) ? {} : { parkedAt: now }) };
    }
  });
  await chrome.storage.local.set({ topics: t, ...pages });
  return true;
}
