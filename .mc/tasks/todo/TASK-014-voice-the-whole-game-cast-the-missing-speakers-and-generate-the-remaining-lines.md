---
id: TASK-014
aliases:
- TASK-014
title: 'Voice the whole game: cast the missing speakers and generate the remaining lines'
slug: voice-the-whole-game-cast-the-missing-speakers-and-generate-the-remaining-lines
status: backlog
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- audio
- voice
sprint: "[[SPR-001]]"
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-25
updated: 2026-11-25
---

# Voice the whole game: cast the missing speakers and generate the remaining lines

> Core dev team task (not community).

## Description

Owner (2026-11-25): "we need more voices for the tour and game in general."

State on 2026-11-25 (`KQ_MOSS_MODE=service node scripts/voice/generate.mjs --dry-run --offline --max-lines 500`):
- 465 voiceable lines, 132 voiced. 333 lines of already cast speakers (mostly `laub`, some `marlene`) are not
  generated yet (~61 min model time, ~26.5 MB).
- Speakers with no voice at all (they still use the murmur): jost 53, soll 52, hanne 46, epilog 46, diener 15,
  mannlich 13, peter 11, liese 9, wache 8, gaertner 6, hofgaertner 6 and about 30 one- or two-line speakers.
  (`geraeusch` is sounds, not a voice.)
- Voice budget: warn at 60 MB, fail at 80 MB for `public/voice/` (`scripts/voice/assetRules.ts`).

Rules: synthetic MOSS voices only (CC0 output, credited in `LICENSES.json` `voices`), never ElevenLabs output, never
a real person except the consented player voice. Only text-final lines get clips. Model runs (`moss-run`) are
the owner's call; agents only submit. See `content/bible/08-stimmen.md` and `docs/VOICE-MEDIA-RESEARCH.md`.

### Tour lines queued for recording

Use the current text from `content/story/00-tour.story.json` with the existing cast voices.

| Beat | Line ID | Speaker | Text |
| --- | --- | --- | --- |
| `t13` | `marlene.t.messstab` | Marlene | Hier, nimm den Messstab ruhig mit. Beim Fest gibst du ihn mir zurück. |
| `t18` | `laub.t.seite` | Laub | Und im Deckel der Bussole steckt ein Blatt. Unten steht meine Handschrift. Sie finden es später unter Ausrüstung. |

### Proposed steps

1. Decide which lines are text-final (chapters 1–4, endings, epilogue), and list the rest as blocked.
2. Casting round for the main missing speakers (Jost, Soll, Hanne, Mannlich, Peter, Liese, epilogue narrator):
   2–3 MOSS candidates each, a listening page, and the owner picks by ear.
3. One shared voice per group of small speakers (guards, servants, gardeners, soldiers) to stay within budget.
4. Generate in batches by chapter through the moss-service, collect, listen, commit chapter by chapter.
5. Keep within the size budget; if needed, lower bitrates or skip barks.

## Acceptance Criteria
- [ ] Every speaker with 3 or more text-final lines has a cast voice (owner-picked for the main characters)
- [ ] All text-final lines voiced; blocked lines listed
- [ ] Credits per voice in `LICENSES.json`; `tests/voice-assets.test.ts` green; size under 60 MB
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass
