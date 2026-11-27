# Quest files

One file per quest chapter from `01-kapitel-1.quests.json` to `04-kapitel-4.quests.json`
(`99-test.quests.json` is the worked example, `"test": true`, loaded only with `?storytest`).
Design and the full quest catalogue: [`docs/ACTION-RPG.md`](../../docs/ACTION-RPG.md) (§8, §11).
Types: `src/rpg/types.ts` (`QuestFile`, `QuestDef`, `QuestObjective`, `ItemDef`). Editor schema:
`content/schema/quests.schema.json`. Authority: `src/systems/quests/validate.ts`, run by
`pnpm validate` and `tests/rpg-contracts.test.ts`.

The guided tour uses story beats. Surveyor quest history and pending payouts for older saves use
`src/core/legacy-prologue-quests.ts`.

## Rules

- Quest ids `q.<chapter>.<name>` (enden → `end`), item ids `item.<chapter>.<name>`.
- `chapter` is a story chapter id (`k1` … `k4`, `enden`).
- **Main quests** are offered by the chapter's story beats (`{"do":"quest","op":"offer","id":…}`) and
  waited for with `{"quest":{"id":…}}`. **Side quests** offer themselves while their chapter runs and
  `available` holds.
- Givers: `{"npc": "<speaker id>"}` (a placed ghost: `hanne`, `soll`, `jost`, `peter`, `gaertner`,
  `diener`, `mann` …) or `{"voice": "laub" | "marlene"}`. Historical people are never givers; their
  lines (in `history`) need `sources`.
- Dialogue lives inline: `offer`, `progress`, `turnin_lines`, `history` (each line may name a codex
  `fact`, unlocked at turn-in). Speakers are pack speakers (`content/packs/speakers.pack.json`).
- **No quizzes, no stance cards.** No blanks, no word or noun choices, no multiple choice at all
  (the validator rejects `stance`). The epilogue tells deeds: a side quest done is its deed
  (`quest.<id>` = `done`); a physical choice is an item with `deed: {flag, value}` (picking it up
  sets the flag, docs/ACTION-RPG.md §8.6). New epilogue sentences go into
  `scripts/content-build/epilogue-deeds.mjs`.
- History: the first `history` line is told at turn-in, the rest on „Erzähl mehr“ and in the
  journal, so put the most vivid, sourced line first.
- Objectives (`type`): `kill`, `collect`, `reach`, `talk`, `room`, `examine`, `echo`, `calm`,
  `escort`, `survive`, `use`, `event`, `manual`. `after` orders them; `optional` + `bonus_xp` for bonus
  objectives. Spawns name enemy kinds from `src/rpg/enemies.ts`; positions must be inside the playable
  area (checked) and on walkable ground (check with `scripts/content-build/probe.mjs`).
- An `echo` objective or an `event` objective for `echo:end` counts a heard or skipped memory.
  Interrupted playback leaves the objective open.
- Never an enemy: real people, victims, menagerie animals (use `calm`). No spawns at memorials.
  A single-animal `calm` objective can name a spawn id, such as `k3.jaguar`. The saved calmed id
  counts if the objective is open when the quest is accepted or loaded.
- Rewards: `xp`, `items` (`src/rpg/items.ts` or this file's `items`), `codex` (fact ids), `skills`
  (`{id, tier}`), `flags`, `talentPoints`.

## Progression and one-shot events

A beat that waits for a quest needs a reachable offer or start, a way to finish each required
objective in `after` order, and an available turn-in. The validator runs the quest state machine
against the chapter's actions. It follows chained offers, checks side-quest prerequisites and
reports a blocked gate with the quest id and the outstanding objectives or missing giver.
It also checks that every main quest has an offer or start and a completion on a reachable
path, even when no beat explicitly waits for it. NPC acceptance and turn-in depend on the
placement's era. A voice turn-in needs a story completion command, and rewards apply at
completion. The chapter transition resets unfinished earlier main quests and applies the
runtime expiry rules to side quests.

A collect objective needs a known RPG item and enough pickups while that objective is open.
Objective placements, positive-chance drops, story loot, direct grants and quest payouts are
possible sources. A pickup can wait on the ground. A direct grant pays immediately. An item
granted before acceptance can satisfy a later use objective, but collecting it requires a new
pickup. Pickups only credit the amount that fits in the item's stack. Deeds can come from
world pickups as well as grants, including pickups unrelated to any quest. Kill objectives
with authored spawns or groups count the remaining enemies in reachable eras.
An objective cannot fund itself with its own turn-in reward.

Raw event objectives count matching notifications after activation. The check scans literal
emitters in `src/`. Dynamically dispatched names belong in the small list in
`scripts/content-validation/catalog.ts`, with the emitting system identified. For one-shot
notifications such as a story cue or another quest's payout, put acceptance and any preceding
objectives ahead of the emission. For a clue or a photo the player can find early, the typed
`examine`, `echo` and `photo` objectives credit saved discoveries. Warnings about a voluntary
NPC offer or pickup timing identify the sequence to try in play.

## Check

```
pnpm validate          # quest files, then story files with the quest / item references
pnpm exec vitest run tests/rpg-contracts.test.ts tests/content-progression.test.ts
```
