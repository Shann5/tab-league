// @ts-check
import { loadAll, putPage, deletePage, putTopics, keyOf, seedIfEmpty } from './lib/store.js';
import { parkPages, openPages, focusOrOpen } from './lib/actions.js';

/** @typedef {import('./lib/store.js').Page} Page */
/** @typedef {import('./lib/store.js').Topic} Topic */

const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
const q = /** @type {HTMLInputElement} */ ($('#q'));

/** @type {{ topics: Record<string, Topic>, pages: Page[] }} */
let data = { topics: {}, pages: [] };
/** @type {Map<string, chrome.tabs.Tab>} */
let live = new Map();

/** @type {Set<string>} */
const expanded = new Set((() => { try { return JSON.parse(localStorage.getItem('expanded') || '[]'); } catch { return []; } })());
const saveExpanded = () => { try { localStorage.setItem('expanded', JSON.stringify([...expanded])); } catch {} };

/** Tiny element builder: h('button', { class: 'x', onclick }, 'text', child) */
function h(/** @type {string} */ tag, /** @type {Record<string, any>} */ props = {}, /** @type {(Node | string | null | undefined | false | 0)[]} */ ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c) el.append(c);
  return el;
}

const favicon = (/** @type {string} */ url) => chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=16`);
const ago = (/** @type {number} */ t) => {
  const d = Math.round((Date.now() - t) / 864e5);
  return d < 1 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d}d ago` : `${Math.round(d / 30)}mo ago`;
};
const sortedTopics = () => Object.values(data.topics).sort((a, b) => a.order - b.order);

function topicSelect(/** @type {string} */ label, /** @type {string | undefined} */ current, /** @type {(id: string) => void} */ onPick) {
  const sel = /** @type {HTMLSelectElement} */ (h('select', { title: label, onchange: () => sel.value && onPick(sel.value) }, h('option', { value: '' }, label)));
  /** @type {Record<string, HTMLElement>} */ const groups = {};
  for (const t of sortedTopics()) {
    groups[t.area] ||= sel.appendChild(h('optgroup', { label: t.area }));
    groups[t.area].append(h('option', { value: t.id, selected: t.id === current }, t.name));
  }
  return sel;
}

async function refresh() {
  await seedIfEmpty();
  data = await loadAll();
  live = new Map();
  for (const t of await chrome.tabs.query({})) if (t.url) live.set(keyOf(t.url), t);
  render();
}

function pageRow(/** @type {Page} */ p) {
  const isLive = live.has(p.key);
  const draft = p.state?.fields.length || 0;
  return h('li', { class: 'page' + (isLive ? ' live' : ''), 'data-search': `${p.title} ${p.url} ${p.note || ''}`.toLowerCase() },
    h('img', { src: favicon(p.url), alt: '' }),
    h('button', { class: 'title', title: p.url, onclick: () => focusOrOpen(p) }, p.title || p.url),
    h('span', { class: 'acts' },
      isLive && h('button', { title: 'Save draft and close', onclick: () => parkPages([p]) }, 'park'),
      h('button', { title: 'Add a note', onclick: () => editNote(p) }, '✎'),
      topicSelect('move', p.topic, (id) => putPage({ ...p, topic: id })),
      h('button', { title: 'Forget this page', onclick: () => deletePage(p.key) }, '×')),
    h('span', { class: 'meta' },
      h('span', {}, new URL(p.url).hostname.replace(/^www\./, '')),
      !!p.parkedAt && !isLive && h('span', {}, `parked ${ago(p.parkedAt)}`),
      draft > 0 && h('span', { class: 'tag-draft' }, `draft · ${draft} field${draft > 1 ? 's' : ''}`)),
    p.note ? h('div', { class: 'note' }, p.note) : null);
}

function editNote(/** @type {Page} */ p) {
  const note = prompt('Why does this page matter?', p.note || '');
  if (note !== null) putPage({ ...p, note: note.trim() || undefined });
}

function render() {
  const { pages } = data;
  const byTopic = Map.groupBy(pages, (p) => p.topic);
  const savedOpen = pages.filter((p) => live.has(p.key)).length;
  $('#stats').textContent = `${live.size} tabs open · ${pages.length} pages saved · ${savedOpen} of them open now`;

  // Inbox: open tabs that aren't in the graph yet.
  const saved = new Set(pages.map((p) => p.key));
  const loose = [...live.values()].filter((t) => /^https?:/.test(t.url || '') && !saved.has(keyOf(t.url || '')));
  const inbox = $('#inbox');
  inbox.replaceChildren();
  if (loose.length) {
    inbox.append(h('h2', {}, `Not saved yet · ${loose.length}`));
    for (const t of loose) {
      const url = t.url || '';
      inbox.append(h('div', { class: 'page', 'data-search': `${t.title} ${url}`.toLowerCase() },
        h('img', { src: favicon(url), alt: '' }),
        h('button', { class: 'title', title: url, onclick: () => t.id != null && chrome.tabs.update(t.id, { active: true }) }, t.title || url),
        topicSelect('Save to…', undefined, (topic) =>
          putPage({ key: keyOf(url), url, title: t.title || url, topic, addedAt: Date.now() }))));
    }
  }

  // Topics, grouped by area.
  const main = $('#topics');
  main.replaceChildren();
  let area = '';
  const tpl = /** @type {HTMLTemplateElement} */ ($('#topicRow'));
  for (const t of sortedTopics()) {
    const ps = (byTopic.get(t.id) || []).sort((a, b) => Number(live.has(b.key)) - Number(live.has(a.key)));
    if (t.area !== area) { area = t.area; main.append(h('h2', { 'data-area': area }, area)); }
    const node = /** @type {HTMLElement} */ (/** @type {DocumentFragment} */ (tpl.content.cloneNode(true)).firstElementChild);
    const nLive = ps.filter((p) => live.has(p.key)).length;
    node.classList.toggle('expanded', expanded.has(t.id));
    node.dataset.area = t.area;
    const name = /** @type {HTMLElement} */ (node.querySelector('.name'));
    name.textContent = t.name;
    name.onclick = () => { expanded.has(t.id) ? expanded.delete(t.id) : expanded.add(t.id); saveExpanded(); node.classList.toggle('expanded'); };
    /** @type {HTMLElement} */ (node.querySelector('.count')).replaceChildren(...(nLive ? [h('b', {}, `${nLive} open`), ' / '] : []), `${ps.length}`);
    const open = /** @type {HTMLButtonElement} */ (node.querySelector('.open'));
    const park = /** @type {HTMLButtonElement} */ (node.querySelector('.park'));
    open.disabled = !ps.length;
    park.disabled = !nLive;
    open.onclick = async () => { open.textContent = '…'; await openPages(ps, t); open.textContent = 'Open'; };
    park.onclick = async () => { park.textContent = '…'; await parkPages(ps.filter((p) => live.has(p.key))); park.textContent = 'Park'; };
    /** @type {HTMLElement} */ (node.querySelector('.pages')).append(...ps.map(pageRow));
    main.append(node);
  }
  applySearch();
}

function applySearch() {
  const s = q.value.trim().toLowerCase();
  document.body.classList.toggle('searching', !!s);
  for (const el of document.querySelectorAll('[data-search]')) el.classList.toggle('hide', !!s && !(/** @type {HTMLElement} */ (el).dataset.search || '').includes(s));
  for (const t of document.querySelectorAll('.topic')) t.classList.toggle('hide', !!s && !t.querySelector('.page:not(.hide)'));
  for (const a of document.querySelectorAll('#topics h2')) {
    const area = /** @type {HTMLElement} */ (a).dataset.area;
    a.classList.toggle('hide', !!s && ![...document.querySelectorAll(`.topic[data-area="${CSS.escape(area || '')}"]`)].some((t) => !t.classList.contains('hide')));
  }
}

q.addEventListener('input', applySearch);

$('#newTopic').onclick = async () => {
  const name = prompt('Topic name');
  if (!name?.trim()) return;
  const areas = [...new Set(sortedTopics().map((t) => t.area))];
  const area = prompt(`Area (${areas.join(', ')})`, areas[0] || 'Work');
  if (!area?.trim()) return;
  const id = 't' + Date.now();
  await putTopics({ ...data.topics, [id]: { id, name: name.trim(), area: area.trim(), order: Date.now() } });
};

$('#export').onclick = async () => {
  const blob = new Blob([JSON.stringify(await chrome.storage.local.get(null), null, 1)], { type: 'application/json' });
  h('a', { href: URL.createObjectURL(blob), download: `tab-league-${new Date().toISOString().slice(0, 10)}.json` }).click();
};

// Keep the panel in sync with tabs and storage (debounced).
let timer = 0;
const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
chrome.tabs.onCreated.addListener(soon);
chrome.tabs.onRemoved.addListener(soon);
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url || info.status === 'complete' || info.title) soon(); });
chrome.storage.onChanged.addListener(soon);

refresh();
