# new-csl-dash — Cobblestone Learning Repository Hub (v2)

A rebuild of [`cobblestonelearning.github.io`](https://github.com/CobblestoneLearning/cobblestonelearning.github.io),
developed in its own repo so it can be previewed side by side with the live hub.

🌐 **Preview:** https://cobblestonelearning.github.io/new-csl-dash/
🌐 **Current live hub:** https://cobblestonelearning.github.io/

## Why a rebuild

The account grew from ~19 repositories to **109**, and the v1 page broke in three ways at once:

1. **The language donut collapsed into one blue block.** It counted *primary language per repo*.
   PHP (67) plus "Hack" (11 — GitHub mis-detecting single-file PHP snippets) is 78 of 109 in a
   single colour. Weighted by actual bytes the estate is a real spread: PHP 39% · HTML 28% ·
   JavaScript 18% · CSS 12% · SCSS 2%. The data was always interesting; the metric threw it away.
2. **88 repos silently fell into "Other".** The new repos carry `cat-plugin`, `cat-theme` and
   `cat-snippet` topics; v1's `CATEGORIES` had none of them.
3. **65 of 109 repos are one-file WPCode snippets** rendered as full-size cards, drowning the
   actual projects.

## What this version does

- **The Mortarboard** — the hero is a WebGL scene of the Cobblestone mark itself. The logo is a
  graduation cap paved with cobblestones, so the cap is paved here with the repositories: one
  stone each, footprint and height from bytes of source, colour from type, districts from type,
  tint from how recently it was pushed. Hover a stone for the repo, click to open it, and
  **search to lift the matches out of the paving** — type `learndash` and 44 stones rise while
  the rest grey off. Nothing in the geometry is decorative: delete a repo and a stone goes.
- **A flat tile map** below keeps the same information in a precise, keyboard-reachable grid,
  and is what you get when WebGL isn't available.
- **Metrics that survive growth** — repository count, exact source size, platforms integrated,
  and how many things you can open right here. No vanity zeros, no time-series (see below).
- **Two separate dimensions.** *Type* (plugin / theme / snippet / app / site) drives every chart
  colour. *Purpose* (reporting / authoring / translation / platform / ops / tools / web) drives
  the Staff-view sections. Both resolve from GitHub topics first, then `CURATED`.
- **A real snippet library** — the 65 `csl-snippet-*` repos get their own faceted section,
  filterable by client site and by platform, instead of competing with the projects.
- **Staff / Developer views**, sharpened: staff get purpose sections, plain-language summaries and
  "Works with" chips; developers get a dense table with type, language, size, clone and files.
- **⌘K command palette** over every repository.
- **Progressive enrichment** — after the repo list lands, `/languages` is fetched per repo
  (6 at a time, cached in `sessionStorage` keyed by `pushed_at`) so the composition chart is
  measured exactly rather than estimated.

### Why there is no activity-over-time chart

There was going to be one. GitHub says 89 of the 109 repos were created in a single month —
because they were bulk-imported, not authored then. Any cadence histogram would be one giant bar
telling a lie. Platform coverage and client-site coverage replaced it; both vary honestly.

## Architecture

No build step, no package manager, no server code. Four files:

| File | What it holds |
|---|---|
| `index.html` | Semantic shell only — no logic, no styles |
| `assets/theme.css` | The whole design system: tokens, components, responsive rules |
| `assets/config.js` | **Data, not logic** — types, purposes, platforms, sites, `CURATED`, palettes |
| `assets/app.js` | Everything else, as one IIFE |
| `assets/stage.js` | The WebGL mortarboard (ES module, three.js) |
| `assets/vendor/three.module.min.js` | three.js r169, vendored |

v1 was a single 195 KB `index.html`; this is split so the config a human actually edits
(`CURATED`, `PLATFORMS`) is findable. Tailwind is gone — the CSS is hand-written against
design tokens, which is smaller and gives exact control over the editorial layout.

**three.js is vendored, not pulled from a CDN.** This page holds an OAuth token, so it takes no
runtime third-party script it can't pin exactly. `stage.js` is an ES module and loads separately
from `app.js`; they meet over `window.CBHub` and a `cb:data` event rather than an import, and
either can arrive first. If WebGL is missing or the module throws, `mountStage()` returns null
and the page is unaffected.

### The stage's layout

`squarify()` is a standard squarified treemap. It runs twice — once over the type districts, then
again inside each district over its repos — which is what produces the irregular, hand-laid stone
pattern the logo has while keeping area proportional to code size. Heights use a `^0.34` power
curve rather than a log: a log flattened a 12 KB snippet to 65% of a 4 MB repo and the snippet
district rendered as one blue slab, which was the exact problem this rebuild exists to fix.

### Adding or re-filing a project

Either works; the topic is preferred because the repo stays the source of truth.

- **On GitHub:** add a `cat-<purpose>` topic (`cat-reporting`, `cat-authoring`,
  `cat-translation`, `cat-tools`, `cat-web`, `cat-ops`, `cat-platform`) and/or a type topic
  (`cat-plugin`, `cat-theme`, `cat-snippet`).
- **In `assets/config.js`:** add a line to `CURATED` keyed by the lowercased repo name, with any
  of `type`, `purpose`, `summary`, `works`, `demo`.

Summaries are plain and factual — internal description, never marketing. Boilerplate lead-ins
("A WordPress plugin by Cobblestone Learning.") are stripped automatically by `cleanDesc()`.

## Chart palette

The categorical theme is `#0072B2 · #D48200 · #00916A · #C4719B · #5BB8EC`, assigned in fixed
order and never cycled. It was chosen by running the validator, not by eye:

```
node scripts/validate_palette.js "#0072B2,#D48200,#00916A,#C4719B,#5BB8EC" --mode light --pairs all
  [PASS] Lightness band · [PASS] Chroma floor · [PASS] CVD separation (all pairs)
  [PASS] Normal-vision floor · [WARN] Contrast vs surface on 2 slots
```

The contrast WARN is relieved as the method requires: every chart ships a visible legend with the
values and percentages next to it, so identity is never carried by colour alone. Slot 1 is
visually indistinguishable from brand blue `#0074B4`, so the palette stays on-brand.

Language colours deliberately do **not** use GitHub's palette — several of those (JavaScript
`#f1e05a`) fail contrast on white.

## Authentication

Public by default; signing in adds the private repositories the viewer can reach.

**This repo ships no auth backend, on purpose.** `/new-csl-dash/` is served from the same origin
as the live hub, so it reuses both existing pieces unchanged:

- **`redirect_uri` is `location.origin + '/callback.html'`** — the callback page owned by the
  `cobblestonelearning.github.io` repo. GitHub pins an OAuth app to one callback URL, and
  `/new-csl-dash/callback.html` is not a subdirectory of `/callback.html`, so reusing the root
  one is the only thing that works without registering a second OAuth app.
- **The Cloudflare Worker's CORS allow-list is an *origin*,** not a path, so it already accepts
  requests from here. No worker change, no new secret.

Token handling matches v1: held in `sessionStorage` (`cb_gh_token`) so a refresh doesn't force a
2FA re-verification, validated against `/user` on load, cleared on sign-out or on failure.
`localStorage` holds only the view preference — **never** the token.

`CobblestoneLearning` is a personal **user** account, not an organisation: list repos via
`/users/cobblestonelearning/repos` and, when signed in, merge `/user/repos?visibility=private`
filtered to repos this account owns. `/orgs/CobblestoneLearning/...` 404s.

### Demos and the privacy model

A repo with a `demo` path in `CURATED` gets an "Open demo" action. The file is fetched through
the **authenticated** Contents API and rendered in a sandboxed `<iframe srcdoc>` — so a private
repo's demo only resolves for a signed-in viewer with access. **Never enable GitHub Pages on a
private repo to shortcut this**; Pages is public and would expose the whole repository.

Markdown (`README.md`, `CLREADME.md`) is rendered by GitHub's markup endpoints and then passed
through `sanitizeHtml()` before it touches `innerHTML` — GitHub already sanitises, but this page
holds an OAuth token, so actives are stripped again on our side.

## Local preview

Open `index.html`, or serve the folder (`python3 -m http.server`). Unauthenticated you'll see the
5 public repos, which is not enough to judge layout.

To see it at full signed-in scale without an OAuth round-trip, generate a local harness that
replays the real API. It writes `__mock.js` + `preview-offline.html`, **both gitignored** — the
mock embeds private repository names and descriptions and must never be committed to this public
repo. See `CLAUDE.md` for the generator.

## Deploying

```bash
./tools/bump-assets.sh   # stamps assets/*.css|js with a content hash
git commit -am "…" && git push
```

GitHub Pages serves `main` at `/new-csl-dash/`; there is no CI stage. The bump step matters:
Pages sends `cache-control: max-age=600`, so without a fresh hash in the URL a browser keeps
running the previous CSS/JS for ten minutes after you deploy.

*Learning. Creativity. Trust.*
