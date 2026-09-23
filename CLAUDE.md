# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**`new-csl-dash` — the v2 rebuild of the Cobblestone Learning Repository Hub.** An internal,
Cobblestone-branded page that indexes the `cobblestonelearning` GitHub account (109 repos:
plugins, themes, WPCode snippets, tools, sites). Deployed as a GitHub Pages **project site** at
https://cobblestonelearning.github.io/new-csl-dash/ — a sub-path of the same origin as the live
v1 hub (`cobblestonelearning.github.io`). That shared origin is load-bearing; see Authentication.

**It is NOT a marketing site.** No sales copy, no "request a quote", no services band. Summaries
are plain and factual. It is Cobblestone-branded (logo, palette, Montserrat) — keep the identity,
not marketing.

`README.md` has the full rationale, architecture and palette provenance. Read it before changing
charts, auth or the data model — several decisions there are deliberate and non-obvious.

## Deploying / previewing

- **Deploy:** run `./tools/bump-assets.sh`, then commit to `main` and push. Pages serves `main`
  at `/new-csl-dash/`; no CI stage.
- **Always run `tools/bump-assets.sh` after touching `assets/`.** Pages serves assets with
  `cache-control: max-age=600`, so without a new content hash in the URL, browsers keep running
  the old CSS/JS for ten minutes and you will debug a deploy that already worked.
- **Local:** open `index.html` or `python3 -m http.server`. It also resolves under MAMP at
  `http://localhost:8888/Cobblestone/new-csl-dash/`.
- Unauthenticated you only get the 5 public repos — **not enough to judge any layout decision.**

### Full-scale offline preview (do this before judging a visual change)

Generates `__mock.js` + `preview-offline.html`, which replay the real API at 109-repo scale so
the page renders as a signed-in user sees it. **Both are gitignored and must stay that way** —
the mock embeds private repo names and descriptions, and this is a public repo.

```bash
gh api "/user/repos?per_page=100&visibility=all&affiliation=owner&page=1" > /tmp/p1.json
gh api "/user/repos?per_page=100&visibility=all&affiliation=owner&page=2" > /tmp/p2.json
# keep only cobblestonelearning-owned rows, fetch /languages per repo, then write
# __mock.js: a fetch() shim over api.github.com + a seeded sessionStorage cb_gh_token,
# and preview-offline.html: index.html with <script src="__mock.js"> before config.js.
```

Regenerate `preview-offline.html` after **any** edit to `index.html` — it is a copy, not a link.
`tools/bump-assets.sh` does this for you.

## Architecture

No build step, no package manager, no server code.

| File | Rule |
|---|---|
| `index.html` | Semantic shell only. No logic, no inline styles beyond grid overrides. |
| `assets/theme.css` | The whole design system. Tokens in `:root`; everything else is a component class. |
| `assets/config.js` | **Data, not logic.** Types, purposes, platforms, sites, `CURATED`, palettes, `AUTH_CONFIG`. |
| `assets/app.js` | All behaviour, one IIFE, numbered sections. |

**Two orthogonal dimensions — don't merge them:**
- **TYPE** (`plugin` / `snippet` / `theme` / `app` / `site`) → the colour in every chart and on
  the Map. Resolves from topics → `CURATED.type` → description heuristic.
- **PURPOSE** (`reporting` / `authoring` / `translation` / `platform` / `ops` / `tools` / `web`)
  → the Staff-view sections. Resolves from `TOPIC_PURPOSE` → `CURATED.purpose` → type fallback.

To file a project: add a `cat-<id>` topic on GitHub *or* a `CURATED` line. Prefer the topic.

## Things that will bite you

- **No Tailwind.** Don't reintroduce it. The CSS is hand-written against tokens.
- **`[hidden] { display: none !important; }` is load-bearing** — `.btn` is `inline-flex`, which
  otherwise beats the `hidden` attribute and leaves the signed-out button visible while signed in.
- **Nothing that matters may depend on an animation.** `.reveal` hiding is scoped to `.js`, set
  inline before first paint; a backgrounded tab skips the choreography entirely (IntersectionObserver
  reports nothing and timers are throttled when a tab is hidden). Screenshots of a hidden tab show a
  stale frame — check `getComputedStyle(...).opacity`, not pixels, when verifying this.
- **`countUp()` writes the final value before animating.** `requestAnimationFrame` is throttled
  in background tabs; without that the hero figures render as "—" forever. Don't "simplify" it.
- **Never add a time-series chart** of repo creation or pushes. 89 of 109 repos were bulk-imported
  in one month, so any cadence chart is one bar and a lie. Platform/site coverage replaced it.
- **Fold `Hack` into `PHP`** (`LANG_ALIASES`). GitHub mis-detects the single-file PHP snippets;
  losing this puts 11 repos in a phantom language.
- **Measure languages by bytes, not by primary language per repo.** Counting repos is exactly
  what made v1's chart a single blue block.
- **`wireCards(root)` takes a root.** Calling it unscoped re-binds already-bound cards and opens
  the modal twice.
- **`sanitizeHtml()` before any `innerHTML`** of API content. GitHub sanitises its markup output,
  but this page holds an OAuth token, so actives get stripped again here.
- **Chart palette is validated, not chosen.** If you change a chart colour, re-run the dataviz
  validator (`--pairs all`, light mode) and keep every check passing. Command + results are in
  `README.md`.

## Authentication

- **`CobblestoneLearning` is a personal USER account, not an org.** Use
  `/users/cobblestonelearning/repos`; signed in, merge `/user/repos?visibility=private` filtered
  to repos it owns. `/orgs/CobblestoneLearning/...` 404s. A private-fetch failure must never
  break the public list.
- **This repo has no auth backend and should not grow one.** It reuses the live hub's
  `/callback.html` (same origin) and the existing Cloudflare Worker (CORS is origin-scoped, not
  path-scoped). GitHub pins an OAuth app to one callback URL and `/new-csl-dash/callback.html` is
  not a subdirectory of `/callback.html` — so a local copy of the callback would *not* work.
- Token lives in `sessionStorage` (`cb_gh_token`), validated via `/user` on load.
  `localStorage` holds only `cb2_view`. **Never** commit a token or secret — this repo is public.
- **Never enable GitHub Pages on a private repo.** Pages is public. Private demos load through
  the authenticated Contents API into a sandboxed iframe; that *is* the privacy model.

## Branding

Cobblestone-branded output. Before changing colours, typography, logos or layout, invoke the
**`cobblestone-brand`** skill for the authoritative assets rather than guessing. Note the two
accessibility deviations already baked in: load-bearing muted text is `#6B6B6B` (not `#939393`)
and white-on-gradient uses `#0074B4→#005C90`, both for AA contrast.
