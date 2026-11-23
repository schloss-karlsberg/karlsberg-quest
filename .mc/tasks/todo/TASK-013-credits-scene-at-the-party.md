---
id: TASK-013
aliases:
- TASK-013
title: Credits scene at the party
slug: credits-scene-at-the-party
status: todo
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- story
- ui
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-23
---

# Credits scene at the party

> Core dev team task (not community).

## Description

At the end, during the party on today's palace plateau after **each** of the three endings, a credits
sequence lists **everyone who contributed**: people, the asset authors, and the tools and libraries.

### What exists today
- The party: `src/systems/party/` (`index.ts`, `runtime.ts`, `strip.ts`, `credits.ts`): after every
  ending the story emits `party:set` and `party:credits`; a credits **strip** runs over the party while
  the camera circles and lingers on the people (`ORBIT` in `credits.ts`). Its lines come from
  `content/party/credits.json` (`{ "lines": string[] }`, project, data licences, fiction note), else the
  3-line `PLACEHOLDER_LINES`. Test: `tests/story-party.test.ts`.
- The old credits page: `credits()` in `src/systems/story/endings/ui.ts` (~line 248; sources, data
  licences, fiction text, fonts; strings `story.credits.*` in `src/systems/story/strings.ts`), used when
  there is no party and by `kq.story.credits()`.
- Asset credits: `public/assets/LICENSES.json` (`assets[]` with `name`, `author`, `source`, `licence`;
  `voices[]` for the synthetic MOSS clips), checked by `tests/assets.test.ts`.
- Tools and libraries: `package.json` (three.js; Vite, TypeScript, Vitest, Playwright, glTF-Transform
  as dev tools), fonts IM Fell English and Caveat (OFL), MOSS-TTS v1.5 for the voices, Blender for characters.

### Contributor list: one file
- New file **`content/credits.json`**: one list of people, each entry with a `name`, a German `role`
  and optional `links` (e.g. GitHub profile, website). Keep the format trivial so contributors can add
  themselves in their PR (a short comment or README line in the file's folder explains it); validate it
  in `pnpm validate` (`scripts/validate-content.ts`) or a unit test (name and role required, links are URLs).
- Seed entries, exactly as given by the owner:
  - "Jan Eric Rippel": "Inspiration der Tour, Stimme des Spielers"
  - "Sebastian Heußer": "Idee, Konzept und Entwicklung"
  - "more to come" (a closing line, e.g. rendered as „und alle, die noch kommen“; keep the owner's intent)
- The contribute skill's ship phase mentions adding yourself to `content/credits.json` (one line in
  `ship.md`, identical in `.claude/skills/contribute/` and `.agents/skills/contribute/`; done with this task's creation).

### The sequence
- Order: title, people (`content/credits.json`), asset authors (generated from
  `public/assets/LICENSES.json`: unique authors grouped by source, e.g. Poly Haven, ambientCG, Kenney,
  Quaternius, poly.pizza, all CC0; plus the voices' model), tools and libraries, data sources and
  licences (the existing `content/party/credits.json` lines), the fiction note, "Danke fürs Spielen".
  Generated at build time or at runtime from the JSON files, never hand-copied, so a new asset or
  contributor shows up automatically.
- Plays over the party after each ending (museum, burn, keep), using the existing strip / camera or
  replacing the strip with a fuller roll; the old credits page reuses the same data.
- **Skippable**: a visible "Überspringen" button; **Enter or Escape** closes it; the party / free roam continues.
- **Mobile-friendly**: readable at phone width, a tap target for skipping, no overlap with touch controls.
- **Reduced motion** (`settings.reducedMotion` / `prefers-reduced-motion`): a static list the player
  scrolls themselves, no auto-scroll, no camera orbit.
- German UI text.

### Rule
- **Do not name the real tour guide.** The guide stays the placeholder until written consent exists.

## Acceptance Criteria
- [ ] `content/credits.json` exists with the three seed entries; format checked by validate or a test
- [ ] Credits run at the party after all three endings and list people, asset authors (from `LICENSES.json`), tools and libraries, data sources
- [ ] Adding an entry to `content/credits.json` or `LICENSES.json` shows up without code changes
- [ ] Skippable; Enter / Escape closes it; works on mobile; reduced motion shows a static scrolling list
- [ ] Every named person has agreed to be listed.
- [ ] The real tour guide is not named anywhere in the credits
- [ ] e2e: an ending spec reaches the credits and skips them (`--workers=1`); unit tests for the generated author list
- [ ] Screenshot (desktop and phone width) in the PR
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Notes
- Builds on the party feature (`docs/design/tour/systems.md` §6, `content/bible/06-enden.md` §8).
- Keep one source per fact: the people in `content/credits.json`, assets in `LICENSES.json`, data / fiction lines in `content/party/credits.json`.
