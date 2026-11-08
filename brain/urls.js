// Canonical URLs and duplicate tab detection.

const DROP = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid',
  'si', 'ref', 'ref_src', '_hsenc', '_hsmi', 'mkt_tok',
]);
const ARXIV_RE = /^\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?$/;

/**
 * Returns the key two tabs share when they show the same page.
 * @param {string} url
 * @returns {string}
 */
export function canonical(url) {
  const trimmed = String(url).trim();
  let u;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return trimmed;

  let host = u.hostname;
  if (host.startsWith('www.') && host.length > 4) host = host.slice(4);
  else if (host.startsWith('m.') && host.length > 2) host = host.slice(2);
  let port = u.port;
  if (port === '80' || port === '443') port = '';
  if (u.port === '' && /^https?:\/\/[^/?#]*:(80|443)(?=[/?#]|$)/i.test(trimmed)) port = '';

  if (host === 'twitter.com') host = 'x.com';

  let path = u.pathname;
  const params = new URLSearchParams(u.search);
  if (host === 'youtu.be') {
    const id = path.split('/')[1];
    if (id) {
      host = 'youtube.com';
      path = '/watch';
      params.append('v', id);
    }
  }

  if (host === 'arxiv.org' || host === 'export.arxiv.org') {
    const m = ARXIV_RE.exec(path);
    if (m) return 'https://arxiv.org/abs/' + m[1];
  }

  for (const name of [...params.keys()]) {
    const l = name.toLowerCase();
    if (l.startsWith('utm_') || DROP.has(l)) params.delete(name);
  }
  params.sort();
  const query = params.toString();

  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  const hash = u.hash;
  const keep = hash.length > 1 && (hash[1] === '/' || hash[1] === '!');

  return 'https://' + host + (port ? ':' + port : '') + path +
    (query ? '?' + query : '') + (keep ? hash : '');
}

/**
 * Groups indices of urls whose canonical forms are equal (groups of 2+ only).
 * @param {string[]} urls
 * @returns {number[][]}
 */
export function duplicateGroups(urls) {
  const map = new Map();
  urls.forEach((x, i) => {
    const k = canonical(x);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  });
  return [...map.values()].filter((g) => g.length > 1);
}
