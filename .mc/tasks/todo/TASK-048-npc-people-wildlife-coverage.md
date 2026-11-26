---
id: TASK-048
aliases:
- TASK-048
title: 'Test coverage and bug sweep: NPCs, people and wildlife'
slug: npc-people-wildlife-coverage
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- npc
- wildlife
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# NPCs, people and wildlife outside the tour

## Goal and acceptance criteria

- [x] Map the player-facing contracts of each in-scope module against existing unit tests.
- [x] Add at least 25 meaningful deterministic assertions, under about three seconds together.
- [x] Reproduce proven bugs before changing gameplay; record design questions as todos.
- [ ] Commit each fix separately (sandbox blocked staging).
- [x] Document the changed contracts, test helpers and PRD changelog.
- [ ] Pass all four literal gate commands and run locked smoke if permitted (IPC and preview port blocked; validator itself passed).
- [x] Leave the tour dogs, other teams' topics and voice content untouched.

## Plan

**Approach:** Trace state ownership and event consumers before choosing tests. Prefer driving existing pure functions or systems with a real event bus and controlled inputs. Exercise progression/rewards, proximity boundaries, pause/era/reload and repeat events rather than renderer implementation details.

**Files to touch:** This task for the audit and results; `tests/` for focused unit coverage; only the proven failing paths in the scoped systems; `docs/PRD.md`, `docs/ACTION-RPG.md` and `docs/ARCHITECTURE.md` for documented contracts as applicable.

**Steps:**
- [x] 1. Inventory scoped files, consumers, documentation and current tests.
- [x] 2. Add coverage and run narrow red/green checks. Intended commits are listed below because Git refused to stage changes.
- [x] 3. Attempt the four gates, check port 5436, record results and follow-ups.

**Test plan:** Use fixed inputs, injected simulation time and seeded randomness as needed; run the focused set separately to measure runtime. No e2e edits planned.

**Risks:** Shared ownership of adjacent systems and worktree resources. No changes to tour walks, hunt lantern, save infrastructure, or voiced text.

**Open questions:** Record ambiguous behaviour rather than choosing a new rule.

## Progress

- 2026-11-26: Started on `dev/task-048` at `d2d1f48` (same as local `origin/main`).
- Git cannot create the worktree's `index.lock` in the shared Git directory. Keep all changes local; record intended commit boundaries instead.

## Coverage map (before the sweep)

Paths below are relative to `src/systems/`; test names are relative to `tests/`. Presentation-only contracts are distinguished from gameplay transitions.

| Module(s) | Player contract | Existing coverage / gap |
| --- | --- | --- |
| `npc/logic`, `roster` | Chapter/speaker filtering, ordered and gated topics, once-lines, talked flags, fallback names/looks, turn/sweep | `story-ext`, `npc-turn`, `court`, `twins` test rules; not the actual first-talk clue payout. |
| `npc/index`, `ui`, `npc.css`, `glyphs` | Placement/room/era, nearest eligible talker, quest handoff, card hold, first clue, save/close, marker/menu/advance | `npc-talk-hint` covers advance hints; quest and story tests cover the other ends of the bus. Gap: spawn → E → reward → close/reload and clue ownership on removal. DOM layout and glyph projection are browser checks. |
| `npc/bind`, `figure`, `rigged`, `twins` | Live speaker body or placement fallback, body/head turn, era tint, low-tier silhouette, historical identity | `people`, `characters`, `npc-turn`, `twins`, `echo-twins` cover bindings, geometry/looks and identity; visual framing/rig swap are mostly browser coverage. |
| `people/types`, `specs`, `index`, `registry` | Body choice, safe grounded spawn, newest live speaker, disposal, camera-distance visibility/stats | `people` covers lookup, override, normal ground, registry/LOD; gap: non-finite inputs/terrain and crossing back into draw range. |
| `people/locomotion`, `standin`, `authored` | Speed/clip fallbacks, stride, gaze, one-shots, throttled evaluation, authored LOD hysteresis/material ownership | `people`, `character-toon` exercise pure rules and loaded bodies; no persistent state owned here. |
| `animals/types`, `deer`, `save` | Action narrowing, fear/tell/flight, herd following, walking away, reload mid-action, unknown slice fallback | `animals-deer` covers approach/noise, follower events, missing leader, mid-flight reload. Gap: a herd saved while walking away, including the follower. |
| `animals/index`, `runtime`, `photoBridge` | Body lifecycle, requests and events, today-only pause/resume, save/load; optional centre/head targets | `animals-system` covers era pause, silent restore, visibility and bridge; don't modify photo or dogs/walk. |
| `menagerie/logic` | Seeded cassowary tells/charges/misses, dromedary collision/yield, jaguar light/dark and gentle-mode safety | `menagerie` covers individual behaviour, not overlapping animals or group limits/replacement. The cassowary is the in-scope bird; other bird calls belong to `ambience` (era mix already in `ambience.test.ts`). |
| `menagerie/index`, `strings`, `audio`, `models` | Saved era placement, three-flare/three-miss calming, once-only event, knockdown/recovery and subtitles; rigs and sound mirror the sim | `menagerie` tests the sim; `menagerie:calmed` consumers don't exercise its producer. Gap: flare qualification, old/new slots, replay and hidden eras; pixels/audio not unit targets. |
| `hunt/tracks`, `trackVisuals` | Boot/paw/hoof identity, segment breaks, count cap, expiry, long-held authored trail, direction/age and fading prints | `hunt-ext`, `hunt-k2` test breaks, homogeneous expiry, readings and isolated held prints. Gaps: interleaved lifetimes, stale readings, invalid stride and eviction. Visuals consume field time/version. |
| `hunt/index`, `sim` (track paths only) | Cue lays the Warner's prints, game-time clock, real pack picks up only player boots, skill shows reading | `hunt-k2` checks the field lookup, `hunt-ext` a pack following real player prints, but not a pack crossing the Warner's trail. Other hunt modules (lantern, pack modes, audio, overlays) aren't track owners. |

## Results (2026-11-26)

Each fix had a failing regression on the original behaviour, followed by a passing focused run:

| Area | Before | Fix |
| --- | --- | --- |
| Hunt AI | A hound crossing only the Warner's trail emitted `tracking: on` and the found horn. The pure player-print lookup excluded these boots; the actual pack scanner did not. | Check boot ownership in the pack scanner. A real player print still starts tracking. |
| Track lifetime | A future-dated held trail at the head of the field prevented expired player and pack prints behind it from being pruned. Even before periodic pruning, a faded hoofprint changed the reported rider and direction. | Compact the bounded field by individual age every five seconds, preserving insertion order. Exclude expired prints when reading. |
| Trail spacing | A cue with stride zero sampled indefinitely (the red test aborted after six samples on a 7 m path); other invalid strides omitted the trail or its interior. | Use normal stride for non-positive/non-finite values. |
| Deer restore | A save made while the herd walked away restored the doe as `leave` but its fawn as `gone`. Followers have no independent destination. | Restore the follower's state when its departing leader is in the save; keep the defensive fallback for an orphan. |
| Calming on reload | After two jaguar flares or cassowary misses, loading a save from **before** those actions needed only one more to calm the animal. | Discard both transient counters on load. Completed calming still survives reloads and spawn replay. |
| Animal collision | Dromedaries 1 cm apart ended up 157.5 m apart after one tick, and identical positions never separated. | Apply equal and opposite displacement from the original positions, with a stable normal for exact overlap. |
| Gentle mode | Switching gentle mode on during the jaguar's committed pounce still emitted a knockdown. | Interrupt the pounce before advancing or applying contact. |

Passing-baseline coverage also exercises the first-talk clue/once-greeting across reload, other floors/eras and clue ownership; safe people spawns, return to view and disposal; pack size caps, eviction and read radius; and birdsong outside today's tour. No gameplay changes in NPCs, people, ambience, dogs, photo, lanterns or save infrastructure. No voiced text or assets changed.

### Verification

- Focused new cases: **76 distinct `expect` statements**, 22 passed, 1 design todo; 463 ms for the filtered Vitest invocation, including worker startup. The 91 skipped cases are pre-existing tests outside the name filter; the full suite ran them.
- `pnpm typecheck`: passed (`tsc --noEmit`). `pnpm test`: `Test Files  121 passed (121)`; `Tests  1595 passed | 1 todo (1596)`; **0 failed**.
- `pnpm validate`: the `tsx` CLI could not listen on its local IPC socket (`EPERM`). The identical validator entry point ran via `node --import tsx scripts/validate-content.ts`: `✓ content valid (1 warning(s))`; the pack warning is from the untouched example case.
- `pnpm build`: `✓ built in 678ms`. `git diff --check`: passed.
- Smoke skipped: binding a server to `127.0.0.1:5436` returned `listen EPERM`. No e2e spec changed; run only `KQ_E2E_PORT=5436 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line` on a permitted machine.

### Follow-ups and intended commits

- **Design todo:** should partial calming progress persist in a save made *after* those flares/misses? Only permanent calming is serialized today. No save-format change in this task.
- Rerun the literal validator and locked smoke outside the sandbox; stage the changes as the commits below. HEAD remains `d2d1f48a528e285f15ad843ac80a5a75f7ae7c92` on `dev/task-048`. Nothing pushed.

1. `chore: record npc and wildlife coverage plan`
2. `test: cover campaign npc and wildlife encounter boundaries`
3. `fix: ignore the Warner's prints when hounds track the player`
4. `fix: expire snow prints independently of held trails`
5. `fix: use default spacing for invalid trail strides`
6. `fix: restore a departing fawn with its leader`
7. `fix: discard menagerie calming counters on load`
8. `fix: separate overlapping menagerie animals evenly`
9. `fix: stop a jaguar pounce when gentle mode is enabled`
10. `docs: record encounter contracts and sweep results`

Each message ends with a blank line and `Co-Authored-By: Codex <noreply@openai.com>`.
