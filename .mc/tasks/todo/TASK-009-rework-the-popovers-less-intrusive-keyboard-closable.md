---
id: TASK-009
aliases:
- TASK-009
title: 'Rework the popovers: less intrusive, keyboard-closable'
slug: rework-the-popovers-less-intrusive-keyboard-closable
status: todo
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
updated: 2026-11-23
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
- [ ] Inventory above confirmed; each kind classified (toast / prompt / modal) in this task or `docs/ACTION-RPG.md`
- [ ] Keyboard (Escape; Enter / Space / E where safe), touch (tap outside) and gamepad (when supported) close paths for every popover
- [ ] No non-modal popover blocks movement or camera; no stacking
- [ ] Hints remember being seen and don't repeat
- [ ] Reduced motion respected (no slide / scale animations; `reducedMotion` setting)
- [ ] Mobile UI not broken (phone portrait / landscape, `docs/MOBILE-UI-PASS.md`)
- [ ] e2e updated (specs that wait for or click cards / modals)
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Notes
- Overlaps TASK-007 (hub overlay removal); coordinate.
