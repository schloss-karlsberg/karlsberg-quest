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

## Chapter file

| Key | Meaning |
| --- | --- |
| `chapter`, `order`, `title_de`, `sub_de?` | id, play order, title card |
| `start`, `next?`, `unlocks?` | first beat; chapter that follows; chapters unlocked at the map table |
| `era?`, `checkpoint? {x,z,yaw?,era?}` | chapter era; start position (also where being caught returns to) |
| `placeholder?` | skeleton chapter (title card says so) |
| `test?` | test chapter (`99-test.story.json`): validated, but loaded only with `?storytest` |
| `on?` | chapter-wide reactions `{id, when, do, repeat?}` |
| `beats` | `{id, title_de?, enter?, complete, exit?, next?, checkpoint?, on?, placeholder?}` |
| `epilogue?` | fallback epilogue data (the endings pack's `epilog:line` lines win, see below) |

## Conditions

Exactly one key per condition object. Event-like conditions are latched while the beat runs.

| Condition | True when |
| --- | --- |
| `enter {x,z,r,era?}` / `leave {x,z,r}` | inside / outside the circle |
| `event` (+ `match`, `gte`, `lte`, `times`) | the game event happened (payload match) |
| `flag` (+ `eq`) | a state flag is truthy / equals |
| `timer` | seconds in the beat (in chapter `on`: in the chapter) |
| `chapterTimer` | seconds since the chapter started (game time) |
| `era`, `scan` (≥ mode), `map`, `stance`, `lantern` | world / player state |
| `have {clue\|noun\|item}`, `confirmed {case?\|prefix?, n}`, `caseComplete` | inventory and Chronik |
| `hub` | a field-station item was used |
| `room` | the player stands in a walkable palace room: catalogue id `"B06.1.bildergalerie"`, full id `"KB-B06/B06.1.bildergalerie"` or a building `"KB-B06"` (interiors flags `interior.room` / `interior.building`); also latched when a matching `room:enter {roomId, building, id, name}` happened in the beat |
| `talked {npc, chapter?, topic?}` | an NPC was spoken to (flags `talked.<chapter>.<npc>[.<topic>]`; chapter defaults to the running one) |
| `reading` (+ `eq?`) | a reading was chosen: the entry's story flag (`CaseEntry.flag`, e.g. `flag.k1_lohn`) or its entry id; `eq` = noun id or bare key (`n.r_will_nicht` ≡ `will_nicht`, `offen`) |
| `meter {id, gte?, lte?, full?}` | a story meter's value (0 empty … 1 full) |
| `chosen` (+ `option?`) | a choice was answered (flag `choice.<id>` = option key or index) |
| `all`, `any`, `not` | combinations |
| `manual` | never (only `kq.story.skip()`) |

Entering / leaving a room is also an event: `{ "event": "room:enter", "match": { "roomId": "B01.2.og-festsaal" } }`
(payload `roomId`, `building`, `id`, `name`; `room:leave` without `name`).

## Actions

Each action may carry `delay` (seconds after the previous one; spoken lines take their reading
time) and `onResume` (repeat when a beat is resumed after loading / being caught; default: all
except `say/shift/teleport/card/sound/toast/cue/chronik/ending/echo/grant`).

| Action | Fields | Effect |
| --- | --- | --- |
| `say` | `id?, speaker, text \| line, text_by_era?, ms?, echo?, repeat?` | a spoken line (`id` lines once). `text_by_era {era: text}` wins in that era. Placeholders: `{Name}`/`{name}`, `{jahre:1793}` (years since 1793 in words; "über zweihundert" when the clock is implausible), `{jahr}` |
| `objective` | `text \| null, x?, z?, id?` | objective + Bussole target |
| `threat` | `kind, active, intensity?, center?, radius?, seconds?, …` | `threat:configure`; every ThreatConfig field passes through. Pack extras: `mode` patrol \| drive \| finale \| parforce, `target`, `via`, `from`, `headStart`, `goalRadius`, `snow`, `hounds`, `pikeur`, `sight`, `seed` (docs/ARCHITECTURE.md §12) |
| `flag` | `set {flag: value \| null}` | write / delete flags |
| `shift`, `anchor` | `to, reason?, instant?` / `to \| null, x, z, r` | era shift / Q anchor |
| `skill`, `give` | `id, tier` / `clue \| noun \| item, kind?, toast?` | skills, inventory |
| `grant` | `clue` | discover a clue the Chronik way (`clue:grant`: nouns, codex, flags; no card) |
| `toast`, `teleport`, `card`, `look`, `prompt`, `sound` | as before | presentation |
| `cue`, `chronik`, `unlock`, `ending`, `autosave` | `cue {id, data?}` | `story:cue`, open the board, map table, endings. `cue menagerie:spawn` with `data {animal, x, z, id?, heading?, count?}` / `menagerie:clear {id?}` places the escaped animals |
| `choice` | `id, prompt, note?, options[], seconds?, fallback?, modal?` | see below |
| `npc` | `op: spawn \| despawn, npc, x?, z?, era?, yaw?, chapter?, topics?, mood?` | place / remove a ghost (`npc:spawn` / `npc:despawn`; x/z default to the player, era to the current one, chapter to the running one; `npc: "*"` removes all) |
| `meter` | `id, active, seconds?, label?, full?, text?, lossless?, still?, intensity?, center?, radius?` | see below |
| `echo` | `id` | play a Chronik echo (`echo:play`) |
| `memorial` | `id, active?, x?, z?, r?, era?, room?` | a memorial place: no barks there (`memorial:set`) |
| `readings` | `fill: "offen", cases?` | every reading without an answer becomes `offen` ("Leer lassen") |

**Choices.** `modal` (default) is a field-book card that pauses the game; options are picked by
click or keys 1–n. `modal: false` is an inline card while the game runs on; an option with
`when` (any condition without events, e.g. `{ "lantern": true }`) is taken as soon as it holds
(chapter 2's gate: lit = "leuchten", dark = "dunkel"). The fuse (`seconds`) burns on game time
(real time while a modal pauses the game; `kq.step` drives it headless); when it runs out,
`fallback` (index) is taken. The answer writes the option's `set` flags and
`choice.<id>` = option `key` (or index), emits `story:choice {id, option}` and runs the option's
`then` actions.

```jsonc
{ "do": "choice", "id": "k3.objekt", "prompt": "Was nimmst du mit?", "seconds": 20, "fallback": 0,
  "options": [{ "label": "Den Türgriff", "key": "tuergriff", "set": { "flag.k3_objekt": "tuergriff" } }, …] }
```

**Meters.** Game time only (never wall clock); gentle mode +50 %, Rauhnacht −30 %.
- `oil`: the lantern burns `seconds` (hunt's lantern via `threat:configure {kind:'pack', seconds}`,
  an active pack keeps its configuration; `lantern:request {lit:true, refill}` lights it).
  Empty in the past → the memory lets go: curtain (`text`) and back to the checkpoint (prologue, 90 s).
- `smoke`: starts the fx fire threat (chapter 3); its value mirrors `fire:progress`; fx catches the player.
- `vergessen`: starts the fx Steinfraß (chapter 4); value mirrors `oblivion:progress`.
- any other id: a story gauge (HUD bar with `label`) that fills over `seconds` in its era, waits
  during echoes, conversations and the curtain, fills `still`× faster while the player stands still.
  Full → `full`: `return` (default; curtain with `text`, back to the checkpoint, nothing lost),
  `caught` (`player:caught`), `none` (only `story:meter-full` / the `meter {full:true}` condition).
- `lossless: true` sets `flags['chronik.noLoss']` for the rest of the chapter: being caught loses
  nothing (bible 4.6) and the curtain says "Die Meute hat dich heimgebracht."
- `active: false` stops it (and the fire / Steinfraß it started). A resumed beat keeps the value.

## Dialogue from the content packs

Pack lines (`content/packs/*.pack.json`, generated by `scripts/content-build/`) are spoken when
their trigger matches (`src/content/triggers.ts`): `era`, `flag` (+ `value`), `below`/`above`,
`hasClue`, `chapter`/`beat` (from the payload, else the running story), any payload key.
Lines with `step` play in order as one sequence. Who speaks what:
- **story runner**: every event except `echo:*` (the Chronik plays echoes), `epilog:line`
  (assembled), `npc:talk` (the npc system plays conversations) and bark lines (`*.bark.*`,
  `marlene.gen.*`; the barks system), and except example / placeholder packs (unless `?placeholder`).
  Lines triggered by `player:caught` wait until the curtain lifts.
- **npc** (`src/systems/npc/`): `npc:talk {npc, chapter, topic, step?}` — `greet` opens, every other
  topic except `bye` is a question in pack order, `bye` closes. First talk: `clue:grant
  clue.<chapter>.<npc>`, flags `talked.*`; while the NPC is placed its talk clue has no Chronik marker
  (flag `npc.owns.<clue>`).
- **barks** (`src/systems/barks/`): one random line per group, the same line not within 10 min,
  at most one bark per 45 s, none during echoes, dialogue, conversations, modals, the curtain, the
  first 12 s of a chapter, at memorial places (built-in Rondell 1815/348 r 20, `memorial` action,
  flag `barks.quiet`). It also emits `bark:idle` (60 s without input) and `bark:enter-fire` (a fire
  starts, or `room:enter` into a burning room).

**Epilogue.** The endings pack's `epilog:line {block, ending?, flag?, value?}` lines are assembled
(`endings/assemble.ts`, bible 06-enden §6): one sentence per block in pack order; a flagged block
takes the line whose `value` equals the flag (reading flags: `n.r_x` ≡ `x`), else its `offen`
line (`nichts` for the object). Without such lines the story file's `epilogue` data is used.

## Skills and survey tools

**Skills** (`skill {id, tier}`, system `skills`): ids `relief` (1–3), `kartograf` (1 map 1840, 2 map 1935,
3 Messen R), `baumeister` (1 Planblatt B, 2 Konfidenzansicht, 3 Raumfolge), `roentgen` (1 Röntgenblick V),
`spurenleser` (1 horn meaning, 2 pack routes). Each raise shows the unlock card; Laub comments once
`flag {set: {"story.laub": true}}` has been set. Measuring: `{event: 'measure:done', match: {building: 'KB-B06'}}`
or `flag measured.KB-B06` (the measured distance). Chronik clue requirements use `skill: 'kartograf:3'`.

## Hunt modes, snow tracks and the menagerie

Example beats (a test file, not loaded by the game, validated in `tests/hunt-ext.test.ts`):
`content/test/hunt-menagerie.test.story.json`. Useful conditions:
`{"event":"hunt:goal","match":{"mode":"drive"}}`, `{"event":"hunt:finale","match":{"outcome":"faded"}}`,
`{"event":"hunt:tracking","match":{"on":false,"why":"water"}}`, `{"event":"player:caught","match":{"soft":true}}`,
`{"event":"menagerie:yield","match":{"id":"dromedare"}}`.

## Test chapter

`99-test.story.json` (`"test": true`) exercises the NPC talk, inline + modal choices, meters,
readings, rooms, memorials and the epilogue (`e2e/npc.spec.ts`): `?storytest`, then
`kq.story.goto('test')`.

## Debug (browser console)

`kq.story.goto('prolog', 'p9')`, `.state()`, `.skip()`, `.flush()`, `.choose(i)`, `.choice()`,
`.meters()`, `.meter(id, v)`, `.room(id | null)`, `.caught(by, holdMs)` (the curtain holds
`holdMs` of game time), `.epilogue(id)`; `kq.npc.list/spawn/despawn/talk/ask/advance/finish/drain/close/state`;
`kq.barks.state/advance/reset`.
