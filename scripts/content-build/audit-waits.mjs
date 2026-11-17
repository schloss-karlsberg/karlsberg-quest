#!/usr/bin/env node
/**
 * Pacing audit (docs/ACTION-RPG.md §14, playtest round 4 "standing still"): lists every story
 * action chain that runs longer than 12 s of spoken lines, with the moments an objective (with or
 * without a Bussole target) is set or cleared, and every beat that completes on a long timer.
 * A chain whose first marked objective comes late (or never) leaves the player standing while
 * people talk: give the next goal first and let them walk while the lines play.
 *
 *   node scripts/content-build/audit-waits.mjs [--all]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const all = process.argv.includes('--all');
const lines = new Map();
for (const p of fs.readdirSync(path.join(root, 'content/packs')).filter((f) => f.endsWith('.pack.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(root, 'content/packs', p), 'utf8'));
  for (const l of d.dialogue ?? []) lines.set(l.id, l.text_de ?? '');
}
// mirrors src/systems/story/index.ts run(): typing at 42 chars/s + holdSeconds + 0.4
const hold = (t, ms) => (ms !== undefined ? ms / 1000 : Math.min(9, Math.max(2.2, 1.4 + t.length * 0.045)));
function chain(list) {
  let at = 0;
  const ev = [];
  for (const a of list ?? []) {
    at += a.delay ?? 0;
    if (a.do === 'objective') ev.push(`${a.text ? (a.x !== undefined ? 'OBJ+M' : 'OBJ') : 'CLEAR'}@${at.toFixed(0)}`);
    if (a.do === 'echo') ev.push(`ECHO@${at.toFixed(0)}`);
    // a started / offered quest puts its goal on the Bussole and in the tracker: that is a goal too
    if (a.do === 'quest' && (a.op === 'start' || a.op === 'offer')) ev.push(`OBJ+M@${at.toFixed(0)}`);
    if (a.do === 'say') {
      const t = a.text ?? lines.get(a.line) ?? '';
      at += t.length / 42 + hold(t, a.ms) + 0.4;
    }
  }
  return { total: at, ev };
}
function timers(c, out = []) {
  if (!c || typeof c !== 'object') return out;
  if (typeof c.timer === 'number') out.push(c.timer);
  for (const v of Object.values(c)) if (v && typeof v === 'object') timers(v, out);
  return out;
}
let flagged = 0;
const goalAt = (c) => {
  // seconds until a marked objective exists (Infinity: none; -1: cleared and not set again)
  let at = Infinity;
  for (const e of c.ev) {
    const [k, t] = e.split('@');
    if (k === 'OBJ+M' && at === Infinity) at = Number(t);
    if (k === 'CLEAR' && at !== Infinity) at = Infinity;
  }
  return at;
};
for (const f of fs.readdirSync(path.join(root, 'content/story')).filter((f) => f.endsWith('.story.json')).sort()) {
  const s = JSON.parse(fs.readFileSync(path.join(root, 'content/story', f), 'utf8'));
  if (s.test) continue;
  let inherited = false; // the previous beat left a marked objective up
  s.beats.forEach((b, i) => {
    const enter = chain(b.enter);
    const clears = enter.ev.some((e) => e === 'CLEAR@0');
    const own = goalAt(enter);
    const has = (inherited && !clears) || own <= 5;
    const next = s.beats.find((x) => x.id === b.next) ?? s.beats[i + 1];
    const nextEnter = next ? chain(next.enter) : null;
    const nextHas = !!nextEnter && (goalAt(nextEnter) <= 5 || (!nextEnter.ev.some((e) => e === 'CLEAR@0') && (has || goalAt(enter) < Infinity)));
    const parts = [['enter', b.enter, has], ['exit', b.exit, nextHas], ...(b.on ?? []).map((o) => [`on:${o.id}`, o.do, has || own < Infinity])];
    for (const [n, l, goal] of parts) {
      const c = chain(l);
      if (c.total < 12) continue;
      const g = goalAt(c);
      if (!all && (goal || g <= 5) && !c.ev.includes('CLEAR@0')) continue;
      flagged++;
      console.log(`${s.chapter}/${b.id} ${n}: ${c.total.toFixed(0)} s of lines, goal ${goal ? 'up' : 'none'}  ${c.ev.join(' ')}`);
    }
    const tm = timers(b.complete);
    if (tm.some((t) => t >= 8)) console.log(`${s.chapter}/${b.id} completes on a timer: ${tm.join(', ')} s`);
    inherited = has || own < Infinity;
  });
}
console.log(`${flagged} long chains while no marked objective is up`);
