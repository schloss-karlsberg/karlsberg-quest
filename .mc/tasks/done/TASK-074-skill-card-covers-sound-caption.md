---
id: TASK-074
aliases:
- TASK-074
title: 'Skill card can partly cover a sound caption below the dialogue on small screens'
slug: skill-card-covers-sound-caption
status: done
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- touch
- accessibility
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# Skill card can partly cover a sound caption below the dialogue on small screens

## Goal

On phones and other small landscape screens, the standalone skill card (like the level card
before it) sits in the clearance below the dialogue. When a sound caption is shown below the
dialogue at the same time, the card can partly cover it, so the caption is hard to read. The
TASK-020 review found this while measuring the phone layout at 667x375.

## Acceptance criteria

- [x] At 667x375 (and the other small-landscape sizes in the mobile tour), a sound caption
      shown together with a skill card or level card stays fully visible.
- [x] The cards still stay clear of the dialogue and the touch controls.
- [x] The mobile measurement (`e2e/mobile/`) checks the caption and card for overlap (check written; the run is left to the integration run).
- [x] Reduced motion and desktop layouts are unchanged.
- [ ] Mobile tour (`level-card`, `skill-unlock` on the small-landscape units) and smoke e2e: left to the integration run.

## Resolution

Measured from the TASK-020 shots at 667x375: with a line up, the subtitle box ends at about
y = 153 px, centred (x 254-412), while the skill card spans about x 55-337 from y = 118 down (the
level card is similar), so the right part of the card sat over the caption. The band between the
dialogue and the bottom row is too short at 375 px for both, and there is no free column beside
the card, so moving either one would only trade overlaps (dialogue, prompt pill, thumb arc).

Fix: on a short touch layout (`max-height: 500px`, same test as the stick hold) the level and
skill cards step aside while the subtitle box holds a sound caption (a line without a speaker; spoken subtitles do not hold the card) (`captionCoversCard` in
`src/ui/cards.ts`, `Hud.captionLines`), with their reading time paused, and return once the line
has gone, like the existing stick hold. Card placement CSS is unchanged; desktop, tablets and
reduced motion behave as before. Unit tests in `tests/skill-card.test.ts` (the skill card holds
under a caption and comes back; the helper only applies on short touch layouts) failed first.
The mobile measurement now reports `caption-covered` (any subtitle line under a visible level or
skill card), and the `level-card` and `skill-unlock` states shoot a caption with the card up and
require none on short units.
