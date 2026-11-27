---
id: TASK-005
aliases:
- TASK-005
title: 'Smartphone: pull-out animation into camera mode'
slug: smartphone-pull-out-animation-into-camera-mode
status: in-progress
priority: 3
owner: ''
projects: []
customers: []
tags:
- feature
- community
- animation
- ux
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-27
---

# Smartphone: pull-out animation into camera mode

## Description

Owner idea: make the in-game smartphone feel physical. When the player opens the phone, the avatar
takes the smartphone out of a pocket and raises it, then the view moves smoothly into camera mode.

### How it works today

- **Photo mode:** `src/systems/photo/index.ts` (core and judging in `core.ts`, targets in
  `content/photo/targets.json`). **N** (or the touch camera button) toggles the phone. Opening
  emits `photo:open` and calls `CameraRig.setPhoto(true)`; closing emits `photo:close`. It is
  blocked in dialogue, menus, fights (`cameraHints.fight` / boss: toast "Nicht im Kampf. Erst die
  Hände frei."), cut scenes and camera overrides. Forced closes snap the lens back (`lensDown`).
- **Camera:** `src/player/camera.ts`. `setPhoto(true)` puts the lens at the eyes, a hand ahead of
  the face (`PHOTO_AHEAD`), and **hides the character** (boom 0). The switch is instant today; only
  the 1×/2× zoom eases (`setFovScale`, skipped with reduced motion). Tests: `tests/camera-photo.test.ts`.
- **Avatar:** `src/player/avatar.ts`. One `AnimationMixer`, locomotion plus a separate upper-body
  layer (swings, drinking, examining play over walking legs). Drinking reuses the `Interact` clip
  (`A.drink`). Props are attached to bones with `attachAt(rig, bone, ...)`, e.g. the Messstab on
  `hand_r`. Bones are looked up by logical name (`src/systems/characters/bones.ts`, `rig.ts`), so
  both the MPFB player and the CC0 surveyor work.
- **Clips:** the MPFB player is built in Blender (`scripts/chars/README.md`, `scripts/chars/mpfb/`,
  `retarget.py`). Its clips (Idle, Walk, Run, Interact, Wave, ...) are retargeted from the Quaternius
  surveyor and packed with `pnpm assets:pack ... --anims ...`. There is no phone clip yet.
- **Touch:** `src/ui/touch.ts` has the phone button (`touch.photo`, "Handy-Kamera"); while the phone
  is up, the attack button is the shutter. See `docs/MOBILE-UI-PASS.md` for the earlier mobile UI pass.
- **Settings:** `reducedMotion` in `src/core/save.ts` (defaults from `prefers-reduced-motion`), toggle in `src/ui/settings.ts`.

### Proposed flow

1. Input (N / touch button), same blocking rules as today.
2. Reach into the pocket: an upper-body clip (new clip, or a procedural pose on the arm bones like
   the existing overlays), legs keep their locomotion.
3. Phone in hand: attach a small phone mesh to `hand_r` (or `hand_l` if the staff is in the right
   hand) with `attachAt`, shown from the moment the hand leaves the pocket.
4. Raise the phone towards the face.
5. Camera blend: ease the boom from the third-person position into the phone's first-person lens
   (`setPhoto`), and hide the character only at the end of the blend.
6. Camera UI (frame overlay, zoom chips) fades in; the shutter becomes active.
7. Closing reverses it: UI out → camera back out → lower the phone → back into the pocket → mesh hidden.

### Constraints

- Short: about **1 s or less** in total, and skippable (pressing N again, or the shutter, jumps to the end).
- **Never blocks input in combat.** A forced close (fight starts, hit, cut scene, death, era change)
  must still close instantly, as `lensDown` does today.
- **Reduced motion:** no camera blend; cut straight to camera mode (a short fade at most).
- **Mobile:** works with the touch button and the touch layout from the mobile UI pass; check a phone-sized portrait and landscape view.
- First-person camera setting (`?cam=first`): no avatar visible, so only the phone raise / UI fade applies.

## Acceptance Criteria
- [ ] Opening the phone plays reach → phone in hand → raise → camera blend → UI, in about 1 s or less
- [ ] Closing plays the reverse; the phone mesh is gone afterwards
- [ ] Pressing N / the button again during the animation skips to the end state
- [ ] Forced closes (combat, cut scene, death, era change) are instant and never leave the camera half-blended
- [ ] With reduced motion on, there is no camera blend
- [ ] Works on touch (button, shutter) and in first-person camera mode
- [ ] Works with both avatars (MPFB player and `?avatar=surveyor`)
- [ ] Any new clip or phone mesh is CC0 / own work, packed with `pnpm assets:pack`, credited in `public/assets/LICENSES.json`
- [ ] Tests updated or added (`tests/camera-photo.test.ts`, `tests/photo.test.ts`, `e2e/photo.spec.ts`)
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Plan
_Status: approved 2026-11-27_

**Approach:** A small, pure timeline (`PhoneRaise`) drives the whole move from wall-clock frame time: reach to the pocket, phone in the right hand, raise, camera blend, viewfinder fade-in. Closing plays it backwards. The photo system owns it. It writes two numbers that the avatar and the camera read, like the existing `actionPose`: `raise` (arm and phone) and `lens` (camera blend). The arm uses the upper-body `Interact` clip, which drinking already scrubs, so the legs keep walking. The phone is a small procedural mesh (own work, no asset file) on a `hand_r` anchor. The right hand is always free here, because the phone can't come up in a fight. The camera eases from its third-person spot to the phone lens and hides the character only at the end. N or the shutter during the move jumps to the end. Every forced close (fight, cut scene, death, era change, pause) snaps everything shut in the same frame, as `lensDown` does today. Reduced motion and first person skip the blend: a cut to the lens, with only the viewfinder fade.

**Files to touch:**
- `src/systems/photo/raise.ts` (new) - the pure `PhoneRaise` timeline: phases closed / opening / open / closing, `tick(dt)`, `skip()`, `snapShut()`, outputs `raise`, `lens`, `ui` (0..1). Opening about 0.9 s, closing about 0.7 s; reduced motion and first person: `lens` jumps.
- `src/player/pose.ts` - `phonePose { raise, inHand }` next to `actionPose`.
- `src/player/camera.ts` - `setPhotoBlend(k)`: in photo mode with k < 1 in third person, the camera is placed as usual and then eased (smoothstep) towards the lens. `distance` follows, so the avatar stays visible until the end. k = 1 is today's lens.
- `src/player/avatar.ts` - the phone mesh on a `hand_r` anchor, shown while `inHand`. The upper-body `Interact` scrubbed by `raise` (pocket → face) over the walking legs, below fights and drinking in priority.
- `src/systems/photo/index.ts` - `open()` / `close()` drive `PhoneRaise`. N, the touch button and the shutter skip during the move; forced closes snap. The `kq.photo.open()` test hook stays instant, so existing specs keep working. A shot always snaps to the end state first, so judging uses the lens. `photo:open` / `photo:close` still fire at the start, as today.
- `src/ui/styles.css` - the viewfinder fades in and out (about 150 ms), none with reduced motion.
- Tests: `tests/photo-raise.test.ts` (new), `tests/camera-photo.test.ts`, `tests/photo.test.ts`, `e2e/photo.spec.ts`.
- Docs: `docs/ARCHITECTURE.md` (photo, camera, avatar), `docs/ACTION-RPG.md` §14, `docs/PRD.md` changelog.

**Steps:**
- [x] 1. `PhoneRaise` timeline with unit tests (durations ≤ 1 s, reverse, skip, snap shut, reduced motion, first person).
- [x] 2. Camera blend in `CameraRig` with `tests/camera-photo.test.ts` (k 0 = third person, 1 = lens, in between on the line; first person ignores it).
- [x] 3. Photo system wiring: animated open / close, skip, forced snap, instant hook, shots snap to the end, viewfinder fade; `tests/photo.test.ts`.
- [x] 4. Avatar: phone mesh and arm pose. Find the `Interact` frames for pocket and face on both avatars (MPFB and `?avatar=surveyor`), checked with screenshots; if the clip doesn't fit, a procedural turn of the arm bones instead.
- [ ] 5. Touch and phone views (button, shutter skip, portrait and landscape), first-person camera (`?cam=first`), reduced motion.
- [ ] 6. `e2e/photo.spec.ts`: KeyN shows the avatar with the phone mid-move, then the viewfinder; N skips; an era change mid-move closes at once. Plus the specs that open the phone (`animals`, `minimap`, `tour-slice`).
- [ ] 7. Docs.
- [ ] 8. Gates, e2e, after screenshots.

**Test plan:**
- Unit: `pnpm exec vitest run tests/photo-raise.test.ts tests/camera-photo.test.ts tests/photo.test.ts`.
- e2e: `pnpm build && pnpm exec playwright test e2e/photo.spec.ts e2e/animals.spec.ts e2e/minimap.spec.ts --workers=1`, plus the deer-photo test in `e2e/tour-slice.spec.ts`.
- Gates: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`.
- Manual: `http://localhost:5280/?debug&nosave&fresh&notitle`, press N while standing and while walking: hand to the pocket, phone up, camera glides in, viewfinder. Press N again to close. Repeat with `&avatar=surveyor`, `&cam=first`, reduced motion on, and on a phone-sized view with the touch button.
- Screenshots (real GPU, desktop): before, the frame just before N and 0.2 s after (already in camera mode). After, frames at about 0.2 s, 0.5 s and 0.8 s after N, for both avatars, plus a phone-sized portrait and landscape view.

**Risks:**
- The `Interact` clip may not read as "phone out of the pocket"; then the arm bones are turned procedurally (the rig already turns bones for crouching). That fallback works on both rigs through the logical bone names.
- A shot or a forced close mid-move: handled by snapping. The unit and e2e tests cover both.
- The blend passes along the swept, wall-checked boom line, so it never goes through a wall.
- Specs that open the phone through `kq.photo.open()` stay instant; only the e2e test uses the animated path.

**Out of scope (follow-ups):** the live camera image on the phone screen, sounds, NPC reactions, the „Kein Netz“ flicker (the task's optional ideas).

**Open questions:** none. The phone mesh is made in code (a small box with a screen), so there is no asset file to credit.

## Optional ideas
- Phone screen shows the live camera image (render target) during the raise.
- A small sound: fabric rustle, then the camera app click.
- NPCs react when you point the phone at them (look, wave), using the existing `Wave` clip.
- In past eras ("Kein Netz") the screen flickers before showing the white picture.

## Notes
- In-game text stays German. Update `docs/ACTION-RPG.md` §14 and the `docs/PRD.md` changelog (CONTRIBUTING.md).

## Progress

- Branch: `feat/task-005-phone-pull-out`
- 2026-11-27: before screenshots (real GPU, Iris Xe) in `test-results/contribute/TASK-005/`: free roam at x 704, z -779; the frame before N (character from behind) and right after N (already in camera mode, no move in between). Note: a GPU screenshot takes about 2 s, so the after frames are taken with `?manual` and `kq.step` at fixed times.
- 2026-11-27: step 1 done - `src/systems/photo/raise.ts`: `PhoneRaise` (one progress value, open 0.9 s = reach 0.3 + raise and glide 0.45 + viewfinder 0.15; close 0.7 s, the same curve backwards; a cut of 0.15 s for reduced motion / first person) and the pure `raiseAt(p, cut)`. `tests/photo-raise.test.ts` (7): order of hand / lens / viewfinder, reverse, skip, forced snap from anywhere, turning round, the cut, broken frame times.
- 2026-11-27: step 2 done - `src/player/camera.ts`: `setPhotoBlend(k)` and `setPhoto(on, glide)`; with photo on and k < 1 in third person the usual camera is placed, then moved k of the way to the lens and the player's own look (`lensSpot()` factored out of `placePhoto`); `glide` keeps the boom running instead of resetting it; first person always cuts to the lens. `tests/camera-photo.test.ts` (+4): k 0 / 0.5 / 1, gliding out lands on the plain third-person camera with no jump, first person, a broken k.
- 2026-11-27: step 3 done - `src/systems/photo/index.ts`: `open(instant)` starts the raise (cut for the hook, reduced motion, first person, flying); `close()` plays it back, `close(true)` snaps in the same call, also mid-move (`finishClose`); `frame()` ticks it and hands `lens` to the rig, `raise` / `inHand` to `phonePose` (`src/player/pose.ts`), `ui` to the viewfinder's opacity; N during a move skips, the shutter during the opening skips and takes no picture, `shoot()` only from camera mode; `lensDown(…, glide)`. The viewfinder fade is the element's opacity from the timeline, so no CSS change was needed. Plan change: the system tests went into `tests/photo-hud.test.ts` (it has the photo system harness; +6: the move, skip by N and shutter, closing, forced close mid-opening and mid-closing, the cut, the instant hook); `tests/session-resources.test.ts`: its fake rig has `setPhotoBlend`.
- 2026-11-27: step 4 done - `src/player/avatar.ts`: a phone made in code (dark body 7.2 × 15 cm, a lit screen towards the holder) in the right hand's grip anchor, shown while `phonePose.inHand` and never with the staff in that hand; the upper-body `Interact` scrubbed from 0.04 (hand at the hip pocket) to 0.55 (arm held out at shoulder height, phone upright) by `phonePose.raise`, after drinking in priority; `kq.avatar.state().phone`. The clip times were picked from side, back and close views on both avatars (MPFB and `?avatar=surveyor`, probes in `test-results/contribute/TASK-005/`). The real N flow, frame by frame (`?manual&holdvisuals`, one `kq.step(1)` per 1/60 s): 0.2 s reaching, 0.4 s phone in hand (glide 0.13), 0.6 s glide 0.74 over the shoulder, 0.8 s camera mode.
