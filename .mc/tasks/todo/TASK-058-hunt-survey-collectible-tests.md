---
id: TASK-058
aliases:
- TASK-058
title: 'Test coverage and bug sweep: hunt, lantern, survey, tools, notes and collectibles'
slug: hunt-survey-collectible-tests
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- hunt
- collectibles
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Hunt, survey and collectible coverage

## Goal

Pin down untested player behaviour in hunt (including lantern), survey, tools, notes,
bottles and collectible persistence. Fix defects demonstrated by those tests.

## Acceptance criteria

- [x] Map the modules, the player contracts, existing unit coverage and gaps.
- [x] Add at least 25 meaningful deterministic assertions across the area, running in about three seconds or less.
- [x] Reproduce each confirmed defect before its minimal fix and record design questions as test todos.
- [ ] Commit fixes individually. Git could not create the worktree index lock.
- [x] Document changes, test helpers and the PRD changelog.
- [x] Run all four gates, record the exact results and verify zero unit failures.
- [ ] Pass all four gates as written. The validator CLI could not open its IPC socket.
- [x] Run the locked smoke spec on port 5445 if possible or record the command for a human.

## Plan

- [x] Inventory the source, its callers, existing tests and documented player behaviour.
- [x] Exercise missing boundaries and event-to-state wiring with fixed inputs and explicit simulation steps.
- [x] Check failing assertions against intent, fix each confirmed bug independently and rerun its tests.
- [x] Update the affected documentation and run the focused set, four gates and smoke spec.

## Progress

Started on `dev/task-058` at `79c5718`.

## Review fix round (2026-11-26)

Goal: resolve the seven review findings on `dev/task-058` while preserving session state and
keeping per-frame bottle visibility checks cheap.

### Acceptance criteria and plan

- [ ] Cover loading both sides of the capture handoff and clear outgoing staged or fading hounds.
- [ ] Exercise Notes through Story replay and retain the saved inactivity clock until real progress.
- [ ] Preserve the relief countdown through Continue and recheck survey skill access.
- [ ] Restore phase-two bottle restrictions and use Hunt's effective bounds for pack coverage.
- [ ] Recompute bottle coverage on arena changes and assert frame updates reuse it.
- [ ] Record the findings against `origin/main`, update the docs and run the four gates and locked smoke spec.
- [ ] Commit the fixes in reviewable groups.

## Coverage inventory

Baseline at `79c5718`. Checked system imports, exported function names and the events that
connect them in `tests/`. Rendering and audio also have browser coverage. The table describes
the unit coverage before this sweep.

Unit file names below omit `.test.ts`. Each path is relative to `src/systems/`.

| Module | Player contract | Baseline unit coverage |
| --- | --- | --- |
| hunt/index | Start, reconfigure and stop encounters, restore the pack and lantern from a slot, handle catches, pause oil during conversation and pages, halve indoor burn and allow free burn today. | Sim and oil rules were tested separately. Registered events, lighting state and session changes were missing. |
| hunt/sim | Detect, chase, search, lunge and catch. Bannlicht scatters hounds in range. | hunt, hunt-ext, hunt-k1, hunt-k2, k3-stage and story-flow cover seeded encounters. Scatter range and cone lack a dedicated unit. |
| hunt/modes | Drive and follow keep their formation, parforce offers escape, stand holds the ring, finale calms the pack and kennel releases it. | hunt-ext, hunt-k1, hunt-k2, story-flow and k3-stage exercise these modes. Saved in-place reconfiguration was uncovered. |
| hunt/perception | Light, cover, terrain, stance and noise affect whether a hound detects the player. | hunt checks sight, hearing and terrain occlusion. |
| hunt/graph | Roaming hounds can route over paths and handle empty graphs. | hunt checks nearest nodes, paths and fallback roaming. |
| hunt/rng | The same seed reproduces a hunt. | hunt and hunt-k1 exercise seeded choices. |
| hunt/tracks | Snow prints age out, break at water/stone, and can be read or followed. | hunt-ext and hunt-k2 cover expiry, breaks and authored trails. |
| hunt/kennelGate | The doors face outward and open on release. | k3-stage checks gate edges, leaf angles and clearance. |
| hunt/lanternLogic | Oil only drains while lit, changes with difficulty and an empty lamp stays off. | hunt covers drain, refill, refusal and tuning. |
| hunt/lantern | The flame, carried prop and local light follow the lamp. | No direct LanternView unit. |
| hunt/cones | The sight-cone overlay reflects the pack’s sensing range. | court checks packCones data. |
| hunt/visuals | Hounds and the rider have readable bodies, eyes and poses. | No direct rendering unit. |
| hunt/trackVisuals | Boot, paw and hoof marks follow terrain and fade with age. | hunt-ext tests the underlying prints. The rendered decals have no direct unit. |
| hunt/overlay | Direction indicators and the capture curtain track the encounter. | No direct overlay unit. |
| hunt/audio | Horn, paw and heartbeat cues announce the pack and its state. | hunt checks horn signals in the sim. Sound production has no direct unit. |
| hunt/strings | Captions explain sounds, track readings and lantern changes. | No dedicated feature-string unit. |
| survey/index | Gate and cycle scans and historic maps, exit an active mode, follow the player and time out after a find. | skills covers pure unlock/cycle rules. Input, map events, pause and load were uncovered. |
| tools/index | Route input to unlocked tools, give the tape its click and suspend overlays at a shift. | skills covers gating. Tool lifecycle after a slot change lacked a unit. |
| tools/measure | First click anchors A, the second completes the tape, another measurement or cancellation clears it. Completion emits the measurement and building flag. | tools checks the underlying gallery measurements. The live tape state was uncovered. |
| tools/picker | The crosshair selects the nearest visible measurable surface within range. | No direct Picker coverage for competing surfaces, hidden objects or the maximum range. |
| tools/geom | Ground rays, distance, rise, grade, profile and polygons remain meaningful at boundaries. | tools covers ordinary geometry. The final partial ray step and coincident/vertical endpoints were gaps. |
| tools/plans | Plan and confidence views show the correct footprint, rooms, colours and labels for the era and skill. | tools covers planLines, roomAt and footprintAt. Shift suspension lacks a direct unit. |
| tools/ribbon | Outlines follow terrain, with continuous dashes. | tools checks buildRibbons geometry. |
| tools/forestClear | X-ray clears nearby trees and releases the clearing when closed. | No direct ForestClear unit. |
| tools/xray | Ground points and the fictional paw trail appear near the player. | tools checks pawTrail. Loading, failure and reveal are largely browser-tested. |
| tools/xrayData | The prepared cloud decodes ground positions and filters cells by radius. | tools checks encoding, decoding and real data. |
| tools/tracks | Spurenleser shows the leader’s remaining route and the hounds’ recent tracks. | tools checks packView. Drawing and clearing live ribbons lack a direct unit. |
| tools/strings, tools/tools.css | German labels explain the tools. Styles present the reticle, plan legend and tape sheet. | No dedicated unit for either presentation file. |
| notes/index | F8 captures game state and recent events. Save, cancel, export and clear use the same local note store. Only active play advances telemetry. | notes-turn tests underlying rules. The modal and export are primarily browser-tested. |
| notes/logic | Keep a bounded, quiet event history. Track active quest time, deaths and stuck episodes across progress and reload. | notes-turn covers the ring and telemetry within a session. Persistence between flushes was uncovered. |
| notes/store | IndexedDB and the session fallback keep ordered snapshots with stable IDs. Clearing removes notes and telemetry. | No direct fallback isolation or clear test. |
| notes/capture | Capture a scaled JPEG of the current view. An unavailable canvas leaves the note usable. | No direct capture unit. |
| flaschen/spots | A stable ID and era place each bottle. Era totals and milestone thresholds describe collection progress. | flaschen tests geography, the 24 unique IDs and era totals. tour-kastanien checks spacing. |
| flaschen/index | Reach, light, era and holds govern collection. Preserve shaken and taken IDs, award lines at 8/16, then tint and codex at 24. Release removed cover collision. | Placement tests did not exercise the registered pickup, rewards, slot changes or collision ownership. |
| flaschen/model | Hanging and landed bottles and their cover props appear at their authored positions. | No direct model unit. flaschen checks placement data. |
| flaschen/shader | The glass and cover receive era lighting. | No direct shader unit. |
| flaschen/label | One swappable label supplies the bottle and collection display. | flaschen checks source isolation. Canvas output is untested by units. |
| flaschen/audio | A nearby bottle clinks in the correct direction when audio is available. | No direct audio unit. |
| flaschen/strings | Counts, milestone dialogue and directional captions describe each find. | No direct feedback-string unit. |
| progression/logic | Inventory limits, remaining quantities, taken IDs, set rewards and codex XP survive saves. | progression checks stack limits, full stacks, taken IDs, collection completion and codex XP within one session. Partial-stack placement replay was uncovered. |
| progression/index | Register collection events, award XP once and filter collection by era and storey. | progression and tour-kastanien test underlying counts and placement. Collection while changing eras and repeated codex XP events after reload lacked runtime tests. |
| progression/pickups | Tokens appear, remain visible until collected and disappear after collection. | progression covers warm-up and chestnut animation. Partial-stack visibility was uncovered. |
| chronik/logic, scenery/bauwagen-discovery | One-time clue and optional lore discovery, codex entries and saved flags. | chronik covers discovery, prerequisite gates and captured finds. bauwagen already covers the optional card and its reload. |

## Reproduced defects

All failures below were observed in Vitest before changing the implicated production behavior.

| Area | Observed failure and fix |
| --- | --- |
| Hunt load | An active three-hound pack was missing after loading over a five-hound pack, both within and across eras. Dismissing the outgoing simulation now preserves the incoming configuration. |
| Capture | Loading a peaceful slot during the capture delay still emitted `player:caught`. Loading now ends the outgoing capture and releases its input locks. |
| Reconfigured hunt | Reload reverted intensity from 0.8 to 0.2. After a mode switch seven hounds became five, a rider appeared, and the arena moved to the player. Save the settings applied to the running simulation. |
| Bottle collision | The last stump's circle still occupied (1557, −628) after the era changed. The collider cache now compares against the last list actually registered. |
| Bottle restrictions | A boss, pack or memorial from the outgoing slot kept a peaceful slot’s bottle hidden. Replacing the state clears its live holds and restores the saved memorial catalogue. Restored pack starts and ends update the pack arena independently of other threats. |
| Survey | A find left the relief scan on at exactly four elapsed seconds. Expiry now includes the deadline. Loading an untrained slot retained a level-three scan and historic map, and a queued cycle could open the incoming slot’s map. Clear pending requests and recheck skills after session start or load. |
| Measurement | A same-era load retained point A and continued claiming the interact action. The tape now stops on load. The picker also missed valid terrain at 600 m or closer than its first step. It now checks the final partial interval. |
| Notes | Reloading after 179 active seconds restored zero. Progress before an episode opened failed to schedule a reset write. The dirty flag now follows clock changes between periodic flushes. |
| Collectible stacks | Taking two chestnuts from a pile of five made the remaining three disappear visually. Replaying placement after a load increased the remainder back to five. Only an exhausted pickup animates away, and repeated placement of the same item and ID preserves its quantity. |

## Verification

Seven focused files add 147 assertion sites. They use explicit game steps, fixed save time,
in-memory storage and seeded simulation. One new design question is a Vitest todo.

```text
Focused Vitest   Test Files  7 passed (7)
                 Tests  36 passed | 1 todo (37)
                 Duration  243ms
pnpm typecheck   $ tsc --noEmit  (exit 0)
pnpm test        Test Files  131 passed (131)
                 Tests  1641 passed | 2 todo (1643)
pnpm validate    listen EPERM opening the tsx IPC socket  (exit 1)
node --import tsx scripts/validate-content.ts   ✓ content valid (1 warning(s))
pnpm build       ✓ 469 modules transformed.
                 ✓ built in 515ms
```

Both Vitest runs had zero failures. MissionControl validation passed. The locked smoke command
queued on the shared machine. A direct bind check returned `listen EPERM: operation not permitted
127.0.0.1:5445`, so the queued command was withdrawn before browser execution.

## Follow-ups

- Decide whether to persist the selected scan and historic map per slot when both slots have
  access. The sweep enforces unlocks and leaves the persistence decision in `survey-session.test.ts`.
- Run `pnpm validate` outside the sandbox and run the unchanged smoke spec:
  `KQ_E2E_PORT=5445 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line`.
- Git denied creation of the worktree's `index.lock` on the first staging attempt. All changes
  remain in the worktree. No voiced lines require new text.

## Intended local commits

The first test commit carries the inventory, fixture and passing coverage. Pair each regression
with its fix. Use `Refs: TASK-058` in the body and end every message with a blank line and
`Co-Authored-By: Codex <noreply@openai.com>`.

```text
test: map hunt and exploration coverage and exercise session boundaries
fix: preserve the loaded hunt when dismissing the outgoing pack
fix: cancel a pending capture when loading a slot
fix: save the effective pack settings after reconfiguration
fix: release collision when the last bottle cover disappears
fix: restore bottle visibility from the loaded slot
fix: track restored pack arenas independently of other threats
fix: end a relief scan at its four-second deadline
fix: recheck survey access and clear pending requests on load
fix: include the final terrain interval in tape picking
fix: clear an unfinished measuring tape on load
fix: persist changes to the objective inactivity clock
fix: keep partially collected stacks visible
fix: preserve pickup quantities when replaying a placement
docs: record the exploration regressions and gate results
```
