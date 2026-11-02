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

Forest (`src/world/forest.ts`, procedural, no assets): 3 species (beech, spruce, oak — oak picked
by a second noise in `generateTrees`) × 3 LODs = at most 9 instanced batches
(`trees-<species>-<near|mid|far>`) sharing one ShaderMaterial. Near (< 60 m) and mid (< 180 m,
scaled by tree height) are built meshes (bark tubes with root flare, limbs, leaf cards with
spherical shading normals; spruce whorls of needle cards around a core cone); far is a
camera-facing impostor quad whose silhouette and fake normal come from the shader. Attributes
`aPart` (0 bark, 1 leaf, 2 needle, 4 core, 5 impostor) and `aEx` (seed, ao, upness); `aInst/aVar`
stay for the point-cloud and `forestClear.ts` patches. Seasons per era in the shader: summer 1789,
autumn today, bare frosted twigs and snow 1793-02, sparse 1796 (`leafDensity`, `twigShow`).
`forest.stats` = `{near, mid, far, total, drawCalls}` (debug panel shows them).

Relief scan (`world.setScanMode`): 0 normal, 1 multi-directional hillshade, 2 diverging local
relief (red high / blue low, ±1.2 m), 3 VAT-like (hillshade + slope + openness) with contours.
Drawn inside a bubble (`setScanArea`, the `survey` system keeps it at 160 m around the player;
`?scanall` = everywhere); trees inside the bubble sink away (ground points only). The 1840 map
overlay (`setMapMix`) uses the same lens; the survey system swaps the 1935–40 Messtischblatt into
the same `uMap` uniform (M cycles off → 1840 → 1935 → off, gated by the Kartograf skill).

## 9. Data (`public/data`, 12.3 MiB, `pnpm prepare-data`)

Derived by `scripts/prepare-data.ts` from the sister projects (read only; override root with
`KQ_SISTER=/path`). Formats are documented at the top of the script and in `manifest.json`.

| File | Content |
|---|---|
| `terrain/meta.json` | grid (1075 × 1325, 2 m, origin), `hMin`, `heightScale` 0.01, `extentLocal` |
| `terrain/h2025.u16.deflate` | 2025 DTM, uint16 cm, int16 left-delta, zlib (1.4 MB) |
| `terrain/h1789.u16.deflate` | 1789 reconstruction as int16 cm diff to 2025 (revised sister DTM, 1.0 MB) |
| `terrain/ground.u8.deflate` | 1789 ground classes 0–12 (meadow, lawn, gravel, cobbles, sand, water, forest, building, field, vineyard, kitchen garden, hay, parterre sand; `GROUND` / `GROUND_NAMES` in `src/data/types.ts` map 8–12 onto meadow / lawn / sand surfaces) |
| `terrain/canopy.u8.deflate` | 2025 canopy height (0.25 m units), LoD2 buildings removed |
| `maps/hist1840.jpg` | Bavarian survey 1836–41 at 2 m/px, aligned to the grid |
| `maps/hist1935.jpg` | Messtischblatt / TK25 1935–40 at 2 m/px (sister `hist_1935` chunks, 1 m/px AOI first), `meta.hist1935` |
| `pointcloud/ground.kqp.deflate` | Röntgenblick: 2025 ALS ground/bridge/water points (classes 2/6/9/24, ≈ 1.03 M, 2.6 MB) in 20 m cells; format `kq-pts-v1` in `meta.pointcloud` and `src/systems/tools/xrayData.ts` (u32 cell offsets, u16 dx/dz 2 cm, i8 residual 2 cm over the 2025 DTM, u8 class) |
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
- Art polish (`e2e/polish-art.spec.ts`): ghost costumes by day / night, forest LOD stats and the
  eras' seasons, the Festsaal on arrival (heat) and burning, hounds in fog at 30–60 m; screenshots
  `pol-art-*.png`.
- E2E per feature (`e2e/{hunt,hunt-ext,fx,chronik,story,interiors,npc,skills}.spec.ts`) and `e2e/integration.spec.ts`: the
  prologue across all four systems (new game → hub → Chronik → objective → scan → clues → Q →
  shift → echo → pack → caught → station → batch confirmed → Laub's hint), screenshots `int-*.png`;
  and the round-2 tour over the test chapter's beats r1–r4 (`?storytest`): doorway into the
  Festsaal 1789 → story `room` condition → a ghost on the upper storey, E → conversation →
  `skill` action (Kartograf 3 card) → measuring the gallery in 1793-07 (`measure:done`, the
  Chronik's measuring clue) → the story's pack in 1793-02 leaving snow tracks
  (`int-r2-*.png`). Unit rules of the integration: `tests/integration-round2.test.ts`.
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

Registered in `src/systems/index.ts` in this order: `survey`, `footsteps`, `ambience`, `hunt`,
`menagerie`, `fx`, `chronik`, `story`, `interiors`, `npc`, `barks`, `skills`, `tools`. They talk only through the events in `src/systems/contracts.ts` (plus the
private ones listed below), `ctx.state` and a few additive world hooks. How they work together:

```
story ──threat:configure──▶ hunt (pack, lantern seconds)   fx (fire, oblivion)
story ──shift:request─────▶ fx ──shift:begin / era.set + shift:midpoint / shift:done──▶ everyone
hunt, fx ──player:caught──▶ story (curtain, threats off, instant return to today, checkpoint beat)
                            chronik (drops unconfirmed finds unless gentle mode or {soft:true})
story ──menagerie:spawn / story:cue 'menagerie:spawn'──▶ menagerie (escaped animals, per era)
story (hub Pinnwand) ──chronik:open──▶ chronik board      chronik ──dialogue:say (laub)──▶ story presenter
chronik ──clue:found / echo:start──▶ fx (pushes the Steinfraß back), story (beat conditions)
story:give ──clue:found / noun:learned (story clue ids, written to state.inventory)──▶ everyone
story ──npc:spawn/despawn──▶ npc ──npc:talk / npc:conversation / bark:npc-near──▶ story, barks
npc, story(grant) ──clue:grant──▶ chronik (discover without a card)
story(meter oil) ──lantern:request──▶ hunt      story(memorial) ──memorial:set──▶ barks
interiors ──room:enter/leave {roomId, building, id}──▶ story (room condition), barks (burning rooms, memorial rooms)
fx ──fire:room {roomId: full id | building}──▶ interiors (smoke, flames, collapse), barks
barks ──dialogue:say──▶ story presenter
story(skill) ──state.skills──▶ skills ──skill:unlocked──▶ anyone     story/chronik ──skill:grant──▶ skills
tools ──measure:done {building?, room?}──▶ story (event condition), chronik (measuring clues)
interiors ──world.groundOverride / roomAnchor──▶ player, npc, chronik markers (storeys)
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

Round-2 integration rules:
- **Room ids**: catalogue id `B01.2.og-festsaal` (interiors `room:enter.roomId`, flag
  `interior.room`, measure `room`), full id `KB-B01/B01.2.og-festsaal` (fx `fire:room`, rooms.json
  `id`) and building `KB-B01`. Every consumer (story `room` condition, npc `room`, barks memorials
  and burning rooms, the Chronik's measuring clues) accepts all three; the validator checks the format.
- **Storeys**: `world.heightAt(x, z, yHint?)`. Without a hint the interiors answer the player's
  storey near the player and clue-anchor rooms / the ground floor elsewhere; things that know their
  storey pass a hint (NPCs placed in a room keep `y` from `world.roomAnchor(id)`). NPC talk needs
  the same storey (|Δy| < 2.4 m) as well as 2.8 m.
- **Fire**: fx owns the schedule and the smoke meter; interiors only draw what `fire:room` says and
  clear on `threat:configure {fire, active:false}` / era change. A fire resumed from a save during
  init is re-announced at `game:start` (`fire.replay()`), so the interiors catch up.
- **Caught softly**: `player:caught {soft:true}` (drive) and the story's lossless meters
  (`flags['chronik.noLoss']`) both show the bible's `ui.homed.*` curtain and lose nothing.
- **Skills**: the story's `skill` action writes `state.skills`; the skills system shows the card
  (the action's `toast` is only used without a skills system). Measuring clues (`requires.skill
  'kartograf:3'`, e.g. `clue.k3.messen`) are found by a `measure:done` on their anchor room /
  building or inside their radius in their era (card after 1.2 s).
- **Horn lines**: `hunt:horn` carries the pack `mode`; Laub's "Die Jagd beginnt" answers only
  patrol / par force horns (the drive's horn is the beaters' horn from behind).
- **Keys** (`DEFAULT_BINDINGS`, unit-tested for clashes): R measure, V / 4 Röntgenblick, B plans,
  M maps, 0–3 relief, E listen / talk / examine, L lantern, Q shift, J / Tab Chronik, X prone,
  C crouch (and down while flying — the only shared code). Number keys inside a modal choice or a
  conversation are captured by that card and never reach relief / Röntgenblick.
- **Data**: `public/data` is regenerated by `pnpm prepare-data` (sister data read only); 1789 land
  cover now has classes 8–12, mapped onto meadow / lawn / sand surfaces in `GROUND_NAMES`.

Round-3 (campaign) integration rules:
- **Chapter hand-over**: entering a new chapter (not a resume) cancels the previous chapter's
  delayed actions, clears the dialogue queue and the objective and stands the player up; the new
  chapter's first beat sets its own. Lines meant for the next chapter belong in that chapter's file.
- **Overlapping clues**: the Chronik's E target ranks the running chapter's clues (`clue.chapter`,
  `p` for the prologue) before any other chapter's, so a missed earlier echo (e.g. `echo.p.diener`
  on the Ehrenhof) never takes E from, or blocks the auto-start of, the current one.
- **Return blocked**: holding Q in the past is refused while the pack chases (`hunt:alert` state
  `chasing`) or the alert is ≥ 0.8 (one check, one throttled toast).
- **Saves**: `deserializeState` lets a `null` default take the saved value (`meta.savedAt`), so
  "Fortsetzen" reports `game:start {resumed:true}` and the story re-enters the saved beat.
- **Tests**: each chapter's playthrough lives in `e2e/helpers/<chapter>.ts` (`play…(page, {shots,
  at})`); the chapter specs boot a chapter directly, `e2e/campaign.spec.ts` chains them from the
  title screen (with a save / reload / continue in chapter 1) and keeps each chapter's starting save
  in `test-results/campaign-saves/` (`CAMPAIGN_FROM=k2` resumes there).

### hunt (`src/systems/hunt/`) – die Meute, der Pikeur, the lantern
- Starts only via `threat:configure {kind:'pack'}` (extra fields, declared by declaration merging in
  `hunt/index.ts`: `hounds?, pikeur?, sight?, seed?, mode?, target?, via?, from?, headStart?,
  goalRadius?, snow?`) or `kq.hunt.start`; `seconds` sets the lantern burn time. The story passes
  every ThreatConfig field through (`threat` action). Stops on `active:false`, caught, `hub:enter`
  (also refills oil), `era:change` and a par force escape. Gentle mode / Rauhnacht
  (`settings.rauhnacht` or `flags.rauhnacht`) retune it. Re-configuring the same area with another
  `mode` switches the running pack in place (drive → finale at the kennel: they stay where they are).
- **Modes** (`modes.ts`, pure): `patrol` (default); `drive` (Ch. 4: arc of hounds 12–20 m behind and
  beside the player, horn from behind / a flank, they give 5 m when you turn back, pushing through
  = soft catch `player:caught {by:'pack', soft:true}`, story curtain "Die Meute hat dich
  heimgebracht", chronik loses nothing); `finale` (W8 at the kennel: 6 m circle, X + L in any order,
  one key — `settings.oneKey` or gentle — X alone; hounds lie down, eyes dim, mist settles, they and
  the Pikeur fade; > 10 m away = faded back into the circle; emits contract event
  `hunt:finale {outcome: gathered|returned|calmed|faded}`); `parforce` (Ch. 2 long chase from `from`
  to `target`/water: release horn + head start, surges with a rubber-banded pack, breathers
  `hunt:rest`, the Pikeur riding in from a flank, `hunt:goal` → `hunt:end {reason:'escaped'}`;
  fairness checked by simulated runs in `tests/hunt-ext.test.ts`).
- **Snow tracks** (`tracks.ts`, `trackVisuals.ts`; 1793-02 or a snowy look, `snow` overrides): boot
  prints on every `player:step`, paw / hoof prints of the pack, instanced decals that fade over
  240 s. Your trail breaks on water, cobbles / building floors, today's roads and steep rock; the
  pack follows it print by print (`hunt:tracking {on, why?}`, horn found / lost) but never across a
  break. Crouching / standing over the pack's prints reads them (Spurenleser: kind, number,
  rider, age, direction; tier 2 highlights their routes) → caption + `hunt:read`.
- Emits `hunt:alert`, `hunt:horn {signal, x, z, mode}`, `hunt:finale`, `hunt:start`, `hunt:end {reason}`,
  `hunt:tracking`, `hunt:goal`, `hunt:rest`, `hunt:read`, `lantern:toggle/oil/empty`,
  `player:caught {by:'pack', soft?}` (2.0 s into the caught sequence). Writes `flags.lanternLit`
  and `player.stats.lanternLit`; HUD threat meter, lantern gauge, screen-edge arrows
  (`settings.soundIndicators`), captions (`settings.subtitles`).
- State `systems.hunt {alert, lantern {oil, lit, seconds}, caught, pack}`: `pack {era, opts}` is the
  active pack configuration; it comes back after a load in the same era (a story re-configure wins).
- Visuals (`visuals.ts`, `PackVisuals`): bodies of sorted fbm smoke billboards; ember eyes as
  additive sprites with a minimum on-screen size that pierce the fog. Readable in fog at 30–60 m:
  the body keeps most of its dark silhouette out to ~55 m before sinking into the distance fog, a
  fog-lit rim frays the edge of each puff, pale breath vapour puffs from the muzzle on every
  exhale (faster on the run), and the ground mist is its own pool drawn before the pack so the
  hounds stand out of the fog bank.
- Hooks `kq.hunt.start/stop/state/setState/place/placeInView/freeze/horn/catch/events/sim/
  configure/tracks/walkPrints/readTracks/mode/saved`, `kq.lantern.toggle/setOil/refill/setSeconds/state`.

### menagerie (`src/systems/menagerie/`) – the escaped animals (1789, 1793-07)
- Spawned by `menagerie:spawn {animal: cassowary|dromedary|jaguar, x, z, id?, heading?, count?}`
  (contract) or story `{"do":"cue","id":"menagerie:spawn","data":{…}}`; `menagerie:clear {id?}` /
  cue `menagerie:clear`. An animal belongs to the era it was spawned in. Suggested places in
  `MENAGERIE_PLACES` (Kasuar 1966/92 at the amphitheatre, dromedaries on the Karlsbergweiher dam,
  jaguar at the Holländische Gärtnerei).
- Pure behaviour in `logic.ts`: cassowary notices → booms → display → charges (slow turn rate, a
  side-step makes it miss) ≤ 3 times → bored (26 s); a hit = knockdown. Dromedaries stand across the
  path (solid), grumble when shoved, amble aside after ~14 s of calm waiting (`menagerie:yield`).
  Jaguar circles outside the lantern light, creeps in when it's dark, shoves you over, retreats;
  light drives it off. No catching: a knockdown freezes you prone for 1.8–3.2 s (view tips to the
  sky; reduced motion: no roll) → `menagerie:knockdown`. Gentle: slower, shorter, the jaguar never shoves.
- Procedural low-poly rigs (`models.ts`, kqLight / kqFog), eyeshine sprites, Web Audio calls with captions.
- State `systems.menagerie {animals: [{animal, x, z, id, heading?, count?, era}]}`.
- Hooks `kq.menagerie.spawn/spawnInView/clear/state/down/setState/place/freeze/events/places`.
- Example beats (test only, not loaded): `content/test/hunt-menagerie.test.story.json`.

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

### skills (`src/systems/skills/`) – Relief-Blick, Kartograf, Baumeister, Röntgenblick, Spurenleser
- Levels in `state.skills[id]` (never lowered). Ids and tiers (rules: `logic.ts`, pure + tested):
  `relief` 1–3 (scan modes 1–3) · `kartograf` 1 map 1840, 2 map 1935, 3 Messen (R) ·
  `baumeister` 1 Planblatt (B) + room names in memories, 2 Konfidenzansicht, 3 Raumfolge ·
  `roentgen` 1 Röntgenblick (V / 4) · `spurenleser` 1 horn captions say what the call means,
  2 pack routes. Aliases (`kartograph`, `xray`, `tracker`, …) and specs `'kartograf:3'` / `'kartograf3'`.
- Raise a skill: story action `{do:'skill', id, tier}` or event `skill:grant {skill, level, quiet?}`.
  Every increase (except load/new game and quiet grants) shows the unlock card (brass medal,
  tier pips, "Freigeschaltet" stamp, `data-testid=skill-card`), plays the stamp chime, emits
  `skill:unlocked {skill, level}` and lets Laub comment (`dialogue:say`, `skills.laub.<id>.<n>`)
  once `flags['story.laub']` is set (or without a running story). Cards wait while a modal or a
  story card is open.
- **Free survey**: without a running story (sandbox, `?notitle` tests) every tool is open;
  `?skills=strict` forces gating, `?skills=all` opens everything. Locked keys leave a toast.
- Also owns the extra settings rows (Rauhnacht, Geräusch-Untertitel, Richtungspfeile, Grafik
  niedrig/hoch → pixel ratio 1, fx quality low, sparser point cloud) and key-help rows.
- Hooks `kq.skills.grant/all/reset/levels/gate/free/card/said`.

### tools (`src/systems/tools/`) – Messen, Röntgenblick, Planblatt, Fährtenlinien
- **R Messen** (Kartograf 3): click A, click B (crosshair; picks terrain, the palace per building
  with the ruin cut, any mesh with `userData.measurable`). Tape + poles + field-book sheet with
  distance, horizontal, rise, grade and terrain height profile (`measure-*` testids). On B:
  `measure:done {a, b, distance, horizontal, rise, building?, room?}` and
  `flags['measured.<building>'] = distance`. Gallery KB-B06 reads ≈ 78–83 m from the model.
- **V / 4 Röntgenblick** (Röntgenblick 1): the 2025 ground points within 70 m (52 m on low
  graphics), height-ramped glow, trees fade in the disc (forest shader patch `forestClear.ts`);
  a fictional paw trail Ehrenhof → Zwinger is labelled as fiction on screen.
- **B Planblatt / Konfidenz** (Baumeister): footprints as chalk lines on the ground of every era
  (a faint second pass shows them through canopy and roofs), building labels (decluttered),
  low confidence dashed; the confidence view colours the palace Okabe-Ito (high #009E73,
  medium #E69F00, low #CC79A7 striped) and shows it as a ghost where the era has none.
- **Fährtenlinien** (Spurenleser 2): leader route and hound trails while a pack runs, read through
  the duck-typed accessor `window.kq.hunt.sim()` (no import of the hunt system).
- Shift suspends the plan sheet; `game:start` resets the tools.
- Hooks `kq.tools.measure.{start,stop,click,at,pick,state}`, `kq.tools.xray(on)`,
  `kq.tools.plans(view)`, `kq.tools.tracks(on)`, `kq.tools.state()`; `kq.survey.map(0|1840|1935)`.
- Keys: R measure, V / 4 Röntgenblick, B plans, M maps, 0–3 relief (all listed on the controls page).

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
- `npc:spawn {npc, x, z, era?, yaw?, chapter?, topics?, mood?, room?, y?}` / `npc:despawn {npc}`
  (story `npc` action). `room` places the ghost in a palace room on that room's storey (centre
  unless x/z are given); spawned at the player it keeps the player's storey. A figure
  (`figure.ts`): a period costume from the roster's `look` (`roster.ts`: `outfit` maid / official /
  livery / carter / mason, `hat` tricorn / huntcap / mobcap / slouch, `hair` wig / queue / short,
  `prop`, `tint`, `seed`) built from lathe-revolved skirts and coats, tubes and capsules, merged
  into one geometry (`aPart` head/torso/arms/legs/hat/prop/skirts, `aPivot`, `aShade`). One
  premultiplied ShaderMaterial plus a depth-only prepass sharing its uniforms (`uPrepass`):
  fresnel rim, flowing bands, a blank face with dark eye hollows, the lower body dissolving into
  mist, an occasional slice glitch, skirt swing; around the feet 9 camera-facing mist puffs (thin
  out near the camera) and motes. Warm amber for Hanne, cold flicker for the others, era tint;
  visible only in its era; turns towards the player. Reduced motion calms it.
- E within 2.8 m → conversation (modal page at the bottom; typing on the UI clock; keys 1–n,
  E/Enter/Space advance): `greet`, topics from the pack's `npc:talk` lines, `bye`. Emits `npc:talk`,
  `npc:conversation`, `bark:npc-near`, `clue:grant` (first talk), flags `talked.*`, `npc.owns.<clue>`.
- State `systems.npc {placed, said}`. Hooks `kq.npc.list/spawn/despawn/talk/ask/advance/finish/drain/close/state`.

### barks (`src/systems/barks/`) – Laub's and Marlene's remarks
- Rules (`rules.ts`, bible 08-stimmen): random line per group, same line not within 600 s, one bark
  per 45 s, groups answering the same event take turns; quiet during echoes, dialogue, conversations,
  modals, the curtain, a chapter's first 12 s, at memorials (Rondell built in, `memorial:set`,
  `flags['barks.quiet']`). Requests wait 8 s for a quiet moment. `flags['laub.silent']` (the
  prologue before the compass first speaks at the Orangerie) mutes Laub's barks and the Chronik's
  hint ladder (its clock waits).
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
  player's height — or the caller's `yHint` — picks the storey), `world.surfaceOverride` (footsteps
  on parquet / stone) and `world.roomAnchor(id)` (centre + floor of a room, for NPCs).
- Fire: `fire:room {roomId, state}` (room or building id) → smoke layer under the ceiling, flames,
  embers, flames and smoke through the doors. Burning rooms: flame tongues licking up wall
  surfaces (plaster, panelling, damask, curtains), rolling sheets of flame on the ceiling, charred
  joists glowing in thin cracks (looted 1793-07 rooms, `aux.w = 7`, drawn only while burning),
  falling embers, smoke puffs lit from below (`flames.ts`), the 4 nearest fire tongues as point
  lights ahead of the candles. Rooms of a burning building that are not burning yet get *heat*
  (`uRoomHeat`; more when a lower storey burns): glowing floor cracks, an orange underlight and
  smoke creeping in slowly — the Festsaal already threatens on arrival. The player's room drives
  the post heat shimmer (`ctx.post.uniforms.uHeat`). Per-room uniforms `uRoomFire/Smoke/Heat/Floor`.
  `collapsed` → ceiling gone, debris, doors blocked once the player is out (caption for the sound). Cleared on `threat:configure {fire, active:false}`
  and era change. Gentle mode thins the smoke; reduced motion slows flames and stops flicker.
- Emits `room:enter {roomId, building, id, name}` / `room:leave` (contracts.ts), mirrors them in
  `flags['interior.room']` / `flags['interior.building']`; story condition `{ "room": "<id>" }`.
  Room names as a toast with `skills.baumeister ≥ 1`, `?debug` or `?rooms`.
- Hooks `kq.interiors.list/enter/doors/room/build/fire/state/floorAt`.

### How to wire a chapter (story files, round 3)

A chapter is one `content/story/<nn>-<id>.story.json` (schema: `content/story/README.md`, checked
by `pnpm validate`; `"test": true` files load only with `?storytest`). Beats run `enter` actions,
wait for `complete`, run `exit`, go to `next`; `on` reactions fire inside a beat or chapter-wide.
Lines come from the content packs by trigger, or from `say` actions. Worked examples:
`content/story/99-test.story.json` (t1–t6 story features, r1–r4 the round-2 tour in
`e2e/integration.spec.ts`), `content/test/hunt-menagerie.test.story.json`,
`content/test/interiors-test.story.json`.

**Conditions** (one key per object; event-like ones latch while the beat runs):

| Condition | True when | Typical use |
| --- | --- | --- |
| `enter {x,z,r,era?}` / `leave {x,z,r}` | inside / outside a circle | reach a place |
| `event` + `match` / `gte` / `lte` / `times` | any event with that payload happened | see the event list below |
| `flag` (+ `eq`) | a flag is truthy / equals | `measured.KB-B06`, `interior.room`, `choice.*`, `flag.k3_objekt` |
| `timer` / `chapterTimer` | seconds in the beat / chapter (game time) | pacing |
| `era`, `scan` (≥), `map`, `stance`, `lantern` | world / player state | `{stance:'prone'}`, `{lantern:true}` |
| `have {clue\|noun\|item}`, `confirmed {case?\|prefix?, n}`, `caseComplete` | inventory, Chronik | gates on findings |
| `hub` | a field-station item was used | Pinnwand, map table |
| `room` | in a palace room: `"B01.2.og-festsaal"`, `"KB-B01/B01.2.og-festsaal"` or `"KB-B01"` | interiors objectives |
| `talked {npc, chapter?, topic?}` | an NPC conversation / topic happened | after a ghost |
| `reading` (+ `eq`) | a reading was chosen (entry flag or entry id) | branch on LESARTEN |
| `meter {id, gte?\|lte?\|full?}` | a story meter's value | oil, smoke, Atem |
| `chosen` (+ `option`) | a choice was answered | k2 gate, k3 object |
| `all`, `any`, `not`, `manual` | combinations / never | |

**Actions** (`delay` seconds; `onResume` repeats on resume — one-shots: say, shift, teleport,
card, sound, toast, cue, chronik, ending, echo, grant):

| Action | Fields | Effect |
| --- | --- | --- |
| `say` | `id?, speaker, text \| line, text_by_era?, ms?, echo?, repeat?` | spoken line; `{Name}`, `{jahre:1793}`, `{jahr}` |
| `objective` | `text \| null, x?, z?, id?` | objective + Bussole |
| `threat` | `kind: pack \| fire \| oblivion, active, intensity?, center?, radius?, seconds?` + pack `mode` (patrol / drive / finale / parforce), `target`, `via`, `from`, `headStart`, `goalRadius`, `snow`, `hounds`, `pikeur`, `sight`, `seed` | hunt / fx threats |
| `flag` | `set {k: v \| null}` | flags |
| `shift` / `anchor` | `to, instant?, reason?` / `to \| null, x, z, r` | era shift now / Q allowed here |
| `skill` | `id: relief \| kartograf \| baumeister \| roentgen \| spurenleser, tier` | unlock card (+ Laub once `story.laub`) |
| `give` / `grant` | `clue \| noun \| item, kind?, toast?` / `clue, card?` | inventory (no nouns!) / Chronik discovery (nouns, facts); `card: true` shows the field-book card (on top of the hub) |
| `npc` | `op: spawn \| despawn, npc (hanne, jost, soll, … \| *), x?, z?, room?, era?, yaw?, chapter?, topics?, mood?` | ghost + conversation from pack `npc:talk` lines |
| `meter` | `id: oil \| smoke \| vergessen \| <custom>, active, seconds?, label?, full?: return \| caught \| none, text?, lossless?, still?, intensity?, center?, radius?` | timers on game time |
| `echo` | `id` | play a Chronik echo |
| `memorial` | `id, active?, x?, z?, r?, era?, room?` | no barks there |
| `readings` | `fill: "offen", cases?` | fill empty readings |
| `choice` | `id, prompt, options [{label, key?, set, when?, then?}], seconds?, fallback?, modal?, note?` | modal card or inline (`when`) |
| `cue` | `id, data?` (`menagerie:spawn {animal, x, z, id?, heading?, count?}`, `menagerie:clear {id?}`) | set pieces, animals |
| `toast`, `card`, `teleport`, `look`, `prompt`, `sound` | as in the README | presentation |
| `chronik`, `unlock`, `ending`, `autosave` | | board, map table, endings, save |

**Events worth waiting for** (`{ "event": …, "match": {…} }`): `room:enter {roomId, building, id}`,
`npc:talk {npc, topic}`, `measure:done {building, room}`, `skill:unlocked {skill, level}`,
`hunt:goal {mode}`, `hunt:finale {outcome}`, `hunt:tracking {on, why}`, `hunt:read`,
`player:caught {by, soft}`, `menagerie:seen / knockdown / yield {id}`, `clue:found {id}`,
`echo:end {id}`, `chronik:batch`, `chronik:case-complete {caseId}`, `fire:room {roomId, state}`,
`story:choice {id, option}`, `story:meter-full {id}`, `bark:idle`.

**Recipes**
- *Into a room*: `{ "complete": { "room": "B01.2.og-festsaal" } }`. Walkable entries: Registratur
  (B03), Pfeilersaal (B10), Kabinett (B01 EG), Waffensammlung, Bildergalerie, Tempelzimmer; the
  Festsaal via vestibule + Prunktreppe, the Naturalienkabinett via B04's north stair. 1796: ground
  floors only.
- *A ghost in a room*: `{ "do": "npc", "op": "spawn", "npc": "hanne", "room": "B01.2.og-festsaal",
  "era": "1789", "chapter": "k1" }` → `{ "talked": { "npc": "hanne" } }`.
- *Measure the gallery (k3)*: `{ "do": "skill", "id": "kartograf", "tier": 3 }`, then
  `{ "event": "measure:done", "match": { "building": "KB-B06" } }` (or flag `measured.KB-B06`);
  measuring in 1793-07 also discovers `clue.k3.messen`.
- *Snow tracks (k2 W5)*: in 1793-02 `{ "do": "threat", "kind": "pack", "active": true,
  "intensity": 0.4, "center": {…}, "radius": 250 }`, complete on
  `{ "event": "hunt:tracking", "match": { "on": false, "why": "water" } }`.
- *Par force (k2_4)*: `"mode": "parforce", "from": {…}, "target": {…}, "goalRadius": 25,
  "headStart": 6` → `{ "event": "hunt:goal", "match": { "mode": "parforce" } }`.
- *Drive and finale (k4_4 / k4_5)*: `"mode": "drive", "via": [...], "target": ZWINGER` →
  `hunt:goal {mode:'drive'}`; re-issue the same area with `"mode": "finale"` →
  `{ "event": "hunt:finale", "match": { "outcome": "faded" } }`, then the threat `active: false`.
  Bible 4.6: a `meter` with `lossless: true` (or `player:caught {soft}`) loses nothing.
- *Fire (k3)*: `{ "do": "meter", "id": "smoke", "active": true, "seconds": …, "center": {…},
  "radius": … }` drives fx's fire, which the interiors show room by room.
- *Choices*: k2 gate inline with `when: {lantern: true|false}`; k3 object modal setting
  `flag.k3_objekt` (the epilogue reads it).
- *Animals*: `{ "do": "cue", "id": "menagerie:spawn", "data": { "animal": "cassowary", "x": 1966,
  "z": 92, "id": "kasuar" } }` (1789); dromedaries / jaguar in 1793-07.
- *Quiet*: `memorial` for W5 in the Festsaal (`"room": "B01.2.og-festsaal"`), flag `barks.quiet`
  for the finale.

## 13. Licences

Code: project licence. Fonts: IM Fell English (Igino Marini) and Caveat, SIL OFL 1.1 (texts in
`src/ui/fonts`). Data: © GeoBasis-DE/LVGL-SL dl-de/by-2-0 (DTM, CHM, historic maps), OSM ODbL,
palace reconstruction from the sister project; all listed in-game under „Lizenzen & Quellen“.
