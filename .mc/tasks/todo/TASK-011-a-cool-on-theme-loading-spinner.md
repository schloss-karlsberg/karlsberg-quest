---
id: TASK-011
aliases:
- TASK-011
title: A cool, on-theme loading spinner
slug: a-cool-on-theme-loading-spinner
status: todo
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- ux
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-23
---

# A cool, on-theme loading spinner

> Core dev team task (not community).

## Description

Loading should look like part of the game, not like a default web page.

### Where loading happens today

| Spot | Code | What it looks like |
| --- | --- | --- |
| Before the JS bundle runs | `index.html` | nothing: `<body>` has only an empty `#app`, so the first paint is blank (theme colour `#14110d`) |
| Boot: terrain / game data | `src/boot.ts` (`loadGameData(..., (d, n) => title.setProgress(d / n))`), `src/ui/title.ts` (`setProgress`, `setFailed`, `setReady`) | an italic text line "Gelände wird geladen … {pct} %" (`title.loading` in `src/i18n/de.ts`) with a thin ink progress rule under it (`.kq-title-page .loading` in `src/ui/styles.css`); `role="progressbar"` with `aria-valuenow`; buttons disabled until ready |
| Era change / time travel | `src/boot.ts` (`era:change` → `assets.prefetchEra(to)`), shift effect `src/systems/fx/shift/` (`prewarm.ts`, `warm.ts`) | no loader: assets are prefetched in the background, the shift effect covers the switch |
| Area / lazy model loads | `src/assets/` (`AssetLoader.loadArea`, lazy `instance()` / `model()` in scenery, characters, fauna) | nothing; models pop in when ready |
| X-ray point cloud | `src/systems/tools/index.ts`, `xray.ts` | a toast "Punktwolke wird geladen …" (`tools.xray.loading`) |
| HUD busy state | `HUD.busy()` in `src/ui/hud.ts` | a reason flag, no visual loader |

### Proposal

One small, reusable loader that fits the game's identity, matched to `docs/ART-DIRECTION.md` and the
UI tokens in `src/ui/styles.css` (`--paper`, `--ink`, `--ink-soft`, `--brass`, `--accent`, `--night`;
fonts IM Fell English / IM Fell English SC, Caveat). Ideas to pick or combine:
- the Karlsberg palace silhouette drawing itself (SVG stroke-dashoffset), in ink on paper;
- a pocket-watch hand or clock face for the time travel;
- the brass compass (Bussole) needle settling, which already belongs to the story;
- a rotating chestnut, or a ducal crown / monogram.

Behaviour:
- **Determinate** where progress is known (boot data via `setProgress`, `loadArea` progress): the
  drawing fills with the percentage; **indeterminate** otherwise (gentle loop).
- **Inline in `index.html`** (a few lines of SVG + CSS) so it shows on the first paint, before the
  bundle loads; the title then takes it over (no flash, no layout shift).
- Use it for boot, era change (only if a wait is actually noticeable), lazy area loads, and the x-ray load.

### Constraints
- Pure CSS / SVG, no new dependency, tiny (proposal: < 3 KB inline).
- Reduced motion: a static frame or a slow opacity pulse (`prefers-reduced-motion` before JS; the
  `reducedMotion` setting after).
- Works on mobile; the night background (`--night`) and the paper title page both need to look right.
- Accessible: `role="progressbar"` with `aria-valuenow` when determinate, `aria-busy="true"` on the
  region, a German label like "Lädt …" (keep "Gelände wird geladen … {pct} %" where it fits).
- One component (e.g. `src/ui/loader.ts` + CSS) shared by every spot.

## Acceptance Criteria
- [ ] The loader is used in all loading spots listed above (or the task explains why a spot needs none)
- [ ] Visible on the first paint from `index.html`, before the JS bundle; no layout shift when the title takes over
- [ ] Real progress where known, indeterminate otherwise
- [ ] Reduced motion respected; mobile and both backgrounds checked
- [ ] Accessible (progressbar role / aria-busy, German label)
- [ ] GPU or mobile screenshot, or a short GIF, in the PR
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Notes
- `index.html`'s meta description still says "Erkundungs-Rätselspiel" (old concept); tracked in TASK-007.
