# Ideas round 11: the owner's four requests (design, 2026-11-20)

> Design only. **Nothing here is built.** Written for the main session to schedule (NEXT-SESSION §5c).
> Rules that apply throughout: PRD §4.4 (tone; rule 2: historical people say and do only what sources
> support), NEXT-SESSION §5 (original work only, CC0 assets, the brewery-brand rule and its one
> exception), ACTION-RPG §1 (action RPG; no quizzes, no word puzzles).
> Coordinates are local metres (x east, z south). **(prüfen)** = checked once with
> `scripts/content-build/probe.mjs` (ground type and height) but not yet walked; check again on the terrain.

Contents: [0 Overview](#0-overview) · [1 Chapter 1 opens at the spring](#1-chapter-1-opens-at-the-karlsbergquelle) ·
[2 The disguise](#2-1789-the-court-lets-no-strangers-in-the-disguise-opening) ·
[3 Ausreißer chambers](#3-side-activity-ausreißer-point-cloud-chambers) ·
[4 Hidden bottles](#4-hidden-collectibles-the-fläschchen) · [5 Build order](#5-overall-build-order) ·
[6 Next steps](#6-next-steps-paste-into-next-session) · [7 Sources](#7-sources)

---

## 0. Overview

| # | Owner's request | Our design | Effort | Depends on |
|---|---|---|---|---|
| 1 | Chapter 1 also starts at the Karlsbergquelle | k1 opens at dawn at the spring (today): E at the trough, the 2.7 s touch, summer 1789. You walk up to the court **on foot**, as everyone had to (cx.11) | **S** (story) + **S** (e2e) | the built spring (§3.6 of NEXT-SESSION) |
| 2 | No strangers at court: sneak in, clothes, pose as a visitor's party "like Knigge" | **"Unauffällig"**: a borrowed or stolen livery coat, a forged letter in the name of an **invented** visitor, Hofrat Justus Amsel aus Celle (the player's own forgery, labelled FIKTION; owner decision 2026-11-20, §2.3), court zones with watchers, a suspicion meter, an inspection at the Ehrenhof gate, lossless "Hinausbegleitet" when you are caught | **L** (MVP **M**) | idea 1 (it fills the walk from the spring to the court) |
| 3 | Zelda-like side challenges (brain games), not quest-related | **"Ausreißer"**: LiDAR outlier clusters at real relief features open small point-cloud chambers with spatial survey puzzles (sun angle, wall tops between eras, traverse beams, water levels, light-solid floors, prisms, staking out, first/last return) | **L** (MVP **M**) | nothing story-wise; one small core hook change |
| 4 | Hidden small bottles of the real beer, only at favourite places / POIs | **"Fläschchen"**: 24 hand-placed bottles across five eras, unmarked, unguarded; the real beer label as a **swappable placeholder** (owner decision, see §4.1); counter, shelf in the station, cosmetic reward | **S–M** | nothing |

---

## 1. Chapter 1 opens at the Karlsbergquelle

### 1.1 Pitch

The prologue taught the touch. Chapter 1 repeats it as a **ritual**: grey November dawn at the
spring, your hand in the water, the brook runs back, and the forest turns into a warm summer morning
in 1789. Then, instead of landing in the Ehrenhof by Q, you **climb to the court on foot**, past the
Orangerie, exactly as the court made everyone do ("Zu Fuß, außer einem", cx.11). That walk is where
idea 2 lives.

### 1.2 Player loop

1. Prologue ends in the station bed (p11).
2. Title card "Der Hof". You stand at the spring at dawn (chapter checkpoint).
3. Marlene on the radio, one Laub line. The motes drift over the water (`quelle.guide`).
4. E "Wasser berühren" → the built 2.7 s scene → `quelle:touch` → shift to 1789.
5. 1789 Brunnenstube, morning. One Laub line.
6. Phase 1 (without idea 2): walk up to the Ehrenhof (about 380 m, about 2 min). Phase 2: the disguise beats first.

### 1.3 Where the player wakes

| Option | How | For | Against |
|---|---|---|---|
| A | k1_0 stays in the station, the Bussole points to the spring, walk 300 m | no teleport, no change to the checkpoint | 300 m of walking before anything happens; the owner asked to *start* at the spring |
| **B (recommended)** | the chapter `checkpoint` moves to the spring; `chapterEntered` already teleports when the player is > 30 m away (`src/systems/story/index.ts` line ~579) | the chapter opens on the picture; one-line change | the jump from bed to spring needs one sentence (Marlene: "Du bist ja schon weg") |

**Checkpoint (B):** `{ "x": 1058.2, "z": -832.4, "yaw": 54, "era": "today" }`. That is 3.5 m in front of the
trough on the trail, facing it (front faces 234°, so the viewer looks 54°; story yaw is compass
degrees, `teleport()` negates it). Probe: forest floor, 284.0 m, the same height as the trough.
The checkpoint is also the fallback wake place for beats without a `wake`. In k1 those are only
present-day beats (k1_0, k1_6, k1_7, k1_16, k1_17), where you can't be caught, so this is harmless.

### 1.4 The touch and the shift

Reuse the built system as is (`src/systems/quelle/`). The story sets `quelle.call` and `quelle.guide`,
the beat completes on `{ "event": "quelle:touch" }`, and the exit shifts.

| | Prologue p3q (built) | k1_0 (new) |
|---|---|---|
| Light today | November afternoon | `look: dawn` (today), set back to `day` in the exit |
| Words | Laub explains the rule (P3Q, P3R lines) | one Marlene radio line and one Laub line; no rule repeated |
| Target era | 1789 (light as preset) | 1789 `look: day`: summer morning |
| Q at the spring | not an anchor | add `anchor 1789 at 1061/−834.5 r 10`, so a player who drifts back to today can press Q here too |
| Prompt | E "Wasser berühren" | the same (no new string) |

**Lines (de, new; generated in `scripts/content-build/kapitel1.mjs`):**
- `marlene.k1.morgen` (rewritten, radio): „Morgen, {Name}! Du bist ja schon weg. Die Brötchen liegen auf der Stufe. Ich ess deins, wenn du nicht bald zurück bist.“
- `laub.k1.morgen` (rewritten): „Sie sind vor Sonnenaufgang los. Ich habe Sie nicht aufgehalten. Die Nadel zeigt aufs Wasser, nicht auf den Ehrenhof.“
- `laub.k1.start` (moved to the arrival, text kept): „1789. Der Hof auf seiner Höhe. …“

### 1.5 k1 beats: before → after

| Beat | Era | Where | Completes on | Wake (caught / oil empty) | Change |
|---|---|---|---|---|---|
| `k1_0` „Morgengrauen an der Quelle“ (was „Morgen in der Feldstation“) | today, dawn | spring, checkpoint above | `{event: quelle:touch}`; exit: flags `quelle.call/guide` null, `shift 1789 reason quelle`, `look day` (today) | — | rewritten: the Q tutorial at the Ehrenhof (`k1_0.am-hof`) goes; the objective „An der Quelle: E – das Wasser berühren“ (1059.3/−833.1) replaces it; keep all NPC spawns, `npc.owns.*` flags and the staff item |
| `k1_0b` „Die Brunnenstube, Sommer“ | 1789 | spring → Bleiche | phase 1: skip (k1_0 → k1_1); phase 2: `quest q.k1.kleider` done | spring today: `{x 1058.2, z −832.4, yaw 54, text „Du kommst an der Quelle zu dir, im Heute. Nichts ist verloren.“}` | **new** (idea 2) |
| `k1_0c` „Ein Brief in fremdem Namen“ | 1789 | Orangerie, Ladehof | `quest q.k1.brief` done | spring today | **new** (idea 2) |
| `k1_1` „Ankunft“ | 1789 | the Ehrenhof gate → court | `quest q.k1.ankunft` (unchanged condition) | **spring** until `court.admitted`, then the Ehrenhof (as now) | objective texts, anchor rule (below) |
| `k1_2` … `k1_17` | | | | | unchanged |

**Anchor rule (closes a back door):** today the `k1_1.heute` reaction re-anchors Q at the Ehrenhof. Q
there lands you *inside* the court and skips the gate. Until `court.admitted` is set, re-anchor at the
**spring**; after that, at the Ehrenhof as now. Phase 1 (no disguise): keep the Ehrenhof anchor from
k1_1 on.

**Oil meter:** `oel-a` (360 s per shift) would run out during the prelude. Add
`{ "not": { "flag": "k1.vorspiel" } }` to `oel-a`; k1_0b/k1_0c set `k1.vorspiel`, and k1_1 clears it.
No oil drain while you get dressed.

### 1.6 Quest change

`q.k1.ankunft` „Zu Fuß, außer einem“ (`scripts/content-build/kapitel1.mjs`):

| Objective | Before | After |
|---|---|---|
| `quelle` (new, first) | — | `type: event`, `event: quelle:touch`: „An der Quelle: das Wasser berühren“ |
| `wechsel` → `hof` | reach 1222/−1119 r22, „Am Ehrenhof: Q – Sommer 1789“ | the same reach; text phase 1: „Hinauf zum Ehrenhof, zu Fuß“. Phase 2: „Mit Rock und Brief durchs Gitter in den Ehrenhof. Nicht rennen.“ |
| `wache`, `fluegel` | | unchanged |

The offer line already fits: „Heute gehen wir hinein. Zu Fuß, wie alle. Am Gitter steht eine Wache …“

### 1.7 Files to touch (idea 1)

| File | Change |
|---|---|
| `content/story/01-kapitel-1.story.json` | `checkpoint`; `k1_0` rewritten; `k1_1` anchor rule; `oel-a` condition; (phase 2: `k1_0b`, `k1_0c`) |
| `scripts/content-build/kapitel1.mjs` → `content/quests/01-kapitel-1.quests.json`, `content/packs/kapitel-1.pack.json` | the `quelle` objective, texts, the two rewritten lines |
| `content/bible/02-kapitel-1.md` | §1.1 „Ankunft“: the spring opening; §2 place table: `loc.k1.quelle` |
| `docs/ACTION-RPG.md` | §11.1 row `q.k1.ankunft`; §14 log |
| `e2e/helpers/k1.ts` | `playK1` start (§1.8) |
| `e2e/chapter-k1.spec.ts` | the k1_0 boot now starts at the spring; add: oil runs dry in k1_0b → wake at the spring (phase 2) |
| `e2e/campaign.spec.ts` | `chapterStart(page,'prolog','k1','k1_0')` stays; assert the player is within 30 m of 1058/−832; screenshot `01-k1-start` is now the dawn spring |
| `tests/quests-content-a.test.ts` | k1 still ends at level 5–6 (rebalance XP if idea 2 adds quests, §2.5) |

### 1.8 e2e helper changes (`e2e/helpers/k1.ts`)

1. `playK1`: keep `expect(s).toMatchObject({ chapter: 'k1', beat: 'k1_0', era: 'today' })`. Add a
   position check (< 30 m from 1058.2/−832.4).
2. Replace `teleport(1224,-1117)` + `shiftToPast()` with a shared **`touchSpring(page)`**. The spring e2e
   session is adding the same steps for p3q to `e2e/helpers/prolog.ts`; import it from there.
   - Face the trough (`__k1.face(1061, -834.5)`).
   - Expect `kq.quelle.info().prompt === true`, then `kq.press('KeyE', 1)`.
   - Run `upd(170)` (2.7 s scene plus margin), then `kq.fx.shiftAt(3.6)` and `frames(60)`.
   - Expect era `1789`, beat `k1_1` (phase 1) or `k1_0b` (phase 2), and `qn('q.k1.ankunft','quelle') === 1`.
3. Phase 1: `teleport(1224,-1117)` in 1789 (the 380 m climb isn't worth the test time). The `hof`
   objective counts, then the guard's echo as now.
4. Phase 2: call `playDisguise(page, { coat: 'leihen' })` (§2.10) before step 3, and walk through the gate.
5. `boot(page, b)` with `b >= 'k1_1'`: the k1_1 `enter` grants the disguise quietly (`onResume`), so
   mid-chapter boots keep working.

### 1.9 Effort, risks, order

- **Effort:** S for the story and content build, S for e2e.
- **Risks:**
  - The second touch could feel like a repeat. Keep it wordless and change the light (dawn → summer).
  - The 380 m climb in phase 1 has no fight. The k1-orangerie route POIs already line it
    (`src/systems/travel/pois.ts`), and phase 2 fills it.
  - Campaign screenshot names shift.
- **Order:** checkpoint and k1_0 first, then the anchor rule, then the e2e helpers. Ship phase 1 alone if idea 2 slips.

---

## 2. 1789: the court lets no strangers in (the disguise opening)

> **Korrektur 2026-11-20:** "Knigge visited the Karlsberg in 1792" is **not proven**. The only source is a
> letter („Zweybrücken, den 11ten May“ [1792]) in *Briefe, auf einer Reise aus Lothringen nach Niedersachsen
> geschrieben*, Hannover 1793, S. 26–29 (BSB copy, MDZ bsb10467161). Its writer is unnamed and presents himself
> as someone who lived in Metz; the title page names Knigge only as editor („herausgegeben von“), Literaturland
> Saar calls the letters „auf 1792 vordatiert“, and the duke was away („Der Herzog war gerade abwesend“).
> Consequences: cx.43 becomes STRITTIG; the letter in Knigge's name (K1) is dropped; the disguise uses the
> invented visitor Hofrat Justus Amsel aus Celle (K2, owner decision). The corrected texts are below.

### 2.1 Pitch

You arrive in 1789 in a hi-vis vest. The court of Karl II. August is famous for keeping the world out,
so you **dress the part and walk calmly**: a lackey's coat from the laundress at the brook, and a
letter of introduction that Laub forges in the name of an invented travelling author, Hofrat Justus
Amsel aus Celle (FIKTION). In the court you hide in plain
sight. Walk upright and slowly, keep the staff and the lantern away, and stay on the paths. That is the
**inverse of the pack's rules** (crouch, darkness, cover), so it is a new skill rather than a reskin.
Guards and lackeys watch with visible fans of sight. Get spotted and you are escorted out, losing
nothing but time. The mechanic is action and movement, not a dialogue quiz.

### 2.2 Research: what is documented

**Adolph Freiherr Knigge (1752–1796)**

| Fact | Source |
|---|---|
| Born 16 Oct 1752, Bredenbeck near Hannover; died 6 May 1796, Bremen | ADB 16 (1882) S. 288–291 (Erich Schmidt), de.wikipedia |
| Hofjunker/assessor in Kassel 1771; Weimar chamberlain title 1776; Hanau court 1777–1780; Frankfurt 1780; Illuminati 1780–1784 ("Philo"); Heidelberg until 1787; Hannover 1787; from 1790/91 Hanoverian official (Oberhauptmann / Landdrost) in Bremen | de.wikipedia; ADB (the two give 1790 vs 1791) |
| „Über den Umgang mit Menschen“, 1788, two parts (3rd ed. 1790 in three parts; seven printings by 1801). Not an etiquette manual: a book on getting along with people of every rank, trade and temper | ADB; de.wikipedia |
| A sentence from its chapter on courtiers: „Sey ernsthaft, bescheiden, höflich, ruhig, wahrhaftig!“ **Verified in the 3rd edition, 1790**: Teil 3, Kap. 3 „Ueber den Umgang mit Hofleuten und ihres Gleichen“, Abschn. 3, S. 53 f. The 1790 preface announces „große Veränderungen“ against the first two editions; whether the sentence is already in the **1788** edition is **nicht verifiziert**. So only **Laub** (a voice from 1840) may quote it; no 1789 figure may | Knigge, *Ueber den Umgang mit Menschen*, 3. Aufl., Hannover 1790, Teil 3 (KNIGGE-UMGANG-1790); modern text PG-KNIGGE |
| **A travel letter published by Knigge describes the Karlsberg.** Vierter Brief, „Zweybrücken, den 11ten May“ [1792; the year from the first letter, „Metz, den 2ten May, 1792“]; the visit was „gestern früh“, i.e. 10 May. Quote (S. 28 f.): „In der That ist die Pracht, welche da im Schlosse herrscht, unglaublich; … Man sieht da Stühle, wovon … das Stück funfzig neue Louisd'or kostet. … Ein Cabinet sahe ich auf dem Carlsberge, worinn eine Sammlung von mehr als tausend seltenen Pfeifenköpfen verwahrt wird … es ist der Mühe werth, dies Feen-Schloß mit seinen Schätzen zu sehn.“ Also (S. 27): „Der Herzog war gerade abwesend“, so **no meeting with the duke** | Knigge (Hg.), *Briefe, auf einer Reise aus Lothringen nach Niedersachsen geschrieben*, Hannover: Ritscher 1793, S. 26–29, first edition seen on the BSB scan (KNIGGE-BRIEFE); quoted (from „In der That“ on) in M1910 Einl. S. XXXIII f. |
| **Who wrote it is disputed.** The writer never names himself and presents himself as someone who lived in Lorraine (Metz); the title page names Knigge only as editor („herausgegeben von“). Mannlich's editor (1910) and the Stadtmuseum read it as Knigge's own visit; Literaturland Saar calls the letters „auf 1792 vordatiert“ (no source given). So the letter is **FAKT**, the writer and the date are **STRITTIG**, and „Knigge war 1792 am Karlsberg“ must not be stated as fact | KNIGGE-BRIEFE (S. [1], S. 26–29; title page); M1910 Einl. S. XXXIII f.; LITSAAR-KNIGGE; SMZW |
| ~~„einer von ganz wenigen“ with access in 1792; the duke hid his collections even from his own court~~ **Dropped:** a museum text without a source. The primary text says only that permission was required | SMZW (museum text, no source given) |
| Other contact with Pfalz-Zweibrücken: **none found**. ADB says he "called at the Saarbrücken court" (that is Nassau-Saarbrücken, not Zweibrücken). **No documented meeting with Karl II. August** and **no documented visit of his own** to the Karlsberg | ADB; de.wikipedia; de.wikipedia „Schloss Karlsberg“ (no mention) |

**Conclusion:** the travel letter (published 1793, dated May 1792) and its words are **FAKT**; that Knigge
himself wrote it on a visit in 1792 is **STRITTIG**. Knigge does **not** appear in 1789 in any form, and no
letter in the game carries his name (§2.3). Already in the repo and still accurate: `laub.k1.feenschloss`
(„Ein Reisender nennt das alles 1792 ein ‚Feen-Schloß‘“). cx.07 („Ein Reisender, Adolph von Knigge, nannte
das Ganze 1792 …“) needs the softer wording now in the bible: „In Knigges Reisebriefen (1793) heißt das Ganze
ein ‚Feen-Schloß‘“ (code change pending, `scripts/content-build/codex.mjs`).

**Court access and etiquette at the Karlsberg (documented)**

| Fact | Source | Use |
|---|---|---|
| „Das Innere des Schlosses, dessen Eingänge 100 Gardisten bewachten …“ | M1910 Einl. S. XXXIII: **Stollreither's own statement** (editor, 1910), not an eyewitness. The sentence has no footnote; footnote 12 (Molitor) belongs to the sentence before | guards at every door |
| **Nobody could approach the Karlsberg without the duke's express permission**, and the permit („Verwilligungs-Befehl“) had to name every companion; the writer got it through „eine fürstliche Verwendung von Saarbrück aus“ | KNIGGE-BRIEFE S. 26 f. | **the letter is the key**; the permit names people, so the secretary must be named in it |
| On the hill the duke used the lack of room as a pretext to refuse everyone: „Niemand wagte sich zu zeigen, ohne gerufen zu sein oder die Erlaubnis dazu erhalten zu haben“ (first seasons on the hill, c. 1779/80) | M1910 S. 355 | the same rule, from the inside |
| Karl August „schließt sich von der Außenwelt durch seine bärtigen Grenadiere ab“ | M1910 Vorwort S. VI (editor's characterisation) | the tone of the court |
| Only the duke drove up; everyone else walked; singing was forbidden | RLS 2015 (cx.11, in the game) | walk, don't run |
| At Jägersburg (before the Karlsberg, c. 1777) nobody might appear uninvited; guests waited in Zweibrücken for permission | M1910 S. 322 f. | an invitation is the key |
| A con man, „Prinz Castrioto von Albanien“, came **end of 1777** to Zweibrücken with a warm letter of recommendation from Strasbourg to the duke's „ersten Leibarzt“ Rosé; **Rosé** spread the story that he travelled incognito (he had seen a letter with the Prussian seal). He tried several times to be presented; the duke laughed about it but was curious, and **the whole court** watched him secretly from behind the blinds in Mannlich's garden. His printed ode was copied word for word. Later the duke had him **arrested and expelled** | M1910 S. 346–349, S. 356–358; date from S. 345 Anm. 24 and S. 349. In Zweibrücken, before the Karlsberg existed | a real precedent for a forged welcome, with comic-dark tone aimed at vanity |
| Travellers carried letters of recommendation and a pass (Mannlich lost his on the road in 1766 and sent a rider out with a lantern on a stick) | M1910 S. 64 | the letter as an object |
| The site had "ein Gasthaus mit Stallungen … eine große Brauerei und ein Bierhaus" | M1910 Einl. S. XXXIII; catalogue KB-B26/KB-B36 „Brauerei und Wirtshaus“ (1240–1251/−1766…−1778, confidence low) | visitors' inn; (idea 4 context) |
| **Not documented:** a dress code, how the gate guard checked people, a laundry or bleaching meadow, lackeys' livery colours | M1910 OCR searched for Livree, Kleidung, Hofkleid, Uniform, Zutritt: nothing for the Karlsberg | all of that is **FIKTION** in the game |

### 2.3 Decision: whose name is on the letter?

| Option | What | For | Against |
|---|---|---|---|
| ~~K1~~ (dropped) | Laub forges a letter **in Knigge's name**; you pose as his travelling secretary sent ahead | was the owner's hook | **dropped 2026-11-20:** its premise ("Knigge really came in 1792", "the turn-in tells the real visit") is not proven (Korrektur above), and it put words under a real person's name (PRD §4.4 rule 2) |
| **K2 (chosen)** | the same mechanic, with an invented visitor: **Hofrat Justus Amsel aus Celle** (FIKTION), a travelling author of „Vom Betragen bei Hofe“ (invented book). You play his secretary, sent ahead | no rule-2 question at all; the name check found no real 18th-century Hofrat Amsel; the real access rule (written permit naming every companion, KNIGGE-BRIEFE S. 26 f.) makes the forgery the obvious key | needs cx.43 (STRITTIG) and cx.44 to teach the real history |

→ **Decision (owner, 2026-11-20): K2, visitor A = Hofrat Justus Amsel aus Celle.** There is no letter in
Knigge's name, and Knigge does not appear in 1789. Laub may mention the real book „Über den Umgang mit
Menschen“ (1788) and the travel letter as context, never as a visit fact.

### 2.4 Player loop

1. 1789 at the Brunnenstube. Laub: orange is a problem.
2. **Coat** (`q.k1.kleider`): the laundress Liese at the brook. Either *earn it* (fight the Mahnbriefe that blow into her linen) or *take it* (lift it off the line while her back is turned).
3. **Orangerie (teaching zone):** first watchers, a gentle meter. Take a sheet of paper from the Pfeilersaal while the servant looks away.
4. **Seal wax:** tear Mahnbriefe at the Orangerie's Ladehof; they drop seal wax.
5. **Letter:** sit at the garden table; Laub writes (a short scene).
6. **Gate:** walk calmly to the guard, hold E to show the letter, and stand still through a 2.5 s inspection. The gate opens.
7. **Inside (rest of Teil A):** court zones stay watched (Ehrenhof, palace rooms); service zones (Küchenhof, Bauplatz, Zwinger) are not, and that's where the fights happen.
8. Spotted? You are escorted out to the zone's exit, losing nothing but time.

### 2.5 Content

**Quests** (`scripts/content-build/kapitel1.mjs`; XP chosen so k1 still ends at level 5–6: take about 90 XP from `q.k1.registratur` / `q.k1.zwinger` / `q.k1.karlslust`)

| Id | Kind | Giver → turn-in | Objectives (place) | Enemies | Rewards | History |
|---|---|---|---|---|---|---|
| `q.k1.kleider` „Kleider machen Leute“ | main | Liese (`waescherin`, Bleiche **1004/−857** (prüfen: meadow, 281.3 m, by the brook; 58 m from the nearest story place)) → Liese | `talk` Liese (topic `rock`); then **either** `kill` 5 Mahnbriefe in the linen (1010/−860 r 14) → she hands over the coat, **or** `use` the coat on the line (hold E 1.5 s while her sight fan is off you) → it's yours | mahnbrief ×5 (+1 nebelweber escort) on the "earn" path | 60 XP, `item.k1.livree` (key item: the coat); deed flag `flag.k1_kleid` = `geliehen` / `genommen` | none (fiction); Liese's „Wäschelohn: angewiesen“ links to cx.08 |
| `q.k1.brief` „Ein Brief in fremdem Namen“ | main | Laub (voice) → auto | `collect` a sheet of the Bauamt's paper (Pfeilersaal, room `B10.1.s-pfeilersaal`, window table, ≥ 4.3 m from the servant and from `clue.k1.festplan`; take it unseen); `kill` 4 Mahnbriefe at the Ladehof **1335/−892** (prüfen) with `drop: {enemy: mahnbrief, chance: 0.5}` → `collect` 2 `item.k1.siegellack`; `examine` the garden table **1262/−1008** (prüfen) (`clue.k1.brief`: Laub writes) | mahnbrief ×4 (+1 foliant) | 70 XP, `item.k1.empfehlung` (key item) | turn-in: cx.43 the travel letter (STRITTIG), cx.44 the permit, cx.45 the false prince |
| `q.k1.ankunft` (changed, §1.6) | main | Laub → auto | `quelle`, `hof` (now through the gate), `wache`, `fluegel` | — | 60 XP | cx.11, cx.44 |

**NPCs** (`src/systems/npc/roster.ts`; all FIKTION, all memory figures; people are **never** enemies)

| Id | Look | Place (1789) | Role |
|---|---|---|---|
| `waescherin` „Liese, Wäscherin“ | `maid`, `mobcap`, `basket`, warm | 1004/−857 (Bleiche set) | coat giver; watcher on the steal path (sweep 6 s) |
| `hofgaertner` „Ein Hofgärtner“ | `carter`, `slouch`, rake | 1268/−992 (Orangerie parterre, lawn) | watcher, gentle (teaching zone) |
| `diener` (exists) | | Pfeilersaal | watcher inside the room while you take the paper |
| `gardist` ×2 „Gardist“ | `official`, `tricorn`, `wig`, a pike (new prop) | 1186/−1106 and 1185/−1121 (prüfen; west of the gate, between the Wachhäuser KB-B37/B38) | inspection at the gate; watchers |
| `lakai` „Ein Lakai“ | `livery`, no hat, `wig` | 1206/−1170 (Durchfahrt, prüfen) | watcher on the back route |

**Set:** `bleiche` (1789 only, `src/systems/scenery/`): drying lines between two posts, a wash tub, a
basket, linen; `keepFree` Liese's 6 m talk circle; add 1004/−857 to `KEEP_CLEAR`.

**Lines (de, samples; voices `content/bible/08-stimmen.md`; the guards speak "Er" like the existing `wache.k1.rennen`)**

| Id | Speaker | Text |
|---|---|---|
| `laub.k1.orange` | Laub | „Sommer 1789. Kies, Hunde, irgendwo eine Geige. Und mittendrin Sie. In Orange.“ |
| `laub.k1.fremde` | Laub | „Der Herzog lässt keine Fremden in seinen Garten. Hundert Gardisten an den Türen, schreibt man. Wir brauchen zwei Dinge: einen Rock, der nicht leuchtet, und ein Papier, das jemand anders geschrieben hat.“ |
| `waescherin.k1.01` | Liese | „Jesses, wie sieht Er denn aus? Wie ein Feuersalamander.“ |
| `waescherin.k1.02` | Liese | „Einen Rock? Auf der Leine hängt Kaspars, der Lakai liegt seit drei Wochen mit Fieber. Aber erst helf Er mir: Die Zettel da fliegen mir in die Wäsche. Wäschelohn: angewiesen. Steht auf allen.“ |
| `waescherin.k1.dieb` | Liese | „He! Das ist Kaspars! Häng Er das zurück!“ (the coat goes back on the line; try again) |
| `waescherin.k1.dank` | Liese | „Steht Ihm besser als Kaspar. Sag Er keinem, woher.“ |
| `laub.k1.brief` | Laub | „Wir schreiben im Namen des Hofrats Justus Amsel aus Celle. Er reist, er schreibt Bücher, eins heißt ‚Vom Betragen bei Hofe‘. Sie sind sein Sekretär, vorausgeschickt. Den Hofrat gibt es nicht. Das weiß die Wache nicht. Ich weiß es. Ich sage es nur Ihnen.“ (FIKTION: Amsel and his book are invented) |
| `laub.k1.erlaubnis` (optional) | Laub | „Ohne ausdrückliche Erlaubnis des Herzogs kommt keiner hier herauf. Und jeder, der mitkommt, muss mit Namen drinstehen. Also schreiben wir Sie hinein.“ [F, KNIGGE-BRIEFE S. 26 f.; M1910 S. 355] |
| `laub.k1.umgang` (optional) | Laub | „Ein echtes Buch über den Umgang mit Menschen gibt es schon, vom Freiherrn Knigge, letztes Jahr erschienen. Seinen Namen leihen wir uns nicht.“ [F, Umgang 1788: ADB-KNIGGE] |
| `laub.k1.wahrhaftig` | Laub | „Knigge schreibt, in einer späteren Auflage: ‚Sey ernsthaft, bescheiden, höflich, ruhig, wahrhaftig!‘ Vier von fünf schaffen wir.“ [Z, KNIGGE-UMGANG-1790 Teil 3, Kap. 3, S. 53 f.; 1788 nicht verifiziert, so only Laub] |
| `laub.k1.siegel` | Laub | „Die Wache liest nicht. Sie schaut aufs Wachs.“ |
| `gardist.k1.ok` | Gardist | „Der Herr Sekretär vom Herrn Hofrat Amsel. Steht drin. Zu Fuß, wenn's beliebt.“ |
| `gardist.k1.ohne` | Gardist | „Ohne Papier kommt hier keiner durch. Auch nicht im schönen Rock.“ |
| `gardist.k1.orange` | Gardist | „In dem Aufzug? Der Herr ist wohl vom Theater. Raus.“ |
| `gardist.k1.raus` (variants) | Gardist | „Raus. Und komm Er mir nicht wieder.“ / „Schon wieder Er? Ich schreib Ihn auf.“ / „Ich begleite Ihn gern. Ich hab ja sonst nichts zu tun.“ |
| `hofgaertner.k1.rasen` | Hofgärtner | „Den Rasen betritt der Gärtner. Sonst keiner.“ |
| `lakai.k1.laterne` | Lakai | „Am hellen Tag mit der Laterne? Such Er sich einen Menschen.“ |
| `soll.k1.brief` (topic, k1_2) | Soll | „Hofrat Amsel? Aus Celle? ‚Vom Betragen bei Hofe‘? Nie gehört. Dann betragen Sie sich, mein Herr, meine Dame, mein … Sie. Leise.“ (Amsel and his book are FIKTION) |

The existing `wache-rennen` reaction (speed ≥ 4.8 near 1212/−1116) folds into the running tell and keeps its four variants.

### 2.6 The mechanic: "Unauffällig"

**Zones** (data in `src/systems/court/zones.ts`)

| Zone | Shape | Watchers | Exit point (escorted to) | Rule |
|---|---|---|---|---|
| `court.orangerie` (teaching) | circle 1260/−985 r 45 + room `B10.1.s-pfeilersaal` | Hofgärtner, Diener | 1205/−952 (prüfen; the trail below the terrace) | all tells ×0.6 |
| `court.ehrenhof` | circle 1212/−1116 r 36 (the existing guard circle) + rooms of KB-B01/B02/B03/B06 | 2 Gardisten, Lakai, 1–2 interior lackeys | 1180/−1112 (outside the gitter) | full; ×0.5 once `court.admitted` |
| forbidden sub-zones | rooms: the duke's private rooms (KB-B03 upper floor), `B01.1.eg-kabinett`, `B01.2.og-festsaal` | any watcher | as above | "falscher Ort" tell |
| service zones (no checks) | Küchenhof 1212/−1180 r 18, Bauplatz 1300/−1254 r 35, Ladehof, Jägerhaus yard, Zwinger, woods, the Karlslust (Teil B) | — | — | fights live here |

**Suspicion:** one value per watcher, from 0 to 1. A watcher counts a tell only while you are inside its
sight fan (range 12–16 m, fov 70°, `lineOfSight` from `src/systems/hunt/perception.ts`). It decays at
−0.25/s when it sees no tell. The HUD shows the highest value as an eye pip; the ground shows the
fans (`src/systems/hunt/cones.ts` look: pale → orange → red).

| Tell | Detected by | Rate |
|---|---|---|
| Hi-vis clothes (no `disguise.coat`) | in a court zone and seen | full in 1.2 s (≤ 10 m) |
| Running | speed ≥ 4.8 m/s (the existing guard threshold) | +0.6/s |
| Staff in hand | an attack, a block, lock-on, or a Wuchthieb charge in the last 4 s | an attack is instant 1.0; otherwise +1.0/s |
| Dodge roll | Space | +0.6 per roll |
| Lantern lit by day | lantern on | +0.5/s |
| Off the paths | surface `lawn` / `parterre_sand` / beds (`world.surfaceAt`), the stand-in for climbing (the controller has no jump or climb; Geisterblick only works today) | +0.6/s |
| Wrong place | inside a forbidden sub-zone | +0.8/s |
| Crouching or prone in plain sight | stance ≠ stand (**the inversion**: sneaking looks guilty) | +0.3/s |
| Measuring tape (R) out | tools `measure` active | +0.4/s |
| Taking something in view | a pickup flagged `unseen` (the paper, the coat on the steal path) | instant 1.0 |
| Lingering | within 2 m of a watcher for more than 3 s | +0.3/s |

**Thresholds:** 0.35 "Blick" (the watcher turns its head; caption „[Ein Lakai sieht herüber]“) → 0.7
"Misstrauen" (it steps towards you and barks a line) → 1.0 **"Aufgefallen"**.

**Aufgefallen → "Hinausbegleitet":**
- 0.6 s fade, then you are teleported to the zone's exit point with a guard line (variants).
- All watchers reset. No damage, no oil, no XP lost, no era change.
- `court.ejected` +1 drives the running joke.
- A soft `player:caught {soft:true}` is **not** used, because that is the pack's curtain.

**Bow (the one social action):** with any watcher at ≥ 0.35, E „Verbeugen“ (hold 0.6 s) lowers it by 0.4, with an 8 s cooldown. It works only standing still, so it uses the same calm-body rule.

**Gate inspection („Musterung“):**
1. At 4 m from a Gardist: E „Brief vorzeigen“ (hold 1 s).
2. A 2.5 s ring closes around you. During it every tell counts ×3, so stand still, staff away, lantern off.
3. No letter → `gardist.k1.ohne` (refused, not ejected). No coat → `gardist.k1.orange` → ejected.
4. Pass → `cue scenery:gate {open:true}` (the gate already opens: `src/systems/scenery/index.ts` `setGate`), flag `court.admitted`, `gardist.k1.ok`.

**Back route (optional):** through the Küchenhof and the Durchfahrt past the Lakai's sweep. It works
without the letter, but inside you stay "not admitted": tells ×1, and any Gardist inspects you when you
pass within 4 m.

**Saves and other systems:** flags `disguise.coat`, `disguise.letter`, `court.admitted` and
`court.ejected` persist. Fast travel to the `ehrenhof` survey point while not admitted lands you at
1180/−1112 (outside), with a toast.

**Avatar:** `src/player/avatar.ts` already recolours material slots (`SURVEYOR_COSTUME`). Add
`COURT_COSTUME`: coat slot `Green` → dark blue, the hi-vis slot `LightGreen` → cream waistcoat (no
emissive), trousers → black breeches tone. Apply it whenever `disguise.coat` is set and the era is not
today. So you are the surveyor today and the lackey in every past era from then on (cosmetic in k2–k4).

### 2.7 How it fits the existing systems

| System | Fit |
|---|---|
| combat | no spectral spawns inside court zones; every k1 fight (Küchenhof Mahnbriefe, the Schuldbuch on the Bauplatz) is already in a service zone. Attacking where a watcher can see you = instant Aufgefallen. Guards are people: not targetable, no hit reaction (`combat` ignores npc figures as now) |
| hunt | separate meter, **not** the pack's alert. Reuses `perception.ts` (`lineOfSight`) and generalises `cones.ts` (`SightCones` takes a list of `{x, z, yaw, range, fov, level}` instead of a `PackSim`) |
| npc | new looks; a `watch` block on the `npc` spawn action (`{fov, range, sweep:[yawA,yawB], period}`) that the court system reads; one additive hook `npc.setYaw(id, yaw)` for head turns. Talk still works (the talk radius is a safe zone, as now) |
| chronik / codex | cx.43–cx.46 (§2.8); cx.38 (Fiktionsliste) gains Liese, Kaspar's coat, Hofrat Amsel and his book, the forged letter and the inspection |
| story | flags and quest conditions only, no new action type; watcher sets switched by `cue court:on {set:'k1'}` / `court:off` |
| deeds (§8.6) | `flag.k1_kleid` (geliehen / genommen) in `scripts/content-build/epilogue-deeds.mjs`: the epilogue can say whether you borrowed or stole Kaspar's coat |
| travel | the arrival rule above; the Bleiche and the Ladehof go into `KEEP_CLEAR` |

### 2.8 Codex cards (proposals; `scripts/content-build/codex.mjs`, next free ids)

> Corrected 2026-11-20 against the primary text (KNIGGE-BRIEFE) and M1910; replaces the first drafts.

**cx.43 – Knigges Reisebriefe** · STRITTIG
> Adolph Freiherr Knigge (1752–1796) war Hofmann, Schriftsteller und Aufklärer. 1788 erschien sein Buch
> „Über den Umgang mit Menschen“. Es ist kein Benimmbuch, wie man heute oft meint, sondern handelt davon, wie
> Menschen verschiedener Stände, Berufe und Gemüter miteinander auskommen. 1793 gab Knigge „Briefe, auf einer
> Reise aus Lothringen nach Niedersachsen geschrieben“ heraus. In einem Brief vom 11. Mai 1792 besucht der
> Reisende den Karlsberg. Ohne ausdrückliche Erlaubnis des Herzogs, schreibt er, dürfe sich niemand dem Berg
> nähern; er hatte sie über den Hof in Saarbrücken bekommen. Der Herzog war gerade abwesend. Der Reisende sah
> Stühle, die angeblich fünfzig neue Louisdor das Stück kosteten, Tapeten aus den Federn ausländischer Vögel
> und ein Kabinett mit mehr als tausend seltenen Pfeifenköpfen. „Es ist der Mühe werth, dies Feen-Schloß mit
> seinen Schätzen zu sehn.“

`contested_de`:
> Der Briefschreiber nennt keinen Namen und stellt sich als jemand vor, der in Lothringen gelebt hat; Knigge
> steht nur als Herausgeber auf dem Titel. Mannlichs Herausgeber (1910) und das Stadtmuseum Zweibrücken lesen
> den Brief als Knigges eigenen Besuch, Literaturland Saar nennt die Briefe „auf 1792 vordatiert“.

Sources: KNIGGE-BRIEFE (Vierter Brief, Zweybrücken, 11. Mai [1792], S. 26–29; quote S. 28 f.); M1910 Einl.
S. XXXIII f. (quotes the letter, footnote 13); ADB-KNIGGE; WP-KNIGGE (not an etiquette book); for
`contested_de`: LITSAAR-KNIGGE, SMZW. Solid: a travel letter of 1792/93, published by Knigge, calls the
Karlsberg a „Feen-Schloß“. Disputed: the writer and the date. New source keys in `common.mjs`:
`KNIGGE-BRIEFE`, `ADB-KNIGGE`, `WP-KNIGGE`, `LITSAAR-KNIGGE`, `SMZW`.

**cx.44 – Wer hinauf durfte** · FAKT
> Den Karlsberg sah kaum ein Fremder von innen. Schon in den ersten Jahren auf dem Berg nahm der Herzog den
> Platzmangel als Vorwand, niemanden vorzulassen: „Niemand wagte sich zu zeigen, ohne gerufen zu sein oder die
> Erlaubnis dazu erhalten zu haben“, schreibt Mannlich. Ein Reisender, der 1792 hinauf wollte, brauchte eine
> ausdrückliche Erlaubnis des Herzogs, und die musste jeden Begleiter mit Namen nennen. Nur der Herzog fuhr
> hinauf, alle anderen gingen zu Fuß. Die Eingänge des Schlosses bewachten, so schreibt der Herausgeber von
> Mannlichs Erinnerungen 1910, hundert Gardisten.

Sources: M1910 S. 355 (nobody without being called or permitted) and Einl. S. XXXIII (100 Gardisten,
Stollreither's own text, no footnote); KNIGGE-BRIEFE S. 26 f. (the permit naming every companion); RLS (only
the duke drove up). Optional extra sentence (M1910 S. 322): „Schon im Jagdschloss Jägersburg durfte niemand
unaufgefordert erscheinen; Gäste warteten in Zweibrücken auf die Erlaubnis.“ Dropped from the draft: the
collections hidden from the court and „Knigge gehörte 1792 zu den ganz wenigen Besuchern“ (SMZW, no source).

**cx.45 – Der Prinz von Albanien** · FAKT (nach Mannlichs Erinnerungen)
> Ende 1777 kam ein Fremder nach Zweibrücken, mit einer Börse voller Dukaten und losen Diamanten in Papier. Er
> brachte einen warmen Empfehlungsbrief aus Straßburg an den ersten Leibarzt des Herzogs mit. Der Arzt
> erzählte überall, der Fremde sei ein Prinz, der inkognito reise, um jedes Zeremoniell zu meiden; er habe
> einen Brief mit preußischem Siegel an den „Prinzen Castrioto von Albanien“ bekommen. Mannlich glaubte ihm
> nicht: Er hatte auf Reisen so viele falsche Barone getroffen, warum nicht auch falsche Prinzen? Der Prinz
> versuchte mehrmals, bei Hof vorgestellt zu werden. Der Herzog lachte darüber, wollte ihn aber doch sehen:
> Mannlich lockte ihn in seinen Garten, und der Hof sah ihm heimlich hinter den Jalousien zu. Eine Ode, die
> der Prinz drucken ließ, war Wort für Wort abgeschrieben. Später ließ der Herzog ihn verhaften und des Landes
> verweisen.

Source: M1910 S. 346–349 (arrival, letter, incognito, blinds, ode) and S. 356–358 (arrest, expulsion); date
from S. 345 Anm. 24 (Mannlich's wedding, 23 Dec 1777) and S. 349 (30 Dec 1777). Note for writers: this
happened **in Zweibrücken**, before the Karlsberg existed.

**cx.46 – Ein Brief in fremdem Namen** · FIKTION
> Erfunden: die Wäscherin Liese und Kaspars Rock, der Hofrat Justus Amsel aus Celle und sein Buch „Vom
> Betragen bei Hofe“, der Brief, den du mit Laub in seinem Namen schreibst, die Musterung am Gitter und die
> Wachen, die dich hinausbegleiten. Einen Hofrat Amsel hat es nie gegeben. Echt ist nur die Regel: Ohne
> Erlaubnis des Herzogs kam niemand auf den Karlsberg (cx.44).

### 2.9 Systems and files

| File | Change |
|---|---|
| `src/systems/court/` (new): `index.ts`, `logic.ts` (pure; tells → suspicion; unit-tested), `zones.ts`, `strings.ts` | the mechanic; events `court:suspicion {watcher, level}`, `court:admitted`, `court:ejected {zone, n}`; hooks `kq.court.state() / watchers() / inspect() / set(level)` |
| `src/systems/index.ts` | one line after `npc` and `scenery` |
| `src/systems/hunt/cones.ts` | generalise the input (no behaviour change for the pack) |
| `src/systems/npc/roster.ts`, `npc/index.ts`, `npc/figure.ts` | 4 looks, a pike prop, the `watch` spawn block, `setYaw` |
| `src/player/avatar.ts` | `COURT_COSTUME` + switch |
| `src/systems/scenery/` | the `bleiche` set |
| `src/systems/travel/index.ts` | the court arrival rule |
| `src/systems/story/types.ts` + `validate.ts` | `watch` on the npc action (additive) |
| story, `kapitel1.mjs`, `codex.mjs`, `common.mjs`, `speakers.mjs`, `epilogue-deeds.mjs` | content (§2.5, §2.8) |
| `content/bible/02-kapitel-1.md`, `07-codex.md`, `08-stimmen.md` | text sources |
| `docs/ACTION-RPG.md` §4.6 (where fighting happens: court zones), §11.1, §14; `PRD.md` §3.4 (a new pressure: "Aufmerksamkeit") + changelog | docs |
| `e2e/court.spec.ts` (new) | tells → suspicion; ejection is lossless; inspection refusals (no letter, orange, running, staff); the steal path; fast travel while not admitted |

### 2.10 Effort, risks, order

- **Effort:** L in total.
  - MVP (M): Orangerie teaching zone, gate inspection, ejection, four tells (clothes, running, staff, taking in view), cones, the costume.
  - Later: bow, lawn, lantern and tape tells; the back route; interior lackeys.
- **Risks:**
  - Rule 2 (§2.3): resolved by the owner's decision (K2, the invented Hofrat Amsel; no letter in Knigge's name).
  - Stealth frustration. Playtest round 4 asked for visible danger; the fans and the lossless ejection answer it, and the teaching zone is ×0.6.
  - The k1 length grows by about 8 min (bible: 30–35 min). Keep the prelude ≤ 8 min.
  - Head-turn animation on ghost figures (npc rigs).
  - Clashes with other sessions' files (npc, avatar, story file).
- **Order:** court logic + tests → cones generalisation → watchers on NPCs → gate inspection + ejection → `q.k1.kleider` → `q.k1.brief` → costume → e2e `playDisguise` (in `e2e/helpers/k1.ts`) and `e2e/court.spec.ts` → the polish tells.

---

## 3. Side activity: "Ausreißer" (point-cloud chambers)

### 3.1 Pitch and fiction

A real LiDAR phenomenon is our door. **Ausreißer** (outliers) are stray points that float above or below
the ground in a scan. Marlene's software flags them „bitte löschen“. In the fiction, some outlier
clusters at real relief features are **folded measurements**: places where Laub, as a surveyor in 1840,
"could never close his traverse". Walk into one, and the world falls away into points. You stand in a
small **chamber** made of the scan, where survey tools become physics. Solve it and you "close the
traverse": you set a brass **Messmarke**, and the outlier is gone from the scan (Marlene on the radio:
„Ausreißer bei 1170/−1300 gelöscht. Warst du das?“).

**Originality guardrails (NEXT-SESSION §5):**
- Do not use the words shrine, temple, trial or monk, or anything like them.
- No glowing blue-orange tech and no chime motifs from other games.
- Our look: height-coloured points (the Röntgenblick palette), chalk-blue survey lines, brass instruments.
- Our sound: the hum of the scanner's rotating mirror, and a pencil on the field book.
- Our vocabulary comes from surveying: Polygonzug, Nivellement, Streiflicht, Fluchtstab, erstes/letztes Echo.

### 3.2 Player loop

1. In **today**, any relief mode (1–3) shows a slowly turning knot of points 1.5 m above a real feature, visible from 25 m. Without relief it's a faint shimmer.
2. Hold E 1 s „Ausreißer einmessen“. A 1.2 s transition: the world turns to points and drops away.
3. Three rooms, about 4–8 min: teach → twist → master.
4. Set the Messmarke (E) → back at the entry → reward.
5. The Journal tab "Sammlungen" gains a row „Ausreißer 3/8“, and the map marks the closed ones.

**Rules inside a chamber:**
- No combat, packs, meters or oil drain, and the time of day is frozen.
- Falling = a 1 s fade and you are back at the room start, with no damage.
- After 3 min without progress in a room, Laub draws a faint chalk line of the **next step**. That is a hint, never the answer, and there are no questions.
- Saving inside saves you at the entry, with the chamber not done.
- Ausreißer exist only in the 2025 scan, so only in **today**: no era overlap with any story place.

### 3.3 Eight chambers

Each entry was checked against `KEEP_CLEAR` (≥ 28 m) and probed. All lie in the present.

| # | Name | Entry: real feature, x/z | Core mechanic | Tools | Rooms 1 → 2 → 3 | Needs |
|---|---|---|---|---|---|---|
| 1 | **Streiflicht** | Hohlweg (LiDAR KB-10, rm.04), **1170/−1300** (gravel, 344.1; 47 m clear) | hillshade with **one** sun azimuth: only lit faces of the point relief are solid; shadow is void. Walk round a brass azimuth ring to set the sun | relief mode 1; the Messstab planted as a gnomon | one azimuth reveals a path → two rings, two azimuths in sequence → the sun turns by itself and you cross while the path sweeps | Relief 1 |
| 2 | **Mauerkrone** | Nordterrasse (KB-20, rm.01), **1250/−1440** (34 m clear) | **Q flips the chamber**: 1789 = walls standing (walk their narrow tops across voids); today = robbed-out trenches and erosion ramps (climb between levels). Teaches the rm.05 lesson: "the wall you see in the scan is the hole" | Q (owned by the chamber), relief mode 2 to read which state shows what | flip once → plan a route that alternates → a timed flip (the 1789 wall "fades" after 5 s) | Relief 2 |
| 3 | **Polygonzug** | Gipfelplateau (r03-07, 364 m), **1555/−632** (80 m clear) | carry and plant survey **tripods**; each sends a beam to the next tripod it can see. Beams are walkable bridges ("Lichtsteg"); the goal is a closed loop back to the start | tripods (the travel tripod model), R (Messen) shows the leg lengths | 3 tripods, open floor → pillars block sight; plant on ledges → close a loop whose legs must be under 20 m | Kartograf 3 (R) |
| 4 | **Nivellement** | Karlsbergweiher dam, north end (KB-42, rm.08), **812/−840** (meadow, 277.0; 36 m clear) | sluices set water levels in four basins; floating planks must sit at the **same height** to form a crossing. The Messstab is a levelling rod: hold it in water to read the height | Wuchthieb opens or closes a sluice; relief mode 3 shows depth (water gives no points in a scan) | two basins → four, with an overflow order → one basin feeds two | Relief 3 |
| 5 | **Laternenkammer** | Orangerie retaining wall, south end (KB-30, rm.07), **1225/−930** (29 m clear) | two sets of geometry: **lit-solid** (points exist only inside the lantern's light) and **dark-solid** (the shadows of point pillars are floors). L toggles which set is real | lantern (no oil drain here) | walk the lit floor → douse to cross light barriers → both in one jump-free sequence with moving pillars | (none) |
| 6 | **Prismen** | Brunnen am alten Forsthaus (r03-06), entry offset **1345/−1500** (47 m clear; the well itself is 23 m from the k4 Standpunkt) | route a beam down a **well shaft** with surveying **reflector prisms** (rotate with E; carry small ones) onto receivers that lower platforms | Bannlicht (RMB) is the light source | one prism → three, in a chain → the beam must pass the same prism twice (two faces) | Bannlicht (prologue end) |
| 7 | **Grenzbegang** | the two real boundary stones „D/S“: **994/−1200** (r03-16b) and **570/−764** (r03-16a), one chamber with two doors | **staking out**: sight along two ranging poles to set a third in line; set a right angle with a 3-4-5 cord; misplaced stones snap to the true line only when aligned within 0.2 m | the Messstab as Fluchtstab; the map overlay (Kartograf 1) shows the old boundary | align 3 → a right angle → a closed parcel that opens the second door; entering from the other stone shows the other half | Kartograf 1 |
| 8 | **Erstes und letztes Echo** | Apfelallee, middle (LiDAR KB-14; today forest, canopy 32 m), **1470/−690** (144 m clear) | toggle which scan return is solid: **first return** = tree crowns as platforms high up, **last return** = the ground. A real ALS concept | V (Röntgenblick) switches the layer | ground → crowns → alternate mid-air under a time limit | Röntgenblick (k3) |

Chambers 1, 2 and 5 can open right after the prologue, 3 and 7 after k2, and 6 and 8 later. Entries
outside the point-cloud tile (`meta.pointcloud`: x 700–1700, z −1600…−600) are #7's second door and
none other. They get pseudo-points sampled from the heightfield for the transition.

### 3.4 Rewards (never story-gating)

| For | Reward |
|---|---|
| each chamber | a **Messmarke** (collection „Messmarken“ in `COLLECTIONS`, 8 pieces), 40 XP (320 XP in total, so the level curve barely moves) |
| chambers 2, 4, 6, 8 | +1 talent point each (+4; the tree has 20 ranks and the campaign gives 11, so there is room) |
| all eight | cosmetic: Messstab paint „Nivellierlatte“ (yellow and black), lantern glass „Kreidblau“; Laub's line about the 1840 traverse that finally closes |
| codex (optional) | four FAKT cards on survey methods (Polygonzug, Nivellement, Triangulation, first/last return of airborne laser scanning). Sources still to add: no card without a source |

### 3.5 Tech approach

**Option rejected: a separate three.js scene.** It would duplicate the player controller, camera,
animation and input. The feel would drift from the main game.

**Recommended: a pocket chamber in the same scene, run as an instanced interior.**

1. **Pocket:** a fixed origin inside the terrain bounds but far from every set, route and POI, with the floor far above the terrain (for example x 2200, z −2050, y 600; terrain hMax is 366 m). **(prüfen** that nothing builds there).
   - While inside, hide the world groups (terrain, forest, nature, palace, scenery, water, npc, combat and travel visuals).
   - Switch the atmosphere to a "point void" preset.
   - Distance-built systems unload by themselves because the player is far away (a perf win).
2. **Collision and floors:** chambers are data (`content/kammern/<id>.json`): floor polygons with a height and a `when` predicate (`always | lit | dark | era:1789 | era:today | sun:[a0,a1] | water≥y | first | last`), walls, movable objects (tripod, prism, gnomon, sluice, plank), emitters, receivers, exits.
   - The pure query layer of interiors already does height-aware walls and floors: `src/systems/interiors/collide.ts` (`PlanQuery`, incl. `dynamic` walls) + `geom.ts`. Reuse it with a "solidity mask" that is re-evaluated when the state flips.
3. **The one core change:** `world.groundOverride`, `world.surfaceOverride` and `collider.overlay` are single slots that interiors owns and reassigns on every plan change (`src/systems/interiors/index.ts` lines ~219, 662, 791). Add a tiny **provider stack** (`world.addGroundProvider(id, fn, priority)`, the same for surface and overlay) and port interiors to it with no behaviour change. The chamber provider wins while active.
4. **Render:** Points with a shader derived from `src/systems/tools/xray.ts` (height ramp, size attenuation). Points that are solid now are bright; non-solid points are dim and flicker. Thin line meshes draw beams and traverses. Instruments are procedural brass or CC0 (Kenney / Quaternius). Budget ≤ 150 k points per chamber.
5. **Input ownership:** Q, E, L, RMB, R, V and 1–3 are owned by the chamber system while inside (the same pattern as the spring's `e.owner`). The travel block is `busy`.
6. **Solvability test:** each room carries a scripted `solution` (a list of actions) that `tests/kammern.test.ts` runs headless against the pure logic. No chamber ships unsolved.
7. **New system:** `src/systems/kammern/` (`index.ts`, `logic.ts`, `build.ts`, `data.ts`, `strings.ts`); one line in `src/systems/index.ts` (after `interiors`, `tools`, `travel`); hooks `kq.kammern.enter(id) / state() / solve()`.

### 3.6 Effort, risks, order

- **Effort:** L in total.
  - MVP (M): framework + #5 Laternenkammer (no new tools) + #1 Streiflicht.
  - Each further chamber: S–M.
- **Risks:**
  - Looking or feeling derivative. Mitigate with the guardrails in §3.1 and a review by a fresh agent before the art pass.
  - The core hook change collides with the interiors owner session.
  - Input conflicts (Q / E).
  - Puzzle difficulty spikes. The 3-min chalk hint and the optional status soften them.
  - Point count on low tier. Halve the points on `?q=low`.
- **Order:** provider stack → pocket enter/exit + void → data format + `PlanQuery` reuse → #5 → #1 → journal row and rewards → #2, #3, #4, #6, #7, #8.

---

## 4. Hidden collectibles: the "Fläschchen"

### 4.1 Owner decision (2026-11-20)

> **Owner decision (2026-11-20, relayed by the coordinator; NEXT-SESSION §5 exception)**
> - The hidden bottle collectibles carry the **real beer label** (brand and product name), **public repo and site included**, as a **swappable placeholder** (one constant/texture, plain text label only, no logo artwork); never in codex/quests/dialogue.
> - There is **no permission from the brewery** yet; the owner accepts the risk. **Swap** to an invented label (§4.3) when permission is refused or when the owner says so.
> - Before release, also have someone check alcohol-marketing and youth-protection rules for a USK-16 game. The bottles are never drunk, give no effect and are never shown being consumed.
> - **The single switch:** `content/collectibles/flaschen.json` → `label` (the text lines + `"placeholder": true`).
>   - It is rendered to **one** texture and **one** material in `src/systems/flaschen/label.ts`. Nothing else holds the text.
>   - Plain text in our own font only. No logo artwork, emblem, label layout, label colours or bottle shape copied from the brewery.
> - The name never appears in codex cards, quests, dialogue, journal text, item names, toasts or docs. Docs say "the real beer label".
> - **Place name (owner, 2026-11-20):** the place name "Karlsberger Hof" is allowed as a location only (the tour's meeting point; `docs/design/tour/`), with no logo, signage, slogans, products, advertising tone or beer talk. It is not the label text.
> - **Swap = one edit (planned unit test):** `tests/flaschen.test.ts` checks that the label text appears in exactly one collectibles source file (`content/collectibles/flaschen.json`) and nowhere else under `content/` or `src/`, so swapping it stays a single edit.

```jsonc
// content/collectibles/flaschen.json (sketch)
{
  "label": {
    "lines": ["<BRAND>", "<PRODUCT>"],   // the real beer label the owner asked for; take the text from the owner's request, not from this doc
    "placeholder": true,
    "note": "Owner decision 2026-11-20: swappable placeholder, public repo and site included. Swap when permission is refused or when the owner says so."
  },
  "fallback": { "lines": ["Quellwasser", "Probe"] }   // invented replacement (see 4.3); never the word "Karlsberg"
}
```

### 4.2 Pitch and fiction

Small bottles hide at the places people love: the spring, the viewpoints, the Orangerie, the Rund. They
are hard to find, carry no marker and are never guarded. Fiction (FIKTION card cx.47 „Treibgut“, no
brand in it): since you touched the spring, small bottles wash up at places "where someone liked to
be", **in every year, including years they don't belong to**. Laub, in 1789: „Das gehört nicht in dieses
Jahr.“ Today it's also a good deed. The pickup card says: „Ein Fläschchen im Laub. Mitnehmen: Der Wald
ist kein Keller.“ UI name everywhere: **„Fläschchen“**.

### 4.3 Label and object options (the replacement path)

| Option | Look | Note |
|---|---|---|
| **P (now)** | small brown glass bottle, plain cream paper label with the real beer label as text | the owner's placeholder (§4.1) |
| F1 | the same bottle, invented label „Quellwasser · Probe Nr. 07“ (Marlene's water samples) | the default replacement; zero design change |
| F2 | green apothecary phial with a blue wax seal bearing the Bussole's compass rose | ties to the spring and Laub |
| F3 | salt-glazed stoneware jug, 18th-century shape, no lettering | grounded: the site had a brewery and a beer house (M1910 Einl. S. XXXIII); but alcohol-themed |
| F4 | wax seal impressions („Siegel 1789“) | no bottle |
| F5 | chandelier prisms („Lüsterprismen“), after the travel letter's „Kronleuchter“ (Knigge (Hg.) 1793) | links to cx.43; not a bottle |

Never use the word "Karlsberg" on any label, because it would read as the brand.

### 4.4 Placement rules

1. **Only at named places:** each bottle hangs on an anchor that is
   - a real POI (`public/data/pois.json` r03-xx),
   - a survey point (`src/systems/travel/points.ts`),
   - a scenery set (`src/systems/scenery/sets.ts`, `worldsets.ts`, `quelle.ts`), or
   - the spring.

   It sits within 40 m of its anchor. Never on a generated route POI (`pois.ts`), which is something else.
2. **Hard to find:**
   - Occluded from the main path: behind, under, in a niche, in water, or up a tree.
   - It needs a verb: crouch to see under, walk round, Wuchthieb to shake or break, the lantern at night, a relief mode.
   - No map mark, no Bussole marker. **Excluded from the Spürsinn talent** (`feldbuch.spuersinn` shows "collectibles"; bottles opt out).
   - Hints: a soft glass „Klirren“ within 6 m every 8–12 s, captioned with a direction („[Glas klirrt leise, links]“). A glint only when the camera faces it within 15° and ≤ 12 m, and the spot is lit (day or the lantern).
3. **Keep clear:**
   - ≥ 6 m from any clue, NPC talk circle or quest pickup.
   - Never inside a memorial (the Rondell; the Festsaal in 1793-07; the Zwinger at the finale), the fire rooms, the bomb crater (rm.06), or a boss arena while it is active.
4. **Per era:** a fixed spread (below). The spring holds **one in every year** as the motif.
5. **Pickup:** E „aufheben“ (1.5 m, facing). In a court zone (idea 2) picking up in a watcher's view is the "taking in view" tell.

### 4.5 The 24 bottles

All spots are **(prüfen)** except the spring offsets, which come from `src/systems/quelle/layout.ts` `toWorld()`.

| Id | Era | Anchor | Spot | Approx. x/z | Verb |
|---|---|---|---|---|---|
| `fl.heute.quelle` | today | Karlsbergquelle | behind the spring house, in the ivy above its grate | 1066.4/−837.6 | walk round uphill |
| `fl.heute.eiskeller` | today | Eiskeller r03-05 | under the root plate of a fallen beech on the ring wall's north side | 1508/−1284 | crouch |
| `fl.heute.gipfel` | today | Gipfelplateau r03-07 | in a hollow trunk on the summit | 1557/−628 | walk round (glint from one side) |
| `fl.heute.grenzstein` | today | Grenzstein r03-16b | in the grass behind the stone, away from the path | 995/−1202 | look behind (don't touch the stone) |
| `fl.heute.westblick` | today | survey point `westblick` | at the forest edge facing the Hohenburg, under a sandstone block | 210/−895 | crouch |
| `fl.heute.tschifflik` | today | Tschifflik ruin r03-12 | in a gap of the ruin wall | 1612/240 | relief 3 shows the wall line |
| `fl.1789.quelle` | 1789 | Brunnenstube | in the niche above the bronze spout | 1061.0/−834.2 | look up from the steps |
| `fl.1789.orangerie` | 1789 | Orangerie KB-B10 | behind the third orange tub on the terrace | 1230/−972 | court zone: take it unseen |
| `fl.1789.gitter` | 1789 | `ehrenhof-gitter` | on the window ledge of the Wachhaus Süd (KB-B37) | 1176/−1101 | take it when the Gardist looks away |
| `fl.1789.bauplatz` | 1789 | `k1-bauplatz` | between the ashlar blocks of the stack | 1278/−1222 | walk round |
| `fl.1789.rund` | 1789 | `k1-rund` KL-B40 | on the back ledge of a cage house | 1950/120 | walk round the outside |
| `fl.1789.allee` | 1789 | `apfelallee` | in the fork of an apple tree, upper rows | 1380/−820 | Wuchthieb shakes it down |
| `fl.179302.quelle` | 1793-02 | Karlsbergquelle (winter) | frozen into the icicles under the spout | 1060.8/−834.0 | Wuchthieb breaks the ice |
| `fl.179302.torhaus` | 1793-02 | `parkzaun` | under the barrier's counterweight box | 1640/−405 | lantern (night) |
| `fl.179302.allee` | 1793-02 | `apfelallee` | under a snow-laden branch | 1520/−560 | Wuchthieb on the trunk drops the snow |
| `fl.179302.wachhaus` | 1793-02 | Wachhaus Nord KB-B38 | behind the woodpile by the fire pan | 1165/−1118 | walk round |
| `fl.179307.gaertnerei` | 1793-07 | Gärtnerei gate | in the gardener's rain barrel | 1276/−1298 | look in (lantern) |
| `fl.179307.zwinger` | 1793-07 | `zwinger` | in the hinge niche of an opened cage door | 1240/−1560 | crouch |
| `fl.179307.quelle` | 1793-07 | Karlsbergquelle (fire) | on the basin's rim, seen only in the reflected firelight | 1060.2/−833.4 | lantern **off** |
| `fl.1796.baumagazin` | 1796 | `k4-baumagazin` | in a gap of the stone stockpile | 470/−860 | relief 3 reads the cavity |
| `fl.1796.taleingang` | 1796 | `k4-taleingang` | in the toolbox of the abandoned cart | 465/−890 | E opens the box |
| `fl.1796.steinplatz` | 1796 | `k4-ehrenhof` | in the hollow on the north side of the highest heap | 1235/−1100 | crouch |
| `fl.1796.westblick` | 1796 | survey point `westblick` | in the hedge at the forest edge | 218/−905 | walk along the edge |
| `fl.1796.quelle` | 1796 | Karlsbergquelle (ruin) | in the empty spout hole where the bronze was torn out | 1060.8/−834.0 | look close |

Counts: today 6 · 1789 6 · 1793-02 4 · 1793-07 3 · 1796 5 = **24**. The spring spots sit 0.3–3 m from
the trough: the spring's E prompt only exists while `quelle.call` is set (p3q, k1_0), and no bottle at
the spring is active in those beats (today's is 7 m away).

### 4.6 Counter and reward

| Where | What |
|---|---|
| on pickup | toast „Fläschchen 7/24“ and a soft clink |
| Journal → „Sammlungen“ | row „Fläschchen 7/24 · heute 3/6 · 1789 2/6 · …“ (era counts only, no places) |
| field station, Regal (hub overlay) | each found bottle stands on the shelf (2D render of the one label texture) |
| 8 found | Marlene: „Du sammelst Flaschen im Wald? Gut. Einer muss es ja machen.“ |
| 16 found | Laub's theory line (the spring "remembers where people were glad") |
| **all 24** | cosmetic lantern glass „Flaschengrün“, Messstab tape stripe; card cx.47 „Treibgut“ (FIKTION); 15 XP per bottle (360 in total). **No talent point**: branded placeholder content never gates power |

### 4.7 How it differs from the route POIs and caches (`src/systems/travel/`)

| | Route POIs (caches, Fundstücke, Wegsteine) | Fläschchen |
|---|---|---|
| Placement | generated every 120 m along chapter routes (`pois.ts` `ROUTES`), 12–18 m off the path | 24 hand-placed, only at named places (§4.4), occluded |
| Visibility | glowing, a map mark once seen, the Wegweiser | no glow (a glint when you face it), no map, no Bussole, no Spürsinn; a clink within 6 m |
| Guarded | caches: 2–4 spectral things | never |
| Content | consumables + XP; a lore card | the count, the shelf, milestones, cosmetics |
| State | `systems.travel.done` | `systems.flaschen.found` |
| Spacing rule | 28 m from story places (`KEEP_CLEAR`) | ≥ 6 m from clues, NPCs and pickups; never in memorials |

### 4.8 Systems and files

| File | Change |
|---|---|
| `content/collectibles/flaschen.json` (new) | **the single switch** (label) + fallback |
| `src/systems/flaschen/` (new): `spots.ts` (pure, the table above), `label.ts` (one CanvasTexture + one material from the JSON), `model.ts` (a lathe bottle in generic brown glass), `index.ts` (meshes per era within 60 m, glint, clink, E pickup, slice `flaschen`, Journal row, hub shelf, milestones), `strings.ts` | the feature |
| `src/systems/index.ts` | one line after `travel` |
| `src/rpg/stats.ts` / progression | Spürsinn ignores `flaschen` |
| `src/systems/story/hub/overlay.ts` | the shelf |
| `scripts/content-build/codex.mjs` | cx.47 „Treibgut“ (FIKTION, no brand) |
| `tests/flaschen.test.ts` (new) | 24 spots, per-era counts, ≥ 6 m from clue / NPC / pickup places of every story and quest file, not in memorials, inside the terrain, the label text in exactly one collectibles source file (swap = one edit, §4.1) |

### 4.9 Effort, risks, order

- **Effort:** S for the system; M with the placement walk (24 spots on the terrain) and tests.
- **Risks:**
  - Trademark and alcohol branding: the §4.1 box and the swap = one edit test.
  - A modern bottle in 1789 clashes with the tone. The fiction (Treibgut) and the memorial ban cover it.
  - Too hard → frustration. The clink and the per-era count soften it.
  - It reads like the travel caches. It doesn't glow, so it won't.
- **Order:** spots + tests → label + model → pickup + slice → Journal row → shelf → milestones → the placement walk in the play build.

---

## 5. Overall build order

1. **Idea 1, phase 1** (S): the spring opens k1. Independent of everything else; ship first.
2. **Idea 4** (S–M): independent, quick, a visible win.
3. **Idea 2** (MVP M, then L): fills the walk that idea 1 creates. K2 decided (owner, 2026-11-20).
4. **Idea 3** (MVP M, then L): last. Needs the provider-stack change, scheduled when the interiors files are free.

---

## 6. Next steps (paste into NEXT-SESSION)

- [x] **Decided (owner, 2026-11-20):** K2, the invented visitor Hofrat Justus Amsel aus Celle; no letter in Knigge's name (K1 dropped: the 1792 visit is not proven), §2.3.
- [ ] **Idea 1:** move the k1 `checkpoint` to the spring (1058.2/−832.4, yaw 54); rewrite `k1_0` (dawn, `quelle.call`, complete on `quelle:touch`, exit shift 1789); add the `quelle` objective to `q.k1.ankunft`; update `e2e/helpers/k1.ts` with a shared `touchSpring()`; adjust `campaign.spec.ts` / `chapter-k1.spec.ts`. Details in IDEAS-ROUND11 §1.5–1.8.
- [ ] **Idea 4:** build `src/systems/flaschen/` with the single label switch `content/collectibles/flaschen.json` (public placeholder, swap = one edit test). Walk the 24 spots on the terrain. §4.
- [ ] **Idea 2 MVP:** `src/systems/court/` (zones, watchers, suspicion, gate inspection, lossless ejection), generalised `SightCones`, the `COURT_COSTUME`, `q.k1.kleider` + `q.k1.brief`, beats k1_0b / k1_0c, the anchor and oil rules, codex cx.43–cx.46, `e2e/court.spec.ts`. §2.
- [ ] **Idea 3 MVP:** the world provider stack (with the interiors owner), `src/systems/kammern/` with the pocket, chambers #5 Laternenkammer and #1 Streiflicht, solvability tests. §3.
- [ ] Docs when built: ACTION-RPG §4.6, §11.1, §14; PRD §3.4 + changelog; bible 02-kapitel-1, 07-codex, 08-stimmen.
- [x] Research done 2026-11-20: the primary text of the *Briefe* (1793 first edition, BSB scan, S. 26–29) confirms the quote, the permit rule and „Der Herzog war gerade abwesend“; the writer and the date are disputed (cx.43 STRITTIG). The „Umgang“ quote is verified in the 1790 3rd edition (Teil 3, Kap. 3, S. 53 f.).
- [ ] Research still open: the „Sey ernsthaft …“ sentence in the **1788** first edition (DTA `knigge_umgang02_1788`, search "bescheiden, höflich"; nicht verifiziert); the 1806 edition's page and wording (HathiTrust, nicht verifiziert); the SULB reprint *Die Franzosen in Saarbrücken … 1792–94* (1890) that reportedly dates Knigge's Saarbrücken visit 1783–1787 (nicht verifiziert); sources for the four survey-method cards (§3.4).

---

## 7. Sources

| Key | Source | Used for |
|---|---|---|
| M1910 | Mannlich, *Ein deutscher Maler und Hofmann*, ed. Stollreither 1910, https://archive.org/details/eindeutschermale00mann (OCR text searched): Vorwort S. VI; Einl. S. XXXIII–XXXIV; S. 64; S. 322 f.; S. 345–349; S. 355; S. 356–358 | the travel letter (quoted, footnote 13), 100 Gardisten (editor's own text), Jägersburg, the Karlsberg access rule (S. 355), Castrioto (incl. arrest and expulsion), the pass, brewery and beer house |
| KNIGGE-BRIEFE | Knigge (Hg.), *Briefe, auf einer Reise aus Lothringen nach Niedersachsen geschrieben*, Hannover: Christian Ritscher 1793, first edition, BSB copy It.sing. 502 s; scan: MDZ https://www.digitale-sammlungen.de/en/view/bsb10467161 (mirror with OCR: https://archive.org/details/10467161bsb). Vierter Brief „Zweybrücken, den 11ten May“, S. 21 ff.; Karlsberg S. 26–29 | the letter, the quote (S. 28 f.), the permit naming every companion (S. 26 f.), „Der Herzog war gerade abwesend“ (S. 27), the unnamed writer from Metz (S. [1]) |
| KNIGGE-UMGANG-1790 | Knigge, *Ueber den Umgang mit Menschen. In drey Theilen*, 3. Aufl., Hannover: Ritscher 1790, Teil 3, Kap. 3, Abschn. 3, S. 53 f.; MDZ https://www.digitale-sammlungen.de/en/view/bsb10041018 (mirror: https://archive.org/details/10041018bsb) | „Sey ernsthaft, bescheiden, höflich, ruhig, wahrhaftig!“ (1788: nicht verifiziert) |
| ADB-KNIGGE | Erich Schmidt, „Knigge, Adolf Freiherr v.“, ADB 16 (1882) S. 288–291, https://de.wikisource.org/wiki/ADB:Knigge,_Adolph_Freiherr | life, the *Briefe* (1793), „Umgang“ (1788), the Saarbrücken court |
| WP-KNIGGE | https://de.wikipedia.org/wiki/Adolph_Freiherr_Knigge | life, „Umgang“ is not an etiquette book |
| SMZW | Stadtmuseum Zweibrücken, „Spektakuläre Dauerleihgabe: Das Tablett ‚Le Château de Carlsberg‘“, https://www.zweibruecken.de/de/kultur-tourismus/kultur-erleben/kulturelle-einrichtungen/stadtmuseum/neuigkeiten/ | reads the letter as Knigge's own visit (for cx.43 `contested_de` only); its claims „als einer von ganz wenigen“ and collections hidden from the court are **dropped** (no source) |
| PG-KNIGGE | Knigge, „Über den Umgang mit Menschen“, Teil 3 Kap. 3, https://projekt-gutenberg.org/authors/adolph-freiherr-knigge/books/ueber-den-umgang-mit-menschen/chapter/23 | modern text of the „Sei ernsthaft …“ quote; cite KNIGGE-UMGANG-1790 instead |
| LITSAAR | Literaturland Saar, Homburg, https://www.literaturland-saar.de/orte/homburg/ | „Feen-Schloß (Adolph Freiherr von Knigge 1792)“ (follows the usual attribution) |
| LITSAAR-KNIGGE | Literaturland Saar, „Adolph Freiherr Knigge“, https://www.literaturland-saar.de/personen/adolph-freiherr-knigge/ | the letters „auf 1792 vordatiert“, a side trip from Metz to Saarbrücken „in den 80er Jahren“ (no source given; cx.43 `contested_de`) |
| WP-SK | https://de.wikipedia.org/wiki/Schloss_Karlsberg | checked: nothing on access, guards or etiquette |
| RLS | in the repo (cx.11) | only the duke drove up |
| Repo data | `public/data/pois.json` (r03-xx), `public/data/palace/footprints.json` (KB-B26/36/37/38), `public/data/paths.json` (Karlsbergbach), `src/systems/quelle/layout.ts` | places, coordinates |
