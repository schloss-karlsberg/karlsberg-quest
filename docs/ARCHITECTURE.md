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
| `src/core/` | Engine core, no three.js: `events` (typed bus), `state` (serialisable GameState + store), `save` (localStorage `kq.*`), `loop` (fixed step + render pacing: `FramePacer`, `renderRate`, `frameCap`, §3), `systems` (registry), `era`, `context` (GameContext type) |
| `src/data/` | Data types, pure decoders, loader for `public/data` |
| `src/world/` | Terrain (chunked, LOD, shader), sky, forest (instanced), palace (glb), collision, atmosphere (shared uniforms + GLSL), era looks |
| `src/player/` | Input (bindings, pointer lock, `simulate`, wheel), stances, Player controller, `camera.ts` (third-person spring arm `CameraRig`, `cameraHints` fight / focus / boss / `bodies`; pitch −55°…+35° and auto-levelling while walking in third person; round 10: walkable-space sweep, terrain crane, rise over the shoulder, keep-in-frame tilt, indoor preset, side two-shot, lift over an enemy at the lens — see §3 „Third-person camera“), `seeThrough.ts` (the see-through uniforms for trees and props), `guards.ts` (NaN guards for the camera and avatar maths), `avatar.ts` (the rigged player character; dithered fade when the lens is close or the locked target is behind the body, never under 45 % in a fight), `pose.ts` (`actionPose`: combat → avatar) |
| `src/render/post.ts` | Post FX: MSAA HDR target with depth texture (`setSamples(n)`), half-res SAO, bloom chain, ACES (Hill fit), white balance, split toning, colour grade, vignette, grain, `uShift/uFlash/uDesaturate`, `uFlashScale` (reduced flashing); `setFeatures({bloom, ao, grade})` from the tier; `debug` 1 = AO / 2 = bloom buffer |
| `src/render/shadows.ts` | `SunShadows` (`world.shadows`): fitted, texel-snapped orthographic sun / moon shadow map around the player, rendered with the scene's own materials; sampled by `kqShadow` inside `kqLight`; `castsShadow(o)` (opt out: `userData.noShadow`); `every` / `ShadowReuse`: a frame may keep the last map (tier `shadowEvery` 2) while the focus moved < ¾ texel, the sun did not turn and the map is ≤ 25 ms old (never in `?manual` or a fight) |
| `src/render/standard.ts` | `kqStandard(mat)` / `kqStandardize(root)`: imported PBR materials lit by the world (era sun + shadow, hemisphere fill, lantern, fire glow, sky IBL, `kqFog`); `EnvLight` (PMREM of the era sky, rebuilt on `world.lookVersion`) |
| `src/assets/` | CC0 art assets: `types.ts` (manifest / licence types, `checkManifest`, budgets), `manifest.ts` (merges `manifests/*.ts`, one per art track), `loader.ts` (`AssetLoader` = `ctx.assets`) — see docs/ART-DIRECTION.md §8 |
| `public/assets/` | `models/`, `textures/`, `hdri/` + `LICENSES.json` (every file, CC0 only); copied to `dist/assets/` (the bundle goes to `dist/app/`) |
| `scripts/assets/` | `pnpm assets:pack` (glTF → meshopt GLB with WebP textures), `pnpm assets:tex` (texture → WebP) |
| `src/render/perf.ts` | `PERF_BUDGET` (draw calls, triangles, CPU ms, frame ms), `PerfMonitor` (per-frame CPU/GPU time, calls, triangles; ring buffer), `frameStats` |
| `src/render/quality.ts` | Graphics presets Niedrig/Mittel/Hoch (`QUALITY_PRESETS`: max pixel ratio 1 / 1 / 1.25, MSAA, terrain LOD scale, tree rings, shadow size / range / taps / `shadowEvery`, bloom, AO, grade extras), „Energiesparen“ on top (`POWER_SAVE`: pixel ratio ≤ 1, no AO, no water reflection; `pixelRatioFor(…, powerSave)`), first-run guess from the GPU name, `parseQualityParam` (`?q=low|med|high`), `isSoftwareGpu` (SwiftShader → low), `QualityManager` (`override` / `fallback` / `level`, applies the preset, `listeners`, auto-downgrade with `slowMsFor(capFps)`) |
| `src/audio/` | `AudioManager` (buses master/music/sfx/voice/ambience, HRTF 3D sources), `synth.ts` (procedural wind, footsteps, horn, chirp, drone) |
| `src/ui/` | Field-book UI: HUD, modals (focus trap), title (load progress bar), pause, `settings.ts` (sectioned settings page + key remapping), licences; fonts (OFL) in `src/ui/fonts` |
| `src/i18n/` | `t(key, params)`, German strings in `de.ts`, `addStrings()` for features |
| `src/content/` | Content types, validator, `ContentDB` (all packs bundled via `import.meta.glob`) |
| `src/systems/` | **Feature systems**, one folder each, registered in `src/systems/index.ts` |
| `src/rpg/` | Action-RPG shared data, pure (no three.js, no DOM): `types.ts` (quests, enemies, items, slices, stats), `enemies.ts` (roster), `items.ts` (items, loot tables, collections), `stats.ts` (level curve, talents, `deriveStats`) — see §12.1 |
| `content/quests/` | Quest files `<nn>-<chapter>.quests.json` (schema `content/schema/quests.schema.json`, validated by `pnpm validate`) |
| `src/debug/` | `window.kq` hooks, `?debug` stats panel, `perfHud.ts` (F3 overlay), `bench.ts` (fixed benchmark route), `pilot.ts` (`kq.pilot` bullet-time play, §11), `nanWatch.ts` (`kq.nanWatch` exploded-geometry watchdog, §11) |
| `content/` | Content packs (`*.pack.json`), JSON schema, story bible (`content/bible/`, written separately) |
| `public/data/` | Prepared static data (see §9), committed |
| `scripts/` | `prepare-data.ts`, `validate-content.ts`, `sim-combat.ts` (`pnpm sim:combat`: the human-like combat bot's balance table, docs/BALANCE.md), `scripts/dev/` screenshot helpers for a running dev server |
| `scripts/voice/` | AI voice clips for dialogue lines: `pnpm voice:plan` (dry run: priority order, credits, stale lines, dist size) / `pnpm voice:gen`. Providers behind one `synthesize()` interface (`providers.ts`): `elevenlabs` (REST), `hf-space` (Gradio Space, e.g. Qwen3-TTS; built and unit-tested, not run yet; 0 credits, `--max-lines` guard) and `moss` (local MOSS-TTS-v1.5, batches inside the heavy lock; see "moss provider" below; laub and marlene use it, the ElevenLabs picks stay in `voices.json` `$alternatives`). Per-speaker `postprocess.maxPauseSec` caps internal pauses (ffmpeg `silenceremove stop_periods=-1`). `lib.ts` (pure: line collection from packs, story `say` and quest lines, FNV-1a `textHash`, TTS text prep, priority tiers, budget, manifest), `voices.json` (speaker → provider, voiceId or voicePrompt, model; licence per provider), `priority.json` (tiers), `speech.json` (spoken-text overrides per line id, e.g. for `{Name}` lines; `forText` pins the text version, manifest `speechHash` regenerates on change). Secrets `ELEVENLABS_API_KEY` / `HF_TOKEN` from the main checkout's `.env` only (never `VITE_`, never in `src/`). Output: ffmpeg gain + gentle pre-limiter (0.6) + static make-up to −18 LUFS measured with ebur128 (Opus +0.5 dB when its decoded peak stays under −0.5 dBFS), Opus 24 kbps WebM + AAC 48 kbps m4a named `<lineId>.<sha256[0..8]>.<ext>`, `manifest.json` entries `{files {opus, aac}, textHash, speechHash, speaker, provider, voiceId, model, licence, date, chars, credits, durationMs}`. `public/voice/` is committed but takes synthetic MOSS clips only, credited per voice in `LICENSES.json` `voices` (rules `assetRules.ts`, enforced by `tests/voice-assets.test.ts`; `generate.mjs` refuses elevenlabs / hf-space runs into it unless `--allow-noncommittable`; ElevenLabs output never enters the repo); the game fetches `voice/manifest.json` and falls back to the murmur |
| `tests/`, `e2e/` | vitest, Playwright |

### moss provider (local voice clips)

`provider: "moss"` in `scripts/voice/voices.json` generates lines with OpenMOSS-Team/MOSS-TTS-v1.5
(Apache-2.0, output released CC0; credit "MOSS-TTS-v1.5, OpenMOSS, Apache-2.0") on this Mac via mlx-audio.
Code: `scripts/voice/moss.ts` (config, guard, batching, lock), `providers.ts` `mossProvider`,
`scripts/voice/moss/runner.py` (the only part that loads the model), tests in `tests/voice-moss.test.ts`.

- **Setup lives outside the repo**, in `~/kq-models` (see its `README.md`): venv `venv-moss` (Python 3.12,
  mlx-audio 0.6.7, `requirements-lock.txt`), HF cache `hf/` with MOSS-TTS-v1.5 @ `cdd3b911` and
  MOSS-Audio-Tokenizer @ `3cd226ba` (official safetensors, no repo code, no `trust_remote_code`), loaded
  offline (`HF_HUB_OFFLINE=1`) from the snapshot paths. Override with `KQ_MOSS_VENV`, `KQ_MOSS_HOME`,
  `KQ_MOSS_VOICES` in the env or the main checkout's `.env`; defaults resolve from the home dir.
- **References:** each speaker has one fixed synthetic reference WAV in `~/kq-models/voices/` (copies of
  the MOSS casting picks: laub = seed 102, marlene = seed 205; sources and sha256 in that folder's README)
  and a fixed seed; generation is direct clone mode (reference + seed + the casting instruction), as in
  the casting consistency batch. The manifest `voiceId` is `moss:<speaker>:<sha8 of reference>:<seed>`,
  so a new reference or seed regenerates the speaker's lines; `model` `MOSS-TTS-v1.5@cdd3b91`, `licence`
  `apache-2.0-model`, `credits` 0, plus `attribution`. Guard (runner and `moss.ts`): a reference must
  resolve inside `KQ_MOSS_VOICES` and never under `/casting/clips/` (ElevenLabs clips); the runner
  checks every reference before the model loads. Reference WAVs and clips are never committed.
- **Lock:** at most 6 lines per runner process (one model load, 25–37 GB peak), each process wrapped in
  `KQ_HEAVY_OWNER=kq-voice-moss scripts/dev/heavy.sh --check-load --strict --max-hold 10 -- <venv>/bin/python -I scripts/voice/moss/runner.py <job>`.
  No batch starts while `/tmp/kq-quiet-window` exists (the runner also exits 76 if it appears inside the
  lock, and the batch is retried); `--strict` refusing (exit 75) stops the run. WAVs are post-processed
  after the lock is released (trim, pause cap, pre-limit + make-up to −18 LUFS, Opus + AAC). `--max-lines` (default 40)
  caps new moss clips per run.
- `pnpm voice:plan` shows the moss lines, characters, estimated minutes (RTF ~1.1 plus a model load
  per batch), lock batches and dist MB; it never loads the model.

## 2. Coordinate frame

Local metres, **x = east**, **y = height (m a.s.l.)**, **z = south**:
`x = E − 381000`, `z = −(N − 5465000)` (ETRS89 / UTM 32N). The playable terrain covers
x 150…2300, z −2150…500 (2 m grid, 1075 × 1325 samples). Yaw: `0 = looking north (−z)`;
debug hooks take degrees with `90 = east`. Palace Corps de logis ≈ (1195, −1095).

## 3. Frame of a tick

`FixedStepLoop` (60 Hz) → `update(dt)`: `player.update` → `systems.update` (registration/dep
order) → player state written to `GameState` → `input.endStep()`. The fixed updates follow the
wall clock on every animation frame, whatever the render rate (the cap never changes what the
simulation does). The **render pacing** then decides whether this animation frame is drawn →
`render(frameDt, alpha)` (`frameDt` = time since the previous drawn frame): camera interpolation
→ `systems.frame` → `world.frame` (LOD, trees, transitions, shared uniforms) → audio listener →
HUD compass → sun shadow map (may be re-used, §1 `shadows.ts`) → water reflection → post FX
render. `ctx.perf.begin()/end()` wrap the render (CPU ms, draw calls and triangles of the whole
frame incl. post; `systems.stats()` times every system's `update` and `frame`), then
`ctx.quality.frame(ms, playing)` feeds the auto-downgrade (its slow threshold follows the cap:
`slowMsFor`, so a 30 fps cap's 33 ms frames are not "slow").

**Render pacing** (`src/core/loop.ts`, fan round 2026-11-20, numbers in docs/PERFORMANCE.md §5.1).
`loop.pace()` returns the renders per second allowed now (boot installs `renderRate(state)`);
`FramePacer` turns it into a steady pattern: an accumulator spends one interval per drawn frame
with half a display frame of slack, so 60 fps on a 120 Hz screen draws exactly every 2nd frame
and 30 fps every 4th (every frame / every 2nd at 60 Hz).

| State | Renders per second |
|---|---|
| Playing | the cap: settings „Bildrate“ 30 / **60** (default) / unbegrenzt, „Energiesparen“ 30 (`frameCap`) |
| Title | ≤ 30 |
| Live modal (default of `modals.open`: dialogue, story choice, endings) | the cap for 1.5 s after the modal stack changed (the two-shot camera eases in), then ≤ 15 |
| Still modal (`backdrop: 'still'`: pause menu with settings, journal, map, licences, confirms, Chronik cards, field-station hub) | 0, the last frame is held (over the title: ≤ 15) |
| Other pause (travel curtain) | ≤ 15 |
| Bullet time / `?manual` | 0, frames only on request |
| Hidden tab | 0 (and the AudioContext is suspended) |

`loop.requestRender(n)` draws at least the next n animation frames whatever the pacing:
`screenshotReady()` asks per frame, the bench asks for every frame (uncapped throughput), debug
hooks that change the view ask (`teleport`, `setEra`, `setScanMode`, `setMapMix`, `spawnAsset`,
`perfHud`, the bench camera), so do modal / pause / settings changes, resize, the tab becoming
visible and, in bullet time, a real mouse move / key / wheel. `kq.step(n)`, `loop.renderOnce` and
the pilot's `act` / `observe` render synchronously as before. With nothing to simulate (paused /
manual) and nothing to draw the rAF loop parks (no callbacks at the display rate) until a
request or a `paused` / `manual` change wakes it; the first frame after a held phase advances the
visuals by one fixed step and restarts the perf clock (`loop.resumed`). Under WebDriver bullet
time keeps drawing every frame and still menus draw at 15 fps, exactly as before, unless `?idle`
(e2e specs that wait for frame-driven fades in `?manual` stay valid; `e2e/framerate.spec.ts`
checks the full policy with `?idle`). Only the WebGL canvas is paced: CSS animations (the title
lantern, card transitions) run as before; the travel map's 2D canvas redraws at ≤ 30 fps.

Boot order (marks in `window.__kqReady`, ms since navigation): `boot` → `data` (terrain rasters
streamed with byte progress on the title bar) → `world` → `systems` → `ready` (title takes
input). The palace glb (4.5 MB, only visible in the past eras) loads in parallel and does **not**
block the title (`palace` mark); `?notitle` / skip-title still waits for it. After it arrives a
shader warm-up (`renderer.compileAsync`, mark `warm`) compiles all scene materials while the
title is shown (skipped under WebDriver unless `?warm`).
The palace is kept twice in memory: `palace-merged` (one geometry, hidden, layer 31, no shadow) is
what systems read (openings, lit windows, point cloud, picker, the shader patches share its
material); what is drawn are the same pieces merged per 48 m cell (`palace-cell:x,z`), so cells
off screen or outside the shadow box are culled (round 9: Ehrenhof 1789 ≈ 100 → 112 fps).

**Third-person camera** (`src/player/camera.ts`, `CameraRig.update` inside `player.applyCamera`;
playtest round 10, F-03 / F-07 / F-08 / F-15 / F-21 / F-31 / F-35; tests/camera.test.ts,
tests/camera-palace.test.ts, e2e/camera.spec.ts). Per drawn frame: the pivot (head) → the preset
(outdoors; a fight pulls the boom back and up; **indoors** — a ceiling over the character — a
boom ≤ 2.3 m, 0.32 m higher, 0.5 m shoulder) → the shoulder offset (shrunk by a wall at the
shoulder and on a short boom) → the **sweep** from the shoulder back along the view in 0.25 m
steps: `blocked` (footprints, solids and interior walls from the knee to 3.4 m over the feet, via
the allocation-free `FootprintCollider.hits` / `PlanQuery.hits`) and `space` (`world.spaceAt`:
−1 outdoors, a room index, −2 a door reveal / wall mass; the boom never leaves the character's
space, so no lens through a door, the Durchfahrt or into a stair block) end it; terrain does not:
rising ground **cranes** the boom up (the lift `max(deficit / t) · length`, ≤ 2.6 m, else the boom
ends where it still fits) → in at once, out gently → a boom under 1.2 m **rises over the shoulder**
(`squeezeRise`, ≤ 0.85 m) → an enemy within 1.3 m of the lens lifts it over the body (≤ 1.3 m) →
ground / ceiling clamps → the view is the player's yaw / pitch plus a **keep-in-frame tilt**
(`frameTilt`: the head stays between −0.5 and +0.85 of the screen height) → a conversation
(`hints.focus`) blends to a **two-shot** from the side (`twoShot`: character left, speaker right,
both heads above the dialogue box; the side with room, chosen when the talk starts; over the
shoulder when neither side has room). Trunks, low spruce cones, ferns, bushes and rocks are not
collided with: the **see-through** (`src/player/seeThrough.ts` writes `atmosphere.uSeeCam / uSeeP /
uSeeT / uSeeK` after the avatar each frame; `SEE_GLSL` / `SEE_FRAG_GLSL` in world/atmosphere.ts,
used by the procedural and model tree shaders per instance and by the forest props per vertex)
screen-door dithers what stands in the cone from the lens to the character (wider in a fight),
to the fight's locked / soft target or to the speaker (≤ 82 %), and anything pressed against the
lens (gone); crowns above eye height stay, the shadow pass is untouched. Enemies at the lens fade
out completely (`lensVis` in combat/visuals.ts, render only). `kq.camera.state()` reads the
rig's last frame (distance, head, rise, crane, enemy lift, tilt, indoor, focus, spaces, see,
fight hints). **NaN guards** (F-15, `src/player/guards.ts`): a NaN / negative dt counts as 0, a
huge one is capped at 0.1 s; a NaN input, height, ceiling or hint never reaches the camera (the
rig holds its last finite placement and restarts its smoothing); the avatar holds its last pose
on a NaN position (`usablePos`), turns with `turnToward` (a NaN wish or facing never sticks),
clamps clip times and weights with the NaN-safe `clamp01`; the staff trail never stretches across
a teleport (`ribbonStep`); the see-through switches off on a NaN lens. The character's own fade
(the lens at the head, the fight's target behind the body, never under 45 % in a fight) is
`CharacterFade` in seeThrough.ts; avatar.ts only calls these hooks (it belongs to the character
look work), so the camera rules live in `guards.ts` / `seeThrough.ts`.

Pause is a stack of reasons (`ctx.pause.push('menu')`); while any reason is active fixed updates
stop and rendering follows the pacing above. `?manual` stops the real-time simulation entirely;
only `kq.step(n)` advances it (deterministic tests).

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
  listen E, lantern L, map M, measure R, shift Q, scan0–3, journal J/Tab, pause Esc/P, keyboard
  look lookLeft/lookRight/lookUp/lookDown on Comma/Period/PageUp/PageDown and Numpad 4/6/8/2).
  Bindings are physical `KeyboardEvent.code`s (layout-independent; AZERTY "forward" is on Z).
  Players remap the actions in `REBINDABLE` (settings → Steuerung → Tastenbelegung);
  `settings.bindings` stores only the overrides, `effectiveBindings(overrides)` merges them,
  `bindKey` takes a key away from other actions (except the shared crouch/down pair on C,
  `SHARED_KEYS`), `ctx.input.setBindings()` applies them. Feature systems must read actions, never
  raw key codes, and show key names via the settings' `keyLabel(code)` where possible.

## 5. GameContext (`ctx`, also `window.kq.ctx`)

| Member | Use |
|---|---|
| `renderer, scene, camera` | three.js objects |
| `post` | `post.uniforms.uShift` (era-shift warp 0..1), `uFlash` (white flash), `uDesaturate` |
| `player` | `position`, `yaw/pitch`, `stance`, `flying`, `stats {noise, visibility, speed, lanternLit, noiseBoost, onSlopeLimit}`, `teleport(x,z,yaw?)`, `setStance`, `setFlying`, `forward()`; camera track: `cameraMode` (`third` default / `first`), `thirdPerson` (false while flying), `eyeHeight`, `rig` (`CameraRig`: `zoom`, `distance`, `debug`). The camera follows `renderPos`; `world.collider.hits` (allocation-free walls), `world.spaceAt(x,z,y)` and `world.ceilingAt(x,z,y)` (interiors) and the storey-aware `world.heightAt(x,z,y)` feed its collision; trunks are dithered, not collided (§3) |
| `input` | actions, `simulate(code, down)`, `enabled`, pointer lock |
| `world` | `heightAt(x,z)`, `surfaceAt` (meadow/forest/water/…), `coverAt`, `bounds()`, `heightfield` (`slopeDeg`, `normalAt`), `collider.footprintAt` / `setSolids(owner, list)` / `setPassZones(owner, list)` / `solidAt` / `keep`, `palace.setMode`, `palace.uniforms.uRuin/uChar`, `setScanMode`, `setScanArea`, `setMapMix`, `forest`, `sky` |
| `data` | `meta`, `heights`, `ground`, `canopy`, `footprints`, `rooms` (114 room polygons), `pois`, `paths` (graph), `attribution` |
| `state` | `GameStateStore`: `.state` (readonly), `.mutable`, `.update(fn, reason)`, `.subscribe`, `.slice(id, init)` |
| `settings` | `SettingsStore` persisted at `kq.settings.v1` (older saves gain new fields with defaults): `volume {master, music, sfx, voice, ambience}`, `mouseSensitivity`, `invertY/invertX`, `fov`, `subtitleSize s/m/l/xl`, `subtitleBg`, `gentleMode`, `reducedMotion`, `reducedFlash`, `highContrast`, `colorblind`, `fpsCap` („Bildrate“ 30 / 60 / 0 = unbegrenzt, default 60), `powerSave` („Energiesparen“), `powerHint` (battery toast shown once), `graphics low/medium/high`, `resolutionScale`, `autoQuality`, `perfHud`, `cameraMode` (`third`), `cameraZoom` (3.6 m), `bindings` (see §4). `reducedMotion`/`reducedFlash` default to `prefers-reduced-motion`, `highContrast` to `prefers-contrast: more` |
| `perf` | `PerfMonitor`: `summary()` (frame/CPU/GPU ms percentiles, calls, triangles), `recentFrameMs`, `onFrame`; `renderer.info.autoReset` is off, counts cover the whole frame |
| `quality` | `QualityManager`: `level` (= `override` ?? `settings.graphics` ?? `fallback`), `preset`, `apply()`, `listeners` (called with the preset after each apply), `hold(seconds)` (pause the auto-downgrade around loads / shifts), `capFps` (the render cap; the slow threshold follows it). `override` comes from `?q=` or a software renderer and is cleared when the player picks a level |
| `assets` | `AssetLoader` (docs/ART-DIRECTION.md §8): `instance(id)` (model clone, PBR patched to the world light), `model(id)`, `texture(id)`, `loadArea(area, onProgress)`, `prefetchEra(era)` (boot calls it on `era:change`), `peek(id)`, `list(area?, era?)`, `licences()` |
| `save` | `save(slot)`, `autosave(reason, force?)`, `load(slot)`, `has`, `peek(slot)` (read a slot without loading it), `delete`; keys `kq.save.v1.<slot>`. `save:loaded` re-runs every system's `restore()` (boot.ts), so a load from the title (e.g. "Ende noch einmal wählen") rebuilds the running game |
| `events` | `on/once/off/emit/onAny` |
| `audio` | `bus('sfx'|'music'|'voice'|'ambience')` (spoken lines and whispers on `voice`, drones/score on `music`), `createSource3D(bus, opts)` (HRTF `PannerNode`, null until unlocked), `noise()`, `onUnlock(fn)`, `ctx` (AudioContext or null) |
| `ui` | `hud`, `modals`, `cards` (one centre card at a time, below), `toast(text)`, `layer(id)`, `add(el)` |
| `era` | `current`, `info` (`terrain`, `palace`, `spiritView`, `night`), `set(era)` |
| `content` | `ContentDB`: `facts/nouns/clues/cases/speakers/dialogue/hints` maps, `cluesAt(x,z,era)`, `dialogueFor(event)` |
| `systems, loop, pause` | registry, loop (`time`, `tick`, `step`, `advance`, `renderOnce`, `requestRender(n)`, `pace`, `manual`, `paused`; §3), pause stack |
| `cinematic` | Camera takeover (boot's override slot, `src/systems/cinematic/takeover.ts`): `takeCamera(owner, fn, { showAvatar = true, freeze = true, onRelease })` → false while another owner holds it; `releaseCamera(owner)`; `cameraOwner`. `fn(cam)` runs every drawn frame after the rig; released automatically on `shift:done` / `era:change` / `player:died` / `save:loaded`; the hand-back eases the last shot into the rig's placement over 0.4 s (a cut with reduced motion); `freeze` sets `frozen` + `lookLocked` and restores them and yaw / pitch. `camera:override { active }` on every change of the slot (also the debug `setCamera`). Never write `camera.position` from a `frame()` outside it |
| `debug, params, t` | `?debug`, URL params, i18n |

HUD slots (`ctx.ui.hud`): `dock('vitals' | 'boss' | 'feed', el, order)` (Action-RPG docks: bottom-left
above the oil gauge, top centre under the threat eye, right edge under the toasts; testids
`hud-vitals`, `hud-boss`, `hud-feed`; elements stack by order, an empty dock is hidden),
`setMarker(id, bearingDeg|null, color)` (compass markers),
`prompt(key, text, owner?)` (one prompt per owner, the newest shows; clearing yours reveals the
one below: story uses `'story'`, Chronik `'chronik'`), `subtitle(speaker, text, ms, fiction)`, `setThreat(0..1)`,
`setLantern(oil|null, lit)`, `setStatus(text)`, `setStance`, `setEraLabel`, `toast`,
`stack(el, order)`. `hud.staged` is true while a boss reveal (`busy('reveal')`) or a staged climax
(`busy('stage' | 'stage-…')`) holds the screen: edge markers (combat's attacker / wave arrows, the
hunt's sound arrows) are not drawn then.

**Zones** (round 6): `.kq-hud[data-kq-mode]` is set from the action reasons each frame
(`tickCalm`): `combat` while a fight is on or lingers — the quest tracker shows only the tracked
quest's title and its next goal (`styles.css`); `staged` during a reveal / climax — the column's
feature lines and the feed fade out. The column's `max-height` is the bottom-left zone's top (the
vitals dock, or the oil gauge) minus 18 px; if the column still overflows, `.kq-tl-tight` folds the
other quests to their titles before `.kq-tl-clipped` cuts and fades its bottom.

**Top-left column** (`div.kq-tl`, testid `hud-topleft`, max-width min(430 px, 50vw − 56 px)): the
era label (order 0) and the status line (10), then features' elements put there with
`hud.stack(el, order)` — the room name (tools, 20), the objective (story, 30), the story gauges
(story, 40), the quest tracker (quests, 35). They stack, never overlap; an element that is hidden takes no room. A
ResizeObserver writes the column's bottom edge to `--kq-tl-bottom`; the skill cards sit below it.
The fx gauges sit above the Bussole; the dialogue card leaves 190 px on each side; subtitles move
up above the dialogue card while it shows. Title cards and skill cards count game time (they wait while paused); an unlock card already on
screen steps aside (`kqk-held`, its clock stops) while a story title card or the curtain shows.
`e2e/pol-flow.spec.ts` checks the boxes for overlap at 1280×720, 1920×1080 and 1024×768.

**Card discipline** (`src/ui/cards.ts`, `ctx.ui.cards`, playtest round 4): ONE centre card on
screen at a time. The clue card (a modal field-book page, `cards.modal('clue:<id>', open)`) is
something the player asked for: it goes in front of a slide-in card (which steps aside, its clock
stopped, and comes back after) and queues behind another page, 0.35 s apart; the slide-in cards ask for the slot every frame
(`cards.claim('reward' | 'level' | 'skill')`, `cards.release(…)` when gone). The slot is *held*
while `hud.inAction` (a fight + 3 s, a chase, a boss reveal, being knocked down, a staged climax
while it plays, no linger — the memory's own page comes right after: the fx `StageDirector`'s
rewind / 1840 / Kabinett door / departure / riders pieces until their echo ends as `stage`, the K3
torch as `stage-k3`, the Zwinger breakout from the moment the gates open (set before `hunt:release`, so the clue page granted on it waits) until the hounds are gone as `stage-kennel`) and while an NPC
conversation is open (`cards.hold('talk', on)`, set by npc): nothing comes up, a card already up
steps aside and its clock stops. **Soft holds** (`cards.soft(reason, on)`, playtest round 5) keep
only slide-in cards back (reward, level, skill; a clue page or modal may still open) and linger
`SOFT_LINGER` = 1.2 s after they end, but never more than `SOFT_MAX` = 8 s of unbroken holding (a
chain of lines must not bury a card): a spoken story line that is not low priority (`dialogue`), an
active pack outside the ending's resting tableau (`hunt`); hard holds also cover the Festsaal
(`festsaal`) and a playing echo (`echo`, set on `echo:start` / `echo:end`; releasing a hold
opens a waiting page at once). The level and skill cards also wait while `cards.held`. Slide-in cards also wait for the chapter title card / curtain and
any other modal (menus, the Journal); a clue page may open over the station's hub. Merging: skill
unlocks that wait as a level card comes up ride along on it (`cards.source('skill', …)` /
`cards.drain('skill')` → "Freigeschaltet" rows, `level-card-skill`; combat's new abilities the
same way through `cards.source('ability', …)`), unlocks that arrive together
share one skill card (`skill-card-also`), and a fresh unlock waits 0.45 s (`SETTLE`) so a reward's
XP and skill land on one card. The reward card is queued (`RewardCard.push`), goes after 5 s or
as soon as the player walks 4.5 m from where it came up, a click takes it away. Toasts: at most two
at a time, the rest queue, the same text never twice. The quest tracker strikes a done goal
through and folds it away after 2.6 s (`DONE_LINGER_MS`). Tests: `tests/cards.test.ts`,
`e2e/pacing.spec.ts` (never two centre cards; the Pinnwand's two pages one after the other).

**Title extras** (`src/ui/title.ts`): `titleHooks.extraActions()` returns more main-menu buttons
(`{label, testid, run}`; `run` resolves true to start the game) — the story adds "Ende noch
einmal wählen" (testid `title-ending-again`) once the auto save's story has an ending and the
`ending` slot exists.

Settings rows: `addSettingsRows((settings) => [[label, control, section?, help?], …])` from
`src/ui/settings.ts` (re-exported by `ui/menus.ts`); `section` is one of `game`, `controls`,
`graphics`, `access`, `audio` (default `game`), `help` is a sentence shown under the row. Give
controls a `data-testid` and an `id` (the label's `for` is set from it).

Accessibility contract for feature systems:
- **Flashes**: when `settings.reducedFlash` is on, keep full-screen flashes ≤ 25 % (the post pass
  already scales `uFlash` by 0.2 and the shift's chromatic aberration), no strobing light
  (interiors stop candle/fire flicker, fx damps collapse and shift flashes, the fireworks echo
  drops its white-out and spark twinkle, ghosts lose their eerie stutter (`uStutter`), the
  hounds' ember eyes and horn glow stop flickering).
- **Motion**: `settings.reducedMotion` → shorter / calmer transitions, no camera shake.
- **Root attributes** for CSS: `html[data-kq-contrast]`, `[data-kq-reduced-motion]`,
  `[data-kq-reduced-flash]`, `[data-kq-colorblind]`; `--sub-bg` (subtitle backing opacity),
  `--sub-scale`. Feature CSS should add a high-contrast rule for its HUD pieces (solid backing,
  ≥ 4.5 : 1 text).
- **Colour**: never encode meaning in red vs green alone; with `settings.colorblind` the relief
  scan uses the Okabe-Ito blue ↔ orange ramp (`terrain.uniforms.uPalette`).
- **Audio**: speech on the `voice` bus, so players can turn music down and voices up.

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

**Render baseline (docs/ART-DIRECTION.md §7).** Each preset also carries `post` (bloom strength /
threshold, AO strength, shadow strength, white balance, split-tone tints); `applyLook()` pushes them
into `post` and `world.shadows` and bumps `world.lookVersion` (the sky PMREM for imported PBR
materials rebuilds). Per frame, boot renders the sun shadow map (box centred ahead of the camera,
size / range / taps from the tier) and then the post chain. Every shader using `kqLight` is
shadowed (terrain, trees, palace, scenery, characters); the terrain's blanket canopy shade
(`uTreeShade`) only stands in where the shadow map does not reach. Feature systems that add
custom shaders get shadows for free through `kqLight`; objects that must not cast set
`userData.noShadow = true` (points, sprites, lines, transparent and depth-write-off materials
never cast).

Forest (`src/world/forest.ts`, procedural; CC0 asset additions via `ctx.assets`): 3 species (beech, spruce, oak — oak picked
by a second noise in `generateTrees`) × 3 LODs = at most 9 instanced batches
(`trees-<species>-<near|mid|far>`) sharing one ShaderMaterial. Near (< 60 m) and mid (< 180 m,
scaled by tree height) are built meshes (bark tubes with root flare, limbs, leaf cards with
spherical shading normals; spruce whorls of needle cards around a core cone); far is a
camera-facing impostor quad whose silhouette and fake normal come from the shader. Attributes
`aPart` (0 bark, 1 leaf, 2 needle, 4 core, 5 impostor) and `aEx` (seed, ao, upness); `aInst/aVar`
stay for the point-cloud and `forestClear.ts` patches. Seasons per era in the shader: summer 1789,
autumn today, bare frosted twigs and snow 1793-02, sparse 1796 (`leafDensity`, `twigShow`).
`forest.stats` = `{near, mid, far, total, drawCalls, culled}` (debug panel and F3 overlay show them).

Model trees (`src/world/vegetation/trees.ts`, docs/ART-DIRECTION.md §5.2): on medium / high `world.nature` loads `nature2.trees` and hands a `ModelTrees` to `forest.setModels`; the forest keeps placement, culling and LOD rings and pushes each tree to the model batches (lod0 / lod1 per variant, one InstancedBufferGeometry each) or the impostor batch (atlas baked once at load by rendering every variant from 8 azimuths into an MSAA target). All share the `atmosphere` uniforms; `uShadowPass` (set by `render/shadows.ts`) lets every vegetation shader skip lighting in the depth pass, and trees outside the shadow box collapse there. The low tier never fetches the models.

Nature layers (`src/world/vegetation/`, docs/ART-DIRECTION.md §5.1): `world.nature` (`Nature`) owns
`cover` (`GroundCover`: instanced grass / flowers / reeds, 8 m tiles) and `props` (`NatureProps`:
instanced CC0 ferns, rocks, logs, stumps, 16 m tiles), and on medium / high loads the ground and bark
texture strips into the terrain (`terrain.setGroundSet`) and forest (`forest.setBark`). `world.setDetail(level)`
is a quality listener (alpha-to-coverage for crowns, layer radii, water reflection); nothing loads on low.
`world.water` (`src/world/water.ts`): water bodies from the ground raster per terrain set
(`findWaterBodies` / `shoreDistance`, pure), one transparent mesh per body, `levelAt`, era looks
(`ERA_WATER`), and on high `renderReflection(renderer, scene, camera)` (called by boot before the main
render) draws a half-resolution planar reflection of the nearest body in view (`reflectionSkip`
hides the near layers). Stats: `nature.cover.stats`, `nature.props.stats`, `water.stats`.

Relief scan (`world.setScanMode`): 0 normal, 1 multi-directional hillshade, 2 diverging local
relief (red high / blue low, ±1.2 m), 3 VAT-like (hillshade + slope + openness) with contours.
Drawn inside a bubble (`setScanArea`, the `survey` system keeps it at 160 m around the player;
`?scanall` = everywhere); trees inside the bubble sink away (ground points only). The 1840 map
overlay (`setMapMix`) uses the same lens; the survey system swaps the 1935–40 Messtischblatt into
the same `uMap` uniform (the travel map's layer buttons send `survey:show-map {layer}` — off / 1840 /
1935, gated by the Kartograf skill; M itself opens the travel map when the `travel` system runs,
except while the story flag `map.compare` is set or a layer lies on the terrain: then travel sends
`survey:cycle-map` and M cycles off → 1840 → 1935 → off as before — the prologue's Kartenvergleich).
With `settings.colorblind` mode 2 uses blue ↔ orange (`uPalette` 1). Inside the bubble where the
reveal is complete the terrain shader skips the lit/era colouring entirely (cheaper scan modes).

Cost knobs (set by `ctx.quality` from the preset): `terrain.lodScale` scales the LOD rings
(200 / 450 / 1000 m at 1); `forest.setDistances(near, far)` sets the far ring and scales the near / mid LOD rings by
`near / 170` (`forest.lodScale`: Hoch 60 / 180 m, Mittel ≈ 49 / 148 m, Niedrig ≈ 39 / 116 m).
The forest culls instanced trees by sector (outside the horizontal FOV + margin, all trees within
30 m kept, off while looking steeply down), rebuilt after 8 m of movement or a 20° turn;
`forest.cull = false` disables it (`kq.baseline()`).

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
- Karlsbergquelle (`src/systems/quelle`): `tests/quelle.test.ts` (the pure layout on a flat and a
  sloped synthetic heightfield: frame, water per era, the jet, who may touch, brook, clearings);
  `e2e/quelle.spec.ts` (p3q → E at the trough → the scene on game time → shift to 1789 / p3r, held
  until `shift:done` → hold Q → p4); the prologue driver walks the same way (`touchSpring` in
  `e2e/helpers/prolog.ts`).
- Third-person camera (`e2e/camera.spec.ts`, round 10): the F-03 slope fight (low and Mittel),
  dodges below the hohe Stufe, a Streuner at the lens, the Küchenhof by the Nordflügel stairs with
  the boom zoomed out, the Registratur and a talk with Soll; asserts in-frame, lens-to-head
  distance, lens space = character space, indoor preset, two-shot; screenshots
  `camera-<KQ_CAM_TAG>-*.png` (`before` runs it as a probe without assertions).
- E2E per feature (`e2e/{hunt,hunt-ext,fx,chronik,story,interiors,npc,skills}.spec.ts`) and `e2e/integration.spec.ts`: the
  prologue across all four systems (new game → hub → Pinnwand opens the Journal → objective →
  scan → clues → Q → shift → echo → pack → caught (nothing lost) → station → Journal codex holds
  the clue facts), screenshots `int-*.png`; `e2e/quests.spec.ts` (Hanne's test quest, `qst-*.png`);
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
  `era=1789`, `x=…&z=…&yaw=…`, `scanall`, `perf` (overlay), `autoq` (auto-downgrade also under
  WebDriver), `warm` (shader warm-up also under WebDriver), `idle` (the full idle-render policy
  also under WebDriver: bullet time draws on request only, still menus hold their frame; §3).
  `screenshotReady()` asks the loop for its frames, so it works in held views too.
- Bullet-time pilot (`kq.pilot`, `src/debug/pilot.ts`; docs/NEXT-SESSION.md §3.1): an agent plays
  in slices while the game stands still (`?manual`, or `kq.pilot.bulletTime(true)` at runtime; the
  HUD then shows a "⏸ Bullet-Time" chip in place of the pointer-lock chip).
  `kq.pilot.act({ hold?: string[], tap?: string[], tapSteps?: 1|2, mouse?: { dx?, dy?, turnDeg?,
  lookSteps?, turnSteps?, left?: true|'click'|'hold', right?: … }, steps = 15, frames = 5,
  frameSize = 320, quality = 0.6, keep?: boolean })` holds keys for every step (up afterwards unless
  `keep`; the next act releases kept keys it does not hold, `kq.pilot.release()` all), taps for
  1–2 steps, `left: 'hold'` keeps LMB down across the act's steps and lets it up at the end unless
  `keep` (held ≥ 0.45 s = ≥ 27 steps, then up = Wuchthieb). A held attack (`left: 'hold'`,
  `hold: ['KeyK']`) presses only once no swing, hit-stop or ability is running (a press then would
  just queue a light combo hit); if that moment never comes in the act, an `inputDropped` event
  with `hold: true` says so. Mouse look works without pointer lock or focus:
  `dx`/`dy` (pixels, + = right / down) go through `input.addLook` into the same accumulator as
  `movementX/Y`, and `player.look()` runs once per step (real sensitivity, invert, clamp);
  `dx`/`dy` are spread evenly over the first `lookSteps` steps (default all: a pan). `turnDeg`
  converts degrees at the current sensitivity and is done up front, over the first `turnSteps`
  steps (default 3, at most the act); the act's taps (keys, a click) go down on the step the turn
  completes, so a swing goes out in the new direction. `Enter` / `NumpadEnter` taps also go to the
  page as real key events (the radio box skips on Enter). Each step is `loop.advance(1)` (no render,
  and no step while `pause.paused`: a modal stops the simulation as in play); at `frames` evenly
  spaced steps `loop.renderOnce(dt · steps since the last render)` draws and the canvas is copied to
  a small 2D canvas in the same task (JPEG data URL), so no `preserveDrawingBuffer` is needed.
  While a modal / dialogue is open, taps go to the page as real `keydown`/`keyup` (E advances a
  conversation, digits pick). Returns the observation: `time`, `tick`, `paused`, `player {hp, max,
  stamina, staminaMax, exhausted, bann, x, z, yaw (0 = north, 90 = east), pitch, era, inCombat,
  dead}`, `lock {locked, soft}`, `enemies` (≤ 40 m, nearest first, ≤ 10: `id, kind, name, d,
  bearing` (relative to the view, + = right), `hp, max, state, telegraph` (s of wind-up left, null
  when none), `attack, onScreen, boss?, elite?, stun?`), `objective {label, quest, objective, d,
  bearing, tracker}` (from `kq.quests.lead()` / the tracker / the story line), `dialogue {kind:
  npc|choice|modal, title, who, text, options [{n, label}]}`, `hud {prompt, promptOwner, subtitle,
  toasts}` (`prompt` from the HUD's prompt state `hud.promptShown()`, '' when none is shown or a
  fight hides prompts; the element keeps its last text when hidden), `radio {showing, who, speaker,
  tag, text, typing}` (the spoken-line box: speaker name and id, the whole line),
  `events` (combat sim events since the last act / observe, compact: `hit` (dmg, heavy, hpLeft),
  `hurt`, `dodge` (perfect), `evade`, `ko`, `died`, `bounce` (guard), `guardBreak`, `flank`,
  `immune`, `telegraph` (attack, dur), `strike`, `swing`, `whiff`, `stun`, `phase`, `heal`, `bann`,
  `shotHit`, `hazardHit`, …, and `inputDropped {input: attack|dodge, reason}` for a press that had
  no effect. A press that lands in the combat input buffer (`p.bufAtk` / `p.bufDodge`,
  `INPUT_BUFFER` = 0.25 s, kept also through hit-stop) is not a drop: `PressTracker` follows it
  and reports it only if it never acts. Reasons: `bufferExpired` (it waited in the buffer and its
  0.25 s ran out unused, e.g. a roll pressed too early in a roll, or a hit-stop longer than the
  buffer), `dead`, `blocked` (attacks off: modal, measuring, flying, talking …; also clears a
  waiting press), `skill` (an ability owns the hands; also clears a waiting press), `tired`,
  `dodging`, `noDodge`, `interact` (the click went to the interact target), `recovery` / `hitstop`
  (only for a press that did not reach the buffer; normally such presses are buffered), `unknown`;
  each press is reported at most once; `t` = seconds into the act; tapped by wrapping the live
  `CombatSim.step` and reading the player state, buffer included, before / after, nothing in
  combat changes) and `frames`. `kq.pilot.observe({frames?})` is the
  same without stepping; `kq.pilot.choose(n)` clicks option n (1-based) of the open dialogue /
  story choice / modal, one at a time: a second `choose()` before the next `act` / `observe` returns
  null and adds a `chooseRejected` event (the next modal may not be up yet). In bullet time the era
  shift runs on the fixed steps when frames are drawn only on request, and fast travel arrives at
  once (`src/core/bullet.ts`); `kq.pilot.showStrip(true)` shows each act's frames along the bottom of
  the page (one browser screenshot shows the whole strip; it hides while the radio box speaks or a
  dialogue / modal is open, so it never covers them). Test: `e2e/pilot.spec.ts`,
  `tests/pilot.test.ts`.
- Exploded-geometry watchdog (`kq.nanWatch`, `src/debug/nanWatch.ts`; playtest round 10 F-15, a
  huge black wedge over the screen with the player gone): on with `?debug` or under WebDriver, or
  `kq.nanWatch.enabled(true)`; otherwise its render hook is not installed (no per-frame work). Every
  30 rendered frames (`kq.nanWatch.every(1)`: every frame) it runs from `scene.onAfterRender` and
  walks the drawn scene: a non-finite world matrix on any node (its descendants are not reported
  again), and for meshes / lines / points within 60 m a world bounding sphere that is non-finite,
  over 5000 m in radius or more than 10 km from the camera (geometry sphere computed lazily,
  recomputed when the positions change, times `matrixWorld` incl. scale). The camera (position,
  quaternion, matrices) and everything under it, the avatar (`player-avatar`) and the combat
  viewmodel are always checked in full, whatever their distance or visibility; skinned meshes also
  check their bones (`boneMatrices`, bone world matrices, bind matrix). Each broken object is logged
  once (`console.warn('[nan-watch] …')`: name, type, uuid, parent chain, values, era, player and
  camera position, stack); `kq.nanWatch.findings()` keeps the last 20, `scan()` scans now and returns
  what is broken now, `clear()` forgets. The pilot's observation carries `nanWatch: { n, last }`.
  Test: `tests/nanWatch.test.ts`.
- Performance (see `docs/PERFORMANCE.md`): `kq.perf()` (summary), `kq.bench(opts?)` runs the
  fixed route `BENCH_SCENES` (9 views over all eras, pack, fire, ruin, scan 3) and returns per
  scene frame/CPU/GPU ms, calls, triangles, `withinBudget` (also `kq.lastBench`, console table),
  `kq.perfHud(on)` / F3 toggles the overlay, Shift+F3 runs the bench, `kq.baseline()` switches
  the optimisations off for before/after numbers (modules register switches in
  `baselineHooks`). `e2e/perf.spec.ts`: bench within budget (`PERF_LABEL`, `PERF_BASELINE=1`,
  `PERF_FRAMES` → `test-results/perf/bench-<label>.json`), bytes and time before the first input
  (`load-<label>.json`), presets, settings page by keyboard, key remapping, contrast/colour-blind
  screenshots `pol-perf-*.png`.
- Running dev server helpers: `VIEWS='[{"name":"a","x":1138,"z":-1120,"yaw":90,"era":"1789"}]'
  node scripts/dev/shots.mjs <outdir>`.

## 12. Feature systems

Registered in `src/systems/index.ts` in this order: `survey`, `footsteps`, `ambience`, `hunt`,
`menagerie`, `fx`, `chronik`, `story`, `interiors`, `people`, `fauna`, `npc`, `barks`, `skills`, `tools`, `scenery`,
then the Action-RPG systems `progression`, `combat`, `quests` (§12.1). They talk only through the events in `src/systems/contracts.ts` (plus the
private ones listed below), `ctx.state` and a few additive world hooks. How they work together:

```
story ──threat:configure──▶ hunt (pack, lantern seconds)   fx (fire, oblivion)
story ──shift:request─────▶ fx ──shift:begin / era.set + shift:midpoint / shift:done──▶ everyone
hunt, fx ──player:caught──▶ story (curtain, threats off, instant return to today, checkpoint beat)
                            chronik (finishes a running echo; nothing is lost since D-008)
                            combat (`boss: true` when a boss had you; HP refilled on the wake's teleport;
                            a non-boss catch wakes at the nearest surveyed point when 60 m nearer)
hunt ──hunt:alert {state:'chasing'}──▶ combat (running costs Atem at half rate: `SimInput.hunted`)
chronik ──echo:start / echo:line / echo:end──▶ fx/stage (staged memories: the rewind, 1840, the Kabinett door, the departure)
story ──story:cue 'k2-frost' / 'k2-thaw' / 'k2-candle' / 'k4-quader' / 'end-prints' / 'k1-papers' / 'frost-breath' / 'stage-off'──▶ fx/stage
story ──story:cue 'bussole:jolt {x,z|bearing,hold}' / 'bussole:tick {hold}' / 'bussole:open'──▶ story ObjectiveView (the HUD Bussole)
story ──story:cue 'hunt:tableau' {kind: lie|eyes|rest|off}──▶ hunt (W8: the pack lies down; the endings)
story ──menagerie:spawn / story:cue 'menagerie:spawn'──▶ menagerie (escaped animals, per era)
story (hub Pinnwand) ──chronik:open──▶ quests (opens the Journal; the Chronik board is gone)
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
story ──story:cue 'scenery:windows' / 'scenery:gate'──▶ scenery (lit windows, Ehrenhof gate)
chronik ──echo:start / echo:end──▶ fx K3Stage (the torch flies with echo.k3.fackel) · story ──story:cue 'k3:jost-run' / 'k3:wisp'──▶ fx
hunt ──hunt:release (E at the Zwinger gate)──▶ story (k3_8 grants clue.k3.jost) ──clue:found──▶ quests (q.k3.hunde.tueren)
chronik ──echo:start / echo:end (clue.k1.feuerwerk)──▶ scenery (fireworks; phases follow kq.chronik.echo())
scenery ──world.collider.setSolids / setPassZones──▶ player, hunt, menagerie (props, gate, passage)
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

Round-4 (polish: set dressing) integration rules:
- **Extra solids**: set dressing registers circles / oriented boxes per owner with
  `world.collider.setSolids(owner, list)`; they are resolved after the footprints in every era
  (also while the footprints are off in the ruin). Gates in footprints are pass zones
  (`setPassZones(owner, [{poly, x, z, r}])`: inside the circle that footprint's edges do not block).
  Keep props clear of anchors, checkpoints, NPC places and clue spots — `era.set` pushes the player
  out of anything solid (`SetDef.keepFree`, checked in `tests/scenery.test.ts`).
- **Ruin keep**: in 1796 `collider.keep` holds the footprints that still stand (`RUIN_KEEP` in
  `world/palace.ts`: the Baumagazin and the valley guard houses); the rest of the ruin is open.
- **Weather indoors**: fx masks its era particles and mist under the roofs of the buildings with
  rooms (+ KB-B07) while the palace stands (`roofQuads`, `AmbientParticles.sheltered`).
- **Time of day**: the story's `look` action knows `day | dawn | dusk | night`; `dawn`
  (Morgengrauen) is used at chapter 4's end and the endings.

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
  fairness checked by simulated runs in `tests/hunt-ext.test.ts`; `headStart`, `heel` (gap they
  settle at, default 9 m), `burst` (rubber band beyond the heel, default 1) and `keepPace` (at the
  heel they match a runner's pace and falter when you stop; Ch. 1's first chase, checked in
  `tests/hunt-k1.test.ts`) tune it; `flankers` (the last n hounds run wide and ahead to cut off
  the route, never catch), `lunges` (a hound crouches — eyes flare, growl, caption — then leaps
  where you will be; dodging [Leertaste] in the leap makes it miss, a hit is a bite: a shove, a
  jolt, 1.4 s of grace; `maxBites` (3, gentle 5) bites = caught; sim events `lunge`/`bite`, contract
  `hunt:bite {n,max}`), `pikeurFar` (the rider keeps ≥ n m off, a silhouette up the slope));
  `stand` (K1 narrows: an arc behind, two hounds across the way out, the rider 40 m back; they
  engage within 14 m, never catch while you hold the ground (the strays are the fight), a break-out
  draws a lunge, > 22 m away = caught); `kennel` (K3 Zwinger: hounds pace behind the bars of
  `target`; E at the Gittertüren (`kennelGate.ts`, in the KB-B23 yard wall at `via[0]`, prompt
  3–7.5 m outside, `flags['e.owner'] = 'hunt-gate'`) or story cue `hunt:release` opens them —
  the leaves swing out (they stay open: slice `kennelOpen`), the hounds, bunched at the bars, burst
  out along `via` bent 4.5 m past the player (`kennelRoute`, pure), drawn as real dogs
  (`VisualInput.real`: dense coats, no wisps or ember eyes), the view eases to the gate and thumps
  once as they pass (not in reduced motion); emits `hunt:release {x, z, by}`, then
  `hunt:goal {mode:'kennel'}` when they are gone, the hunt ends; hook `kq.hunt.kennel()`); `follow` (ending
  C's afterword: the hounds walk your footsteps 16 m+ behind, back off when you turn on them, bay
  now and then, never catch). Story cue `hunt:tableau {kind: lie|eyes|rest|off, n, x, z, r, face}`
  stages hounds without a hunt (the endings: five lie down one by one after the horn; eyes open
  in the dark behind you; `rest`: hounds stay lying, eyes half shut — `from: 'pack'` keeps the
  running pack's hounds where they are, `near {x, z}` + `nearHeading` moves the nearest one to a
  spot: Jost's hound after W8). `flags['hunt.cones']` draws each patrolling hound's sight cone on
  the ground (`cones.ts`: range = the sim's current `lastSight`, width = its field of view; amber →
  red with awareness / sight; the K2 sneak). Round 6: the fan renders after the ambient mist and
  snow (order 53, no fog) and its border is computed per pixel from `fwidth` of its (u, f)
  coordinates: a dark ink edge with a marching amber line inside, the same width on screen at 5 m
  and at 40 m.
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
- K3 on stage (`k3-stage.ts`, era 1793-07 only): `k3-crowd.ts` the Ehrenhof's ghost crowd (pure
  scenes `afternoon` / `dusk` / `fire` in court coordinates, walkers, standers, carts; phase from
  the story beat, the fackel echo and the fire), `k3-ghosts.ts` the instanced figures (one
  InstancedMesh per kind, sepia ink + rim shader, thinning near the camera), `k3-torch.ts` the
  torch synced to `echo.k3.fackel` (arc from the commissioner's hand, impact flash into post
  `uFlash`, ground-floor windows of the court from `extractOpenings` lighting in order, flames and
  smoke, the court glow on `atmosphere.uGlow*`, a look-at turn), `k3-blaze.ts` the fire seen from
  outside (smoke columns, roof / dome glow, embers; sources from `fire.units` every 0.25 s). Story
  cues `k3:jost-run {x, z, toX, toZ}` (Jost runs off with his lantern) and `k3:wisp` (cold smoke at
  the Bussole). Honours `reducedFlash` / `reducedMotion`; low quality drops instances.
- State `systems.fx {fire, oblivion}` (running threats resume after a load). URL `?fxq=low|high`.
- Hooks `kq.fx.shift/shiftAt/freeze/fire/fireTime/oblivion/oblivionT/pulse/quality/state`,
  `kq.fx.k3.state/phase/torch/clock/strohmann`.
- **Staged set pieces** (`fx/stage/`, `StageDirector`, frame runs last so a piece may own the camera):
  pieces (`Piece {id, done, line?, end?, frame, camera?, dispose}`) started by `echo:start`
  (`echo.k4.rueckwaerts` → `k4-rewind`, `clue.k4.laub_1840` → `k4-1840`, `clue.k2.warnung` /
  `clue.k2.abschied` → `k2-door`, `clue.k2.fackeln` → `k2-abfahrt`, `clue.k2.landremont` →
  `k2-reiter`, which runs its own course), timed by `echo:line` and ended
  by `echo:end`, or by story cues (`k2-frost {on}`, `k2-thaw`, `k2-candle {x, z, y?}`,
  `k4-quader {x, z}`, `end-prints {x, z, n, r, ring}`, `k1-papers {tx, tz}` (the Registratur's
  reminders whirl up and stream out), `frost-breath {s}` (a passing frost on the compass and the
  view's edges, thawing after s), `stage-off {id?}`); a shift takes the
  world-placed ones down, a load all of them. The echo stagings (`registerEchoStagings`) go into
  the Chronik's registry (`chronik/staging.ts`). Shared bits in `common.ts` (instanced solid
  material with fog, `GlowPoints`, `GradeLoan` for a temporary grade). `end-memories.ts` is used by
  the burn ending (`endings/stage.ts`). Reduced motion / reduced flash honoured per piece. Hooks
  `kq.stage.active/state/hold/cue/advance/line`.

### chronik (`src/systems/chronik/`) – clues, echoes (the board is gone, D-008)
- Clue markers + E examine card (`clue:found`, `noun:learned` kept for story conditions but no
  longer shown on the card, `codex:unlocked`); relief clues need the right scan mode, lantern
  clues a lit lantern; hold E on an echo → ghosts + subtitles (`echo:start/end`, `echo:play {id}`
  starts one; `echo:line {id, line, i, dur}` as each subtitle comes up). A staged echo
  (`staging.ts`, `stageEcho(id, {intro, outro, pace, minSeconds, voices, atClue, leash, marks})`)
  is paced for its set piece; `marks` place a speaker's figure (stand, walk to, look at, sit) — the
  Kabinett scene behind the door; `leash` overrides the walk-on distance. E and the examine prompt step aside while
  `flags['npc.near']` is set (talk wins).
  Walk-and-listen (playtest round 4): walking away from a playing echo no longer aborts it — the
  figures and the mist fade, the colour comes back, the remaining lines go on as subtitles with
  the whisper at your shoulder, and the memory counts when its last line is said (`echo:end`, the
  discovery); heard while walking it gives a toast „Erinnerung notiert“ instead of the modal card
  (`kq.chronik.echo()` → `walking`). While it whispers on, E and the prompts are free for other
  clues; starting another echo ends the walking one as heard. Clue cards go through `ctx.ui.cards`
  (one at a time).
- No board, no blanks, no batches, no hint ladder: J/Tab and `chronik:open` open the quests
  system's Journal (`openJournal()`; `kq.chronik.open/close/tab/isOpen` redirect there, and
  `chronik:opened/closed` are emitted by the Journal). `check()` only re-evaluates state for
  older saves (`state.chronik` stays readable). `player:caught` finishes a running echo and loses
  nothing (`chronik:lost` is no longer emitted).
- Uses real packs; placeholder packs (`content/test/chronik-test.pack.json`, `ct.*`) only when no
  real content exists or with `?placeholder`.
- Markers of a past chapter's unfound clues retire (`clueRetired`, chapter order p → k1 … k4 →
  enden): the world stops pointing at old business; E on the spot still works. Clues of the
  running chapter win E over others. A clue's card sketch shows `clue.sketch {x, z, size?}` when
  the clue is about another place than where it is found (the station printouts), with a 100 m
  bar on large sketches.
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
- Also owns the extra settings rows (Rauhnacht under "Spiel",
  Geräusch-Untertitel and Richtungspfeile under "Barrierefreiheit") and key-help rows. The
  graphics preset itself belongs to the core (`render/quality.ts`, row "Grafik" under "Bild &
  Leistung"); fx reads `settings.graphics` (Niedrig → low particle level), tools thin the point
  cloud on Niedrig.
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
  voice) and ContentDB dialogue triggers. Voice: a recorded clip when `voice/manifest.json`
  (under the Vite base; contract and FNV-1a `textHash` over the raw `text_de` in
  `dialogue/voiceManifest.ts`) has a current one for the line (by id, else by text hash for id-less
  quest lines and variant / era ids) and it is already decoded (`dialogue/voiceClips.ts`: per-beat
  preload, 3 parallel fetches, 16-clip LRU; Opus/WebM when `canPlayType` says "probably", else
  AAC/M4A, an Opus decode failure retries as AAC and switches to AAC for the session; the old
  single `file` is still read); else the per-syllable murmur. Both get the
  speaker's character (`dialogue/voice.ts` `RADIO_CHAIN` / `RING_CHAIN` / `HALL_CHAIN`, a `blip`
  and a `clip` variant; the clip values are the casting render's, so in-game clips sound like the
  casting page; clips at −18 LUFS enter at unity `CLIP_GAIN`). With a clip the typing paces to its
  length; skip / next stops it; the game's pause and an echo pause it; a suspended context (hidden
  tab, `AudioManager.setHidden`) freezes it and no clip starts then. Bullet time (`loop.manual`)
  does not pause clips: they run in real time while the simulation waits, and the subtitle
  completes when the clip ends. Stale counts only lines whose id the manifest knows (an id-less
  line with a changed text just finds no match); NPC conversations keep the murmur (only presenter
  lines play clips). `public/voice/` holds committed MOSS clips only; the build emits an empty manifest when there is
  none (no 404). Hook: `kq.story.voice.stats()/preload()`. Owns the title flow (warning, name, lantern),
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
- Flow rules (polish round): action runs carry their beat (`RunOptions.beat`: enter + beat
  reactions → the beat, `exit` → the next beat, chapter reactions → none). When a beat begins,
  delayed actions of other beats retire: presentation (`say`, `toast`, `sound`, `card`, `prompt`,
  `echo`, `choice`) is dropped, state changes run at once. A line that will not be spoken (said
  once already) costs no reading time in a run. The dialogue queue (`dialogue/queue.ts`, pure)
  caps waiting lines at 6 (barks / skill remarks first), drops barks after 14 s, gives lines of an
  ended beat or a left place `STALE_GRACE` = 3 s, beat lines `NORMAL_TTL` = 20 s and lore
  (`dialogue:say {lore}`, sourced lines) `LORE_TTL` = 50 s, never cuts a playing sequence; while
  `hud.acting('combat')` lore and lines over 120 chars are held (`take(held)`), barks pass; while
  `hud.acting('reveal')` (a boss's reveal, combat) every line but `now` is held; a beat's own
  non-lore line is queued ahead of waiting lore that has not started (quest history at a turn-in
  never pushes the beat's line past its moment). Lines a
  trigger fires on `story:ending` are assembled by the ending card, not spoken; the presenter is
  cleared at the credits. Reactions take `cooldown` (s, with `repeat`); the `speed {gte, lte}` condition reads the
  player's speed; `say.variants` is a running joke (n-th run → n-th text, counted in
  `slice.sayCount`). Beats take `wake {x, z, yaw, era:'today', text}`: being caught / an empty
  meter brings you to the present there instead of the field station. Ending choice: the field
  book before the table is saved to slot `ending` (`ENDING_SLOT`); the title offers it again.
  Ending C ("keep", finished): the past is at night and a `follow` pack of five comes along.
  After the choice the ending is staged in the engine (`endings/stage.ts`, ~11 s real time, before
  the card; testids `ending-stage`, `ending-stage-skip`; any key / click skips): museum — the camera
  rises, the horn, five hounds lie down one by one (`hunt:tableau lie`), the fog lifts, dawn, the
  Bussole's needle settles north in the corner (`ending-bussole`); burn (15.5 s) — the Chronik's
  pages burn in the air before you (shader burn front), then three memories through the hole the
  flame eats into a page (`ending-memory`, `fx/stage/end-memories.ts`, `burnShotAt`): the Ehrenhof
  in 1789 light, fireworks over the palace, the pack in the Apfelallee fog — the world's era lent
  with `World.setEra` (no era event) and given back — then the embers climb and the camera follows;
  keep — the dark closes in, the view turns round, eyes open behind you (`hunt:tableau eyes`), five
  prints lie before the step (`end-prints`, `ring: false`). Reduced motion: no flight, still shots
  (7 s). Look, era and view are restored before the card.
- Hooks `kq.story.goto/state/skip/start/say/finishTyping/flush/caught/hub/ending/credits/
  epilogue/choose/look/meters/meter/room/choice/stage/stageSkip/shown` (`look(time, era?)`: `day | dawn | dusk | night`; `shown()`: ids of the lines shown on screen this session).

### characters (`src/systems/characters/`) – rigged CC0 models (shared by npc and combat)
- `catalog.ts` (pure data, `tests/characters.test.ts`): which model each NPC wears (`modelFor`),
  costume colours per material slot (`COSTUMES`, `ACCENTS`, `slotColour`), the enemy rigs
  (`ENEMY_RIGS`, `PIKEUR_RIG`: model, height, clips, core). `rig.ts`: `Rig` (SkeletonUtils clone
  scaled to a height, `AnimationMixer` with crossfades, `hold`, additive `turnBone`, `attach` to a
  bone) and `rigInfo` (bind-pose height, eyes, head top). `shaders.ts`: skinned ghost and spectral
  ShaderMaterials (premultiplied, depth pre-pass twins). Models in `src/assets/manifests/characters.ts`.

### npc (`src/systems/npc/`) – ghostly people, conversations
- `npc:spawn {npc, x, z, era?, yaw?, chapter?, topics?, mood?, room?, y?, pose?}` / `npc:despawn {npc}`
  (`pose: 'kneel'`: down on one knee — legs folded in the figure shader (`uKneel`), the figure
  lowered by the knee height; asked about `namen` he scratches the hound before him)
  (story `npc` action). `room` places the ghost in a palace room on that room's storey (centre
  unless x/z are given); spawned at the player it keeps the player's storey. A figure
  (`figure.ts`): a period costume from the roster's `look` (`roster.ts`: soll, hanne, jost, pikeur,
  peter, matthes and the side-quest givers gaertner, diener, mann — the story validator's `NPCS`
  set must list the same ids; `outfit` maid / official /
  livery / carter / mason, `hat` tricorn / huntcap / mobcap / slouch, `hair` wig / queue / short,
  `prop`, `tint`, `seed`) built from lathe-revolved skirts and coats, tubes and capsules, merged
  into one geometry (`aPart` head/torso/arms/legs/hat/prop/skirts, `aPivot`, `aShade`). One
  premultiplied ShaderMaterial plus a depth-only prepass sharing its uniforms (`uPrepass`):
  fresnel rim, flowing bands, a blank face with dark eye hollows, the lower body dissolving into
  mist, an occasional slice glitch, skirt swing; around the feet 9 camera-facing mist puffs (thin
  out near the camera) and motes. Warm amber for Hanne, cold flicker for the others, era tint;
  visible only in its era. Turning (F-33, pure helpers `approachYaw` / `shortestArc` / `yawToward` in
  `logic.ts`, `tests/npc-turn.test.ts`): in a conversation (and for a story `dialogue:say` line it
  speaks with the player within 10 m) the body turns round to the player in `TALK_TURN_S` = 0.4 s,
  afterwards back to its placement yaw in 1.2 s; the rigged head looks at a player within 9 m, the
  procedural figure (no head look) slowly turns to a player within 8 m instead. Reduced motion
  snaps the turn and calms the figure.
  On medium / high the figure is replaced by a `RiggedGhost` (`rigged.ts`, models from
  `characters/`) once the model is loaded: same shader look, idle / walk / talk / gesture clips,
  head look at the player; the procedural figure stays for `low`, while loading and for the kneel pose.
- E within 2.8 m → conversation (modal page at the bottom; typing on the UI clock; keys 1–n,
  E/Enter/Space advance): `greet`, quest topics first (`npc:topics` from quests, ids `q:<quest>`,
  marked ! / ? / §), topics from the pack's `npc:talk` lines, `bye`. A quest offer shows the quest
  card (`questCardEl`, `QuestTopic.card` built by quests: title, giver, pitch, goals, reward preview)
  and the topics `qa:` Annehmen / `qd:` Später (`quest:accept` / `quest:decline`); a turn-in shows
  the turn-in card and `qt:` Übergeben (`quest:turnin`), then ONE history line (a quest's
  `history_at_turnin`, 0 = none: the story tells it later or it waits in the codex) (marked "Was wirklich
  war", with source and codex note); „Erzähl mehr“ (`more` topic) tells the rest (`quest:told`). No
  stance prompt (docs/ACTION-RPG.md §8.6). Quest glyphs over the head
  (`glyphs.ts`, `npc:marker`: ! / ringed ! / ? with halo / grey ?), escort `npc:follow`, transient
  flag `npc.near`. Emits `npc:talk`,
  `npc:conversation`, `bark:npc-near`, `clue:grant` (first talk), flags `talked.*`, `npc.owns.<clue>`.
- State `systems.npc {placed, said}`. Hooks `kq.npc.list/spawn/despawn/talk/ask/advance/finish/drain/close/state/mark/choose`.
- Talking to people: a placement can be bound to a live person of the people system (next
  section, "Talking to people"); `kq.npc.list()` reports it as `bound` (the person id).

### people (`src/systems/people/`) – People contract v0
Modern NPCs (the tour guide, about 15 tour members, the modern doubles of historical figures, a
child, the two historical twins) walking paths together. Other systems (path walk, groups, the
tour) spawn them through a **mesh-independent handle API**. Today rigged CC0 stand-ins draw them.
The **real authored character meshes come later behind the same interface**: callers do not
change.

- **The contract** is `src/systems/people/types.ts` (frozen 2026-11-20, v0.1 additive). Import
  it with `import type` only:

  ```ts
  type PersonClip = 'idle' | 'walk' | 'run' | 'talk' | 'point' | 'wave' | 'lookAround' | 'sit' | 'sitTalk' | 'interact';
  type PersonLook = 'solid' | 'ghost';
  type BudgetTier = 'hero' | 'featured' | 'extra';
  interface PersonSpawnOpts { x; z; y?; yaw?; look?; tier?; seed?; name?; speaker? }  // y: ground; yaw: radians, 0 faces −z
  interface PersonInfo { specId; tier; height; radius; clips }                       // clips: really supported
  interface Person {
    id; specId; root; info; ready /* Promise<boolean> */;
    setSpeed(mps); play(clip, {loop?, fade?, speed?}); face(yaw); lookAt(p | null);
    setLook(look); setVisible(v); dispose();
  }
  interface PeopleApi { spawn(specId, opts): Person; get(id); list(); clear(); specs(); bySpeaker(speaker) }
  ```

- **How a system gets it:** `ctx.people` (`PeopleApi | undefined`). The people module declares it
  on `GameContext` by declaration merging and sets it in `init`, so the core is not edited.
  Declare `after: ['people']` and read `ctx.people` in `init` or later. It is undefined only when
  the people system failed or is missing.
  - Why a ctx service and not events: a spawn returns a handle, which a fire-and-forget event
    with a plain payload cannot carry.
  - Like `ctx.assets`, it is a service. What the people *do* in the story still travels through
    events and state.
  - People are not saved: whoever spawned them spawns them again after a load.
- **Rules**
  - The people system updates every person each frame; callers never call update. They move and
    rotate `root` (world space, feet at the origin; `root.rotation.y = yaw` in the player's
    convention, forward −z) and call `setSpeed` / `face` / `play` / `lookAt`.
  - `setSpeed` blends idle → walk → run by ground speed with phase-locked feet. Above 0.2 m/s it
    overrides the looping clips.
  - Looping clips: idle, talk, sit, sitTalk, lookAround. Walk and run follow `setSpeed` only:
    `play('walk' | 'run')` ends a looping action and hands the body back to locomotion.
  - One-shots: point, wave, interact. Afterwards the looping clip that was playing (idle unless
    another loop was set) or locomotion takes over. A one-shot over walking legs moves the upper
    body only.
  - A clip outside `info.clips` plays its nearest fallback (`CLIP_FALLBACK`).
  - `ready` resolves true when the mesh is in, false on a fallback. The handle works before that
    and stays invisible until then.
- **Distance LOD** (`PEOPLE_LOD`, measured from the camera):
  - animation at full rate within 25 m, about 10 Hz within 40 m, frozen beyond
  - hidden beyond the draw limit (stand-in: 60 m)
  - frustum culling stays on
- **Budget tiers** (`TIER_BUDGET`, for the authored meshes; the stand-ins only report them):
  - hero: ≤ 25k tris, ≤ 8 draw calls
  - featured: ≤ 12k tris, ≤ 4
  - extra: ≤ 6k tris, ≤ 2
  - LOD1 at about 50 % beyond 15 m
- **Spec ids** (provisional, `specs.ts`):
  - `guide`: the placeholder guide Gerold Imhoff, 1.95 m, big, skinny, bald
  - `double.herzog`, `double.mannlich`, `double.hanne`, `double.peter`, `double.jost`,
    `double.soll`, `double.liese`: modern clothes, featured
  - `child.compass`: 1.25 m, featured
  - `extra.1` … `extra.7`: extra
  - `twin.herzog`, `twin.mannlich`: featured, default look 'ghost' (the roster's period costume,
    height and tint)
  - Capsule radius: 0.3 for featured adults, 0.28 for extras, 0.22 for the child.
  - An unknown id gets the generic extra and one `console.warn` per id. The handle keeps the
    requested `specId`.
- **Stand-in build** (`standin.ts`, `registry.ts`, `locomotion.ts` pure):
  - Bodies: the Quaternius adventurer / farmer / woman (lazy, `ctx.assets`). Each is recoloured
    per spec from the palette table, scaled to the spec height, and given a width factor
    (`build`). The guide's Hair slot is hidden. The child and one hiker carry the backpack.
  - Clip map: one table, `STANDIN_CLIPS`.
    - idle → `Idle_Neutral`, walk → `Walk`, run → `Run` (by speed)
    - talk → idle plus `Interact` gestures
    - point / interact → `Interact`, wave → `Wave`
    - lookAround → idle with a head sweep
    - sit / sitTalk → idle with the root lowered 0.42 m
    - `info.clips` = idle, walk, run, talk, wave, lookAround, interact.
  - Strides are measured from each clip's foot track (`strideFromFeet`): Walk 0.98, Run 1.31 m
    per loop per metre of height.
  - `face` is an eased turn, capped at 5 rad/s. `lookAt` turns neck and head
    (`Rig.turnBone`, ±60°, no owl neck).
  - 'solid' = per-person clones of the model's slots lit by `kqStandard`. 'ghost' = the NPC ghost
    shader with its depth pre-pass.
  - Each skinned part gets one conservative bound round the whole body, so frustum culling works
    on skinned meshes.
  - `dispose()` frees the materials, the clone's skeletons, the mixer's actions and the fallback
    capsule. Geometry belongs to the asset cache.
  - A failed load shows a capsule.
- **Talking to people** (v0.1):
  - Spawn the person with `speaker: '<content speaker id>'`. The npc system then binds that
    speaker's story placement (`npc:spawn`) to `ctx.people.bySpeaker(id)` (`npc/bind.ts`).
  - While bound, the placement has no figure of its own. Talk range, the E prompt, the quest
    glyph and the conversation framing follow `person.root`. The placement's own x/z wait unused.
  - During the conversation the person turns to the player (`face`), looks at the eyes
    (`lookAt`) and plays 'talk'. At the end it plays 'idle' and `lookAt(null)`.
  - A walking person stays talkable. The walk system may pause itself on `npc:conversation`.
  - Disposing the person unbinds it, and the figure comes back at the placement.
- **Hooks:** `kq.people`
  - `spawn(specId, x, z, {yawDeg | yaw, look, tier, seed, name, speaker}) → id`
  - `list()`
  - `get(id)`: state (position, yaw, speed, clip / playing / shot, look, LOD, measured strides,
    weights, head, tris, draw calls)
  - `clear()`
  - `stats()`: count, drawn, approx tris, draw calls, LOD bands
  - `specs()`
  - `drive(id, mps)`: debug walking along the facing
  - Tests: `tests/people.test.ts`. They load the real GLBs in node: strides, poses, bounds,
    disposal.
- **Stand-in limits:**
  - 10–15 draw calls and 5.3k–10.2k tris per body (above the featured / extra budgets), twice
    that for a ghost
  - no real point / sit clips
  - no LOD1 mesh
  - per-person materials
  - no foot IK on slopes

### fauna (`src/systems/fauna/`) – Fauna contract v0
Animal bodies for the tour: the roe doe and her fawn (a photo / sneak moment) and Jost's dogs Diane
and Bijou (they follow him, bolt into the forest, sit at stops, lie at the party). The people
system's sibling, built the same way: a **mesh-independent handle API**, today rigged CC0
stand-ins, the **authored meshes later behind the same interface**.

- **The contract** is `src/systems/fauna/types.ts` (frozen 2026-11-20). Import it with
  `import type` only:

  ```ts
  type AnimalClip = 'idle' | 'walk' | 'run' | 'alert' | 'graze' | 'sniff' | 'sit' | 'lie' | 'sleep' | 'bark' | 'shake';
  interface AnimalSpawnOpts { x; z; y?; yaw?; seed?; name?; keepAlive? }   // y: ground; yaw: radians, 0 faces −z
  interface AnimalInfo { specId; length; height; radius; headHeight; speeds: { walk; run }; clips }
  interface Animal {
    id; specId; root; info; ready /* Promise<boolean> */;
    setSpeed(mps); play(clip, {loop?, fade?, speed?}); face(yaw); lookAt(p | null);
    headWorld(out); setEyeShine(k); setVisible(v); dispose();
  }
  interface FaunaApi { spawn(specId, opts): Animal; get(id); list(); clear(); specs() }
  ```

- **Who does what:** fauna owns the BODIES (meshes, clips, poses, LOD). The BEHAVIOUR is
  kq-systems' `src/systems/animals/`: flee and sneak, following Jost, alert events, save /
  restore, its own hooks. It drives the bodies like the walk system drives people.
  - It gets them through `ctx.fauna` (`FaunaApi | undefined`, declaration merge, set in `init`).
    Declare `after: ['fauna']`.
  - Nothing spawns an animal by default. Animals are not saved: the behaviour layer spawns them
    again from its own slice after a load.
- **Rules** (as for people unless noted)
  - The fauna system ticks every animal each frame. Callers move and rotate `root` (feet at the
    origin, forward −z) and call `setSpeed` / `face` / `play` / `lookAt`.
  - `setSpeed` blends idle → walk → run at thresholds from the spec's own speeds, with
    phase-locked paws. Above 0.2 m/s (`MOVE_OVERRIDE`) it overrides the looping clips; a pose
    (sit, lie) waits until the animal stops.
  - Loops: idle, alert, graze, sniff, sit, lie, sleep. One-shots: bark, shake; over moving legs
    they move head and neck only. `play('walk' | 'run')` hands the body back to `setSpeed`.
  - A clip outside `info.clips` plays the species' stand-in look if it has one (a dog's bark),
    otherwise its nearest fallback (`CLIP_FALLBACK`: graze → sniff → idle, sleep → lie → idle,
    bark → alert → idle, shake / sit → idle).
  - `headWorld(out)`: the live point between the eyes (the head bone carries it), for the photo
    framing and sight lines. Before the body is in: root + eye height.
  - `setEyeShine(k)` (0..1): tiny additive glints at the eyes for a torch at night. Hidden at 0,
    one extra draw call when on, no lights.
  - `keepAlive`: full rate and drawn at any distance (a scene animal far from the camera).
- **Distance LOD** (`FAUNA_LOD`): full rate within 15 m, about 10 Hz within 40 m, frozen beyond,
  hidden beyond 60 m; frustum culling stays on. **Budget** (`FAUNA_BUDGET`, authored meshes):
  featured ≤ 8k tris, ≤ 2 draw calls, LOD1 at about 50 % beyond 15 m.
- **Spec ids** (provisional, `specs.ts`):
  - `reh.ricke`: shoulder 0.75 m, 1.15 m long, eyes 0.95 m, walk 1.2 / run 8 m/s
  - `reh.kitz`: 0.68 m, 1.05 m, eyes 0.86 m (the contract gives no speeds: the doe's)
  - `dog.diane`: lean hunting dog, 0.58 m, 0.95 m, eyes 0.62 m, 1.4 / 7 m/s, liver and white
  - `dog.bijou`: small, 0.32 m, 0.55 m, eyes 0.36 m, 1.2 / 5 m/s, tan / wheaten
  - An unknown id gets a generic dog and one `console.warn` per id; the handle keeps the
    requested `specId`.
- **Stand-in build** (`standin.ts`, `registry.ts`; pure maths in `locomotion.ts`, which reuses
  the people helpers with per-species gaits, head limits and LOD bands):
  - Bodies: the Quaternius wolf (dogs) and horse (deer), lazy via `ctx.assets`. Scaled to the
    spec's shoulder height (the torso top), stretched to its length, slimmed (`build`), neck,
    head and tail resized per spec. Recoloured per slot and by vertex-colour paint rules (the
    roe's white rump and throat, Diane's liver patches); the horse's mane and tail are hidden.
    Both roe deer are winter grey; the fawn has no spots.
  - Clip map (`STANDIN_CLIPS`): idle → `Idle`, walk → `Walk`, run → `Gallop` (by speed). The rest
    are procedural over Idle:
    - alert → Idle slowed, head and ears up
    - graze / sniff → nose to the ground (the neck pitch learnt from the nose height, never
      behind the forefeet), the front of the body lowered (pose 'nose'), chewing / a sniffing
      drift
    - sit (dog) / lie → a body pose: the torso pitched about the hips, two-bone leg IK onto
      ground targets, tail along the ground
    - sleep → lie with the head down
    - bark / shake (dog) → stand-in one-shots over `Idle_HitReact_Left`: a head snap, a roll
      wave; not in `info.clips`
    - `info.clips`: dog idle, walk, run, sniff, alert, sit, lie, sleep; deer idle, walk, run,
      graze, sniff, alert, lie, sleep
  - Strides are measured from the IK paw tracks: walk 0.62 / 0.56 / 0.69 / 0.40 m per loop (doe,
    fawn, Diane, Bijou). The Gallop clips are nearly in place (about 1.1 body lengths per loop),
    so the run cycle takes a floor of two body lengths (`RUN_STRIDE_PER_LENGTH`); the paws slip a
    little in the short gallop stance.
  - The head carriage puts the idle eyes at the spec's `headHeight` (within 2 %).
  - `dispose()` frees the animal's own materials, the glint geometry, skeletons and the mixer.
    The asset geometry and the shared paint geometry stay cached.
  - A failed load shows a capsule.
- **Hooks:** `kq.fauna`
  - `spawn(specId, x, z, {yawDeg | yaw, seed, name, keepAlive}) → id`
  - `list()`, `get(id)`: state (position, yaw, speed, clip / playing / shot, pose, weights, head,
    eye point, strides, LOD, tris, draw calls)
  - `clear()`, `stats()`, `specs()`
  - `drive(id, mps)`: debug walking along the facing
  - `play(id, clip, o?)`, `shine(id, k)`: debug
  - Tests: `tests/fauna.test.ts`. They load the real GLBs in node: sizes, strides, poses against
    the ground, clip fallbacks, bounds, look-at, glints, LOD, disposal.
- **Stand-in limits:**
  - 4 (dog) / 7 (deer) draw calls and about 2k tris (over the 2-call budget)
  - a reshaped horse and wolf: the roe keeps a horse's heavier head, the dogs a wolf's build
  - sit, lie, graze, bark and shake are procedural; no shake of the coat
  - no LOD1 mesh, no paw IK on slopes, a small paw skid in the gallop

### barks (`src/systems/barks/`) – Laub's and Marlene's remarks
- Rules (`rules.ts`, bible 08-stimmen): random line per group, same line not within 600 s, one bark
  per 45 s, groups answering the same event take turns; quiet during echoes, dialogue, conversations,
  modals, the curtain, a chapter's first 12 s, at memorials (Rondell built in, `memorial:set`,
  `flags['barks.quiet']`). Requests wait 8 s for a quiet moment. `flags['laub.silent']` (the
  prologue before the compass first speaks at the Orangerie) mutes Laub's barks and the Chronik's
  hint ladder (its clock waits).
- Emits `bark:idle` (60 s without input), `bark:enter-fire`, `dialogue:say`.
- State `systems.barks {t, mem, memorials}`. Hooks `kq.barks.state/advance/reset`.

### animals (`src/systems/animals/`) – tour animals: the roe doe and fawn, Jost's dogs
Tour contract C5 (`docs/design/tour/systems.md` §4 / C5), the behaviour layer over the fauna bodies.
Pure core: `types.ts` (`AnimalAction`, `toRequest`, `specIdFor`, events, save types), `deer.ts`
(shy state machine graze → alert (1.5 s tell) → flee (bound `shy.settle` m) → settled → graze;
leave → gone; the fawn mirrors the doe within 2 m), `dogs.ts` (follow slots, sniff, sit, the bolt
with bark and `back`, lie / sleep), `save.ts`; `runtime.ts` (the system, headless: requests, the
step, bodies, events, era, save, targets; tests use fakes); `photoBridge.ts` (optional photo and
cinematic bridges); `index.ts` (wiring, hooks). Runs `after: ['fauna', 'people']`. Animals exist
only in era `today`: other eras hide the bodies and pause the behaviour.
- Requests: `animal:request` `AnimalAction` (ops spawn / despawn / run / lie / follow / shine (eye glint 0..1, not saved; the party's keep ending); the C5
  `animal:spawn` renamed, agreed with kq-story), also `story:cue {id: 'animal', data}`. An extra
  `keepAlive: true` on a spawn passes `keepAlive` to the fauna body (cinematic close-ups).
- Per step (60 Hz): the player as `{x, z, speed: player.stats.speed, stance}` (a flying player is
  unseen); line of sight from each self-led deer (`hunt/perception.ts` `lineOfSight`, deer eye
  0.95 m to the stance's `TARGET_HEIGHT`, transmittance > 0.15) at 5 Hz, only inside notice + 2 m;
  `walkable` = no water, no footprint, slope < 35°; no noise events yet (none exist), mask 0. Then
  `stepDeerHerd`, `stepDogs`. Per drawn frame the bodies follow: root at `world.heightAt`, `face`,
  `setSpeed` on change, `play(clip)` only when the clip hint changes.
- Dog leaders: `npc:double.*` / `npc:extra.*` / `npc:guide` → the live person with that `specId`
  (`ctx.people.list()`, `root.position`, `root.rotation.y`), other `npc:<id>` → `kq.npc.list()`,
  `player`, `animal:<id>`. Speed and heading from the motion between ticks (a jump > 15 m/s counts as
  0). Unresolvable → the dog idles where it is.
- Events: the core's `animal:alert {id}`, `animal:fled {id, by, dist}`, `animal:settled {id}`,
  `animal:returned {id}` go onto the bus 1:1; `bark` / `shake` cues play as one-shots on the body (no
  dog bark SFX yet).
- **Calm** is script-only (`kq.animals.calm`): photo mode does not calm the deer (design decision,
  sneaking is the skill).
- **Targets**: photo mode's `attachTarget` (`src/systems/photo/index.ts`, kq-mobile) gets
  `reh.ricke` / `reh.kitz` (`at` = body centre, `calm` false only while fleeing, `state` = the core
  state); the cinematic's `registerTarget` (`src/systems/cinematic/targets.ts`) gets `animal:<id>`
  (`headWorld`). Both through an eager `import.meta.glob`: dormant (no-ops) while the module is
  absent, active once it lands. `kq.animals.stats()` reports which.
- State `systems.animals` (`AnimalSave {v: 1, deer, dogs}`), written at 4 Hz and after every
  request. Restore (init, `save:loaded`) re-spawns the bodies and emits nothing.
- Hooks `kq.animals`: `ready` (true once the `animal:request` listener is attached; kq-story's
  temporary stand-in checks it), `spawn(op)`, `request(a)`, `list()` → `{id, kind, state, x, z,
  dist}`, `state(id)`, `startle(id)`, `calm(id, s)`, `leave(id)`, `clear()`, `demo()` (the deer pair
  ~40 m to the player's right in a clearing, both dogs following the player), `stats()`,
  `restore()`, `save()`. Tests: `tests/animals-deer.test.ts`, `tests/animals-dogs.test.ts`,
  `tests/animals-system.test.ts`, `e2e/animals.spec.ts`.

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
- Medium / high tier: the finishes take the CC0 surface layers (parquet, plaster, boards,
  marble, damask …) and the chandeliers / fauteuils are CC0 models (`Built.models`, instanced
  beside the mesh, dropped with it; candle flames sit at the model's candle tips). `low` keeps
  the procedural furniture and finishes.
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
  `collapsed` → ceiling gone, debris, doors blocked once the player is out (caption for the sound).
  A room near the player that catches fire or collapses drops charred beams out of its ceiling
  (`beams.ts`: they tip at one end, swing, fall and lie glowing; no collider; reduced motion: just
  there). The Festsaal choice (K3, `festsaal.ts`): story cue `festsaal:objects {room}` places four
  things — the handle in Hanne's hand, the ducat on the sill, the gilt clock on its console, the
  way out at the door — each with a glint drawn after the smoke (in `B01.2.og-festsaal` the clock
  and the ducat stand on the world set's console / ledge: `festsaalSpots(…, anchors)`); facing one in reach shows
  „E – …“ (`e.owner` flag: the Chronik and Hanne (`npc.hush`) leave E alone), E sets
  `festsaal.took` = tuergriff | dukat | uhr | nichts; `festsaal:clear` removes them. Hooks
  `kq.interiors.festsaal()` / `festsaalTake(key)`. Cleared on `threat:configure {fire, active:false}`
  and era change. Gentle mode thins the smoke; reduced motion slows flames and stops flicker
  (so does reduced flashing).
- Per-frame cost: `frame()` allocates nothing; the light sort is cached and redone after the
  camera moved ≥ 1 m, shell cut/clip boxes are cached per building and plan (WeakMaps) and
  re-selected after ≥ 0.5 m of movement or when the built set changes (< 0.05 ms per frame).
- Emits `room:enter {roomId, building, id, name}` / `room:leave` (contracts.ts), mirrors them in
  `flags['interior.room']` / `flags['interior.building']`; story condition `{ "room": "<id>" }`.
  Room names as a toast with `skills.baumeister ≥ 1`, `?debug` or `?rooms`.
- Hooks `kq.interiors.list/enter/doors/room/build/fire/state/floorAt`.

### scenery (`src/systems/scenery/`) – set dressing, Hohenburg, fireworks, lit windows, passage
- Sets (`sets.ts`, built with `builder.ts` / `kit.ts` / `props.ts` / `linear.ts`, one merged mesh
  per set): 1796 quarry at the Baumagazin (carts, heaps, dressed blocks, tools, the scale, wood,
  fire pit with smoke), the road at the valley entrance and the roofless Ehrenhof; 1789 building
  site at the gallery's east pavilion (scaffolds, hoist, lodge); the kennels by the Zwinger; the
  park fence with its broken stretches and the barrier at the Carlsluster Torhaus; the Ehrenhof
  railing with the two-winged gate; the Orangerie court in 1793-02. Built within `range` of the
  player in their eras, dropped on era change / far away; solids to the collider (owner
  `scenery`). Ghost workers (`workers.ts`) swing on the GPU; their strikes clink within 45 m.
- The 1789 Ehrenhof (`court.ts`): the set `ehrenhof-1789` paves the court in the K3 court frame
  (`fx/k3-crowd.ts` `court(u, w)`) with strips draped a few cm over the terrain (cobble field,
  sandstone bands, gutters, axis and cross walks, a rosette round the era anchor 1218/−1118; no
  solids) and adds lantern posts, orange tubs, two flags, a parked coach and a market outside the
  railing. `CourtLife` (medium / high, within 200 m, 1789) puts the court's people in as the K3
  ghost silhouettes (`fx/k3-ghosts.ts` `GhostBatch`, one draw call per kind): guards, courtiers in
  groups, servants crossing, a guard's round, a coach with its horse.
- Look (medium / high tier): the kit gives every piece a CC0 surface layer and metre UVs
  (`src/world/surfaces.ts`, docs/ART-DIRECTION.md §8.2); `models.ts` instances CC0 prop GLBs
  (`SetBuilder.model(id, fallback)`; the fallback kit prop is used on `low`). Dropped sets mark
  their group `detached` so late model loads add nothing.
- Hohenburg (`hohenburg.ts`): silhouette at its real bearing beyond the terrain data, drawn scaled
  towards the eye (`pullFactor`, with the hill's `reach` so its near foot stays beyond the edge)
  so the mirrored apron does not hide it; clearest at dawn / dusk and from the west edge in 1796.
  At the Westblick (with the haze lift) the castle hill, its shoulder and the fortress are drawn
  ×`MAG_ACROSS` wider and ×`MAG_HEIGHT` taller about their foot (`aMag` per vertex, the far hills
  keep their size), with less haze and lit stone (`uLift`).
- Fireworks (`fireworks.ts`) while the Chronik plays `clue.k1.feuerwerk`: festive rockets and
  terrace lamps, winter over the summer night, the climax on the one scaffold, darkness, the
  return. Light via `uGlowColor/uGlowPos`, white flash via `post.uFlash` — off with
  `settings.reducedFlash` or `reducedMotion`; the graphics preset Niedrig halves the sparks.
- Lit windows (`windows.ts`, the interiors' `extractOpenings`): cue `{do:'cue', id:'scenery:windows',
  data:{building, era?, on?, share?}}` (chapter 2 lights KB-B10); Ehrenhof gate `scenery:gate
  {open}` (closed by default; open adds a pass zone through KB-B39).
- Passage (`passage.ts`): from the Tempelzimmer's glass doors through KB-B07 into the garden
  (intact eras): palace shader cut (`uKqPassA/B/Bld`), walls / vault / steps / portal, pass zones +
  side-wall solids. Chapter 3's way out (c).
- World sets (`worldsets.ts`, playtest round 2): the Apfelallee (`orchard.ts`: two rows of apple
  trees along the old track from the Torhaus to the Orangerie — fruit in summer, bare and snowed
  on in 1793-02, mostly felled stumps in 1796; the runner's trail spots stay free), the Karlslust
  menagerie (barred cages with name plates, the iron bear boxes, a paddock, "Menagerie" / "Bären" /
  "Das Rund" boards), the Festsaal on 28 July 1793 (the ledge and the spots for the clock and
  the ducat — the pickups themselves are interiors' `festsaal.ts` — the handle-less door, stacked paintings, a toppled chair, the fallen chandelier; round
  3: two portraits and a pier glass on the north wall, an askew painting by the door, pale patches
  where the stacked ones hung, two fauteuils and a canapé, the second chandelier still hanging with
  burning candles; not solid — upper floor) and the Zwinger today (kennel footings in two rows with
  thresholds and posts, not solid (the finale walks there), enamel bowls in a row, straw, the old kennel, a board "Hier
  standen die Hundezwinger", three lanterns). `ehrenhof-weg` (1789–1793-07): a finger post in the
  corner where the Corps de logis meets the north wing ("Zum Garten — durch die Durchfahrt") and
  lamps either side of the north wing's Durchfahrt (`DURCHFAHRT`), court and garden.
  The park gate east of the Torhaus is a 6 m open gate with piers; the sentry box stands outside.
- Signs (`signs.ts`): lettered boards / painted canvases on ONE canvas atlas + ONE mesh per set
  (`SetBuilder.sign(x, y, z, deg, w, h, {text|paint, style, lean})`), lit and fogged like props.
- Convoy (`convoy.ts`): three ox carts roll the valley road past the Taleingang in 1796 (built
  within 450 m), wheels turning with the distance, the ox nodding, a carter beside; not solid.
- Lehnstuhl (`chair.ts`): Peter's gilded armchair stands beside him (a step behind while he
  walks) whenever the npc system shows him in 1793-07 within 160 m; not solid.
- Westblick (1796): within 260 m of 200/−905 the haze thins to a quarter (`atmosphere.uFogDensity`
  and `uFogHeightDensity` scaled from `world.look`; restored when leaving) so the Hohenburg reads.
- Runs in `update` (deterministic with `kq.step`). State `systems.scenery {windows, gate}`.
  Hooks `kq.scenery.built/sets/solids/windows/gate/fireworks/hohenburg/passage/convoy/chair/fogLift`.

### travel (`src/systems/travel/`) – Vermessungspunkte, fast travel, route POIs, Wegweiser
- Survey points (`points.ts`, 12): glowing tripods (`visuals.ts`, beam shader that fades near the
  camera, widens with distance so a found beam stays a landmark). Walking within 7 m (the Ehrenhof:
  16 m, `activateRadius`, so both Q spots lie inside) measures one
  in (chime, burst ring + flash — gentler with `reducedFlash` — banner card, autosave). The field
  station is known from the start. `travelBlock`: no travel while busy (modal / story pause), in a
  fight, while hunted (chasing / searching), in a locked chapter phase or, in the past, while a
  story threat is active. Story objectives far away (> 400 m, `ANNOUNCE_MIN`; 600 m before playtest round 10) whose goal lies within 140 m of a
  known point get one Laub line "Drücken Sie M …".
  The Karlsbergquelle tripod (round 10, 1072/−825) stands on the bench east of the spring, 14.7 m
  from the trough's water: its 7 m circle never reaches the touch reach (`quelle/layout.ts`
  `REACH`) nor the story's 5 m step zone; travel has no E prompt of its own, and its card closes on
  E only while nothing else owns E (`cardMayTakeE`: `e.owner`, `npc.near`).
- Map (`map.ts`): M (no modal open) or the Journal tab "Karte" — the 1836–41 sheet with inked
  footprints, seen POIs, the goal, known / unknown points, the player; "Hinreisen" per point
  (`travel-go-<id>`), keys 1–9 / Enter, wheel zoom, drag; layer buttons for the terrain overlay
  (`survey:show-map`). Travel: a curtain, pause `travel`, teleport beside the tripod facing the
  goal, `travel:arrived`, autosave (synchronous under `?manual`).
- Route POIs (`pois.ts`, deterministic): along 18 chapter routes every ~120 m a cache (2–4 era
  guards via `enemy:spawn`, group `poi:<id>`, only with a weapon in hand; `enemy:cleared` opens it:
  `loot:place` + EP), a Fundstück (`lore.ts`, 26 fictional letters / notes / tokens / coins, card +
  Journal tab "Funde") or a Wegstein (full heal + lantern refill, 120 s cooldown, out of combat).
  Kept clear of buildings, content places (`KEEP_CLEAR`) and each other. Ids are `poi.<route>.<n>` and
  sit in saves (`done`): a new route goes LAST in `ROUTES` (the per-era spacing and Fundstück pools
  are shared, so an earlier insert would move later routes' POIs). `p-weiher` (round 10) follows
  the Weiher's north-shore Waldweg to the hohe Stufe with its own `start` / `gap` (62 m) to fit
  between the `p-hang` POIs; tests check this on real terrain (`tests/world-data.ts`). Built within 190 m; a
  closed cache carries a warm light column (beam shader, widens with distance) so the next one
  shows from the last; when the lid springs the column shoots up and goes out.
- Sprint (Laufschritt, `laufschritt.ts`): out of a fight and a chase, after 1.0 s of sprinting
  (1.8 s before playtest round 10) the move scale grows to ×1.45 over 1.4 s (multiplies combat's
  `moveScale`, never compounds). Never indoors; no separate 1789-court rule exists.
- Wegweiser (`trail.ts` + `src/world/route.ts`): A* on a 2 m grid over the collider (footprints +
  set solids + the interiors' walls, no corner cutting, the midpoint of every move tested on a
  cached half-cell grid so a thin wall is never stepped through, string-pulled at 0.3 m; a 1 m
  grid for goals within 170 m, else 2 m; probe radius 0.38; each probe sets the feet to the
  ground-floor height there because the interiors' walls are height-aware — so the Durchfahrten
  and vestibules with a step up read open) from the player to the story objective or the tracked
  quest's goal; 48 glow motes flow along the first 70 m when a goal is new (14 s), after
  12 s without progress, or when the straight line within 30 m is blocked (round the wings, through
  doors and gates instead of into corners). While that straight line is blocked the compass
  carries a chalk-blue "Weg" marker (`hud.setMarker('wegweiser')`) at the route's next bend
  (> 4 m ahead) beside the gold objective marker; hook `kq.travel.way()`.
  Present day (playtest round 10): the straight-line check counts only water (`wayLineBlocked`
  in `points.ts`; trunks and ruins would fire it every few steps, the Weiher must), and the A*
  takes a ground cost (`RouteOptions.cost` / `minCost`): OSM path cells (`World.pathAt`, the
  raster from `rasters.ts` `buildPathRaster`) cost `PATH_COST` 0.6, the heuristic is scaled by it
  and the string pulling keeps a shortcut only if it is no dearer, so the motes follow the
  Waldweg round the Weiher's north shore. A free straight line still skips the search; the lake
  case costs ~10–25 ms per route (~9 000 cells; tests/travel.test.ts logs it; e2e
  `e2e/travel-paths.spec.ts`).
- After a catch: the story wakes the player at the anchor; travel adds a hint 1.5 s later.
- State `systems.travel {activated, announced, seen, done, shrineT, tips}`. Events
  `travel:activated`, `travel:arrived`, `travel:poi`, `survey:show-map`. Hooks
  `kq.travel.state/points/activate/go/map/pois/nearest/trail/route/way`.

### walk (`src/systems/walk/`) – the tour group: the guide walks a route, the group follows
WP-16, design contract C2 (`docs/design/tour/systems.md`). Pure core: `route.ts` (polyline, stops,
validator rules), `walker.ts` (one walker: leash with hysteresis, catch-up, arrival once,
`snapAhead`, save), `group.ts` (follow / gather slots, separation, trunk push-out, stable slot
assignment, `stepMember`); `runtime.ts` (the system, headless: requests, groups, events, save) on a
`BodyFactory` and a `WalkWorld`; `bodies.ts` (body adapters); `index.ts` (wiring, hooks). Runs
`after: ['people', 'npc']`. The group exists only in era `today`: other eras hide the bodies and
pause the logic.
- Requests: `npc:walk` `WalkRequest` (types.ts; the story's `do: 'npc'` ops), also
  `story:cue {id: 'walk', data: WalkRequest}`. Ops: `group {group, leader, members, spacing?}`
  (members spawn in a ring around the leader, radii `spacing` default [1.2, 4]; a leader without a
  body gets one: its walker's pose, else 4 m in front of the player; `imhoff` → spec `guide`, speaker
  `imhoff`), `follow {group | npc, leader, spacing?, off?}` (follow slots behind the leader; `npc`
  with `leader: 'player'` forwards to the npc escort `npc:follow`), `walk {npc, route + to | path,
  speed?, wait?}` (default 1.6 m/s, ×1.5 when the player is close behind; a new stop on the same
  route continues from where the walker is), `gather {group, around?, face?, r?}` (a half circle in
  front of `around`, everyone faces `face`, default the guide; radii default [3, 7]), `hold`
  (freeze), `release` (back to following), `despawn {group}` (disposes the whole group, the guide
  included unless another group still uses him), `warp {group, to, route?}`.
- Per step: walkers step against the player position; slots recomputed at 10 Hz
  (`followSlots` / `gatherSlots` + `assignSlots`, stable), `separate` and
  `pushOutOfTrunks(forest.trunksNear)` at 10 Hz, `stepMember` every step (walk 1.6 m/s, run 2.4 m/s
  beyond 8 m, teleport beyond 60 m). Per drawn frame the bodies follow: y from `world.heightAt`, the
  heading (0 faces −z, the walker convention; people take it as is), speed; hidden beyond 220 m.
- Events: `npc:arrived {npc, at, route, skipped}` (`at` = the stop id or 'end'), `group:waiting
  {group, leader, dist}`, `group:resumed {group, leader}`, `walk:bark {npc, id}`.
- **Barks**: a waiting walker with `wait.bark` emits `walk:bark {npc, id}` when it starts waiting
  and then at most every 20 s, never while a conversation is open. The barks system speaks it like
  any event, so the story writes the lines as bark lines with a trigger on it: ids
  `imhoff.bark.wait.NN`, `trigger: { "event": "walk:bark", "id": "imhoff.bark.wait" }`.
- **Conversation**: `npc:conversation {npc, open}` for a walker (its id or its speaker, `imhoff`)
  stops it and its group; its body is left to the npc system (face / lookAt / talk) until the end.
- **Snap** (teleport, travel, wake, checkpoint): a `player:teleport` or a player move > 20 m in one
  step is a jump; every walking leader then more than 60 m from the player snaps (`snapAhead`) to
  the route stop at or ahead of it (never behind, at most its target) nearest to the player, the
  members land in their slots and one `npc:arrived {skipped: true}` names that stop (the walk goes on
  when it is short of the target).
- **Warp** (the story's fade, same code path as the snap): the group's leader goes to stop `to` of
  its walker's route (or `route`, or the group's last route when there is no live walker); never
  backward (`console.warn`, no-op); short of a live target the walk continues from the stop, at or
  past it the walk ends there (`to` becomes the warp stop, arrived); members land in their slots at
  once (mode unchanged), one `npc:arrived {skipped: true}`. Works while bodies are hidden; it never
  moves the player.
- **Bodies** (`bodies.ts`): `ctx.people` (people contract v0.1) first — spec per npc (`imhoff` →
  `guide`, spec ids pass through), tier hero / featured / extra, `root.position` moved, turns via
  `face`, locomotion via `setSpeed` (no `play` for walking, no `root.rotation`, no `lookAt`). A
  group's members that are not spec ids (`extra.mats`, …) take the extra specs the group does not use
  yet, in member order, then wrap with another seed (`memberLooks`), so no two look the same. Without
  `ctx.people` (people system failed / not registered): stand-ins built with the scenery Kit on the
  prop material (3 draw calls each, no shadows, legs swinging with the distance walked).
- State `systems.walk {walkers: WalkerSave[], groups: GroupSave[]}` (written twice a second and
  after every request / arrival): per walker `{npc, route, to, s, waiting, path?, speed?, wait?}`,
  per group `{group, leader, members, mode, around?, face?, at?, route?, r?, spacing?}`. People are
  not saved: a load (`save:loaded`, and init) re-spawns the bodies, rebuilds walkers
  (`restoreWalker`) and lands members in their slots around the leader; no event is re-emitted and
  a waiting walker barks only after the usual 20 s.
- Routes: `content/routes/<id>.json` (bundled with `import.meta.glob`; built by
  `scripts/content-build/routes.mjs`), e.g. `p-fuehrung` car park → Quelle.
- Hooks `kq.walk.go(npc, route, to, {speed?, wait?})`, `snap(group, stop)`, `groups()` → `{group,
  leader, at, waiting}[]`, `demo({to?, speed?, r?})` (guide + 14 members at the car park, group,
  follow, walk to `abzweig` at 1.9 m/s with `wait {r: 25, bark: 'imhoff.bark.wait'}`), `stats()` →
  `{bodies, visible, ms, updateMs, syncMs, people}`, `list()`, `walker(npc)`, `request(r)`,
  `restore()`. Tests: `tests/walk-{route,walker,group,system}.test.ts`, `e2e/walk.spec.ts` (demo
  arrival, leash, snap + warp, perf with 16 bodies at high / low, screenshots `test-results/walk/`).

### notes (`src/systems/notes/`) – F8 notes, local telemetry; keyboard turning

- **F8** (window keydown, not an `Action`: no clash with the bindings; F3 is the perf HUD, F5 the
  camera) opens „Notiz an die Entwickler“ as a normal modal, so the game pauses and pointer lock is
  released like for any card; Esc cancels (the modal manager eats it before the pause menu), Enter or
  „Speichern“ saves, Shift+Enter is a new line. Not on the title screen.
- The moment is taken on the key press: `post.render(...)` once more, then the canvas is drawn into
  a 480 px 2D canvas in the same task and read as a JPEG (q 0.72): `preserveDrawingBuffer` stays off.
  The note also stores position, yaw / compass heading / pitch, era, `systems.story`
  chapter / beat, `kq.quests.lead()` (quest, objective id, label) plus tracked quests and the last
  `objective:set` text, HP (`systems.combat.hp`) / max HP / level, stance / camera mode, quality tier
  and fps / frame ms, play seconds and the last 30 s of events.
- Events: `EventRing` (`logic.ts`, pure) listens with `events.onAny`; per-frame or chatty events
  (`player:step`, `*:progress`, `lantern:oil`, `stats:changed`, `hunt:alert`, …) are dropped, payloads
  are JSON cut to 240 characters (numbers rounded, long arrays / strings cut), at most 400 entries.
- Telemetry (`Telemetry`, pure): `quest:accepted` → `quest:completed` in active play seconds
  (`meta.playSeconds`; a new game restarts open clocks), `player:died` / `player:caught` with place,
  killer kind, era and objective (a `caught` within 3 s of a `died` is the same KO), stuck episodes:
  ≥ 180 s of active play (fixed step, not paused) while there is an objective and no
  `quest:progress / objective / ready / completed / accepted`, `story:beat / chapter` or changed
  `objective:set`; the episode grows until progress ends it. Lists capped at 500.
- Storage (`store.ts`): IndexedDB `kq-notes` v1, stores `notes` (auto-increment) and `meta`
  (`telemetry`, written at most every 5 s while it changes and when the tab hides); memory fallback
  when IndexedDB is blocked. **No network calls, ever.**
- Pause menu (`notesPauseHooks` in `src/ui/menus.ts`): „Notizen exportieren (n)“ downloads
  `karlsberg-notizen-<date>.json` = `{ format: 'kq-notes', version: 1, exportedAt, notes: Note[],
  telemetry: { open, quests, deaths, stuck, sinceProgress, summary } }` (screenshots as data URLs);
  „Notizen löschen“ (confirm) clears notes and telemetry.
- Hooks: `kq.notes.list() / export()` (promises), `count / open / isOpen / save(text) / download /
  clear / storage`, `kq.telemetry.state()` and `kq.telemetry.idle(s)` (tests). Tests:
  `tests/notes-turn.test.ts`, `e2e/notes.spec.ts`.
- **Keyboard turning** (`src/player/keyTurn.ts`, used in `Player.update`): ← / → (also Komma /
  Punkt, Ziffernblock 4 / 6) are `lookLeft / lookRight`, Bild↑ / Bild↓ (Ziffernblock 8 / 2)
  `lookUp / lookDown`; ↑ / ↓ stay forward / back, A / D strafe. The rate eases to
  `KEY_TURN_RATE` = 120°/s · √sensitivity (pitch 0.7×) with τ = 0.08 s, integrated exactly per step,
  so it does not depend on the step size; it runs in the fixed step (deterministic for `kq.press`
  and bots) and needs no pointer lock, in both camera modes. `lookLocked` (cut-scenes) stops it.
  Lock-on: not special-cased; like the mouse, the keys turn freely inside the lock's keep-in-view
  window and the lock pulls the view back when the target would leave it.

### cinematic (`src/systems/cinematic/`) – in-game cut-scenes (contract C1, docs/design/tour)

Request `cinematic:play` with the full spec (`CinematicPlay` in `types.ts`: `id`, exactly one of
`keys` / `ref` (`content/cinematics/<ref>.json`, checked by `pnpm validate`) / `orbit`, `skippable`,
`lockInput`, `reduced`), or the story cue `story:cue { id: 'cinematic', data: <spec> }` until the
story's own action lands. Events `cinematic:start { id, seconds }`, `cinematic:end { id, skipped }`
(always once per request: a bad spec warns and ends skipped). Keys (`keys.ts`, pure): eye
player-relative from a snapshot at the start (`back` / `up` / `right` / `turn`°) or absolute (y over
the ground), look at `npc:<id>` (`kq.npc.list()`, else the npc slice), `animal:<id>`
(`registerTarget(id, getter)` in `targets.ts`; unknown → the view holds), `player`, a point or a
pitch / yaw; fov and the look keys fade / fog / sun / dark; smooth or linear easing; missing fields
carry over. The timeline runs on fixed steps (Esc / modals stop it); skip after 0.5 s by any key
(not Esc / P / F-keys), click or touch; the HUD steps back except subtitles (`html[data-kq-cinematic]`),
centre cards wait, autosaves are held (`save.hold`) and written after; a save that holds a playing
cinematic ends it skipped after the load. Reduced motion: 'stills' = first and last key with a dip
through black (≤ 3 s), 'skip' = start + end skipped. Debug `kq.cinematic.play(id | spec)`, `skip()`,
`at(id, t)`, `list()`, `playing()`. Tests: `tests/cinematic-keys.test.ts`,
`tests/cinematic-system.test.ts`, `e2e/cinematic.spec.ts` (`cinematic-*.png`).

### party (`src/systems/party/`) – the end-of-game party on today's plateau (bible 06 §8)
`docs/design/tour/systems.md` §6, bible 06-enden §8 "Das Fest", storyboard #25–#28. After every
ending the credits play over a party at TF-01 (the Ehrenhof clearing of today, 1216 / −1114). Pure
parts: `placements.ts` (the §8.1 draft x/z per person and per prop spot, the per-variant moves,
`partyLayout(variant, at)` moves everything by `at − TF01`), `credits.ts` (the lines, the camera way,
the spotlight times, the strip clock); `runtime.ts` (the system, headless: requests, people, dogs,
the set handle, the credits clock, the slice; tests use fakes); `set.ts` (the `PartySet` interface and
the placeholder); `strip.ts` (DOM); `index.ts` (wiring, `?party`, hooks). Runs `after: ['people',
'animals', 'npc', 'cinematic']`.
- Requests (`types.ts`, agreed with kq-story): `party:set {variant: 'museum'|'burn'|'keep', at?}`,
  `party:credits {lines?}`, `party:clear {}`; also `story:cue {id: 'party:set'|'party:credits'|
  'party:clear', data}`. Events (scalar fields): `party:ready {variant}`, `party:spotlight {who, i}`
  (`who` = the double's people spec id, e.g. `double.herzog`; the story plays its §8.4 line on a
  match), `credits:start {seconds}`, `credits:done {skipped}` (exactly once per run).
- **People** (`ctx.people`, placed directly, no walk): the guide (`guide`, speaker `imhoff`),
  Marlene (no spec yet: stand-in `extra.7` with seed 9071, speaker `marlene`; a `marlene` spec is
  used once `specs()` has it), the 7 doubles (speakers `herzogd`, `mannd`, `hanned`, `peterd`,
  `jostd`, `solld`, `liesed`), the 7 extras of §8.1 (Mats = `child.compass`, mother, the couple, two
  hikers, the student = `extra.1…6`). Activities per §8.1: sit (Herzog in the camping chair, Hanne
  and Peter on the bench), talk, lookAround, idle, interact (Gerold pouring, Soll counting, Jost's
  stick, Liese mending: a one-shot every 4–8 s). Faces: a prop, a person, the centre. Speakers stay
  bound, so the npc system's placements for them become talkable on the bodies; a conversation
  holds that person's gestures.
- **Variants** (§8.3): `museum` the archive box on the table, Gerold talks, Hanne, Marlene, Mats,
  his mother and the student lean in round him (facing him); `burn` twelve stand in a ring round the
  fire bowl, the flames burn high and a spark burst goes up on `party:set`, the dogs lie asleep
  more than 10 m from the fire; `keep` the dogs lie at the player's feet (`lie` with `follow: 'player'`)
  with eye shine 0.6 (`{op: 'shine'}`, added to the animals system for this). Dogs come through
  `animal:request` (spawn / lie / shine; museum: at Jost's feet).
- **Set** (`PartySet.build(scene, layout, variant) → PartySetHandle {anchors, setFire, burst,
  update, setVisible, drawCalls, dispose}`, swappable for authored meshes): the placeholder is ONE
  merged Kit mesh on the prop material (trestle table and bench, Hanne's and the keep bench, the
  camping chair, cake, cash box, gas stove with the mulled-wine pot and the children's punch, the
  fire bowl with logs and glowing coals, two placeholder posts with the fairy-light wire and 34
  emissive bulbs on a sagging curve, three lanterns, the archive box in A) plus ONE instanced
  glow-sprite mesh (bulb, lantern and fire halos, 18 flame tongues, 44 sparks, CPU-animated) = 2
  draw calls. y from `world.heightAt`. No fireworks (§8.5).
- **Credits** (`party:credits`): lines = `data.lines`, else `content/party/credits.json`
  (`{lines}`, the story team's, bundled through an eager `import.meta.glob`, may be missing), else
  the 3-line placeholder. The strip crawls along the bottom edge (over the letterbox, game clock,
  `data-testid="party-credits"`); reduced motion steps the lines through, centred. The camera way is
  a `cinematic:play` **keys** spec (`party-credits`, `lockInput: false`, skippable, reduced 'stills'):
  the cinematic's `orbit` circles at a constant rate and cannot stop on a person, so the keys run on
  the same circle (r 14 m, nominally a turn per 40 s, a key every ≤ 0.45 rad) and dwell 2.6 s close
  on each double in angle order (lower, fov 34), emitting `party:spotlight` at each dwell's start;
  the travel speeds up so the way stays ≤ 58 s (the keys' 60 s limit). The credits last max(20 s,
  the camera way + 0.6 s, 4 s per line). Skip: the cinematic's any key / click after 0.5 s (its
  `cinematic:end {skipped: true}` ends the credits skipped); without a camera of ours (rejected,
  no cinematic system, after reduced motion's stills) Esc / Enter / Space after 1 s. A rejected
  camera (held elsewhere) does not end the credits. Afterwards the party stands, no camera is held.
- Era `today` only: other eras hide the people and the set. `party:clear` (and a new `party:set`)
  disposes people, set and dogs; credits still running end skipped.
- State `systems.party {variant, credits: 'none'|'playing'|'done'}`; no bodies (the story re-issues
  `party:set` from its checkpoint). Credits playing at save time → `credits:done {skipped: true}`
  once at game start / after the load (live credits end skipped too, one event); a loaded save
  without a party drops the live one.
- Dev: `?party=museum|burn|keep` (parsed by the party system itself on `game:start`): era today, the
  player at the checkpoint 1200 / −1095 facing TF-01, `kq.story.look('dusk')`, `party:set`, then
  `party:credits`. Hooks `kq.party`: `set(variant, at?)`, `credits(lines?)`, `skip()`, `clear()`,
  `state()`, `stats()` → `{bodies, dogs, setDrawCalls, bodyDrawCalls, dogDrawCalls}`. Tests:
  `tests/party.test.ts`, `e2e/party.spec.ts` (`test-results/party/party-*.png`).

### photo (`src/systems/photo/`) – Fotomodus: the smartphone camera (present day only)

- **N toggles** the phone (one press up, one down; the touch top row has a camera button that does
  the same). Toggle, not hold: holding a key while aiming and walking is awkward, and on a phone
  impossible next to the stick. Up: a phone frame (`.kq-photo`, thirds grid, status bar with the
  afternoon clock and the signal), the lens at the eyes and a hand ahead (`CameraRig.setPhoto`,
  boom 0 so the character hides), **1× / 2×** by wheel or chips (`CameraRig.setFovScale`: the focal
  length doubles). **Click** (or the touch attack button, which becomes the shutter) shoots; **N,
  Esc, right click** put it away. While up, `Input.muted` hides attack / interact / Bannlicht /
  lock / dodge / abilities / Q / E / pause from every other reader; the photo system reads them
  with `raw`. Esc is caught in the capture phase (and the pointer-lock loss marked as the game's
  own), so no pause menu opens.
- **Not now** (a toast, an open phone closes): a menu / modal or pause, a conversation
  (`npc:conversation`, `cameraHints.focus`), a fight (`cameraHints.fight` / `boss`), the spirit view,
  `player.frozen`, or the camera taken over (`camera:override` from boot's camera slot, which
  `kq.setCamera` and the coming cinematic use).
- **Judging** (`core.ts`, pure, `tests/photo.test.ts`): geometric, never pixels. Per target of the
  era: project the bounding sphere; good = centre in the middle third (`centre: 'any'` allowed),
  diameter ≥ `minFrac` of the frame height, ≥ 2 of 3 sample points (top / left / right of the
  sphere) with a clear line (terrain, footprint walls when the palace stands, `forest.trunksNear`;
  the last 0.7 r is the subject itself), distance within `minDist`…`maxDist`, the view's mean
  angular speed < 0.35 rad/s over the last 0.3 s (`SteadyMeter`), and `calm()` true. `needAll`
  binds targets (doe and fawn both good in the same shot). **Fallback:** `fallbackDist` counts once
  the player has spent `fallbackAfterS` unpaused seconds within `fallbackDist` of the target (the
  clock lives in the save slice, stops at the first good shot), with `fallbackStars` (2 or 3 = good;
  1 = never good: one rule, good means ≥ 2 stars everywhere). **Stars**
  (contract C3): 0 nothing in the frame, 1 in the frame but not good, 2 good, 3 good and closer than
  0.6 × `maxDist`. German verdicts („Perfekt!“, „Gutes Foto“, „Nicht mittig“, „Verdeckt“, „Zu weit
  weg“, „Zu klein im Bild“, „Unscharf“, „Aufgeschreckt“, „Nicht alle im Bild“ …).
- **Past eras:** „Kein Netz“ in the frame and as a toast, the picture comes out white, nothing is
  judged or booked: `photo:shot { targets: [], good: [], stars: 0, noSignal: true }`.
- **Events:** `photo:open`, `photo:close`, `photo:shot { targets, good, stars, noSignal }`, and one
  `photo:good { id, stars }` per good target (scalar: the story waits with
  `{ "event": "photo:good", "match": { "id": … } }`; quests count it with the objective
  `{ "type": "photo", "target": … }`, validated against the target list; a good shot taken before
  the objective started counts at once, on accept, on a newly active objective and on load:
  `QuestBook.settleKnown(found, hasPhoto)` reads `systems.photo.good`).
- **Subject state:** `attachTarget(id, { at, calm, state })` / `registerTarget({ …, state })` take an optional `state()` getter (an opaque string, e.g. the deer's `graze` / `alert` / `flee` / `settled`), read at the shot for each good target and carried as `photo:good { id, stars, state }` (absent without a getter; also on the album entry); story matches `{ "event": "photo:good", "match": { "id": "reh.ricke", "state": "alert" } }`. Stars and verdicts ignore it, and `calm()` false still voids the shot (`?debug`: `kq.photo.deer.state('alert')`).
- **Targets are data:** `content/photo/targets.json` (kq-story; C3 shape: id, kind, era `today`,
  one anchor `at` / `npc` / `animal`, `r`, `frame`, `grants`, plus `cards[]`), validated by
  `pnpm validate` (`data.ts` `validatePhotoTargets`). A point anchor is static (ground + r without
  `y`); npc / animal anchors stay out of the world until code attaches a live position:
  `attachTarget(id, { at, calm })` (the animals system for the deer). `registerTarget(def)` adds a
  whole target from code. **Placeholders** (flagged `placeholder: true`, built in `demo.ts`): the
  plain trail board at the car park (`photo.parkplatz`, grants the flag `photo.demo.parkplatz`) and,
  with `?debug` only, a blocky test doe and fawn at 817 / −704 bound to `reh.ricke` / `reh.kitz`.
- **Bindings stack by handle:** each `attachTarget` call pushes a handle per id; the newest remaining one is active, its detach removes exactly that handle (out-of-order detach never restores a stale getter), none left → the data anchor; `isAttached(id)` says whether any binding holds it. The `?debug` deer yields: `spawnDeer` / `kq.photo.deer.spawn` returns false with a dev warning when the deer ids are already attached or `kq.animals` reports deer.
- **Album** (journal tab „Album“, order 70) and grants: the save slice `systems.photo` keeps one
  entry per target (best stars, era, ISO time, play seconds), at most 60 (the oldest out), plus
  `good` (every target ever shot well, for `has()`), `granted`, `cards`, `best` and the fallback
  clocks; **no images**. This session's JPEG thumbnail (`notes/capture.ts` `captureView`: re-render
  and read back, 480 px, q 0.72) shows in the card and the album; otherwise a stock card with the
  label. Grants fire once per target: `codex` → `state.codex.facts` + `codex:unlocked { noXp: true }`
  (progression gives no XP for it), `card` → `cards` (must be in `cards[]`), `flag` → `state.flags`.
  Unknown ids are skipped with a dev warning. Photos give no XP.
- Hooks: `kq.photo.{open, close, shoot, album, has, targets, judge(id), state, zoom, cards}`, and
  with `?debug` `kq.photo.deer.{spawn, calm, at, state}`. Tests: `tests/photo.test.ts`,
  `tests/camera-photo.test.ts`, `e2e/photo.spec.ts`.

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
| `threat` | `kind: pack \| fire \| oblivion, active, intensity?, center?, radius?, seconds?` + pack `mode` (patrol / drive / finale / parforce / stand / kennel / follow), `flankers`, `lunges`, `pikeurFar`, `maxBites`, `target`, `via`, `from`, `headStart`, `goalRadius`, `snow`, `hounds`, `pikeur`, `sight`, `seed` | hunt / fx threats |
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

### 12.1 Action-RPG layer (quests, combat, progression) — docs/ACTION-RPG.md

Since D-008 (2026-11-15) the game is an action RPG; the design and the quest catalogue are in
[`docs/ACTION-RPG.md`](ACTION-RPG.md). Three systems are registered last in `src/systems/index.ts`:
`progression`, `combat` (after hunt, menagerie, progression), `quests` (after story, npc, chronik).
They share only `src/rpg/*` (pure) and the events in `contracts.ts`; none imports another.

```
story ──quest:command {op,id}──▶ quests ──quest:offered/accepted/progress/objective/ready/completed──▶ everyone
quests ──npc:topics / npc:marker──▶ npc (topics with ! / ?)   npc ──quest:accept/decline/turnin/stance──▶ quests
quests, story ──enemy:spawn / enemy:despawn──▶ combat ──enemy:spawned/killed/cleared/aggro, boss:phase──▶ quests, progression, story
combat ──combat:bann {x,z,yaw,range,angle}──▶ hunt (scatter hounds), menagerie (jaguar backs off)
combat ──player:damaged/healed/died, player:caught {by:'combat'}──▶ HUD, barks, story (curtain + wake)
quests, story, combat ──xp:grant / item:grant / loot:place / loot:clear──▶ progression
progression ──xp:gain, level:up, item:pickup/use, loot:drop, equip:change, talent:learned, stats:changed {stats}──▶ quests, combat, HUD
quests ──codex:unlocked / skill:grant──▶ codex, skills
```

| Piece | Where | Notes |
|---|---|---|
| Quest files | `content/quests/*.quests.json` | loaded with `import.meta.glob` (`src/systems/quests/data.ts`); `test: true` files only with `?storytest`; validated by `src/systems/quests/validate.ts` (`pnpm validate`, `tests/rpg-contracts.test.ts`) |
| Stage directions | packs, quests, story | `stageDirection(text, speaker?)` in `src/systems/story/validate.ts`: no line that is only a bracketed direction, bracketed captions ≤ 30 characters (a short sound next to a visible event), no parenthesised direction inside spoken text („(Pause.)“ → „…“, the presenter breathes 0.6 s on a mid-line „…“); `tests/stage-directions.test.ts` |
| Flag mirror | `flags['quest.<id>']` = state, `flags['quest.<id>.<objective>']` = count (quests); `flags['rpg.level']` (progression); `flags['combat.disabled']` (story: finale, endings); `flags['tools.measuring']` (tools: LMB belongs to the tape) | story conditions read these |
| Story actions | `quest {op: offer\|start\|progress\|complete\|fail\|reset, id, objective?, n?}`, `enemy {op: spawn\|despawn, group, kind, x, z, era, count, radius, boss, tier, leash, respawn, time, room}`, `loot {id, item, x, z, era, clear?}`, `xp {amount, reason?}`, `item {item, count?, quiet?}` | `quest`, `xp`, `item` are one-shots on resume |
| Story conditions | `{quest: {id, state?, objective?, gte?}}` (state defaults to done; `active` also holds while ready), `{level: n}` | `questHolds()` in `story/engine.ts` |
| Input | actions `attack` (LMB, K), `bannlicht` (RMB, G), `dodge` (Space), `quickUse` (H), `inventory` (I), `lockOn` (Tab, middle mouse), `cameraMode` (F5), `journal` (J only); `takeWheel()` for the zoom; `SHARED_KEYS` C crouch/down, LMB interact/attack, Space up/dodge; the canvas swallows the context menu | `src/player/input.ts` |
| Player hooks | `player.moveScale` (×speed), `player.canSprint`, `player.impulse(vx, vz, seconds)` (decaying push through collision and slope rules; cleared by `teleport`), `player.pushed` | owned by combat (additive) |
| Journal tabs | `addJournalTab({id, label, order, render, badge?, hide?})` in `src/ui/journal.ts`; the quests system owns the modal (J / Tab) and tabs 10–30, progression adds 40 Ausrüstung, 50 Talente | replaces the Chronik board |
| Debug | `window.kq.quests`, `kq.combat`, `kq.progression` (installed on the first frame: `window.kq` exists only after `initAll`) | each track extends its own |
| Test chapter | `?storytest` + `kq.story.goto('test', 'q1')`: Hanne offers `q.test.lohnzettel`, then Laub `q.test.irrlichter` | e2e entry point for all tracks |

Each RPG track adds its own subsection here when it fills its system in.

#### quests (`src/systems/quests/`) – tasks, tracker, beacons, Journal

- `logic.ts` (pure, `tests/quests.test.ts`): `QuestBook` – offer / accept / progress / complete /
  fail / reset, availability (`chapter`, `era`, `after`, `level`, `flags`), all objective types
  (kill, collect with seeded drops or placed pickups, use, talk, examine, echo, calm, room, event,
  and the positional reach / survive / escort checks in `tick()`), optional objectives with bonus XP, the flag mirror and `reassert()` after a
  load. Turn-in `npc` (topic at the giver), `auto` (on ready), voice givers (Laub) accept at once.
  `complete` pays out (`xp:grant`, `item:grant`, `skill:grant`, `codex:unlocked` per history fact),
  despawns its groups and clears its loot.
- `index.ts`: event glue (`quest:command`, `quest:accept/decline/turnin/stance`, kills, pickups,
  `npc:talk`, `room:enter` …), `npc:topics` / `npc:marker` / `npc:follow` to npc, restore on
  `save:loaded` **and on a state replace** (`state.subscribe` reason `new` / `replace`: a new game
  from the title replaces the whole state, and the book must follow the new slice). State
  `systems.quests` (`QuestSlice` + `bestiary`). A restore never autosaves (at boot it would write
  an empty save before the title); accept / complete / fail / stance are forced autosaves.
  Known clues settle one tick after any accept / objective (`settleKnown`). On `story:chapter`,
  main quests of earlier chapters still running and unaccepted offers of earlier chapters are
  reset (chapter jumps; the e2e `test` chapter counts as after the campaign); side quests the
  player took keep running unless their chapter fails them. The book restores on a state `load`
  too (it fires before `save:loaded`, which reaches the story's resume first).
- Main quest always visible (playtest round 10, F-30 / F-41, `tests/quests-tracker.test.ts`):
  a running main quest is always in `tracked()` (a lost entry heals on read, `track(id, false)`
  ignores it, the journal shows no toggle for it). `mainOffer(chapter)`: with no main quest
  running, the main quest on offer (content order, current chapter first) heads the tracker
  (`.kqq-offer`, „Bei <Geber> annehmen“; deliberately not `.kqq-main`, so the story's line keeps
  leading to the giver). The journal's „Laufend“ is `journalRunning()`: running quests plus main
  quests on offer; with no main quest in it, the story's objective shows as „Hauptweg: …“.
- `hud.ts`: tracker (`hud.stack`, max 3, main first, `n/N`, "Zurück zu …" when ready; a done
  goal is struck through, then folds away), feed (`hud.dock('feed')`), banner (waits for the reward
  card and the chapter title card), reward card (EP stamp, items, codex facts with confidence +
  label; queued for the card director's slot: never over a conversation or a fight, gone after 5 s
  or when the player walks away; `kq.quests.rewardPending()`).
- `beacons.ts`: soft volumetric beam (view-angle edges, sparks) + pulsing ground ring over open
  objective zones (≤ 200 m, era tint, fades inside); the lead is gold, 90 m tall, ≤ 420 m.
- `wayfinding.ts` (pure, `tests/wayfinding.test.ts`): `objectiveTarget` (a place for every
  objective type, clue places from the content packs; none for a clue with `anchor: "portable"`,
  the tablet's nominal spot is no place: playtest round 10, F-25), `hintFor` / `storyHint`, `StallWatch`
  (60 s). `index.ts` picks the lead (`computeLead`: main quest, else the story objective, else side
  quests), drives compass + `hud.waymark` (`src/ui/waymark.ts`) + beacons and the stall hint;
  a goal behind walls leads door by door (`world.routeTo`, set by interiors: breadth-first over the
  plan's doors, out of a building by the outer door nearest the goal; label „Eingang: …“ / „Tür:
  …“); a second, smaller waymark (`waymark-side`) shows the nearest other tracked goal within 90 m;
  when the lead is the story's step before the quest goal (another era), the tracker shows it under
  the goal (`quest-via`). In a fight only the quest whose zone the player stands in stays listed
  (`quest:hint`). Hooks `kq.quests.lead/hint/stall`. Compass markers `kqq:obj`, `kqq:npc:<npc>` (offer / offer-main / ready
  shapes, givers within 150 m).
- `journal.ts`: the Journal modal (J / Tab, `chronik:open`, testid `journal`), tabs Aufgaben (10,
  running / done, objectives, Lohn, "Was erzählt wurde" with sources, the player's stance), Codex
  (20, all / new / relief-pattern filters, confidence D/I/N/U + FAKT/STRITTIG/LEGENDE/FIKTION,
  sources), Sammlungen (30, item sets + bestiary, all fiction). ←/→ and digits switch tabs.
  Progression's tabs (40, 50) plug in via `addJournalTab`.
- `audio.ts`: procedural cues (accept, progress tick, ready, complete). `strings.ts`: German text.
- Hooks `kq.quests.state/ids/offer/accept/progress/complete/turnin/reset/tracked/topics/mark/
  journal/closeJournal/journalOpen/reward/beacons/markers`. E2E `e2e/quests.spec.ts` (Hanne's
  test quest end to end, save/load, reset), `e2e/chronik.spec.ts` (Journal), screenshots `qst-*`.

#### combat (`src/systems/combat/`) – Messstab, Bannlicht, spectral enemies, four bosses

| File | Role |
|---|---|
| `rules.ts` | pure numbers and rules (costs, combo / Wuchthieb / dodge windows, hit-stop, shake, knockback, damage, armour and frontal checks, cones, attack tokens, leash, idempotent groups, time-of-day gating, boss phases, safe zones); `tests/combat.test.ts` |
| `sim.ts` | `CombatSim`: deterministic simulation fed a `SimInput` per fixed step (player resources, swings, the dodge with i-frames and the perfect-dodge slow-mo, Bannlicht cone, enemy AI idle → notice → approach → windup (≥ 0.5 s, `TELEGRAPH_MIN`) → strike → recover → retreat, flee / blink / flank / swarm / ranged / lunge / charge / lob, surround slots (`assignSlots`), a landing rhythm between blows, pack alert, escorts that drift off, boss `intro` and `roar` (untouchable: a blow emits `bossGuard`, not `immune` — index.ts captions it per boss „… – warte.“, `BOSS_GUARD`; the per-boss bounce line `BOSS_BOUNCE` after `BOSS_BOUNCE_AFTER` = 2 bounces; `BOSS_INTRO`), elites (enrage, `finishable`, the Gnadenstoß), leash and reset, max 12 live, ≤ 2 attack tokens — 1 in gentle mode; combat variety pass: front guards (`EnemyDef.guard`, `GUARD`), the veil (`ward`), the mirror (`EnemyDef.reflectsBann`, `cracked`, the player's `dazzle`), the call (`called` adds, interrupted by any blow), the second wave (`waveStep`), era hazards (`hazardStep`, `hazards`), the abilities (`SimInput.skill`, `SimOptions.skills`, `PlayerCombat.skill / cds`, `skillReady`) and the Bannlicht's one-blow bonus / repeat halving); returns `SimEvent`s; `tests/combat-packs.test.ts`, `tests/combat-variety.test.ts`, `tests/combat-balance.test.ts` (tank, masher and skilled bots per chapter from `tests/combat-bots.ts`) |
| `fightlog.ts` | fight metrics (docs/BALANCE.md): `FightLog` observes the sim's events each step and cuts them into fights (aggro / first blow → all engaged undone, the player down, or 8 s quiet); per fight: time to kill, damage and hits taken, **unfair** hits (the attack — body, ring or bolt — on screen < 0.25 s before it landed, off screen / no wind-up / short wind-up; needs `playerHit.src` / `attack`, `HurtSource` in sim.ts), wind-ups against the 0.25 s reaction time, dodges tried / successful, feedback per staff hit (hit-stop, flash, knockback, sound, particles, shake, numbers). index.ts feeds it with the real camera frustum: `kq.combat.report()` / `reset()`. The headless human-like bot `tests/combat-human.ts` uses it too (`pnpm sim:combat`, `scripts/sim-combat.ts`, writes docs/BALANCE.md §3; smoke test `tests/combat-human.test.ts`) |
| `packs.ts` | packs (fun pass): which group is pack-worthy, per-fight overrides from content (`EnemyGroupState.escorts` / `wave`, from a quest or story spawn: `[]` = none; prologue groups `q.p.*` get no escort or wave unless content says so — playtest round 5, `tests/combat-encounters.ts` reads every content fight for the balance test), the elite's index (`eliteDown` skips it), the mixed escort per kind (group `<id>+escort`, outside objective counting); combat variety pass: `waveOf` (the second wave), `callOf` (what a Rufer calls), `hazardOf` (era hazard) |
| `bosses.ts` | the four bosses' attack choice, cooldowns, weak points (Schuldbuch seal opened by the Bannlicht, Strohmann's back, Steinbrecher's joints, the Pikeur balking at water and leaving with „verloren“), summons |
| `rigged.ts` | `EnemyRigs` (medium / high): rigged spectral bodies for the Streuner (wolf), Raffschatten (human) and the Pikeur's horse + two hounds + the rider seated on the horse's Torso bone (legs turned after the mixer, tricorn drawn as solids) from `characters/catalog.ts`; clip by AI state and ground speed, spectral shader uniforms (core, telegraph, flash, dissolve), eyes at the head bone; template parts flagged `onRig` (coins) still draw, the rest becomes a faint smoke aura; the round 6 near-camera visibility (`occlusionVis`) fades a rig through `uAlpha` (≥ 30 %) like the procedural bodies; off on `low` |
| `visuals-shapes.ts` | sculpted unit-box geometries for body parts (shroud, mask, tail, limb, spike, flame, drop, orb, rock / rock2, crystal, block, sheaf, torus, page, wing; `aOut` outline push and `aSeam` per vertex; sheets double-sided without outline) |
| `bodies.ts` + `visuals.ts` | creature pass (2026-11-19): parts carry `shape`, a surface `mat` (`MAT`: plain, stone, straw, smooth, spectral, paper, mask, flame, crystal, rock), `hinge` (beats about a pivot), `sway`, `mx` mirror, `fray`; a template `core` the spectral shader sees through the body; one `SolidPool` per shape; a shaped part dissolves by a noise front with a burning edge. Before that: faceless procedural bodies (smoke / mist puffs, glows, instanced solids) per kind; pose from state (rear back in the wind-up, glow, swell); pooled particles (hit family, glance, dissolve into mist / sparks / smoke / ash / paper / rising grit, dust, motes); ground rings (area, rain, landing, gebannt, Bannlicht cone; red/white telegraphs, elite halo, finishable ring, running shockwaves); body channels `gait` / `turn` / `orbit` / `fire` (walking legs, turning pages, orbiting scraps, flame emitters); flinch, kill pop, boss burst, loot fountain; rims that contrast with the fog; budget by quality; round 6 readability: an inverted-hull **ink outline** round every solid (a second instanced draw sharing the instances, grown per axis by a fixed pixel width — dark on pale fog / sand / snow, fog-lit at night; no outline on chips or thin seams), firmer dark puff rims on bright backdrops, eyes / cores (min px ≥ 4) drawn after the ambient mist and less fogged, and a per-enemy **visibility** (`occlusionVis`: the camera inside a body's elliptical hull `hullOf` / `hullDistance`, or the body on the line to a `focus` point such as the boss under its reveal camera) that screen-door dithers solids and thins puffs and glows to ~30 %; combat variety pass: Foliant / Scherbling / Rufer bodies, the veil shell, the mirror core, guard sparks and a broken guard hanging open, the reflect beam, glass / veil shatter, fog columns where called ones rise, ember rain into fire rings and the falling block, the Erdstoß rings and cracks, the Wirbel ring, the Ausfall streak |
| `targeting.ts` | lock-on / soft target (`pickTarget`), the ground ring, off-screen chevrons (`.kqc-around`); `kq.combat.lock(id?)` / `target()` |
| `viewmodel.ts` | writes `actionPose` for the third-person avatar every frame; in first person: Messstab (red/white ranging pole; stages esche → eisen → silber → bann → lot with Laub's plumb bob on a chain), keyed swings with anticipation and follow-through, motion trail, heavy-charge glow; ability moves (thrust, ground drive, three-turn whirl); drawn in the main scene at `renderOrder` 1000 after a tiny mesh that calls `renderer.clearDepth()` |
| `audio.ts` | procedural sfx on the sfx bus (whoosh, thock + family layer, dissolve, telegraph calls, hurt, heartbeat < 30 %, dodge, Bannlicht shimmer, boss roar, the Pikeur's horn; fun pass: the boss sting on the music bus, boss down, Gnadenstoß, armour clank, the elite's call; combat variety pass: lunge, ground slam, whirl, guard knock / break, veil laid / torn, mirror ring / crack, the Rufer's call / choke, emerge, the wave's approach, ember hiss / stone grind and landing) |
| `hud.ts` | `hud.dock('vitals', …, 10)` Lebenskraft (notched red-orange) + Atem (pale blue), `dock('vitals', …, 20)` Bannlicht pips, `dock('vitals', …, 25)` the ability slots (glyph, key, conic cooldown ring, `setSkills`), `dock('boss')` boss bar with phase marks and the weak-point hint; layer `combat`: telegraph captions, damage numbers (setting „Schadenszahlen“), HP pips with *gebannt* tag (anchored on the crown, scaled by distance, nearer on top; elite name, „Gnadenstoß“ tag), the boss title card (`title` / `hideTitle`, timed in game seconds), edge arrows (`soundIndicators`; none while `hud.staged`), damage numbers capped in size (`clamp(…vh…)`) and placed beside the target's projected body (`placeNumber`, on the side their drift picked, above the crown when the body fills the view, below the boss bar), hit / low-HP vignette and the mirror's dazzle bloom (≤ 25 % with reduced flash); pip trait tags „Deckung“ / „Schleier“ / „Spiegel“ / „Rufer“; high-contrast CSS |
| `strings.ts` | German captions (one per telegraph), boss hints, info lines |
| `index.ts` | wiring: events in and out (see the diagram above), slice `state.systems.combat` (hp, stamina, bann, groups, deaths), `stats:changed` / `deriveStats` fallback, equip → weapon stage, `item:use` effects, `xp:grant` per kill, camera shake (none with reducedMotion), the boss reveal camera and death slow motion (none with reducedMotion), the lantern flare, death → `player:died` → `player:caught {by:'combat'}` → full heal on `player:teleport` (or after 8 s), heal on `hub:enter` and at the shift anchor; abilities by level (`skillsForLevel`; a new one rides on the level card through the card source `ability`, a toast only if no level card took it within 10 s of calm), keys `skill1–3` (T / Z(Y) / U, input.ts), the Ausfall's push through `player.impulse`; round 6 **camera clearance** (`cameraClearance`, after the reveal camera: when the camera ends up inside a big body's hull — a boss, a Steinfresser, a Foliant — the view eases out along the line from its axis, a little up, ≤ 3 m for a boss (to 1.3 × its hull), never under the ground; the player and the fight are untouched; `kq.combat.view()` reads the pull and each body's dither); `enemy:killed.by` maps the sim's `skill` / `hazard` to `heavy`; no `xp:grant` for called adds |

- **Interact wins LMB**: an attack from the mouse is ignored while any `.kq-prompt` is shown
  (npc / chronik / menagerie); K always swings. Attacks are also blocked while measuring, flying,
  frozen, in a modal or a conversation, and with `flags['combat.disabled']` („Du hebst den Stab nicht.“).
- **Safe zones** (`safeReason`): `combat.disabled`, the field station (40 m) / hub, active
  `memorial:set` areas, conversations, modals, 6 m around an NPC placed by `npc:spawn`. Enemies do
  not engage and swings glance off.
- **Time of day** for `group.time`: night if the era is a night era, the sky shows the moon or
  stars ≥ 0.6; dusk below 7° sun elevation.
- **Hunt** (`hunt/sim.ts` `PackSim.scatter`, `hunt/index.ts`): `combat:bann` scatters hounds in the
  cone for 4 s (they flee and cannot catch); they are never damageable. `hunt/lantern.ts` exports
  `lanternPose {side, lift}` — combat holds the lantern on the left and lifts it during a flare.
- **Menagerie**: attacks pass through animals (combat never targets them). A cassowary that
  charged past three times can be led home with E → `menagerie:calmed`; three Bannlicht flares
  drive a jaguar off for good → `menagerie:calmed`; calmed ids persist in `MenagerieSlice.calmed`.
- **Debug** `window.kq.combat`: `state() spawn(kind, opts) kill(groupOrId?) hit(n) bann() dodge()
  god(on) groups() enemies() place() windup() freeze() skill(id) hurt() heal() events() shake() sim()`.
- **e2e** `e2e/combat.spec.ts` (screenshots `test-results/screens/rpg-combat-*.png`),
  `e2e/combat-variety.spec.ts` (`s5-combat-*.png`: guard, abilities, mirror, call, hazard, wave).

#### progression (`src/systems/progression/`) – XP, levels, talents, items, loot, pickups

| Module | What |
|---|---|
| `logic.ts` | **pure** `ProgressionCore` over the slice + an emitter (tested in `tests/progression.test.ts`): XP × `stats.xp` capped at level 12, one `level:up` + one talent point per level, `flags['rpg.level']` via `setLevelFlag`; stack limits (consumables `stack`, weapons / charms / lore / keys 1, quest items 99, unknown quest ids 99); weapon auto-equip only when `weaponPower` is higher; charms fill `charmSlots(level)`; `use` → `item:use` (+ `lantern:request {lit, refill}` for oil / bann items); talents (`talentBlock`, respec); collections; codex +10 XP once per fact; seeded loot (`mulberry32(hash(enemy id) ^ drop counter)`, chance + `stats.loot` + bad-luck protection +6 % per empty roll ≤ 30 %); world pickups (place idempotent, taken ids never return, ≤ 40 drops kept) |
| `pickups.ts` | three.js pickups: billboard core with a glint (no fog, min. on-screen size, fades past 40 m), spinning token, rising motes, ground pool, light column for quest / lore / weapon / charm items; era tint; pop-in bounce, drops drift towards a player within 3.4 m, take = fly to the bottom of the view + burst (reduced motion: fade only) |
| `hud.ts` | `hud.dock('vitals', xp, 30)` (level medallion + brass bar with ghost gain, "+50" pop, brass ring pulse on level-up — no flash), `dock('vitals', quick, 40)` (key, glyph, name, count), `dock('feed', lines, 10)` (max 3 lines, fade after 4.2 s), floating "+N EP" at the `xp:grant` x/z |
| `levelup-card.ts` | "Stufe N" stamp card (centre, `top: max(170px, 24vh)`), merges several level-ups, chime on the stamp; game time; steps aside (`kqp-held`) while a story title card / curtain, a modal or a skill unlock card shows |
| `journal-tabs.ts` | `addJournalTab` 40 Ausrüstung (weapon, charm slots, supplies with "Auf H" / "Benutzen", quest items, lore with Fiktion / source label, derived numbers), 50 Talente (badge = unspent points; respec only at the field station, `hub:enter` / `hub:leave`) |
| `icons.ts`, `audio.ts`, `progression.css` | procedural glyphs, Web Audio sounds (pickup, level, use, collection), styles incl. high-contrast and reduced-motion rules |

Rules that came out of it:
- **Consumable split**: progression only decrements and emits `item:use {item}`; **combat** owns
  Lebenskraft / Atem / Bannlicht and applies the `ItemEffect` from `src/rpg/items.ts` (heal ×
  `stats.healing`, stamina, bann, Kalkstaub burst). Lampenöl's lantern refill is the one effect
  progression sends itself (`lantern:request`).
- **Stats**: `stats:changed {stats}` at boot, again on `game:start` (systems registered after
  progression miss the boot one) and whenever `deriveStats(slice, {gentle, rauhnacht})` changes.
- **Loot**: progression rolls on `enemy:killed`, emits `loot:drop`, then `loot:place` per item
  (ids `drop.<n>.<i>`); quest pickups come in as `loot:place` from quests / story and leave as
  `item:pickup {id}`.
- **E is shared**: walking over a pickup takes it (1.3 m, drops 1.9 m); E (`listen`) within 2.7 m only
  while the progression prompt is the one on screen — an NPC's or a clue's prompt wins. Pickups with
  `y` / `room` show only on that storey (|Δy| < 2.4 m).
- **Docks** (shared decision after the merge): `progression.css` narrows the vitals dock to 168 px; combat's
  rows stack label + number over a full-width bar to fit it, and `.kq-subtitles` at ≥ 900 px stay
  within `100vw − 400px` so they never cover the dock. The 168 px must clear the 190 px gutter the
  dialogue card leaves at 1024 px; the feed is capped to `min(300px, 30vw)`; `e2e/pol-flow.spec.ts` checks
  `hud-vitals`, `hud-boss`, `hud-feed`, the level card and a quest tracker outside the column.
- **Top-left column vs. vitals** (integration; zones in round 6): `hud.ts` sets the column's
  `max-height` from the bottom-left zone's top edge minus `ZONE_GAP` (ResizeObserver +
  MutationObserver, rAF-coalesced, and on every mode change); in a fight the tracker is compact,
  a column still too tall folds (`.kq-tl-tight`), and only then does `overflow-y: clip` cut the
  bottom with `.kq-tl-clipped` fading the last 34 px — a long tracker never runs into the
  Lebenskraft bars or the ability row (`e2e/readability.spec.ts` checks 1280×720, 1366×768,
  1920×1080 in a fight with a boss bar). The level card is pushed right of the column as far as the feed allows
  (`left: max(50%, min(column + 253px, 100vw − feed − 251px))`), and drops below a boss bar
  (`body:has(.kq-dock-boss:not(:empty))`). The quest reward card uses the same horizontal rule and steps
  aside while a chapter title card shows. The feed fades while a conversation page is open.
- **Journal**: the quests system's Journal modal (`data-testid=journal`) renders progression's tabs 40 / 50;
  I (`inventory`) opens it on Ausrüstung. Progression keeps a small "Feldbuch" fallback
  (`data-testid=journal-fallback`) that only opens if no modal and no Journal appeared within three
  fixed steps (i.e. never while quests is registered).
- **State** `state.systems.progression` (`ProgressionSlice` + additive `codexXp`, `placed`, `drops`,
  `dry`); rebuilt on `new` / `load` / `replace` (no cards). Hooks `kq.progression.state / xp / level /
  grant / equip / use / learn / respec / place / pickups / take / stats / card / feed / journal`.
- Tests: `tests/progression.test.ts`, `e2e/progression.spec.ts` (screens `prg-*.png`).

#### Chapters 3, 4 and the endings as quest chains (contentB)

- Content: `content/quests/03-kapitel-3`, `04-kapitel-4`.quests.json (main + side quests, chapter
  items) and the story files `03-kapitel-3`, `04-kapitel-4`, `05-enden`. Beats offer / start the main
  quests (`{do:'quest', op, id, onResume:true}`) and wait on `{quest:{id}}` (or an objective count:
  `k4_6` ends when the Steinbrecher falls and then starts the Steinfraß). No `confirmed`,
  `caseComplete` or `reading` condition is left; `k4_15` only runs `readings fill offen`.
- **Settle reactions**: the chapters carry `settle-*` reactions (`quest` active + clue in the
  inventory + objective 0 → `quest progress`). Since the integration the quests system also settles
  known clues itself one tick after any `quest:accepted` / `quest:objective` (`QuestBook.settleKnown`,
  before only on restore), so the reactions are a harmless second path (progress is capped). Side quests left open are failed at the chapter's end (`k3_9`, `k4_8`, `k4_14`).
- `flags['combat.disabled']` is set on entering `k4_11` and every beat after it, including `e1` / `e2`;
  `e2`'s exit (after the credits) clears it.
- Tests: `tests/quests-content-b.test.ts` (structure, stances vs. epilogue, no fights in the Festsaal /
  finale, a headless run of every quest and the XP curve), `e2e/chapter-k3.spec.ts`,
  `e2e/chapter-k4.spec.ts`, `e2e/campaign.spec.ts` (`CAMPAIGN_FROM=k3` works without a kept save);
  screens `cnb-k3-*.png`, `cnb-k4-*.png`. `K3_FROM=strohmann` (development only) lets the K3 spec skip
  the afternoon; its two afternoon side quests are then not checked.
- The e2e helpers click a reward card away (`clearCards`) instead of pressing E: in play E is the
  player's talk / examine key and would reopen the conversation.

### Input: keyboard, mouse and touch (`src/player/input.ts`, `src/ui/touch.ts`)

- **Actions, not keys.** Features read `input.isDown(action)` / `input.wasPressed(action)`. Keys come
  from `effectiveBindings` (defaults plus the player's remaps). Mouse look comes from pointer-locked
  `movementX/Y`, `addLook(dx, dy)` (the pilot and touch) and ← / → (`keyTurn.ts`).
- **Virtual presses.** `input.press(action, down, edge?)` holds a binding-independent code `@<action>`.
  Remaps and the shared-key pairs (LMB = attack + interact, Space = dodge + up) stay untouched, and
  the touch layer says per button which actions it means. `releaseVirtual()` drops every `@` hold.
- **Touch mode** (`input.touchMode`): `requestLock()` is a no-op, the "Ins Bild klicken" chip stays
  hidden, and the pause menu comes from a button, since Esc and losing the lock do not exist on touch.
- **`TouchControls` (`src/ui/touch.ts`)** is created in boot after the input.
  - Overlay `div.kq-touch`, z-index 14: above the canvas and the HUD, below feature layers (15), the
    title (20) and modals (30).
  - Shown only while `touch.active && playing`. Boot calls `setPlaying(started && no modal)` from
    `modals.onChange`, `startGame` and `toTitle`.
  - **Left 42 %:** a floating stick (`stickToMove`: W/A/S/D with diagonals, a dead zone, sprint at the
    rim when going forward).
  - **Elsewhere:** drag to look (`lookDelta`, ×1.8 before the mouse sensitivity). Multi-touch is
    tracked by pointer id.
  - **Buttons press actions:**
    - Hieb → `attack` + `interact`. Hold for the Wuchthieb; the ring fills in 0.45 s.
    - Ausweichen → `dodge` + `up`. It becomes "Steigen" while flying, and "Sinken" (`down`) appears.
    - Bannlicht, Ziel (`lockOn`), Balsam (`quickUse`), abilities 1–3. An ability button stays hidden
      until it is learnt (`skillUnlocked(n)` from boot: `skillsForLevel(progression.level)`, re-checked
      on `level:up`, `stats:changed`, `game:start` and `save:loaded`).
    - Interagieren → `listen`. Holding it is Lauschen; the pill carries the prompt's text.
    - Epoche → `shift`. Holding it returns; the ring fills in 1.2 s.
    - Top row: Relief (a popover for `scan1–3` / `scan0`), Feldbuch (`journal`), Karte (`map`),
      Pause (opens boot's pause menu), and Fliegen (`fly`, only in a spirit-view era).
- **Detection.** The setting "Touch-Steuerung" (`settings.touchControls`: `auto` | `on` | `off`, in
  Steuerung; declared by module augmentation in `touch.ts`, strings via `addStrings`).
  - Auto means `matchMedia('(pointer: coarse)')` or the first `pointerType === 'touch'` this session
    (touch laptops). `touchActive()` is the pure rule.
  - When active, boot sets `html[data-kq-touch]`. The CSS (`touch.css`) then disables pinch, swipe
    and selection, applies the `env(safe-area-inset-*)` insets to the HUD, and zooms the HUD to 0.78
    on screens under 500 px tall.
  - It also asks to turn a phone held in portrait.
- **Key names in text.** `actionLabel(input, action, slot?, fallback?)` (`src/ui/actionLabel.ts`)
  fills a caption's or toast's `{key}`: the key label on desktop, the touch button's German name in
  touch mode (`touchName`: Hieb, Ausweichen, Bannlicht, Ziel, Balsam, Aktion, Epoche, Feldbuch, Karte;
  abilities 1–3). Combat and progression use it instead of `keyLabel`.
- **Prompts.** `hud.setTouchIcons(fn)` turns a prompt's key cap into the icon of the answering
  button (`touchIconFor`: E → hand, Q → hourglass …). `hud.onPrompt(key, text)` lights that button.
- **Mobile tier.** On first run a coarse pointer gets `mobileLevel()` (`src/render/mobileDefaults.ts`):
  Niedrig on phones (short side < 600 px) and mobile GPUs, Mittel on big tablets with ≥ 6 cores.
- **Icons** are inline SVG drawn for the project (`src/ui/touchIcons.ts`); there are no external assets.
- **Tests:**
  - `tests/touchMap.test.ts`: stick, look, mode, icons, mobile tier, and `Input.press` / no lock in
    touch mode.
  - `e2e/touch.spec.ts`: iPhone 13, Pixel 7 and iPad Pro 11 in landscape, CDP touch events. Walk,
    look, two fingers, hit, field book open and close, pause, then title → new game by taps and
    "Touch-Steuerung" Aus / Auto. Screens: `touch-*.png`.
- **Phase 2 (open):**
  - analog movement
  - captions and toasts that still name keys ("Maus rechts", "G")
  - abilities shown before they unlock
  - aim assist, auto-lock and camera follow; perfect-dodge 0.20 s on touch
  - iOS audio session, PWA, the Minimal tier, real-device tests

## 13. Licences

Code: project licence. Fonts: IM Fell English (Igino Marini) and Caveat, SIL OFL 1.1 (texts in
`src/ui/fonts`). Data: © GeoBasis-DE/LVGL-SL dl-de/by-2-0 (DTM, CHM, historic maps), OSM ODbL,
palace reconstruction from the sister project; all listed in-game under „Lizenzen & Quellen“.
Art assets (D-009): CC0 1.0 only, each recorded in `public/assets/LICENSES.json` (read by
`ctx.assets.licences()` at boot, shown in „Lizenzen & Quellen“ under „Grafik“, checked by
`tests/assets.test.ts`); the Draco / Basis decoders bundled from three.js examples are Apache-2.0.
