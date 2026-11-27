---
id: TASK-010
aliases:
- TASK-010
title: 'More tour audio: a real, historically accurate guided tour'
slug: more-tour-audio-a-real-historically-accurate-guided-tour
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- audio
- content
- history
sprint: "[[SPR-001]]"
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-26
---

# More tour audio: a real, historically accurate guided tour

> Core dev team task (not community).

## Description

The guided tour should feel like a real tour: interesting and historically correct, with much more
sound: guide narration, ambience (birds, wind, gravel steps; distant horses and court sounds in past
eras) and SFX at the stops.

### Current state

- **Tour script:** `content/story/00-tour.story.json` (beats `t1`–`t18`, hand-authored), route
  `content/routes/p-fuehrung.json` (points `wind`, `reh`, `weiher`, ...). Design with stop texts and
  sources: `content/bible/01-prolog.md` (stations at the Wanderparkplatz, Felsenpfad, Weiher,
  Quelle), codex sources `content/bible/07-codex.md`, voices `content/bible/08-stimmen.md`.
  The tour has 37 `say` actions (about 23 guide lines) and only 3 `sound` actions (wind, bark, compass).
- **Voice clips:** `public/voice/` (~13 MB, Opus `.webm` + AAC `.m4a` per line, `manifest.json`),
  loaded by `src/systems/story/dialogue/voiceManifest.ts` / `voiceClips.ts`, played by `voice.ts`
  (lines without a clip use a procedural "murmur"). Subtitles by the dialogue presenter
  (`src/systems/story/dialogue/presenter.ts`); `sound` actions carry a `caption`.
- **Audio engine:** `src/audio/audio.ts`: master → music / sfx / ambience / voice buses, 3D sources
  (PannerNode, HRTF), listener on the camera; a global duck only for the pause menu (no ducking under
  voice yet). SFX are synthesized (`src/audio/synth.ts`, `src/systems/story/sfx.ts`); ambience is
  procedural (`src/systems/ambience/index.ts`: wind, birds by day, a drone at night); footsteps in
  `src/systems/footsteps/`. Volumes per bus in settings (`volume` in `src/core/save.ts`).
- **Voice pipeline and rules:** `scripts/voice/` (`pnpm voice:plan`, `pnpm voice:gen`; speakers in
  `speech.json`, `voices.json`), rules in `scripts/voice/assetRules.ts`: only approved synthetic
  MOSS-TTS clips (output CC0), credited per voice in the `voices` list of `public/assets/LICENSES.json`;
  enforced by `tests/voice-assets.test.ts`; size budget ~80 MB for all voice. See CONTRIBUTING.md
  "Art assets" and `docs/VOICE-MEDIA-RESEARCH.md`.
- **Recorded SFX / ambience files:** none yet. Any new file must be CC0 from an allowed source (or own
  work) and credited; `ALLOWED_SOURCES` in `src/assets/types.ts` may need an audio source added (owner's OK).

### Historical accuracy

- Every new narration fact needs a source (literature, museum, Wikipedia with references), listed per
  line in the task's script or in a sources file next to the tour design (proposal:
  `docs/design/tour/sources.md`), and in the codex where a card exists.
- Unverified claims stay marked as open, also in the guide's mouth (tour design decision 15).
- Candidate topics, linked to TASK-003 / TASK-004 (all **per owner notes, verify**): the Duke's hunting
  passion and the game enclosures, the treasures saved in 1793 (walking stick, Hebe and Ceres stoves,
  pipe and tobacco-box collection), the painting gallery that became the core of the Alte Pinakothek,
  the Herzogskastanien (already in the codex, `scripts/content-build/codex.mjs`).

### Owner notes (2026-11-25)

- "It should be a historically correct audio tour, and the guide voice should be awesome to listen to."
- Treat the guide's voice as a casting decision: run a MOSS casting round for Gerold Imhoff (warm, engaged,
  storytelling pace; a voice people enjoy for minutes, not just single barks) and let the owner pick by ear
  before generating the new narration. The current Imhoff clips are re-generated with the pick.
- The player voice (the speaker named in the credits, real-person MOSS voice) is on branch `feat/player-voice`.

### Proposed steps

1. Audit the tour stops for missing or thin narration (per beat in `00-tour.story.json`).
2. Write a researched script per stop (German lines, sources per fact); keep lines short and skippable.
3. Ambience beds per area and era (forest, Weiher, Quelle, palace plateau; 1789 court sounds, horses).
4. SFX per scripted moment (dog scene `t8`, deer scene `t10` once TASK-001 is done, compass at the Quelle, gravel steps).
5. Mix: levels per bus, ducking of ambience / music under voice, spatial sources at the guide.
6. Generate the voice clips with the repo pipeline (maintainers) and credit them.

## Acceptance Criteria
- [x] Every tour stop has guide narration and an ambience bed
- [x] Sources documented for every new fact and unverified claims marked (slice 1 script)
- [x] Licences and credits in place (`LICENSES.json`, `tests/voice-assets.test.ts`, `tests/assets.test.ts` green)
- [x] Subtitles / captions for all new lines and sounds
- [x] Audio settings respected (bus volumes, mute), and voice ducks ambience
- [x] Voice size stays within the budget
- [x] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass and docs updated (`docs/ACTION-RPG.md` §14, `docs/PRD.md`) for slice 1

## Plan · Slice 1

_Status: approved (2026-11-25, coordinator for the owner)_

**Approach:** Slice 1 prepares Gerold Imhoff's narration. Give the owner a casting round they can judge over a whole stop, and give the content team a German script they can trace to sources line by line. Script research can proceed while the auditions are queued. Production recording starts in a later slice once the owner has picked a voice and the text is final.

**Files to touch:**

- A local casting directory outside all Git worktrees — audition job JSONL, candidate settings, raw WAV destinations and a standalone `index.html` listening page.
- `docs/design/tour/sources.md` — the German script in route order, with beat and line IDs, exact source references and links to existing codex cards.
- This task file — record the casting handoff and, once received, the owner's pick and the reproducible voice settings.
- `docs/ACTION-RPG.md` §14 and `docs/PRD.md` — log the casting and script deliverables when slice 1 ships.

**Steps:**

- [x] 1. Keep the current synthetic Imhoff as A. Design three original German male voices from text instructions and audition two seeds for each on the same “Guckt mal hoch” passage from `imhoff.t.02`. B is a warm storytelling baritone around sixty, C a lively narrator with a light Saarpfalz lilt and wry humour, and D a calm, deep documentary narrator.
- [x] 2. Queue A’s nine lines in moss-service and prepare B/C/D as a reference-free MOSS design batch using the tour casting workflow. Give the owner an offline page to pick one design per candidate and a command that registers the three selected synthetic WAVs under audition-specific IDs and submits the same nine lines per pick. Keep the reference hash, seed and delivery settings. Provide A/B/C/D controls for individual lines, the whole Wanderparkplatz stop and the separate Felsenpfad uncertainty sample.
- [x] 3. Map `p-fuehrung.json` to the live `t1`–`t18` beats. Cover the Wanderparkplatz (`t1`–`t2`, including the two `npc:talk` lines in `tour.pack.json`), Felsenpfad (`t6`), Karlsbergweiher (`t13`) and Karlsbergquelle (`t15`). Account for `abzweig`, `einstieg`, `wind`, `reh` and `damm` as walking, animal or meeting cues. Record where Gerold speaks and where the action needs silence, including the handoff to Laub.
- [x] 4. Research and write short, individually skippable German lines for each station. For each factual clause record its line ID, source title, page or section and URL or edition, plus the matching codex card where one exists. Start with the Homburg historical guide for the Baumagazin, the trail leaflet for the Felsenpfad, and the water and terrain sources in `07-codex-impact.md` and `cx.41`. Check each original for the precise claim. Mark uncertainty OFFEN and let Gerold say it aloud, particularly for the pond's purpose and the spring's possible supply to the palace. Label invented story material FIKTION.
- [x] 5. Read the script aloud in route order. Check that the group can hear a line before the next cue, that the German text works as a subtitle, and that each historical claim can be located in its source. Record the owner's candidate ID, reference hash, seed and settings when selected, alongside the final line list for production.

**Test plan:** Compare the script against `content/routes/p-fuehrung.json`, `content/story/00-tour.story.json` and `content/packs/tour.pack.json` for stop coverage, IDs and triggers. Check every citation against its cited passage. For the owner audition, render the six design samples, select B/C/D in the external listening page, submit their audition lines and run the service. Reopen the page to compare individual lines and all eight Wanderparkplatz clips in order for A/B/C/D. Listen for place-name pronunciation, phrasing and fatigue. Run `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build` before the slice PR. In-game subtitle, skip and playback checks in `e2e/tour-slice.spec.ts` and `e2e/voice.spec.ts` belong to integration.

**Risks:** Audition jobs using production line IDs could overwrite production results. Give each candidate its own audition IDs and files. The design bible uses earlier beat numbering, so place lines against the live story and route. A map can locate the dam or spring, but a claim about its historical use needs documentary evidence.

**Open questions:** Which candidate does the owner want to hear for the rest of the walk? Record the decision after the listening round.

**Acceptance criteria coverage** (planned for slice 1)

| Epic criterion | Coverage | Evidence or remaining work |
| --- | --- | --- |
| 1. Guide narration and ambience at every stop | partial | German script for all four stations and connecting cues. Playback and ambience follow. |
| 2. Sources and unverified claims | full | Every new fact in the script has a checkable citation. Each open claim is marked in the script and qualified in the spoken text. |
| 3. Licences and credits | follow-up | Auditions stay local. Production voice and sound assets require credits and passing asset tests. |
| 4. Subtitles and captions | partial | Each guide line has German subtitle text. In-game display and sound captions follow. |
| 5. Audio settings and ducking | follow-up | Verify bus volumes, mute and ducking in the mix slice. |
| 6. Voice size budget | follow-up | Measure the encoded production clips with the rest of `public/voice/`. |
| 7. Four gates and docs | full | Run all four gates for the slice PR and record the delivery in both docs. Repeat for later PRs. |

**Follow-up slices:**

- Integrate the reviewed lines into the hand-authored tour story and pack, mirror sources into existing codex cards via their builder, and check station timing, subtitles and skipping on keyboard and touch.
- Adopt the owner's pick for `imhoff`, regenerate the existing Imhoff clips (including barks) and record the new text-final narration through the owner-run service. Collect Opus/AAC pairs, update the manifest and CC0 credits, and check the 60 MB warning and 80 MB limit. The player voice is owned on `feat/player-voice`.
- Add area and era ambience for forest, Weiher, Quelle and plateau, including distant court and horse sounds in 1789. Seek owner approval before adding any recorded-audio source to the allowlist.
- Add captioned cues for the dogs at `t8`, deer at `t10` after TASK-001, gravel steps and the compass at the Quelle. Credit each new recording.
- Mix the guide at their world position, duck ambience and music during speech, and verify mute and saved bus levels through skip, pause and resume.
- Revisit the owner-verification topics from TASK-003/TASK-004 (hunting and enclosures, saved treasures, the gallery and Herzogskastanien) after owner verification and independent sourcing.

## Progress · Slice 1

- Branch `feat/task-010-tour-audio`.
- 2026-11-25 — Casting correction. Removed exactly 18 queued B/C inbox files for `karlsberg-quest-task010-audition`, checking each against its original request. The service provides no cancellation command. The nine A (`imhoff`) files were verified byte for byte. Laub and Jost retain their own roles.
- 2026-11-25 — Six reference-free MOSS jobs are staged in `design-jobs.json` outside Git. Seeds are B 6101/6102, C 6201/6202 and D 6301/6302. The service accepts registered references, so these six use the same local design generator as the original tour cast. The live service inbox holds nine A jobs. All 27 new station and question jobs await the owner's seed choices.
- Open the local audition page at `<voices-worktree>/casting-guide/index.html`. From its directory run `"$HOME/kq-models/scripts/run_batch.sh" "$PWD/design-jobs.json" "$PWD/raw/design"`. Listen to both designs per candidate and select B, C and D. Run the page's generated `queue-picks.py` command to pin those references and queue nine lines for each. Run `moss-run`, reopen the page and compare A/B/C/D over the whole stop. `candidates.json` records instructions, seeds and selected hashes. `submission.json` identifies the design batch and service receipts. `audition-jobs.jsonl` records the service requests.
- 2026-11-25 — Verified the six pending jobs with the tour casting planner. An isolated service inbox accepted 27 audition lines for test selections and retained exactly 27 on retry. Checked the offline page logic for all six previews, all four eight-line playlists, the separate question and missing-file feedback. Listening awaits owner synthesis.
- 2026-11-25 — Step 3: checked all 18 beats, nine route stops and two once-only talk triggers against the live JSON. The route table lists Gerold's cues, the space for animals and Marlene, and Laub's handoff. The station flags at `t6`, `t13` and `t15` can retire queued lines, so the integration slice needs to tie departure to completion or skip of the station sequence.
- 2026-11-25 — Step 4: checked the archived municipal guide and current city guide, the trail leaflet, the Hohenburg excavation report, the spring photograph, the mapped waterways and the present-day terrain grid. Drafted 19 subtitle lines across the four stations in `docs/design/tour/sources.md`, with a citation for each factual clause and spoken uncertainty for the quarry, pond and spring.
- 2026-11-25 — Step 5: rehearsed all 19 lines in route order with temporary German speech at 145 words per minute. The welcome is about 10 s and the stations about 18–22 s each. The longest subtitle is 89 characters. Checked that every FAKT row has a citation and every OFFEN row voices the uncertainty. Verification of the selected voice, in-game timing, subtitles and skip belongs to integration (`e2e/tour-slice.spec.ts`, `e2e/voice.spec.ts`).
- 2026-11-25 — Gates green. Typecheck, 1,493 unit tests, content validation and build passed. Validation reported the existing content warnings. The original shared dependency symlink was replaced with a worktree-local installation of the locked dependencies to run the gates. Updated ACTION-RPG §14 and the PRD changelog.
- 2026-11-25 — The sourced script and original casting setup were committed in `d2c1b76`. For the casting correction, typecheck, all 1,493 tests on retry, build and `mc validate` passed. The sandbox denied the tsx IPC socket for `pnpm validate` on this rerun.
- 2026-11-25 — The sandbox denied creation of the worktree index.lock during staging. The casting correction is ready for the local commit `docs(tour): recast the guide audition with new voices`.

## Plan

_Status: approved 2026-11-25 (coordinator for the owner)_

**Approach:** Slice 2 adopts the owner's choice of candidate D, deep documentary, from design job `kq010-guide-d-design-s6301`. Use its instruction, German language setting and seed 6301 for production, and pin the public synthetic registry entry and credit to the copied reference. Integrate the reviewed script at the four stops and use the dialogue presenter to hold each station until its lines finish or are skipped. Submit the full Imhoff line set for service generation.

**Files to touch:**

- `scripts/voice/voices.json`, `scripts/voice/speech.json`, `public/assets/LICENSES.json` and `public/voice/` — pin the selected voice, remove superseded speech overrides and retire the previous Imhoff clips when changing their credit.
- `content/story/00-tour.story.json` and `content/packs/tour.pack.json` — add the reviewed lines in route order and retain the parking-lot greeting interaction.
- The story timeline, dialogue presenter and their tests — wait for the station lines to clear before departure, including when the player skips a subtitle or resumes a save.
- `e2e/tour-slice.spec.ts`, `docs/design/tour/sources.md`, `docs/ACTION-RPG.md` §14 and `docs/PRD.md` — verify the stop flow and record the integration.
- Local voice directory and moss-service registry — copy the synthetic reference WAV as `imhoff-doc-ref.wav` and register it under `imhoff`.

**Steps:**

- [x] 1. Copy, hash and register the voice. Update production settings and credit, and retire the previous encoded clips and manifest entries.
- [x] 2. Integrate the 19 reviewed lines, preserve the interaction and walking beats, and add checks for subtitle order, skip and the departure hold.
- [x] 3. Check that the voice plan selects every Imhoff line, including all barks, and submit the batch with the Node service client.
- [ ] 4. Run the four gates and the two requested single-worker Playwright specs where the sandbox permits. Record the results and commit locally.

**Test plan:** Run the story and voice asset unit tests, `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`, and `mc validate`. Run `scripts/dev/heavy.sh -- pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1` and the same command for `e2e/voice.spec.ts`. Check captions at the parking lot, Felsenpfad, pond and spring using the tour spec's station views.

**Risks:** Stale recordings would link the new credit to the old reference. The source text and procedural speech remain available while replacement recordings are pending. Early arrival, subtitle skip and reloads can change station timing; check the exact departure conditions.

**Open questions:** None for this slice.

**Acceptance criteria coverage:** Guide narration and subtitles at the four stops are full for the reviewed script and partial for the final audio. Sourcing is full. Voice credit and asset checks cover the replacement configuration. Ambience, sound captions, mixing and the final encoded voice budget remain follow-ups. The four gates and docs apply to this slice in full.

**Follow-up slices:** Collect and encode the service results, connect the existing NPC conversation panel to recorded clips, and verify the recorded tour and voice budget. Add ambience, captioned SFX and the final mix. Owner-verification research topics remain open.

## Progress

- Branch `feat/task-010-guide-voice`.
- 2026-11-25 — Step 1. Copied the owner's D reference to `imhoff-doc-ref.wav` outside Git and verified public synthetic registry entry `imhoff`. Design and line seed 6301, language German, `max_tokens=1000`, SHA-256 `7021a50b5206133183ba4a6a4cd3ee4d888b74fe8cf613c7656803e87b3b92ab`. The instruction is pinned in `scripts/voice/voices.json`. Updated the credit, removed two superseded speech overrides and retired the 24 old recordings and their 48 encoded files.
- 2026-11-25 — Step 2. Integrated all 19 reviewed subtitles. The station timeline advances when each current subtitle and recording clear or the player skips it. The guided walk waits while the parking-lot conversation is open, with a timeout for players who pass on it. Added checks for all three greetings and the tour's departure conditions. Updated the tour sources, ACTION-RPG §14 and the PRD changelog.
- 2026-11-25 — Step 3. Submitted all 43 Imhoff lines under the `karlsberg-quest` service project, including five barks and nine party or ending lines. The service returned 43 queued and zero cached. Used `--ids 'imhoff.*'` because the default priority tiers omit this speaker.
- 2026-11-25 — Step 4. `pnpm typecheck`, `pnpm test` (1,505 passed), `pnpm build`, `mc validate` and `git diff --check` passed. The sandbox denied the `tsx` IPC socket for `pnpm validate`. The sandbox also denied the preview server bind at `127.0.0.1:5281` before `e2e/tour-slice.spec.ts` and `e2e/voice.spec.ts` could run. Both were invoked individually through `scripts/dev/heavy.sh` with one worker.
- 2026-11-25 — Staged the slice. The sandbox denied the worktree `index.lock` during `git commit`. The pending local commit is `feat(tour): integrate reviewed guide narration`.
- 2026-11-25 — The first ten documentary takes included six at 77.44 s and a 49.84 s bark with audible-level signal through its last second. The 7.04 s design reference has about 0.25 s of trailing silence. Kept the reference and seed, removed the design instruction from line synthesis and registered the change with the service CLI. Both generation paths now size Imhoff's token budget from the prepared speech.
- After the runner exited, the service accepted all 43 forced submissions with zero cache hits. Verified 62–256 tokens per job in the inbox. Typecheck and all 177 voice tests passed. The replacement audio awaits the owner's run and listening check. The CLI replaced 25 stale jobs by project and ID. Each suffix below follows `imhoff.t.` in the replaced ID.

  - `los`, `marlene`, `pause`, `reh.alert`, `reh.schnell`, `reh1`, `reh2`, `reh3`
  - `station1`, `station1a`, `station1b`, `station2`, `station2a`, `station2b`, `station2c`
  - `station3`, `station3a`, `station3b`, `station3c`, `station4`, `station4a`, `station4b`, `station4c`, `weiter`, `wind`

## Plan — slice 3

_Status: approved (2026-11-25, coordinator for the owner)_

**Approach:** Core dev will add procedural ambience along the guided walk and the ascent to the palace plateau. Blend the beds using the player's location and era, reuse the spring scene's local water source, and caption distinctive water and 1789 activity in German. Mix speech through its existing bus with separate ducking for ambience and music, and position Gerold's dialogue at his live tour body. Treat the imagined 1789 activity as Fiktion.

**Files to touch:**

- `src/audio/` — synthesize water and distant activity, add speech ducking and maintain the positional voice output.
- `src/systems/ambience/` — zone and era profiles, scene lifecycle and German captions.
- `src/systems/story/index.ts` and the voice and speaker modules — connect Gerold's existing speech paths to the live body and bind ducking to voice playback. Keep the tour script and dialogue timing and queue available to `feat/task-010-guide-voice`.
- `tests/`, `docs/ACTION-RPG.md` §14 and `docs/PRD.md` — protect audio and settings behavior and document the slice.

**Steps:**

- [x] 1. Map the route to blended forest, Weiher, Quelle and plateau beds with era-specific profiles and tests.
- [x] 2. Add the synthesized beds and occasional captioned 1789 activity, and wire them to audio unlock and the existing ambience controls.
- [x] 3. Duck ambience and music under voice, route Gerold's speech to the live NPC, and verify playback lifecycle and settings in unit tests.
- [x] 4. Update both design docs, run the four gates and `mc validate`, list the browser verification, and prepare the local commit.

**Test plan:** Run `pnpm typecheck`, `pnpm test`, `pnpm validate` (use `node --import tsx scripts/validate-content.ts` if the tsx IPC listener is blocked), and `pnpm build`. Unit-test the route transitions, era selection, ambience lifecycle, speech ducking and spatial routing. List `e2e/tour-slice.spec.ts`, `e2e/voice.spec.ts`, `e2e/npc.spec.ts`, `e2e/chronik.spec.ts`, `e2e/smoke.spec.ts`, `e2e/touch.spec.ts` and `e2e/perf.spec.ts` for one-worker browser verification. For listening and caption checks, use `?debug&nosave&fresh` at the car park, Weiher (897, −845), Quelle (1062, −837) and plateau (1216, −1114), comparing today and 1789 and checking master, voice, ambience and music at zero, then resume. Browser execution and screenshots are outside this session's scope.

**Risks:** Keep ambience and score ducking independent of saved bus levels and the spring and era transition fades. Use the existing live guide binding for story and NPC talk. Keep the route ambience gradual and the historical cues infrequent enough to hear the narration and read the captions.

**Open questions:** Final levels and intelligibility need an in-game listening pass.

**Acceptance criteria coverage** (planned for slice 3)

| Epic criterion | Coverage | Evidence or remaining work |
| --- | --- | --- |
| 1. Guide narration and ambience at every stop | partial | Area beds cover the walk and ascent. Narration production is separate. |
| 2. Sources and unverified claims | full | The earlier script covers sourced claims. The generated 1789 scenes are fiction. |
| 3. Licences and credits | partial | This slice synthesizes audio at runtime. Voice production credits are separate. |
| 4. Subtitles and captions | partial | Caption distinctive water and 1789 activity. Scripted stop cues are separate. |
| 5. Audio settings and ducking | full | Verify the mix, mute and saved levels during speech. |
| 6. Voice size budget | follow-up | Measure when the production voice files land. |
| 7. Four gates and docs | full | Run and log the slice gates and update both docs. |

**Follow-up slices:**

- Complete the guide voice casting, production and integration on the voice track.
- Add the scripted dog, deer, gravel and compass cues. Obtain owner approval for any new recorded source.
- Verify the historical topics from TASK-003 and TASK-004 with the owner and check independent sources.

## Progress — slice 3

- Branch `feat/task-010-ambience`.
- 2026-11-25 — Step 1 complete. Blended profiles use the bundled walk and ascent stops. Three focused tests passed, covering the route, area boundaries and the five eras. Installed the locked dependencies offline in the worktree after the shared dependency symlink proved read-only.
- 2026-11-25 — Step 2 complete. Added a lapping shore, a ravine brook bed, and alternating fictional hoofbeats and court murmurs. The existing spring spout still supplies the close water sound. Five focused tests passed, including caption timing, era exit and disposal.
- 2026-11-25 — Step 3 complete. Dedicated ambience and music gains duck under recorded voices, procedural murmurs and voiced Chronik whispers. Gerold's voice panner follows the live walking body. The focused mix and ambience suites passed all eight tests, including overlap, mute, pause, resume, skip and clip completion. Added the NPC and Chronik specs to the browser test list because they share speech playback.
- 2026-11-25 — Step 4 complete. Updated ACTION-RPG §14 and the PRD changelog. `pnpm typecheck`, `pnpm test` (1,512 tests), `pnpm build`, `mc validate` and `git diff --check` passed. The sandbox denied the tsx IPC socket used by `pnpm validate`. The requested `node --import tsx scripts/validate-content.ts` fallback passed with the existing content warnings.
- Browser specs and listening remain unverified in this session. Run `scripts/dev/heavy.sh -- pnpm exec playwright test e2e/tour-slice.spec.ts e2e/voice.spec.ts e2e/npc.spec.ts e2e/chronik.spec.ts e2e/smoke.spec.ts e2e/touch.spec.ts e2e/perf.spec.ts --workers=1` after building.
- 2026-11-25 — The sandbox denied creation of the worktree `index.lock` during `git add`. The slice is ready for the local commit `feat(audio): add tour ambience and speech ducking`.

## Plan — slice 4

_Status: approved (2026-11-26, coordinator for the owner)_

**Approach**

Cross-check all 18 beats against the guided route and the ascent. Keep Gerold's recorded script and verify narration at the route stops from their associated beats. Use the existing procedural mixer, story action runner and HUD for the scene sounds and captions.

**Files to touch**

- `content/story/00-tour.story.json` and `src/systems/story/` — time the dog and deer sounds against their shots, verify the compass caption and honor the sound-caption setting.
- `src/systems/ambience/` and the surface/footstep path as needed — verify the beds in both eras and caption environmental sounds.
- `tests/` — check route and narration coverage, sound captions, bus routing, ducking and the voice payload.
- `docs/ACTION-RPG.md` §14 and `docs/PRD.md` — record behavior and the voice size.

**Steps**

- [x] 1. Audit the stops and beats, add coverage tests and fill any audio or narration gaps.
- [x] 2. Add or align procedural cues and verify their German captions and the existing gravel synthesis.
- [x] 3. Test audio bus levels, mute, speech ducking, caption settings and reduced motion.
- [x] 4. Check the deployed voice payload against 80 MB and run the asset and voice credit tests.
- [x] 5. Update the design docs, run the four requested gates and `mc validate`, and record the browser checks and local commit commands.

**Test plan**

Run targeted Vitest suites as each step lands, then `pnpm typecheck`, `pnpm exec vitest run --maxWorkers=2`, `node --import tsx scripts/validate-content.ts` and `pnpm build`. List the relevant desktop and touch Playwright checks with one worker. Browser playback and listening require a machine that can bind the preview server.

**Risks**

The dog and deer sounds need to work when the cinematic uses stills or the player skips it. Forest wind and birds should remain readable alongside dialogue. The plateau is an ascent destination after Gerold's farewell at the Quelle, where Laub takes over the player story.

**Open questions**

The mix levels need an in-browser listening pass.

## Progress — slice 4

- Branch `feat/task-010-cues`.
- 2026-11-26 — Step 1. Audited all beats against the nine stops in `p-fuehrung` and the ascent to the plateau. The four gathered stations are at `t1`–`t2`, `t6`, `t13` and `t15`. The branch and shortcut share `t3`–`t4`, the dogs and deer use `t7`–`t10`, and the dam uses `t11`–`t12`. `t14` leads to the Quelle. `t16`–`t18` are the compass and Laub handoff at the spring. Gerold's `t15` farewell sends the group toward the plateau while the player stays at the spring. Existing beds cover both routes in today and 1789, and existing guide lines cover the guided stops. Both focused suites passed (14 tests).
- 2026-11-26 — Step 2. Aligned the two synthesized barks with the dogs' runs and added a positional leaf rustle at the opening of the `reh` shot. The compass already captions the brass impact. Tour sound actions require a caption in content validation. Wind and birds have German captions alongside water and 1789 activity. The trail raster sends present-day gravel to the existing step synth. Gravel footsteps are audible and uncaptioned like other footsteps, so the guide's subtitle stays on screen.
- 2026-11-26 — Step 3. The four focused suites passed all 45 tests. Checked positional and direct SFX routing, master and bus mute, voice ducking of the ambience bus, the sound-caption toggle, and cue dispatch independent of the camera's reduced-motion and skip settings.
- 2026-11-26 — Step 4. The voice directory totals 12,968,959 bytes, including 12,792,299 bytes of audio. Added a check of the complete payload against the 80 MB budget. `tests/assets.test.ts` and `tests/voice-assets.test.ts` passed all 32 tests. The cues are procedural and have no audio files to credit.
- 2026-11-26 — Step 5. Updated ACTION-RPG §14, the PRD changelog and the voice research notes. The four requested gates passed with 1,581 unit tests across 118 files. The direct content validator reported zero story warnings and the existing pack, quest and photo warnings. `mc validate` and `git diff --check` passed. The worktree's shared dependency link was read-only, so the gates used a local copy of the installed packages with pnpm's automatic reinstall disabled. The built voice directory matches the source size.
- 2026-11-26 — Gravel caption review. Typecheck passed, and Vitest passed all 1,581 tests across 118 files. The checks used `--config.verify-deps-before-run=false` for pnpm and `--configLoader runner` for Vitest to avoid writes through the shared dependency symlink.
- Browser playback and listening are unverified under the port and Playwright constraints. After `pnpm build`, run `scripts/dev/heavy.sh -- pnpm exec playwright test "$spec" --workers=1` separately for `e2e/tour-slice.spec.ts`, `e2e/animals.spec.ts`, `e2e/cinematic.spec.ts`, `e2e/voice.spec.ts`, `e2e/walk.spec.ts`, `e2e/quelle.spec.ts`, `e2e/touch.spec.ts`, `e2e/skills.spec.ts`, `e2e/pol-flow.spec.ts`, `e2e/court.spec.ts` and `e2e/chronik.spec.ts`. Listen for the dog timing, deer rustle and gravel footsteps. Check that the guide's subtitles stay visible while walking on gravel and that the caption toggle applies to scene cues and ambient captions.
- The worktree is ready for the local commit `feat(tour): complete guided tour audio cues` with `Refs: TASK-010`. The coordinator requested a command handoff because the worktree cannot create `index.lock`.

- 2026-11-26 — All acceptance criteria met (slices 1–4: #24, #29, #46, #53, #60). Task closed.

%% mc-links: [[SPR-001]] %%
