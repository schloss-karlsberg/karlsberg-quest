# Karlsberg Quest — combat balance by numbers

Living document (started 2026-11-20, docs/NEXT-SESSION.md §3.2). It holds the **fight metrics**
the game records, the **headless human-like bot** that plays every enemy family and every boss
about 50 times through the game's own combat simulation, the latest results, and the balance
changes they suggested. The lead applied all five recommendations on 2026-11-20 (balance round,
§5); playtest round 10 changed combat rules the same day (§6). §3 shows the current results, §5 and §6 the before / after.

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

## 3. Results (after the 2026-11-20 balance round and the round-10 combat rules, §6)

<!-- sim:combat:begin -->
Generated by `pnpm sim:combat` — 50 runs per row, human bot (250 ms ± 60 ms reaction, 15 % misread, σ 12° aim), the game's own `CombatSim`. HP left is % of max over all runs (a loss counts 0).

| Encounter | Lvl | Win | HP left mean / median | Time to kill (s, wins) mean / median | Hits taken / fight | Unfair hits / fight | Dodge success | Balsam used | Top damage (share) |
|---|---|---|---|---|---|---|---|---|---|
| Nebelling — prolog Bussole (4 + wave 2) | 2 | 100 % | 61 % / 60 % | 24 / 23 | 6.6 | 0.0 | 87 % (4.1/fight) | 0.0 | nebelling.lunge 100 % |
| Irrlicht — "Lichter am Weiher" (3, lake) | 2 | 100 % | 98 % / 100 % | 7 / 7 | 0.3 | 0.0 | 82 % (2.1/fight) | 0.0 | irrlicht.funke 100 % |
| Irrlicht — "Lichter am Weiher", no habit flare | 2 | 100 % | 96 % / 100 % | 9 / 8 | 0.6 | 0.0 | 88 % (3.3/fight) | 0.0 | irrlicht.funke 100 % |
| Irrlicht — K1 Karlslust (5) | 4 | 100 % | 53 % / 51 % | 33 / 33 | 8.7 | 0.0 | 82 % (9.2/fight) | 0.3 | irrlicht.funke 78 %, irrlicht.funkenfaecher 15 % |
| Irrlicht — K2 Lichter 3 (2 + Nebelweber + wave) | 6 | 100 % | 92 % / 94 % | 9 / 6 | 1.3 | 0.0 | 85 % (2.0/fight) | 0.0 | irrlicht.funke 72 %, nebelweber.eisnadel 12 % |
| Streuner — K1 Zwinger (4 + wave) | 4 | 100 % | 67 % / 66 % | 16 / 16 | 4.5 | 0.1 | 88 % (5.6/fight) | 0.0 | streuner.sprung 61 %, streuner.biss 27 % |
| Mahnbrief — K1 Registratur (6 + Foliant + wave) | 4 | 100 % | 59 % / 56 % | 23 / 22 | 7.2 | 0.1 | 84 % (5.1/fight) | 0.1 | mahnbrief.schnitt 36 %, foliant.zuklappen 34 % |
| Nebelweber — drill (2, K1) | 4 | 100 % | 99 % / 100 % | 5 / 5 | 0.2 | 0.0 | 83 % (1.8/fight) | 0.0 | nebelweber.eisnadel 100 % |
| Foliant — drill (2, K1) | 4 | 100 % | 92 % / 96 % | 9 / 9 | 0.9 | 0.0 | 79 % (2.6/fight) | 0.0 | foliant.zuklappen 66 %, foliant.rammen 34 % |
| Rufer — drill (2, K2) | 6 | 100 % | 100 % / 100 % | 5 / 5 | 0.0 | 0.0 | 92 % (1.0/fight) | 0.0 | – |
| Raffschatten — K3 Nachmittag (4 + wave) | 8 | 100 % | 46 % / 46 % | 33 / 33 | 9.7 | 0.0 | 76 % (6.2/fight) | 1.1 | raffschatten.schlag 71 %, raffschatten.goldwirbel 27 % |
| Glutling — K3 Festsaal (4) | 8 | 100 % | 61 % / 59 % | 18 / 17 | 6.9 | 0.0 | 86 % (4.1/fight) | 0.1 | glutling.zerplatzen 50 %, scherbling.splitter 15 % |
| Scherbling — drill (2, K3) | 8 | 100 % | 96 % / 100 % | 7 / 6 | 0.9 | 0.0 | 83 % (1.8/fight) | 0.0 | scherbling.splitter 50 %, scherbling.scherbenfaecher 26 % |
| Grusling — K4 Zeichen (8) | 10 | 100 % | 80 % / 80 % | 23 / 22 | 4.5 | 0.1 | 87 % (3.9/fight) | 0.0 | nebelweber.frostkugel 33 %, nebelweber.eisnadel 33 % |
| Steinfresser — K4 Karren (3 + wave) | 10 | 90 % | 44 % / 46 % | 32 / 31 | 9.5 | 0.0 | 74 % (6.3/fight) | 1.1 | steinfresser.hieb 46 %, steinfresser.stampfen 36 % |
| BOSS Schuldbuch (K1) | 4 | 98 % | 48 % / 51 % | 56 / 54 | 17.6 | 0.0 | 74 % (11.1/fight) | 1.9 | mahnbrief.schnitt 42 %, schuldbuch.siegel 32 % |
| BOSS Schuldbuch (K1), title hint missed | 4 | 98 % | 46 % / 48 % | 65 / 63 | 19.5 | 0.0 | 68 % (14.4/fight) | 2.2 | mahnbrief.schnitt 40 %, schuldbuch.siegel 31 % |
| BOSS Schuldbuch (K1), never learns | 4 | 4 % | 1 % / 0 % | 86 / 86 | 24.3 | 0.0 | 59 % (15.4/fight) | 3.0 | schuldbuch.seitenschlag 42 %, schuldbuch.siegel 41 % |
| BOSS Pikeur (K2) | 6 | 100 % | 48 % / 49 % | 50 / 48 | 12.4 | 0.0 | 70 % (10.7/fight) | 1.1 | streuner.sprung 45 %, pikeur.peitsche 35 % |
| BOSS Pikeur (K2), title hint missed | 6 | 100 % | 49 % / 50 % | 51 / 52 | 13.5 | 0.1 | 70 % (11.6/fight) | 1.4 | streuner.sprung 42 %, pikeur.peitsche 38 % |
| BOSS Strohmann (K3) | 8 | 100 % | 62 % / 63 % | 51 / 51 | 6.0 | 0.0 | 76 % (9.2/fight) | 0.1 | strohmann.garbe 51 %, glutling.zerplatzen 31 % |
| BOSS Strohmann (K3), title hint missed | 8 | 100 % | 58 % / 57 % | 55 / 55 | 7.1 | 0.0 | 78 % (9.7/fight) | 0.2 | strohmann.garbe 49 %, glutling.zerplatzen 35 % |
| BOSS Strohmann (K3), never learns | 8 | 100 % | 46 % / 48 % | 77 / 78 | 14.3 | 0.0 | 69 % (11.7/fight) | 2.1 | strohmann.garbe 61 %, glutling.zerplatzen 20 % |
| BOSS Steinbrecher (K4) | 10 | 92 % | 31 % / 38 % | 117 / 114 | 27.3 | 0.0 | 83 % (23.3/fight) | 2.2 | steinbrecher.beben 52 %, grusling.kratzen 25 % |
| BOSS Steinbrecher (K4), title hint missed | 10 | 82 % | 29 % / 39 % | 120 / 115 | 30.7 | 0.1 | 81 % (26.3/fight) | 2.5 | steinbrecher.beben 49 %, grusling.kratzen 28 % |
| BOSS Steinbrecher (K4), never learns | 10 | 0 % | 0 % / 0 % | – / – | 36.3 | 0.0 | 80 % (23.8/fight) | 3.0 | steinbrecher.beben 46 %, steinbrecher.quaderwurf 33 % |

**Bosses**: how the way in was found and what the armour or seal threw back (per fight, mean).

| Boss | Learnt the way in | Learnt after (s) | Blows bounced ("Abgeprallt") | Blows into the reveal / phase roar (`bossGuard`: „… – warte.“; before 2026-11-20 the „erst das Bannlicht“ line) |
|---|---|---|---|---|
| BOSS Schuldbuch (K1) | 100 % | 3 | 4.4 | 6.5 |
| BOSS Schuldbuch (K1), title hint missed | 100 % | 4 | 7.6 | 6.7 |
| BOSS Schuldbuch (K1), never learns | 0 % | – | 34.4 | 6.5 |
| BOSS Pikeur (K2) | 88 % | 3 | 0.0 | 6.6 |
| BOSS Pikeur (K2), title hint missed | 0 % | – | 0.0 | 6.6 |
| BOSS Strohmann (K3) | 100 % | 3 | 18.5 | 6.6 |
| BOSS Strohmann (K3), title hint missed | 100 % | 5 | 21.7 | 6.6 |
| BOSS Strohmann (K3), never learns | 0 % | – | 43.9 | 6.7 |
| BOSS Steinbrecher (K4) | 100 % | 3 | 31.1 | 6.3 |
| BOSS Steinbrecher (K4), title hint missed | 100 % | 5 | 32.4 | 6.2 |
| BOSS Steinbrecher (K4), never learns | 0 % | – | 59.4 | 6.4 |

**Attacks** (the default rows only): wind-up (s) against the 0.25 s reaction time, how often it began off screen, the hits it landed, how many of them were unfair and how long the attack was on screen before it hit (mean). *Margin* = wind-up − 0.25 s reaction − 0.08 s until the roll’s i-frames start: the time a human has left to decide.

| Attack | Wind-up min / mean | Margin (s) | Wind-ups | Began off screen | Hits | Unfair | Seen before hit (s) |
|---|---|---|---|---|---|---|---|
| foliant.rammen | 0.95 / 0.95 | 0.62 | 169 | 2 % | 69 | 2 (3 %) | 1.11 |
| foliant.zuklappen | 0.85 / 0.85 | 0.52 | 228 | 0 % | 109 | 0 (0 %) | 0.93 |
| glutling.funkenspei | 0.70 / 0.70 | 0.37 | 48 | 4 % | 11 | 0 (0 %) | 0.97 |
| glutling.zerplatzen | 0.60 / 0.60 | 0.27 | 622 | 0 % | 267 | 0 (0 %) | 0.64 |
| grusling.grusstoss | 0.80 / 0.80 | 0.47 | 14 | 0 % | 2 | 0 (0 %) | 0.94 |
| grusling.kratzen | 0.55 / 0.55 | 0.22 | 2480 | 0 % | 1012 | 0 (0 %) | 0.62 |
| hazard.fire | – | – | 0 | – | 18 | 0 (0 %) | 1.00 |
| hazard.stone | – | – | 0 | – | 12 | 0 (0 %) | 1.00 |
| irrlicht.funke | 0.80 / 0.80 | 0.47 | 1096 | 41 % | 413 | 0 (0 %) | 1.08 |
| irrlicht.funkenfaecher | 1.00 / 1.00 | 0.67 | 152 | 44 % | 59 | 0 (0 %) | 1.22 |
| mahnbrief.schnitt | 0.55 / 0.55 | 0.22 | 1554 | 0 % | 748 | 0 (0 %) | 0.71 |
| mahnbrief.siegelwurf | 0.80 / 0.80 | 0.47 | 111 | 21 % | 39 | 1 (3 %) | 0.97 |
| nebelling.lunge | 0.75 / 0.75 | 0.42 | 716 | 0 % | 365 | 0 (0 %) | 0.93 |
| nebelweber.eisnadel | 0.60 / 0.60 | 0.27 | 224 | 24 % | 88 | 4 (5 %) | 0.77 |
| nebelweber.frostkugel | 0.95 / 0.95 | 0.62 | 174 | 27 % | 48 | 0 (0 %) | 1.74 |
| pikeur.anreiten | 1.00 / 1.00 | 0.67 | 91 | 1 % | 26 | 0 (0 %) | 1.51 |
| pikeur.peitsche | 0.70 / 0.70 | 0.37 | 490 | 0 % | 207 | 0 (0 %) | 0.78 |
| raffschatten.goldwirbel | 1.00 / 1.00 | 0.67 | 180 | 0 % | 86 | 0 (0 %) | 1.10 |
| raffschatten.schlag | 0.80 / 0.80 | 0.47 | 811 | 0 % | 420 | 0 (0 %) | 0.89 |
| rufer.stoss | 0.60 / 0.60 | 0.27 | 96 | 0 % | 18 | 0 (0 %) | 0.65 |
| scherbling.reflect | – | – | 0 | – | 52 | 0 (0 %) | 1.00 |
| scherbling.scherbenfaecher | 0.90 / 0.90 | 0.57 | 168 | 5 % | 69 | 0 (0 %) | 1.15 |
| scherbling.splitter | 0.80 / 0.80 | 0.47 | 199 | 0 % | 68 | 0 (0 %) | 0.88 |
| schuldbuch.seitenschlag | 1.00 / 1.00 | 0.67 | 315 | 0 % | 135 | 0 (0 %) | 1.16 |
| schuldbuch.siegel | 0.90 / 0.90 | 0.57 | 231 | 8 % | 184 | 1 (1 %) | 1.32 |
| steinbrecher.beben | 1.30 / 1.30 | 0.97 | 719 | 1 % | 343 | 1 (0 %) | 1.39 |
| steinbrecher.quaderwurf | 1.10 / 1.10 | 0.77 | 716 | 5 % | 191 | 0 (0 %) | 2.40 |
| steinfresser.brocken | 1.00 / 1.00 | 0.67 | 112 | 13 % | 45 | 0 (0 %) | 2.10 |
| steinfresser.hieb | 0.90 / 0.90 | 0.57 | 317 | 0 % | 181 | 0 (0 %) | 0.99 |
| steinfresser.stampfen | 1.10 / 1.10 | 0.77 | 311 | 0 % | 152 | 0 (0 %) | 1.18 |
| streuner.biss | 0.50 / 0.50 | 0.17 | 413 | 0 % | 208 | 0 (0 %) | 0.57 |
| streuner.hetzjagd | 0.90 / 0.90 | 0.57 | 47 | 11 % | 15 | 0 (0 %) | 1.21 |
| streuner.sprung | 0.60 / 0.60 | 0.27 | 731 | 2 % | 386 | 4 (1 %) | 0.79 |
| strohmann.funkenregen | 1.20 / 1.20 | 0.87 | 205 | 0 % | 61 | 0 (0 %) | 1.29 |
| strohmann.garbe | 1.00 / 1.00 | 0.67 | 454 | 0 % | 120 | 0 (0 %) | 1.13 |
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

## 6. Playtest round 10 combat rules (2026-11-20)

docs/PLAYTEST-ROUND10.md reported swallowed inputs, whiffs at 3.2–3.4 m, an exhaustion that also
blocked the roll, a fight that reset on one roll, and a "reform" on killing blows that looked
random. These are rule fixes, not number tuning. No enemy number changed.

| # | Finding | Change | Where |
| --- | --- | --- | --- |
| 1 | F-12: at 0 Atem the roll was blocked until 25 Atem | Exhausted, the roll still comes out as a **stumble** (`STUMBLE`): 2.5 m instead of 4.5 m, i-frames 0.10–0.25 s instead of 0.08–0.33 s, never perfect (no refund, no slow motion), free, at most one per 1.1 s, and it does not delay the Atem coming back. Swings and the Wuchthieb stay blocked. Caption once: „Kein Atem – du stolperst nur zur Seite.“ | `rules.ts`, `sim.ts` (`dodgeKind`, `tryDodge`), `index.ts`, `strings.ts` |
| 2 | F-05: one roll towards the field station (safe zone, r 40 m; the Damm pack sits ≈ 50 m from its centre) ended the fight, and the two wounded Nebellinge healed to full in ≈ 1.5 s on the way home (+50 %/s) | The leash or a safe zone must hold for **4.5 s in a row** (`RESET.grace`) before an enemy gives up; no leash under 15 m; **no healing on the way home**; back home an enemy heals only after 6 s, at 10 %/s; **quest, escort, wave and prologue (tier 0) enemies keep their wounds** (`keepsWounds`). Bosses still reset in full at home (phase 1, seal shut): that is a boss rule. | `rules.ts`, `sim.ts` (`think`) |
| 3 | F-22 / F-34: Nebellinge and Mahnbriefe "reformed" on some killing blows | The rule existed (`reforms`: a light, non-finisher blow on a tier ≥ 1 Nebelling or Mahnbrief that had not reformed yet; escorts excluded). It is now one stated rule: **every** tier ≥ 1 Nebelling or Mahnbrief (pack, escort, second wave or called by a Rufer; not elites, bosses, a boss's summons, the tier-0 tutorial ones) emptied by a **plain Hieb** (1st or 2nd of the chain) pulls together **once** at 40 %. The **3rd Hieb, a Wuchthieb, an ability, or a blow while gebannt** (new) undoes it. Telegraph: its bar shows „formt sich neu“ from half strength while it still can; on the reform a puff, an inward ring and „Formt sich neu!“ over it; the first reform per kind explains the rule („Nebel formt sich einmal neu – der dritte Hieb, ein Wuchthieb oder das Bannlicht lösen ihn ganz auf.“ / „Papier faltet sich einmal neu – …“); the bestiary notes say it too. | `sim.ts` (`canReform`, `reforms`), `index.ts` (`traitOf`, `reform`), `hud.ts`, `strings.ts`, `rpg/enemies.ts` |
| 4 | F-23: clicks ≈ 0.2–0.3 s after a hit and one dodge did nothing | Cause: during hit-stop (60–198 ms) the sim skipped the player's moves, so a press in those frames was lost. Now an attack or dodge press is **buffered for 0.25 s** (`INPUT_BUFFER`), through hit-stop, a swing not yet in its last part and a roll still rolling. During an ability presses are still dropped (the ability owns the hands; buffering them made the scripted skilled bot fire unintended swings after every ability). | `rules.ts`, `sim.ts` (`step`, `playerMoves`) |
| 5 | F-06 / F-37: whiffs at 3.2–3.4 m from the centre | Reach was already measured to the body (2.6 m + radius: Nebelling 3.15 m, Foliant 3.3 m), so these were just outside. Now the light Hieb has a **target** (the nearest enemy within the aim assist's angle; the locked or soft target the game aims at) and, if its body is just out of reach, **steps in** up to 1 m (`STEP_IN`, a 0.12 s push that ends before the impact) and **reaches 0.4 m further against it**. A light pinned by the Bannlicht keeps its own +1.2 m and gets no step (otherwise a masher cleared a pair of Irrlichter in 4 s). | `rules.ts`, `sim.ts` (`startLight`, `swingTarget`, `resolveSwing`), `index.ts` (`step` → `player.impulse`), bots |

Rejected while testing: a roll cancelling a light swing's recovery (F-23 suggestion). The roll already
comes out during a swing; the cancel only cost the scripted bots their queued hits.

**The bots** now model what a human would do with the new rules: the human bot rolls when exhausted
if a stumble is available, and both bots integrate the step-in push like the roll.

**Before / after** (`pnpm sim:combat`, 50 runs per row; "before" = §3 as of `dcbee43`, "after" = §3 now):

| Encounter | Win | HP left mean | Time to kill mean (s) | Hits taken / fight | Dodges / fight (success) |
| --- | --- | --- | --- | --- | --- |
| Nebelling — prolog Bussole | 100 → 100 % | 62 → 61 % | 21 → 24 | 6.3 → 6.6 | 3.4 → 4.1 (87 → 87 %) |
| Irrlicht — "Lichter am Weiher" | 100 → 100 % | 98 → 98 % | 7 → 7 | 0.3 → 0.3 | 2.1 → 2.1 |
| Irrlicht — K1 Karlslust (5) | 100 → 100 % | **65 → 53 %** | **26 → 33** | **5.5 → 8.7** | 7.7 → 9.2 |
| Irrlicht — K2 Lichter 3 | 100 → 100 % | 94 → 92 % | 9 → 9 | 1.1 → 1.3 | 1.9 → 2.0 |
| Streuner — K1 Zwinger | 100 → 100 % | 61 → 67 % | 17 → 16 | 5.4 → 4.5 | 5.4 → 5.6 |
| Mahnbrief — K1 Registratur | 100 → 100 % | 58 → 59 % | 21 → 23 | 7.2 → 7.2 | 4.2 → 5.1 (90 → 84 %) |
| Foliant — drill | 100 → 100 % | 92 → 92 % | 9 → 9 | 0.9 → 0.9 | 2.6 → 2.6 |
| Raffschatten — K3 | 100 → 100 % | 46 → 46 % | 34 → 33 | 9.7 → 9.7 | 6.2 → 6.2 |
| Glutling — K3 | 100 → 100 % | 63 → 61 % | 18 → 18 | 6.7 → 6.9 | 4.3 → 4.1 |
| Grusling — K4 | 100 → 100 % | 78 → 80 % | 22 → 23 | 4.6 → 4.5 | 3.7 → 3.9 |
| Steinfresser — K4 | 86 → 90 % | 43 → 44 % | 33 → 32 | 9.6 → 9.5 | 6.8 → 6.3 |
| BOSS Schuldbuch (K1) | 100 → 98 % | 48 → 48 % | 54 → 56 | 17.7 → 17.6 | 9.7 → 11.1 |
| BOSS Pikeur (K2) | 98 → 100 % | 46 → 48 % | 51 → 50 | 12.5 → 12.4 | 10.8 → 10.7 |
| BOSS Strohmann (K3) | 100 → 100 % | 61 → 62 % | 53 → 51 | 6.2 → 6.0 | 9.7 → 9.2 |
| BOSS Strohmann, never learns | 96 → 100 % | 39 → 46 % | 79 → 77 | 15.6 → 14.3 | 11.1 → 11.7 |
| BOSS Steinbrecher (K4) | 88 → 92 % | 32 → 31 % | 120 → 117 | 29.0 → 27.3 | 24.3 → 23.3 |
| BOSS Steinbrecher, title hint missed | 82 → 82 % | 29 → 29 % | 122 → 120 | 30.4 → 30.7 | 25.0 → 26.3 |
| BOSS Steinbrecher, never learns | 0 → 0 % | 0 → 0 % | – | 37.0 → 36.3 | 21.8 → 23.8 |

**Reading:**

- **Nothing got trivialised.** Every row moved within the bot noise (about ±5 points at 50 runs; §5),
  except one. The unwinnable "never learns" rows stay unwinnable, and no fight got shorter by more than 3 s.
- **K1 Karlslust is harder**: 65 → 53 % HP left, 26 → 33 s. Its Nebelling escorts now reform like
  every other Nebelling (F-22 asked for "all or none"), about 3.7 reforms per fight. Toggling only that
  rule brought the row back to 64 % / 27 s in a test run. 53 % is in line with the other K1 fights (Registratur 59 %,
  Zwinger 67 %, Schuldbuch 48 %), so it stays. If it should be easier, the lever is
  `REFORM_HP` or leaving escorts out again (the bar tag keeps that predictable too).
- **The Bussole fight takes 3 s longer** for the same reason (its two wave Nebellinge are escorts in the
  sim and now reform too), at the same HP.
- **The stumble does not show in the human bot's numbers.** The bot keeps more than 22 Atem for its
  swings, so it is rarely exhausted when a blow comes. The rule is for players who spend everything,
  like the playtester (3 swings + 2 dodges).
- **The step-in hardly shows either.** The bot stands at 2.0 m + 0.6 × radius (± 0.35 m), inside
  reach. It matters to players who circle at 3.0–3.4 m, as the Nebellinge do.
- **The older scripted bots** (`combat-balance.test.ts`) all pass unchanged. One rule had to change
  for that: presses during an ability are dropped (row 4). With them buffered, the skilled bot's K2
  Spur fight went from 43 to 65 s.

**Tuning changes**: none. The perfect-dodge window, Atem costs, enemy HP and damage are unchanged.
The new numbers (`STUMBLE`, `INPUT_BUFFER`, `STEP_IN`, `RESET`) are rules with the reasons above.
