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
`prompt(key, text)`, `subtitle(speaker, text, ms, fiction)`, `setThreat(0..1)`,
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

## 11. Testing

- Unit (`tests/`): event bus, loop determinism, state/save round trip and throttling, settings,
  system ordering + error isolation, heightfield sampling, decoders (incl. real data), collision,
  forest determinism, validator (good + each failure class), ContentDB.
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

## 12. Licences

Code: project licence. Fonts: IM Fell English (Igino Marini) and Caveat, SIL OFL 1.1 (texts in
`src/ui/fonts`). Data: © GeoBasis-DE/LVGL-SL dl-de/by-2-0 (DTM, CHM, historic maps), OSM ODbL,
palace reconstruction from the sister project; all listed in-game under „Lizenzen & Quellen“.
