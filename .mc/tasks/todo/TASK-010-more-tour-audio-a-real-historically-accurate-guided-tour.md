---
id: TASK-010
aliases:
- TASK-010
title: 'More tour audio: a real, historically accurate guided tour'
slug: more-tour-audio-a-real-historically-accurate-guided-tour
status: in-progress
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
updated: 2026-11-25
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
- [ ] Every tour stop has guide narration and an ambience bed
- [x] Sources documented for every new fact and unverified claims marked (slice 1 script)
- [ ] Licences and credits in place (`LICENSES.json`, `tests/voice-assets.test.ts`, `tests/assets.test.ts` green)
- [ ] Subtitles / captions for all new lines and sounds
- [ ] Audio settings respected (bus volumes, mute); voice ducks ambience
- [ ] Voice size stays within the budget
- [x] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass and docs updated (`docs/ACTION-RPG.md` §14, `docs/PRD.md`) for slice 1

## Plan

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

## Progress

- Branch `feat/task-010-tour-audio`.
- 2026-11-25 — Casting correction. Removed exactly 18 queued B/C inbox files for `karlsberg-quest-task010-audition`, checking each against its original request. The service provides no cancellation command. The nine A (`imhoff`) files were verified byte for byte. Laub and Jost retain their own roles.
- 2026-11-25 — Six reference-free MOSS jobs are staged in `design-jobs.json` outside Git. Seeds are B 6101/6102, C 6201/6202 and D 6301/6302. The service accepts registered references, so these six use the same local design generator as the original tour cast. The live service inbox holds nine A jobs. All 27 new station and question jobs await the owner's seed choices.
- Open the local audition page at `/Users/sebastian/develop/experiements/karlsberg-quest-voices/casting-guide/index.html`. From its directory run `"$HOME/kq-models/scripts/run_batch.sh" "$PWD/design-jobs.json" "$PWD/raw/design"`. Listen to both designs per candidate and select B, C and D. Run the page's generated `queue-picks.py` command to pin those references and queue nine lines for each. Run `moss-run`, reopen the page and compare A/B/C/D over the whole stop. `candidates.json` records instructions, seeds and selected hashes. `submission.json` identifies the design batch and service receipts. `audition-jobs.jsonl` records the service requests.
- 2026-11-25 — Verified the six pending jobs with the tour casting planner. An isolated service inbox accepted 27 audition lines for test selections and retained exactly 27 on retry. Checked the offline page logic for all six previews, all four eight-line playlists, the separate question and missing-file feedback. Listening awaits owner synthesis.
- 2026-11-25 — Step 3: checked all 18 beats, nine route stops and two once-only talk triggers against the live JSON. The route table lists Gerold's cues, the space for animals and Marlene, and Laub's handoff. The station flags at `t6`, `t13` and `t15` can retire queued lines, so the integration slice needs to tie departure to completion or skip of the station sequence.
- 2026-11-25 — Step 4: checked the archived municipal guide and current city guide, the trail leaflet, the Hohenburg excavation report, the spring photograph, the mapped waterways and the present-day terrain grid. Drafted 19 subtitle lines across the four stations in `docs/design/tour/sources.md`, with a citation for each factual clause and spoken uncertainty for the quarry, pond and spring.
- 2026-11-25 — Step 5: rehearsed all 19 lines in route order with temporary German speech at 145 words per minute. The welcome is about 10 s and the stations about 18–22 s each. The longest subtitle is 89 characters. Checked that every FAKT row has a citation and every OFFEN row voices the uncertainty. Verification of the selected voice, in-game timing, subtitles and skip belongs to integration (`e2e/tour-slice.spec.ts`, `e2e/voice.spec.ts`).
- 2026-11-25 — Gates green. Typecheck, 1,493 unit tests, content validation and build passed. Validation reported the existing content warnings. The original shared dependency symlink was replaced with a worktree-local installation of the locked dependencies to run the gates. Updated ACTION-RPG §14 and the PRD changelog.
- 2026-11-25 — The sourced script and original casting setup were committed in `d2c1b76`. For the casting correction, typecheck, all 1,493 tests on retry, build and `mc validate` passed. The sandbox denied the tsx IPC socket for `pnpm validate` on this rerun.
- 2026-11-25 — The sandbox denied creation of the worktree index.lock during staging. The casting correction is ready for the local commit `docs(tour): recast the guide audition with new voices`.

**Owner pick pending.** After the whole-stop comparison, record the winning candidate, design seed (for B/C/D), registry ID, reference SHA-256, line seed, language, instruction and synthesis parameters from `candidates.json`. Use the production line list in `docs/design/tour/sources.md` once the script is approved.

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

%% mc-links: [[SPR-001]] %%
