---
id: TASK-078
aliases:
- TASK-078
title: 'Talk prompt reads „Mit Der Hofgärtner sprechen“'
slug: talk-prompt-grammar-mit-der
status: todo
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- ui
- localization
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# Talk prompt reads „Mit Der Hofgärtner sprechen“

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810). In chapter 1, near the gardener at
the Orangerie, the interaction prompt reads „E Mit Der Hofgärtner sprechen“. The correct German
is „Mit dem Hofgärtner sprechen“.

## Cause

`src/systems/npc/index.ts` builds the prompt from `'npc.prompt': 'Mit {name} sprechen'`, and
some speaker names in `content/packs/speakers.pack.json` (built by
`scripts/content-build/speakers.mjs`) start with an article: „Der Hofgärtner“, „Der Kommissär“,
„Die Menge“. The article is neither lower-cased nor declined (dative).

## Acceptance criteria

- [ ] Talk prompts for article names read correctly („Mit dem Hofgärtner sprechen“, „Mit dem
      Kommissär sprechen“), for example via an optional dative form per speaker
      (`prompt_de`) or a neutral prompt („Sprechen: Der Hofgärtner“).
- [ ] Names without an article are unchanged.
- [ ] A unit test covers one article name and one plain name.
