// One node per person: recognise profile pages and merge the same person's profiles.

const X_RESERVED = new Set(['home', 'explore', 'search', 'i', 'settings', 'messages', 'notifications', 'compose', 'hashtag', 'intent', 'login']);
const GH_RESERVED = new Set(['topics', 'features', 'explore', 'marketplace', 'settings', 'login', 'about', 'pricing', 'sponsors', 'notifications', 'new', 'orgs']);

/** @param {string | null | undefined} s @returns {string | null} */
function clean(s) {
  if (s == null) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}

/**
 * Recognise a profile page.
 * @param {string} url
 * @param {string} title
 * @returns {{site: string, handle: string, name: string|null} | null}
 */
export function profile(url, title) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  const parts = u.pathname.split('/').filter(Boolean);
  const t = typeof title === 'string' ? title : '';

  if (host === 'x.com' || host === 'twitter.com') {
    if (parts.length !== 1 || X_RESERVED.has(parts[0].toLowerCase())) return null;
    const i = t.indexOf(' (@');
    return { site: 'x', handle: parts[0], name: i >= 0 ? clean(t.slice(0, i)) : null };
  }
  if (host === 'linkedin.com') {
    if (parts.length !== 2 || parts[0] !== 'in') return null;
    let name = null;
    const tt = t.trimEnd();
    if (tt.endsWith('| LinkedIn')) {
      const a = tt.indexOf(' - ');
      const b = tt.indexOf(' | ');
      const cuts = [a, b].filter((x) => x >= 0);
      name = clean(tt.slice(0, Math.min(...cuts)));
    }
    return { site: 'linkedin', handle: parts[1], name };
  }
  if (host === 'github.com') {
    if (parts.length !== 1 || GH_RESERVED.has(parts[0].toLowerCase())) return null;
    let name = null;
    const o = t.indexOf('(');
    const c = t.lastIndexOf(')');
    if (o >= 0 && c > o) name = clean(t.slice(o + 1, c));
    return { site: 'github', handle: parts[0], name };
  }
  if (host === 'scholar.google.com') {
    if (parts.length !== 1 || parts[0] !== 'citations') return null;
    const user = u.searchParams.get('user');
    if (!user) return null;
    const i = t.indexOf(' - Google Scholar');
    return { site: 'scholar', handle: user, name: i >= 0 ? clean(t.slice(0, i)) : null };
  }
  return null;
}

/**
 * Key that makes two spellings of a name equal.
 * @param {string} name
 * @returns {string}
 */
export function nameKey(name) {
  return String(name).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

/**
 * Group profile pages by person.
 * @param {{url: string, title: string}[]} pages
 * @returns {{name: string, pages: number[]}[]}
 */
export function groupPeople(pages) {
  /** @type {{i: number, site: string, handle: string, name: string | null, key: string}[]} */
  const items = [];
  pages.forEach((p, i) => {
    const pr = profile(p.url, p.title);
    if (pr) items.push({ i, ...pr, key: pr.name ? nameKey(pr.name) : '' });
  });
  const parent = items.map((_, k) => k);
  /** @param {number} k @returns {number} */
  const find = (k) => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const x = items[a], y = items[b];
      const same = (x.key && x.key === y.key) ||
        (x.site === y.site && x.handle.toLowerCase() === y.handle.toLowerCase());
      if (same) parent[find(b)] = find(a);
    }
  }
  /** @type {Map<number, typeof items>} */
  const groups = new Map();
  items.forEach((it, k) => {
    const r = find(k);
    const g = groups.get(r);
    if (g) g.push(it); else groups.set(r, [it]);
  });
  const out = [];
  for (const g of groups.values()) {
    const named = g.find((it) => it.name);
    out.push({ name: named?.name ?? '@' + g[0].handle, pages: g.map((it) => it.i) });
  }
  return out.sort((a, b) => a.pages[0] - b.pages[0]);
}
