# Story files (`*.story.json`)

One file per chapter, played in `order`. The story system (`src/systems/story/`) runs them as a
state machine of **beats**; `pnpm validate` and `tests/story.test.ts` check every file
(schema: `src/systems/story/types.ts`, validator: `src/systems/story/validate.ts`).
The [story bible](../bible/00-overview.md) holds the writing and design notes, including the
[guided tour](../bible/01-prolog.md) and [party endings](../bible/06-enden.md). The story files
and their generators define the shipped beats and dialogue. Placeholders carry `"placeholder": true`.

```jsonc
{
  "chapter": "tour", "order": -1, "title_de": "Die Führung", "sub_de": "Prolog · …",
  "start": "t1", "next": "k1",                // next chapter starts when the last beat completes
  "checkpoint": { "x": 529, "z": -777, "yaw": 215, "era": "today" }, // chapter start / after being caught
  "on": [ /* chapter-wide reactions */ ],
  "beats": [
    {
      "id": "t1", "title_de": "Treffpunkt",
      "enter": [ /* actions when the beat starts */ ],
      "complete": { "any": [{ "enter": { "x": 524, "z": -770, "r": 7 } }, { "timer": 25 }] },
      "exit": [ /* actions when it completes */ ],
      "checkpoint": "t1",                     // beat to resume at after being caught
      "on": [{ "id": "am-treffpunkt", "when": { … }, "do": [ … ], "repeat": false }]
    }
  ]
}
```

## Chapter file

| Key | Meaning |
| --- | --- |
| `chapter`, `order`, `title_de`, `sub_de?` | id, play order, title card (5.5 s; the opening beat's `enter` timeline starts counting once it has faded, so its sounds, lines, objectives and quest offers keep their relative timing and need no extra `delay`, and its `timer` / `chapterTimer` conditions count from that moment too; only silent setup at time 0 — look, flag, npc, item, anchor, threat, shift, skill, teleport … — runs under the card; lines from other sources wait for it too) |
| `start`, `next?`, `unlocks?` | first beat; chapter that follows; chapters unlocked at the map table |
| `era?`, `checkpoint? {x,z,yaw?,era?}` | chapter era; start position (also where being caught returns to) |
| `placeholder?` | skeleton chapter (title card says so) |
| `test?` | test chapter (`99-test.story.json`): validated, but loaded only with `?storytest` |
| `dev?` | dev chapter: loaded only with the URL switch of that name, and a new game then starts in it |
| `leave?` | actions run once when the story leaves the chapter for another, whichever way (last beat, chapter list, debug jump): the tour sends its group home and lifts its rules (no combat, Laub silent) |
| `on?` | chapter-wide reactions `{id, when, do, repeat?, cooldown?}` (`cooldown`: with `repeat`, not again within that many seconds) |
| `beats` | `{id, title_de?, enter?, complete, exit?, next?, checkpoint?, wake?, on?, placeholder?}` |

**Wake places.** `wake {x, z, yaw?, era: "today", text?}` on a beat: being caught or an empty
meter while it runs brings you to the present *there* (the resumed beat's `wake` wins, else the
running beat's, else the chapter `checkpoint`), and `text` replaces the default "Du wachst an der Quelle auf". Chapters 1 and 2 wake you at the anchor of the part you were in (Ehrenhof, Tschifflik
terrace, Parkzaun) so Q takes you straight back.

**Beat scope.** Delayed actions belong to the beat that ran them (`exit` actions to the next beat;
chapter reactions to none). When a new beat begins, the old beat's delayed presentation
(`say/toast/sound/card/prompt/echo/choice`) is dropped and its delayed state changes run at once;
waiting dialogue lines of the old beat get 6 s to start (barks are dropped).
So a line the player must hear goes early in a reaction (short delays) or into the beat's
`exit` (lines already said stay silent, see k4_9). A beat that completes on a clue its own script
grants: put a `say` of the clue's triggered line right after the `grant` — it stays silent (the
clue already said it) but reserves its reading time, so the next grant does not cut it off (k4_14).
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
| `room` | the player stands in a walkable palace room: catalogue id `"B06.1.bildergalerie"`, full id `"KB-B06/B06.1.bildergalerie"` or a building `"KB-B06"` (interiors flags `interior.room` / `interior.building`); also latched when a matching `room:enter {roomId, building, id, name}` happened in the beat |
| `talked {npc, chapter?, topic?}` | an NPC was spoken to (flags `talked.<chapter>.<npc>[.<topic>]`; chapter defaults to the running one) |
| `reading` (+ `eq?`) | a reading was chosen: the entry's story flag (`CaseEntry.flag`, e.g. `flag.k1_lohn`) or its entry id; `eq` = noun id or bare key (`n.r_will_nicht` ≡ `will_nicht`, `offen`) |
| `meter {id, gte?, lte?, full?}` | a story meter's value (0 empty … 1 full) |
| `chosen` (+ `option?`) | a choice was answered (flag `choice.<id>` = option key or index) |
| `quest {id, state?, objective?, gte?}` | Action-RPG (docs/ACTION-RPG.md §9.3): the quest is in `state` (default `done`; `active` also holds while `ready`; `offered`, `ready`, `failed`), or its `objective` count ≥ `gte` (default 1). Reads flags `quest.<id>` / `quest.<id>.<objective>` |
| `level` | the player's level (flag `rpg.level`) is at least n (1–12) |
| `speed {gte?, lte?}` | the player's speed in m/s (walk 3.2, sprint 6.2; 0 while flying) — e.g. the guard who calls out runners |
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
| `say` | `id?, speaker, text \| line, text_by_era?, ms?, echo?, repeat?, variants?` | a spoken line (`id` lines once; a line that will not be spoken costs no reading time in its run). `text_by_era {era: text}` wins in that era. `variants [text…]` (needs `id` and `speaker`): a running joke, the n-th run speaks the n-th text, then silence (or the last again with `repeat`). Placeholders: `{Name}`/`{name}`, `{jahre:1793}` (years since 1793 in words; "über zweihundert" when the clock is implausible), `{jahr}` |
| `objective` | `text \| null, x?, z?, id?` | objective + Bussole target |
| `threat` | `kind, active, intensity?, center?, radius?, seconds?, …` | `threat:configure`; every ThreatConfig field passes through. Pack extras: `mode` patrol \| drive \| finale \| parforce \| follow, `target`, `via`, `from`, `headStart`, `goalRadius`, `heel`, `burst`, `keepPace`, `snow`, `hounds`, `pikeur`, `sight`, `seed` (docs/ARCHITECTURE.md §12) |
| `flag` | `set {flag: value \| null}` | write / delete flags |
| `shift`, `anchor` | `to, reason?, instant?` / `to \| null, x, z, r` | era shift / Q anchor |
| `skill`, `give` | `id, tier` / `clue \| noun \| item, kind?, toast?` | skills, inventory |
| `grant` | `clue` | discover a clue the Chronik way (`clue:grant`: nouns, codex, flags; no card) |
| `toast`, `teleport`, `card`, `prompt`, `sound` | as before | presentation |
| `look` | `time: day \| dawn \| dusk \| night, era?` | time of day (`dawn` = Morgengrauen: chapter 4's end, the endings): the present (home at the Karlsbergquelle) or, with `era`, that past era (e.g. 1789 dusk / night in the Karlslust; `day` restores the era's preset). Persisted, re-applied whenever that era is entered |
| `cue`, `chronik`, `unlock`, `ending`, `autosave` | `cue {id, data?}` | `story:cue`, open the board, map table, endings. `cue menagerie:spawn` with `data {animal, x, z, id?, heading?, count?}` / `menagerie:clear {id?}` places the escaped animals |
| `choice` | `id, prompt, note?, options[], seconds?, fallback?, modal?` | see below |
| `npc` | `op: spawn \| despawn, npc, x?, z?, room?, era?, yaw?, chapter?, topics?, mood?` | place / remove a ghost (`npc:spawn` / `npc:despawn`; x/z default to the player (on the player's storey), era to the current one, chapter to the running one; `room` = a palace room id: its centre and its storey, upstairs too; `npc: "*"` removes all) |
| `meter` | `id, active, seconds?, label?, full?, text?, lossless?, still?, intensity?, center?, radius?` | see below |
| `echo` | `id` | play a Chronik echo (`echo:play`) |
| `memorial` | `id, active?, x?, z?, r?, era?, room?` | a memorial place: no barks there (`memorial:set`; `room` = catalogue id, full id or building) |
| `readings` | `fill: "offen", cases?` | every reading without an answer becomes `offen` ("Leer lassen") |
| `quest` | `op: offer \| start \| progress \| complete \| fail \| reset, id, objective?, n?` | Action-RPG: `quest:command` to the quests system (`offer`: the giver shows `!`; `start`: active at once; `progress`: +n on an objective, for `manual` objectives). One-shot on resume unless `onResume` |
| `enemy` | `op: spawn \| despawn, group, kind, x?, z?, era?, count?, radius?, boss?, tier?, leash?, respawn?, time?, room?, escorts?, wave?, aggro?, veiled?, near?` | `enemy:spawn` / `enemy:despawn` to combat (kinds: `src/rpg/enemies.ts`; x/z default to the player, era to the current one; `group: "*"` despawns all). `escorts` / `wave`: the pack's company and second wave (`[]` = none); `aggro`: an ambush, it closes in at once; `veiled`: only the Bannlicht tears its veil; `near`: spawn that many m from the player on the line towards x/z. Idempotent by group |
| `loot` | `id?, item?, x?, z?, era?, count?, room?, group?, clear?` | `id` and `item` place a glowing pickup (`loot:place`). `group` can tag it. With `clear: true`, supply exactly one of `id` or `group` to remove matching pickups (`loot:clear`) |
| `xp`, `item` | `amount, reason?` / `item, count?, quiet?` | XP and items to the progression system (`xp:grant`, `item:grant`; ids: `src/rpg/items.ts` or a quest file's `items`). One-shots |

**Prompts on a touch screen.** `prompt {key, text, touch?}`: `touch` replaces `text` in touch mode
(Touch-Steuerung, read when the prompt shows and again when the mode switches). Write it in touch
words („Wischen: Schauen“, „Bannlicht, dann Hieb“; the button names are in `src/player/touchMap.ts`)
and keep it within 22 characters: an interact prompt also labels the Aktion button. The dialogue
card's hint says „Enter weiter“, on touch „Tippen: weiter“ (a tap on the card advances).

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
readings, rooms, memorials and the epilogue (beats t1–t6, `e2e/npc.spec.ts`) and the round-2
tour (beats r1–r4: Festsaal doorway, a ghost upstairs, Kartograf 3 + measuring the gallery, snow
tracks; `e2e/integration.spec.ts`): `?storytest`, then `kq.story.goto('test')` / `goto('test', 'r1')`.
Beats q1–q2 are the Action-RPG example: Hanne offers `q.test.lohnzettel`
(`content/quests/99-test.quests.json`), the beat completes on `{quest: {id}}` (`goto('test', 'q1')`).
The full list of actions, conditions and recipes for wiring chapters: `docs/ARCHITECTURE.md` §12
"How to wire a chapter".

## Debug (browser console)

`kq.story.goto('tour', 't17')`, `.state()`, `.skip()`, `.flush()`, `.choose(i)`, `.choice()`,
`.meters()`, `.meter(id, v)`, `.room(id | null)`, `.caught(by, holdMs)` (the curtain holds
`holdMs` of game time), `.epilogue(id)`; `kq.npc.list/spawn/despawn/talk/ask/advance/finish/drain/close/state`;
`kq.barks.state/advance/reset`.
