---
id: TASK-005
aliases:
- TASK-005
title: 'Smartphone: pull-out animation into camera mode'
slug: smartphone-pull-out-animation-into-camera-mode
status: todo
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
updated: 2026-11-23
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

## Optional ideas
- Phone screen shows the live camera image (render target) during the raise.
- A small sound: fabric rustle, then the camera app click.
- NPCs react when you point the phone at them (look, wave), using the existing `Wave` clip.
- In past eras ("Kein Netz") the screen flickers before showing the white picture.

## Notes
- In-game text stays German. Update `docs/ACTION-RPG.md` §14 and the `docs/PRD.md` changelog (CONTRIBUTING.md).
