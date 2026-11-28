---
id: TASK-095
aliases:
- TASK-095
title: 'Chestnuts distract watchers: they hear it land, walk over, and the player sneaks past'
slug: chestnuts-distract-watchers
status: review
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- gameplay
- combat
sprint: ''
milestone: ''
depends_on:
- TASK-090
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Chestnuts distract watchers: they hear it land, walk over, and the player sneaks past

## Goal

Owner, on TASK-090 (2026-11-28): "the idea is that chestnuts distract people. so i can throw
them, they hear it and walk towards it (and i can sneak). but your ideas also good."

Distraction is the purpose of the throw. The three follow-up ideas from TASK-090 are approved
too: a throw shakes down the hanging Fläschchen, the ten-second hound lure in chapter 2 stays
as it is, and the avatar gets a throw animation.

## Design

Described in `docs/ACTION-RPG.md` §7.1 "Distracting a watcher".

**Who.** The human watchers that can spot the player are the court's (1789, `src/systems/court`:
the Hofgärtner, the two Gardisten, the Lakai). The pack and its Pikeur already follow a noise
since TASK-090 (`PackSim.noise`); that stays unchanged.

**State machine** (`court/distract.ts`, pure): post → turn (0.7 s) → walk (1.7 m/s, at most 8 m
from the post, stopping 1.5 m short of the noise) → look (4 s, head swinging ±40°) → back → post.
Earshot is 17 m × loudness, about 12 m for a landing chestnut, so a throw from outside a 12–14 m
fan reaches it. The watcher's fan points where it looks throughout.

**Not an instant win.**

- Back at the post the watcher is wary for 20 s: a noise only turns its head for 1.8 s.
- A watcher busy with one noise ignores further ones.
- The gate's inspector never leaves the gate (a glance only), nor does a watcher in a Musterung.
- A watcher that reaches Misstrauen breaks the search off and walks back. While at Misstrauen,
  it ignores landing noises and gives no noise feedback.
- A chestnut that strikes a watcher alerts it: it faces the thrower for 3 s, +0.55 suspicion at
  once (tell „du wirfst mit Kastanien“), wary for 30 s.
- A throw that a watcher sees is a tell: +0.45 at once.

**How it reads.** The fan on the ground swings to the noise and travels with the figure, which
walks with its walk clip. The court heading takes priority over the figure looking at a nearby
player. The HUD queues „[Ein Gardist horcht auf und geht nachsehen]“, a short text line from the
watcher („Was war das?“), „[… geht zurück auf den Posten]“, „[… dreht nur kurz den Kopf]“, and
„[Getroffen! … sucht, wer geworfen hat]“.

**Moving a placed NPC.** The placement stays the post (and is what the save holds). The court
sends the npc system where the figure stands for now (`npc:offset`, transient); the figure, its
talk range and the chestnut's bounce follow it. Walls, water and steep banks end the walk early.

**Chestnuts and people.** `world:pelt`: the npc system answers when a placed person stands in a
chestnut's way; it bounces off, nobody is hurt, and `forage:impact` names the person so the court
can alert a struck watcher. The chestnut hits the first upright obstacle or body it reaches.

**Fläschchen.** A chestnut that strikes a trunk, a wall or the ground within 2 m of a hanging
bottle shakes it down, as a Wuchthieb does.

**Avatar.** `react('throw')`: the right arm comes through over the walking legs (0.45 s, the
punch clip, else the reach), and the body turns to the view. The chestnut leaves at once
on release. Muting the action cancels held aim and buffered throws. The animation expires while
hidden and clears on teleport.

## Plan

1. `court/distract.ts` and its unit tests.
2. Court: noises, struck watchers, the `throw` tell, captions, `npc:offset`, hooks.
3. Npc: the offset, `world:pelt`. Forage: ask it, name the person in `forage:impact`.
4. Fläschchen, avatar.
5. `e2e/court.spec.ts` (one extra block in the tells test), real-GPU frames, docs.

## Progress

- Branch `feat/chestnut-distraction-r1` and PR <https://github.com/schloss-karlsberg/karlsberg-quest/pull/148>.
- Review follow-up covers first projectile contact, court gaze priority, wariness timed from arrival,
  Misstrauen noise feedback, throw animation lifetime and input mute cancellation.
- Four gates passed locally on 2026-11-28.
- Updated `e2e/court.spec.ts` to exercise a real projectile hitting the watcher. Playwright is
  pending CI.

- Tests: `tests/court-distract.test.ts`, the „a thrown chestnut“ block of
  `tests/court-system.test.ts`, `tests/npc-encounter.test.ts`, `tests/flaschen-session.test.ts`,
  `tests/player-avatar.test.ts`; `e2e/court.spec.ts` (running and the staff are tells).
- Real GPU: `e2e/gpu/forage.gpu.ts` „a chestnut distracts a court watcher“.

## Acceptance criteria

- [x] A chestnut landing in earshot makes a court watcher turn, walk over, look around and return.
- [x] While it is away the player can cross where its fan was.
- [x] Repeating it at once only earns a glance; a direct hit alerts.
- [x] A throw shakes down a hanging Fläschchen.
- [x] The avatar throws; reduced motion and touch still work.
- [x] The chapter 2 hound lure is unchanged.
