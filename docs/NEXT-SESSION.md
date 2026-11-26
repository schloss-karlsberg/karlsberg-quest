# Next session: let Claude really *play* Karlsberg Quest

Handoff written 2026-11-20 for the next agent. This agent controls the user's Chrome through the
**Claude in Chrome** extension. Read this file first, then `docs/design/tour/README.md` (the current
concept: the guided tour with time travel), `docs/PRD.md`, `docs/ACTION-RPG.md`,
`docs/ART-DIRECTION.md` and `docs/ARCHITECTURE.md`.

> §§2–5c were written on 2026-11-20, before the guided tour replaced the surveyor prologue; read their
> mentions of the prologue, the Feldstation / Bauwagen and the lantern start as history. §7 is the current backlog.

## 1. What the game is

"Karlsberg Quest" is a German-language (USK 16, no gore) **action RPG** in the browser. It is
set on the real LiDAR terrain of Schloss Karlsberg (Homburg, Saarland).

- NPCs give quests: collect things, defeat spectral enemies, bosses. Think WoW or Witcher.
- **No quizzes, no word puzzles.** History is taught through quest turn-ins, dialogue and codex cards.
- There is one open world with five eras (Q switches): today (2025), 1789, Feb 1793 (night),
  Jul 1793 (night), 1796 (ruin).
- The story opens with the guided tour (the prologue „Die Führung“, no combat; `docs/design/tour/`), the first
  time travel at the Karlsbergquelle, then chapters 1–4 and three endings, each followed by a party.
- The look is "stylized modern game": rich colour, soft light, bloom, CC0 assets allowed.
- Stack: Vite, TypeScript, three.js 0.187, pnpm, vitest, Playwright e2e.

## 2. Why this session exists

The user's verdict on the previous rounds:

- Playwright "playtests" (scripted keys plus screenshots) do **not** capture fun.
- Bot testers scored about 6/10 while the user found the game ugly and got stuck.

Latest real-GPU playtest (round 9):

| Measure | Result |
|---|---|
| Looks | 6/10 |
| Fun | 4.5–5/10 |
| Forest | 84–120 fps |

The user wants Claude to **play like a human and feel the fights**. The agreed plan follows.

## 3. The plan (in this order)

### 3.1 Bullet-time play mode

The game freezes, Claude looks, chooses an action, the game simulates about 0.25 s, then
freezes again.

Most of this already exists:

- **`?manual`** (`src/boot.ts`, `loop.manual = true`): the rAF loop renders but does not
  advance the simulation. Only `window.kq.step(n)` advances it (fixed 60 Hz, so
  `step(15)` = 0.25 s).
- **`window.kq`** (`src/debug/hooks.ts`) is installed in every build, not only with
  `?debug`. Useful members:
  - `step(n)`, `press(code, steps)`, `state()`, `teleport(x, z, yaw, pitch)`, `setEra(e)`,
    `perf()`
  - `story.state()`, `story.goto(ch, beat)`
  - `quests.state()`, `combat.enemies()`, `combat.events()`
  - `progression.state()` / `.level(n)`, `skills.grant(id, tier, quiet)`, `npc.list()`
  - `ctx.input.simulate(code, down)` for holding keys across steps
- Read `e2e/helpers/k1.ts` and `e2e/helpers/k2.ts` for how scripted play drives these.

What to build:

1. A small in-game **pilot API**, for example `kq.pilot.act({ hold: ['KeyW','ShiftLeft'], tap: ['Space'], mouse: {dx, dy, left, right}, steps: 15 })`.
   - It returns a compact **observation**: player HP, stamina, position and facing; nearby
     enemies with kind, distance, bearing, HP, AI state and **telegraph/wind-up time left**;
     the current objective and marker bearing; open dialogue or modal text; recent combat
     events (hits dealt and taken, dodges, KOs).
   - It must work without pointer lock. Feed mouse look directly into the player and camera,
     because CDP mouse events don't produce `movementX` under pointer lock.
2. A **frame strip**: capture about 4–6 small frames during each action (for example
   `canvas.toDataURL` every few steps, with `preserveDrawingBuffer` or a render-then-read) so
   Claude can see impact, flash, knockback and animation, not just the end frame.
3. A visible "⏸ Bullet time" chip on the HUD while `?manual` is on.

### 3.2 Fight metrics + simulated human

1. Per fight, log and expose in `kq.combat.report()`:
   - time to kill
   - damage taken
   - hits taken with **no on-screen telegraph** or from off-screen
   - each enemy's wind-up duration against human reaction time (0.25 s)
   - dodge success rate
   - hit-stop and feedback events per hit
2. Add a headless "human-like" bot with 250 ms reaction delay and some error. Run each enemy
   family and each boss about 50× to get win rate and HP left, so balance is backed by numbers.

### 3.3 F8 feedback notes for the user's own play

1. **F8** opens a tiny note field.
2. It saves the note, a screenshot, position, era, quest, objective and the last ~30 s of events
   as a downloadable JSON, or to IndexedDB with an export button in the pause menu.
3. Add passive telemetry for long stuck times (no objective progress), deaths and time per
   quest.

### 3.4 Arrow-key camera turning

Arrow keys or J/L-style turning as a fallback to mouse look, for automation and accessibility.
Check existing bindings in `src/player/input.ts` first; J is the journal.

### 3.5 Then PLAY

Use the Chrome extension on the user's real GPU and play a **fresh new game** like a newcomer:
the prologue, the lakes (side quest "Lichter am Weiher"), chapter 1. Fights go in bullet time.

- Report every moment you don't know what to do, every unfair hit and every ugly spot.
- Fix them.
- Loop until it's fun.

Known weak spots from the round-9 testers:

- The Irrlichter at the lake hit hard and invisibly.
- Bosses (Schuldbuch, Pikeur) bounce frontal hits with no early hint to circle behind.
- The camera goes inside the reeds at the lake.
- The Strohmann and Steinbrecher bosses look stiff.
- The Festsaal runs at about 30–35 fps.

### 3.6 Story idea (owner, 2026-11-20): the Karlsbergquelle starts the time travel — **built**

**Status: done** in `21dc108` (set, water, touch, story, quest, codex) and `b90a311` (look pass).

**As built:**

| Part | What exists |
|---|---|
| Place | OSM node 368031320 "Karlsbergquelle" (`natural=spring`) → local **1061 / −834.5**, front faces **234°** (SW) across a small ravine, 59 m below the Orangerie terrace; the OSM Karlsbergbach starts here (`src/systems/quelle/layout.ts`) |
| Set | `src/systems/scenery/quelle.ts` in `WORLD_SETS`, all five eras, built within 150 m. Today: log trough on two stumps, red-sandstone dry wall with plate, iron pipe, arched spring house sunk in its slope (heaped stones, grate), steps, mossy edge, info board at the trail. 1789: invented baroque Brunnenstube (ashlar front, niche, bronze spout, stone basin, flagged apron). Feb 1793: icicles and ice. 1796: plundered (spout gone, basin cracked, door gone) |
| Water | `src/systems/quelle/` (`layout`, `water`, `sound`, `index`): pool, stream, brook as a wet bed with a broken trickle, guide motes, a soft light column; procedural trickle / stillness / rewind sounds; clocks on game time |
| Touch | flag `quelle.call` → **E „Wasser berühren“** at the trough (facing the water, reach 2.1 m) → scene ≈ **2.7 s** on game time: turn, dip (`quelle:dip`), ripple, freeze, the brook runs back → `quelle:touch` → story shift to 1789 (scan wave); the new era's water starts frozen and thaws. Debug: `kq.quelle.info() / touch() / hold(t)` |
| Story | p3q „Die Quelle“ and p3r „Die Brunnenstube“ between p3 and p4 (`content/story/00-prolog.story.json`); p9 renamed „Der eigene Wechsel“ |
| Quest | `q.p.quelle` „Wasser, das sich erinnert“ (Laub, 30 XP: reach, touch, hold Q home). XP: `q.p.bussole` 120 → 95, `q.p.punktwolke` 130 → 105, so the prologue still ends at level 3. New Laub lines (P3Q, P3R), P8 rule lines reworded (`scripts/content-build/prolog.mjs`) |
| Codex | cx.41 „Die Karlsbergquelle“ (FAKT; OSM, komoot, LIDAR), cx.42 „Das Wasser erinnert sich“ (FIKTION), cx.38 lists the remembering water |
| Clearings | forest + `NatureProps.addClearing` (new) round the hollow; `KEEP_CLEAR` in `src/systems/travel/pois.ts` |
| Tests | unit tests updated (content packs, prologue quests, story). E2E (`pacing`, `helpers/prolog`, `campaign`) is not updated yet; another session is on it |

**Where the build differs from the plan below:**

- The touch happens in **today**, at the log trough, right after Laub wakes (before `q.p.bussole`, not from it), and shifts to **1789**. The scene is ≈ 2.7 s, not ≈ 4 s.
- The spring is **not** an anchor or a fast-travel point yet. Caught or KO'd players still wake where they did. Q into the past is still granted by the p9 anchor at the Ehrenhof, which is now the second, self-made shift.
- There is **no ice-crust touch** in Feb 1793 yet: the water is frozen and has icicles, but there is nothing to break.
- Jul 1793 is the baroque set in the fire night's glow; there is no reflection of the burning palace.
- The stonework is original procedural kit masonry with the shared surface layers; the only model is the CC0 fern clump.
- The build date and the palace supply are still unconfirmed; cx.41 says so („nicht belegt“).

_The plan as written before the build:_

The owner wants a cooler story start. **Touching the magic water of the Karlsbergquelle triggers
the first time travel.** Today the first shift is a bare Q press at the Ehrenhof in `q.p.punktwolke`.

**The real place (fact, for the codex):**
- The Karlsbergquelle is a real spring in the beech forest between the Karlsbergweiher and the
  Orangerie ruin. It is uphill from the Orangerie and reached from the pond or by a trail up from the
  Orangerie.
- It feeds the Karlsbergbach, about 1.6 km long, which joins the Reichersbach. There is a Kneipp
  basin nearby.
- Sources: komoot highlight 780842 "Karlsberg Spring and Water Cascade" (about 330 m); ich-geh-wandern.de
  Schlossbergtour and "Karlsbergweiher, Binnendünen und Closenbruch".
- Its build date, and whether it fed the palace, are **not confirmed**. Research this before writing a
  fact card; otherwise mark it unknown.

**The look, from a photo of the real spring:**
- a hollow in a steep forest slope, with ferns and ivy
- a low dry wall of red sandstone with a small plaque
- a hollowed **log trough** on two stumps in front of the wall, fed by a pipe
- uphill, a small **arched stone spring house** (Brunnenstube) half sunk into the slope
- sandstone steps on the left and mossy sandstone blocks along the path
- a red, sandy path

**Story beat (fiction, tagged FIKTION in the codex):**
1. In the prologue Laub, the Bussole, wakes at the Orangerie wall (`q.p.bussole`). It "hears water that
   remembers" and leads the player up the trail to the spring. Use the marker, plus a few light motes
   drifting downhill along the brook.
2. At the trough: **E "Wasser berühren"**. Then a short cinematic of about 4 s:
   - the hand dips in, and the ripples freeze
   - the sound drops away, and the brook runs backwards
   - the forest dissolves to 1789
   - the spring house stands new: a dressed baroque Brunnenstube with a stone basin and a bronze spout
3. Laub explains the rule. The water "remembers"; the Bussole carries a drop of it, so from now on **Q** works
   at places that remember. This gives the era shift a cause the player has seen, not just a keybind.
4. Optional: the spring becomes the **anchor**. Players who are caught or KO'd wake at the spring
   instead of the station, and the spring is a fast-travel point.

**The spring in each era:**

| Era | What the spring looks like |
|---|---|
| today | log trough |
| 1789 | new Brunnenstube |
| Feb 1793 night | frozen, so the first touch breaks the ice crust |
| Jul 1793 night | firelight reflected in the water from the burning palace |
| 1796 | the spout is plundered, only the stones are left |

**Work list:**
1. Find the spring's real position on the LiDAR, in local x/z. Use the OSM node "Karlsbergquelle" or the
   relief hollow and brook line between the Weiher (820/−869) and the Orangerie (1237/−966). Check that
   the slope reads in the terrain.
2. Model it from CC0 parts (Poly Haven or ambientCG red sandstone, a log, ferns), with a water surface
   and an animated spout. Build the era variants as above.
3. Content:
   - a new prologue objective or beat, between `q.p.bussole` and `q.p.punktwolke` or replacing the
     Ehrenhof Q tutorial
   - an `interact` trigger and the cinematic
   - a codex card for the real spring, and a FIKTION card "Das Wasser erinnert sich"
   - the pacing e2e (`e2e/pacing.spec.ts`), `e2e/helpers/prolog.ts` and `campaign.spec.ts` updated
4. Check how Q is unlocked today, so the spring becomes the one place that grants it.
5. Docs: PRD §4.2 premise, `docs/ACTION-RPG.md` §11.0 prologue table and §14 log, and
   `content/bible/01` (prologue).

**Research so far (2026-11-20, nothing built yet):**
- **Provisional position:** about **x 1061, z −835**. This is the upstream end of the OSM "Karlsbergbach"
  lines in `public/data/paths.json`, which run west to the Weiher at 808/−859. The coordinate rule is
  x = E − 381000, z = −(N − 5465000) in EPSG:25832 (`public/data/terrain/meta.json`).
- Still to check:
  - the terrain height there
  - an OSM `natural=spring` node near 49.334 N, 7.376 E
  - that the spot is reachable on foot
  - the Kohlplatten side quest point at 1040/−902, about 70 m away
- **How Q is unlocked today:** the story `anchor` action sets the flags `shift.allowed`, `shift.target` and
  `shift.x/z/r`, which `updateShiftKey` in `src/systems/story/index.ts` reads. The first anchor is in beat
  p9 of `content/story/00-prolog.story.json` (hand-written), at the Ehrenhof (1218/−1118); Laub explains
  the rule in p8. The quest and dialogue packs are generated by `scripts/content-build/prolog.mjs`.
- **Planned beats:**
  1. Insert a new beat between p3 (Laub wakes at the Orangerie wall) and p4: follow the marker to the
     spring, E at the trough, the cinematic and the shift to 1789, Laub's rule, hold Q to come back.
  2. Turn p9 into the second, self-made shift at the Ehrenhof.

Do not name or show the brewery brand that shares the name (the one exception, for the bottle
collectibles, is in §5). The spring is called "Karlsbergquelle".

## 4. How to run it

- **Play copy** (stable build for the user and the browser):

  ```sh
  npx vite build --outDir ../karlsberg-quest-play --emptyOutDir
  npx vite preview --outDir ../karlsberg-quest-play --port 5290 --strictPort
  ```

  The URL is http://localhost:5290. Restart the server if it isn't running; it was tied to the
  previous session.
- **Dev:** `pnpm dev` (port 5280).
- **Useful URL flags:**

  | Flag | Effect |
  |---|---|
  | `?notitle` | Skip the title screen |
  | `?nosave` | Don't save |
  | `?fresh` | Ignore the save |
  | `?manual` | Bullet-time stepping |
  | `?era=1789` | Start in that era |
  | `?x=1214&z=-1172&yaw=180` | Start at the 1789 Ehrenhof |
  | `?kapitel=2\|3\|4` | A new game starts at that chapter, with skills and level |
  | `?q=low\|med\|high` | Quality tier |
  | `?cam=first\|third` | Camera mode |
  | `?debug` | Stats and validation |

- **Fresh new game by hand:**
  1. Click „Neues Feldbuch beginnen“ (confirm the overwrite if a save exists), then „Verstanden“.
  2. Enter a name, click „Eintragen“.
  3. Click „Laterne anzünden“ (a screen left over from the surveyor concept; TASK-007 replaces it).
  4. Click into the canvas for mouse look. The guided tour starts.
- **Controls:**
  - WASD move, Shift sprint, Space dodge.
  - LMB or K attack (hold for Wuchthieb), RMB or G Bannlicht, H Balsam.
  - E interact, Q era shift, I inventory, J journal, M map, L lantern.
  - Tab or middle mouse lock-on, F Geisterblick, F5 first/third person, mouse wheel zoom.
- **Gates before committing:** `pnpm typecheck`, `pnpm test` (530 tests), `pnpm validate`,
  `pnpm build`. E2E with `--workers=1` only as a regression net; the full `campaign.spec.ts`
  takes about 1–1.2 h. The round-9 fixes are committed, but their final full campaign e2e
  never finished, so run it once.
- **Heavy jobs: three slots per machine, quiet-machine jobs exclusive.** About five sessions share
  this Mac, so wrap every heavy job in `scripts/dev/heavy.sh` (alias `pnpm heavy`). Up to three
  normal jobs run at once (`KQ_HEAVY_SLOTS`, default 3; slot 0 is `/tmp/kq-heavy.lock`, slot k
  `/tmp/kq-heavy.lock.slot<k>`). `--exclusive` takes every slot, for the walk, framerate and perf
  specs, the real-GPU config, real-GPU screenshot sets and local model runs. Waiters line up first
  come, first served in a ticket queue (`/tmp/kq-heavy.lock.queue/`) and print how many slots are
  busy. Then it runs your command and passes its exit code through. Heavy jobs are Playwright e2e,
  real-GPU screenshots (`scripts/dev/shot*.mjs`, `look.mjs`) and local TTS/model runs. Set
  `KQ_HEAVY_OWNER=<session name>` so the others can see who holds a slot.

  ```sh
  KQ_HEAVY_OWNER=voice scripts/dev/heavy.sh -- pnpm exec playwright test e2e/voice.spec.ts --workers=1
  scripts/dev/heavy.sh --exclusive -- node scripts/dev/shots.mjs             # GPU screenshots
  scripts/dev/heavy.sh --exclusive --check-load -- python tts_run.py          # local model run
  scripts/dev/heavy.sh --exclusive --max-hold 5 -- node scripts/dev/shots.mjs # hint: expect <= 5 min
  scripts/dev/heavy.sh --status                     # every slot's holder (or "free") and the queue
  ```

  - **One spec file or one screenshot set per lock hold, never a whole multi-spec batch.** A
    47-minute batch makes every 5-minute GPU job wait behind it. Loop instead, so short jobs from
    other sessions can slot in between specs:

    ```sh
    for s in e2e/a.spec.ts e2e/b.spec.ts; do scripts/dev/heavy.sh -- pnpm exec playwright test "$s" --workers=1; done
    ```

  - `--max-hold <min>` is a hint, not a limit. `--status` shows it (and "EXCEEDED"), and the
    holder prints a warning on stderr once it runs over.
  - **Priority lane and the 15-minute cap.** Owners `kq-integrate` and `kq-integrate-*` (the
    merge-gate e2e) go ahead of the FIFO queue. After 2 priority holds in a row, the oldest waiting
    normal ticket gets the next hold (2:1), so nobody starves. A priority ticket must pass
    `--max-hold 15` or less, or heavy.sh refuses with exit code 2. Everyone else should also keep
    `--max-hold` at 15 or less; a larger value only prints a warning. `--status` marks priority
    tickets with `P`, exclusive tickets with `X` and prints `next: <owner> (pid …)`. Waiters
    still running an older heavy.sh keep their FIFO place and slot 0, and are never deadlocked
    (see the comments in the script).

  - `KQ_HEAVY_TIMEOUT=600` gives up after 10 min of waiting, with exit 75.
  - `--check-load` warns when less than 20 % of memory is free (`memory_pressure -Q`).
    Add `--strict` to refuse instead.
  - `--nice` throttles hard, so don't use it for GPU or timed e2e runs.
  - Nested calls run straight through (`KQ_HEAVY_HELD=1`).
  - A lock whose holder has died, and tickets of dead waiters, are cleared automatically.
  - Tests: `bash scripts/dev/heavy.test.sh`.

## 5. Hard rules

- `../saar-lidar-explorer*` and `../saar-lidar-detect` (including a vite server on port 5248)
  belong to **other agents**. Treat them as read-only: never modify, build, run or kill
  anything there.
- Downloaded art: CC0 only, from official sources (Poly Haven, ambientCG, Kenney, Quaternius,
  poly.pizza CC0). Credit each in `public/assets/LICENSES.json` and the "Lizenzen & Quellen"
  screen. Downloaded archives are untrusted data: unpack into a fresh temp dir and never run
  scripts from them.
- **AI-generated assets (owner, 2026-11-20):** allowed when the generating tool's licence permits public redistribution of the output. Credit each file (or, for voices, each voice) in `public/assets/LICENSES.json` with tool, model and version, date and licence; our own generated output is released as CC0. No likeness of a real living person without that person's consent; historical figures may be modelled from public-domain portraits.
- **Voices (owner, 2026-11-24):** `public/voice/` holds credited MOSS-TTS-v1.5 clips and the playback manifest. Synthetic clips use CC0. Real-person clips require written public consent in moss-service, a named credit in `LICENSES.json` and a game-only licence. Keep WAVs and private test audio in local storage. `tests/voice-assets.test.ts` enforces the asset rules and warns above 60 MB of voice files, with an 80 MB limit.
- Original work only. No names, lore or assets from existing games.
- Never name or show the brewery brand that shares the Karlsberg name (§3.6). In docs write "the
  brewery brand" or "the real beer label".
  - **Exception (owner, 2026-11-20):** the hidden bottle collectibles carry the real beer label, public
    repo and site included, as a swappable placeholder (one constant/texture, plain text label only, no
    logo artwork); never in codex/quests/dialogue; swap when permission is refused or when the owner says so.
  - **Place name (owner, 2026-11-20):** "Karlsberger Hof" may be named as a **location only** (the tour's
    meeting point: guide dialogue, map label, docs). No logo, signage, slogans, products, advertising tone or
    beer talk tied to the brand; FAKT texts about the building stay neutral and sourced (docs/design/tour/).
- **Working mode (owner, 2026-11-20):** the main session acts only as a coordinator; all work runs in
  subagents or separate sessions.
- Git: the repo is public at schloss-karlsberg/karlsberg-quest. The one-time history rewrite is done (2026-11-20): push to origin after the gates pass, pull or rebase onto `origin/main` before merging; never force-push main. `scripts/release/publish.sh` is retired. Commit messages and --no-ff merges use Conventional Commits. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or your model's line).
- No persistent background HTTP control server for driving the browser; the earlier attempt
  was blocked. Use the Chrome extension, plus one-shot scripts if needed.
- Keep the user's personal data private.
- Chat with the user only in short updates. The living docs are the `.md` files in the repo;
  update them (`docs/ACTION-RPG.md` §14 log, `docs/PRD.md` changelog) when you change things.
- Close tabs and browsers and kill dev servers you start.

## 5b. Session 2026-11-20 status (updated after the spring build)

- **Working mode:** the main session only coordinates; all work runs in subagents or separate sessions
  (see §5).
- **Built and merged into `main`:**
  - §3.1: `kq.pilot` (act, observe, choose, release, bulletTime, showStrip) in `src/debug/pilot.ts`
    (round-10 fixes: `radio` and a live `hud.prompt` in the observation, `turnDeg` up front,
    `inputDropped` events, serial `choose()`, a working `left: 'hold'`, era shift / fast travel on
    game time in bullet time; full API in docs/ARCHITECTURE.md "Debug hooks")
  - §3.2: `kq.combat.report()`, plus the bot via `pnpm sim:combat`, results in `docs/BALANCE.md`
  - §3.3 and §3.4: F8 notes, telemetry, and ← / → turning
  - Balance round (BALANCE.md §5, merge `02340f5`): Steinbrecher 950 HP, boss reveal / roar caption,
    per-boss bounce hint after 2, telegraph floor 0.5 s
  - §3.6 Karlsbergquelle: `21dc108` + `b90a311` (see §3.6 "As built")
- **Research:** [`docs/PERF-MOBILE-RESEARCH.md`](PERF-MOBILE-RESEARCH.md) (fan noise, older devices,
  mobile; ranked quick wins), committed in `21dc108`.
- **Research:** [`docs/VOICE-MEDIA-RESEARCH.md`](VOICE-MEDIA-RESEARCH.md) (AI voice and media options for
  voices, SFX, images and video).
- **Running in parallel (other sessions; do not edit their files):**

  | Track | Output |
  |---|---|
  | Perf quick wins | from PERF-MOBILE-RESEARCH "Ranked quick wins" |
  | Playtest round 10 | `docs/PLAYTEST-ROUND10.md` |
  | Spring e2e and tests | `e2e/pacing.spec.ts`, `e2e/helpers/prolog.ts`, `campaign.spec.ts` |
  | Spring look polish | `src/systems/scenery/quelle.ts`, `src/systems/quelle/` |
  | Design doc for the owner's new ideas (§5c) | [`docs/IDEAS-ROUND11.md`](IDEAS-ROUND11.md) |

- **Next:** merge the parallel tracks, rebuild the play copy, then §3.5 PLAY via the Chrome extension,
  using `kq.pilot.bulletTime(true)` and `kq.pilot.showStrip(true)` on the play build.

## 5c. Owner requests 2026-11-20 (pending design)

Design goes into [`docs/IDEAS-ROUND11.md`](IDEAS-ROUND11.md). Nothing is built yet.

| # | Request | Notes / constraints |
|---|---|---|
| 1 | The **next chapter** also starts at the Karlsbergquelle, as a time-travel transition | reuses the touch scene (§3.6); today the chapter opens at the Ehrenhof anchor |
| 2 | In 1789 the Herzog lets **no strangers** into the garden or the palace, so the opening is a **sneaking / disguise** beat: get clothes, pose as part of an esteemed visitor's party "like Knigge" | Knigge is a real person: PRD §4.4 rule 2 (only sourced words and deeds) applies. **Korrektur 2026-11-20:** "Knigge visited the Karlsberg in 1792" is not proven. The only source, a letter of 11 May [1792] in *Briefe, auf einer Reise aus Lothringen nach Niedersachsen geschrieben* (Hannover 1793, S. 26–29, BSB/MDZ bsb10467161), has an unnamed writer from Metz, names Knigge only as editor, and says the duke was away. **Decision (owner, 2026-11-20): K2**, the disguise uses the invented visitor **Hofrat Justus Amsel aus Celle** (you are his secretary, sent ahead); no letter in Knigge's name, no Knigge in 1789; cx.43 is STRITTIG. Details: IDEAS-ROUND11 §2 |
| 3 | A fun **side activity** not tied to quests: original **"challenge chambers"** with spatial puzzles | the owner said "like Zelda shrines"; we must **not copy** that game (§5: original work only). Spatial, not quiz or word puzzles |
| 4 | **Hidden collectibles** at points of interest | the owner asked for **real-brand beer bottles**. **Decision (owner, 2026-11-20, relayed by the coordinator):** the hidden bottle collectibles carry the real beer label, public repo and site included, as a swappable placeholder (one constant/texture, plain text label only, no logo artwork); never in codex/quests/dialogue; swap when permission is refused or when the owner says so. Rule and limits: §5, exception to the brand rule |

## 6. Current state

- `main` HEAD after the spring build is `b90a311`. Since `f90f9a5` (round 9, the `?kapitel` link):
  the tooling merges (§3.1–3.4), the balance merge `02340f5`, the spring `21dc108` + `b90a311`.
- Untracked: `docs/PLAYTEST-ROUND10.md` (the playtest session's file).

## 7. Next sprint backlog (2026-11-21, after v0.6.0)

Owner of the tour systems (`src/systems/walk/` etc.) and of the mobile/UI follow-ups is now kq-story.

### 7.1 Minimap (implemented in TASK-015, browser checks pending)

- The north-up corner map shares the Karte artwork and shows nearby paths, the heading arrow, the
  current objective and the tour group. It switches between the present-day walk graph and the
  historical terrain paths over the survey sheet. Story leads into buildings follow the next door.
- „Minikarte“ under Spiel is on by default. On landscape phones the map fits beside the controls
  and the dialogue band. Reduced motion snaps the arrow to compass headings.
- Canvas 2D redraws at about 10 Hz with zero additional 3D draw calls. See
  [the minimap draw-cost notes](PERFORMANCE.md#38-minimap-task-015).

### 7.2 Tour playtest findings still open

Source: the playtest report of 2026-11-21 (tour-playtest @ 69c1fc0). It lives in a temp folder
(`playtest-tour/report.md` in the playtester's scratchpad), so the essence is copied here.

- Findings 1–4 are FIXED (MR 14 `feat/tour-find-group` c2843ce + slice `tour/slice-find` 3997f28).
- Findings 5–6 (dogs not moved by fades/warps; dogs slide backwards on 180° turns) are with kq-characters.
- TASK-017 addresses findings 12–13. See the [implementation and tuning notes](design/tour/slice-v0.md#deer-photo-and-sneak-tuning-task-017).

| # | Severity | Essence |
|---|---|---|
| 7 | major | The dog cinematic at Wind never shows the dogs (camera 2.6 m behind the player inside the crowd). Camera beside/above, or fade out occluders |
| 8 | minor | Quelle trough is fiddly: stuck at the wall 3 m away, trigger 1.6 m, wrong prompt „E Pause an der Quelle“ |
| 9 | minor | At stops the group does not face the guide; the guide does not turn to the player in dialogue |
| 10 | minor | No player–group collision; a dog clips through legs |
| 11 | minor | Camera inside the rock face at Felsenpfad; the radio box covers the player |
| 12 | minor | Photo mode keeps HUD and waymarks (tracker over the phone clock, bars/pill, prompt over 1×/2×, objective ring on the deer) |
| 13 | minor | Deer photo needs ~13 m for "good"; deer half behind a boulder; sneak meter very forgiving |
| 14 | minor | Title button flips from „Neues Feldbuch beginnen“ to „Fortsetzen“ under the cursor when loading ends |
| 15 | minor | Lantern-gate line „Früh am Morgen, vor dem Bauwagen“ is wrong for the tour (afternoon, car park) |
| 16 | minor | Stale „Pause an der Quelle“ prompt during the time shift; clipped tracker „◆ Gerold I“ |
| 17 | cosmetic | Today's tripod + beam stands next to the 1789 fountain |
| 18 | cosmetic | The guide walks before „Dann mal los“; a member stands on a boulder during „Bitte nicht auf die Felsen“ |

Tooling note from the report: „Neues Spiel“ deletes the stored save even with `?nosave`.

Known issues from MR 14:

- The compass labels for the group and the next stop overlap at the edge when both are behind the player.
- The barks system's 45 s gap and per-line cooldown can swallow the „Hier drüben!“ call-out.
- The marker uses the plain ring style, not the gold diamond the objective uses.

Slice polish list:

- The „Die Führung“ chapter card lingers ~100 s.
- The spring prompt and Marlene's radio lines bleed in at the Quelle.
- Walkers look dithered at 10 m.
- The Bussole objective lags.
- The wait barks are untested in e2e.
- The group vanishes in view.
- The slice runs too short: 4:41 / 8:16 against the targets of 8 / 12 min.
- Laub's 1789 arrival line from main does not fit the tour.

Mobile/UI leftovers: the credits strip vs the touch buttons on phones (MR 13, unchecked), and MR 9's
open visual check in [`docs/MOBILE-UI-PASS.md`](MOBILE-UI-PASS.md) §8.2.

### 7.3 Voices

- The 125 final Laub lines were generated via moss-service for v0.6.0 (synthetic, CC0, credited).
- Next: Marlene, the tour, present-day, endings, the prologue and hub barks, once their text is final
  (kq-story decides), plus NPC casting (Hanne, Jost etc.).
- Tour voice lines wait for the tour text to be final after the owner's replay.
- The owner approved the real-person player voice on 2026-11-24. On 2026-11-25 the `guest-test` registry entry confirmed written public consent and eight tour clips were queued. The owner starts the runner before the clips can be collected. The „Spielerstimme“ toggle is planned.
- Pointers: [`docs/design/tour/player-voice.md`](design/tour/player-voice.md), the voice assets and
  `scripts/voice/voices.json`.

### 7.4 Owner decisions pending

- **The real guide's consent.** The placeholder „Gerold Imhoff“ stays until then.

### 7.5 kq-systems handoff items

Full list: [`docs/handoff/kq-systems.md`](handoff/kq-systems.md) (Open items).

- Parked: tour skip / `tour.walkAll`, until the owner has played slice v0.
- Parked: the GPU/driver side of the era-shift stall (around the midpoint 1–2 frames take ~100 ms with
  4–8 ms CPU; at shift end 36 `texSubImage2D` calls take 68–91 ms). Needs a GPU-side trace:
  [`docs/PERFORMANCE.md`](PERFORMANCE.md) §7, "Later / parked".
- Occlusion culling for the Felsenpfad; a palace LOD for the past eras; fire light on people (no local-light slot).
- Perf: add the party as a measured view and re-sample walk-group cost once kq-characters' 7 extras land.
- Low priority: cinematic keepAlive for animals, a dog-bark SFX, deer noise and wind input.
- Fan-round leftovers (PERFORMANCE §7): the auto-downgrade reads only frame time and never steps back up.

### 7.6 How to resume the tour slice

- Dev branch `tour/slice-find` (3997f28) sits on the `feat/tour-find-group` feature;
  `slice-v0-playtest` is the last green slice commit.
- The owner plays in `.claude/worktrees/tour-playtest` (`pnpm dev`, then http://localhost:5280/?tour).
- Gates: the tour-slice spec + smoke, both via `scripts/dev/heavy.sh` (one spec per hold, `--workers=1`).
