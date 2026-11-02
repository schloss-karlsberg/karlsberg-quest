import { readFileSync, readdirSync } from 'node:fs';
import { ROOT } from './common.mjs';
const dir = `${ROOT}/content/packs`;
const packs = readdirSync(dir).map((f) => [f, JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))]);
const events = new Map();
const reqFlags = new Set();
const revFlags = new Set();
const trigFlags = new Set();
const counts = {};
for (const [f, p] of packs) {
  const c = (counts[f] = {});
  for (const k of ['facts', 'nouns', 'clues', 'cases', 'speakers', 'dialogue', 'hints']) if (p[k]) c[k] = p[k].length;
  if (p.cases) c.entries = p.cases.reduce((a, cs) => a + cs.entries.length, 0);
  for (const d of p.dialogue ?? []) {
    events.set(d.trigger.event, (events.get(d.trigger.event) ?? 0) + 1);
    if (d.trigger.flag) trigFlags.add(d.trigger.flag);
  }
  for (const cl of p.clues ?? []) {
    for (const fl of cl.requires?.flags ?? []) reqFlags.add(fl);
    for (const fl of cl.reveals?.flags ?? []) revFlags.add(fl);
  }
}
console.log(counts);
console.log([...events]);
console.log('req', [...reqFlags], '\nrevealed', [...revFlags], '\ntrigger', [...trigFlags]);
