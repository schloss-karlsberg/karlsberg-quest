---
id: TASK-074
aliases:
- TASK-074
title: 'Skill card can partly cover a sound caption below the dialogue on small screens'
slug: skill-card-covers-sound-caption
status: todo
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

- [ ] At 667x375 (and the other small-landscape sizes in the mobile tour), a sound caption
      shown together with a skill card or level card stays fully visible.
- [ ] The cards still stay clear of the dialogue and the touch controls.
- [ ] The mobile measurement (`e2e/mobile/`) checks the caption and card for overlap.
- [ ] Reduced motion and desktop layouts are unchanged.
