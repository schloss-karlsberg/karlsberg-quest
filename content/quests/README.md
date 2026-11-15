# Quest files

One file per chapter: `00-prolog.quests.json`, `01-kapitel-1.quests.json` … `04-kapitel-4.quests.json`
(`99-test.quests.json` is the worked example, `"test": true`, loaded only with `?storytest`).
Design and the full quest catalogue: [`docs/ACTION-RPG.md`](../../docs/ACTION-RPG.md) (§8, §11).
Types: `src/rpg/types.ts` (`QuestFile`, `QuestDef`, `QuestObjective`, `ItemDef`). Editor schema:
`content/schema/quests.schema.json`. Authority: `src/systems/quests/validate.ts`, run by
`pnpm validate` and `tests/rpg-contracts.test.ts`.

## Rules

- Quest ids `q.<chapter>.<name>` (prolog → `p`, enden → `end`), item ids `item.<chapter>.<name>`.
- `chapter` is a story chapter id (`prolog`, `k1` … `k4`, `enden`).
- **Main quests** are offered by the chapter's story beats (`{"do":"quest","op":"offer","id":…}`) and
  waited for with `{"quest":{"id":…}}`. **Side quests** offer themselves while their chapter runs and
  `available` holds.
- Givers: `{"npc": "<speaker id>"}` (a placed ghost: `hanne`, `soll`, `jost`, `peter`, `gaertner`,
  `diener`, `mann` …) or `{"voice": "laub" | "marlene"}`. Historical people are never givers; their
  lines (in `history`) need `sources`.
- Dialogue lives inline: `offer`, `progress`, `turnin_lines`, `history` (each line may name a codex
  `fact`, unlocked at turn-in). Speakers are pack speakers (`content/packs/speakers.pack.json`).
- **No quizzes.** No blanks, no word or noun choices, no multiple choice with a right answer. A
  `stance` asks for an opinion, writes its `flag` (the epilogue reads it) and must offer `offen`.
- Objectives (`type`): `kill`, `collect`, `reach`, `talk`, `room`, `examine`, `echo`, `calm`,
  `escort`, `survive`, `use`, `event`, `manual`. `after` orders them; `optional` + `bonus_xp` for bonus
  objectives. Spawns name enemy kinds from `src/rpg/enemies.ts`; positions must be inside the playable
  area (checked) and on walkable ground (check with `scripts/content-build/probe.mjs`).
- Never an enemy: real people, victims, menagerie animals (use `calm`). No spawns at memorials.
- Rewards: `xp`, `items` (`src/rpg/items.ts` or this file's `items`), `codex` (fact ids), `skills`
  (`{id, tier}`), `flags`, `talentPoints`.

## Check

```
pnpm validate          # quest files, then story files with the quest / item references
pnpm vitest run tests/rpg-contracts.test.ts
```
