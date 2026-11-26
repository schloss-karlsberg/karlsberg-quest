---
id: TASK-028
aliases:
- TASK-028
title: 'Test coverage and bug sweep: Combat, enemies, items and stats'
slug: combat-rpg-hunt-skills-coverage
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- combat
- rpg
- hunt
- skills
- testing
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Test coverage and bug sweep

Map player-facing behaviour in combat, RPG definitions and stats, hunt, and survey skills. Pin down important gaps with focused unit tests and fix confirmed defects within those areas.

## Acceptance Criteria

- [x] Record a per-module behaviour and existing coverage map.
- [x] Add at least 25 meaningful deterministic assertions across all four areas, with the focused set running in about three seconds or less.
- [ ] Reproduce confirmed defects before changing production code. Commit each fix independently and record design questions as noted test todos.
- [ ] Pass typecheck, unit tests, content validation and build. Run the smoke spec on port 5416 through the shared lock if the sandbox permits it.
- [x] Update the PRD changelog and relevant behaviour docs. Document any new test helper in the architecture testing section.
- [ ] Commit locally with the required trailers and report the results and follow-ups.

## Plan

_Status: approved 2026-11-26_

**Approach** — Inventory the runtime contracts and search the existing tests by module and symbol. Prioritize state transitions, gating, rewards, persistence and boundary cases that can be exercised headlessly. Run each regression against the starting implementation before applying the smallest fix.

**Files to touch**

- `tests/` — Focused coverage for combat, RPG stats, hunt and skills.
- `src/systems/combat/`, `src/rpg/`, `src/systems/hunt/`, `src/systems/skills/` — Minimal changes for confirmed failures.
- `docs/PRD.md` and relevant design docs — Record the sweep and any corrected behaviour.

**Steps**

- [x] Map the modules and existing coverage.
- [x] Add and time the focused tests. Capture baseline failures.
- [x] Fix confirmed failures and document design questions.
- [x] Run the four gate commands and attempt the locked smoke spec. Record the results.
- [x] Re-run all gates and attempt smoke after the review fixes, then record the outcome.
- [x] Commit the remaining loot and skill test updates with the task record.

**Test plan** — Run focused Vitest files, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. Run `KQ_E2E_PORT=5416 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line`.

**Risks** — Use fixed simulation steps, explicit inputs and seeded samples. Keep the overlapping combat item-use and hunt lantern work outside the fixes.

**Open questions** — Record ambiguous behaviour in the sweep as it is identified.

### Review repair plan

- [x] Reproduce a falling stone outliving its pack. Cancel the pending damage, warning and stone when the responsible encounter is removed, and verify that another encounter keeps its attacks.
- [x] Verify scoped bolt removal with two airborne shots and step beyond the removed shot's impact window.
- [x] Assert every boss's guaranteed Balsam chance and count bounds. Load a higher skill tier and verify that it applies silently.
- [x] Update the combat behaviour docs and gate record, removing the commands superseded by `bd8b4db`.

## Behaviour and unit coverage map

The coverage column records existing tests and the gaps found by searching `tests/` for module paths and exported symbols. Runtime presentation gaps are listed even where browser tests exercise the feature.

### Combat

| Module | Player contract | Existing unit coverage and gaps |
| --- | --- | --- |
| `index.ts` | Translates input, safe zones, stats, rewards and item events. Saves vitals and groups. Clears encounters on shifts and reload, heals at anchors and wake. | Combat and progression cores are tested separately. Event wiring, kill payout and live reload during an action have limited direct unit coverage. |
| `rules.ts` | Damage, armour, attack angles, combo and dodge windows, stamina thresholds, group counts, era and time gating, boss phases, safe zones. | `combat`, `combat-round10`, `combat-variety`. Runtime application of charge refill and respawn timing has less coverage than the rules. |
| `sim.ts` | Swings, dodge, charges, abilities, AI and telegraphs, health recovery, KO, authored groups, adds, projectile and wave lifecycle. Rebuilds runtime bodies from saved groups. | `combat*`, `playtest-lake`, `pilot`. Missing scoped projectile cleanup, combat resource cap transitions and a serialized boss/group round trip. |
| `bosses.ts` | Each boss's weak point, phase move selection, summons and opening after a roar. | `combat`, `combat-human`, `combat-balance`. No isolated tests for all phase-specific recovery and summon boundaries. |
| `packs.ts` | Pack eligibility, elite index, escort/wave overrides, calls and era hazards. | `combat-packs`, `combat-variety`, `combat-balance`. Overrides and several authored waves covered. |
| `targeting.ts` | Soft targeting, lock aim/retention, ground ring and off-screen arrows. | `camera` tests proximity, cone, exclusion and bindings. Runtime retention and arrows use browser coverage. |
| `fightlog.ts` | Fight reports capture readable windups, hits, dodges, feedback and encounter timing. | `combat-human` tests off-screen hits and reactions. Long sessions and report retention lack direct tests. |
| `hud.ts` | HP, Atem, charge and cooldown indicators, boss/target health, prioritized captions, floating numbers and reduced flash. | `combat-round10` and `readability` cover pinned caption eviction and number placement. DOM lifecycle is browser-level. |
| `bodies.ts` | Enemy-specific silhouettes, radii and poses, readable windups and dissolves. | `characters`, `readability` cover body templates and hulls. Pose/readability in motion is browser-level. |
| `visuals.ts`, `visuals-shapes.ts` | Shape silhouettes, outlines and fading, hit effects, telegraphs and landing rings. | `readability`, `camera`, `combat-human` cover hull, fade and pulse math. Geometry and the effect lifecycle are browser-level. |
| `rigged.ts` | Clipped spectral enemy movement, joints, lights and low-quality fallback. | `rig-bones` exercises posed horse and rider. Full animation/render transitions are browser-level. |
| `viewmodel.ts` | Staff stages and first-person swing/charge, third-person action poses. | No direct unit coverage for `stageOf` or pose lifecycles. Staff ownership and upgrades are covered in `progression`. |
| `audio.ts`, `strings.ts` | Attack, dodge, damage and boss sound cues with German telegraphs, warnings and lessons. | `combat`, `combat-human`, `combat-round10`, `rpg-contracts` cover telegraph timing, some captions and family labels. No direct combat sound dispatch check. |

### RPG catalogues

| Module | Player contract | Existing unit coverage and gaps |
| --- | --- | --- |
| `enemies.ts` | Stable IDs, telegraphs, HP, XP, loot IDs, boss thresholds, elite variants and visual dissolve. | `rpg-contracts`, `combat*`, quest-content tests. Boss guaranteed loot and round-trip phase state are only indirectly covered. |
| `items.ts` | Stable item IDs and effects, stack sizes, ordered weapon stages, loot and collection rewards. | `rpg-contracts`, `progression`, `tour-kastanien`. Missing exact staff power curve and boss loot guarantee including empty lookup. |
| `stats.ts` | XP curve and cap, charm slots, talent prerequisites/ranks, weapon and charm composition, difficulty and novice grace. | `rpg-contracts`, `progression`, `combat`. Missing over-rank and old equipment boundaries and combined novice, gentle and Rauhnacht modifiers. |
| `types.ts` | Serializable quest, combat and progression contracts. | Type-only. Indirect coverage in `rpg-contracts`, `quests`, `progression`, `combat*` and save fixtures. |

### Hunt

| Module | Player contract | Existing unit coverage and gaps |
| --- | --- | --- |
| `index.ts` | Configures/restarts era-local packs, hunt stops on shifts, catch/recovery and lantern events, holds and trail cues. | Headless logic tested in `hunt*` and story flow. Pack config restore and era stop are mainly browser tests. |
| `sim.ts` | Patrol, detect, chase, search, catch, water and cover constraints, pack formation and Bannlicht scatter. | `hunt`, `hunt-k1`, `hunt-k2`, `hunt-ext`, `k3-stage`, `story-flow`. No direct cone-scatter/catch suppression check. |
| `modes.ts` | Patrol, par force, stand, drive, finale, kennel and follow rules, target/catch gates. | `hunt-k1`, `hunt-k2`, `hunt-ext`, `k3-stage`. Follow presentation and some mode handoffs remain browser-level. |
| `tracks.ts` | Footprints, trail breaks and reads, authored prints, expiry, buffer cap and clearing on shifts. | `hunt-ext`, `hunt-k2` cover normal expiry, breaks, reading, authored trail holding. Missing mixed held and ordinary timestamps, cap and clear bookkeeping. |
| `perception.ts` | Sight cone, near-sense, cover and obstruction, hearing stance and splash, flight bypass. | `hunt` covers terrain, hollow ways and hearing/sight range. Missing isolated `look` near-sense and boundary coverage. |
| `graph.ts`, `rng.ts` | Paths around obstructions, deterministic patrol routes and random choices. | `hunt` tests adjacency, route, deterministic draws and seeded pack runs. Empty or disconnected paths and expansion bounds have less direct coverage. |
| `lanternLogic.ts`, `lantern.ts` | Oil drain, extinguishing at zero, difficulty burn times, light and held pose. | `hunt` covers drain, refill and mode rates. Light, pause integration and pose are browser-level. |
| `kennelGate.ts` | Gate aligned to wall, timed swing and reduced-motion open. | `k3-stage` covers wall frame and leaf angle. Scene geometry is browser-level. |
| `cones.ts` | Current pack sight/attention drawn in debug tools. | `court` exercises `packCones`. Geometry upload has no unit tests. |
| `audio.ts`, `overlay.ts`, `strings.ts` | Horn meaning, directional cues, chase/caught feedback, accessibility settings. | `hunt*` check horn signal events and `skills` checks their meaning gate. Audio and DOM presentation have browser coverage. |
| `visuals.ts`, `trackVisuals.ts` | Visible hounds and rider, fog/eyeshine, prints and age fade. | Track lifetime tested in `hunt-ext`. Pose, print appearance and graphics tiers are browser-level. |

### Survey skills

| Module | Player contract | Existing unit coverage and gaps |
| --- | --- | --- |
| `logic.ts` | Aliases, tier caps, increases, free/strict survey, tool cycles, locked tiers and horn explanations. | `skills`, `integration-round2` and story tests. Some stale gated views, invalid skill values and exact room-name gate are missing. |
| `index.ts` | Grants raise levels, quiet and load changes stay silent, save and queue notifications, pause suspends the shown unlock. | `skills` covers pure logic. Runtime grant, load and pause are primarily browser-level. |
| `card.ts`, `skills.css` | Coalesces unlocks, settles to let a level card take them, shares the centre slot, pauses reveal/time, supports reduced motion. | `cards` covers the shared director. Missing checks for the skill card taking the slot at the settle boundary and dropping pending cards on reload. |
| `audio.ts`, `strings.ts`, `settings.ts` | Stamp chime and German card copy, optional captions, direction markers and difficulty checkbox. | `skills` tests horn meaning. Card/audio/settings presentation is browser-level. |

## Progress

- Branch `dev/task-028`, starting at `d2d1f48` (local `origin/main`).
- 2026-11-26 — Mapped existing unit coverage and identified lifecycle, save and boundary gaps.
- 2026-11-26 — The baseline run reproduced four failures across three defects. Scoped despawn and dematerialisation left caster bolts alive. Held Warner prints blocked expiry of regular prints placed later. A skill card could enter while a reward owned the centre slot on the frame its settle clock crossed the threshold.
- 2026-11-26 — Fixed the three defects and recorded the remaining lob behaviour question as a test todo. `f035337` contains the initial combat fix. `bd8b4db` contains the hunt and skills fixes together with the remaining tests and docs.
- 2026-11-26 — Focused run completed in 219 ms with `Tests  17 passed | 1 todo (18)`. This includes 14 new passing tests and three existing hunt tests.
- 2026-11-26 — `pnpm typecheck` and `pnpm build` passed. The full unit gate reported `Tests  1587 passed | 1 todo (1588)` with zero failures. `pnpm validate` stopped before validation because the sandbox denied the TypeScript runner's IPC socket with `listen EPERM`.
- 2026-11-26 — The shared lock ran the smoke command, but the sandbox denied the preview server's bind to `127.0.0.1:5416` with `listen EPERM`. No browser tests started. No browser specs changed.
- 2026-11-26 — Independent review passed content validation and reported `Tests  17 passed | 1 todo (18)` across the four focused files on `bd8b4db`.
- 2026-11-26 — Reproduced the pre-existing falling-stone bug with scoped despawn, scoped dematerialisation and despawn-all. In each case the stone still landed and took 14 HP. `97fb31d` ties each hazard to its triggering pack and verifies that removing another encounter preserves the warning and that removing the responsible pack cancels it while a second pack is fighting.
- 2026-11-26 — Strengthened the bolt, Balsam and silent-load tests. Temporary mutations confirmed the tests reject clearing every bolt, a 7% Balsam chance, a Balsam count above one and an unlock event on load. The four focused files reported `Tests  20 passed | 1 todo (21)` in 205 ms.
- 2026-11-26 — Review round gates. `pnpm typecheck`, `pnpm test` and `pnpm build` passed. The unit gate reported `Tests  1590 passed | 1 todo (1591)` with zero failures. `pnpm validate` was blocked by `listen EPERM` on the `tsx` IPC socket. The locked smoke command was blocked by `listen EPERM` on `127.0.0.1:5416` before any browser tests started. No browser specs changed.
- 2026-11-26 — The hazard fix was committed locally with the required trailer. After the sandbox denied `git add` at the worktree's `index.lock`, the remaining loot and skill fixtures and task record landed in `9cf9088`.
- 2026-11-26 — PR #57 review fixes. Reproduced the patrol picking up the Warner's trail after an ordinary print expired and a July fire ring targeting a different active pack. The hunt uses the player-print lookup for both patrol and search. The second fire ring targets its owning pack, and tests check the warning and damage when either pack despawns first. The reload test now advances the boss phase with a staff hit and reloads with a live projectile.
- 2026-11-26 — Review-fix checks passed. Typecheck, build and content validation (`node --import tsx scripts/validate-content.ts`) completed. The two-worker Vitest run reported 121 files and 1,593 tests passed, with one existing todo. The locked smoke run stopped before browser tests started because the sandbox denied the bind to `127.0.0.1:5416`. The review fixes remain unstaged and uncommitted.

### Checks to rerun outside the sandbox

```sh
pnpm build
for spec in smoke hunt-ext chapter-k2 combat combat-variety skills progression touch; do
  KQ_E2E_PORT=5416 scripts/dev/heavy.sh --max-hold 15 -- pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1 --reporter=line
done
```

## Follow-ups

- Decide what should happen to an already launched lob when its caster is defeated. The current lob can land after its warning disappears. The todo in `tests/combat-lifecycle.test.ts` records the need to choose whether to cancel the lob or preserve the warning until impact.
- Extend unit coverage for combat event integration (kill payouts and live reload mid-action) and hunt save/era wiring if those paths change.
