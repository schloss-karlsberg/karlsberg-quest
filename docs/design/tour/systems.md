# New systems for the tour opening and the party endings (draft)

> Draft for the release after 0.5.0. Rough scopes only; no code is written by this draft. File:line references come from the impact audit (main @ 3a11702, still valid on 815b1cb for the touched files). Sizes: **S** ≤ 1 day, **M** 2–4 days, **L** ≥ 5 days of one worker. Gerold Imhoff is a placeholder name.

| § | System | Size | Depends on |
|---|---|---|---|
| 1 | Photo mode (smartphone) | M | — |
| 2 | In-game cinematic | S–M | — |
| 3 | Tour group that follows the guide | L | NPC path-walk op (new), characters pipeline for the doubles |
| 4 | Animals: roe deer, the two dogs | M | §2 (deer close-up), §3 (dogs follow Jost) |
| 5 | Quelle hub (home base) | M | — |
| 6 | Party scene | M–L | §3 (crowd placement), §4 (dogs), endings flow change |
| 7 | Training fight flag (small) | S | — |

---

## 1. Photo mode (smartphone)

**What it does.** Hold **N** (decided; P is pause, see `src/player/input.ts:79`) to raise the phone: a phone frame overlay, a slight zoom (1×/2×), click to shoot. A shot is **judged geometrically, not by pixels**: for each registered photo target in range, project its bounding sphere into the frame; "good" = centre in the middle third, projected size ≥ the target's minimum, a line-of-sight ray from the camera to ≥ 2 of 3 sample points is clear (`world.collider` / trunks), distance within limits (animals: max distance; inscriptions: ≤ 4 m). A good shot saves a JPEG thumbnail into the **album** (journal tab „Album“) and may unlock a codex card or a photo card. In a past era the frame shows „Kein Netz“ and the image comes out white (running joke; no targets judged). Owner decision 2026-11-20: present-only, key N, no XP for photos, codex/photo cards for good photos.

**Reusable code (audit §8).** The capture core is `src/systems/notes/index.ts:252–270` `screenshot()` (re-render via `post.render`, draw to a 2D canvas, JPEG data URL). `preserveDrawingBuffer` is only on with `?preserve` (`boot.ts:48`), but the notes path re-renders, so no flag is needed. Lantern / camera FOV live in `src/player/camera.ts` (camera owner kq-mobile: report the zoom hook). Journal tabs: `src/systems/progression/journal-tabs.ts`.

**API sketch.**
```ts
// src/systems/photo/index.ts
registerTarget({ id: 'photo.p.reh', era: 'today', at: () => ({ x, y, z }), r: 0.8,
  minFrac: 0.12, maxDist: 14, fallbackDist: 22, fallbackAfterS: 90,
  needAll?: string[] /* both deer */, grants?: { codex?: 'cx.T4', card?: 'ph.insel', flag?: string } });
// events: 'photo:open' | 'photo:close' | 'photo:shot' {targets: string[], good: string[]}
// story condition: { "photo": "photo.p.reh" }  (good shot taken)
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
// event 'cinematic:done' {id, skipped}
```
`target` resolves `npc:<id>`, `animal:<id>`, `xyz`. The party orbit is `{ "orbit": { "x": 1216, "z": -1114, "r": 14, "period": 40 } }`.

**Tests.** Unit: keyframe interpolation and the skip path (`tests/cinematic.test.ts`, like the existing stage tests); reduced motion gives ≤ 2 stills. e2e: covered by the photo / tour specs (the deer cinematic ends and returns control).

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
{ "do": "npc", "op": "walk", "id": "imhoff", "path": "p-fuehrung:1-2", "speed": 1.6,
  "leash": { "wait": 25, "resume": 12 }, "group": "fuehrung" }
{ "do": "npc", "op": "gather", "group": "fuehrung", "around": "imhoff", "face": "imhoff", "r": [3, 7] }
{ "do": "npc", "op": "hold", "group": "fuehrung" }
// events: 'npc:arrived' {id, wp}, 'group:waiting' {group}, 'group:resumed'
```
`path` names a polyline registered from `paths.json` node ids (route `p-fuehrung`, segments between stops). Followers: a boids-lite offset (slot ring behind the guide, 1.2–4 m, jitter), terrain-snapped, trunk avoidance via `forest.trunksNear`. Walk speed 1.6 m/s for the group when the player is close, catching up at 2.4 m/s; the player's walk is 3.2 m/s (`STANCES.stand.speed`), so the player is never held back. Performance: 14 figures at low tier use the K3 crowd's cheap path; full rigs only within 25 m.

**Tests.** Unit: `tests/npc-walk.test.ts` (polyline progress, leash wait/resume, gather slots don't overlap, no follower inside a trunk); validator: every `walk` path resolves to `paths.json` nodes and stays inside the extent. e2e: `e2e/tour.spec.ts` (a walk-only bot follows the marker from the car park to the Quelle; the group arrives at each stop; standing still 40 s → group waits and barks; total time within the pacing budget below).

---

## 4. Animals: roe deer, the two dogs

**What it does.**
- **Roe doe and fawn** (`reh.ricke`, `reh.kitz`): grey winter coat, fawn without spots, nearly the doe's size, follows her within 2 m. Idle graze / ear flick / head-up „sichern“ (1.5 s tell). A perception meter like the pack's but inverted in purpose: crouch + slow lowers it, standing / running / sprinting raises it; at the threshold both bound 25 m and stop again (no fail state). Today only.
- **Diane and Bijou** (present-day dogs): follow Jost (`npc:follow`), sniff, sit at stops; scripted bolt in t5 (run a path uphill, bark, return); at the party they lie down (keep ending: at the player's feet).

**Reusable code.** `src/systems/menagerie/*` (cassowary, dromedary, jaguar: story-spawned `menagerie:spawn`, era-bound, knockdown, never "caught", persisted) — the deer are a new species there with a **non-hostile, shy** mode. Perception: `src/systems/hunt/perception.ts` (`lineOfSight`), noise / visibility from `STANCES` (`src/player/stance.ts`). The hunt's `hunt:tableau` cues (lie / eyes / rest) for the dogs' poses. Models: CC0 base + Blender pipeline (memory rule: authored, critic score ≥ 8 before the owner sees them).

**API sketch.**
```jsonc
{ "do": "animal", "op": "spawn", "kind": "reh", "id": "ricke", "x": 817, "z": -704, "follow": null, "shy": { "flee": 20, "settle": 25 } }
{ "do": "animal", "op": "spawn", "kind": "reh", "id": "kitz", "follow": "ricke" }
{ "do": "animal", "op": "run", "id": "diane", "path": [[700,-640],[720,-690],[700,-640]], "bark": true }
// events: 'animal:alert' {id}, 'animal:flee' {id}, 'animal:settle' {id}
```

**Tests.** Unit: shy meter (crouch-slow approach reaches 14 m; standing at 20 m flees; flee distance and settle); fawn keeps within 2 m; dogs return to Jost. e2e: part of `tour.spec.ts` (sneak to the deer and take the photo).

---

## 5. Quelle hub (home base, replaces the Feldstation)

**What it does.** The Karlsbergquelle is the home in the present: chapter checkpoint, wake place when caught or out of oil, Q-hold target (decided), safe ring, and the rest-stop overlay. Tiles (re-themed `HubOverlay`): **Chronik** (opens from the Bussole lid), **Handy** (messages, album, map with chapter select — the old Kartentisch), **Mauerkante** (old Regal: finds, RPG counts, later the bottles' shelf), **Mauernische** (old Schublade: the Bussole state; Ende C's Chronik place is now the backpack, see `bible/06-enden.md`), **Stufe** (old Feldbett: rest → save `'auto','bench'`). The radio tile goes; Marlene speaks in person or by phone.

**Reusable code (audit §1, §2).** `src/systems/story/hub/overlay.ts` (6 tiles, `hub:use`); `story/index.ts:1302–1343` `useHub()` / `updateHub()` (swap `STATION` for `QUELLE` from `src/systems/quelle/layout.ts:20`, radius 12); the K1 pattern k1_0 / k1_0b (checkpoint and wake at 1059.3/−833.1 yaw 50, Q anchor at the spring). Remove `FieldStation` (`hub/station.ts`, 476 lines) and its colliders and `pushOut`. Move `SAFE.stationR` / `STATION_XZ` in `combat/rules.ts:196–198` to the spring. `hub:enter` keeps driving the hunt reset, the oil refill, the free respec and the full heal.

**Prompt coexistence.** At the trough the Quelle's E „Wasser berühren“ (`e.owner = quelle`) wins; the hub's low prompt „Pause an der Quelle“ shows only outside the trough's 2.5 m ring. Rule: within 2.5 m of the trough → Quelle E; 2.5–12 m → hub E.

**Q-hold.** Today Q-hold returns in place (`story/index.ts:1632–1650` → `requestShift('today','return')`, no teleport). **Decided (owner, 2026-11-20):** after `shift:done` with `reason === 'return'`, fade and teleport to the wake spot 1059.3/−833.1 yaw 50. Cost: one branch + texts (`ui.keys.shift`, `ui.tut.return`, `ui.hud.return_hold`, K2 objective at `02-kapitel-2.story.json:1001`).

**API sketch.**
```ts
// src/systems/story/hub/home.ts (replaces station.ts)
export const HOME = { x: 1061, z: -834.5, r: 12, spawn: { x: 1059.3, z: -833.1, yaw: 50 }, troughR: 2.5 } as const;
type HubItem = 'chronik' | 'phone' | 'shelf' | 'drawer' | 'map' | 'bench';   // 'radio','bed' removed
```

**Tests.** Update `tests/story.test.ts:473–520` (home spawn inside `HOME.r`), `tests/combat.test.ts` (safe at 30 m from the spring, not at 45 m; new memorial-style test: no today-era spawn within 40 m of the spring), `tests/travel.test.ts:77–92` (`karlsbergquelle` known at start, `feldstation` gone), `tests/story-ext.test.ts:308–336` (hub barks at the spring). e2e: `e2e/story.spec.ts` hub and caught cases at the spring, `e2e/quelle.spec.ts` (owned by the spring-tests agent until merged: coordinate).

---

## 6. Party scene

**What it does.** After the epilogue page, the `EndingScreen` releases control; the player stands at the edge of today's palace plateau at dusk; the party is spawned (Gerold, Marlene, 7 doubles, 7 extras, 2 dogs, props: a trestle table, cake, a mulled-wine pot on a gas stove, a fire bowl, fairy lights between two beeches, lanterns); the scripted beats run (arrival, the staff, Gerold's speech per ending), the credits roll as a strip while the camera orbits (skippable, player can walk), then free play on the plateau.

**Reusable code (audit §5, §8).** Hook (a) of the audit: in `endings/ui.ts:222` (the `ending-credits` button) close the modal and call a new dep `d.party?(id, done)` like `d.stage`; `done` opens a credits **strip** instead of the modal credits page. Props: `src/systems/fx/stage/*` (`{"do":"cue"}` set pieces), lit windows / lights from `scenery/windows.ts`. Crowd: §3 group (`gather` around the table) + `fx/k3-crowd.ts` for idle loops. Fire: the fire-bowl prop with the existing fire particles (K3). Fireworks: **not** used (memorial theme of 1785). Looks: `lookFor('dusk')`. `flag.end` picks the variant.

**API sketch.**
```jsonc
// 05-enden.story.json, new beat e3 "Das Fest" after story:ending, before story.credits
{ "id": "e3", "checkpoint": { "x": 1200, "z": -1095, "era": "today" }, "look": "dusk",
  "on_enter": [ { "do": "cue", "id": "party:set", "data": { "variant": "{flag.end}" } },
                { "do": "npc", "op": "spawn", "group": "fest", "set": "party" },
                { "do": "cinematic", "id": "fest-orbit", "orbit": { "x": 1216, "z": -1114, "r": 14, "period": 40 } } ],
  "complete": { "event": "credits:done" } }
```

**Tests.** Unit: party variant selection from `flag.end`; the three variant prop lists; credits strip timing. e2e: `e2e/stage-k2k4.spec.ts:360–402` moves from 760/−902 to the plateau and checks each ending reaches `story.credits` through the party; screenshots for the storyboard (#25–#28).

---

## 7. Training fight flag

**What it does.** During t12 the player's HP never drops below 30 % (`training` flag), the Nebelinge use long telegraphs (×1.5 wind-up), and each lesson caption stays pinned until performed. Clears when `q.p.training` completes.

**Reusable code.** `combat.disabled` (`src/systems/combat/index.ts:17, :467, :496`) shows the flag pattern; pinned lesson captions exist for the reform rule (playtest round 10).

**Tests.** Unit: HP floor; wind-up scale only while the flag is set. The prologue fights in `tests/combat-encounters.ts:30–32`, `tests/combat-bots.ts:71`, `tests/combat-balance.test.ts:17–26, :129–142`, `tests/combat-human.test.ts:94–95` re-point to the training encounter.

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
