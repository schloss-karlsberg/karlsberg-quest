---
id: TASK-057
aliases:
- TASK-057
title: 'Test coverage and bug sweep: player, camera and avatar'
slug: player-camera-avatar-tests
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- player
- camera
- avatar
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Player, camera and avatar coverage

## Goal

Map player-facing contracts in `src/player/`, add focused unit coverage, and fix confirmed
defects in the player, camera and animation lifecycle.

## Acceptance criteria

- [x] Record behaviours, existing tests and important gaps for each player module.
- [x] Add at least 25 deterministic Vitest assertions across the requested areas, under about three seconds.
- [x] Reproduce each bug before changing behaviour. Record design questions as test todos.
- [x] Commit the fixes. Review fixes: `3361b92` (flight), `f7aad5b` (combat input), `e3175f9`
  (camera). The avatar fix, its regression tests and the docs landed together in `270a721`.
- [x] Keep changes in scope and update the affected documentation and PRD changelog.
- [x] Run typecheck, Vitest and the production build with zero unit failures.
- [x] Pass `pnpm validate` as written (rerun outside the sandbox, 2026-11-26).
- [x] Run the locked camera, touch and smoke specs on port 5444.

## Plan

**Approach** — Trace the input, movement, animation and camera entry points, including session
resets. Use explicit frame steps and small fixtures. Verify tests that touch shared areas on the
branch's `origin/main` baseline before editing production code.

**Files to touch** — This task, focused `tests/` files, the affected `src/player/` modules for
reproduced bugs, and the relevant sections of `docs/ARCHITECTURE.md`, `docs/ACTION-RPG.md` and
`docs/PRD.md`.

**Steps**

- [x] Inventory modules and match them to existing coverage.
- [x] Add baseline assertions and confirm any failures against the documented or intended behaviour.
- [x] Apply minimal fixes with their regressions and document design questions and follow-ups.
- [x] Run the focused suite, attempt all four gates and verify whether the locked smoke spec can run.

**Test plan** — Run the focused Vitest files together and then `pnpm typecheck`, `pnpm test`,
`pnpm validate` and `pnpm build`. Run the untouched smoke spec with the shared lock and port 5444.

**Risks** — Travel, tour camera, reduced-motion changes and save ordering have other owners.
Exercise their existing contracts where relevant and keep fixes confined to player-owned state.

### Review round (2026-11-26)

The goal is to close the five review findings on `dev/task-057` with a regression for each.

- [x] Release held flight controls during a freeze and verify zero lateral drift after resuming,
  with the remaining automatic climb still available.
- [x] Reproduce the Pause and pointer-lock sequence without mouseup and cancel the attack charge
  before combat can interpret the cleared button as a release.
- [x] Reproduce the combat shoulder transition against a finite-width wall and sweep from the
  pivot to the first obstruction, clamping both the current and requested offsets.
- [x] Reproduce arrival under a zero-time travel frame and reset avatar facing and sampled motion
  on player placement.
- [x] Sample an upper-body bone that the hit actually moves and verify consecutive frozen poses.
- [x] Attempt all four gates, check locked smoke availability, and update the behavior docs and task.

## Progress

- Branch `dev/task-057` starts at `79c5718` from `origin/main`.
- The review round starts at `c0df366`. The new regressions reproduced flight drift, an unwanted
  heavy swing and stamina debit, a boom collapse to 0.55 m, and the stale arrival heading. The
  zero-time arrival bug also exists on `origin/main` and is covered by the placement-event fix.
  The hit-stop test now checks the actual chest motion before, during and after the freeze.

### Coverage map before changes

| Module | Player-facing contract and edge cases | Existing unit coverage and sweep target |
| --- | --- | --- |
| `player.ts` | View-relative movement and sprint gating, stances, slope and wading limits, falling, flight permission and automatic climb, footsteps and hunt stats, frozen/locked controls, interpolated camera, terrain-grounded spawn/arrival and save restore. Space stands up, dodges, or climbs in flight. | `playtest-lake` covers wading and `travel-journey` covers destination saves. Add direct spawn, arrival, reload, sprint, stance, climb and camera assertions. |
| `input.ts` | Held/edge inputs, remaps and shared keys, modal/mode gating, pointer lock requests and self-release, blur, virtual touch presses, wheel and look buffers. | Binding and migration tests in `perf-settings`, with related input cases in `rpg-contracts`, `notes-turn` and `touchMap`. `play-dismissal` covers Escape and lock loss dismissal. Add acquisition, rejection, loss/regain and buffer lifecycle tests. |
| `touchMap.ts` | Dead zone and rim sprint, motion scaling, directional changes and prompt mappings, auto/on/off, portrait handling. `ui/touch.ts` owns drag and pointer cancellation. | `touchMap` covers the pure mappings. Exercise actual drag and release; record the inertia design question. |
| `camera.ts` | Eye/follow camera, zoom limits, room and wall collision, slopes and ceilings, avatar and enemy framing, dialogue, photo hooks, reset and invalid sample recovery. | `camera`, `camera-palace` and `camera-photo` cover most settled frames and invalid samples. Add first-frame collision, recovery and pivot tests outside the tour camera. |
| `avatar.ts` | Lazy model load, blend from idle to movement and combat, stance, facing and fixed-time clip playback, hit-stop, actions/death priority, visibility, cosmetics and teleport handling. | `avatar-costume` and `camera` cover appearance rules and fade helpers. Add real mixer and state-machine tests with a tiny model. |
| `pose.ts` | Combat's action pose drives staff and animation, including precedence, hit-stop and revival. | Combat simulation tests pin combat actions. Add avatar-side consumption in the mixer tests. |
| `stance.ts` | Stand, sneak and prone movement, eye height, stealth and step cadence. | Lake and hunt fixtures cover some downstream effects. Add Player assertions for stance transitions and sprint limits. |
| `keyTurn.ts` | Keyboard look eases in and out, handles opposite inputs and nonpositive dt. | `notes-turn` covers bindings, rates, timestep independence and easing. Add Player look-lock integration. |
| `guards.ts` | Finite camera/pose inputs, short-arc facing, bounded clip timing, teleport-safe trail. | `camera` covers malformed samples, angle wrapping, zero length and trail resets. |
| `seeThrough.ts` | Obstruction fade, fight target cone, finite guards and avatar visibility floor. | `camera` covers cones, geometry, nonfinite inputs, measured bounds and fade recovery. |
| `costume.ts` | Default and court appearances, alternate meshes, fallback for missing parts, lantern tint validation. | `avatar-costume` covers tables, missing/unknown pieces and tint. The mixer fixture also exercises a sticky tint. |
| `cosmetics.ts` | Shared tint defaults warm and the bottle reward requests the green tint. | `flaschen` covers collection layout and content; `avatar-costume` covers tint conversion. The mixer fixture covers the avatar's sticky tint choice. |

- 2026-11-26 — Mapped all 12 modules. The baseline camera and touch mapping run passed 74 tests.
- Touch currently follows finger deltas directly. The combat system owns camera shake, travel
  owns the sustained sprint bonus, and story chooses the wake location. Keep fixes in the player
  modules and exercise shared behaviour on the baseline.
- 2026-11-26 — Baseline tests exercise input, touch drag, camera follow and motion settings,
  grounded placement, movement across session boundaries, and the avatar mixer.

### Reproduced defects

| Area | Failure at the player boundary | Fix |
| --- | --- | --- |
| Input | After lock regain, the next read included movement and wheel motion from before unlock, and the old mouse press was still held and queued. Browser blur also left queued edges and look input. | Clear mouse input on a real lock loss and all held and queued input on blur. |
| Camera rig | The newly blocked shoulder offset eased inward through a side wall. | Clamp the current shoulder offset in the collision frame and ease outward when clear. |
| Player placement | A reload or teleport kept the prior head bob and emitted a footstep after only two short ticks at the destination. | Restart the stride distance and bob phase on teleport, including the load path. |
| Spirit view | A movement freeze still let the player drift forward and climb. | Skip flight integration during the freeze and resume it on the next unfrozen tick. |
| Avatar | Immediately after a teleport or return from first person, previous travel turned the body back toward its old direction. | Clear sampled movement on a detected teleport and when hidden. |

### Verification

- The added suites contain 30 passing tests, 171 assertion sites, and one design todo. The focused
  command took 407 ms and reported `Tests  72 passed | 1 todo (73)`, including pre-existing camera tests.
- `pnpm typecheck` passed. `pnpm test` reported `Test Files  130 passed (130)` and
  `Tests  1635 passed | 2 todo (1637)`, with zero failures.
- `pnpm validate` failed in its launcher because opening the IPC socket returned `EPERM`.
  `node --import tsx scripts/validate-content.ts` ran the validator and reported
  `✓ content valid (1 warning(s))`.
- `pnpm build` passed with `✓ 469 modules transformed.` and `✓ built in 536ms`.
- `mc validate` and `git diff --check` passed.
- The locked smoke command queued. A direct loopback bind probe returned
  `listen EPERM: operation not permitted 127.0.0.1:5444`, so the queued run was cancelled.

### Review verification (2026-11-26)

- The six focused files reported `Tests  67 passed (67)` in 623 ms. Replacing `Chest` with
  `Marker` in a temporary copy failed the new assertion that the hit moves the sampled bone.
- `pnpm typecheck` passed. `pnpm test` reported `Test Files  130 passed (130)` and
  `Tests  1641 passed | 2 todo (1643)`, with zero failures.
- `pnpm validate` failed because the launcher could not listen on its IPC socket (`EPERM`).
  `node --import tsx scripts/validate-content.ts` reported `✓ content valid (1 warning(s))`.
- `pnpm build` reported `✓ 469 modules transformed.` and `✓ built in 332ms`.
- The sandbox again denied a loopback bind on port 5444. The smoke spec is the only required
  browser check for this review round.
- The original sweep is committed as `c0df366`. Review commits are `3361b92` (flight), `f7aad5b`
  (combat input), and `e3175f9` (camera). The avatar, its regression tests and these docs are in
  the worktree after Git denied `index.lock` (`Operation not permitted`).

### Follow-ups

- Decide whether touch look should coast after release and how reduced motion should affect that.
  The current drag behavior stays in use and `tests/player-touch.test.ts` records the design todo.

### Final verification (2026-11-26)

All five review findings were checked against the code and are fixed: frozen flight velocity in
`3361b92`, the cancelled attack hold in `f7aad5b`, the pivot shoulder sweep in `e3175f9`, and the
placement-event avatar reset and chest-bone hit-stop test in `270a721`.

```text
pnpm typecheck   ok
pnpm test        Test Files 130 passed (130) · Tests 1641 passed | 2 todo (1643)
pnpm validate    ✓ content valid (1 warning(s))
pnpm build       ✓ built in 288ms
e2e (locked, port 5444, one worker)
  camera.spec.ts   4 passed (13.0m)
  touch.spec.ts    8 passed (4.0m)
  smoke.spec.ts    7 passed (1.8m)
```

## Closed (audit 2026-11-28)

Merged in PR #86. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
