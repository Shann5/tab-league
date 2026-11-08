# Tab League — ideas, opinions, decisions

A running log. New entries go at the top of each section, dated. Opinions are marked with who holds them
("author" is the project's maintainer; "Claude" is the coding agent). When you adopt this repository, clear the
Findings, Decisions and Open questions that don't apply to you and start your own (see README.md).

---

## Thesis (2026-10-11)

People keep hundreds of tabs open because **closing a tab feels like losing a thought**. So the tool's job is not
to automate browsing; it's to make closing tabs safe. Every tab becomes a node in a personal graph (topic, trail,
deadline, person, paper). Once it's in the graph, the tab can go, and Chrome's memory goes with it.

The author's own snapshot that started this: 444 tabs and ~8.5 GB, even with Memory Saver on max. Of those, 15
were dead pages or logins, 33 were for events that had already passed, 29 were exact duplicates, and roughly 100
were "read later" pages that never got read. Cleaning up by hand with the archive as a safety net took it to 192
tabs and 4.85 GB. Lesson: **a reliable archive is what makes closing feel safe.** That is the product.

## Findings

- **2026-11-07: the local brain, and checking it against real data.** Five backlog items became pure ES modules
  in `brain/` (canonical URLs and duplicates, event dates incl. Chinese dates, a memory-budget plan, one node per
  person, research trails), written by an agent team against hidden acceptance tests, then wired into the views
  through `serve.py` (`/brain/*.js`) so results follow today's date with no rebuild. The tests passed, yet on a
  real snapshot the modules added less than expected: URL canonicalisation found no near-duplicates beyond exact
  ones (it matters on live tabs), and three real misses showed up (below, under "Known misses"). Check features
  against real data before building UI on them.
- **2026-11-07: a planner → engineer → reviewer agent team did no better than one engineer** on these
  well-specified tasks (5/5 each, at twice the cost), and its reviewers approved after 0-1 checks. The judge didn't
  type-check, so `tsc --strict` errors got through: run `npm run check`.
- **2026-10-13: done / remove / undo without an extension.** `serve.py` (stdlib) serves `out/` and saves marks to
  `data/status.json`; `out/status.js` adds ✓ / × / Undo / "Close its tab" to every view (graph: hover + D / X).
  Close-tab goes through AppleScript. Reason: enabling Chrome developer mode in a profile that holds sensitive
  extensions and logins is a risk the author didn't want to take.
- **2026-10-12: "Ask your tabs" v0** (`search.py`): instant keyword search over titles, descriptions, topics,
  domains and arXiv abstracts; case- and accent-insensitive, works for Chinese, `#q=` links, no server and no
  libraries. Its limit showed at once: "speculative decoding" finds nothing when the abstract says "speculative
  sampling". Keyword search only finds the words you remember; that gap is where Claude (or embeddings) should go.
- **2026-10-12: extension e2e test** (`npm test`): under Playwright, `chrome.tabs.discard` makes Chrome crash
  (SEGV), while the same build discards fine without Playwright. The test stubs discard and simulates the
  click-in as activate + reload.
- **2026-10-11: Chrome scripting talks to the newest Chrome instance, not your browser.** Playwright/automation
  browsers launched from `/Applications/Google Chrome.app` capture AppleScript, so it showed "1 window" or "0
  windows". After quitting them, all windows were visible. Any tool that controls Chrome from outside has to handle
  this, which is another point for the extension.
- **2026-10-11: "Continue where you left off" was not set** in any profile. Restarting Chrome could have lost
  hundreds of tabs. A tool should check this setting before suggesting a restart.

### Known misses (next work)

- `dates`: a yearless date in a past news story ("3月5日") is inferred as next year, so an old story shows as upcoming.
- `people`: an X profile whose tab title is empty can't merge with the same person's LinkedIn page; matching a
  handle against a name (or a LinkedIn slug) would fix it.
- `people`: organisations count as people (an event organiser's X account).

## Opinions

- **Write new code in JavaScript** (author, 2026-10-11): plain ES modules with JSDoc types, checked by `tsc`, no
  build step. Python scripts already written stay.
- **Fix first, build second** (author, 2026-10-11). Concrete relief now (close, sort, deadlines) beats prototype features.
- **Why "agentic browsers" disappoint** (Claude): they put the effort into *doing* (an agent clicking through pages
  for you), but the real pain is *attention and memory*: what was I doing, why is this open, what's due. Most of
  them also make you **replace** your browser and lose your logins and extensions, and they tend to be
  cloud-first, so your browsing history lives on someone else's server.
- **Augment Chrome, don't replace it** (Claude, 2026-10-11): people's extensions and logins rule out building on
  WebKit or Tauri for daily use. A browser of our own can come later as a *reading mode* once the graph is proven.
- **Minimal libraries** (author): plain JS in the extension and pages, Python stdlib for the local side, no
  framework and no build step. Part taste, part memory budget: the tool must not become what it's fighting.
- **Local-first, and Claude sees only titles and URLs by default** (Claude). Page text is opt-in, per topic.

## Idea backlog

Tags show which part of the experience each idea serves.

### Capture
- **Record why a tab was opened.** If it came from a search, store the query. If another tab opened it, store that
  link (Chrome gives us the opener). This answers "why is this open?" for free. (`brain/trails.js`)
- **"Close with a note":** on close, an optional one-line note on why it mattered. The note becomes the page's
  summary in the graph.
- **Don't trust Chrome's AppleScript to list tabs.** It saw 1 window out of 14 in testing. Read Chrome's session
  files (`snss.py`) for a bootstrap snapshot, and use the extension's tabs API when it's live.

### Organize
- **Pages of different kinds get different treatment:** *paper*: fetch arXiv metadata and link the paper to its
  code repo; *form*: never auto-close it; *event*: archive automatically once the date passes (`brain/dates.js`);
  *job*: put it in the applications list; *person*: merge the same person's profiles (`brain/people.js`).
- **Find deadlines automatically.** Pull dates from the page and its structured data, and check Devpost's API.
- **Name windows as projects.** A window usually *is* a project. Have Claude suggest a name, then use it for the
  tab group and the graph topic.

### Free memory
- **A memory budget.** Cap the number of loaded tabs (say 25). Past the cap, the least-recently-used tab is
  unloaded, and after N days it's saved to the graph and closed. Never touch pinned tabs, forms, or tabs playing
  audio. (`brain/budget.js`)
- **A weekly 10-minute triage ritual.** Each Sunday, show what went stale, what's due this week, and what you read.
- **A "tab debt" number in the toolbar**: open-but-untouched tabs older than 7 days, as a gentle nudge.

### Retrieve
- **"Resume project":** reopen a topic as a tab group whose tabs stay unloaded until clicked.
- **Ask your tabs:** "the paper about speculative decoding I had open last week". Keyword search first; Claude on top later.
- **Reading room as a habit:** a cap of 3 items a day, a chosen time, "pick one for me", marking things read.

### Graph view
- Topics are clusters, and opener chains are *research trails* you can replay in order.
- People, papers and deadlines are first-class nodes, not just URLs.
- Hand-rolled SVG force layout, no d3.

## Architecture options

| Option | Verdict |
|---|---|
| A. Chrome extension per profile (side panel) + small local "brain" that merges profiles and calls Claude | **Recommended** |
| B. Companion app only (session files + Chrome scripting) | Read-only. Fine for bootstrap snapshots, not for control. |
| C. Own browser (Tauri / WebKit) | Later, as a reading mode only. Extensions and logins block it as a daily driver. |

## Decisions

- 2026-11-07 — The brain is JavaScript (`brain/`), so the same code runs in the pages, Node and the extension.
- 2026-10-13 — Done / remove / undo ship without the extension (served locally by `serve.py`).
- 2026-10-11 — Forms and dated items get their own Action desk. Readings get a calm Reading room grouped by category.
- 2026-10-11 — Minimal dependencies: stdlib Python, vanilla JS.
- 2026-10-11 — Extension v0.1 drafted in `extension/` (park/open by topic, saves drafts — only fields you changed,
  never passwords or card numbers — unloads background tabs, reminds you when you revisit a parked page). Paused:
  cleanup first. If deeper tab control is wanted later: an unlisted Chrome Web Store listing, and drop
  `<all_urls>` + draft saving from the manifest.

## Open questions

- Which experience to build first: auto-park, resume project, search, or the graph view?
- Should the graph live in SQLite only, or also export to Markdown/Obsidian?
- How much page text to send to Claude, if any? Per-topic opt-in?
- One extension per profile syncing to the local brain, or a single "work" profile?
