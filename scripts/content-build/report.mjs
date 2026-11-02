import { readFileSync, readdirSync } from 'node:fs';
import { ROOT } from './common.mjs';
import { loadTerrain, pointInRing } from './terrain.mjs';
const T = loadTerrain(ROOT);
const dir = `${ROOT}/content/packs`;
const packs = readdirSync(dir).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const clues = packs.flatMap((p) => p.clues ?? []);
const cases = packs.flatMap((p) => p.cases ?? []);
const roomIds = new Set(T.rooms.map((r) => r.roomId));
const INTACT = new Set(['1789', '1793-02', '1793-07']);
console.log('cases', cases.map((c) => `${c.id}:${c.entries.filter((e) => e.kind === 'fact').length}F/${c.entries.filter((e) => e.kind === 'reading').length}R`).join(' '));
for (const c of clues) {
  const eras = [c.where.era].flat();
  const inside = T.fps.filter((b) => pointInRing(c.where.x, c.where.z, b.ring)).map((b) => `${b.id}${b.interior ? '(' + b.interior + ')' : ''}`);
  if (roomIds.has(c.where.anchor) || (inside.length && eras.some((e) => INTACT.has(e))))
    console.log(c.id, eras.join(','), c.where.anchor, inside.join(' '));
}
const beats = new Map();
for (const p of packs) for (const d of p.dialogue ?? []) if (d.trigger.event === 'story:beat') {
  const k = d.trigger.chapter; beats.set(k, new Set([...(beats.get(k) ?? []), d.trigger.beat]));
}
for (const [k, v] of beats) console.log('beats', k, [...v].join(' '));
const talks = new Map();
for (const p of packs) for (const d of p.dialogue ?? []) if (d.trigger.event === 'npc:talk') {
  const k = `${d.trigger.chapter}/${d.trigger.npc}`; talks.set(k, new Set([...(talks.get(k) ?? []), d.trigger.topic]));
}
for (const [k, v] of talks) console.log('talk', k, [...v].join(' '));
const skills = clues.filter((c) => c.requires?.skill || c.requires?.scanMode).map((c) => `${c.id}:${c.requires.skill ?? ''}${c.requires.scanMode ? ' scan' + c.requires.scanMode : ''}`);
console.log('skill/scan', skills.join(' '));
console.log('echoDate', clues.filter((c) => c.echoDate_de).map((c) => `${c.id}=${c.echoDate_de}@${c.where.era}`).join(' '));
console.log('lantern', clues.filter((c) => c.needsLantern).map((c) => c.id).join(' '));
