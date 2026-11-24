---
id: TASK-010
aliases:
- TASK-010
title: 'More tour audio: a real, historically accurate guided tour'
slug: more-tour-audio-a-real-historically-accurate-guided-tour
status: todo
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
updated: 2026-11-24
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
%% mc-links: [[SPR-001]] %%
