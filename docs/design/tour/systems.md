# New systems for the tour opening and the party endings (draft)

> Draft for the release after 0.5.0. Rough scopes only; no code is written by this draft. File:line references come from the impact audit (main @ 3a11702, still valid on 815b1cb for the touched files). Sizes: **S** ≤ 1 day, **M** 2–4 days, **L** ≥ 5 days of one worker. Gerold Imhoff is a placeholder name.

| § | System | Size | Depends on | Owner | Contract |
|---|---|---|---|---|---|
| 1 | Photo mode (smartphone) | M | — | kq-mobile | C3 |
| 2 | In-game cinematic | S–M | — | kq-systems | C1 |
| 3 | Tour group that follows the guide | L | NPC path-walk op (new), characters pipeline for the doubles | kq-systems | C2 |
| 4 | Animals: roe deer, the two dogs | M | §2 (deer close-up), §3 (dogs follow Jost) | kq-characters | C5 |
| 5 | Karlsbergquelle home base | M | — | kq-systems (systems side), kq-story (content) | C4 |
| 6 | Party scene | M–L | §3 (crowd placement), §4 (dogs), endings flow change | 3D subagent (set, later), kq-story (beat) | uses C1, C2, C5 |
| 7 | Training fight flag (small) | S | — | kq-story (flag) with kq-mobile (combat) | — |

The exact interfaces are in **"Story contracts"** below; where a sketch in §1–§6 differs, the contract wins.

---

## 1. Photo mode (smartphone)

**What it does.** Press **N** or the touch camera button to toggle the phone. Gameplay overlays step away. An inline choice lowers the phone and keeps it down until the choice ends. The phone has 1×/2× zoom and a click or tap shutter. A good shot requires framing, size, distance and a clear majority of sight rays (three of five for animals, two of three for other targets). A good shot adds an **album** entry and can unlock a codex card or a photo card. In the past the phone shows „Kein Netz“ and the image comes out white. See the [tour tuning](slice-v0.md#deer-photo-and-sneak-tuning-task-017) and [runtime details](../../ARCHITECTURE.md#photo-srcsystemsphoto--fotomodus-the-smartphone-camera-present-day-only).

**Reusable code (audit §8).** The capture core is `src/systems/notes/index.ts:252–270` `screenshot()` (re-render via `post.render`, draw to a 2D canvas, JPEG data URL). `preserveDrawingBuffer` is only on with `?preserve` (`boot.ts:48`), but the notes path re-renders, so no flag is needed. Lantern / camera FOV live in `src/player/camera.ts` (camera owner kq-mobile: report the zoom hook). Journal tabs: `src/systems/progression/journal-tabs.ts`.

**API sketch.**
```ts
// src/systems/photo/index.ts
registerTarget({ id: 'photo.p.reh', era: 'today', at: () => ({ x, y, z }), r: 0.8,
  minFrac: 0.055, maxDist: 27, fallbackDist: 32, fallbackAfterS: 90, fallbackMinFrac: 0.045,
  needAll?: string[] /* both deer */, grants?: { codex?: 'cx.T4', card?: 'ph.insel', flag?: string } });
// events: 'photo:open' | 'photo:close' | 'photo:shot' {targets, good, stars, noSignal} | 'photo:good' {id, stars}
// story waits with { "event": "photo:good", "match": { "id": "photo.p.reh" } }  (no new condition type; contract C3)
// quest objective type: "photo" { target, grants }
album(): { id, era, t, thumb /* JPEG ≤ 30 KB */, label_de }[]   // persisted in the save, max 60
```
Storage: thumbnails in the save make it heavy; cap at 60 × 30 KB (≈ 1.8 MB) or store only the target id and re-render a stock card image (v1: **id only**, a pre-rendered card per target; the live JPEG only for the session). Touch: a camera icon in the top row (`src/ui/touch.ts`).

**Tests.** Unit: `tests/photo.test.ts` (judging: centred / off-centre / occluded / too far / fallback after 90 s; past era → no targets; grants once). Content validator: every `photo` objective names a registered target; every target lies inside the playable extent. e2e: `e2e/photo.spec.ts` (open the phone at the car park, shoot the building, album has 1 entry; shoot in 1789 → white + „Kein Netz“), touched specs + smoke under the heavy lock.

---

## 2. In-game cinematic (cutscene)

**What it does.** Short, skippable camera moves on game time without cuts to video: the deer close-up (≈ 6 s), the wind and the dogs (≈ 20 s, mostly in-game camera with a gentle pull), the guide's „Guckt mal hoch“ tilt, the party orbit under the credits. Input is frozen except „skip“; reduced motion swaps the move for two still frames.

**Reusable code.** `src/systems/story/endings/stage.ts`: pure `stageAt(t)` timeline (rise / back / turn / pitch / fade / fog / sun / dark), player-relative eye, skip on any key, reduced-motion still shots. The Quelle touch scene (`src/systems/quelle/index.ts`: game-time scene, `cameraHints`, freeze, `hold(t)`) is the second pattern.

**API sketch.** Generalise `stageAt` into a keyframe list:
```ts
// story action
{ "do": "cinematic", "id": "reh", "keys": [
  { "t": 0,   "eye": { "rel": "player", "back": 0.2, "up": 1.5 }, "look": { "target": "animal:ricke" }, "fov": 40 },
  { "t": 2.5, "fov": 18 }, { "t": 6, "end": true } ], "skippable": true }
// events 'cinematic:start' {id, seconds}, 'cinematic:end' {id, skipped}  (contract C1)
```
`target` resolves `npc:<id>`, `animal:<id>`, `xyz`. The party orbit is `{ "orbit": { "x": 1216, "z": -1114, "r": 14, "period": 40 } }`.

**Tests.** Unit: keyframe interpolation and the skip path (`tests/cinematic.test.ts`, like the existing stage tests); reduced motion gives ≤ 2 stills. e2e: covered by the photo / tour specs (the deer cinematic ends and returns control).

**Wind shot (TASK-016).** Beat t8 starts the skippable shot with the dogs' run cues. The camera
looks down from a fixed path beside the hillside and aims between the two live dog targets.
Reduced motion holds the camera still on each side of the cut. The headless tour test simulates
both dogs over the shipped terrain and checks landscape and portrait framing. If a player or
visitor occupies a run waypoint, a dog can round it from the edge of the collision circle.

---

## 3. Tour group that follows the guide

**What it does.** Gerold walks the route stop by stop; 14 group NPCs (7 doubles, 7 extras) follow him in a loose cluster; two dogs follow Jost. At each stop the group gathers in a half circle facing the guide; Gerold speaks when the player is within 12 m. If the player is > 25 m behind, the group **waits** (Gerold turns, bark „{Name}, kommst du?“); if the player runs ahead > 30 m, Gerold calls „Nicht so schnell, das Schloss läuft nicht weg.“ and the next stop still triggers only when the guide arrives. Ops: `walk`, `hold` (the deer), `gather`, `despawn` (out of sight at the Quelle).

**Reusable code (audit §8).** **No NPC path-walk exists**: only `spawn`/`despawn` (`story/types.ts:424`). Templates:
- `npc:follow` escort (`src/systems/npc/index.ts:122–165`, `:512` `followStep`, 2.4 m behind) — follower logic for the group around the guide.
- quests `escort` objective (`quests/index.ts:383–385`, `rpg/types.ts:99, :150`) — the "wait for the player" leash.
- `src/systems/scenery/convoy.ts` (`CONVOY_ROAD` polyline, speed, a walking carter) — walking a polyline with foot placement on the terrain.
- `src/systems/fx/k3-crowd.ts` (scene-clock choreography) — cheap extras.
- Twins API (`src/systems/npc/twins.ts`, `roster.ts`, `NpcPlacement.look`) — the doubles as `look: 'solid'` modern figures (the duke's and Mannlich's roster ids exist; the doubles get **separate** roster ids, e.g. `double.herzog`, so the historical rule "the duke is never seen" stays intact).
- Paths: `public/data/paths.json` already has every edge of the route (`tour-route-research`).

**API sketch.**
```jsonc
{ "do": "npc", "op": "walk", "npc": "imhoff", "route": "p-fuehrung", "to": "felsen", "speed": 1.6,
  "leash": { "wait": 25, "resume": 12 }, "group": "fuehrung" }
{ "do": "npc", "op": "gather", "group": "fuehrung", "around": "imhoff", "face": "imhoff", "r": [3, 7] }
{ "do": "npc", "op": "hold", "group": "fuehrung" }
// events: 'npc:arrived' {npc, at, route, skipped}, 'group:waiting' {group, leader, dist}, 'group:resumed' {group, leader}  (contract C2)
```
`path` names a polyline registered from `paths.json` node ids (route `p-fuehrung`, segments between stops). Followers: a boids-lite offset (slot ring behind the guide, 1.2–4 m, jitter), terrain-snapped, trunk avoidance via `forest.trunksNear`. Walk speed 1.6 m/s for the group when the player is close, catching up at 2.4 m/s; the player's walk is 3.2 m/s (`STANCES.stand.speed`), so the player is never held back. Performance: 14 figures at low tier use the K3 crowd's cheap path; full rigs only within 25 m.

**Tests.** Unit: `tests/npc-walk.test.ts` (polyline progress, leash wait/resume, gather slots don't overlap, no follower inside a trunk); validator: every `walk` path resolves to `paths.json` nodes and stays inside the extent. e2e: `e2e/tour.spec.ts` (a walk-only bot follows the marker from the car park to the Quelle; the group arrives at each stop; standing still 40 s → group waits and barks; total time within the pacing budget below).

**Stop staging (TASK-016).** Stopped members turn toward Gerold. He faces the player during
conversation and nearby story dialogue while he is stopped. Reduced motion sets the heading
immediately. The first departure waits until the line ends, its subtitle has had time to read
when muted, or the player advances it. If a save is loaded before Gerold sets out for the turnoff,
he starts the line again. Once he has set out, the saved route progress carries over. Muted
subtitles type silently. At Felsenpfad, fourteen authored slots follow the trail and reserve space
from scattered boulders. The camera checks the final lens path for terrain and solid scenery after
framing, pulls in immediately, and eases out again when the path clears. Felsenpfad dialogue and
radio captions sit in the upper band on desktop and landscape phones. Portrait phones show the
rotate prompt during gameplay. The player and dogs share the visitors' collision circles. The
circles' ground heights are refreshed when the visitors move.

---

## 4. Animals: roe deer, the two dogs

**What it does.**
- **Roe doe and fawn** (`reh.ricke`, `reh.kitz`): grey winter coat, fawn without spots, nearly the doe's size, follows her within 2 m. Idle graze / ear flick / head-up „sichern“ (1.5 s tell). A perception meter like the pack's but inverted in purpose: crouch + slow lowers it, standing / running / sprinting raises it; at the threshold both bound 25 m and stop again (no fail state). Today only.
- **Diane and Bijou** (present-day dogs): follow Jost (`npc:follow`), sniff, sit at stops; scripted bolt in t5 (run a path uphill, bark, return); at the party they lie down (keep ending: at the player's feet).

**Reusable code.** `src/systems/menagerie/*` (cassowary, dromedary, jaguar: story-spawned `menagerie:spawn`, era-bound, knockdown, never "caught", persisted) — the deer are a new species there with a **non-hostile, shy** mode. Perception: `src/systems/hunt/perception.ts` (`lineOfSight`), noise / visibility from `STANCES` (`src/player/stance.ts`). The hunt's `hunt:tableau` cues (lie / eyes / rest) for the dogs' poses. Models: CC0 base + Blender pipeline (memory rule: authored, critic score ≥ 8 before the owner sees them).

**API sketch.**
```jsonc
{ "do": "animal", "op": "spawn", "kind": "reh", "look": "ricke", "id": "ricke", "x": 817, "z": -704, "shy": { "notice": 30, "flee": 20, "settle": 25 } }
{ "do": "animal", "op": "spawn", "kind": "reh", "look": "kitz", "id": "kitz", "follow": "animal:ricke" }
{ "do": "animal", "op": "run", "id": "diane", "path": [[700,-640],[720,-690],[700,-640]], "bark": true, "back": true }
// events: 'animal:alert' {id}, 'animal:fled' {id, by, dist}, 'animal:settled' {id}, 'animal:returned' {id}  (contract C5)
```

**Tests.** Unit tests cover the crouched approach, upright alert and flight, settling, and the fawn's gap. The `tour-slice.spec.ts` regression takes the deer photo at 2× from the route side.

---

## 5. Karlsbergquelle home base

The spring is the present-day chapter checkpoint, fallback wake spot and Q-hold return
destination. Entering the 12 m home ring on foot emits `hub:enter` for healing, the hunt reset,
oil refill, free respec and arrival dialogue. Leaving emits `hub:leave`.

Interaction at the trough is „Wasser berühren“ when the story sets `quelle.call` and the player
is within reach and facing the water. Pause provides the Codex, saving, collections and chapter
selection. See [C4](#c4-karlsbergquelle-home-contract) for the runtime contract and tests.

---

## 6. Party scene

**What it does.** After the epilogue page, the `EndingScreen` releases control; the player stands at the edge of today's palace plateau at dusk; the party is spawned (Gerold, Marlene, 7 doubles, 7 extras, 2 dogs, props: a trestle table, cake, a mulled-wine pot on a gas stove, a fire bowl, fairy lights between two beeches, lanterns); the scripted beats run (arrival, the staff, Gerold's speech per ending), the credits roll as a strip while the camera orbits (skippable, player can walk), then free play on the plateau.

**Reusable code (audit §5, §8).** Hook (a) of the audit: in `endings/ui.ts:222` (the `ending-credits` button) close the modal and call a new dep `d.party?(id, done)` like `d.stage`; `done` opens a credits **strip** instead of the modal credits page. Props: `src/systems/fx/stage/*` (`{"do":"cue"}` set pieces), lit windows / lights from `scenery/windows.ts`. Crowd: §3 group (`gather` around the table) + `fx/k3-crowd.ts` for idle loops. Fire: the fire-bowl prop with the existing fire particles (K3). Fireworks: **not** used (memorial theme of 1785). Looks: `lookFor('dusk')`. `flag.end` picks the variant.

**As built (story side, 2026-11-21).** The epilogue button (`ending-credits`) closes the modal and calls `d.party(id)`. Inside the endings chapter that only sets the flag `story.party`: beat e2 ends, beat e3 „Das Fest“ runs (card, teleport to 1200/−1095, look `dusk`, autosave). Its reactions per `flag.end` re-issue `{"do":"cue","id":"party:set","data":{"variant":"museum|burn|keep"}}` (so a resume rebuilds the party), play the arrival line and Gerold's speech (§8.3), then `{"do":"cue","id":"party:credits"}` after the speech, not on `party:ready` (the speech would collide with the spotlight lines). One reaction per `party:spotlight` (`match: {who}`) speaks one short line (≤ 46 characters, `ms` 2400). The story system turns `credits:done` into `story.credits` (`story:credits`, autosave); e3 completes on that flag and places the guide and the doubles as npc placements bound to their party bodies (one `npc:talk` greet line each, `content/packs/party.pack.json`). Post-game, every load re-issues `party:set` for the chosen ending. Outside the chapter (debug `kq.story.ending(id)`) `d.party` emits `party:set` and on `party:ready` `party:credits` itself. Not built: §8.2 step 2 (Marlene and the staff), the per-ending last picture (§8.2 step 5).

**Credits (TASK-013).** The party strip and the fallback page use the same contributor names and roles from `content/credits.json`, asset authors grouped by source from `public/assets/LICENSES.json`, and German tools, data and closing text from `content/party/credits.json`. Players can use Enter, Escape or „Überspringen“ to return to free play. Escape also dismisses the credits when the browser reports a pointer-lock exit. The animated strip keeps rolling when movement hands back the orbit camera. The in-game reduced-motion setting or the system preference shows a static list that players can scroll until they dismiss it. No orbit plays in that mode.

**Tests.** Unit coverage checks the ending cues for all three variants, the author grouping, reduced-motion timing, the single completion event and Escape reported as a pointer-lock exit. The story spec reaches the credits from the epilogue and clicks the skip button. The party spec covers Enter, Escape, landscape phone crawl clipping, and scrolling and tapping with reduced motion. The storyboard uses the existing party strip selector for `e-fest-abspann`.

---

## 7. Training fight flag

**What it does.** During t12 the player's HP never drops below 30 % (`training` flag), the Nebelinge use long telegraphs (×1.5 wind-up), and each lesson caption stays pinned until performed. Clears when `q.p.training` completes.

**Reusable code.** `combat.disabled` (`src/systems/combat/index.ts:17, :467, :496`) shows the flag pattern; pinned lesson captions exist for the reform rule (playtest round 10).

**Tests.** Unit: HP floor; wind-up scale only while the flag is set. The prologue fights in `tests/combat-encounters.ts:30–32`, `tests/combat-bots.ts:71`, `tests/combat-balance.test.ts:17–26, :129–142`, `tests/combat-human.test.ts:94–95` re-point to the training encounter.

---

## Story contracts (for kq-systems / kq-mobile)

These are the interfaces kq-systems, kq-mobile and kq-characters build against. They follow the patterns in `src/systems/story/types.ts` (an `Action` union of `{ do: … }` shapes over `ActionBase` with `delay` / `onResume`), `src/systems/story/validate.ts` (`err` / `warn` per action `case`), the `declare module '../core/events' { interface GameEvents { … } }` augmentation (as in `src/systems/contracts.ts`) and debug hooks under `kq.*` (`declare module '../../debug/hooks' { interface KqHooks { … } }`).

**Principle: no new condition types.** The story engine has no pluggable condition hook. Beats wait on **events** through the existing `EventCond` (`{ "event": …, "match": {…}, "gte": {…}, "lte": {…} }`), which compares **scalar** payload fields only (`engine.ts` `eventMatches`), or on flags (`FlagCond`). So every event below that a story may wait on has **scalar fields** (string, number, boolean) for everything a condition needs; arrays are allowed only as extra summary fields. The engine already hears every event (`ctx.events.onAny`, `story/index.ts:454`) and latches it across save / load. New story **actions** emit a request event; the owning system listens. kq-story owns `story/types.ts`, `story/validate.ts` and the content; the systems own their modules and their event declarations.

### C1. Cinematic

**Owned by:** kq-systems (`src/systems/cinematic/`, the request listener, playback, input lock, reduced motion, debug hook). kq-story: the `CinematicAction` type, its validator case, `content/cinematics/*.json`.

```ts
// story/types.ts (kq-story)
export type CineTarget = `npc:${string}` | `animal:${string}` | 'player';
export interface CinematicKey {
  /** Seconds from start; the first key is 0, strictly increasing. */
  t: number;
  /** Eye: player-relative offsets (the endings/stage.ts keys) or an absolute point (y = metres above ground). */
  eye?: { rel: 'player'; back?: number; up?: number; right?: number; turn?: number } | { x: number; z: number; y?: number };
  /** What the camera looks at: a target id, a point, or a fixed pitch / yaw (degrees, compass). */
  look?: { target: CineTarget } | { x: number; z: number; y?: number } | { pitch: number; yaw?: number };
  fov?: number;              // 15–90 degrees
  /** The stageAt() look keys, 0..1: black fade, fog, sun, darkness. */
  fade?: number; fog?: number; sun?: number; dark?: number;
  ease?: 'smooth' | 'linear'; // into this key, default smooth
}
export interface CinematicAction extends ActionBase {
  do: 'cinematic';
  id: string;
  /** Exactly one of: inline keys, a file ref (content/cinematics/<ref>.json), an orbit. */
  keys?: CinematicKey[];
  ref?: string;
  orbit?: { x: number; z: number; r: number; period: number; y?: number; seconds: number };
  skippable?: boolean;       // default true
  lockInput?: boolean;       // default true (move, look, attack, E frozen; Esc pauses the timeline)
  /** Reduced motion: 'stills' (first and last key, cross-fade, ≤ 3 s; default) or 'skip'. */
  reduced?: 'stills' | 'skip';
}

// src/systems/cinematic/index.ts (kq-systems)
declare module '../../core/events' {
  interface GameEvents {
    'cinematic:play': { id: string };                      // story → system (keys looked up by id)
    'cinematic:start': { id: string; seconds: number };
    'cinematic:end': { id: string; skipped: boolean };
  }
}
declare module '../../debug/hooks' {
  interface KqHooks { cinematic?: { play(id: string): void; skip(): void; at(id: string, t: number): void; list(): string[]; playing(): string | null } }
}
```

- **Waiting:** `{ "event": "cinematic:end", "match": { "id": "reh" } }`.
- **Rules:** skip only after a 0.5 s grace (any key / click / touch). The HUD hides; captions and `dialogue:say` still show. No autosave while playing. On resume after a load, a cinematic that was playing is **not** replayed: the system emits `cinematic:end { skipped: true }` so the beat does not hang. Reduced motion follows `settings.reducedMotion`.
- **Validator (story/validate.ts):** `id` matches `ID_RE`. Exactly one of `keys` / `ref` / `orbit`. `keys`: ≥ 2 entries, `t[0] === 0`, strictly increasing, last `t` between 0.5 and 60. `fov` between 15 and 90. Look keys between 0 and 1. A `target` matches `npc:<roster id>` / `animal:<id>` / `player`. `ref` exists in `refs.cinematics`. `orbit.seconds` is between 1 and 600.
- **Example (t6, the deer close-up):**
```json
{ "do": "cinematic", "id": "reh", "skippable": true, "keys": [
  { "t": 0,   "eye": { "rel": "player", "back": -0.2, "up": 1.5 }, "look": { "target": "animal:kitz" }, "fov": 40 },
  { "t": 2.5, "fov": 18 },
  { "t": 6,   "fov": 18, "look": { "target": "animal:ricke" } } ] }
```

### C2. Tour walk, group and follow

**Owned by:** kq-systems (`src/systems/npc/walk.ts`, `npc/group.ts`, persistence in the npc slice, debug hooks). kq-story: the action types, the validator, `content/routes/*.json`, the bark lines. kq-characters: the double figures (roster ids `double.*`).

```ts
// story/types.ts (kq-story) — added to the npc action family; the existing op 'spawn'|'despawn' shape stays as is
export interface NpcWalkAction extends ActionBase {
  do: 'npc'; op: 'walk';
  npc: string;                          // roster id, e.g. 'imhoff'
  /** Either a route with named stops (content/routes/<id>.json) and the stop to walk to, or a raw polyline. */
  route?: string; to?: string;
  path?: [number, number][];
  speed?: number;                       // m/s, default 1.6; catches up at 1.5× when the player is near
  /** Wait for the player: stop when the player is farther than r, go on when back within resume (default r − 13). */
  wait?: { for: 'player'; r: number; resume?: number; bark?: string };   // bark = a line-group id, e.g. 'imhoff.bark.wait'
}
export interface NpcGroupAction extends ActionBase {
  do: 'npc'; op: 'group';
  group: string;                        // e.g. 'fuehrung'
  members: string[];                    // roster ids (doubles and extras)
  leader: string;                       // roster id; members spawn in a ring around it
  spacing?: [number, number];           // ring radii, default [1.2, 4]
  era?: 'today';
}
export interface NpcFollowAction extends ActionBase {
  do: 'npc'; op: 'follow';
  /** One npc or a whole group follows a leader (an npc id; 'player' keeps the existing npc:follow escort). */
  npc?: string; group?: string;
  leader: string;
  spacing?: number;                     // metres behind / slot spacing, default 2.4
  off?: boolean;                        // true stops following
}
export interface NpcGatherAction extends ActionBase {
  do: 'npc'; op: 'gather' | 'hold' | 'release';
  group: string;
  around?: string; face?: string;       // gather: half circle around `around`, everyone faces `face`
  r?: [number, number];
}

// content/routes/p-fuehrung.json (kq-story)
interface Route { id: string; stops: { id: string; x: number; z: number }[]; points: [number, number][] }

// src/systems/npc/walk.ts (kq-systems)
declare module '../../core/events' {
  interface GameEvents {
    'npc:walk': NpcWalkAction | NpcGroupAction | NpcFollowAction | NpcGatherAction;  // story → system
    /** at = the stop id (route) or 'end' (raw path); skipped = reached by a snap, not on foot. */
    'npc:arrived': { npc: string; at: string; route: string; skipped: boolean };
    'group:waiting': { group: string; leader: string; dist: number };
    'group:resumed': { group: string; leader: string };
  }
}
declare module '../../debug/hooks' {
  interface KqHooks { walk?: { go(npc: string, route: string, to: string): void; snap(group: string, stop: string): void; groups(): { group: string; leader: string; at: string; waiting: boolean }[] } }
}
```

- **Waiting:** `{ "event": "npc:arrived", "match": { "npc": "imhoff", "at": "felsen" } }`. A stop counts whether walked or snapped; if a beat must know, add `"match": { "skipped": false }`.
- **The "come along" bark:** on `group:waiting`, the system asks the bark system for one line from `wait.bark`, at most every 20 s, never during a conversation. kq-story writes the lines (`imhoff.bark.wait.*`).
- **Finding the group** (round 2, owner playtest: lost the group; `src/systems/walk/find.ts`, thresholds in `FIND`): the guide shows on the compass („Gruppe · 45 m“) beyond 24 m or when he is out of the view cone from 15 m; once per stray episode (beyond 40 m, or walking away for 10 s) the system emits `walk:bark { id: '<speaker>.bark.hier' }` (kq-story writes `imhoff.bark.hier`); after 60 s apart or beyond 80 m it offers „Zur Gruppe“: hold Q (the touch Epoche button) for 1.2 s → `group:rejoin { group, x, z, yaw }`, the story fades and places the player on the route just behind the group's tail. `group:find { group, prompt }` tells the story that Q belongs to the offer. No fail state; quiet during conversations and cinematics; off with `?nofind` or flag `walk.find` = false.
- **Persistence:** the npc slice stores per walker `{ npc, route, to, progress (m along the polyline), waiting }` and per group `{ group, leader, members, mode: 'follow'|'gather'|'hold' }`. On restore, walkers are placed at their progress and members re-slotted around the leader. No event is re-emitted on restore (latched story events are already saved).
- **Teleport and skip:** if the player teleports (map travel, checkpoint, wake) more than 60 m from the leader, the group snaps to the route stop nearest to the player that lies **ahead** (never behind) and emits `npc:arrived { skipped: true }` for that stop only. The tour skip on replay despawns the group (`op: 'despawn'`, `npc: '*'` with `group`) and starts at t10. In the past eras the group does not exist (era `today`).
- **Validator:** `op` is one of the listed ops. `npc` / `leader` / `members` have roster entries (warn when generic). `walk` has exactly one of `route` + `to` / `path`. `route` exists in `refs.routes` and `to` is one of its stops. A `path` has ≥ 2 points, all inside the extent (x 150…2300, z −2150…500), with consecutive points ≤ 30 m apart. `speed` is between 0.5 and 4. `wait.r` is between 8 and 60. `group` ops refer to a group created earlier in the chapter. In route files, every point is inside the extent and every stop lies within 3 m of the polyline.
- **Example (t3, from the car park to station 2):**
```json
[ { "do": "npc", "op": "group", "group": "fuehrung", "leader": "imhoff",
    "members": ["double.herzog", "double.mannlich", "double.hanne", "double.peter", "double.jost", "double.soll", "double.liese",
                "extra.mats", "extra.mutter", "extra.paar_a", "extra.paar_b", "extra.wanderin_a", "extra.wanderin_b", "extra.student"] },
  { "do": "npc", "op": "follow", "group": "fuehrung", "leader": "imhoff" },
  { "do": "npc", "op": "walk", "npc": "imhoff", "route": "p-fuehrung", "to": "felsen", "wait": { "for": "player", "r": 25, "bark": "imhoff.bark.wait" } } ]
```
with the beat completing on `{ "event": "npc:arrived", "match": { "npc": "imhoff", "at": "felsen" } }`.

### C3. Photo targets

**Owned by:** kq-mobile (`src/systems/photo/`, the quest objective type `photo` with its schema and validator, the zoom hook in `src/player/camera.ts`, the album save slice, debug hooks). kq-story: the target and card ids, `content/photo/targets.json`, story conditions. kq-mobile ships placeholder targets; the real ids are ours.

```ts
// content/photo/targets.json (kq-story) → registerTarget() (kq-mobile), data-driven grants
export interface PhotoTarget {
  id: string;                                   // e.g. 'photo.p.reh'
  kind: 'animal' | 'detail' | 'inscription' | 'person';
  era: 'today';                                 // the only allowed value
  label_de: string;
  /** Exactly one anchor: a world point, an npc, or an animal (followed live). */
  at?: { x: number; z: number; y?: number }; npc?: string; animal?: string;
  r: number;                                    // bounding-sphere radius, m
  frame: {
    minFrac: number;                            // projected diameter / frame height
    centre?: 'third' | 'any';                   // default 'third'
    maxDist?: number; minDist?: number;         // inscriptions: maxDist ≤ 4
    needAll?: string[];                         // other targets that must be in the same frame (doe + fawn)
    fallback?: { afterS: number; maxDist: number; minFrac?: number; stars: 1 | 2 | 3 };
  };
  grants?: { codex?: string; card?: string; flag?: string };   // once, on the first good photo
}

// src/systems/photo/index.ts (kq-mobile)
declare module '../../core/events' {
  interface GameEvents {
    'photo:open': Record<string, never>;
    'photo:close': Record<string, never>;
    /** Summary of one shot (arrays allowed here; story conditions use photo:good). stars = best stars in the frame, 0 = nothing. */
    'photo:shot': { targets: string[]; good: string[]; stars: number; noSignal: boolean };
    /** One per good target in the shot (stars ≥ 2). Scalar only, for EventCond. */
    'photo:good': { id: string; stars: number };
  }
}
declare module '../../debug/hooks' {
  interface KqHooks { photo?: { album(): { id: string; stars: number; era: string }[]; has(id: string): boolean } }
}
```

- A shot of a target in frame gets one star. It earns two after passing the centre, size, sight, distance and `needAll` checks. A good shot earns three stars when the target is closer than 0.6 × `maxDist`.
- **Waiting:** `{ "event": "photo:good", "match": { "id": "photo.p.reh" } }`, optionally with `"gte": { "stars": 2 }`. There is **no** `{photo: id}` condition. A quest objective `{ "type": "photo", "target": "photo.p.reh" }` counts the same event.
- **Kein Netz:** in any era other than `today` the phone shows „Kein Netz“ and the image comes out white. No target is judged, and the system emits `photo:shot { targets: [], good: [], stars: 0, noSignal: true }`, never `photo:good`. Laub's `laub.bark.netz.*` listens to `noSignal`.
- **Album and codex:** the album (target id, best stars, era, time) persists in the save. It is capped at 60 entries and stores no JPEGs: a pre-rendered card image per target, plus the live JPEG only for the session. `grants.codex` unlocks a codex card through the same entry point quests use. Photos give **no XP**, unless a quest objective carries the card (see the [prologue budget](../../../content/bible/01-prolog.md#5-übergabe-und-ep)). `grants.card` adds a photo card (`ph.*`), which is album-only. Grants fire once per target id.
- **Validator (kq-mobile, `content/photo/targets.json` + the quest objective):** unique ids; `era === 'today'`; exactly one of `at` / `npc` / `animal`; `at` inside the extent; `r` > 0; `minFrac` between 0.02 and 1; `needAll` ids exist; `grants.codex` exists in the codex pack; `grants.card` exists in the photo-card list. kq-story's story validator warns when a `photo:good` match id is not a known target.
- **Example (target t6):**
```json
{ "id": "photo.p.reh", "kind": "animal", "era": "today", "label_de": "Ricke und Kitz", "animal": "ricke", "r": 0.8,
  "frame": { "minFrac": 0.055, "maxDist": 27, "needAll": ["photo.p.kitz"], "fallback": { "afterS": 90, "maxDist": 32, "minFrac": 0.045, "stars": 2 } },
  "grants": { "codex": "cx.T4" } }
```

### C4. Karlsbergquelle home contract

- `src/systems/story/hub/home.ts` defines `HOME` from the Quelle layout. Its center is
  1061/−834.5, its arrival radius is 12 m, the wake pose is 1059.3/−833.1 at yaw 50° and the combat
  safety radius is 40 m in the present.
- `story/index.ts` emits `hub:enter` and `hub:leave` when home membership changes. After a
  `shift:done` into today with reason `return`, the story teleports to `HOME.spawn` and emits
  `home:arrived { reason: 'return' }`. Being caught uses its own wake logic, with `HOME.spawn`
  as the fallback.
- `src/systems/quelle/` handles the reach and facing checks, the E or touch prompt and the time
  travel scene. The spring keeps its usual interaction claim through `e.owner` while the prompt is
  up.
- `tests/story.test.ts` covers home-ring membership, the wake pose and return shifts.
  `e2e/quelle.spec.ts` covers the desktop interaction and Q return. `e2e/touch.spec.ts` covers
  the water action and Pause chapter page on a landscape phone.

### C5. Animals (deer and dogs)

**Owned by:** kq-characters (models, rigs, animation, and the animal behaviour as a new shy mode in `src/systems/menagerie/`, per WP-17). kq-systems: help on the perception reuse (`hunt/perception.ts`) if asked. kq-story: the action type, its validator, the placements.

```ts
// story/types.ts (kq-story)
export interface AnimalAction extends ActionBase {
  do: 'animal';
  op: 'spawn' | 'despawn' | 'run' | 'lie' | 'follow';
  id: string;                                  // instance id: 'ricke', 'kitz', 'diane', 'bijou'
  kind?: 'reh' | 'hund';                       // spawn only
  look?: 'ricke' | 'kitz' | 'diane' | 'bijou'; // model variant
  x?: number; z?: number; yaw?: number;
  era?: 'today';
  /** follow: whom to follow ('npc:double.jost', 'animal:ricke'); spacing in metres. */
  follow?: string; spacing?: number;
  /** spawn (reh): shy behaviour radii. Crouching at crouch speed halves notice. */
  shy?: { notice: number; flee: number; settle: number };
  /** run: a path to run (dogs bolting) and whether to come back to the follow target. */
  path?: [number, number][]; bark?: boolean; back?: boolean;
}

// src/systems/menagerie (kq-characters)
declare module '../../core/events' {
  interface GameEvents {
    'animal:spawn': AnimalAction;                                     // story → system
    'animal:alert': { id: string };                                   // head up, 1.5 s tell
    'animal:fled': { id: string; by: 'player' | 'cue'; dist: number };
    'animal:settled': { id: string };                                 // stopped again after fleeing
    'animal:returned': { id: string };                                // a dog back at its follow target
  }
}
declare module '../../debug/hooks' {
  interface KqHooks { animals?: { list(): { id: string; kind: string; x: number; z: number; state: string }[]; alert(id: string): void } }
}
```

- The **deer notice meter** rises with the player's stance noise and visibility (`STANCES`) inside `notice` m and in line of sight. Crouching at crouch speed halves the radius, allowing an approach to photo range. Standing within `flee` builds suspicion even while still. When the meter is full and the warning has played, both deer bound 25 m away and stop (`animal:settled`). A `follow` fawn stays within 2 m of the doe. See the [tour tuning](slice-v0.md#deer-photo-and-sneak-tuning-task-017).
- **Dogs:** `op: 'follow'` with `follow: 'npc:double.jost'`. `op: 'run'` with `path`, `bark: true`, `back: true` is the t5 bolt, ending in `animal:returned`. `op: 'lie'` is the party pose (keep ending: at the player's feet). Dogs are never hostile and never targetable, and in no era are they the Meute.
- **Waiting:** `{ "event": "animal:returned", "match": { "id": "bijou" } }` (t5 ends); `{ "event": "animal:fled", "match": { "id": "ricke", "by": "player" } }` (an optional Gerold line „Zu schnell.“).
- **Validator:** `id` matches `ID_RE`. `spawn` needs `kind` and numeric x/z inside the extent (or `follow`). `era` is `today` when given. `shy` needs `notice > flee > 0` and `settle > 0`. `run` needs a `path` of ≥ 2 points inside the extent. `follow` matches `npc:<roster id>` or `animal:<spawned id>`. The other ops refer to an id spawned earlier in the chapter.
- **Example (t5 and t6):**
```json
[ { "do": "animal", "op": "run", "id": "diane", "path": [[700, -640], [722, -688], [700, -640]], "bark": true, "back": true },
  { "do": "animal", "op": "run", "id": "bijou", "delay": 0.4, "path": [[701, -641], [716, -692], [701, -641]], "bark": true, "back": true },
  { "do": "animal", "op": "spawn", "kind": "reh", "look": "ricke", "id": "ricke", "x": 817, "z": -704, "yaw": 250, "era": "today",
    "shy": { "notice": 30, "flee": 20, "settle": 25 } },
  { "do": "animal", "op": "spawn", "kind": "reh", "look": "kitz", "id": "kitz", "follow": "animal:ricke", "spacing": 1.5, "era": "today" } ]
```

---

## Pacing targets (replace "first fight < 60 s")

`e2e/pacing.spec.ts` ("a first fight before a minute is up") no longer applies. New targets, measured from „Ticket abreißen“ for a **walk-only bot** that follows the marker and skips lines as soon as allowed (human estimates in brackets):

| Moment | Bot (hard limit) | Human (design target) |
|---|---|---|
| in control | ≤ 5 s | ≤ 10 s |
| first guide line | ≤ 15 s | ≤ 15 s |
| first codex card (station 1) | ≤ 90 s | ≤ 2 min |
| first photo | ≤ 2.5 min | ≤ 4 min |
| wind and dogs | ≤ 3.5 min | ≈ 5 min |
| **first wow (the deer photo)** | ≤ 5 min | **≤ 8 min** |
| Marlene, relief 1–2 | ≤ 6 min | ≤ 10 min |
| at the Quelle | ≤ 7.5 min | ≤ 12 min |
| **time travel (touch)** | ≤ 9 min | **≤ 15 min** |
| **first fight (training)** | ≤ 10 min | **≤ 17 min** (≤ 90 s after the touch) |
| prologue end (`unlock k1`) | ≤ 12 min | 18–22 min |

Also: never more than 90 s of walking without a line, a photo target, a prompt or a beat; never two centre cards at once (the old card-discipline check stays). The touch must stay ≤ 15 min for humans because the time travel is the game's premise.
