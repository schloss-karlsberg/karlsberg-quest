---
id: TASK-100
aliases:
- TASK-100
title: Fix the first 15 minutes of the guided tour
slug: first-15-minutes-playtest-fixes
status: review
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tour
- ux
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Fix the first 15 minutes of the guided tour

## Goal

Address the fresh-game playtest on main at db8b1b8d, through the first visit to the Bleiche.

## Acceptance criteria and plan

- [x] F2. Open passages between car-park visitors, with multi-direction collision regressions.
- [x] F3. Align the coat marker with a working interaction spot and brief the player on approach.
- [x] F5 and F10. Switch goals at the first shift and share the group target between HUD indicators.
- [x] F8 and F9. Pace clink captions and show the full goal as it wraps.
- [x] F12. Deliver the throw hint with the first pickup.
- [x] F7 and F11. Check the scripted compass grant and recorded dialogue before changing either.
- [x] Run the four gates and push the branch for review. Update the affected browser specs for CI.

## Progress

- Branch `fix/first-15-minutes`.
- F2. Spaced the gathered arcs for player clearance. The car-park regression reproduced the stall on the baseline and now passes from 16 headings, including starts inside the ring. The authored Felsenpfad and Quelle slots also clear the player width.
- F3. The story and quest point to the existing reach spot behind the second line. Laub opens the 1789 arrival with the brief. Chapter 2 has a 30 m fallback for arrivals that missed it. The disguise spec checks the approach and takes the coat from its marked spot.
- F5. „Laub zuhören“ replaces the trough goal on arrival and stays in the HUD through the chapter card and dialogue. The runtime and tour spec check both moments.
- F10. The story HUD reads the moving waypoint used by the group marker and uses its distance format. Unit and tour coverage check both indicators.
- F8. The glass sound keeps its cue cadence. The first caption is immediate when the sound plays, and later captions are at least 30 seconds apart.
- F9. Removed the objective text wipe that clipped the line. The tour spec checks the first arrival frame and wrapping in the HUD column.
- F12. The first non-debug chestnut pickup shows the one-time help in the HUD alongside the controls. The unit test exercises desktop and touch with the cut tip and dialogue already active.
- F7. The proximity handover at the trough is deliberate per the tour design. The optional E route and both grants still use the existing tour beat.
- F11. Laub's arrival line and the coat quest refer to the default red jacket. The arrival line has no entry in the voice manifest. Regenerated the chapter pack and quest files.
- The four gates passed. Vitest reported 245 files, 2,742 passing tests, 17 todo and zero failures. Content validation reported 0 errors and 29 warnings. The production build transformed 504 modules.
- Updated `e2e/tour-slice.spec.ts` and `e2e/chapter-k1-disguise.spec.ts`. Playwright collected all five cases. Browser execution is pending in CI, whose selector requests the full suite.

### PR #151 review round

- Integrated the train's chapter numbering, Liese's coat rules, daytime oil fix, present-day tripods, throw cancellation and completing dialogue. Kept the reachable-side coat target.
- F3. Made the Bleiche brief the first line of the 1789 arrival and kept the recorded exchange and Bussole-page line. The runtime test follows the trail at sprint speed and checks that the presenter starts the line before reaching the linen, with and without reduced motion. Chapter 2 retains the approach trigger for saves that missed the tour brief.
- F3 and F5. The coat marker and Bussole bearing, „Rock nehmen“ and Liese’s watch all open in `k1_0b`. A player already inside the watch circle has two seconds of game time before detection can trigger. Saves from the early-pickup revision credit any coat already taken when the quest opens.
- F10. Pointed the Bussole at the resolved route target and restricted world-marker rounding to the moving group. The door regression distinguishes the foot of the steps from the marker in the opening.
- F12. Verified the pickup hint on desktop and touch while throw is muted, alongside the train’s held and buffered throw cancellation tests.
- The tour and disguise browser expectations are covered by CI. Playwright was reserved for CI in this round.

## Follow-ups

- F2. Test dog occupancy in the car-park passages and give settled dogs positions clear of those gaps. Dog positions follow Jost and use their own avoidance, so visitor slot spacing alone cannot reserve the passage.
- Exercise the sprint from the jump with actual movement, collision and audio playback. The unit test drives position and checks when the dialogue presenter starts the brief.
- Exercise saving and resuming the arrival just after the chapter card with the card mounted. The runtime fixture does not render a connected card.
- Review Laub’s „In Rot“ and coat instruction when loading a branch save with the disguise already applied. The regular arrival plays those lines before coat pickup is available.
- Reproduce early access to Liese’s favour using a save from an unmerged PR #151 revision with her NPC placement saved in `t18`, and use an exact filtered-list assertion in `tests/tour-handover.test.ts` to require exactly one resumable shift.
