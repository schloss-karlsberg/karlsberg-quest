/**
 * `pnpm sim:combat` — the headless human-like bot (tests/combat-human.ts) fights every enemy family
 * and every boss ~50× at the build the story expects there, through the game's real combat
 * simulation, and prints the balance table (docs/BALANCE.md).
 *
 *   pnpm sim:combat                 # 50 runs each, print markdown
 *   pnpm sim:combat --runs 20       # fewer runs
 *   pnpm sim:combat --write         # also replace the generated block in docs/BALANCE.md
 *   pnpm sim:combat --only irrlicht # rows whose label contains the text
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentEncounters, type ContentEncounter } from '../tests/combat-encounters';
import { buildOf } from '../tests/combat-encounters';
import { humanFight, type HumanResult } from '../tests/combat-human';
import type { AttackStat, HitStat } from '../src/systems/combat/fightlog';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const val = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(val('--runs') ?? 50);
const ONLY = val('--only');

interface Row {
  label: string;
  family: string;
  chapter: string;
  enc: ContentEncounter;
  balsam: number;
  hint?: 'title' | 'bounce' | 'never';
  /** Profile overrides (e.g. no habit flare). */
  profile?: Partial<import('../tests/combat-human').HumanProfile>;
}

const all = contentEncounters();
const byId = (id: string) => {
  const c = all.find((x) => x.id === id);
  if (!c) throw new Error(`no content encounter ${id}`);
  return c;
};
/** An escort-only kind fought on its own (two of them: not a pack, no elite). */
const drill = (kind: string, chapter: string, era: string, tier: number): ContentEncounter => ({ id: `drill.${kind}`, chapter, build: buildOf(chapter), boss: false, first: false, enc: { kind, count: 2, tier, era } });

const ROWS: Row[] = [
  { label: 'Nebelling — prolog Bussole (4 + wave 2)', family: 'nebelling', chapter: 'prolog', enc: byId('q.p.bussole.nebel'), balsam: 1 },
  { label: 'Irrlicht — "Lichter am Weiher" (3, lake)', family: 'irrlicht', chapter: 'prolog', enc: byId('q.p.irrlichter.lichter'), balsam: 1 },
  { label: 'Irrlicht — "Lichter am Weiher", no habit flare', family: 'irrlicht', chapter: 'prolog', enc: byId('q.p.irrlichter.lichter'), balsam: 1, profile: { habitFlare: false } },
  { label: 'Irrlicht — K1 Karlslust (5)', family: 'irrlicht', chapter: 'k1', enc: byId('q.k1.karlslust.lichter'), balsam: 2 },
  { label: 'Irrlicht — K2 Lichter 3 (2 + Nebelweber + wave)', family: 'irrlicht', chapter: 'k2', enc: byId('q.k2.lichter.licht3'), balsam: 2 },
  { label: 'Streuner — K1 Zwinger (4 + wave)', family: 'streuner', chapter: 'k1', enc: byId('q.k1.zwinger.streuner'), balsam: 2 },
  { label: 'Mahnbrief — K1 Registratur (6 + Foliant + wave)', family: 'mahnbrief', chapter: 'k1', enc: byId('q.k1.registratur.briefe'), balsam: 2 },
  { label: 'Nebelweber — drill (2, K1)', family: 'nebelweber', chapter: 'k1', enc: drill('nebelweber', 'k1', '1789', 1), balsam: 2 },
  { label: 'Foliant — drill (2, K1)', family: 'foliant', chapter: 'k1', enc: drill('foliant', 'k1', '1789', 1), balsam: 2 },
  { label: 'Rufer — drill (2, K2)', family: 'rufer', chapter: 'k2', enc: drill('rufer', 'k2', '1793-02', 2), balsam: 2 },
  { label: 'Raffschatten — K3 Nachmittag (4 + wave)', family: 'raffschatten', chapter: 'k3', enc: byId('q.k3.nachmittag.schatten'), balsam: 2 },
  { label: 'Glutling — K3 Festsaal (4)', family: 'glutling', chapter: 'k3', enc: byId('q.k3.festsaal.glut'), balsam: 2 },
  { label: 'Scherbling — drill (2, K3)', family: 'scherbling', chapter: 'k3', enc: drill('scherbling', 'k3', '1793-07', 3), balsam: 2 },
  { label: 'Grusling — K4 Zeichen (8)', family: 'grusling', chapter: 'k4', enc: byId('q.k4.zeichen.krumen'), balsam: 2 },
  { label: 'Steinfresser — K4 Karren (3 + wave)', family: 'steinfresser', chapter: 'k4', enc: byId('q.k4.karren.fresser'), balsam: 2 },
  { label: 'BOSS Schuldbuch (K1)', family: 'schuldbuch', chapter: 'k1', enc: byId('q.k1.lohn.buch'), balsam: 3 },
  { label: 'BOSS Schuldbuch (K1), title hint missed', family: 'schuldbuch', chapter: 'k1', enc: byId('q.k1.lohn.buch'), balsam: 3, hint: 'bounce' },
  { label: 'BOSS Schuldbuch (K1), never learns', family: 'schuldbuch', chapter: 'k1', enc: byId('q.k1.lohn.buch'), balsam: 3, hint: 'never' },
  { label: 'BOSS Pikeur (K2)', family: 'pikeur', chapter: 'k2', enc: byId('k2:k2_11.k2.pikeur'), balsam: 3 },
  { label: 'BOSS Pikeur (K2), title hint missed', family: 'pikeur', chapter: 'k2', enc: byId('k2:k2_11.k2.pikeur'), balsam: 3, hint: 'bounce' },
  { label: 'BOSS Strohmann (K3)', family: 'strohmann', chapter: 'k3', enc: byId('q.k3.strohmann.strohmann'), balsam: 3 },
  { label: 'BOSS Strohmann (K3), title hint missed', family: 'strohmann', chapter: 'k3', enc: byId('q.k3.strohmann.strohmann'), balsam: 3, hint: 'bounce' },
  { label: 'BOSS Strohmann (K3), never learns', family: 'strohmann', chapter: 'k3', enc: byId('q.k3.strohmann.strohmann'), balsam: 3, hint: 'never' },
  { label: 'BOSS Steinbrecher (K4)', family: 'steinbrecher', chapter: 'k4', enc: byId('q.k4.steinplatz.brecher'), balsam: 3 },
  { label: 'BOSS Steinbrecher (K4), title hint missed', family: 'steinbrecher', chapter: 'k4', enc: byId('q.k4.steinplatz.brecher'), balsam: 3, hint: 'bounce' },
  { label: 'BOSS Steinbrecher (K4), never learns', family: 'steinbrecher', chapter: 'k4', enc: byId('q.k4.steinplatz.brecher'), balsam: 3, hint: 'never' },
];

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const f0 = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : '–');
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)} %` : '–');

interface Agg {
  row: Row;
  runs: HumanResult[];
}

const t0 = Date.now();
const out: Agg[] = [];
const windups: Record<string, AttackStat> = {};
const hits: Record<string, HitStat> = {};
for (const row of ROWS) {
  if (ONLY && !row.label.toLowerCase().includes(ONLY.toLowerCase())) continue;
  const runs: HumanResult[] = [];
  for (let i = 0; i < RUNS; i++) {
    const r = humanFight(row.enc.build, row.enc.enc, i + 1, { profile: { balsam: row.balsam, ...row.profile }, hint: row.hint });
    runs.push(r);
    if (row.hint || row.profile) continue;
    for (const f of r.fights) {
      for (const [k, w] of Object.entries(f.windups)) {
        const o = (windups[k] ??= { n: 0, min: Infinity, mean: 0, belowReaction: 0, offscreenStart: 0 });
        o.mean = (o.mean * o.n + w.mean * w.n) / (o.n + w.n);
        o.n += w.n;
        o.min = Math.min(o.min, w.min);
        o.belowReaction += w.belowReaction;
        o.offscreenStart += w.offscreenStart;
      }
      for (const [k, h] of Object.entries(f.hitsBy)) {
        const o = (hits[k] ??= { hits: 0, damage: 0, unfair: 0, seen: 0 });
        o.seen = (o.seen * o.hits + h.seen * h.hits) / (o.hits + h.hits);
        o.hits += h.hits;
        o.damage += h.damage;
        o.unfair += h.unfair;
      }
    }
  }
  out.push({ row, runs });
  process.stderr.write(`${row.label}: ${runs.filter((r) => r.won).length}/${RUNS} won\n`);
}

const lines: string[] = [];
lines.push(`Generated by \`pnpm sim:combat\` — ${RUNS} runs per row, human bot (250 ms ± 60 ms reaction, 15 % misread, σ 12° aim), the game's own \`CombatSim\`. HP left is % of max over all runs (a loss counts 0).`);
lines.push('');
lines.push('| Encounter | Lvl | Win | HP left mean / median | Time to kill (s, wins) mean / median | Hits taken / fight | Unfair hits / fight | Dodge success | Balsam used | Top damage (share) |');
lines.push('|---|---|---|---|---|---|---|---|---|---|');
for (const { row, runs } of out) {
  const hp = runs.map((r) => (r.dead ? 0 : r.hp / r.max));
  const ttk = runs.filter((r) => r.won).map((r) => r.timeToKill!);
  const hitsF = mean(runs.map((r) => r.hitsTaken));
  const unfair = mean(runs.map((r) => r.unfair));
  const dod = runs.reduce((a, r) => a + r.dodges, 0);
  const ok = runs.reduce((a, r) => a + r.dodgesOk, 0);
  const hurt: Record<string, number> = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.hurtBy)) hurt[k] = (hurt[k] ?? 0) + v;
  const tot = Object.values(hurt).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(hurt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, v]) => `${k} ${Math.round((v / tot) * 100)} %`)
    .join(', ');
  lines.push(`| ${row.label} | ${row.enc.build.level} | ${pct(runs.filter((r) => r.won).length / runs.length)} | ${pct(mean(hp))} / ${pct(median(hp))} | ${f0(mean(ttk))} / ${f0(median(ttk))} | ${f1(hitsF)} | ${f1(unfair)} | ${dod ? pct(ok / dod) : '–'} (${f1(dod / runs.length)}/fight) | ${f1(mean(runs.map((r) => r.balsamUsed)))} | ${top || '–'} |`);
}
lines.push('');
lines.push('**Bosses**: how the way in was found and what the armour or seal threw back (per fight, mean).');
lines.push('');
lines.push('| Boss | Learnt the way in | Learnt after (s) | Blows bounced ("Abgeprallt") | Blows into the reveal / phase roar ("Der Stab geht hindurch – erst das Bannlicht") |');
lines.push('|---|---|---|---|---|');
for (const { row, runs } of out) {
  if (!row.enc.boss) continue;
  const learnt = runs.filter((r) => r.learnt !== null);
  lines.push(`| ${row.label} | ${pct(learnt.length / runs.length)} | ${f0(mean(learnt.map((r) => r.learnt!)))} | ${f1(mean(runs.map((r) => r.bounced)))} | ${f1(mean(runs.map((r) => r.bossImmune)))} |`);
}
lines.push('');
lines.push('**Attacks** (the default rows only): wind-up (s) against the 0.25 s reaction time, how often it began off screen, the hits it landed, how many of them were unfair and how long the attack was on screen before it hit (mean). *Margin* = wind-up − 0.25 s reaction − 0.08 s until the roll’s i-frames start: the time a human has left to decide.');
lines.push('');
lines.push('| Attack | Wind-up min / mean | Margin (s) | Wind-ups | Began off screen | Hits | Unfair | Seen before hit (s) |');
lines.push('|---|---|---|---|---|---|---|---|');
const keys = [...new Set([...Object.keys(windups), ...Object.keys(hits)])].sort();
for (const k of keys) {
  const w = windups[k];
  const h = hits[k];
  lines.push(`| ${k} | ${w ? `${w.min.toFixed(2)} / ${w.mean.toFixed(2)}` : '–'} | ${w ? (w.min - 0.25 - 0.08).toFixed(2) : '–'} | ${w?.n ?? 0} | ${w ? pct(w.offscreenStart / w.n) : '–'} | ${h?.hits ?? 0} | ${h ? `${h.unfair} (${pct(h.unfair / h.hits)})` : '–'} | ${h ? h.seen.toFixed(2) : '–'} |`);
}
const md = lines.join('\n');
console.log(md);
process.stderr.write(`\n${out.length} rows × ${RUNS} runs in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

if (flag('--write')) {
  const file = join(ROOT, 'docs/BALANCE.md');
  const begin = '<!-- sim:combat:begin -->';
  const end = '<!-- sim:combat:end -->';
  const doc = readFileSync(file, 'utf8');
  const a = doc.indexOf(begin);
  const b = doc.indexOf(end);
  if (a < 0 || b < a) throw new Error('docs/BALANCE.md has no sim:combat markers');
  writeFileSync(file, `${doc.slice(0, a + begin.length)}\n${md}\n${doc.slice(b)}`);
  process.stderr.write('docs/BALANCE.md updated\n');
}
