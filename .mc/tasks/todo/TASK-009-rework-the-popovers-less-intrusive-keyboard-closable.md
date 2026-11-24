---
id: TASK-009
aliases:
- TASK-009
title: 'Rework the popovers: less intrusive, keyboard-closable'
slug: rework-the-popovers-less-intrusive-keyboard-closable
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- ux
- ui
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-24
---

# Rework the popovers: less intrusive, keyboard-closable

> Core dev team task (not community).

## Description

The owner doesn't like the current popovers: too many, too intrusive, and not all close the same way.

### Inventory (today)

| Kind | Where | Triggered by | Closes today |
| --- | --- | --- | --- |
| Modal panels (journal, map, settings, codex card, clue page, news, licences, chronik card, court, notes) | `src/ui/modal.ts` (`ModalManager`), users in `src/ui/menus.ts`, `news.ts`, `src/systems/quests/journal.ts`, `chronik/`, `court/`, `notes/`, `travel/`, `progression/` | keys / menu / story | Escape, close button, backdrop (if `closable`); focus trapped with Tab |
| Centre cards: clue, quest reward, level-up, skill unlock | `src/ui/cards.ts` (card director: one at a time, queued, held during fights / talk), `src/systems/quests/hud.ts` (reward), `src/systems/progression/levelup-card.ts` | quest done, level up, clue | reward: timer, or E / Enter / Space **only over a conversation**; others: timer / click |
| Toasts | `HUD.toast()` in `src/ui/hud.ts` (2.6 s), quest feed rows in `src/systems/quests/hud.ts` (2.6–4.2 s) | many systems | fade only |
| Key prompts / tutorial hints | `HUD.prompt()` in `src/ui/hud.ts` (owner-based, "low" prompts yield); story action `"do": "prompt"` (12 in the tour, `content/story/00-tour.story.json`) | story beats, proximity | replaced or cleared by the story (`key: null`); not dismissable by the player |
| Story overlays: chapter title card, "caught" curtain, timed choices, gauges | `src/systems/story/overlays.ts` | story | timer; choices by click / keys; fallback when the fuse runs out |
| NPC conversation panel | `src/systems/npc/ui.ts` | E at an NPC | Enter / Space / E advance, 1–n choose, "Auf Wiedersehen" |
| Photo card (stars + verdict) | `src/systems/photo/index.ts` | shutter | timer 3.2 s |
| Hub overlay at the Quelle | `src/systems/story/hub/overlay.ts` | E at the spring | modal (to be removed by TASK-007) |
| New-game flow screens | `src/systems/story/title/flow.ts` | title | buttons |
| "Click to play" hint | `HUD.showClickToPlay()` | pointer lock missing | pointer lock |

Gamepad: not supported yet (README); add close paths when gamepad input exists. Touch: `src/ui/touch.ts`.

### Minimum fix

- Every popover closes with **Escape**, and with **Enter / Space / E** where those keys are not needed by gameplay at that moment (follow the NPC panel's convention); on touch with a tap outside.
- No focus trap or input block unless the popover is truly modal; cards and hints never stop movement.
- Gamepad close (B / A) once gamepad input lands.

### Better fix (proposal)

Classify each kind as one of:
- **non-blocking toast / hint** that fades (most feedback, rewards, photo verdict, unlocks),
- **in-world / HUD prompt** (interaction keys, tutorial hints next to the action),
- **real modal** (rare: settings, journal, map, a clue page the player asked for, choices).

Also: cut redundant popovers (e.g. reward card + toast + feed row for the same event), never stack
(extend the card director to toasts), and add a small **"seen" memory** for tutorial hints and
prompts (settings or save slice) so they don't repeat after reload or on replay.

## Acceptance Criteria

- [x] Inventory above confirmed; each kind classified (toast / prompt / modal) in this task or `docs/ACTION-RPG.md`
  - **Fully.** The inventory in the plan records each surface's role, including story transitions and persistent HUD indicators.
- [ ] Keyboard (Escape; Enter / Space / E where safe), touch (tap outside) and gamepad (when supported) close paths for every popover
  - **Partly.** The first cut covers keyboard and outside-tap dismissal for payouts and HUD toasts, plus shared handling for closable modals. Other surfaces and future gamepad bindings are follow-ups.
- [ ] No non-modal popover blocks movement or camera; no stacking
  - **Partly.** Payouts and HUD toasts share the director's slot and allow movement and camera input. Independent banners, feeds and photo verdicts are follow-ups.
- [ ] Hints remember being seen and don't repeat
  - **Follow-up.** Persisting seen tutorial hints across reload and replay is on the follow-up checklist.
- [ ] Reduced motion respected (no slide / scale animations; `reducedMotion` setting)
  - **Partly.** The first cut covers entry and dismissal of payouts and HUD toasts. The remaining surfaces are in the follow-up motion review.
- [ ] Mobile UI not broken (phone portrait / landscape, `docs/MOBILE-UI-PASS.md`)
  - **Partly.** The first cut checks landscape notice placement and gestures, plus portrait menus and the rotate overlay. The broader mobile pass is a follow-up.
- [ ] e2e updated (specs that wait for or click cards / modals)
  - **Partly.** The first cut updates payout, pacing and touch specs and the mobile toast view. Specs for deferred surfaces follow their respective changes.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass
  - **Fully.** All four gates are required for the first cut. Results are pending implementation.

## Plan
_Status: approved 2026-11-24_

**Approach:** Start with the feedback a player sees on an ordinary quest payout. Show a compact German reward summary at the HUD edge and let routine HUD toasts share the card director's existing slot. Give the visible notice a consistent dismissal path while preserving the controls of any panel or gameplay action the player is using.

### Inventory checked against this branch

| Surface | Classification and current behavior |
| --- | --- |
| Settings, journal, map, news, licences, codex, requested clue/Chronik page, notes and court panel | Real modals today. `ModalManager` handles Escape, backdrop mouse-down and Tab containment. The court hint opens through the director. A requested clue is a modal page even though the director calls it a card. |
| Reward, level-up and skill unlock | Automatic feedback → toast. The reward already queues until after NPC talk, and closes on timeout, walk-away or click. Its optional key handler is bypassed by the normal payout path. Levels already absorb waiting unlocks. |
| HUD toast, objective/turn-in and pickup feed rows, quest banner | Automatic feedback → toast. The HUD displays up to two toasts and deduplicates by text. Feeds and the acceptance banner have separate lifetimes. An item grant from a quest can produce both a pickup row and a reward summary. |
| Proximity prompts, tour teaching prompts, click-to-play chip | HUD prompts. The tour's twelve prompt actions include clears. The visible owner also drives the touch action label. The chip tracks pointer lock and hides for touch. |
| Story title, caught curtain, gauges and timed choices | Title → timed notice with a story-beat hold. Curtain → transition synchronized with wake-up. Gauges → ongoing HUD indicators. A required choice is a real modal, an inline choice is an actionable HUD prompt. Each choice owns its resolution and optional timeout. |
| NPC conversation, Quelle hub and new-game flow | Conversation and hub are real modals. Conversation owns advance and topic keys. New-game screens are modal in purpose and run their own navigation, name input and start gesture. TASK-007 covers the hub and title-flow redesign. |
| Photo verdict | Automatic feedback → toast. Its 3.2-second timer is independent of the phone camera's shutter and put-away controls. |

**Files to touch:**

- `src/ui/cards.ts`, `src/ui/hud.ts`, `src/ui/ui.ts` — coordinate visible feedback, queue ownership and dismissal.
- `src/systems/quests/hud.ts`, `src/systems/quests/index.ts`, `src/systems/progression/index.ts` — present the payout and suppress its duplicate pickup row using the existing quest grant reason.
- `src/ui/modal.ts`, `src/boot.ts`, `src/ui/touch.ts` — route keys, pointer-lock loss, modal backdrops and completed play-surface taps.
- `src/systems/quests/quests.css`, `src/ui/hud-restyle.css`, `src/ui/touch.css` — size and position the notice in the HUD, including reduced motion and phone safe areas.
- `tests/cards.test.ts`, `e2e/quests.spec.ts`, `e2e/pacing.spec.ts`, `e2e/touch.spec.ts` — cover queue behavior and exercise real input. Update the toast view's expectation in `e2e/mobile/tour.pw.ts`.
- `docs/ACTION-RPG.md` §10 — describe the shipped payout and dismissal behavior.

**Steps:**

- [x] 1. Let a HUD toast claim and release the existing director slot. Keep the bounded queue, duplicate suppression, fight/talk holds and priority for requested pages. An obscured notice resumes with reading time left.
- [x] 2. Render the quest payout as a compact, non-focusable status at the HUD edge. Show the quest title and gains, keep full details accessible in the existing journal, and retain timeout and walk-away dismissal.
- [x] 3. Suppress the matching pickup row when the payout already reports the item. Preserve grants, ordinary pickups and inventory-full feedback. Check the displayed quantities against what the player received.
- [ ] 4. Give the top modal first refusal, including required choices. In free play, Escape dismisses the visible notice, then a separate press can pause. Account for key repeat and browser pointer-lock loss. Use Enter, Space or E only when free, respecting bindings, typing, focused controls, dialogue and photo mode.
- [ ] 5. Recognize a completed outside tap on the play surface or the top closable modal's backdrop. Preserve button activation, modal scrolling, stick movement and camera drags.
- [ ] 6. Fit long German summaries around the tracker and thumb controls. Use the game's reduced-motion setting for both appearance and dismissal, and keep the world view and camera interactive.
- [ ] 7. Cover queue release, holds and resumption in Vitest. Extend payout, pacing and real-touch specs to cover the input and duplicate-feedback cases below.
- [ ] 8. Update the gameplay notes and mobile tour expectation to match the new behavior.
- [ ] 9. Run the four gates and focused browser specs. Compare the listed before/after views and check both phone orientations.

**Test plan:**

- Unit and gates: `pnpm exec vitest run tests/cards.test.ts tests/quests.test.ts tests/progression.test.ts`, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`.
- After building, run one spec per lock on the shared machine:

  ```sh
  (
    for spec in quests pacing touch notes npc photo; do
      scripts/dev/heavy.sh --max-hold 15 -- pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1 || exit 1
    done
  )
  ```

- Exercise a real NPC turn-in, then walk and turn the camera while the payout is visible. Queue two toasts and open a map or clue page over one. Check for a single visible notice, one dismissal per press, correct next notice, and normal pause on the next free Escape. Check a bound E interaction, Space dodge, Enter during dialogue, typing in notes and a focused modal button.
- On a 667×375 touch phone, compare an outside tap with a look drag, stick drag, action-button tap and modal scroll. At 375×667 check portrait title/menus and the rotate overlay per `docs/MOBILE-UI-PASS.md`. Repeat notice entry and exit with reduced motion enabled.

**Screenshot views** for the contributor's before captures and the matching after captures. Use a fresh page for each row. All three use `http://localhost:5280/?notitle&nosave&fresh&manual&era=1789&x=1262&z=-1200`. Pass the JS as the optional third argument of `scripts/dev/shot.mjs`. The initial wait lets the world load before triggering short-lived feedback.

| View | JS | Compare |
| --- | --- | --- |
| Two HUD messages | `window.kq.screenshotReady().then(() => { const ui = window.kq.ctx.ui; ui.toast("Karte ergänzt", 30000); ui.toast("Aufgabe erfüllt", 30000); window.kq.step(1); })` | Two simultaneous notes today, one visible after the change. |
| Quest payout | `window.kq.screenshotReady().then(() => { window.kq.quests.complete("q.k1.kasuar"); window.kq.step(1); })` | “Der Kasuar ist los”, 90 EP and the feather. Compare the covered world area and pickup feedback. |
| Map over a notice | `window.kq.screenshotReady().then(() => { window.kq.ctx.ui.toast("Karte ergänzt", 30000); window.kq.step(1); window.kq.travel.map(true); })` | The map has priority. Test resumption by closing it during the manual pass. |

**Risks:** Modal focus and browser pointer-lock changes can consume the same Escape. Rebound keys and touch pointer capture make a blanket key or pointer-down listener unsafe. A full inventory can make the actual payout smaller than the requested grant.

**Open questions:** None.

### follow-up

- [ ] Bring standalone level, skill and ability notices and the photo verdict onto the same compact presentation and close paths. Preserve merged unlocks, narration and shutter/put-away behavior.
- [ ] Bring remaining independent quest banners, objective/ready rows and progression feeds under the one-notice rule. Review other duplicate event announcements.
- [ ] Add dismissible tutorial hints and persist stable seen IDs across reload and replay, with defaults for existing saves. Keep proximity prompts and their touch actions available whenever relevant. Cover the click-to-play chip's show/dismiss/reset behavior.
- [ ] Define skip, cancel or return behavior per story title, transition, timed choice, NPC panel and title screen. Preserve wake-up, choice fallback, dialogue state and explicit consent. Review automatic court hints separately from requested pages.
- [ ] Recheck hub, journal and title-flow coverage against TASK-007. Finish the all-surface keyboard, focus, touch, stacking, reduced-motion and mobile sweep as these surfaces land.
- [ ] Map gamepad B/A to dismiss/confirm once gamepad input exists, and cover conflicts with gameplay bindings.

## Progress

- Branch `feat/task-009-popovers`
- 2026-11-24 — The contributor approved the nine-step first cut and captured the unchanged views:
  - `test-results/contribute/TASK-009/before-1-two-toasts.png`
  - `test-results/contribute/TASK-009/before-2-quest-payout.png`
  - `test-results/contribute/TASK-009/before-3-map-over-notice.png`
- 2026-11-24 — Step 1 added the six-entry waiting queue to the card director. Toasts deduplicate, yield to modal pages and fight/talk holds, and count down on visible frames. `pnpm exec vitest run tests/cards.test.ts` passed.
- 2026-11-24 — Step 2 moved the quest payout to the right-edge HUD dock with a Codex count and a pointer to the field book for details. The notice retains the timeout, walk-away threshold and quiet quest presentation. `pnpm typecheck` passed.
- 2026-11-24 — Step 3 suppressed the quest item pickup row and used progression's synchronous receipts for actual item counts and quest XP. The focused card, quest and progression tests and `pnpm typecheck` passed.

## Notes
- Overlaps TASK-007 (hub overlay removal); coordinate.
