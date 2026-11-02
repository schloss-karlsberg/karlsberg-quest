# Story files (`*.story.json`)

One file per chapter, played in `order`. The story system (`src/systems/story/`) runs them as a
state machine of **beats**; `pnpm validate` and `tests/story.test.ts` check every file
(schema: `src/systems/story/types.ts`, validator: `src/systems/story/validate.ts`).
Source of the texts: `content/bible/*.md`. Placeholder chapters/beats carry `"placeholder": true`.

```jsonc
{
  "chapter": "prolog", "order": 0, "title_de": "Vermessung", "sub_de": "Prolog · …",
  "start": "p1", "next": "k1",                // next chapter starts when the last beat completes
  "checkpoint": { "x": 760, "z": -902, "yaw": 0, "era": "today" }, // chapter start / after being caught
  "on": [ /* chapter-wide reactions */ ],
  "beats": [
    {
      "id": "p2", "title_de": "Der Damm",
      "enter": [ /* actions when the beat starts */ ],
      "complete": { "all": [{ "enter": { "x": 813, "z": -903, "r": 26 } }, { "scan": 2 }] },
      "exit": [ /* actions when it completes */ ],
      "checkpoint": "p1",                     // beat to resume at after being caught
      "on": [{ "id": "am-damm", "when": { … }, "do": [ … ], "repeat": false }]
    }
  ]
}
```

**Conditions** (exactly one key each): `enter {x,z,r,era?}`, `leave {x,z,r}`,
`event` (+ `match`, `gte`, `lte`, `times`; any game event, latched while the beat runs), `flag` (+ `eq`),
`timer` (seconds in the beat / chapter), `era`, `have {clue|noun|item}`, `confirmed {case?|prefix?, n}`,
`caseComplete`, `scan` (relief mode ≥ n), `map`, `stance`, `lantern`, `hub` (field-station item used),
`all`, `any`, `not`, `manual` (never; only `kq.story.skip()`).

**Actions** (`do`), each with optional `delay` (seconds after the previous action; spoken lines take
their reading time) and `onResume` (repeat when a beat is resumed; default: everything except
`say/shift/teleport/card/sound/toast/cue/chronik/ending`):
`say {id, speaker, text | line}` (`{Name}` = player name, `id` lines are spoken once),
`objective {text|null, x?, z?}`, `threat {kind, active, intensity, center, radius, seconds}`,
`flag {set}`, `shift {to}`, `anchor {to|null, x, z, r}`, `skill {id, tier}`, `give {clue|noun|item, kind, toast}`,
`toast`, `teleport`, `card {title, sub}`, `sound {sound, x?, z?, caption, signal}` (howl/horn need a caption),
`look {time: day|dusk|night}`, `prompt {key, text}`, `cue {id}` (→ `story:cue`), `chronik {caseId}`,
`unlock {chapter}`, `ending`, `autosave`, `choice {id, prompt, options[{label, set}], seconds, fallback}`.

**Skills** (`skill {id, tier}`, system `skills`): ids `relief` (1–3), `kartograf` (1 map 1840, 2 map 1935,
3 Messen R), `baumeister` (1 Planblatt B, 2 Konfidenzansicht, 3 Raumfolge), `roentgen` (1 Röntgenblick V),
`spurenleser` (1 horn meaning, 2 pack routes). Each raise shows the unlock card; Laub comments once
`flag {set: {"story.laub": true}}` has been set. Measuring: `{event: 'measure:done', match: {building: 'KB-B06'}}`
or `flag measured.KB-B06` (the measured distance). Chronik clue requirements use `skill: 'kartograf:3'`.

Debug in the browser console: `kq.story.goto('prolog', 'p9')`, `kq.story.state()`, `kq.story.skip()`.
