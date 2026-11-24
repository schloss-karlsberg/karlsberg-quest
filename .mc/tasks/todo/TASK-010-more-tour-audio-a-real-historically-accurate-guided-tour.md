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
  sources: `docs/design/tour/bible/01-prolog.md` (stations at the Wanderparkplatz, Felsenpfad, Weiher,
  Quelle), codex sources `docs/design/tour/bible/07-codex-impact.md`, voices `08-stimmen.md`.
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
- [ ] Sources documented for every new fact; unverified claims marked
- [ ] Licences and credits in place (`LICENSES.json`, `tests/voice-assets.test.ts`, `tests/assets.test.ts` green)
- [ ] Subtitles / captions for all new lines and sounds
- [ ] Audio settings respected (bus volumes, mute); voice ducks ambience
- [ ] Voice size stays within the budget
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass; docs updated (`docs/ACTION-RPG.md` §14, `docs/PRD.md`)

## Plan

_Status: draft_

**Approach:** Slice 1 prepares Gerold Imhoff's narration. Give the owner a casting round they can judge over a whole stop, and give the content team a German script they can trace to sources line by line. Script research can proceed while the auditions are queued. Production recording starts in a later slice once the owner has picked a voice and the text is final.

**Files to touch:**

- A local casting directory outside all Git worktrees — audition job JSONL, candidate settings, raw WAV destinations and a standalone `index.html` listening page.
- `docs/design/tour/sources.md` — the German script in route order, with beat and line IDs, exact source references and links to existing codex cards.
- This task file — record the casting handoff and, once received, the owner's pick and the reproducible voice settings.
- `docs/ACTION-RPG.md` §14 and `docs/PRD.md` — log the casting and script deliverables when slice 1 ships.

**Steps:**

- [ ] 1. Prepare three synthetic MOSS candidates for Gerold, including the current `imhoff` as a baseline. Use the same German material for each: a welcome, then a complete station told in several short lines, with a place name, a date and an honest “Das weiß man nicht.” Use the existing tour text for the audition. Aim for warmth, clear consonants, an engaged storytelling pace and the light regional melody in `08-stimmen.md` §0.
- [ ] 2. Prepare and submit one moss-service job per candidate and line via the client configured by `KQ_MOSS_SERVICE_CLIENT`. Use public synthetic registry voices, distinct audition IDs and absolute WAV destinations in the external casting directory. Keep reference hashes, seeds and delivery settings with the candidate key. Set up the local listening page there with A/B/C controls for each line and a whole-stop playback for each voice. Give the owner the queued IDs and page path. The owner runs `moss-run`, listens and picks by ear.
- [ ] 3. Map `p-fuehrung.json` to the live `t1`–`t18` beats. Cover the Wanderparkplatz (`t1`–`t2`, including the two `npc:talk` lines in `tour.pack.json`), Felsenpfad (`t6`), Karlsbergweiher (`t13`) and Karlsbergquelle (`t15`). Account for `abzweig`, `einstieg`, `wind`, `reh` and `damm` as walking, animal or meeting cues. Record where Gerold speaks and where the action needs silence, including the handoff to Laub.
- [ ] 4. Research and write short, individually skippable German lines for each station. For each factual clause record its line ID, source title, page or section and URL or edition, plus the matching codex card where one exists. Start with the Homburg historical guide for the Baumagazin, the trail leaflet for the Felsenpfad, and the water and terrain sources in `07-codex-impact.md` and `cx.41`. Check each original for the precise claim. Mark uncertainty OFFEN and let Gerold say it aloud, particularly for the pond's purpose and the spring's possible supply to the palace. Label invented story material FIKTION.
- [ ] 5. Read the script aloud in route order. Check that the group can hear a line before the next cue, that the German text works as a subtitle, and that each historical claim can be located in its source. Record the owner's candidate ID, reference hash, seed and settings when selected, alongside the final line list for production.

**Test plan:** Compare the script against `content/routes/p-fuehrung.json`, `content/story/00-tour.story.json` and `content/packs/tour.pack.json` for stop coverage, IDs and triggers. Check every citation against its cited passage. For the owner audition, open the external `index.html` locally after `moss-run` and play the same line and the full sequence for each candidate. Listen for place-name pronunciation, phrasing and fatigue. Run `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build` before the slice PR. In-game subtitle, skip and playback checks in `e2e/tour-slice.spec.ts` and `e2e/voice.spec.ts` belong to integration.

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

%% mc-links: [[SPR-001]] %%
