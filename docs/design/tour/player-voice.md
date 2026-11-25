# Player voice: line list and recording notes

> **Status (2026-11-25).** The owner confirmed consent on 2026-11-24 to use Jan Eric Rippel's MOSS-cloned player voice in Karlsberg Quest. The game names him in `content/credits.json`, and `public/assets/LICENSES.json` credits the voice with permission limited to the game. The service registry confirms written public consent. All eight unique clips for the tour's nine player dialogue actions are queued in moss-service. Rendering and collection are pending. The dialogue texts below are FIKTION.

## 1. Principles

- **A mostly quiet protagonist.** The player is a calm visitor, male, 30–40, on a public guided tour in November. He reacts and never explains: short, dry, a little amazed, never a joke at someone else's cost. At most one player line per beat, and none when another speaker already says the same thing. Most beats have no player line at all.
- **Optional (planned).** Setting **„Spielerstimme an/aus“** (Einstellungen › Audio). The design calls for it to default to ON once clips exist. OFF keeps the subtitles and silences the player voice. The toggle is still a follow-up.
- **Subtitles always.** Every player line is shown in the dialogue card, whether or not a clip plays (same rule as every other speaker, PRD §4.4).
- **Never says the player's name.** `{Name}` is spoken only by Laub and Marlene (see the [voice bible](../../../content/bible/08-stimmen.md) and `tests/story.test.ts` „{Name} only in Marlene/Laub“). Allowing Gerold to address the player by name was a tour draft idea. The player never says it, never introduces himself, and is never asked a question that needs his name as an answer. The recording therefore never contains a name, which also keeps every clip valid for every player.
- **Forms of address stay with the others.** Laub siezt, Marlene, Gerold, Jost and the doubles duzen, Liese and the 1789 people use „Er“. The player addresses nobody by name and avoids „Sie“/„du“ where he can (short reactions instead of sentences).
- **Silent where the others are silent.** No player line at memorial places (Rondell 1785, Festsaal during W5, the finale up to `laub.k4.finale_2`), where Laub also falls silent.
- **No lines in combat.** While `combat:state { inCombat: true }`, queued player lines are dropped (not delayed). Only the effort/pain cues (§2.6) appear, and only as **text captions** in square brackets, like the existing sound captions („[Hundegebell]“). No recorded grunts in v1.
- **Brand rule.** No beer, brand or product talk; „Karlsberger Hof“ only as a place.

## 2. Line list

Id scheme: `player.<area>.<key>`. Areas: `t` tour (prologue, today), `photo` phone camera, `q` the Quelle and the first shift, `k1` chapter 1, `end` the party, `cue` effort/pain captions. Status: **batch 1 queued** = sent to kq-voice on 2026-11-20 (ids stable; tell kq-voice about any rename) · **new** = not yet sent.

Context column: beat ids of the tour slice (`t1` … `t18`); after the slice ends, storyboard shot ids (`storyboard-beats.md`) or the chapter bible sections. Texts of `player.t.*`, `player.photo.*`, `player.q.*` (batch 1) are quoted exactly from the tour slice (`content/story/00-tour.story.json` on the slice branch). The batch-1 texts for `player.k1.mantel`, `player.k1.salamander` and `player.end.fest` exist in no content file yet; they are quoted exactly from the coordinator's batch-1 list as queued at kq-voice (2026-11-20).

### 2.1 Tour (today, prologue)

| id | Text | Context / trigger | Status |
| --- | --- | --- | --- |
| `player.t.fuehrer` | „Hm. Das wusste ich nicht.“ | t6 Station 2 Felsenpfad, after `imhoff.t.station2b` | batch 1 queued |
| `player.t.wind` | „Was war das denn?“ | t8 Wind im Wald, dogs bolt, before `jostd.t.hunde` | batch 1 queued |
| `player.t.hunde` | „Die haben irgendwas gesehen.“ | t8 exit, dogs back, before `imhoff.t.wind` | batch 1 queued |
| `player.t.treffpunkt` | „Ist das hier die Führung?“ | t1 Treffpunkt (car park), first talk to Gerold (before „So.“) | new |
| `player.t.laterne` | „Danke. Für alle Fälle.“ | t1, Gerold hands out the lanterns | new |
| `player.t.ehrlich` | „Einer, der sagt, was er nicht weiß. Gut.“ | first „Ehrlich: Das weiß man nicht.“ (t6 `imhoff.t.station2b` is taken by `player.t.fuehrer`; use at the next station, once) | new |
| `player.t.komme` | „Ich komm ja schon.“ | first `imhoff.bark.wait`, once per game, never in reply to the `{Name}` variant twice | new |

### 2.2 Photo quips

| id | Text | Context / trigger | Status |
| --- | --- | --- | --- |
| `player.photo.gut` | „Das ist es.“ | t10 Ricke und Kitz, `photo:good` `reh.ricke` (both branches, alert / not alert) | batch 1 queued |
| `player.photo.weg` | „Und weg.“ | t10 Ricke und Kitz, `animal:fled` `ricke` within 16 m | batch 1 queued |
| `player.photo.netz` | „Kein Netz. Natürlich nicht.“ | first `photo:shot { noSignal: true }` in a past era (storyboard shot `t11-brunnenstube`); later times Laub's `laub.bark.netz.*` takes over | new |
| `player.photo.wackel` | „Verwackelt.“ | first `photo:shot` with targets but `stars: 0`, today only, once | new |

### 2.3 The Quelle and the first shift

| id | Text | Context / trigger | Status |
| --- | --- | --- | --- |
| `player.q.fund` | „Was liegt denn da im Wasser?“ | t16 Die Pause, enter, delay 9 s | batch 1 queued |
| `player.q.laub` | „…Hat der Kompass gerade geredet?“ | t17 Die Bussole, after `laub.t.intro` | batch 1 queued (+ soft-start variant) |
| `player.q.kalt` | „Eiskalt.“ | `quelle:touch`, hand in the trough, before the shift | new |
| `player.q.wo` | „Wo sind die alle hin?“ | storyboard shot `t11-brunnenstube`, first arrival in summer 1789 (the group is gone) | new |

### 2.4 Chapter 1 (1789)

| id | Text | Context / trigger | Status |
| --- | --- | --- | --- |
| `player.k1.salamander` | „Feuersalamander. Na danke.“ | after `liese.k1.01` („Wie ein Feuersalamander.“, about his orange jacket), k1 Bleiche, once | batch 1 queued |
| `player.k1.mantel` | „Passt. Fast.“ | he has put on the court coat, tugging at the sleeves: flag `disguise.coat` set (`k1_0b.rock-genommen` or `k1_0b.rock-geliehen`), after Laub's line | batch 1 queued |
| `player.k1.morgen` | „Also noch mal.“ | k1 1.1 Ankunft at the Quelle, after `marlene.k1.morgen.quelle` | new |
| `player.k1.meute` | „Das sind nicht Diane und Bijou.“ | first sight of the pack in k1 Teil B (perception `hunt` alert), outside combat | new |
| `player.k1.wach` | „Okay. Noch mal.“ | first wake after `player:caught` (Laub's return bark follows) | new |

### 2.5 The party (today, dusk)

| id | Text | Context / trigger | Status |
| --- | --- | --- | --- |
| `player.end.fest` | „Ein langer Nachmittag.“ | party at dusk on the plateau, cup in hand, looking at the group (`06-enden.md` §8.2, after Gerold's speech, before the credits) | batch 1 queued |
| `player.end.wasser` | „Wasser.“ | §8.2 step 2: Marlene asks („Hast du was gefunden …?“), Laub whispers „Sagen Sie: Wasser.“, the player says it | new |
| `player.end.ankunft` | „Entschuldigung. Ich hab mich … verlaufen.“ | §8.2 step 1, after Gerold's „Da ist ja unser Nachzügler!“ | new |
| `player.end.kuchen` | „Ist noch Kuchen da?“ | free play after the credits, first talk to Herr Soll (he answers with the cake money) | new |

### 2.6 Effort and pain (text captions only)

| id | Caption | Trigger | Status |
| --- | --- | --- | --- |
| `player.cue.atem` | [Atem] | sprint stops after ≥ 4 s at full speed | new |
| `player.cue.aechzen` | [Ächzen] | heavy attack / heavy lift (staff swing `heavy: true`) | new |
| `player.cue.treffer` | [Stöhnt auf] | `player:damaged` with `amount` ≥ 15 % of `max` | new |
| `player.cue.keuchen` | [Keucht] | `hp` below 25 % of `max`, at most every 10 s | new |
| `player.cue.sturz` | [Ein kurzer Laut] | dodge / knock-down (`combat:hit` `target: 'player'`, `heavy: true`) | new |

Rate limit: one cue per 3 s, none while a dialogue line is showing. Cues are captions, not dialogue cards; with reduced captions they can be switched off with the other sound captions.

**Totals:** 29 entries (24 spoken lines + 5 captions); 10 in batch 1, 19 new.

## 3. Recording notes (kq-voice)

### 3.1 The voice

Calm, low-middle register, unhurried, close to the microphone (an inner voice that happens to be audible, not a stage voice). Standard German, a regional colour only in the melody, no dialect spelling. Never louder than the NPCs around him; Gerold carries the tour, the player only comments.

### 3.2 Per line

| id | Tone / energy (1 quiet … 5 loud) | Note |
| --- | --- | --- |
| `player.t.fuehrer` | interested, 2 | „Hm.“ as a real breath, not a word |
| `player.t.wind` | surprised, 3 | rising, short |
| `player.t.hunde` | thoughtful, 2 | a little uneasy at the end |
| `player.t.treffpunkt` | polite, slightly unsure, 2 | |
| `player.t.laterne` | friendly, 2 | |
| `player.t.ehrlich` | quiet approval, 1–2 | half to himself |
| `player.t.komme` | apologetic, 3 | slightly out of breath |
| `player.photo.gut` | satisfied, whispered, 1 | the deer are close: whisper |
| `player.photo.weg` | resigned, dry, 1–2 | |
| `player.photo.netz` | dry, 2 | „Natürlich nicht“ with a smile |
| `player.photo.wackel` | mildly annoyed, 1 | |
| `player.q.fund` | curious, 2 | |
| `player.q.laub` | disbelief, 2 | **soft-start variant**: the „…“ as an audible breath and a hesitant onset, plus a normal take |
| `player.q.kalt` | sharp intake, 3 | the cold in the voice |
| `player.q.wo` | bewildered, quiet, 2 | |
| `player.k1.salamander` | dry, mildly offended, 2 | „Na danke“ deadpan |
| `player.k1.mantel` | dry, 2 | tugging at the sleeves; a beat before „Fast.“; soft-start variant optional |
| `player.k1.morgen` | resolved, tired, 2 | |
| `player.k1.meute` | low, tense, 1–2 | almost whispered |
| `player.k1.wach` | groggy, then steady, 2 | soft-start variant |
| `player.end.fest` | quiet, a hint of a smile, 1–2 | cup in hand, looking at the group |
| `player.end.wasser` | quiet, warm, 1–2 | one word, a beat of hesitation before it |
| `player.end.ankunft` | sheepish, 2–3 | the pause at „…“ |
| `player.end.kuchen` | relaxed, hopeful, 2 | |

### 3.3 Takes and files

- **2 takes per line**, plus the soft-start variants marked above (`player.q.laub` is already queued with one).
- Keep reference WAVs outside the repo and render WAVs in local scratch storage. After the service verifies written public consent, approved WebM/M4A clips can ship in `public/voice/` under the game-only licence.
- File names follow the pipeline (`<id>.<hash>.webm` / `.m4a`); the manifest entry carries the speaker `player`.
- The cues (§2.6) are **not** recorded in v1.

### 3.4 Text-final vs. draft

- **Batch 1, tour/photo/Quelle lines (7):** texts as in the tour slice; they become **final only after the owner's playtest** of the tour. Record now, expect a re-take if the playtest changes a word.
- **Batch 1, `player.k1.mantel`, `player.k1.salamander`, `player.end.fest`:** texts as queued; the content lines must use exactly these words when they are written (the runtime only plays a clip whose text hash matches, §4).
- **New lines (19):** draft; send to kq-voice as batch 2 after the owner has read them. The cues stay text.

## 4. Integration notes

**Existing mechanism.** Story lines are `say` actions with `id`, `speaker`, `text`. The dialogue presenter (`src/systems/story/dialogue/presenter.ts`) asks the clip provider (`voiceClips.ts`) for a ready clip by **line id** and text: `voice/manifest.json` maps ids to files and stores a `textHash` (FNV-1a over the raw text). A clip plays only while the hash still matches the line text; otherwise, or if no clip is decoded in time, the line falls back to the procedural murmur (`voice.ts`). Clips play on the `voice` bus (volume slider „Stimmen“). Laub and Marlene lines are looked up the same way (`laub.t.intro`, `marlene.k1.morgen.quelle` …).

The tour pack already defines `player` with the label „Du“. The voice pipeline maps this speaker to the moss-service registry entry `guest-test` and keeps `player` in the standard public voice manifest. The game-only manifest licence is `speaker-permission`. The owner records written public consent in the service registry and starts the runner after submission. The voice pipeline then collects the clips.

**Follow-ups:**

- Add the planned `playerVoice` save setting and „Spielerstimme an/aus“ toggle under the volume sliders. OFF skips the clip lookup for `player` and displays the subtitles at reading speed.
- Make player subtitles silent when there is no matching decoded clip. The current presenter uses the standard murmur fallback.
- Drop `player.*` dialogue lines while `combat:state.inCombat`. The `player.cue.*` captions use the existing caption path.
- Keep the `{Name}` test and validate the `player.*` ID scheme.

## 5. Decisions and open points

Decided by kq-story (2026-11-21, the owner can overrule):
- Speaker label for player lines: „Du“ (never the player's name).
- `player.end.fest` is a spoken line (no „[nickt]“ caption).
- A player line without a clip should appear as silent text.

The owner approved publication under the game-only licence on 2026-11-24. The player clips use the shared manifest (§4).
