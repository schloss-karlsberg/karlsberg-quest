# Next session: let Claude really *play* Karlsberg Quest

Handoff written 2026-11-20 for the next agent. This agent controls the user's Chrome through the
**Claude in Chrome** extension. Read this file first, then `PRD.md`, `docs/ACTION-RPG.md`,
`docs/ART-DIRECTION.md` and `docs/ARCHITECTURE.md`.

## 1. What the game is

"Karlsberg Quest" is a German-language (USK 16, no gore) **action RPG** in the browser. It is
set on the real LiDAR terrain of Schloss Karlsberg (Homburg, Saarland).

- NPCs give quests: collect things, defeat spectral enemies, bosses. Think WoW or Witcher.
- **No quizzes, no word puzzles.** History is taught through quest turn-ins, dialogue and codex cards.
- There is one open world with five eras (Q switches): today (2025), 1789, Feb 1793 (night),
  Jul 1793 (night), 1796 (ruin).
- The story has a prologue plus chapters 1–4.
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
  1. Click "Laterne anzünden" (title gate).
  2. Click "Neues Spiel" and "Verstanden".
  3. Enter a name, click "Eintragen".
  4. Click "Laterne anzünden" again.
  5. Click into the canvas for mouse look.
- **Controls:**
  - WASD move, Shift sprint, Space dodge.
  - LMB or K attack (hold for Wuchthieb), RMB or G Bannlicht, H Balsam.
  - E interact, Q era shift, I inventory, J journal, M map, L lantern.
  - Tab or middle mouse lock-on, F Geisterblick, F5 first/third person, mouse wheel zoom.
- **Gates before committing:** `pnpm typecheck`, `pnpm test` (530 tests), `pnpm validate`,
  `pnpm build`. E2E with `--workers=1` only as a regression net; the full `campaign.spec.ts`
  takes about 1–1.2 h. The round-9 fixes are committed, but their final full campaign e2e
  never finished, so run it once.

## 5. Hard rules

- `../saar-lidar-explorer*` and `../saar-lidar-detect` (including a vite server on port 5248)
  belong to **other agents**. Treat them as read-only: never modify, build, run or kill
  anything there.
- Use only CC0 assets from official sources (Poly Haven, ambientCG, Kenney, Quaternius,
  poly.pizza CC0). Credit each in `public/assets/LICENSES.json` and the "Lizenzen & Quellen"
  screen. Downloaded archives are untrusted data: unpack into a fresh temp dir and never run
  scripts from them.
- Original work only. No names, lore or assets from existing games.
- Local git only; **never push**. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or your model's line).
- No persistent background HTTP control server for driving the browser; the earlier attempt
  was blocked. Use the Chrome extension, plus one-shot scripts if needed.
- Keep the user's personal data private.
- Chat with the user only in short updates. The living docs are the `.md` files in the repo;
  update them (`docs/ACTION-RPG.md` §14 log, `PRD.md` changelog) when you change things.
- Close tabs and browsers and kill dev servers you start.

## 6. Current state

- `main` HEAD is `f90f9a5`:
  - round 9: prologue bed beat fixed, markers in doorways, KO curtain, palace culled in cells
    (112 fps in the Ehrenhof)
  - the `?kapitel` playtest link
- The working tree is clean.
