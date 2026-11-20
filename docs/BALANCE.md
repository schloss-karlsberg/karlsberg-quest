# Karlsberg Quest — combat balance by numbers

Living document (started 2026-11-20, docs/NEXT-SESSION.md §3.2). It holds the **fight metrics**
the game records, the **headless human-like bot** that plays every enemy family and every boss
about 50 times through the game's own combat simulation, the latest results, and the balance
changes they suggested. The lead applied all five recommendations on 2026-11-20 (balance round,
§5); §3 shows the results after it, §5 the before / after.

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
- **Movement.** The player's feet walk at 3.2 m/s and run at 6.2 m/s. The roll and knock-back pushes are integrated as in `combat-bots.ts`. The Laufschritt (travel, ×1.45 on the sprint, from 1.0 s of held Shift since playtest round 10, 1.8 s before) is off in every fight, chase and pack, so the sim leaves it out.
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

## 3. Results (after the 2026-11-20 balance round)

<!-- sim:combat:begin -->
Generated by `pnpm sim:combat` — 50 runs per row, human bot (250 ms ± 60 ms reaction, 15 % misread, σ 12° aim), the game's own `CombatSim`. HP left is % of max over all runs (a loss counts 0).

| Encounter | Lvl | Win | HP left mean / median | Time to kill (s, wins) mean / median | Hits taken / fight | Unfair hits / fight | Dodge success | Balsam used | Top damage (share) |
|---|---|---|---|---|---|---|---|---|---|
| Nebelling — prolog Bussole (4 + wave 2) | 2 | 100 % | 62 % / 63 % | 21 / 21 | 6.3 | 0.0 | 87 % (3.4/fight) | 0.0 | nebelling.lunge 100 % |
| Irrlicht — "Lichter am Weiher" (3, lake) | 2 | 100 % | 98 % / 100 % | 7 / 7 | 0.3 | 0.0 | 83 % (2.1/fight) | 0.0 | irrlicht.funke 100 % |
| Irrlicht — "Lichter am Weiher", no habit flare | 2 | 100 % | 96 % / 100 % | 9 / 8 | 0.6 | 0.0 | 89 % (3.3/fight) | 0.0 | irrlicht.funke 100 % |
| Irrlicht — K1 Karlslust (5) | 4 | 100 % | 65 % / 63 % | 26 / 26 | 5.5 | 0.0 | 79 % (7.7/fight) | 0.0 | irrlicht.funke 74 %, irrlicht.funkenfaecher 18 % |
| Irrlicht — K2 Lichter 3 (2 + Nebelweber + wave) | 6 | 100 % | 94 % / 94 % | 9 / 6 | 1.1 | 0.0 | 87 % (1.9/fight) | 0.0 | irrlicht.funke 76 %, nebelling.lunge 13 % |
| Streuner — K1 Zwinger (4 + wave) | 4 | 100 % | 61 % / 61 % | 17 / 16 | 5.4 | 0.2 | 88 % (5.4/fight) | 0.1 | streuner.sprung 62 %, streuner.biss 28 % |
| Mahnbrief — K1 Registratur (6 + Foliant + wave) | 4 | 100 % | 58 % / 58 % | 21 / 22 | 7.2 | 0.0 | 90 % (4.2/fight) | 0.1 | mahnbrief.schnitt 39 %, foliant.zuklappen 28 % |
| Nebelweber — drill (2, K1) | 4 | 100 % | 98 % / 100 % | 6 / 6 | 0.3 | 0.0 | 80 % (2.1/fight) | 0.0 | nebelweber.eisnadel 100 % |
| Foliant — drill (2, K1) | 4 | 100 % | 92 % / 93 % | 9 / 8 | 0.9 | 0.0 | 79 % (2.6/fight) | 0.0 | foliant.zuklappen 69 %, foliant.rammen 31 % |
| Rufer — drill (2, K2) | 6 | 100 % | 100 % / 100 % | 6 / 5 | 0.0 | 0.0 | 92 % (1.0/fight) | 0.0 | – |
| Raffschatten — K3 Nachmittag (4 + wave) | 8 | 100 % | 46 % / 46 % | 34 / 34 | 9.7 | 0.0 | 79 % (6.2/fight) | 1.0 | raffschatten.schlag 71 %, raffschatten.goldwirbel 27 % |
| Glutling — K3 Festsaal (4) | 8 | 100 % | 63 % / 62 % | 18 / 19 | 6.7 | 0.0 | 86 % (4.3/fight) | 0.1 | glutling.zerplatzen 44 %, scherbling.splitter 18 % |
| Scherbling — drill (2, K3) | 8 | 100 % | 96 % / 100 % | 7 / 6 | 0.9 | 0.0 | 82 % (1.9/fight) | 0.0 | scherbling.splitter 50 %, scherbling.scherbenfaecher 27 % |
| Grusling — K4 Zeichen (8) | 10 | 100 % | 78 % / 80 % | 22 / 21 | 4.6 | 0.1 | 91 % (3.7/fight) | 0.0 | nebelweber.frostkugel 36 %, nebelweber.eisnadel 31 % |
| Steinfresser — K4 Karren (3 + wave) | 10 | 86 % | 43 % / 46 % | 33 / 34 | 9.6 | 0.0 | 79 % (6.8/fight) | 1.1 | steinfresser.hieb 46 %, steinfresser.stampfen 36 % |
| BOSS Schuldbuch (K1) | 4 | 100 % | 48 % / 50 % | 54 / 52 | 17.7 | 0.0 | 72 % (9.7/fight) | 1.8 | mahnbrief.schnitt 43 %, schuldbuch.siegel 31 % |
| BOSS Schuldbuch (K1), title hint missed | 4 | 100 % | 48 % / 48 % | 61 / 62 | 18.4 | 0.1 | 71 % (12.2/fight) | 2.1 | mahnbrief.schnitt 39 %, schuldbuch.siegel 31 % |
| BOSS Schuldbuch (K1), never learns | 4 | 6 % | 1 % / 0 % | 88 / 84 | 24.5 | 0.0 | 60 % (14.0/fight) | 3.0 | schuldbuch.seitenschlag 42 %, schuldbuch.siegel 41 % |
| BOSS Pikeur (K2) | 6 | 98 % | 46 % / 48 % | 51 / 50 | 12.5 | 0.0 | 73 % (10.8/fight) | 1.1 | streuner.sprung 45 %, pikeur.peitsche 35 % |
| BOSS Pikeur (K2), title hint missed | 6 | 100 % | 48 % / 51 % | 51 / 52 | 14.1 | 0.0 | 71 % (10.9/fight) | 1.5 | streuner.sprung 44 %, pikeur.peitsche 36 % |
| BOSS Strohmann (K3) | 8 | 100 % | 61 % / 64 % | 53 / 54 | 6.2 | 0.0 | 77 % (9.7/fight) | 0.1 | strohmann.garbe 55 %, glutling.zerplatzen 30 % |
| BOSS Strohmann (K3), title hint missed | 8 | 100 % | 58 % / 56 % | 54 / 56 | 7.1 | 0.0 | 82 % (9.4/fight) | 0.2 | strohmann.garbe 50 %, glutling.zerplatzen 34 % |
| BOSS Strohmann (K3), never learns | 8 | 96 % | 39 % / 44 % | 79 / 80 | 15.6 | 0.0 | 69 % (11.1/fight) | 2.3 | strohmann.garbe 63 %, glutling.zerplatzen 21 % |
| BOSS Steinbrecher (K4) | 10 | 88 % | 32 % / 39 % | 120 / 119 | 29.0 | 0.0 | 83 % (24.3/fight) | 2.5 | steinbrecher.beben 49 %, grusling.kratzen 26 % |
| BOSS Steinbrecher (K4), title hint missed | 10 | 82 % | 29 % / 36 % | 122 / 122 | 30.4 | 0.0 | 84 % (25.0/fight) | 2.4 | steinbrecher.beben 47 %, grusling.kratzen 28 % |
| BOSS Steinbrecher (K4), never learns | 10 | 0 % | 0 % / 0 % | – / – | 37.0 | 0.0 | 82 % (21.8/fight) | 3.0 | steinbrecher.beben 43 %, steinbrecher.quaderwurf 36 % |

**Bosses**: how the way in was found and what the armour or seal threw back (per fight, mean).

| Boss | Learnt the way in | Learnt after (s) | Blows bounced ("Abgeprallt") | Blows into the reveal / phase roar (`bossGuard`: „… – warte.“; before 2026-11-20 the „erst das Bannlicht“ line) |
|---|---|---|---|---|
| BOSS Schuldbuch (K1) | 100 % | 3 | 4.2 | 6.5 |
| BOSS Schuldbuch (K1), title hint missed | 100 % | 4 | 6.9 | 6.5 |
| BOSS Schuldbuch (K1), never learns | 0 % | – | 33.9 | 6.3 |
| BOSS Pikeur (K2) | 88 % | 3 | 0.0 | 6.4 |
| BOSS Pikeur (K2), title hint missed | 0 % | – | 0.0 | 6.5 |
| BOSS Strohmann (K3) | 100 % | 3 | 20.2 | 6.5 |
| BOSS Strohmann (K3), title hint missed | 100 % | 5 | 21.6 | 6.5 |
| BOSS Strohmann (K3), never learns | 0 % | – | 47.2 | 6.6 |
| BOSS Steinbrecher (K4) | 100 % | 3 | 32.8 | 6.2 |
| BOSS Steinbrecher (K4), title hint missed | 100 % | 5 | 30.6 | 6.1 |
| BOSS Steinbrecher (K4), never learns | 0 % | – | 57.7 | 6.2 |

**Attacks** (the default rows only): wind-up (s) against the 0.25 s reaction time, how often it began off screen, the hits it landed, how many of them were unfair and how long the attack was on screen before it hit (mean). *Margin* = wind-up − 0.25 s reaction − 0.08 s until the roll’s i-frames start: the time a human has left to decide.

| Attack | Wind-up min / mean | Margin (s) | Wind-ups | Began off screen | Hits | Unfair | Seen before hit (s) |
|---|---|---|---|---|---|---|---|
| foliant.rammen | 0.95 / 0.95 | 0.62 | 167 | 2 % | 79 | 0 (0 %) | 1.14 |
| foliant.zuklappen | 0.85 / 0.85 | 0.52 | 226 | 0 % | 97 | 0 (0 %) | 0.93 |
| glutling.funkenspei | 0.70 / 0.70 | 0.37 | 54 | 7 % | 14 | 0 (0 %) | 0.89 |
| glutling.zerplatzen | 0.60 / 0.60 | 0.27 | 634 | 0 % | 244 | 0 (0 %) | 0.64 |
| grusling.grusstoss | 0.80 / 0.80 | 0.47 | 15 | 0 % | 4 | 0 (0 %) | 0.88 |
| grusling.kratzen | 0.55 / 0.55 | 0.22 | 2652 | 0 % | 1063 | 0 (0 %) | 0.62 |
| hazard.fire | – | – | 0 | – | 18 | 0 (0 %) | 1.00 |
| hazard.stone | – | – | 0 | – | 11 | 0 (0 %) | 1.00 |
| irrlicht.funke | 0.80 / 0.80 | 0.47 | 842 | 37 % | 267 | 0 (0 %) | 1.10 |
| irrlicht.funkenfaecher | 1.00 / 1.00 | 0.67 | 121 | 49 % | 44 | 0 (0 %) | 1.36 |
| mahnbrief.schnitt | 0.55 / 0.55 | 0.22 | 1495 | 0 % | 774 | 0 (0 %) | 0.71 |
| mahnbrief.siegelwurf | 0.80 / 0.80 | 0.47 | 96 | 19 % | 35 | 0 (0 %) | 0.99 |
| nebelling.lunge | 0.75 / 0.75 | 0.42 | 659 | 0 % | 344 | 0 (0 %) | 0.93 |
| nebelweber.eisnadel | 0.60 / 0.60 | 0.27 | 242 | 22 % | 93 | 3 (3 %) | 0.80 |
| nebelweber.frostkugel | 0.95 / 0.95 | 0.62 | 179 | 25 % | 51 | 0 (0 %) | 1.78 |
| pikeur.anreiten | 1.00 / 1.00 | 0.67 | 96 | 0 % | 30 | 0 (0 %) | 1.52 |
| pikeur.peitsche | 0.70 / 0.70 | 0.37 | 511 | 0 % | 207 | 0 (0 %) | 0.78 |
| raffschatten.goldwirbel | 1.00 / 1.00 | 0.67 | 173 | 0 % | 83 | 0 (0 %) | 1.11 |
| raffschatten.schlag | 0.80 / 0.80 | 0.47 | 848 | 0 % | 423 | 0 (0 %) | 0.88 |
| rufer.stoss | 0.60 / 0.60 | 0.27 | 100 | 0 % | 28 | 0 (0 %) | 0.65 |
| scherbling.reflect | – | – | 0 | – | 52 | 0 (0 %) | 1.00 |
| scherbling.scherbenfaecher | 0.90 / 0.90 | 0.57 | 178 | 2 % | 72 | 0 (0 %) | 1.15 |
| scherbling.splitter | 0.80 / 0.80 | 0.47 | 202 | 0 % | 75 | 0 (0 %) | 0.88 |
| schuldbuch.seitenschlag | 1.00 / 1.00 | 0.67 | 295 | 1 % | 130 | 0 (0 %) | 1.15 |
| schuldbuch.siegel | 0.90 / 0.90 | 0.57 | 221 | 7 % | 176 | 0 (0 %) | 1.30 |
| steinbrecher.beben | 1.30 / 1.30 | 0.97 | 757 | 2 % | 340 | 0 (0 %) | 1.39 |
| steinbrecher.quaderwurf | 1.10 / 1.10 | 0.77 | 758 | 6 % | 209 | 1 (0 %) | 2.38 |
| steinfresser.brocken | 1.00 / 1.00 | 0.67 | 124 | 15 % | 50 | 0 (0 %) | 2.10 |
| steinfresser.hieb | 0.90 / 0.90 | 0.57 | 328 | 0 % | 184 | 0 (0 %) | 0.99 |
| steinfresser.stampfen | 1.10 / 1.10 | 0.77 | 324 | 0 % | 153 | 0 (0 %) | 1.17 |
| streuner.biss | 0.50 / 0.50 | 0.17 | 449 | 0 % | 228 | 0 (0 %) | 0.57 |
| streuner.hetzjagd | 0.90 / 0.90 | 0.57 | 49 | 12 % | 16 | 1 (6 %) | 1.15 |
| streuner.sprung | 0.60 / 0.60 | 0.27 | 753 | 3 % | 414 | 12 (3 %) | 0.77 |
| strohmann.funkenregen | 1.20 / 1.20 | 0.87 | 210 | 0 % | 56 | 0 (0 %) | 1.30 |
| strohmann.garbe | 1.00 / 1.00 | 0.67 | 477 | 0 % | 134 | 0 (0 %) | 1.12 |
<!-- sim:combat:end -->

## 4. Reading (after the balance round)

### 4.1 Unfair hits (wind-up < 0.25 s, off screen)

- **No wind-up is shorter than the reaction time.** The floor is now 0.5 s (`TELEGRAPH_MIN`, was 0.4 s). Across all default rows about one hit in 400 is unfair. The unfair ones are flank hits: a Streuner's *Sprung* or *Hetzjagd*, a Nebelweber's *Eisnadel*, a stray Quaderwurf.
- **The tightest attacks now leave a human some time.** Streuner *Biss* (0.50 s) has a 0.17 s margin, and Grusling *Kratzen* (0.55 s) and Mahnbrief *Schnitt* (0.55 s) have 0.22 s. Before the round the margins were 0.07 s and 0.12 s.
- **The kiters still start a third to a half of their wind-ups off screen.** These are the Irrlicht and the Nebelweber. Their bolts come into view 1.1–1.4 s before they land on flat ground.

### 4.2 Hard

- **Der Steinbrecher (K4, L10)** is still the hardest fight, but now winnable.
  - With the way in known: win 88 %, 32 % HP left, about 120 s per fight.
  - Without the way in: still 0 %. This is deliberate: the way in is the fight.
- **Das Schuldbuch** is fine with either caption.
  - With the title caption: win 100 %.
  - With only the bounce caption, now after 2 bounces: win 100 %, learnt after 4 s instead of 7 s.
  - With no hint at all it stays unwinnable (6 %). Now the closed seal throbs as well.
- **The Steinfresser pack (K4)** did not move with *Stampfen* 18 → 15: win still 86 %, 43 % HP left.
  - *Hieb* (16) now deals the larger share of the damage.
  - It is the one regular fight that still loses 14 % of human runs.
  - Next lever if wanted: *Hieb* 16 → 14, or wave 3 → 2 Gruslinge.
- **The Raffschatten pack (K3)** now wins 100 % with 46 % HP left (was 98 % / 39 %).

### 4.3 Too easy (unchanged)

- **The escort kinds on their own** leave 92–100 % HP. That is fine, because content only uses them as escorts.
- **The Irrlicht fights on open ground** leave 94–98 % HP. See §4.4.
- **The Strohmann** is won 96 % of the time even blind.

### 4.4 The round-9 complaints

**"Irrlichter at the lake hit hard and invisibly".** The flat-ground sim does not reproduce it. Timing and geometry are fair, and the burst cap holds: never more than 30 % HP in 1.2 s.

The sim leaves out what makes the lake different:

- the lights over the water, up to 1.2 m from the shore;
- the reeds;
- the camera dipping into the reeds (a known weak spot);
- dusk.

A light behind reeds, or a camera inside them, hides the wind-up and the bolt. The frustum test cannot see occlusion either.

Next steps:

- play the lake with `kq.combat.report()` running and read `unfair.offscreen` and `hitsBy['irrlicht.funke'].seen`;
- fix the reed camera before touching the Irrlicht numbers.

**"Bosses (Schuldbuch, Pikeur) bounce frontal hits with no early hint to circle behind".** Neither boss is about circling.

- **The Schuldbuch.** Its seal holds against every side until the Bannlicht opens it.
- **The Pikeur.** He has no armour. What players took for bouncing were blows into the reveal and phase roar, about 6.5 per boss fight. Those used to show the immune line, "Der Stab geht hindurch – erst das Bannlicht (G)".
- **Fixed in the balance round:**
  - Those blows now emit `bossGuard`, with a soft glance and a per-boss "… – warte." caption.
  - The bounce caption is per boss and comes after 2 bounces. The Schuldbuch's names the seal, and the Pikeur has none.
  - The closed seal throbs.

## 5. The 2026-11-20 balance round (applied)

The lead decided to apply all five recommendations from the first measurement.

| # | Change | Where |
| --- | --- | --- |
| 1 | Steinbrecher HP 1150 → 950 | `src/rpg/enemies.ts` |
| 2 | Blows into a boss's reveal / phase roar emit `bossGuard` (soft glance, `audio.whiff`, per-boss caption `BOSS_GUARD`: „Der Pikeur bäumt sich auf – warte.“ …) instead of `immune` („erst das Bannlicht“) | `sim.ts`, `index.ts`, `strings.ts`, `debug/pilot.ts` (event `bossGuard`) |
| 3 | Per-boss bounce caption after **2** bounces (`BOSS_BOUNCE`, `BOSS_BOUNCE_AFTER`): Schuldbuch „Das Siegel hält jeden Schlag ab – Bannlicht!“, Strohmann „Vorne ist das Stroh zu dicht. Geh ihm in den Rücken, wo die Garben gebunden sind.“, Steinbrecher „Vorne prallt alles ab. Triff die Fugen – von der Seite, von hinten.“, Pikeur none (no armour). The closed seal throbs (`sealClosedPulse`, gentler with reduced flashing) | `index.ts`, `strings.ts`, `visuals.ts` |
| 4 | Telegraph floor 0.4 → **0.5 s** (`TELEGRAPH_MIN`); Streuner *Biss* 0.40 → 0.50, Grusling *Kratzen* 0.45 → 0.55 (no other attack or elite extra was under 0.5) | `rules.ts`, `enemies.ts`, tests |
| 5 | Steinfresser *Stampfen* 18 → 15, Raffschatten *Schlag* 13 → 11 | `enemies.ts` |

**Before / after** (rows that changed; 50 runs each; the human bot now also learns from the bounce caption after 2 bounces):

| Encounter | Win before → after | HP left before → after | Time to kill before → after (s) | Hits taken / fight before → after |
| --- | --- | --- | --- | --- |
| Steinbrecher (K4) | 68 → **88 %** | 21 → **32 %** | 127 → 120 | 35.9 → 29.0 |
| Steinbrecher, title hint missed | 64 → **82 %** | 19 → 29 % | 134 → 122 | 35.6 → 30.4 |
| Schuldbuch, title hint missed | 98 → 100 % | 46 → 48 % | 67 → **61** (learnt after 7 → 4 s) | 19.8 → 18.4 |
| Raffschatten pack (K3) | 98 → **100 %** | 39 → **46 %** | 34 → 34 | 9.7 → 9.7 |
| Steinfresser pack (K4) | 86 → 86 % | 42 → 43 % | 32 → 33 | 9.3 → 9.6 |
| Streuner Zwinger (K1) | 100 → 100 % | 60 → 61 % | 18 → 17 | 5.7 → 5.4 |
| Gruslinge (K4) | 100 → 100 % | 81 → 78 % | 21 → 22 | 4.2 → 4.6 |
| Pikeur (K2) | 100 → 98 % | 51 → 46 % | 52 → 51 | 12.9 → 12.5 |

Wind-up margins changed too:

| Attack | Margin before → after | Hits landed before → after |
| --- | --- | --- |
| Streuner *Biss* | 0.07 → 0.17 s | 259 → 228 |
| Grusling *Kratzen* | 0.12 → 0.22 s | 1369 → 1063 |

**About the noise:** the Pikeur and Gruslinge rows moved by a few points with no change to them. That is the bot noise at 50 runs, about ±5 points.

**Still open:**

- **The Steinfresser pack** (see §4.2).
- **The Irrlichter at the lake**: an in-game measurement first.
- **Occlusion in the frustum test**: a raycast against reeds and trunks would make `unfair.offscreen` honest at the lake.
