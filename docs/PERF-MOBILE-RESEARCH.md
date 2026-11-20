# Fans, quick wins, mobile (research, 2026-11-20)

Method: code read plus one headless real-GPU run (scratchpad build on port 5320, ANGLE Metal, M5 Pro, 1512×982 @2x like a 14" MacBook Pro, uncapped). Another session was using the GPU at the same time, so the absolute numbers are pessimistic. The ratios hold. Raw data: `scratchpad/out/measure.json`.

## A. Why the fans spin

- **No frame cap.** `core/loop.ts` `start()` renders on every rAF: 120 Hz in Chrome and Firefox on ProMotion (Safari defaults to 60). There is no fps setting.
- **Rendering never idles.** `loop.frame()` always calls `render()`. Pause stops only `update()`. The title, pause menu, journal, map, dialogue modals and `?manual` bullet time all render at the full rate. Measured: with the pause menu open, Hoch still drew 60 fps at an unchanged cost.
- **Retina resolution.** Hoch's `maxDpr` of 1.5 gives a 3.3 MP buffer (2.6× what the docs measured). Each frame adds 4× MSAA on RGBA16F, half-res SAO and a 5-level bloom. That is about 290 MB of render targets.
- **Every pass, every frame.** The 2048² shadow pass and the planar water reflection each re-render the scene. `SunShadows.every` exists, but nothing sets it.
- **Blind auto-downgrade.** It only acts after 6 s of average frame time above 25 ms. Under vsync a saturated GPU still reads 8 or 16 ms, so it never fires. It never steps up and ignores heat and power.
- **First run.** `suggestLevel` gives an M-series Mac **Hoch**.
- **Minor:**
  - The AudioContext never suspends: hidden tabs keep running HRTF and wind, and combat creates one panner per hit.
  - The e2e budget only tests **low** (SwiftShader forces it). Hoch draws 2.2 to 3.2 M triangles, about 2× `PERF_BUDGET`.

**Uncapped fps (GPU-bound):**

| View | Hoch | Mittel | Niedrig |
|---|---|---|---|
| Title | 65 | 95 | 242 |
| Densest forest | 65 | 102 | 178 |
| Palace 1789 | 59 | – | 362 |

Hoch variants in the densest forest:

| Variant | fps |
|---|---|
| pr 1.0 | 88 (+36 %) |
| Shadows every 2nd frame | 72 (+12 %) |
| Paused (menu open) | 60, unchanged |

On a 120 Hz screen, Hoch and Mittel therefore run the GPU at **100 % all the time, menus included**.

## Ranked quick wins

| # | Change | Effect | Effort | Risk | Where |
|---|---|---|---|---|---|
| 1 | **"Bildrate 30 / 60 / unbegrenzt"**, default 60. Skip rAF ticks; snap to a divisor of the display rate. | Halves work at 120 Hz. Hoch drops to roughly 60–90 % busy. | 2–3 h | Low. The fixed step catches up, and the raf is injectable, so it is testable. | `loop.ts` `start()`; `save.ts` `Settings`; `ui/settings.ts`; `de.ts`; `boot.ts` `applySettings` |
| 2 | **Idle rendering.** Covering modals: draw once, then stop. Live modals: 15 fps. Title: 30 fps at pr 1. `?manual`: only the pilot's `renderOnce` plus 2 fps. Suspend audio when hidden. | Menus and bullet time cost about 0 | 3–5 h | Low to medium. NPC framing animates behind modals, so add a modal `backdrop: 'still' or 'live'` flag. | `loop.ts` `frame()`; `boot.ts` render, `modals.onChange`, `visibilitychange`; `ui/modal.ts`; `audio.ts` |
| 3 | **Retina cap:** Hoch 1.5 → 1.25, Mittel 1.25 → 1.0 | 15–27 % less GPU per frame | 0.5 h | Slightly softer image | `quality.ts` `QUALITY_PRESETS` |
| 4 | **"Energiesparen":** 30 fps, pr 1, MSAA ≤ 2×, no AO or reflection, shadows every 2nd frame. On Chromium, a toast when `getBattery()` reports discharging (no Battery API in Safari or Firefox). | About 80 % less GPU than today | 3–4 h | Low. Make it a boolean overlay, not a new level. | `quality.ts` `apply`, `pixelRatioFor`; `save.ts`; `settings.ts` |
| 5 | **Shadows every 2nd frame** on Mittel and Hoch, re-rendering at once when the focus moves | +12 % | 1 h | One-frame lag on moving casters | `QualityPreset.shadowEvery`; `shadows.ts` `update` |
| 6 | **Auto-quality on missed frames** relative to the cap, with hysteresis, optional Compute Pressure (Chromium), and an optional step up | Catches hot laptops and slow iGPUs | 2–3 h | Oscillation | `quality.ts` `AutoQuality`, `QualityManager.frame` |
| 7 | **First run on Apple or integrated GPUs → Mittel** | About 60 % of Hoch's GPU cost | 1 h | Fewer effects | `suggestLevel` |
| 8 | **Dynamic resolution**, 0.6–1.0, driven by missed frames (timer queries: none in Safari, inflated on Metal) | Key for weak GPUs | 6–10 h | Visible resolution pumping | `quality.ts`, `post.setSize` |

**A true low-end "Minimal" tier (UHD 620, a 5-year-old phone).** Today's Niedrig takes about 5 ms on the M5 Pro, which works out to about 15–20 fps on a UHD 620 at 1080p. It would need:

- render scale 0.6–0.75 and 30 fps
- a `KQ_MIN` shader variant: fewer fbm octaves in the terrain and palace, no shadow sampling
- an RGBA8 or direct-to-canvas path instead of the half-float HDR target plus composite pass
- a shorter tree ring
- a `webglcontextlost` handler (none exists today)

Effort: 2–3 days.

## B. Mobile

**Verdict: no** for play, **partly** for menus. Emulated iPhone 13 and iPad:

- **What works:** the title and the content note work by tap and lay out fine at 390 px. Touch devices get Niedrig at pr 1.
- **What breaks:**
  - **Look:** only through pointer-locked `mousemove` (`input.ts`). A swipe did not turn the view.
  - **Movement:** there is no stick.
  - **Actions:** Bannlicht is right-click. Dodge, Balsam, interact, era shift (hold), journal, map and lock-on are keys.
  - **Wuchthieb hold:** iOS fires mousedown together with mouseup, after the finger lifts.
  - **Pause:** reachable only through Esc or losing pointer lock, so it is **unreachable** on touch.
  - **Prompts:** they show keys, and the "Ins Bild klicken" hint never goes away.

**Control scheme.** Add `src/player/touch.ts`, feeding `Input.simulate()` with virtual codes and `addLook()`. No feature system changes.

| Zone | Control |
|---|---|
| Left half | Floating stick. MVP maps it to W/A/S/D; analog later. Push to the rim to sprint. |
| Right half | Drag to look |
| Thumb arc | Attack (tap for Hieb, hold for Wuchthieb, with a charge ring), Dodge (along the stick), Bannlicht, Lock-on (tap to cycle, long-press to release), Balsam, Skills 1–3 |
| Contextual | An interact button labelled with the prompt text. A hold button with a radial fill for the era shift. |
| Top | Pause, journal, map, lantern, a tool wheel |

Combat assist:

- wider soft target (`targeting.ts`: `SOFT_RANGE` 9 m, `SOFT_DEG` 110°)
- auto-lock on bosses and on aggro
- camera yaw follows the character while moving
- perfect-dodge window 0.15 → 0.20 s on touch (`DODGE.perfect`; record it in BALANCE.md)
- optionally a Gamepad API mode (1–2 days)

**Budget and caveats:**

- **Memory:** about 180 MB JS heap on Niedrig (307 MB on desktop Hoch). The palace is held twice. Safari silently reloads a tab that runs out of memory.
- **Thermals:** cap at 30 fps. Safari's Low Power Mode limits rAF to 30.
- **Browser features:** WebGL2 needs iOS 15 or later. Safari has no timer queries, shows "Apple GPU" as the GPU name, and has no element fullscreen on iPhone (use a PWA manifest). Needs `viewport-fit=cover` plus safe areas.
- **Audio:** the silent switch mutes Web Audio unless `navigator.audioSession.type = 'playback'` is set.
- **Gestures:** set `touch-action: none` against pinch and swipe-back.

**Phases:**

| Phase | Scope | Effort |
|---|---|---|
| 0 | Wins 1–4, context loss, viewport and gesture CSS | 1–2 d |
| 1: tablet MVP | Touch layer, buttons, pause/journal/map, touch prompts, HUD layout, assist, real-iPad test | 5–7 d |
| 2: phone | Analog movement, compact notch-safe HUD, Minimal tier and dynamic resolution, memory pass, iOS audio, PWA, real-device tests | 8–12 d |

**Risks:**

- combat readability on 6" screens
- thumbs covering the HUD
- reading the text-heavy UI
- iOS reloads and shader-compile hitches
- no devices in CI
- touch laptops: show the touch UI only after a touch event

## Order

1. Wins 1–3 (about 1 day; fixes the fans).
2. Wins 4–5.
3. Win 6.
4. Tablet MVP.
5. Minimal tier and dynamic resolution.
6. Phone.
