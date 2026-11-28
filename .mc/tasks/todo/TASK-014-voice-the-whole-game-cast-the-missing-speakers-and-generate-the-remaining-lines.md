---
id: TASK-014
aliases:
- TASK-014
title: 'Voice the whole game: cast the missing speakers and generate the remaining lines'
slug: voice-the-whole-game-cast-the-missing-speakers-and-generate-the-remaining-lines
status: todo
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- audio
- voice
sprint: "[[SPR-001]]"
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-25
updated: 2026-11-28
---

# Voice the whole game: cast the missing speakers and generate the remaining lines

> Core dev team task (not community).

## Description

Owner (2026-11-25): "we need more voices for the tour and game in general."

State on 2026-11-25 (`KQ_MOSS_MODE=service node scripts/voice/generate.mjs --dry-run --offline --max-lines 500`):
- 465 voiceable lines, 132 voiced. 333 lines of already cast speakers (mostly `laub`, some `marlene`) are not
  generated yet (~61 min model time, ~26.5 MB).
- Speakers with no voice at all (they still use the murmur): jost 53, soll 52, hanne 46, epilog 46, diener 15,
  mannlich 13, peter 11, liese 9, wache 8, gaertner 6, hofgaertner 6 and about 30 one- or two-line speakers.
  (`geraeusch` is sounds, not a voice.)
- Voice budget: warn at 60 MB, fail at 80 MB for `public/voice/` (`scripts/voice/assetRules.ts`).

Rules: synthetic MOSS voices only (CC0 output, credited in `LICENSES.json` `voices`), never ElevenLabs output, never
a real person except the consented player voice. Only text-final lines get clips. Model runs (`moss-run`) are
the owner's call; agents only submit. See `content/bible/08-stimmen.md` and `docs/VOICE-MEDIA-RESEARCH.md`.

### Tour lines queued for recording

Use the current text from `content/story/00-tour.story.json` with the existing cast voices.

| Beat | Line ID | Speaker | Text |
| --- | --- | --- | --- |
| `t13` | `marlene.t.messstab` | Marlene | Hier, nimm den Messstab ruhig mit. Beim Fest gibst du ihn mir zurück. |
| `t18` | `laub.t.seite` | Laub | Und im Deckel der Bussole steckt ein Blatt. Unten steht meine Handschrift. Sie finden es später unter Ausrüstung. |

### Proposed steps

1. Decide which lines are text-final (chapters 1–4, endings, epilogue), and list the rest as blocked.
2. Casting round for the main missing speakers (Jost, Soll, Hanne, Mannlich, Peter, Liese, epilogue narrator):
   2–3 MOSS candidates each, a listening page, and the owner picks by ear.
3. One shared voice per group of small speakers (guards, servants, gardeners, soldiers) to stay within budget.
4. Generate in batches by chapter through the moss-service, collect, listen, commit chapter by chapter.
5. Keep within the size budget; if needed, lower bitrates or skip barks.

## Acceptance Criteria
- [ ] Every speaker with 3 or more text-final lines has a cast voice (owner-picked for the main characters)
- [ ] All text-final lines voiced; blocked lines listed
- [ ] Credits per voice in `LICENSES.json`; `tests/voice-assets.test.ts` green; size under 60 MB
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Plan

_Status: draft_ (2026-11-25, core dev; the requested audit and local casting preparation are complete)

**Approach:** Slice 1 gives the owner ten synthetic voices to cast by ear. Use the live German line IDs and text at `9996dc8` as the recording baseline. Carry forward explicit story holds, identify the historical scenes that can be recorded, and keep the owner's auditions outside the game. The owner chooses a reference for each role after hearing it on more than one sentence.

**Files to touch:**

- This task file stores the chapter decisions, casting directions and owner handoff.
- Outside Git, `../karlsberg-quest-voices/casting-cast3/` holds the ID-by-ID `line-status.json`, `candidates.json`, `design-jobs.json`, its four batch files, `index.html` and `queue-picks.py`. The owner's runs write the design log, WAVs and selection receipts there. Selected synthetic WAVs are pinned under unique audition IDs in the local MOSS reference library.

**Steps:**

- [x] 1. Enumerate pack dialogue, story speech (including variants) and quest speech with `collectLines(loadContent('content'))`. Check the chapter bibles, tour replacements, quest catalogue, existing voice handoff and live manifest. Classify every ID before applying speaker or priority filters.
- [x] 2. Stage two reference-free German designs per role. Keep the instruction and read identical within each seed pair. Use invented vocal qualities throughout, including for the reader of Mannlich's attributed words.
- [x] 3. Prepare an offline page to compare both seeds and an owner-operated command to register the picks and queue two different readings per voice. Give each seed its own files and service IDs. Check the requests and selection flow without inference.
- [ ] 4. Owner runs the designs, listens, selects and queues the callbacks, then runs the service. Compare intelligibility and sentence endings on both reads. Listen for Matthes' name, Soll's sums, teenage Jost and Peter sounding distinct, and a recognisable voice across each shared group.
- [ ] 5. Record the ten confirmed picks with design ID, seed, original instruction, model and tokenizer revisions, reference SHA-256 and callback IDs. Use the reference-only callback settings for production after adoption.

### Text decisions at `9996dc8`

The counts below cover the 847 distinct IDs returned **before** filtering by cast speakers. The 465 in the original task is a narrower pipeline estimate. The local `line-status.json` records chapter, ID, speaker, source file, display text, runtime text hash and reason for every decision. For a later recording batch, select the chapter's `final` rows and compare hashes to the then-current display text. Reassess changed wording before submission. Of the 320 final IDs in this task, 125 have matching Laub clips and 195 still need voices. Another 24 identical Imhoff texts are already in TASK-010's recording batch.

| Chapter / source | Final here | Blocked | TASK-010 | Excluded | Recording decision |
| --- | ---: | ---: | ---: | ---: | --- |
| Tour opening and pack | 0 | 28 | 15 | 0 | Defer the superseded station wording to the 19 reviewed subtitles on the guide branch. Other tour lines await the replay text lock. The consented player has a separate track. |
| Legacy prologue | 0 | 0 | 0 | 103 | Retired story, pack and quests. Old saves migrate to K1. |
| K1 · Der Hof | 96 | 73 | 0 | 2 | 25 Laub, the court workers and their quests, the gate echo and Mannlich's sourced fireworks paraphrase. Hold the arrival/disguise sequence, including Liese, the Hofgärtner and guard callouts. |
| K2 · Die Flucht | 65 | 41 | 0 | 3 | 34 Laub, Hanne and Jost, household and watch exchanges, Jost's hunt offer and the crate quest's servant. Hold the shortened historical speeches and the present-day return, including `quest.q.k2.parforce.turnin_lines.0` (“Feldstation”). |
| K3 · Die Nacht | 93 | 40 | 0 | 1 | 36 Laub, the historical NPC conversations, court and fire echoes and past-era quest speakers below. Hold `soll.k3.05` (addresses a surveyor), today's object scene and the gallery/König quote recordings. Peter's chair escort is in the live K3 quest catalogue (§11.3). |
| K4 · Der Steinbruch | 57 | 61 | 0 | 6 | 30 Laub, Soll and Peter in 1796, the carters and historical NPC quest exchanges. Hold Marlene, the present-day finale (including old Jost / `pikeur`) and the unidentified pre-reveal `stimme`. |
| Endings and party, excluding narrator | 0 | 40 | 9 | 0 | The staged party has distinct present-day speakers. Only the nine matching guide lines have a later recording decision. `marlene.end.morgen` assumes an overnight stay and `marlene.end.behalten` still places the horn in the Bauwagen. |
| Epilogue narrator | 0 | 46 | 0 | 0 | Four survey-slot lines and five object variants need rewriting. The other 37 retain the ending recording hold. The pack's `epilog:line` entries take precedence over the story fallback. Count them once. |
| Global voice pack | 9 | 59 | 0 | 0 | Three 1789 character barks each for Jost, Soll and Hanne. Hold Laub's generic barks and Marlene's hub lines, including the station/return rewrites. |
| **Total** | **320** | **388** | **24** | **115** | Excluded entries are retired content or sound captions. `geraeusch` has no cast voice. |

**Reconstructing the final IDs.** At this revision, keep the Laub manifest IDs in K1–K4 whose display hashes match the live lines. These are exactly the 125 IDs in the earlier recording handoff (`lists/laub-final-125.ids`, including the spoken override for `laub.k4.x.brecher`). The following are the additional 195 IDs. Quest names below mean the dialogue rows for that quest spoken by a listed chapter NPC. Laub's quest rows outside his release list remain blocked for text review.

- K1: `soll.k1.*`, `hanne.k1.*`, `jost.k1.*`, `echo.k1.wache.01–02`, `mannlich.07`; the Soll, Hanne, Jost, Gärtner and Diener rows of `registratur`, `lohn`, `zwinger`, `hundenamen`, `kasuar` and `festplaene`.
- K2: `jost.k2.01–07`, `hanne.k2.01–07`, `echo.k2.orangerie.01–03`, `echo.k2.wache.01–04`, `echo.k2.fackeln.02–04`, Jost's two `parforce.offer` rows and the Diener rows of `kisten`.
- K3: `hanne.k3.01–10`, `jost.k3.01–04`, `jost.k3.x.allein`, `soll.k3.01–04` and `.06–07`, `echo.k3.stroh.01–04`, `echo.k3.kuechenhof.01–05` and `echo.k3.fackel.02–03`. Keep the Hanne, Soll, Jost and Peter rows of `nachmittag`, `buch`, `festsaal`, `hunde`, `jaguar`, `kabinett` and `lehnstuhl`.
- K4: `soll.k4.01–07`, `peter.k4.01–05`, `echo.k4.karren.01–04` and the Soll/Peter rows of `baumagazin`, `zeichen` and `pacht`.
- Barks: `jost.bark.01–03`, `soll.bark.01–03`, `hanne.bark.01–03`.

**Basis and holds.** `content/story/README.md` gives the source precedence. The live K1–K4 story/pack files implement `content/bible/02-kapitel-1.md` through `05-kapitel-4.md`; the playable quest catalogue is in `docs/ACTION-RPG.md` §§11.1–11.4. No current playable chapter or beat carries the placeholder flag. A missing flag alone does not establish final wording. `docs/NEXT-SESSION.md` §7.3 and the voice team's external `HANDOFF.md` / `lists/voice-final-ids-9aac47b.json` document the recording holds. The guide exception uses the actual ID and text submitted on `feat/task-010-guide-voice` at `ec6078f`. A recording whose wording changed needs a new text decision.

- `docs/design/tour/bible/06-enden.md` §§3–6a retains the three choices and much of Laub's dialogue. It replaces `epilog.vermessung.{1,2,3,offen}` and the old object locations in `epilog.objekt.{tuergriff,dukat,uhr,nichts}.keep` and `epilog.objekt.uhr.burn`. The proposed Führung slot, party drafts and fallback strings must not create extra clip IDs.
- Historical voices use only attributed echo text. The pack and K1 bible agree on `mannlich.07` (M1910 p. 389, paraphrase). Hold direct quotations for the page-image check in `content/bible/08-stimmen.md` §7 and apply the release decision in `docs/PRD.md` Q-10 to long extracts. `mannlich.09` was cut. No invented transition goes into Mannlich's mouth.
- K1's code-only court subtitles (`src/systems/court-k1/index.ts`, inspect/refusal, suspicion and ejection variants) sit outside the collector. Hold them with the disguise sequence until wording and playback IDs are settled. Test fixtures, UI, codex entries, sound cues and duplicate fallback epilogue prose have no recording jobs.

### Casting round

| Role / game speaker IDs | Design seeds | Direction for listening |
| --- | --- | --- |
| Jost · `jost` | 7101 / 7102 | Kennel boy, 13 in 1789 and 17 in 1793. Quick images, direct address, tenderness with the dogs. Revisit slower, older Jost for the K4 reveal. |
| Kanzlist Soll · `soll` | 7201 / 7202 | Mid-forties in 1789, high and quick. Hear the pause to reckon and the care he gives a name. |
| Hanne · `hanne` | 7301 / 7302 | Mid-thirties, tired, direct, with dry humour and a light Palatine cadence. |
| Memoir reader · `mannlich` | 7401 / 7402 | An invented older reader, quietly recalling what he saw. Local audition excerpts keep their M1910 attribution. |
| Peter · `peter` | 7501 / 7502 | Hanne's son, 15 as a carter in 1796. Short phrases, pride in the stone his father cut. |
| Liese · `liese` | 7601 / 7602 | Warm, practical washerwoman. Work, weather and the court form of address “Er”. |
| Epilogue · `epilog` | 7701 / 7702 | Casting choice: an adult woman reading a first-person entry. Listen for a natural pause between memories and a voice that can sustain the assembled page. |
| Guards / soldiers · `wache`, `wache2`, `gardist`, `gardist-tor`, `soldat`, `soldat2` | 7801 / 7802 | One dry service voice for a sentry and a soldier, clear German, quieter when talking to a colleague. |
| Household · `diener`, `diener2`, `lakai` | 7901 / 7902 | One discreet working voice, precise in a message and brisk with another servant. |
| Gardeners · `gaertner`, `hofgaertner` | 8001 / 8002 | One measured tradesman's voice. Pride in his work, a short warning when needed. |

The modern doubles retain their own identities. All twenty designs start from a written description and seed alone. No design uses a person's recording or requests an imitation. Liese and the epilogue use original audition sides. Historical quotation samples are local readings only. After a pick the service receives the synthetic reference, German language, seed and a per-line cap. The design instruction stays with the design metadata. TASK-010's `ec6078f` sizes each cap as `min(1000, 32 + ceil(12.5 * (1 + n / 8)))`, where `n` is the prepared spoken text's Unicode code-point count. Integrate that fix before chapter production.

**Test plan:** Validate the combined batch and both choices for each role, recorded source strings, WAV paths, registry settings, generated commands and retry behaviour against an isolated service inbox. Owner listens for clipped words, extra syllables, long tails and consistent character between reads. For adoption run `pnpm exec vitest run tests/voice-pipeline.test.ts tests/voice-service.test.ts tests/voice-assets.test.ts`, then `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`. Check in-game playback, subtitle skip and the voice slider through `scripts/dev/heavy.sh -- pnpm exec playwright test e2e/voice.spec.ts --workers=1` in the integration slice.

**Risks:** A reference plus a design instruction and fixed 1000-token limit caused repeated speech and long tails in TASK-010. Verify the first short and long reads before scaling up. Shared roles sometimes answer one another in an echo. Listen for speaker separation and keep their subtitle speaker IDs. Reference and audio files remain outside Git until approved production encodes are collected.

**Open questions:** Owner selections and the production holds listed above remain pending. The two seeds per role have equal standing.

**Acceptance criteria coverage:**

| Epic criterion | Slice 1 coverage |
| --- | --- |
| Cast for speakers with at least three final lines | Partial. Seven featured roles and three shared pools have designs. Owner selection and registry adoption follow. |
| All final lines voiced and blocked lines listed | Partial. The text inventory is complete at the pinned revision. Chapter generation follows. |
| Per-voice credits, asset tests, under 60 MB | Follow-up. Credit each adopted speaker/reference under `public/assets/LICENSES.json` → `voices`, validate Opus/AAC pairs and count bytes per chapter. Target under 60 MB. The hard failure is 80 MB. |
| Four repository gates | Follow-up before an integration PR. This planning commit changes task tracking only. |

**Follow-up slices:**

- Adopt the owner-confirmed seeds and SHA-256 values. Map the three shared references to the listed game speaker IDs, retain the design provenance and enable text-scaled reference-only synthesis on both pipeline paths.
- Record, collect and listen chapter by chapter, one PR per chapter, starting with K1's final IDs. Include remaining one-off speakers and test names, speaker IDs, playback and size before moving to the next chapter.
- Re-audit the blocked K1 disguise, present-day, Marlene, hub, finale and party text when the relevant scripts settle. Reconcile the tour and player work with their existing tracks.
- Record the resolved epilogue variants and connect the selected blocks to audible playback on the ending page. Verify Museum, Verbrennen and Behalten, skip/exit and the handoff to party credits.

## Progress

- 2026-11-25 — Core dev, `feat/task-014-casting`. The 20 design jobs are staged outside Git in four heavy-lock batches (6, 6, 6, 2). The page has 20 design players and two callback reads per role. All selections await the owner.
- Validated 847 unique collector IDs, the 125 approved Laub hashes, source text and membership of the ten roles. With temporary WAV fixtures in an isolated service home, both seed sets registered and queued correctly. Repeating the same picks left exactly 20 inbox entries. A missing log and a reference-conditioned design were rejected before registration. Checked the generated selection command, callback paths, re-selection and saved choices without a browser. MissionControl validation passed. No model ran, no live request was submitted and no game asset changed.
- The plan was staged. The sandbox denied creation of the worktree’s `index.lock` during `git commit`. Stage this final progress note together with the plan and commit locally with the requested co-author trailer.

### Owner commands

From a terminal, render the four design batches, then open the offline comparison: (`<voices-worktree>` is your local voices checkout, `<moss-service>` your local MOSS service checkout):

```sh
cd "<voices-worktree>/casting-cast3"
(
  for batch in "$PWD"/batches/design-*.json; do
    "$HOME/kq-models/scripts/run_batch.sh" "$batch" "$PWD/raw/design" || exit $?
  done
) && open ./index.html
```

Select one seed per role. Copy the exact `python3 queue-picks.py --jost …` command shown under **Auswahl in die Warteschlange legen** and execute it. From the same directory, `python3 queue-picks.py` also accepts the ten choices interactively. The helper checks each raw WAV against the pinned, reference-free MOSS design log, registers its hash, submits 20 audition jobs and writes `submission.json` with the selected references, requests and receipts.

```sh
<moss-service>/bin/moss-run
open ./index.html
```

Review the whole service queue at the runner prompt. Use **Sprechproben zur gewählten Stimme** to hear each selected reference on fresh text. If a take runs on or loses the character, select the other seed and repeat the page command. Only the confirmed picks proceed to chapter recording.

## Remaining (audit 2026-11-28)

Blocked on the owner. Only the casting preparation (PR #43) is merged; `public/voice/` holds clips
for laub, imhoff, player and a few single lines (13 MB). Jost, Soll, Hanne, Mannlich, Peter, Liese
and the epilogue narrator have no voice yet. Next step is the owner's: render the four design
batches, pick one seed per role by ear and run `moss-run` for the auditions (commands under
"Owner commands"). After that, agents can queue chapter batches; the 333 ungenerated lines of the
already cast speakers also need an owner `moss-run`.
%% mc-links: [[SPR-001]] %%
