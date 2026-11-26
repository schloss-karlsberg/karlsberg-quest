---
id: TASK-054
aliases:
- TASK-054
title: 'Test coverage and bug sweep: audio, voice, music, ambience, barks and footsteps'
slug: audio-coverage
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- audio
- voice
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Audio coverage and bug sweep

## Goal

Map player-facing audio behaviour, add focused regression coverage, and fix confirmed defects in
the audio engine, ambience, footsteps, barks and spoken-dialogue paths.

## Acceptance criteria

- [x] Record each module's player-facing contract and existing unit coverage.
- [x] Add at least 25 deterministic assertions across the area in a focused run under about three seconds.
- [x] Reproduce each confirmed bug before changing behaviour and record design questions as test todos.
- [ ] Commit each fix separately. The sandbox denied Git's worktree index lock.
- [x] Update the affected docs and the PRD changelog.
- [x] Pass typecheck, the full unit suite with zero failures and the production build.
- [ ] Pass the `pnpm validate` gate as written. Its launcher could not open its IPC socket. The validator itself passed when run directly.
- [x] Run the locked smoke spec on port 5441 or record the sandbox blocker and human-run command.

## Plan

**Approach** — Follow the task brief on `dev/task-054`. Trace audio routing, event and save
boundaries from the registered systems, and exercise them with deterministic audio and UI fakes.

**Files to touch** — Unit tests in `tests/`, in-scope runtime modules where tests prove a bug,
the game docs and this task record.

**Steps**

- [x] Inventory the runtime modules, related tests and coverage gaps.
- [x] Exercise representative player-visible contracts and reproduce candidate bugs on the branch base.
- [x] Apply targeted fixes and rerun the regressions.
- [ ] Commit the fixes separately when the Git index is writable.
- [x] Run the gates, check smoke prerequisites, document the outcome and record follow-ups.

**Test plan** — Run targeted Vitest files, then `pnpm typecheck`, `pnpm test`, `pnpm validate`
and `pnpm build`. Use the shared lock and port 5441 for `e2e/smoke.spec.ts`.

**Risks** — Keep gameplay content and concurrent UI, save and world work outside the patch.
Use explicit simulation steps and stubbed time and audio. Preserve all shipped recordings.

## Progress

- Branch `dev/task-054` started at `79c5718` on 2026-11-26.
- Checked module imports, public functions and event names against `tests/`. The inventory below
  uses test basenames.
- Added 16 tests covering mixer activation and volume persistence, live ambience and score,
  footsteps, bark rules at runtime and the presenter working with recorded or fallback voice.
  The tests use a fake audio clock, explicit game ticks, fake timers, seeded random inputs and a
  gated clip fetch. They exercise more than 25 assertions in 412 ms.

| Area | Failure reproduced on the branch base | Fix |
| --- | --- | --- |
| Clip fetch queue | The current line lost the next slot whether it was already in the full queue or entered as urgent. | Move the requested clip to the queue head and keep it there when background preloads force eviction. |
| Bark session state | Loading an earlier slot left an old bark request and quiet deadlines measured on the old slot's clock. Starting a new game could inherit an old dialogue deadline. | Reset transient requests and deadlines on state replacement before load listeners can resume dialogue. Keep the serialized cooldowns and memorials. |
| Voice on load | Loading an inactive story left a recording playing and its active and queued subtitles in the presenter. | Clear the presenter on every successful load. Resume the beat only for an active story. |

### Verification

```text
pnpm typecheck
$ tsc --noEmit

Focused run
      Tests  16 passed | 17 skipped (33)
   Duration  412ms

pnpm test
 Test Files  126 passed (126)
      Tests  1621 passed | 3 todo (1624)

pnpm validate
Error: listen EPERM: operation not permitted (tsx IPC socket)

node --import tsx scripts/validate-content.ts
✓ content valid (1 warning(s))

pnpm build
✓ 469 modules transformed.
✓ built in 538ms
```

The full unit suite had zero failures. `mc validate` passed. The sandbox denied loopback
binding on `127.0.0.1:5441` with `listen EPERM`, so the smoke test requires a browser-enabled
environment. No voiced lines need new text.

### Follow-ups

- Decide whether an already-audible era-specific warning should finish or cut when its subtitle
  expires on shift. The test todo in `tests/story-voice.test.ts` records the decision.
- Decide the cadence of procedural speech with reduced motion, where the whole subtitle is shown
  immediately. The recorded-voice path is covered, and the fallback cadence remains a test todo.
- Run `pnpm validate` with access to the launcher socket and run the smoke spec with
  `KQ_E2E_PORT=5441 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line`.

### Local commits pending

The sandbox denied creation of the existing worktree's `index.lock` during `git add`. The changes
are in the worktree. Run these commands there with a writable index.

```sh
git add src/systems/story/dialogue/voiceClips.ts tests/voice-clips.test.ts
git commit -m 'fix(story): prioritize current voice clips in a full preload queue' -m 'Co-Authored-By: Codex <noreply@openai.com>'

git add src/systems/barks/index.ts tests/barks-runtime.test.ts
git commit -m 'fix(story): reset transient bark deadlines when replacing a session' -m 'Co-Authored-By: Codex <noreply@openai.com>'

git add src/systems/story/index.ts tests/story-voice.test.ts tests/audio-fixture.ts
git commit -m 'fix(story): clear active voice and subtitles when loading a save' -m 'Co-Authored-By: Codex <noreply@openai.com>'

git add tests/audio-mix.test.ts docs/ARCHITECTURE.md docs/PRD.md docs/ACTION-RPG.md .mc/tasks/todo/TASK-054-audio-coverage.md
git commit -m 'test: expand audio runtime coverage and document the sweep' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```

## Coverage inventory

| Module | Player-facing contract | Coverage at `79c5718` |
| --- | --- | --- |
| `audio/audio` | Gesture unlock and resume, hidden-tab suspension, independent sliders and mute, pause attenuation, overlapping speech ducking, camera listener and positional voice, shared noise | `audio-mix` covers gain routing, pause, mute, overlap and moving emitters. No direct suspended activation, visibility lifecycle or cold settings round trip. |
| `audio/synth` | Wind gusts, score/drone intensity, surface-specific walking/running, horn and bird cues, silent guards while locked | `audio-mix` covers gravel and some routing. Surface variants, envelopes and bed lifecycle lack focused assertions. |
| `audio/ambience` | Pond/brook loops and fades, distant hoofbeats and court murmurs | `audio-mix` verifies initial routing and hoofbeats. No bed fade or teardown assertions. |
| `systems/ambience/profile` | Outdoor crossfades, court in 1789, frozen or silent water in winter/night | `ambience` covers the route and eras. |
| `systems/ambience/index` | Updates beds with place, elevation, flight and era; captions use the sound-caption setting; unlock and dispose own loops | `ambience` covers captions with audio locked and `audio-mix` checks routing. No assertions on live bed gain across flight and era changes. |
| `systems/barks/rules` | Deterministic draw within eligible groups, rotation, priority, global/line cooldown, memorial and quiet checks | `story-ext` and `integration-round2` cover the pure rules and shipped memorial data. |
| `systems/barks/index` | Event gating, drop stale requests, stay quiet during dialogue/echo/cutscenes/memorials, idle restarts on input; preserve cooldowns and memorials in saves | No direct runtime tests for event handling, request expiry or reload. |
| `systems/footsteps/index` | One SFX cue per eligible step, crouch/prone attenuation, cleanup after the cue, no caption | `audio-mix` checks present-day gravel and caption policy. Locked, stance/running and other materials lack coverage. |
| `story/dialogue/voiceManifest` | Base paths, id/hash and speaker matching, variant and template lookup, stale validation, codec selection, LRU | `voice-manifest`, `voice-assets` and `voice-pipeline`. |
| `story/dialogue/voiceClips` | Background preloads, capped queue/fetches/cache, ready clips only, missing/stale/failed fallback | `voice-clips` covers parsing, decoding, concurrency, format and fallback. Queue saturation and reprioritization lack coverage. |
| `story/dialogue/voice` | Per-speaker clip/murmur effects, coupled ducking, stop/end and pause offset | `audio-mix`, `voice-manifest` and `voice-playback` cover routing, preset contracts, end and pause offset. |
| `story/dialogue/presenter`, `queue`, `portraits`, `speakers` | Subtitle text, metadata, pacing and skips; touch/reduced motion; typed fallback, paused playback; queue order and expiry | `story`, `story-ext`, `story-touch`, `story-flow` cover helpers and the pure queue. `e2e/voice.spec.ts` exercises playback, subtitles and skip in a browser. The presenter lifecycle has no direct unit coverage. |
| `story/dialogue/triggers`, story runtime and `story/sfx` | Match dialogue to game events; pause across menu/echo, era expiry, load replaces playback; caption scripted cues independently of sound | Trigger coverage in `story`, `story-ext` and `content`; cues in `audio-mix`. No story-runtime unit check for a live clip through shift, pause or load. |
| `core/save` settings and boot wiring | Persist each volume, keep zeros and upgrade older settings, apply at boot and on updates; start gesture and visibility feed the audio manager | `core` covers music persistence; `audio-mix` tests the manager's independent gain paths. No cross-bus settings round trip. |
