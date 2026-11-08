# tab-league

People keep hundreds of tabs open because closing one feels like losing a thought. tab-league makes closing safe:
every tab goes into a personal archive and graph (topics, deadlines, people, papers, reading), so the tab itself
can go. It is local-first: stdlib Python and plain JavaScript, no frameworks, no accounts, nothing leaves your
machine except the page fetches you run yourself.

Views, served at http://localhost:8765:

- **Action desk**: deadlines on a timeline, forms to finish, job applications, and dates found in your archive
  (coming up / already happened, computed live against today).
- **Reading room**: saved reading on calm shelves, with "pick one for me".
- **Full archive**: every page by topic, with arXiv papers enriched.
- **Graph**: topics as clusters, pages as nodes, people as rings (one per person, merged across X, LinkedIn,
  GitHub and Google Scholar).
- **Ask your tabs**: instant keyword search.

Every row and every section has done / remove / undo, and "close its tab" closes the real tab in Chrome.

## Try the demo

Needs macOS (for Chrome integration; the views themselves work anywhere), Python 3.10+ and Node 22+.

```sh
git clone <this repo> tab-league && cd tab-league
python3 demo.py                               # a fictional 32-tab snapshot → data/, builds every view
python3 serve.py                              # open http://localhost:8765
```

For development and tests:

```sh
npm install                                   # TypeScript (type checks) and playwright-core (tests)
npx playwright-core install chromium          # Chrome for Testing, for the browser tests
npm run check && npm run test:brain && npm run test:views && npm test
```

## Use it on your own tabs

```sh
python3 snss.py                               # reads Chrome's session files → data/tabs.json (all profiles)
```

(`demo.py` won't overwrite it afterwards.) Then sort your tabs into topics. **This part is curated, not
automatic**: `organize.py` holds a hand-written `TOPICS` list (area, topic name, indices into `data/tabs.json`),
and `desk.py` holds the Action desk and Reading room lists (`DATED`, `TRIP`, `ROLLING`, `JOBS`, `READING`, ...),
also by index. Both currently describe the demo. Replace them with your own; a coding agent does this well:

> Read AGENTS.md. My snapshot is in data/tabs.json. Replace TOPICS in organize.py with topics for my tabs (dead
> pages and logins go in a "Close" area), then replace the lists in desk.py from my tabs: forms with deadlines
> (check the dates on the live pages), rolling forms, job applications, reading shelves.

Then build and serve:

```sh
python3 organize.py                           # data/topics.json, out/index.html, out/bookmarks.html
python3 fetch_meta.py                         # fetches each page once for descriptions → data/meta.json
python3 desk.py && python3 graph.py && python3 search.py
python3 serve.py                              # http://localhost:8765 ; --install starts it at login
```

Your snapshot (`data/`) and the pages built from it (`out/*.html`) are your browsing history. They are
gitignored; keep it that way, and don't paste them into issues.

## Keeping notes for your agents

This repository stores what agents need to know in three files, so any agent (Claude Code, Codex, Cursor, ...)
can pick up the work without the conversation that produced it:

| File | Holds | Changes |
|---|---|---|
| `AGENTS.md` | The stable map: what each file does, commands, conventions, gotchas, current state, lessons. | Edited in place; kept short and true. |
| `CLAUDE.md` | One line, `@AGENTS.md`, so Claude Code reads the same file (one source of truth). | Never. |
| `IDEAS.md` | The running log: thesis, dated findings, opinions (with who holds them), decisions, backlog, open questions. | New entries at the top of each section, dated. |

The rule for agents, stated at the top of `AGENTS.md`: when you learn something the next agent would need, write
it down before you finish: a stable fact or a gotcha goes in `AGENTS.md`; a finding, decision or idea goes in
`IDEAS.md` with a date. Commit it with the code it explains.

**When you adopt this repository, make the notes yours:**

1. Keep `AGENTS.md`'s map, commands, conventions and gotchas (they describe the code), and update its **State**
   section as your copy changes.
2. In `IDEAS.md`, keep what still fits (thesis, backlog, architecture) and start your own Findings, Decisions and
   Open questions.
3. Opinions in `IDEAS.md` name who holds them; add your own the same way, so agents know whose call each one is.
4. Personal facts that should not travel with the code (your accounts, your preferences across projects) belong
   in your agent's own memory or user-level instructions, not in the repository.

**To use the same system in another project:** create `AGENTS.md` with the sections above (what this is, map,
commands, conventions, gotchas, state, lessons) and the note-keeping rule at the top, `CLAUDE.md` containing
`@AGENTS.md`, and a dated log like `IDEAS.md`. Ask your agent to fill them from the code and keep them current.

## Status

An early, personal tool that works day to day on macOS with Chrome. The Chrome extension in `extension/` (park
and reopen topics, save form drafts, unload background tabs) is paused: it needs developer mode or a Web Store
listing. See `IDEAS.md` for the backlog and open questions.

## License

MIT, see `LICENSE`.
