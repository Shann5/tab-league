// Event dates: find calendar dates in text and classify events as past/upcoming.
// Dates are ISO strings YYYY-MM-DD everywhere.

/** @type {Record<string, number>} */
const MONTH_NAMES = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const M = '(?<![A-Za-z])(?:January|February|March|April|May|June|July|August|September|October|November|December|Sept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?![A-Za-z])\\.?';
const D = '(?<!\\d)\\d{1,2}(?:st|nd|rd|th)?(?![\\dA-Za-z])';
const DASH = '\\s*[-\u2013\u2014]\\s*';
const Y = '(?<!\\d)\\d{4}(?!\\d)';

const ISO = '(?<!\\d)(\\d{4})[-/](\\d{2})[-/](\\d{2})(?!\\d)';
const DAYFIRST = `(${D})\\s+(${M})\\s+(${Y})`;
const MONTHFIRST = `(${M})\\s+(${D})(?:${DASH}(?:(${M})\\s+)?(${D}))?(?:,?\\s*(${Y}))?`;
const CHINESE = '(?:(?<!\\d)(\\d{4})年)?(?<!\\d)(\\d{1,2})月(\\d{1,2})日';

const RE = new RegExp(`${ISO}|${DAYFIRST}|${MONTHFIRST}|${CHINESE}`, 'gi');

/** @param {string} s */
function monthNum(s) {
  return MONTH_NAMES[s.replace(/\.$/, '').toLowerCase()];
}

/** @param {string} s */
function dayNum(s) {
  return parseInt(s, 10);
}

/** @param {number} y @param {number} m 1-12 @param {number} d */
function isValid(y, m, d) {
  if (!(m >= 1 && m <= 12) || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= dim[m - 1];
}

/** @param {number} n @param {number} w */
function pad(n, w) {
  return String(n).padStart(w, '0');
}

/** @param {number} y @param {number} m @param {number} d */
function iso(y, m, d) {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** @param {number} y @param {number} m @param {number} d */
function dayCount(y, m, d) {
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** @param {string} s @returns {[number, number, number]} */
function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return [y, m, d];
}

/**
 * Year for a date with no year: today's year, or next if >180 days before today.
 * @param {number} m @param {number} d @param {string} today
 */
function inferYear(m, d, today) {
  const [ty, tm, td] = parseIso(today);
  if (dayCount(ty, tm, td) - dayCount(ty, m, d) > 180) return ty + 1;
  return ty;
}

/**
 * Find calendar dates in text.
 * @param {string} text
 * @param {string} today ISO date YYYY-MM-DD
 * @returns {string[]} sorted ascending ISO dates, no duplicates
 */
export function findDates(text, today) {
  /** @type {Set<string>} */
  const out = new Set();
  /** @param {number} y @param {number} m @param {number} d */
  const add = (y, m, d) => {
    if (isValid(y, m, d)) out.add(iso(y, m, d));
  };
  for (const g of String(text).matchAll(RE)) {
    if (g[1] !== undefined) {
      add(+g[1], +g[2], +g[3]);
    } else if (g[4] !== undefined) {
      add(+g[6], monthNum(g[5]), dayNum(g[4]));
    } else if (g[7] !== undefined) {
      const m1 = monthNum(g[7]);
      const d1 = dayNum(g[8]);
      const hasEnd = g[10] !== undefined;
      const m2 = g[9] !== undefined ? monthNum(g[9]) : m1;
      const d2 = hasEnd ? dayNum(g[10]) : 0;
      const cross = m1 > m2;
      const year = g[11] !== undefined ? +g[11] : null;
      if (!hasEnd) {
        add(year ?? inferYear(m1, d1, today), m1, d1);
      } else if (year !== null) {
        add(cross ? year - 1 : year, m1, d1);
        add(year, m2, d2);
      } else if (cross) {
        const y2 = inferYear(m2, d2, today);
        add(y2 - 1, m1, d1);
        add(y2, m2, d2);
      } else {
        const y = inferYear(m1, d1, today);
        add(y, m1, d1);
        add(y, m2, d2);
      }
    } else if (g[13] !== undefined) {
      const m = +g[13];
      const d = +g[14];
      add(g[12] !== undefined ? +g[12] : inferYear(m, d, today), m, d);
    }
  }
  return [...out].sort();
}

/**
 * Classify an event by its latest date.
 * @param {string[]} dates ISO dates
 * @param {string} today ISO date
 * @returns {"undated"|"past"|"today"|"upcoming"}
 */
export function eventStatus(dates, today) {
  if (!dates || dates.length === 0) return 'undated';
  const latest = dates.reduce((a, b) => (b > a ? b : a));
  if (latest < today) return 'past';
  if (latest === today) return 'today';
  return 'upcoming';
}
