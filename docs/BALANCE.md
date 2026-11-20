# Karlsberg Quest — combat balance by numbers

Living document (started 2026-11-20, docs/NEXT-SESSION.md §3.2). It holds the **fight metrics**
the game records, the **headless human-like bot** that plays every enemy family and every boss
about 50 times through the game's own combat simulation, the latest results, and the balance
changes they suggest. **No balance value has been changed yet**: section 5 lists recommendations
for the lead to decide.

## 1. Tools

| What | Where | How |
| --- | --- | --- |
| Fight metrics in the game | `src/systems/combat/fightlog.ts`, fed by `combat/index.ts` every step with the real camera frustum | `kq.combat.report()` (the last 30 fights plus totals), `kq.combat.reset()` |
| Human-like bot | `tests/combat-human.ts` (uses `FightLog` too) | `pnpm sim:combat` (50 runs per row, ≈ 6 s), `--runs N`, `--only <text>`, `--write` replaces the block in §3 |
| Smoke test | `tests/combat-human.test.ts` (part of `pnpm test`, < 0.1 s) | — |
| Older bots (tank, masher, skilled; pass / fail gates) | `tests/combat-bots.ts`, `tests/combat-balance.test.ts` | `pnpm test` |

### 1.1 What a fight is

A fight starts when an enemy aggroes or the first blow lands, in either direction. It ends when
every enemy engaged in it is undone or gone (`won`), when the player goes down (`lost`), or after
8 s without a combat event (`timeout`, for example a leash reset).

### 1.2 What is measured per fight

`report().fights[i]` (`FightRecord`):

| Field | Meaning |
| --- | --- |
| `outcome`, `seconds`, `timeToKill` | won / lost / timeout / open; length; seconds to the last KO (wins only) |
| `kinds`, `boss` | enemies engaged by kind (`streuner*` = elite); the boss kind |
| `hpStart`, `hpEnd`, `hpMax`, `damageTaken`, `hitsTaken` | the player's side |
| `unfairHits`, `unfair { offscreen, shortWindup, noWindup }` | hits with **no on-screen telegraph**: the attack (attacker, ground ring or bolt) was on screen for less than the 0.25 s reaction time before it landed, or it had no wind-up, or a wind-up shorter than 0.25 s |
| `hitsBy["kind.attack"] { hits, damage, unfair, seen }` | per attack; `seen` = mean seconds on screen before it landed |
| `windups["kind.attack"] { n, min, mean, belowReaction, offscreenStart }` | every wind-up against the reaction time |
| `dodges { attempted, successful, noThreat, perfect }` | a dodge is successful if a blow it was meant for missed (i-frames or distance) within 1.1 s; `noThreat` = rolled with nothing coming |
| `damageDealt`, `feedback { hits, hitStop, flash, knockback, sound, particles, shake, numbers, hitStopMs }` | feedback events per staff hit dealt |

`report().totals` sums the same fields over the kept fights and adds `fights`, `won`, `lost` and
`timeout`.

**Feedback the game really emits on a staff hit** (sim.ts `hitEnemy`, index.ts `onEvent 'hit'`):

- local hit-stop: 60 ms light, 110 ms heavy or kill, 198 ms Gnadenstoß, halved with reduced motion;
- the enemy's white flash (`e.flash`);
- knockback: 0.4 m light, 1.2 m finisher, 2.6 m heavy (bosses ×0.12, the Steinfresser ×0.35);
- family particles (`visuals.hit`);
- the hit sound plus a clank on armour (`audio.hit` / `clank`);
- camera shake (off with reduced motion);
- a floating damage number (setting "Schadenszahlen");
- for an armoured boss blow: a glance spark and the "Abgeprallt" caption.

In the bot runs (every content encounter, 3 runs each, 2213 staff hits):

- flash on 100 % of hits;
- hit-stop on 97 %;
- knockback (> 1 m/s push) on 75 %: none on bosses, little on the Steinfresser.

Nothing in the game marks a hit as missing feedback.

## 2. How faithful the simulation is

**Real game code:**

- The whole fight runs in the game's `CombatSim` (`src/systems/combat/sim.ts`): enemy AI and states, attack tokens and the rhythm gap, surround slots, kiting, hit-and-run, packs, elites and their extra moves, escorts, second waves, era hazards, Rufer calls, Nebelweber veils, Foliant guards, Scherbling mirrors, bosses with reveal, phases, roars, adds, seal, armour and the Pikeur's balk at water, projectiles and lobbed blocks with their landing rings, and the burst cap.
- The player's side: Hieb combo, Wuchthieb charge, the roll with its i-frames and perfect window, stamina and exhaustion, the Bannlicht cone and charges, the three abilities by level, the drink lock, hit-stop and slow motion.
- The player's numbers come from the real `deriveStats` at the build each chapter expects (`tests/combat-bots.ts` `CHAPTERS`: prologue L2, K1 L4, K2 L6, K3 L8, K4 L10, with staff and talents).
- The encounters come from the real content (`tests/combat-encounters.ts`, the quest and story spawns with their tiers, escorts and waves). The four escort-only kinds are fought as a drill of two.
- The measurements come from the same `FightLog` class the game uses.

**Approximations:**

- **Ground.** The ground is flat and open: no walls, trees, reeds, slopes or water, except a 2 m strip of water for the Pikeur's dam at x = 7.
- **Movement.** The player's feet walk at 3.2 m/s and run at 6.2 m/s. The roll and knock-back pushes are integrated as in `combat-bots.ts`.
- **Camera.** The camera is modelled, not rendered: 70° vertical FOV at 16:9, a 3.6 m boom plus the fight pull-back of `camera.ts`, and a 1.1 m shoulder. It has no occlusion, so it never ends up inside reeds or behind a trunk. The game's `kq.combat.report()` uses the real frustum, but that has no occlusion either.
- **The human:**
  - **Seeing.** It sees a wind-up when the attacker, its ring or its bolt is on screen. It notices an off-screen wind-up (sound, edge chevron) only 30 % of the time, and 150 ms later.
  - **Reacting.** It reacts after 250 ms plus Gaussian jitter (σ 60 ms) and times the roll for the middle of the i-frames (σ 70 ms). It misreads or ignores 15 % of the telegraphs it sees.
  - **Aim.** Its aim wanders (σ 12°; the soft aim assist covers 25°), and its preferred distance wanders too (σ 0.35 m).
  - **Moves.** It uses Hieb combos, a Wuchthieb on what the game has shown it is armoured or guarded (and 12 % of the time anyway), the roll (stamina permitting) and the abilities its level knows. It drinks Balsam below 35 %: 1 in the prologue, 2 in other fights, 3 against bosses, at most one per 2 s, with the real 0.6 s drink lock and 45 HP × healing. **The game has no Balsam cooldown**, so this models restraint, not a rule.
  - **Bannlicht.** It flares when the game has told it the staff goes through ("immune"). It also flares by habit when the charges are full and two or more enemies stand in the cone.
  - **Learning.** It learns a boss's way in only from what the game shows: the hint caption after the title card (read 85 % of the time), or the "Vorne prallt alles ab" caption after 4 bounces in a row. Rows marked *title hint missed* skip the first; rows marked *never learns* skip both.
- **Time of day.** It is always night, except at the Schuldbuch (dusk). The time of day changes no fight numbers.
- **Determinism.** The simulation is deterministic. Each run varies the bot's seed and the approach (8–12 m, ±25°).

## 3. Results

<!-- sim:combat:begin -->
Generated by `pnpm sim:combat` — 50 runs per row, human bot (250 ms ± 60 ms reaction, 15 % misread, σ 12° aim), the game's own `CombatSim`. HP left is % of max over all runs (a loss counts 0).

| Encounter | Lvl | Win | HP left mean / median | Time to kill (s, wins) mean / median | Hits taken / fight | Unfair hits / fight | Dodge success | Balsam used | Top damage (share) |
|---|---|---|---|---|---|---|---|---|---|
| Nebelling — prolog Bussole (4 + wave 2) | 2 | 100 % | 62 % / 63 % | 21 / 21 | 6.3 | 0.0 | 87 % (3.4/fight) | 0.0 | nebelling.lunge 100 % |
| Irrlicht — "Lichter am Weiher" (3, lake) | 2 | 100 % | 98 % / 100 % | 7 / 7 | 0.3 | 0.0 | 83 % (2.1/fight) | 0.0 | irrlicht.funke 100 % |
| Irrlicht — "Lichter am Weiher", no habit flare | 2 | 100 % | 96 % / 100 % | 9 / 8 | 0.6 | 0.0 | 89 % (3.3/fight) | 0.0 | irrlicht.funke 100 % |
| Irrlicht — K1 Karlslust (5) | 4 | 100 % | 65 % / 63 % | 26 / 26 | 5.5 | 0.0 | 79 % (7.7/fight) | 0.0 | irrlicht.funke 74 %, irrlicht.funkenfaecher 18 % |
| Irrlicht — K2 Lichter 3 (2 + Nebelweber + wave) | 6 | 100 % | 94 % / 94 % | 9 / 6 | 1.1 | 0.0 | 87 % (1.9/fight) | 0.0 | irrlicht.funke 76 %, nebelling.lunge 13 % |
| Streuner — K1 Zwinger (4 + wave) | 4 | 100 % | 60 % / 59 % | 18 / 17 | 5.7 | 0.2 | 84 % (5.7/fight) | 0.1 | streuner.sprung 62 %, streuner.biss 27 % |
| Mahnbrief — K1 Registratur (6 + Foliant + wave) | 4 | 100 % | 58 % / 58 % | 21 / 22 | 7.2 | 0.0 | 90 % (4.2/fight) | 0.1 | mahnbrief.schnitt 39 %, foliant.zuklappen 28 % |
| Nebelweber — drill (2, K1) | 4 | 100 % | 98 % / 100 % | 6 / 6 | 0.3 | 0.0 | 80 % (2.1/fight) | 0.0 | nebelweber.eisnadel 100 % |
| Foliant — drill (2, K1) | 4 | 100 % | 92 % / 93 % | 9 / 8 | 0.9 | 0.0 | 79 % (2.6/fight) | 0.0 | foliant.zuklappen 69 %, foliant.rammen 31 % |
| Rufer — drill (2, K2) | 6 | 100 % | 100 % / 100 % | 6 / 5 | 0.0 | 0.0 | 92 % (1.0/fight) | 0.0 | – |
| Raffschatten — K3 Nachmittag (4 + wave) | 8 | 98 % | 39 % / 40 % | 34 / 33 | 9.7 | 0.0 | 81 % (6.2/fight) | 1.2 | raffschatten.schlag 75 %, raffschatten.goldwirbel 24 % |
| Glutling — K3 Festsaal (4) | 8 | 100 % | 63 % / 62 % | 18 / 19 | 6.7 | 0.0 | 86 % (4.3/fight) | 0.1 | glutling.zerplatzen 43 %, scherbling.splitter 17 % |
| Scherbling — drill (2, K3) | 8 | 100 % | 96 % / 100 % | 7 / 6 | 0.9 | 0.0 | 82 % (1.9/fight) | 0.0 | scherbling.splitter 50 %, scherbling.scherbenfaecher 27 % |
| Grusling — K4 Zeichen (8) | 10 | 100 % | 81 % / 82 % | 21 / 21 | 4.2 | 0.1 | 86 % (3.5/fight) | 0.0 | nebelweber.frostkugel 31 %, nebelweber.eisnadel 31 % |
| Steinfresser — K4 Karren (3 + wave) | 10 | 86 % | 42 % / 46 % | 32 / 34 | 9.3 | 0.0 | 80 % (6.5/fight) | 1.2 | steinfresser.hieb 44 %, steinfresser.stampfen 41 % |
| BOSS Schuldbuch (K1) | 4 | 100 % | 48 % / 51 % | 54 / 52 | 17.5 | 0.0 | 72 % (9.7/fight) | 1.8 | mahnbrief.schnitt 42 %, schuldbuch.siegel 32 % |
| BOSS Schuldbuch (K1), title hint missed | 4 | 98 % | 46 % / 48 % | 67 / 67 | 19.8 | 0.0 | 72 % (14.2/fight) | 2.4 | mahnbrief.schnitt 38 %, schuldbuch.siegel 34 % |
| BOSS Schuldbuch (K1), never learns | 4 | 6 % | 1 % / 0 % | 88 / 84 | 24.5 | 0.0 | 60 % (14.0/fight) | 3.0 | schuldbuch.seitenschlag 42 %, schuldbuch.siegel 41 % |
| BOSS Pikeur (K2) | 6 | 100 % | 51 % / 52 % | 52 / 51 | 12.9 | 0.0 | 71 % (10.6/fight) | 1.3 | streuner.sprung 41 %, pikeur.peitsche 37 % |
| BOSS Pikeur (K2), title hint missed | 6 | 100 % | 46 % / 45 % | 50 / 50 | 13.7 | 0.1 | 73 % (10.5/fight) | 1.3 | streuner.sprung 44 %, pikeur.peitsche 35 % |
| BOSS Strohmann (K3) | 8 | 100 % | 60 % / 59 % | 54 / 55 | 6.3 | 0.0 | 77 % (9.8/fight) | 0.1 | strohmann.garbe 56 %, glutling.zerplatzen 29 % |
| BOSS Strohmann (K3), title hint missed | 8 | 100 % | 56 % / 54 % | 54 / 52 | 7.3 | 0.0 | 79 % (9.1/fight) | 0.2 | strohmann.garbe 56 %, glutling.zerplatzen 27 % |
| BOSS Strohmann (K3), never learns | 8 | 96 % | 39 % / 44 % | 79 / 80 | 15.6 | 0.0 | 69 % (11.1/fight) | 2.3 | strohmann.garbe 63 %, glutling.zerplatzen 21 % |
| BOSS Steinbrecher (K4) | 10 | 68 % | 21 % / 17 % | 127 / 123 | 35.9 | 0.1 | 82 % (25.5/fight) | 2.8 | steinbrecher.beben 49 %, grusling.kratzen 30 % |
| BOSS Steinbrecher (K4), title hint missed | 10 | 64 % | 19 % / 10 % | 134 / 136 | 35.6 | 0.0 | 80 % (25.4/fight) | 2.9 | steinbrecher.beben 49 %, grusling.kratzen 28 % |
| BOSS Steinbrecher (K4), never learns | 10 | 0 % | 0 % / 0 % | – / – | 36.3 | 0.0 | 82 % (21.8/fight) | 3.0 | steinbrecher.beben 44 %, steinbrecher.quaderwurf 36 % |

**Bosses**: how the way in was found and what the armour or seal threw back (per fight, mean).

| Boss | Learnt the way in | Learnt after (s) | Blows bounced ("Abgeprallt") | Blows into the reveal / phase roar ("Der Stab geht hindurch – erst das Bannlicht") |
|---|---|---|---|---|
| BOSS Schuldbuch (K1) | 100 % | 3 | 4.3 | 6.5 |
| BOSS Schuldbuch (K1), title hint missed | 100 % | 7 | 8.5 | 6.5 |
| BOSS Schuldbuch (K1), never learns | 0 % | – | 33.9 | 6.3 |
| BOSS Pikeur (K2) | 88 % | 3 | 0.0 | 6.6 |
| BOSS Pikeur (K2), title hint missed | 0 % | – | 0.0 | 6.6 |
| BOSS Strohmann (K3) | 100 % | 3 | 20.8 | 6.5 |
| BOSS Strohmann (K3), title hint missed | 100 % | 8 | 22.7 | 6.4 |
| BOSS Strohmann (K3), never learns | 0 % | – | 47.2 | 6.6 |
| BOSS Steinbrecher (K4) | 100 % | 3 | 34.7 | 6.2 |
| BOSS Steinbrecher (K4), title hint missed | 100 % | 7 | 38.2 | 6.3 |
| BOSS Steinbrecher (K4), never learns | 0 % | – | 63.3 | 6.1 |

**Attacks** (the default rows only): wind-up (s) against the 0.25 s reaction time, how often it began off screen, the hits it landed, how many of them were unfair and how long the attack was on screen before it hit (mean). *Margin* = wind-up − 0.25 s reaction − 0.08 s until the roll’s i-frames start: the time a human has left to decide.

| Attack | Wind-up min / mean | Margin (s) | Wind-ups | Began off screen | Hits | Unfair | Seen before hit (s) |
|---|---|---|---|---|---|---|---|
| foliant.rammen | 0.95 / 0.95 | 0.62 | 167 | 2 % | 79 | 0 (0 %) | 1.14 |
| foliant.zuklappen | 0.85 / 0.85 | 0.52 | 226 | 0 % | 97 | 0 (0 %) | 0.93 |
| glutling.funkenspei | 0.70 / 0.70 | 0.37 | 54 | 7 % | 14 | 0 (0 %) | 0.89 |
| glutling.zerplatzen | 0.60 / 0.60 | 0.27 | 638 | 0 % | 242 | 0 (0 %) | 0.64 |
| grusling.grusstoss | 0.80 / 0.80 | 0.47 | 13 | 0 % | 3 | 0 (0 %) | 0.92 |
| grusling.kratzen | 0.45 / 0.45 | 0.12 | 2708 | 0 % | 1369 | 0 (0 %) | 0.51 |
| hazard.fire | – | – | 0 | – | 18 | 0 (0 %) | 1.00 |
| hazard.stone | – | – | 0 | – | 11 | 0 (0 %) | 1.00 |
| irrlicht.funke | 0.80 / 0.80 | 0.47 | 842 | 37 % | 267 | 0 (0 %) | 1.10 |
| irrlicht.funkenfaecher | 1.00 / 1.00 | 0.67 | 121 | 49 % | 44 | 0 (0 %) | 1.36 |
| mahnbrief.schnitt | 0.55 / 0.55 | 0.22 | 1483 | 0 % | 758 | 0 (0 %) | 0.71 |
| mahnbrief.siegelwurf | 0.80 / 0.80 | 0.47 | 96 | 19 % | 35 | 0 (0 %) | 0.99 |
| nebelling.lunge | 0.75 / 0.75 | 0.42 | 659 | 0 % | 344 | 0 (0 %) | 0.93 |
| nebelweber.eisnadel | 0.60 / 0.60 | 0.27 | 231 | 22 % | 83 | 3 (4 %) | 0.79 |
| nebelweber.frostkugel | 0.95 / 0.95 | 0.62 | 167 | 23 % | 38 | 0 (0 %) | 1.76 |
| pikeur.anreiten | 1.00 / 1.00 | 0.67 | 102 | 2 % | 28 | 0 (0 %) | 1.51 |
| pikeur.peitsche | 0.70 / 0.70 | 0.37 | 513 | 0 % | 224 | 0 (0 %) | 0.78 |
| raffschatten.goldwirbel | 1.00 / 1.00 | 0.67 | 169 | 0 % | 85 | 0 (0 %) | 1.11 |
| raffschatten.schlag | 0.80 / 0.80 | 0.47 | 854 | 0 % | 422 | 0 (0 %) | 0.88 |
| rufer.stoss | 0.60 / 0.60 | 0.27 | 101 | 0 % | 18 | 0 (0 %) | 0.65 |
| scherbling.reflect | – | – | 0 | – | 52 | 0 (0 %) | 1.00 |
| scherbling.scherbenfaecher | 0.90 / 0.90 | 0.57 | 179 | 2 % | 72 | 0 (0 %) | 1.15 |
| scherbling.splitter | 0.80 / 0.80 | 0.47 | 202 | 0 % | 75 | 0 (0 %) | 0.88 |
| schuldbuch.seitenschlag | 1.00 / 1.00 | 0.67 | 296 | 0 % | 131 | 0 (0 %) | 1.16 |
| schuldbuch.siegel | 0.90 / 0.90 | 0.57 | 223 | 6 % | 184 | 0 (0 %) | 1.28 |
| steinbrecher.beben | 1.30 / 1.30 | 0.97 | 810 | 1 % | 387 | 0 (0 %) | 1.41 |
| steinbrecher.quaderwurf | 1.10 / 1.10 | 0.77 | 805 | 6 % | 214 | 4 (2 %) | 2.36 |
| steinfresser.brocken | 1.00 / 1.00 | 0.67 | 113 | 13 % | 41 | 0 (0 %) | 2.05 |
| steinfresser.hieb | 0.90 / 0.90 | 0.57 | 312 | 0 % | 179 | 0 (0 %) | 0.99 |
| steinfresser.stampfen | 1.10 / 1.10 | 0.77 | 319 | 0 % | 151 | 0 (0 %) | 1.17 |
| streuner.biss | 0.40 / 0.40 | 0.07 | 423 | 0 % | 259 | 0 (0 %) | 0.46 |
| streuner.hetzjagd | 0.90 / 0.90 | 0.57 | 54 | 11 % | 18 | 1 (6 %) | 1.21 |
| streuner.sprung | 0.60 / 0.60 | 0.27 | 754 | 3 % | 404 | 7 (2 %) | 0.78 |
| strohmann.funkenregen | 1.20 / 1.20 | 0.87 | 214 | 0 % | 58 | 0 (0 %) | 1.30 |
| strohmann.garbe | 1.00 / 1.00 | 0.67 | 488 | 0 % | 140 | 0 (0 %) | 1.12 |
<!-- sim:combat:end -->

## 4. Reading

### 4.1 Unfair hits (wind-up < 0.25 s, off screen)

- **No wind-up is shorter than the reaction time.** Every attack has a wind-up of at least 0.4 s (`telegraphTime` floor). Across all default rows about one hit in 500 is unfair. The unfair ones are a Streuner's *Sprung* or *Hetzjagd* from the flank, a Nebelweber's *Eisnadel* and a stray Quaderwurf.
- **The tight attacks are the fast melee ones.** The *Margin* column shows them:
  - Streuner *Biss*: 0.40 s wind-up, 0.07 s margin;
  - Grusling *Kratzen*: 0.45 s, 0.12 s;
  - Mahnbrief *Schnitt*: 0.55 s, 0.22 s.

  They are fair on paper but leave a human almost no time to decide. They also take most of the bot's hits in their fights: the Zwinger, the Gruslinge and the Registratur.
- **The kiters start a third to a half of their wind-ups off screen.** The kiters are the Irrlicht (*Funke*: 37 % began off screen, *Funkenfächer* 49 %) and the Nebelweber (22–23 %). Their bolts come into view in time, because the fight pull-back keeps them in the picture: on flat ground the bolt is seen 1.1–1.4 s before it lands.

### 4.2 Too hard

- **Der Steinbrecher (K4, L10) is the outlier.**
  - **With the way in known:** win 68 %, about 21 % HP left, about 127 s per fight, about 36 hits taken. *Beben* deals about half of the damage and the Gruslinge adds about 30 %.
  - **At the `?kapitel=4` level (L9):** 58 %.
  - **Without the way in:** 0 %. Even a Wuchthieb does ×0.35 from the front.
- **Das Schuldbuch without its hint is unwinnable: 6 %.** The seal takes ×0.3 / ×0.5 until the Bannlicht breaks it. With the title caption it is fine (100 %, 48 % HP). With only the bounce caption it is also fine (98 %, learnt after about 7 s and 8.5 bounces).
- **Raffschatten (K3) and Steinfresser (K4) packs are hard but winnable.** The Raffschatten pack is won 98 % of the time with 39 % HP left; the Steinfresser pack 86 % with 42 %. The Steinfresser loss rate (14 %) is high for a regular quest fight.

### 4.3 Too easy

- **The escort kinds on their own are trivial.** A Nebelweber, Foliant, Rufer or Scherbling fought alone leaves 92–100 % HP after 6–9 s. That is fine for escorts, which is all content uses them as.
- **The Irrlicht fights are easy on open ground.**
  - "Lichter am Weiher" (L2): win 100 % in about 7 s with 98 % HP left. Without the habit flare it is still 96 %.
  - K2 "Lichter 3": 94 % HP left.
  - The flare widened in round 9 (+3 m, +40°) presses all three lights down at once. The burst cap holds: 0.3–0.6 hits per fight.
- **The Strohmann (K3) is easy even blind.** 96 % without ever learning the back. The front Wuchthieb does ×0.8.

### 4.4 The round-9 complaints

**"Irrlichter at the lake hit hard and invisibly".** The flat-ground sim does not reproduce it: no unfair hits, almost no damage. Timing and geometry are fair.

What the sim leaves out is what makes the lake different:

- the lights hover over the water up to 1.2 m from the shore;
- the reeds;
- the camera dipping into the reeds (a known weak spot);
- dusk.

A light behind a reed bank, or a camera inside one, hides the wind-up and the bolt. The frustum test cannot see that either. The "hard" part was the pre-cap burst: 70 of 124 HP in under a second, which the burst cap now prevents (the sim never sees more than 30 % in 1.2 s).

Next steps:

- play the lake with `kq.combat.report()` running and look at `unfair.offscreen` and `hitsBy['irrlicht.funke'].seen`;
- fix the reed camera before touching the Irrlicht numbers.

**"Bosses (Schuldbuch, Pikeur) bounce frontal hits with no early hint to circle behind".** In the code neither boss is about circling:

- **The Schuldbuch.** It bounces every blow from every side until the Bannlicht opens the seal. The hint after the title card says exactly that ("Der Weg hinein: Das Bannlicht bricht das Siegel."). But the bounce caption after 4 bounces reads **"Vorne prallt alles ab. …"**, which tells the player the problem is the *front*. That is wrong for the Schuldbuch and sends players circling.
- **The Pikeur.** He has **no armour at all** (`bossHitMul` → ×1, never `armored`), so he never shows "Abgeprallt". What players see as bouncing is the reveal and phase roar: during `intro` (2.6 s) and `roar` every blow emits `immune`, which shows a glance spark, the immune sound and the caption **"Der Stab geht hindurch – erst das Bannlicht (G)."**
  - The bot lands about **6.5 blows per boss fight** into those windows, on every boss.
  - On the Pikeur that caption is simply wrong: the Bannlicht does not open him, it only stuns him for ×1.5.
  - His real way in, the water, barely matters on its own: the bot wins 100 % with or without it.

## 5. Recommendations (not applied; the lead decides)

The numbers are from `pnpm sim:combat` what-ifs: the definitions were patched in memory, 50 runs each.

1. **Steinbrecher HP 1150 → 950** (`src/rpg/enemies.ts`).
   - What-if: win 68 → 94 %, HP left 21 → 37 %, time to kill 127 → 116 s.
   - The alternative, *Beben* damage 20 → 15, gives win 88 % but a longer fight (140 s). The HP cut is the better lever.
2. **A boss "roar" is not "immune".**
   - During a boss's `intro` and `roar`, emit a distinct event (for example `bossGuard`) with its own caption ("Er sammelt sich – warte.") and a softer sound, instead of `immune`, which says "erst das Bannlicht".
   - It fires about 6.5 times per boss fight and is the likeliest source of "the Pikeur bounces my hits".
   - No number changes; index.ts and sim.ts only.
3. **Per-boss bounce caption, and sooner.**
   - Replace "Vorne prallt alles ab. {hint}" with a per-boss line. For the Schuldbuch: "Das Siegel hält jeden Schlag ab. {hint}". Keep the front wording for the Strohmann and the Steinbrecher.
   - Lower the bounce count from **4 → 2**. A player who missed the title caption then learns the Schuldbuch about 3 s sooner. Without either hint the Schuldbuch is unwinnable (6 %).
   - Optionally give the seal a pulsing glow while closed, as an early visual hint.
4. **Raise the telegraph floor 0.40 → 0.50 s** (`telegraphTime`), or at least Streuner *Biss* 0.40 → 0.50 s and Grusling *Kratzen* 0.45 → 0.55 s.
   - The bot's numbers barely move (Zwinger 60 → 61 % HP; Gruslinge 81 → 78 %, within noise), so the fights stay as hard.
   - What changes is the margin: 0.07 → 0.17 s and 0.12 → 0.22 s. That margin is the difference between "I saw it and could not react" and "I misread it".
5. **Steinfresser *Stampfen* damage 18 → 15**, and optionally **Raffschatten *Schlag* 13 → 11**.
   - The Steinfresser pack loses 14 % of human runs: with the change, win 86 → 90 %, HP left 42 → 44 %.
   - The Raffschatten pack ends at 39 % HP: with the change, win 98 → 100 %, HP left 39 → 46 %.
   - Both are regular quest fights, not bosses.

**Not recommended yet:**

- **The Irrlichter.** On open ground they are easy. Fix the lake camera and reeds first, then re-measure in game with `kq.combat.report()`.
- **The Pikeur's numbers.** He is fine at 100 % win and 51 % HP left. Only the roar caption (item 2) needs a change.
