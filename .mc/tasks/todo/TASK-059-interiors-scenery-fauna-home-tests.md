---
id: TASK-059
aliases:
- TASK-059
title: 'Test coverage and bug sweep for interiors, scenery, fauna and home'
slug: interiors-scenery-fauna-home-tests
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- interiors
- scenery
- fauna
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Interiors, scenery, fauna and home

## Goal

Pin down what happens to rooms, doors, scenery, animal bodies and the Bauwagen discovery as the player moves, shifts era or resumes a save. Fix reproducible defects in these systems.

## Acceptance criteria

- [x] Map player behaviours to existing unit coverage, including untested boundaries.
- [x] Add at least 25 meaningful deterministic assertions across the area. Run the focused set in about three seconds or less.
- [x] Reproduce each defect before fixing it and record unresolved design questions as Vitest todos.
- [ ] Commit fixes individually. Git denied the worktree index lock after the initial task commit.
- [x] Update affected docs and the PRD log, run the four gate commands and check the smoke port.
- [ ] Pass all four gates as written. The sandbox prevented the validator CLI from starting.

## Plan

_Status: user-directed, 2026-11-26_

**Approach.** Trace the registered systems, state hooks and tests against the architecture and PRD. Exercise normal entry points with explicit simulation steps and real state where possible.

**Files to touch.** Tests under `tests/`, confirmed defects in the named modules, this task record, and the relevant sections of the architecture, action-RPG and PRD documents.

**Steps**

- [x] Audit modules and existing unit tests.
- [x] Add coverage for missing lifecycle, visibility, reward and persistence rules.
- [x] Run regression tests against the original behaviour, fix each confirmed defect and rerun.
- [x] Record gate results, the smoke result and follow-ups.

**Test plan.** Run the focused Vitest files, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. Run only the smoke spec through the machine lock if the sandbox permits it.

**Risks.** Keep tests headless and avoid changes to adjacent gameplay systems being worked on separately.

## Review fix round (2026-11-26)

Keep indoor saves and the Festsaal choice playable across shell streaming and era shifts.

- [ ] Preserve the saved floor through a fixed step and an autosave while the shell streams.
- [ ] Restore from a passage and keep movement onto the connected upstairs floor.
- [ ] Keep provisional palace collision active while the shell is absent.
- [ ] Suspend the Festsaal objects and prompt during an era shift and recreate an unresolved choice on return.
- [ ] Prove teleport cancellation directly below the saved room and probe the loaded gate's collision before changing it.
- [ ] Update the affected docs, run the four gates and check the smoke spec under the shared lock.

Use the shipped room and footprint data for the interior regressions and the Ehrenhof footprint for the gate probe. Compare the reviewed paths with `origin/main`, then commit the storey, Festsaal and gate coverage changes in reviewable groups.

## Progress

- Working branch `dev/task-059`, starting at `79c5718` (origin/main).

## Coverage map at 79c5718

Each row names a source module. Test names omit `tests/` and `.test.ts`. The audit checked imports and function names, then traced the calls made by the matching tests.

### Interiors

| Module | Player behaviour | Existing coverage and gap |
| --- | --- | --- |
| index | Enter or leave a room, resume on its storey, escape before a collapsed door blocks, interrupt the Festsaal choice | interiors-models covers furniture distance. integration-round2 consumes synthetic events and flags. No registered-system test exercised these transitions. |
| layout | Derive walkable rooms, openings, stairs and ruins from the catalogue | interiors checks the shipped plans and floor zones. |
| geom | Put the player, doors and furniture on the correct side of room outlines | Room and doorway samples in interiors exercise the polygon helpers. |
| stairs | Ascend straight, dog-leg and imperial stairs between storeys | interiors covers the stair ramps and upper landings. |
| collide | Pass through doors, stay on the right floor, avoid furniture and collapsed rooms | interiors, interior-door-state and camera-palace cover geometry and shared door blocks. Deferred blocking of an occupied room was untested. |
| festsaal | Face and take one of four choices, release the interaction and retain the decision | setpieces covers placement. Taking, interruption and queued placement were unpinned. |
| builder | Show foundations today, rubble in 1796, furnished rooms in the intact palace | interiors builds shipped rooms in all eras and checks foundations, candles and debris. |
| props | Walk around furniture and see furnishings suited to the era | Indirectly exercised by interiors builds. Furniture rendering is a visual check. |
| geobuf | Draw room surfaces as a merged mesh | interiors checks for finite geometry across the shipped buildings. |
| lightmap | See the light from windows in the room | interiors checks baked lighting data. |
| material | See room finishes respond to lighting, heat, smoke and collapse | Mesh/material construction is indirect. Shader appearance is a browser check. |
| shell | See through openings and enter a built palace facade | interiors checks glass and door-leaf extraction. Runtime shader cuts are visual. |
| beams | See joists fall or appear collapsed under reduced motion | No direct unit test. |
| flames | See the room fire, embers and smoke progress | No direct unit test of the drawn effect. |
| strings | Get room-entry and collapse feedback | No dedicated unit test of the feedback. |
| types | Relate walls, door endpoints, heights and IDs across systems | Data contracts exercised in interiors, setpieces and k3-stage. |

### Scenery

| Module | Player behaviour | Existing coverage and gap |
| --- | --- | --- |
| index | Approach and leave a site, shift away, resume gate/coat/window state and use the current colliders | scenery checks individual sets. Active streaming, era changes and replacement of a live slot were untested. |
| sets | See era-specific sites and pass the open Ehrenhof gate | scenery builds each set and checks the gate and clear routes. |
| builder | Place and remove one set's props, signs, models and solids together | scenery builds set batches. It did not exercise dropping an active batch. |
| bauwagen | Discover the solid green trailer only in today's forest | bauwagen checks terrain, geometry, route separation and the era declaration. |
| bauwagen-discovery | Read the note only at its door, collect one saved Codex card without XP | bauwagen covers facing, era, competing prompts, quiet, the reward and reload. Vertical reach, overlapping holds and resumption were gaps. |
| strings | Get the local examine prompt and scenery feedback | bauwagen loads the strings. No dedicated feedback test. |
| windows | Turn a share of a building's windows on in one era, including zero, and restore it | scenery checks the chapter's cue. No runtime check of the selection or its replacement. |
| passage | Cross the intact rotunda using its doorway, floor and pass zones | scenery covers floor profiles, collision and the chapter exit. |
| bleiche | See the linen line in 1789 and see the coat disappear when taken | bleiche covers layout and local show/hide. Restoration by the registered system was missing. |
| quelle | See the foliage and fittings around the spring | quelle-ferns and scenery exercise placements and build the set. |
| tour | Find the present-day benches and wayfinders without blocking the route | scenery checks mesh limits and route clearances. |
| court | See the dressed court and its people near the 1789 Ehrenhof | scenery checks paving, anchor and clearance. Movement and appearance are visual. |
| palace-plateau | Encounter present-day verge props with consistent solids across quality levels | palace-plateau covers placement, rejection rules and tier changes. |
| castle-understory | See plants at eligible present-day sites, away from paths and water | castle-understory covers placement, tier budgets and switching sites. |
| worldsets | See the chapter-specific kennels, menagerie, Festsaal furniture and directional signs | scenery checks clearances and authored sets. setpieces checks Festsaal placement. |
| orchard | See summer apples, bare winter branches and ruin-era stumps | Exercised by the avenue set builds. Seasonal appearance is visual. |
| rund | See the counted doors light progressively or quietly after a load | scenery checks the ring and house counts. Pulse/reset timing is unpinned. |
| linear | Walk through openings in long fences and railings | scenery checks gate and terrace routes. |
| models | See loaded models only while their set is present, including late asynchronous completions | No direct unit test of delayed attachment. |
| props | Recognise furniture, carts and other site fittings | scenery exercises their builders. party-set also uses the kit. |
| kit | Place merged geometry consistently, including seeded variations | Indirect coverage through scenery and set geometry tests. |
| signs | Read signs and painted boards on the intended set | Set builds exercise placement. Atlas rendering needs a browser. |
| material | See era lighting, glows and surface layers on props | party-set and surface tests cover material inputs. Shading needs a browser. |
| convoy | See the moving 1796 carts near the valley road | No direct unit test of the carts' lifecycle. |
| chair | See the armchair beside its owner in July 1793 | No direct unit test. |
| workers | See quarry workers strike in time with the scene | Indirect construction coverage through scenery. Animation is visual. |
| smoke | See local smoke and glows from the appropriate site | Indirect construction coverage. No dedicated visual test. |
| audio | Hear a strike nearby and fireworks during the echo | No direct unit test of audible output. |
| hohenburg | See the distant fortress in the correct direction, especially from the 1796 Westblick | No direct unit test of the horizon effect. |
| fireworks | See the echo progress through its phases and return to normal lighting | No direct unit test of runtime phases. |

### Fauna and home

| Module | Player behaviour | Existing coverage and gap |
| --- | --- | --- |
| fauna/index | Start with no bodies, spawn on demand, update from the camera and remove them on teardown | fauna tests the individual bodies and registry. Registered-system lifetime and races with pending loads were gaps. |
| fauna/registry | Ground spawns, identify bodies uniquely, keep cinematic subjects visible and reclaim disposed handles | fauna checks CRUD, grounding, guards, distance bands and counters. |
| fauna/standin | Keep a usable handle before its mesh arrives, recover a fallback, pose and show/hide it | fauna checks meshes, poses, limits, LOD and disposal. Multiple visibility reasons across a failed load were unpinned. |
| fauna/locomotion | Match gait, head turns and one-shots to speed and animation time | fauna covers weights, thresholds, IK and shot envelopes. |
| fauna/specs | Recognise the four bodies at their species sizes and recover from unknown IDs | fauna checks dimensions, coat paint and the generic fallback. |
| fauna/types | Use consistent clips, speed thresholds, distance bands and eye positions | fauna checks conformance, clip fallbacks, budgets and real mesh behaviour. |
| systems/home | Use the shared spring centre and twelve-metre hub ring, separately from the optional trailer | story covers wake/return and basic eligibility. combat consumes homeSpot. The shared radius boundary was unpinned. |

## Regression results

| Defect | Failing observation before the fix | Corrected behaviour |
| --- | --- | --- |
| Room identity on a shift | Leaving the upstairs Festsaal for today announced a leave from the Speisesaal in KB-B02. | Resolve the departing room in its original plan. |
| Indoor spawn after a load | The saved floor was 351.4 m. A deferred palace load grounded the player at 345.9 m, and a cold start selected the downstairs vestibule. | Retain the on-foot pose until the plan is available, keep the closed footprint from ejecting the player in the meantime and ground them on the saved storey. Later teleports supersede the resume. |
| Interrupted Festsaal choice | Both ending the fire and shifting left the choice active. A queued cue could create the objects after the interruption. | Clear queued and active choices with the fire state. |
| Departing scenery solids | The trailer disappeared on the shift event but its body still blocked the site until another fixed step. | Synchronise collisions when dropping the old era's sets. |
| Lit window share | A cue or a slot changing the same building and era from all panes to zero left the previous panes visible. | Include the share in the cached selection and remember empty selections. |
| Scenery ownership on a live slot load | A previously taken coat stayed missing in a fresh slot. A coat cue issued during story resume wrote to the old slot. | Bind the new scenery slice on state replacement and restore its coat, gate and windows before resumed cues. |

The four focused files contain 93 new assertion sites (39 interiors, 26 scenery, 17 fauna, 11 Bauwagen/home). The focused command includes four existing Bauwagen tests. The full suite contains one pre-existing travel todo and one new interior design todo.

## Verification

Node 24.19.0 and pnpm 12.3.4. Both unit runs had 0 failed.

```text
Focused Vitest   Test Files  4 passed (4)
                 Tests  26 passed | 1 todo (27)
                 Duration  682ms
pnpm typecheck   tsc --noEmit (exit 0)
pnpm test        Test Files  127 passed (127)
                 Tests  1627 passed | 2 todo (1629)
pnpm validate    listen EPERM on the tsx IPC socket (exit 1)
node --import tsx scripts/validate-content.ts
                 ✓ content valid (1 warning(s))
pnpm build       ✓ 469 modules transformed.
                 ✓ built in 339ms
```

The sandbox denied the local server probe with `listen EPERM: operation not permitted 127.0.0.1:5446`. Smoke was skipped under the task's port exception. No e2e specs were edited. No voiced lines require new text.

## Follow-ups

- Decide whether remaining in the same room across two intact eras should replay the entry cue. The dedicated `it.todo` records the question and the existing behaviour is preserved.
- Run `pnpm validate` and `KQ_E2E_PORT=5446 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line` on a machine that permits local listeners.
- The plan commit is `168379f`. Git denied the next `git add` with `index.lock: Operation not permitted`. The implementation and documentation are in the worktree. To commit them with the requested attribution, use the following commands, selecting the named fix's hunks at each interactive stage.

```sh
coauthor='Co-Authored-By: Codex <noreply@openai.com>'
git add tests/interiors-runtime-fixture.ts tests/interiors-runtime.test.ts tests/scenery-runtime.test.ts tests/fauna-runtime.test.ts tests/bauwagen.test.ts
git commit -m 'test: cover room, scenery, fauna and home lifecycles' -m "$coauthor"

git add -p src/systems/interiors/index.ts
git commit -m 'fix: report the room left when changing palace plans' -m "$coauthor"
git add -p src/systems/interiors/index.ts
git commit -m 'fix: restore the saved palace storey after loading' -m "$coauthor"
git add src/systems/interiors/index.ts
git commit -m 'fix(story): clear interrupted Festsaal choices' -m "$coauthor"

git add -p src/systems/scenery/index.ts
git commit -m 'fix: release old scenery obstacles on era change' -m "$coauthor"
git add -p src/systems/scenery/index.ts
git add src/systems/scenery/windows.ts
git commit -m 'fix(render): rebuild lit windows when their share changes' -m "$coauthor"
git add src/systems/scenery/index.ts
git commit -m 'fix: restore scenery state before resumed story cues' -m "$coauthor"

git add docs/ARCHITECTURE.md docs/ACTION-RPG.md docs/PRD.md .mc/tasks/todo/TASK-059-interiors-scenery-fauna-home-tests.md
git commit -m 'docs: record the world interaction sweep' -m "$coauthor"
```
