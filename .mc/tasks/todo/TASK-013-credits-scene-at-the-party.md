---
id: TASK-013
aliases:
- TASK-013
title: Credits scene at the party
slug: credits-scene-at-the-party
status: in-progress
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
updated: 2026-11-24
---

# Credits scene at the party

> Core dev team task (not community).

## Description

At the end, during the party on today's palace plateau after **each** of the three endings, a credits
sequence lists **everyone who contributed**: people, the asset authors, and the tools and libraries.

### Baseline before TASK-013
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
- [x] `content/credits.json` exists with the three seed entries; format checked by validate or a test
- [x] Credits run at the party after all three endings and list people, asset authors (from `LICENSES.json`), tools and libraries, data sources
- [x] Adding an entry to `content/credits.json` or `LICENSES.json` shows up without code changes
- [ ] Skippable; Enter / Escape closes it; works on mobile; reduced motion shows a static scrolling list
- [x] Every named person has agreed to be listed.
- [x] The real tour guide is not named anywhere in the credits
- [ ] e2e: an ending spec reaches the credits and skips them (`--workers=1`); unit tests for the generated author list
- [ ] Screenshot (desktop and phone width) in the PR
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Plan

_Status: approved 2026-11-24_

**Approach:** Extend the party strip used by museum, burn and keep. The storyboard shot `e-fest-abspann` already captures it through `[data-testid="party-credits"]`. Give the strip and the existing fallback page `credits()` the same ordered German credits. This uses the current scene and dependencies.

**Files to touch:**

- `content/credits.json`, `content/README.md` — the contributor list, its closing line and a one-line editing example.
- `content/party/credits.json` — project, tools, data licences, fiction note and final thanks.
- `src/systems/party/{credits,index,runtime,strip}.ts`, `src/systems/party/party.css` — assembly, playback, inputs and mobile layout.
- `src/systems/story/endings/ui.ts` — reuse the assembled list on the fallback page.
- `tests/{story-party,party}.test.ts`, `e2e/{party,story}.spec.ts` — content, playback and player-input checks.
- `docs/design/tour/systems.md` §6, `docs/ACTION-RPG.md` §14, `docs/PRD.md` — party behaviour, feature row and PRD changelog entry.

**Steps:**

- [x] 1. Seed `content/credits.json` with the two exact contributor name/role pairs above and a separate closing line, „und alle, die noch kommen“. Validate nonblank names and roles and optional HTTP(S) links in a unit test.
- [x] 2. Assemble title, contributors, asset authors, voice model, tools/libraries, data sources and licences, fiction note and „Danke fürs Spielen“, in that order. Read asset authors from `public/assets/LICENSES.json`, split comma-separated coauthors, trim and deduplicate within each source, and display the names with that source’s licence(s). Preserve collective credits such as MakeHuman Community. Exclude emails, machine paths and the real guide’s name.
- [x] 3. Feed both existing views the assembled credits. Preserve party cues, explicit line overrides, storyboard selectors, the normal camera orbit and movement hand-back.
- [x] 4. Provide a visible, tappable „Überspringen“ button and Enter/Escape dismissal. Return to free roam once. For reduced motion (game setting or OS preference), leave a static, manually scrollable list open until dismissed and suppress the orbit. Keep text and skip clear of touch controls.
- [x] 5. Cover the three ending routes and player inputs. Exercise the real skip button locally in the story spec. Update the party design note, add the ACTION-RPG §14 row and record the behaviour change in the PRD changelog.
- [ ] 6. Run the four gates. The contributor runs browser checks and captures the matching after screenshots outside the sandbox.

**Test plan:**

- Unit tests cover seed validation, multi-author splitting, deduplication within each source, licence display and new fixture entries reaching both views. Check all three ending cues, reduced motion beyond the normal end time, and exactly one `credits:done` on dismissal.
- Run `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. The contributor runs the Vite build externally if blocked in the sandbox.
- External e2e baseline: party, story and smoke. Use the story spec for an ending-to-button-skip path. Use the party spec for Enter, Escape, touch tap, scrolling and free roam. With `&manual`, wait for `window.kq.step` and step the loop to register the party/story hooks before waiting on them. Grep `e2e/` for each selector and hook touched during implementation, trace callers of changed helpers, and list matches and runnable specs in Progress. Add every spec using a changed helper to the external run.

  ```sh
  for spec in party story smoke; do
    scripts/dev/heavy.sh -- pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1 || exit 1
  done
  ```

- Before screenshots are in the main checkout at `test-results/contribute/TASK-013/before-desktop.png` and `before-phone.png`. For the after pair, use `/?notitle&nosave&fresh&manual&party=burn`, wait for the party bodies to be ready, then call `window.kq.step(300)`. Match desktop 1280×720 and phone 844×390 landscape with touch. Portrait shows the rotate prompt. Save `after-desktop.png` and `after-phone.png` alongside the originals for the PR. Check reduced-motion scrolling separately.

**Acceptance criteria coverage** (planned scope)

| Criterion | Coverage |
| --- | --- |
| Seed file and format check | full — step 1 |
| All endings and credit categories | full — all three routes use the shared list, including named asset authors grouped by source with licences. |
| New contributor or manifest entry appears automatically | full — fixture additions exercise both data sources. |
| Skip, mobile and reduced motion | full — step 4 and party input checks |
| Every named person has agreed | full — the owner confirmed the two contributor seeds. Asset bylines reproduce the public CC0 manifest credits. |
| Real tour guide omitted | full — check the credits text in both views. |
| Ending-to-skip e2e and author-list unit tests | full — story spec and grouping fixtures |
| Desktop and phone screenshots in the PR | full — both baselines captured, matching after pair planned. |
| Four passing gates | full — step 6, results pending implementation. |

**Risks:** Escape can also release pointer lock and open pause. Verify that one press dismisses the credits and leaves the player in free roam.

**Open questions:** None.

## Progress

- 2026-11-24 — Plan approved for `feat/task-013-credits-scene`. The contributor captured the desktop and landscape phone baselines on unchanged code.
- 2026-11-24 — Step 1 complete. Added the approved seed entries, the closing line and the editing example. `pnpm exec vitest run tests/credits.test.ts` passed.
- 2026-11-24 — Step 2 complete. Assembled ordered credits from the content files and the asset manifest. The credits unit tests passed with the current manifest and fixture bylines.
- 2026-11-24 — Step 3 complete. Both views use the existing asset loader and the same credits assembly. The fallback page retains the bibliography and detailed data attributions. Typecheck and the four focused unit test files passed. `pnpm validate` was blocked when tsx tried to open its IPC socket (`EPERM`).
- 2026-11-24 — Step 4 implemented. The party strip can be dismissed by button, Enter or Escape. The game consumes a pointer-lock exit during credits as the same dismissal. Reduced motion keeps all lines in a scrollable list without an orbit. The focused unit tests passed, including a run past the animated duration and repeated dismissal.
- 2026-11-24 — Step 5 implemented. The unit tests cover the shared credits data and all ending cues. The story spec adds a manifest author fixture to verify both credits views and clicks the real party skip button. The party spec exercises Enter, Escape with pointer lock and a landscape phone with OS reduced motion. Updated the party systems note, ACTION-RPG §14 and the PRD.
- External e2e (unverified, one worker each via `scripts/dev/heavy.sh`): `e2e/party.spec.ts`, `e2e/story.spec.ts`, `e2e/smoke.spec.ts`. Selector and hook matches: party, story, campaign and `helpers/common.ts`; `pol-flow.spec.ts` exercises the same credits path through `throughParty`. `helpers/k4.ts` also uses that path and is called by campaign and chapter-k4. The edits to test boot helpers are local to party and story. The shared helpers were untouched.
- 2026-11-24 — Step 6 pending external verification. `pnpm typecheck`, `pnpm test` (1,467 tests), `pnpm build` and `mc validate` passed locally. `pnpm validate` failed before the validator ran because the sandbox denied tsx's IPC socket (`EPERM)). The contributor will run `pnpm validate`, rebuild, run the three listed specs, and capture `after-desktop.png` and `after-phone.png` beside the baselines.
- Git staging was denied on the worktree's `index.lock` after the two content commits. The remaining changes are ready for staging outside the sandbox.

## Notes
- Builds on the party feature (`docs/design/tour/systems.md` §6, `content/bible/06-enden.md` §8).
- Keep one source per fact: the people in `content/credits.json`, assets in `LICENSES.json`, data / fiction lines in `content/party/credits.json`.
