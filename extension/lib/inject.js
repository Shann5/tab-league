// @ts-check
// Functions injected into pages with chrome.scripting.executeScript.
// Each must be self-contained: no imports, no outer variables.

/** Snapshot what you changed (not what the page pre-filled) and how far you
 *  scrolled. Never captures passwords, card numbers, CVVs, one-time codes,
 *  hidden or file inputs. */
export function captureState() {
  const SKIP_TYPE = /^(password|hidden|file|submit|button|reset|image)$/i;
  const SENSITIVE = /(pass|pwd|card|cc-|ccnum|cvv|cvc|csc|ssn|otp|one-time|\bpin\b|iban|routing|security.?code)/i;
  /** @param {Element} el */
  const sensitive = (el) => SENSITIVE.test(['autocomplete', 'name', 'id', 'placeholder', 'aria-label']
    .map((a) => el.getAttribute(a) || '').join(' '));
  /** @param {Element} el */
  const selectorFor = (el) => {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    const name = el.getAttribute('name');
    if (name) {
      let s = `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
      if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) s += `[value="${CSS.escape(el.value)}"]`;
      if (document.querySelectorAll(s).length === 1) return s;
    }
    const parts = [];
    let n = /** @type {Element | null} */ (el);
    for (; n && n !== document.body && parts.length < 12; n = n.parentElement) {
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n?.tagName) : [];
      parts.unshift(n.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ''));
    }
    // anchored at <body> when we reached it; otherwise a descendant path
    return (n === document.body ? 'body > ' : '') + parts.join(' > ');
  };
  /** @type {{ sel: string, kind: 'value' | 'checked', value: string }[]} */
  const fields = [];
  for (const el of document.querySelectorAll('input, textarea, select')) {
    if (sensitive(el)) continue;
    if (el instanceof HTMLInputElement) {
      if (SKIP_TYPE.test(el.type)) continue;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked !== el.defaultChecked) fields.push({ sel: selectorFor(el), kind: 'checked', value: el.checked ? '1' : '0' });
      } else if (el.value !== el.defaultValue) fields.push({ sel: selectorFor(el), kind: 'value', value: el.value });
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.value !== el.defaultValue) fields.push({ sel: selectorFor(el), kind: 'value', value: el.value });
    } else if (el instanceof HTMLSelectElement) {
      if ([...el.options].some((o) => o.selected !== o.defaultSelected)) fields.push({ sel: selectorFor(el), kind: 'value', value: el.value });
    }
  }
  return { scrollY: Math.round(window.scrollY), fields };
}

/** Put a captured state back. Retries for a few seconds because single-page
 *  apps render their forms after "load". Uses the native value setter so
 *  React/Vue notice the change. Resolves to how many fields were filled. */
export async function restoreState(/** @type {{ scrollY: number, fields: { sel: string, kind: string, value: string }[] }} */ state) {
  const done = new Set();
  const deadline = Date.now() + 6000;
  const wait = () => new Promise((r) => setTimeout(r, 300));
  for (;;) {
    state.fields.forEach((f, i) => {
      if (done.has(i)) return;
      const el = document.querySelector(f.sel);
      if (f.kind === 'checked' && el instanceof HTMLInputElement) {
        if (el.checked !== (f.value === '1')) el.click();
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
        setter ? setter.call(el, f.value) : (el.value = f.value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else return;
      done.add(i);
    });
    if (done.size === state.fields.length || Date.now() > deadline) break;
    await wait();
  }
  if (state.scrollY) {
    while (document.documentElement.scrollHeight < state.scrollY + innerHeight && Date.now() < deadline) await wait();
    window.scrollTo({ top: state.scrollY });
  }
  return done.size;
}

/** A small note in the corner: "You saved this in Career › Job search". */
export function showToast(/** @type {{ key: string, path: string, when: string, draft: number, note?: string }} */ info) {
  document.getElementById('tableague-toast')?.remove();
  const host = document.createElement('div');
  host.id = 'tableague-toast';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .t{position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;padding:12px 14px;border-radius:10px;
         background:#2a2824;color:#f5f0e6;font:13px/1.45 -apple-system,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.25)}
      b{font-weight:600} .m{opacity:.7;margin-top:2px} .n{margin-top:6px;font-style:italic;opacity:.85}
      .r{display:flex;gap:8px;margin-top:10px} button{font:inherit;border:0;border-radius:6px;padding:5px 10px;cursor:pointer}
      .p{background:#d4a373;color:#1b1916} .s{background:transparent;color:#f5f0e6;opacity:.7}
    </style>
    <div class="t" role="status"><div>Saved in <b></b></div><div class="m"></div><div class="n" hidden></div>
      <div class="r"><button class="p" hidden>Restore draft</button><button class="s">Dismiss</button></div></div>`;
  /** @type {HTMLElement} */ (root.querySelector('b')).textContent = info.path;
  /** @type {HTMLElement} */ (root.querySelector('.m')).textContent =
    `Parked ${info.when}` + (info.draft ? ` · draft with ${info.draft} field${info.draft > 1 ? 's' : ''}` : '');
  if (info.note) { const n = /** @type {HTMLElement} */ (root.querySelector('.n')); n.hidden = false; n.textContent = info.note; }
  const restore = /** @type {HTMLButtonElement} */ (root.querySelector('.p'));
  if (info.draft) {
    restore.hidden = false;
    restore.onclick = () => { chrome.runtime.sendMessage({ type: 'restore', key: info.key }); host.remove(); };
  }
  /** @type {HTMLButtonElement} */ (root.querySelector('.s')).onclick = () => host.remove();
  document.documentElement.appendChild(host);
  setTimeout(() => host.remove(), 15000);
}
