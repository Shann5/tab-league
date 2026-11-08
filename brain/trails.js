/**
 * @typedef {Object} Tab
 * @property {number} id
 * @property {string} url
 * @property {string} title
 * @property {number|null|undefined} [openerTabId]
 * @property {number} openedAt
 * @property {string|null|undefined} [query]
 */

/** @param {Tab} a @param {Tab} b */
const cmp = (a, b) => a.openedAt - b.openedAt || a.id - b.id;

/**
 * Group tabs into research trails (opener chains), replayable in order.
 * @param {Tab[]} tabs
 * @returns {number[][]}
 */
export function trails(tabs) {
  /** @type {Map<number, Tab>} */
  const byId = new Map();
  for (const t of tabs) byId.set(t.id, t);
  /** @param {Tab} t @returns {Tab | undefined} */
  const parent = (t) =>
    t.openerTabId != null ? byId.get(t.openerTabId) : undefined;
  /** @type {Map<number, Tab>} */
  const rootOf = new Map();
  for (const t of tabs) {
    /** @type {Tab[]} */
    const path = [];
    const onPath = new Set();
    let cur = t;
    /** @type {Tab | undefined} */
    let r;
    for (;;) {
      if (rootOf.has(cur.id)) { r = rootOf.get(cur.id); break; }
      if (onPath.has(cur.id)) {
        const cycle = path.slice(path.indexOf(cur));
        r = cycle.reduce((m, x) => (cmp(x, m) < 0 ? x : m));
        break;
      }
      onPath.add(cur.id);
      path.push(cur);
      const p = parent(cur);
      if (!p) { r = cur; break; }
      cur = p;
    }
    for (const x of path) rootOf.set(x.id, /** @type {Tab} */ (r));
  }
  /** @type {Map<Tab, Tab[]>} */
  const groups = new Map();
  for (const t of tabs) {
    const r = /** @type {Tab} */ (rootOf.get(t.id));
    const g = groups.get(r);
    if (g) g.push(t); else groups.set(r, [t]);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.length >= 2)
    .sort(([a], [b]) => cmp(a, b))
    .map(([, g]) => g.sort(cmp).map((t) => t.id));
}

/**
 * Explain why a tab is open.
 * @param {Tab[]} tabs
 * @param {number} tabId
 * @returns {string}
 */
export function whyOpen(tabs, tabId) {
  /** @type {Map<number, Tab>} */
  const byId = new Map();
  for (const t of tabs) byId.set(t.id, t);
  const start = byId.get(tabId);
  if (!start) throw new RangeError(`Unknown tab id: ${tabId}`);
  if (start.query) return `Searched "${start.query}"`;
  /** @param {Tab} t @returns {Tab | undefined} */
  const parent = (t) =>
    t.openerTabId != null ? byId.get(t.openerTabId) : undefined;
  const parts = [];
  const seen = new Set([start.id]);
  let p = parent(start);
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    parts.push(`opened from "${p.title === "" || p.title == null ? p.url : p.title}"`);
    if (p.query) {
      parts.push(`searched "${p.query}"`);
      break;
    }
    p = parent(p);
  }
  if (!parts.length) return "Opened directly";
  const s = parts.join(" ← ");
  return s[0].toUpperCase() + s.slice(1);
}
