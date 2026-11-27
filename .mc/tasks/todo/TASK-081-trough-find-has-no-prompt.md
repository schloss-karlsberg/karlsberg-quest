---
id: TASK-081
aliases:
- TASK-081
title: '„Nachsehen, was im Trog glänzt“ gives no prompt and only fires when facing the trough'
slug: trough-find-has-no-prompt
status: todo
priority: 3
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
created: 2026-11-27
updated: 2026-11-27
---

# „Nachsehen, was im Trog glänzt“ gives no prompt and only fires when facing the trough

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810, desktop). At the Quelle (t16) the
objective „Nachsehen, was im Trog glänzt“ points to about 1058.5/−832.5. Coming up the path from
the east, the trough wall is between you and the marker, and walking at the marker stops at
about 4 m. Standing exactly on the marker facing away does nothing either: no E prompt, no
hint. The find fired only after turning the camera to face the trough (about 50°). A player can
stand there for a while without knowing what to do.

## Acceptance criteria

- [ ] Near the trough the player gets a clear action: an „E Untersuchen“ prompt, or a gaze
      trigger with a wider angle plus a hint after a few seconds („Schau in den Trog“).
- [ ] The marker leads to a spot the player can reach from the arrival path without walking into
      the trough wall.
- [ ] The tour e2e still reaches t17.
