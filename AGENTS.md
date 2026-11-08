# tab-league: notes for agents

Read this first, then `IDEAS.md` (thesis, decisions, findings log, backlog). This file is the stable map; IDEAS.md
is the running log. Keep both current: when you learn something a later agent would need, add it here
(conventions, gotchas) or to IDEAS.md (findings, decisions, dated), and commit it with the code it explains.
Setting the project up for a new person: README.md ("Use it on your own tabs", "Keeping notes for your agents").

## What this is

A local-first tool that makes closing browser tabs feel safe: every tab goes into a personal archive and graph
(topic, trail, deadline, person, paper), so the tab itself can go.

## Map

| Path | What it is |
|---|---|
| `demo/`, `demo.py` | A fictional 32-tab snapshot; `python3 demo.py` copies it into `data/` and builds every view. It refuses to overwrite a real snapshot. |
| `organize.py` | Groups `data/tabs.json` into topics → `data/topics.json`, `out/index.html` (full archive), `out/bookmarks.html`. Run it first: the others read `topics.json`. |
| `desk.py` | → `out/actions.html` (Action desk: deadlines, forms, "Dates found in your archive") and `out/reading.html` (Reading room). Curation is hand-written lists of indices into `tabs.json`. |
| `graph.py` | → `out/graph.html`: topics as clusters, pages as nodes, people as rings; hand-rolled SVG force layout. |
| `search.py` | → `out/search.html`: "Ask your tabs", keyword search, index embedded in the page. |
| `serve.py` | Serves `out/` and `/brain/*.js` at http://localhost:8765; saves done/removed marks to `data/status.json`; `/api/close` closes tabs via AppleScript. `--install` makes it a login item. |
| `out/status.js` | Done / remove / undo on every row and every section heading (`window.TG`). The only tracked file in `out/`. |
| `brain/` | The local brain: pure, dependency-free ES modules (`urls`, `dates`, `budget`, `people`, `trails`). Run in the pages, in Node and (later) the extension. |
| `extension/` | Chrome extension v0.1 (park/open by topic, drafts, unloading), paused. `extension/seed/topics.json` is written by `demo.py`. |
| `chrome_tabs.py`, `snss.py`, `fetch_meta.py` | Read/close live tabs (AppleScript), read Chrome session files → `data/tabs.json`, fetch page descriptions → `data/meta.json`. |
| `tests/` | `node:test` tests for `brain/`: `*.acceptance.test.mjs` (the specs' acceptance tests) and the modules' own tests. |
| `test/` | Browser tests: `extension.test.mjs` (extension e2e), `views.test.mjs` (views that use `brain/`; needs the demo built). |

## Commands

```sh
python3 demo.py               # demo snapshot → data/, builds out/ (for your own tabs, see README.md)
python3 organize.py && python3 desk.py && python3 graph.py && python3 search.py   # rebuild out/ from data/
python3 serve.py              # http://localhost:8765 (pages import /brain/*.js, so use this, not file://)
npm run check                 # tsc --strict over extension/ and brain/
npm run test:brain            # tests for brain/
npm run test:views            # headless Chrome on the demo: Action desk + graph, and their fallbacks
npm test                      # extension e2e (seeds from extension/seed/topics.json)
```

Run `npm run check` and `npm run test:brain` before committing changes to `brain/`; `npm run test:views` after
changing a view, `status.js` or `serve.py`. The browser tests expect the demo in `data/` (`python3 demo.py`) and
Chrome for Testing (`npx playwright-core install chromium`).

## Conventions (see IDEAS.md → Opinions / Decisions)

- **New code in JavaScript**: plain ES modules, JSDoc types, checked by `tsc --strict`, no build step, no
  dependencies. Existing Python generators stay (stdlib only). Logic shared by pages, Node and the extension
  goes in `brain/` as pure functions over plain data shaped like `chrome.tabs.Tab` (`lastAccessed` in ms,
  `openerTabId`, `pinned`, `discarded`). Dates cross APIs as `YYYY-MM-DD` strings, never `Date` objects.
- **Minimal libraries**: no frameworks, no d3; hand-rolled SVG.
- **Augment Chrome, don't replace it**; **local-first**: Claude sees titles and URLs by default, page text is opt-in.
- **Fix first, build second**: concrete relief (close, sort, deadlines) beats prototype features.
- Pages that use `brain/` import it with a guarded dynamic `import('/brain/x.js')` and must render as before
  when it fails (opened as a file).

## Gotchas

- **`data/` and `out/*.html` are a person's browsing history** once they run this on their own tabs. They are
  gitignored; never commit them, paste them into issues or send them to external services. Test with the demo.
- **Never post to `/api/status` or `/api/close` in tests**: they write the user's marks and close real tabs.
  `views.test.mjs` fakes `/api/status` with `page.route` where it clicks.
- **Chrome scripting talks to the newest Chrome instance.** Playwright/automation Chromes launched from
  `Google Chrome.app` capture AppleScript; quit them before using `chrome_tabs.py`. Tests use *Chrome for
  Testing* (a different app), which is safe.
- Under Playwright, `chrome.tabs.discard` crashes Chrome (SEGV); the extension test stubs it.
- `node --test tests/` (a directory) misbehaves on Node 22: pass files (`tests/*.test.mjs`), as the npm scripts do.
- `serve.py` only serves `/brain/<lowercase>.js`; other paths under `/brain/` are 404 by design.
- The page generators embed data at build time: rebuild `out/` after changing `data/` or a generator.
- The snapshot date shown in the views is `data/tabs.json`'s modification time.

## State

- `brain/` built and tested. Wired in: `dates` → Action desk, `people` → graph. Not wired: `urls` (matters on live
  tabs), `budget` and `trails` (need live tab data from the extension).
- Known misses on real data: see IDEAS.md → Findings → Known misses.
- The extension is paused (developer-mode concerns); the views work without it.

## Lessons for agents working here

- Write the spec and acceptance tests first; they stay as regression tests.
- Check every feature against a real snapshot before building UI on it: tests can pass while real data shows
  little value or wrong results.
- For everyday work here, one agent writing tests is enough; a multi-role agent team added cost, not quality.
- A passing test suite isn't type-safe: run `npm run check`.
