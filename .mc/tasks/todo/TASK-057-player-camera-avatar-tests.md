---
id: TASK-057
aliases:
- TASK-057
title: 'Test coverage and bug sweep: player, camera and avatar'
slug: player-camera-avatar-tests
status: in-progress
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
updated: 2026-11-26
---

# Player, camera and avatar coverage

## Goal

Map player-facing contracts in `src/player/`, add focused unit coverage, and fix confirmed
defects in the player, camera and animation lifecycle.

## Acceptance criteria

- [x] Record behaviours, existing tests and important gaps for each player module.
- [x] Add at least 25 deterministic Vitest assertions across the requested areas, under about three seconds.
- [x] Reproduce each bug before changing behaviour. Record design questions as test todos.
- [ ] Commit each fix separately. Git denied the worktree index lock.
- [x] Keep changes in scope and update the affected documentation and PRD changelog.
- [x] Run typecheck, Vitest and the production build with zero unit failures.
- [ ] Pass `pnpm validate` as written. The validator itself passed through Node's loader.
- [x] Run locked smoke on port 5444 or document the sandbox blocker and exact command.

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

## Progress

- Branch `dev/task-057` starts at `79c5718` from `origin/main`.

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

### Follow-ups

- Decide whether touch look should coast after release and how reduced motion should affect that.
  The current drag behavior stays in use and `tests/player-touch.test.ts` records the design todo.
- Run the smoke spec where loopback binding is available.

```sh
KQ_E2E_PORT=5444 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```

### Intended commits

Git could not create the worktree's `index.lock` and left HEAD at
`79c57184e15f1bd583943ac56fe43432ef28c922`. Run these commands from this worktree with a writable
index. At the patch prompt, stage only the teleport hunk.

```sh
task_commit() {
  git commit -m "$1" -m 'Refs: TASK-057' -m 'Co-Authored-By: Codex <noreply@openai.com>'
}

git add tests/player-fixture.ts tests/player-camera-shake.test.ts tests/player-touch.test.ts
task_commit 'test(camera): cover touch drag and reduced-motion shake'

git add src/player/input.ts tests/player-input.test.ts
task_commit 'fix(camera): discard stale input after focus loss'

git add src/player/camera.ts tests/camera.test.ts
task_commit 'fix(camera): clamp the shoulder immediately against walls'

git add tests/player.test.ts
git add -p src/player/player.ts
task_commit 'fix: reset footstep and bob phase on placement'

git add src/player/player.ts tests/player-flight.test.ts
task_commit 'fix: hold spirit flight during movement freezes'

git add src/player/avatar.ts tests/player-avatar.test.ts
task_commit 'fix: reset avatar movement when snapping its facing'

git add .mc/tasks/todo/TASK-057-player-camera-avatar-tests.md docs/ARCHITECTURE.md docs/ACTION-RPG.md docs/PRD.md
task_commit 'docs(camera): record the player transition sweep'
```
