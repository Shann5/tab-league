// Memory budget: which tabs to unload or archive, and the "tab debt" number.

const DAY = 86_400_000;

/** @param {any} t */
const isProtected = (t) => !!(t.pinned || t.audible || t.active || t.hasForm);

/** @param {any} a @param {any} b */
const byAge = (a, b) => a.lastAccessed - b.lastAccessed || a.id - b.id;

/**
 * @param {Array<{id:number,lastAccessed:number,pinned?:boolean,audible?:boolean,active?:boolean,discarded?:boolean,hasForm?:boolean}>} tabs
 * @param {number} now
 * @param {{cap?: number, archiveAfterDays?: number}} [options]
 * @returns {{archive: number[], unload: number[]}}
 */
export function plan(tabs, now, { cap = 25, archiveAfterDays = 7 } = {}) {
  if (!Number.isInteger(cap) || cap < 0) {
    throw new RangeError('cap must be a non-negative integer');
  }
  const limit = archiveAfterDays * DAY;
  const arch = [];
  const rest = [];
  for (const t of tabs) {
    if (!isProtected(t) && now - t.lastAccessed >= limit) arch.push(t);
    else rest.push(t);
  }
  arch.sort(byAge);
  const loaded = rest.filter((t) => !t.discarded);
  const extra = Math.max(0, loaded.length - cap);
  const unload = loaded
    .filter((t) => !isProtected(t))
    .sort(byAge)
    .slice(0, extra)
    .map((t) => t.id);
  return { archive: arch.map((t) => t.id), unload };
}

/**
 * @param {Array<{id:number,lastAccessed:number,pinned?:boolean}>} tabs
 * @param {number} now
 * @param {number} [days]
 * @returns {number}
 */
export function tabDebt(tabs, now, days = 7) {
  const limit = days * DAY;
  return tabs.filter((t) => !t.pinned && now - t.lastAccessed >= limit).length;
}
