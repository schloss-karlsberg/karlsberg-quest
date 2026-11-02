# Karlsberg Quest – Architecture

Browser game (Vite + TypeScript strict + three.js, no framework) on the real terrain of the
Karlsberg (Homburg). This document is the contract for feature work (hunt, Chronik, fire, lantern,
dialogue, …): what exists, where it lives, and how to plug a feature in **without editing the core**.

```
pnpm dev            # http://localhost:5280  (?debug for stats + no title)
pnpm test           # vitest unit tests (tests/)
pnpm validate       # content validator (content/**/*.pack.json), exit 1 on errors
pnpm build          # tsc --noEmit && vite build → dist/ (relative base, works on any sub-path)
pnpm e2e            # vite build && playwright (e2e/), screenshots → test-results/screens/
pnpm prepare-data   # rebuild public/data from the sister projects (read-only access)
```

## 1. Folders

| Path | What |
|---|---|
| `src/boot.ts` | Orchestration: renderer, data load, world, player, UI, audio, systems, loop, title, saves, URL flags |
| `src/core/` | Engine core, no three.js: `events` (typed bus), `state` (serialisable GameState + store), `save` (localStorage `kq.*`), `loop` (fixed step), `systems` (registry), `era`, `context` (GameContext type) |
| `src/data/` | Data types, pure decoders, loader for `public/data` |
| `src/world/` | Terrain (chunked, LOD, shader), sky, forest (instanced), palace (glb), collision, atmosphere (shared uniforms + GLSL), era looks |
| `src/player/` | Input (bindings, pointer lock, `simulate`), stances, Player controller |
| `src/render/post.ts` | Post FX: MSAA HDR target, ACES, colour grade, vignette, grain, `uShift/uFlash/uDesaturate` |
| `src/audio/` | `AudioManager` (buses, HRTF 3D sources), `synth.ts` (procedural wind, footsteps, horn, chirp, drone) |
| `src/ui/` | Field-book UI: HUD, modals, title, pause/settings, licences; fonts (OFL) in `src/ui/fonts` |
| `src/i18n/` | `t(key, params)`, German strings in `de.ts`, `addStrings()` for features |
| `src/content/` | Content types, validator, `ContentDB` (all packs bundled via `import.meta.glob`) |
| `src/systems/` | **Feature systems**, one folder each, registered in `src/systems/index.ts` |
| `src/debug/` | `window.kq` hooks, `?debug` stats panel |
| `content/` | Content packs (`*.pack.json`), JSON schema, story bible (`content/bible/`, written separately) |
| `public/data/` | Prepared static data (see §9), committed |
| `scripts/` | `prepare-data.ts`, `validate-content.ts`, `scripts/dev/` screenshot helpers for a running dev server |
| `tests/`, `e2e/` | vitest, Playwright |

## 2. Coordinate frame

Local metres, **x = east**, **y = height (m a.s.l.)**, **z = south**:
`x = E − 381000`, `z = −(N − 5465000)` (ETRS89 / UTM 32N). The playable terrain covers
x 150…2300, z −2150…500 (2 m grid, 1075 × 1325 samples). Yaw: `0 = looking north (−z)`;
debug hooks take degrees with `90 = east`. Palace Corps de logis ≈ (1195, −1095).

## 3. Frame of a tick

`FixedStepLoop` (60 Hz) → `update(dt)`: `player.update` → `systems.update` (registration/dep
order) → player state written to `GameState` → `input.endStep()`. Once per animation frame →
`render`: camera interpolation → `systems.frame` → `world.frame` (LOD, trees, transitions,
shared uniforms) → audio listener → HUD compass → post FX render.

Pause is a stack of reasons (`ctx.pause.push('menu')`); while any reason is active fixed updates
stop but rendering continues. `?manual` stops the real-time simulation entirely; only
`kq.step(n)` advances it (deterministic tests).

## 4. Extension contract: feature systems

```ts
// src/systems/hunt/index.ts
import { defineSystem } from '../../core/systems';

declare module '../../core/state' {
  interface SystemStates { hunt: { alert: number; seen: string[] } }
}
declare module '../../core/events' {
  interface GameEvents { 'hunt:spotted': { by: string; x: number; z: number } }
}

export default defineSystem({
  id: 'hunt',
  after: ['survey'],                      // optional ordering
  init(ctx) {
    const s = ctx.state.slice('hunt', () => ({ alert: 0, seen: [] }));
    ctx.events.on('era:change', ({ to }) => { /* … */ });
  },
  update(dt, ctx) { /* fixed step, gameplay, deterministic */ },
  frame(dt, ctx)  { /* visuals only */ },
  dispose() {},
});
```

…and **one line** in `src/systems/index.ts`: `() => import('./hunt'),`.

Rules
- A system that throws in `init/update/frame` is disabled and logged; the game keeps running.
- Talk to other features through `ctx.events` and `ctx.state`, not by importing each other.
- Persist everything that must survive a reload in your slice (`ctx.state.slice(id, init)`),
  JSON-serialisable only. Call `ctx.save.autosave('reason')` at meaningful moments (throttled 5 s;
  `autosave(reason, true)` forces).
- UI: `ctx.ui.layer('hunt')` gives you an absolutely positioned DOM layer; `ctx.ui.modals.open({...})`
  pauses the game and frees the mouse; `ctx.ui.hud` has the shared slots (below). Strings via
  `ctx.t('key')`; register them with `addStrings('de', {...})` from `src/i18n`.
- Scene objects: add to `ctx.scene`; custom shaders should spread `atmosphere` uniforms and use
  `ATMOS_GLSL` (`kqLight`, `kqFog`, noise) so they match lighting, fog, lantern and fire glow.
- Gameplay input: `ctx.input.wasPressed('listen')`, `isDown('sprint')` (actions in
  `DEFAULT_BINDINGS`: forward/back/left/right, sprint, crouch, prone, fly, up/down, interact,
  listen E, lantern L, map M, measure R, shift Q, scan0–3, journal J/Tab, pause Esc/P).

## 5. GameContext (`ctx`, also `window.kq.ctx`)

| Member | Use |
|---|---|
| `renderer, scene, camera` | three.js objects |
| `post` | `post.uniforms.uShift` (era-shift warp 0..1), `uFlash` (white flash), `uDesaturate` |
| `player` | `position`, `yaw/pitch`, `stance`, `flying`, `stats {noise, visibility, speed, lanternLit, noiseBoost, onSlopeLimit}`, `teleport(x,z,yaw?)`, `setStance`, `setFlying`, `forward()` |
| `input` | actions, `simulate(code, down)`, `enabled`, pointer lock |
| `world` | `heightAt(x,z)`, `surfaceAt` (meadow/forest/water/…), `coverAt`, `bounds()`, `heightfield` (`slopeDeg`, `normalAt`), `collider.footprintAt`, `palace.setMode`, `palace.uniforms.uRuin/uChar`, `setScanMode`, `setScanArea`, `setMapMix`, `forest`, `sky` |
| `data` | `meta`, `heights`, `ground`, `canopy`, `footprints`, `rooms` (114 room polygons), `pois`, `paths` (graph), `attribution` |
| `state` | `GameStateStore`: `.state` (readonly), `.mutable`, `.update(fn, reason)`, `.subscribe`, `.slice(id, init)` |
| `settings` | `SettingsStore` (volume per bus, mouseSensitivity, invertY, fov, subtitleSize, gentleMode, reducedMotion) persisted at `kq.settings.v1` |
| `save` | `save(slot)`, `autosave(reason, force?)`, `load(slot)`, `has`, `delete`; keys `kq.save.v1.<slot>` |
| `events` | `on/once/off/emit/onAny` |
| `audio` | `bus('sfx'|'music'|'ambience')`, `createSource3D(bus, opts)` (HRTF `PannerNode`, null until unlocked), `noise()`, `onUnlock(fn)`, `ctx` (AudioContext or null) |
| `ui` | `hud`, `modals`, `toast(text)`, `layer(id)`, `add(el)` |
| `era` | `current`, `info` (`terrain`, `palace`, `spiritView`, `night`), `set(era)` |
| `content` | `ContentDB`: `facts/nouns/clues/cases/speakers/dialogue/hints` maps, `cluesAt(x,z,era)`, `dialogueFor(event)` |
| `systems, loop, pause` | registry, loop (`time`, `tick`, `step`), pause stack |
| `debug, params, t` | `?debug`, URL params, i18n |

HUD slots (`ctx.ui.hud`): `setMarker(id, bearingDeg|null, color)` (compass markers),
`prompt(key, text, owner?)` (one prompt per owner, the newest shows; clearing yours reveals the
one below: story uses `'story'`, Chronik `'chronik'`), `subtitle(speaker, text, ms, fiction)`, `setThreat(0..1)`,
`setLantern(oil|null, lit)`, `setStatus(text)`, `setStance`, `setEraLabel`, `toast`.

## 6. Events (core)

`game:start {resumed}`, `game:pause {paused}`, `era:change {from,to}` (world already switched),
`scan:mode {mode}`, `player:stance {stance,previous}`, `player:fly {flying}`,
`player:step {x,z,surface,running}`, `player:teleport {x,z}`, `save:written {slot,reason}`,
`save:loaded {slot}`, `settings:change {key}`, `ui:toast {text,ms?}`.
Features add their own via declaration merging (see §4). Naming `<domain>:<what>`.

## 7. Game state (`src/core/state.ts`)

```ts
{ version: 1, era, player: {x,y,z,yaw,pitch,stance,flying},
  flags: Record<string, boolean|number|string>,
  inventory: { clues: string[], nouns: string[], items: string[] },
  codex: { facts: string[] },
  chronik: Record<caseId, { filled, confirmed, readings }>,
  skills: Record<string, number>,
  systems: { [systemId]: slice },
  meta: { playSeconds, savedAt, shifts } }
```
Loading merges onto defaults (new fields appear automatically, extra keys are kept, newer versions
are rejected). Bump `STATE_VERSION` and add a migration in `deserializeState` for structural changes.

## 8. Eras and world look

`ERAS = today | 1789 | 1793-02 | 1793-07 | 1796`. `today` uses the 2025 DTM, all others the
reconstructed 1789 DTM. Palace: hidden today, intact 1789–1793, ruin (stubs, charred) 1796.
Spirit view (F, free flight) only today. Light/sky/fog/grade per era: `src/world/eraPresets.ts`
(night eras use the "sun" slot for the moon; 1793-07 has a fire glow at the palace that lights
terrain, trees and fog via `uGlowColor/uGlowPos`).

Relief scan (`world.setScanMode`): 0 normal, 1 multi-directional hillshade, 2 diverging local
relief (red high / blue low, ±1.2 m), 3 VAT-like (hillshade + slope + openness) with contours.
Drawn inside a bubble (`setScanArea`, the `survey` system keeps it at 160 m around the player;
`?scanall` = everywhere); trees inside the bubble sink away (ground points only). The 1840 map
overlay (`setMapMix`) uses the same lens.

## 9. Data (`public/data`, 8.0 MiB, `pnpm prepare-data`)

Derived by `scripts/prepare-data.ts` from the sister projects (read only; override root with
`KQ_SISTER=/path`). Formats are documented at the top of the script and in `manifest.json`.

| File | Content |
|---|---|
| `terrain/meta.json` | grid (1075 × 1325, 2 m, origin), `hMin`, `heightScale` 0.01, `extentLocal` |
| `terrain/h2025.u16.deflate` | 2025 DTM, uint16 cm, int16 left-delta, zlib (1.4 MB) |
| `terrain/h1789.u16.deflate` | 1789 reconstruction as int16 cm diff to 2025 (57 KB) |
| `terrain/ground.u8.deflate` | 1789 ground classes (meadow, lawn, gravel, cobbles, sand, water, forest, building) |
| `terrain/canopy.u8.deflate` | 2025 canopy height (0.25 m units), LoD2 buildings removed |
| `maps/hist1840.jpg` | Bavarian survey 1836–41 at 2 m/px, aligned to the grid |
| `palace/buildings.glb` | 1789 reconstruction, meshopt (4.5 MB) |
| `palace/footprints.json`, `rooms.json` | 91 footprints (base, eaves, ridge, confidence), 114 room polygons (local frame) |
| `pois.json`, `paths.json` | 44 POIs (16 in area), path graph (3135 nodes, 3161 edges, kinds path/track/road) + water/barrier lines |
| `attribution.json` | licence lines for the licences screen |

## 10. Content packs

`content/**/*.pack.json`, schema `content/schema/pack.schema.json`, types `src/content/types.ts`.
Arrays: `facts` (needs `confidence` D/I/N/U, `fiction` flag, ≥ 1 http(s) source unless fiction),
`nouns`, `clues` (`where {x,z,radius,era}` in local frame, `reveals`, `requires`), `cases`
(entries with `{blank}` text; fact entries need a `correct` noun), `speakers`, `dialogue`
(historical speakers need sources), `hints`. `pnpm validate` fails on: missing source/confidence,
unknown references (nouns, facts, clues, speakers, cases), duplicate ids, clues outside the area,
unreachable clues (require cycles) and **unsolvable cases** (a correct noun not revealed by any
reachable clue). `content/examples/` is placeholder content (`ex.*` ids) showing every field.

The campaign lives in `content/packs/` (prolog, kapitel-1…4, enden, codex, speakers, voices),
transcribed from `content/bible/`. Optional fields used there: `Noun.plural_de` + `Blank.plural`
(plural display), `Blank.labels_de` (per-blank display with article/case), `Blank.alsoCorrect`
(further correct nouns), `CaseEntry.flag` (reading → story flag = chosen noun id or `offen`),
`Clue.echoDate_de` (echo date outside the playable eras; `where.era` = nearest era),
`Clue.needsLantern`, `Clue.chapter` (`p`, `k1` … `k4`). Fact labels and secondary unlocks are
tags (`label:FAKT|STRITTIG|LEGENDE|FIKTION`, `reliefmuster`, `unlock:<when>`). Dialogue
triggers match payload fields by equality; extra keys: `step` (order within a sequence),
`flag` + `value` (story flag condition), `below` (threshold for `lantern:oil`). Custom events:
`npc:talk {npc, chapter, topic}`, `bark:idle`, `bark:enter-fire`, `bark:npc-near {npc, era?}`,
`epilog:line {ending?, block, flag?, value?}`. `tests/content-packs.test.ts` checks the campaign
(playthrough solvability with story flags, decoys obtainable, codex 40 + 8, hints, events,
placement against terrain water and room/footprint polygons). UI texts from the bible are
`ui.*` keys in `src/i18n/de.content.ts`.

## 11. Testing

- Unit (`tests/`): event bus, loop determinism, state/save round trip and throttling, settings,
  system ordering + error isolation, heightfield sampling, decoders (incl. real data), collision,
  forest determinism, validator (good + each failure class), ContentDB.
- E2E per feature (`e2e/{hunt,fx,chronik,story}.spec.ts`) and `e2e/integration.spec.ts`: the
  prologue across all four systems (new game → hub → Chronik → objective → scan → clues → Q →
  shift → echo → pack → caught → station → batch confirmed → Laub's hint), screenshots `int-*.png`.
  `KQ_E2E_PORT` picks the preview port (default 5281; an existing server on it is reused).
- E2E (`e2e/smoke.spec.ts`, Chromium + SwiftShader WebGL): title → "Laterne entzünden" → game
  starts; every era and scan mode render with no console errors / failed requests; walking,
  crouch, spirit view rules and a save round trip.
- Screenshots: `test-results/screens/{title, today-ruin, today-ruin-air, 1789-palace,
  1789-palace-air, 1793-02-night, 1793-07-fire, 1796-ruin, scan1, scan2, scan3, scan1-air,
  map1840}.png`. Look at them after visual changes.
- Debug hooks (`window.kq`, always installed): `teleport(x, z, yawDeg, pitchDeg)`, `setEra`,
  `setScanMode`, `setMapMix`, `step(n)`, `state()`, `press(code, steps)`, `screenshotReady()`.
  URL flags: `debug`, `notitle`, `nosave`, `fresh`, `manual`, `nomsaa`, `preserve`,
  `era=1789`, `x=…&z=…&yaw=…`, `scanall`.
- Running dev server helpers: `VIEWS='[{"name":"a","x":1138,"z":-1120,"yaw":90,"era":"1789"}]'
  node scripts/dev/shots.mjs <outdir>`.

## 12. Feature systems

Registered in `src/systems/index.ts` in this order: `survey`, `footsteps`, `ambience`, `hunt`, `fx`,
`chronik`, `story`, `interiors`, `npc`, `barks`. They talk only through the events in `src/systems/contracts.ts` (plus the
private ones listed below) and `ctx.state`. How the four work together:

```
story ──threat:configure──▶ hunt (pack, lantern seconds)   fx (fire, oblivion)
story ──shift:request─────▶ fx ──shift:begin / era.set + shift:midpoint / shift:done──▶ everyone
hunt, fx ──player:caught──▶ story (curtain, threats off, instant return to today, checkpoint beat)
                            chronik (drops unconfirmed finds unless gentle mode)
story (hub Pinnwand) ──chronik:open──▶ chronik board      chronik ──dialogue:say (laub)──▶ story presenter
chronik ──clue:found / echo:start──▶ fx (pushes the Steinfraß back), story (beat conditions)
story:give ──clue:found / noun:learned (story clue ids, written to state.inventory)──▶ everyone
story ──npc:spawn/despawn──▶ npc ──npc:talk / npc:conversation / bark:npc-near──▶ story, barks
npc, story(grant) ──clue:grant──▶ chronik (discover without a card)
story(meter oil) ──lantern:request──▶ hunt      story(memorial) ──memorial:set──▶ barks
interiors ──room:enter/leave {roomId}──▶ story (room condition), barks (burning rooms, memorial rooms)
barks ──dialogue:say──▶ story presenter
```

Ownership rules that came out of integration:
- **Q (era shift)** belongs to the story: press inside the anchor (`flags shift.allowed/target/x/z/r`,
  no x/z = anywhere), hold 1.2 s in the past to return; ignored while an fx transition runs. fx
  only reads Q itself when no `story` system is registered.
- **Caught screen** belongs to the story. hunt plays its rush and fades to black, then hands over
  at `player:caught` (no title of its own, sequence ends when the story resumes); fx shows its
  smoke/oblivion card only without a story system.
- **The pack lives in one era**: hunt stops on every `era:change` (reason `'era'`); the story
  re-issues `threat:configure` when a beat (or a load / caught resume) wants it again. fx stops
  fire outside 1793-07 and oblivion outside 1796 by itself.
- **Echo lines** (dialogue with trigger `{event:'echo:start'}`) are played by the Chronik; the
  story's trigger runner skips `echo:*` events, and dialogue from `placeholder` packs unless `?placeholder`.
- **Conversations and barks**: `npc:talk` lines are played by the npc system, bark lines
  (`*.bark.*`, `marlene.gen.*`) by the barks system; the story runner speaks them only when that
  system is missing. Trigger matching is shared: `src/content/triggers.ts`.
- **Story presentation runs on game time**: dialogue typing, the choice fuse and the caught curtain
  advance in `update` (headless `kq.step` is deterministic); a modal choice's fuse burns in real time
  while the modal pauses the game. Being carried home (`shift:request {reason:'caught'}`) does not
  count in `meta.shifts`.

### hunt (`src/systems/hunt/`) – die Meute, der Pikeur, the lantern
- Starts only via `threat:configure {kind:'pack'}` (extra fields `hounds?, pikeur?, sight?, seed?`)
  or `kq.hunt.start`; `seconds` sets the lantern burn time. Stops on `active:false`, caught,
  `hub:enter` (also refills oil) and `era:change`. Gentle mode / Rauhnacht (`settings.rauhnacht` or
  `flags.rauhnacht`) retune it.
- Emits `hunt:alert`, `hunt:horn`, `hunt:start`, `hunt:end {reason}`, `lantern:toggle/oil/empty`,
  `player:caught {by:'pack'}` (2.0 s into the caught sequence). Writes `flags.lanternLit` and
  `player.stats.lanternLit`; HUD threat meter, lantern gauge, screen-edge arrows
  (`settings.soundIndicators`), captions (`settings.subtitles`).
- State `systems.hunt {alert, lantern {oil, lit, seconds}, caught}` (an active pack is not saved).
- Hooks `kq.hunt.start/stop/state/setState/place/placeInView/freeze/horn/catch/events/sim`,
  `kq.lantern.toggle/setOil/refill/setSeconds/state`.

### fx (`src/systems/fx/`) – era shift, scan pulse, ambience, fire, Steinfraß
- `shift:request {to, instant?}` → 3.5 s LiDAR transition (1.4 s crossfade in reduced motion,
  none when instant) → `shift:begin`, era switched + `shift:midpoint`, `shift:done`; counts
  `meta.shifts`. `scan:mode` 1–3 → scan pulse. Era particles always.
- `threat:configure {kind:'fire'|'oblivion'}` → fire schedule over the real rooms (`fire:room`,
  `fire:progress`, smoke meter, `flags['fire.hold']` pauses it) / Steinfraß (`oblivion:progress`,
  pushed back by `clue:found`, `echo:start`, `oblivion:remember {amount?}`); full meter →
  `player:caught {by:'fire'|'oblivion'}`. Patches the palace shader at runtime (`palacePatch.ts`),
  adds `uHeat` to `render/post.ts`.
- State `systems.fx {fire, oblivion}` (running threats resume after a load). URL `?fxq=low|high`.
- Hooks `kq.fx.shift/shiftAt/freeze/fire/fireTime/oblivion/oblivionT/pulse/quality/state`.

### chronik (`src/systems/chronik/`) – clues, echoes, case board, codex
- Clue markers + E examine card (`clue:found`, `noun:learned`, `codex:unlocked`); relief clues
  need the right scan mode, lantern clues a lit lantern; hold E on an echo → ghosts + subtitles
  (`echo:start/end`, `echo:play {id}` starts one). Board on J/Tab or `chronik:open`: fill blanks,
  "Prüfen" confirms batches of three only in `today` (`chronik:fill`, `chronik:batch`,
  `chronik:case-complete`, `chronik:opened/closed`). Readings → `state.chronik[case].readings`
  and `flags['reading.<case>.<entry>']`. Laub's hints after 4/8/12 min stuck → `dialogue:say`
  (speaker `laub`; plain subtitle only when no story/dialogue system exists). On `player:caught`
  drops finds since the last confirmation (`chronik:lost`), not in gentle mode.
- Uses real packs; placeholder packs (`content/test/chronik-test.pack.json`, `ct.*`) only when no
  real content exists or with `?placeholder`.
- State `state.chronik`, `state.inventory`, `state.codex` + `systems.chronik {since, hints, marks,
  seen, echoes, lastCase}`.
- Hooks `kq.chronik.open/close/tab/grantAll/fill/check/solve/examine/listen/skipEcho/advanceEcho/
  echo/status/target/markers/caught/stuck/slice/content/isOpen`.

### story (`src/systems/story/`) – chapters, dialogue, field station, objectives, endings
- Data in `content/story/*.story.json` (schema notes: `content/story/README.md`, checked by
  `pnpm validate`): chapters → beats with conditions, actions, delays, checkpoints. Prologue and
  endings are scripted from the bible; chapters 1–4 are placeholder skeletons.
- Emits `story:chapter/beat/ending`, `objective:set`, `threat:configure`, `shift:request`,
  `dialogue:say`, `hub:enter/leave`, `chronik:open`, and private `hub:use {item}`,
  `story:cue {id,data?}`, `story:credits`. Presents every `dialogue:say` (portrait card, typing,
  murmur voice) and ContentDB dialogue triggers. Owns the title flow (warning, name, lantern),
  the field station at (760, −915) with the hub overlay, the Bussole/objective HUD, the caught
  curtain + return, endings, epilogue and credits. Without fx it switches eras directly.
- State `systems.story` (`StorySlice`: chapter, beat, timers, latches, said lines, objective,
  threats, look, ending, …), autosaved at every beat. URL `?story&name=…` starts the prologue.
- Round 2: conditions `room`, `talked`, `reading`, `meter`, `chosen`, `chapterTimer`; actions `npc`,
  `meter` (oil / smoke / vergessen / custom gauges, `lossless` → `flags['chronik.noLoss']`), `echo`,
  `memorial`, `readings`, `grant`, `say.text_by_era`, choices with `modal:false` + `when` / `key` /
  `then` (`choice.<id>` flags, `story:choice`). Mirrors `CaseEntry.flag` on `chronik:fill`. Epilogue
  assembled from the endings pack's `epilog:line` blocks. Test chapters (`"test": true`) load only
  with `?storytest`. Closing the Chronik opened from the Pinnwand reopens the hub.
- Hooks `kq.story.goto/state/skip/start/say/finishTyping/flush/caught/hub/ending/credits/
  epilogue/choose/look/meters/meter/room/choice`.

### npc (`src/systems/npc/`) – ghostly people, conversations
- `npc:spawn {npc, x, z, era?, yaw?, chapter?, topics?, mood?}` / `npc:despawn {npc}` (story `npc`
  action). A figure: merged capsules/cones, two shader passes (sepia smoke body with screen-space
  hatching that writes depth, additive fresnel glow), idle motion per body part, feet dissolving
  into smoke, motes, a light pool; warm amber for Hanne, cold flicker for the others, era tint;
  visible only in its era; turns towards the player. Reduced motion calms it.
- E within 2.8 m → conversation (modal page at the bottom; typing on the UI clock; keys 1–n,
  E/Enter/Space advance): `greet`, topics from the pack's `npc:talk` lines, `bye`. Emits `npc:talk`,
  `npc:conversation`, `bark:npc-near`, `clue:grant` (first talk), flags `talked.*`, `npc.owns.<clue>`.
- State `systems.npc {placed, said}`. Hooks `kq.npc.list/spawn/despawn/talk/ask/advance/finish/drain/close/state`.

### barks (`src/systems/barks/`) – Laub's and Marlene's remarks
- Rules (`rules.ts`, bible 08-stimmen): random line per group, same line not within 600 s, one bark
  per 45 s, groups answering the same event take turns; quiet during echoes, dialogue, conversations,
  modals, the curtain, a chapter's first 12 s, at memorials (Rondell built in, `memorial:set`,
  `flags['barks.quiet']`). Requests wait 8 s for a quiet moment.
- Emits `bark:idle` (60 s without input), `bark:enter-fire`, `dialogue:say`.
- State `systems.barks {t, mem, memorials}`. Hooks `kq.barks.state/advance/reset`.

### interiors (`src/systems/interiors/`) – walkable palace rooms
- Rooms of the footprints marked `interior: 'detailed'` (KB-B01…B06, B10) from
  `public/data/palace/rooms.json`. `layout.ts` (pure, unit-tested) turns the catalogue quads into a
  plan per palace state (`intact` 1789–1793, `ruin` 1796, `today`): doors between facing rooms
  and into neighbouring wings, entrances (model door leaves, carriage passages, vestibules, garden
  doors) with outdoor steps to the terrain, windows where the model has glass, stair ramps
  (straight / dog-leg / imperial) in the halls of KB-B01 and KB-B04 whose upper floors are walkable
  (Festsaal, Naturalienkabinett), ruin stubs, height-aware collision walls and floor zones.
- `builder.ts` + `props.ts`: one mesh (single draw call, `material.ts` procedural finishes, baked
  window light `lightmap.ts`, nearest 12 candles/chandeliers) per building and era, built within
  60 m of the player, dropped beyond 85 m. 1789 candle-lit; 1793-02 dark, dust sheets, one candle
  in the Kabinett; 1793-07 looted (bible ch. 3) and burning; 1796 broken masonry, rubble, open
  sky; today low mossy foundations only (no collision).
- Shell (`shell.ts`, runtime patch of the palace shader like fx): glass of built buildings cut
  away, door boxes cut through the facade, other model parts poking into a built room clipped,
  the ruin shell dissolved into the interior's own stubs.
- World hooks (additive): `world.collider.overlay` (detailed footprints become passable, the plan's
  walls take over, also in the ruin era), `world.groundOverride` (floors, stairs, steps; the
  player's height picks the storey) and `world.surfaceOverride` (footsteps on parquet / stone).
- Fire: `fire:room {roomId, state}` (room or building id) → smoke layer under the ceiling, flames,
  embers, flames and smoke through the doors; `collapsed` → ceiling gone, debris, doors blocked
  once the player is out (caption for the sound). Cleared on `threat:configure {fire, active:false}`
  and era change. Gentle mode thins the smoke; reduced motion slows flames and stops flicker.
- Emits `room:enter {roomId, building, id, name}` / `room:leave` (contracts.ts), mirrors them in
  `flags['interior.room']` / `flags['interior.building']`; story condition `{ "room": "<id>" }`.
  Room names as a toast with `skills.baumeister ≥ 1`, `?debug` or `?rooms`.
- Hooks `kq.interiors.list/enter/doors/room/build/fire/state/floorAt`.

## 13. Licences

Code: project licence. Fonts: IM Fell English (Igino Marini) and Caveat, SIL OFL 1.1 (texts in
`src/ui/fonts`). Data: © GeoBasis-DE/LVGL-SL dl-de/by-2-0 (DTM, CHM, historic maps), OSM ODbL,
palace reconstruction from the sister project; all listed in-game under „Lizenzen & Quellen“.
