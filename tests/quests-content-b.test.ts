/**
 * contentB: Kapitel 3, Kapitel 4 and the endings as quest chains (docs/ACTION-RPG.md §11.3–11.5).
 * Static checks over content/quests/03–04 and content/story/03–05, plus a headless run of every
 * quest through the QuestBook (each objective satisfied by the event the game would send) and the
 * XP curve that results (§6.1: Ch. 3 L9–10, Ch. 4 L11–12 with side quests, main only ≈ L10–11).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enemyDef } from '../src/rpg/enemies';
import { ITEMS } from '../src/rpg/items';
import { levelForXp } from '../src/rpg/stats';
import type { FlagValue, QuestDef, QuestFile } from '../src/rpg/types';
import { questsInPlay } from '../src/systems/quests/data';
import { QuestBook, type QuestDefIn, createQuestSlice, need, seededRng } from '../src/systems/quests/logic';
import type { StoryFile } from '../src/systems/story/types';

const ROOT = new URL('..', import.meta.url);
const json = <T>(p: string) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8')) as T;
const Q3 = json<QuestFile>('content/quests/03-kapitel-3.quests.json');
const Q4 = json<QuestFile>('content/quests/04-kapitel-4.quests.json');
const S3 = json<StoryFile>('content/story/03-kapitel-3.story.json');
const S4 = json<StoryFile>('content/story/04-kapitel-4.story.json');
const S5 = json<StoryFile & { epilogue: { readings: { id: string; deeds?: { flag: string; eq?: string; text: string }[]; text: Record<string, string> }[] } }>('content/story/05-enden.story.json');
const ENDEN_PACK = json<{ dialogue: { id: string; text_de: string; trigger: { flag?: string; value?: string; block?: string } }[] }>('content/packs/enden.pack.json');
const RAW3 = readFileSync(new URL('content/story/03-kapitel-3.story.json', ROOT), 'utf8');
const RAW4 = readFileSync(new URL('content/story/04-kapitel-4.story.json', ROOT), 'utf8');
const RAW5 = readFileSync(new URL('content/story/05-enden.story.json', ROOT), 'utf8');

type Any = Record<string, unknown>;
/** Every object nested anywhere in v. */
function walk(v: unknown, out: Any[] = []): Any[] {
  if (Array.isArray(v)) for (const x of v) walk(x, out);
  else if (v && typeof v === 'object') {
    out.push(v as Any);
    for (const x of Object.values(v)) walk(x, out);
  }
  return out;
}
const actions = (s: StoryFile) => walk(s).filter((o) => typeof o.do === 'string');
const mains = (f: QuestFile) => f.quests.filter((q) => q.kind === 'main');
const sides = (f: QuestFile) => f.quests.filter((q) => q.kind === 'side');

describe('contentB: the shape of the chapters', () => {
  it('K3 and K4: at least five main quests and two to four side quests each', () => {
    for (const f of [Q3, Q4]) {
      expect(mains(f).length).toBeGreaterThanOrEqual(5);
      expect(sides(f).length).toBeGreaterThanOrEqual(2);
      expect(sides(f).length).toBeLessThanOrEqual(4);
    }
    expect(mains(Q3).map((q) => q.id)).toEqual(['q.k3.nachmittag', 'q.k3.buch', 'q.k3.strohmann', 'q.k3.festsaal', 'q.k3.hunde']);
    expect(mains(Q4).map((q) => q.id)).toEqual(['q.k4.zettel', 'q.k4.karren', 'q.k4.baumagazin', 'q.k4.steinplatz', 'q.k4.standpunkt', 'q.k4.stellen']);
  });

  it('every main quest is offered or started by a beat and a beat waits for it', () => {
    for (const [f, s] of [
      [Q3, S3],
      [Q4, S4],
    ] as const) {
      const acts = actions(s).filter((a) => a.do === 'quest');
      for (const q of mains(f)) {
        expect(
          acts.some((a) => a.id === q.id && (a.op === 'offer' || a.op === 'start') && a.onResume === true),
          `${q.id} offered`,
        ).toBe(true);
        const waits = s.beats.some((b) => walk(b.complete).some((c) => (c.quest as Any | undefined)?.id === q.id));
        expect(waits, `${q.id} awaited`).toBe(true);
      }
    }
  });

  it('no Chronik gates left: no confirmed / caseComplete / reading conditions, no chronik action', () => {
    for (const raw of [RAW3, RAW4, RAW5]) {
      expect(raw).not.toMatch(/"(confirmed|caseComplete|reading)"\s*:/);
      expect(raw).not.toMatch(/"do":\s*"chronik"/);
    }
    // the last beat keeps the readings action (old saves: unanswered Chronik readings become "offen")
    const luecken = S4.beats.find((b) => b.id === 'k4_15')!;
    expect(walk(luecken).some((a) => a.do === 'readings' && a.fill === 'offen')).toBe(true);
  });

  it('every quest has a giver with a reason, lines, verb objectives and history with codex facts', () => {
    const allowed = new Set(['hanne', 'soll', 'jost', 'peter', 'gaertner', 'mann', 'pikeur', 'laub', 'marlene']);
    for (const q of [...Q3.quests, ...Q4.quests]) {
      const g = 'npc' in q.giver ? q.giver.npc : q.giver.voice;
      expect(allowed.has(g), `${q.id} giver ${g}`).toBe(true);
      expect(q.offer.length, q.id).toBeGreaterThan(0);
      expect(q.objectives.length, q.id).toBeGreaterThan(0);
      for (const o of q.objectives) expect(o.text_de.length, `${q.id}.${o.id}`).toBeGreaterThan(4);
      if (q.id !== 'q.k4.zettel') {
        expect(q.history?.length ?? 0, q.id).toBeGreaterThan(0);
        for (const h of q.history ?? []) expect(h.fact || h.sources?.length, `${q.id} history`).toBeTruthy();
      }
    }
  });

  it('teaches every codex card of §11.3–11.4', () => {
    const want = ['cx.06', 'cx.12', 'cx.20', 'cx.21', 'cx.22', 'cx.23', 'cx.24', 'cx.25', 'cx.26', 'cx.27', 'cx.28', 'cx.29', 'cx.30', 'cx.31', 'cx.32', 'cx.33', 'cx.39', 'rm.05'];
    const taught = new Set<string>();
    for (const q of [...Q3.quests, ...Q4.quests]) {
      for (const h of q.history ?? []) if (h.fact) taught.add(h.fact);
      for (const c of q.rewards?.codex ?? []) taught.add(c);
    }
    for (const id of want) expect(taught.has(id), id).toBe(true);
  });

  it('the rewards of §11: Messstab IV / V, the Festsaal charms, Matthes’ Zeichen, Baumeister, Röntgenblick, the horn', () => {
    const r = (id: string) => [...Q3.quests, ...Q4.quests].find((q) => q.id === id)!.rewards!;
    expect(r('q.k3.hunde').items).toContainEqual({ item: 'item.stab.bann' });
    expect(r('q.k3.hunde').skills).toContainEqual({ id: 'roentgen', tier: 1 });
    expect(r('q.k3.buch').skills).toEqual([
      { id: 'baumeister', tier: 1 },
      { id: 'baumeister', tier: 2 },
    ]);
    expect(r('q.k4.steinplatz').items).toContainEqual({ item: 'item.stab.lot' });
    expect(r('q.k4.zeichen').items).toContainEqual({ item: 'item.charm.winkel' });
    expect(r('q.k4.stellen').items).toContainEqual({ item: 'item.horn' });
    // the Festsaal choice (four things in the room, `festsaal.took`) hands over the charm (nichts: nothing)
    const k34 = S3.beats.find((b) => b.id === 'k3_4')!;
    const took = (k34.on ?? []).filter((r) => (r.when as unknown as Any)?.flag === 'festsaal.took');
    expect(took.map((r) => (r.when as unknown as Any).eq).sort()).toEqual(['dukat', 'nichts', 'tuergriff', 'uhr']);
    for (const r of took) {
      const key = (r.when as unknown as Any).eq as string;
      const items = (r.do as unknown as Any[]).filter((a) => a.do === 'item').map((a) => a.item);
      expect(items).toEqual(key === 'nichts' ? [] : [`item.charm.${key}`]);
      expect((r.do as unknown as Any[]).find((a) => a.do === "flag")!.set).toMatchObject({ 'flag.k3_objekt': key, 'choice.k3.objekt': key });
      if (key !== 'nichts') expect(ITEMS.some((i) => i.id === `item.charm.${key}`)).toBe(true);
    }
    expect(k34.complete).toEqual({ flag: 'festsaal.took' });
    // chapter pages and stone marks belong to the collections
    const items = [...Q3.items!, ...Q4.items!];
    expect(items.filter((i) => i.set === 'chronikseiten').map((i) => i.id)).toEqual(['item.k3.seite', 'item.k4.seite']);
    expect(items.filter((i) => i.set === 'steinzeichen').length).toBe(3);
  });

  it('deeds, not stances: K3/K4 side quests and the Festsaal object are told by the epilogue (story fallback and pack, same words)', () => {
    for (const q of [...Q3.quests, ...Q4.quests]) expect((q as { stance?: unknown }).stance, q.id).toBeUndefined();
    const sides = [...Q3.quests, ...Q4.quests].filter((q) => q.kind === 'side').map((q) => `quest.${q.id}`);
    const deeds = S5.epilogue.readings.flatMap((r) => r.deeds ?? []);
    for (const f of sides) expect(deeds.some((d) => d.flag === f && d.eq === 'done'), f).toBe(true);
    // the pack tells the same sentences as the fallback (one source: scripts/content-build/epilogue-deeds.mjs)
    for (const d of deeds) expect(ENDEN_PACK.dialogue.some((l) => l.trigger.flag === d.flag && l.text_de === d.text), d.flag).toBe(true);
    // every slot has an "offen" (nothing done) entry, and no sentence is a raw flag value
    for (const r of S5.epilogue.readings) {
      expect(typeof r.text.offen, r.id).toBe('string');
      for (const d of r.deeds ?? []) expect(d.text).not.toMatch(/flag\.|quest\.|_/);
    }
    // the epilogue no longer reads stance flags, and the old placeholders are gone
    expect(RAW5).not.toMatch(/flag\.k1_lohn|flag\.k3_pluenderer|Fortgesetzt im November|Jost war auch da/);
    expect(JSON.stringify(ENDEN_PACK)).not.toMatch(/Fortgesetzt im November|Jost war auch da|"Wird fortgesetzt\."/);
  });

  it('no enemies in the Festsaal, the finale or the endings; combat is off from the finale on', () => {
    // no enemy action in the Festsaal / finale / ending beats
    for (const id of ['k3_3', 'k3_4']) expect(walk(S3.beats.find((b) => b.id === id)).some((a) => a.do === 'enemy')).toBe(false);
    for (const id of ['k4_11', 'k4_12', 'k4_13', 'k4_14', 'k4_15']) expect(walk(S4.beats.find((b) => b.id === id)).some((a) => a.do === 'enemy')).toBe(false);
    expect(actions(S5).some((a) => a.do === 'enemy')).toBe(false);
    // no quest spawn inside the Festsaal (B01.2.og-festsaal 1260.2–1271.3 / −1131.5–−1122.2) or at the Zwinger today
    for (const q of [...Q3.quests, ...Q4.quests])
      for (const o of q.objectives)
        for (const sp of o.spawn ?? []) {
          const r = sp.radius ?? 0;
          const inSaal = sp.x + r > 1260.2 && sp.x - r < 1271.3 && sp.z + r > -1131.5 && sp.z - r < -1122.2;
          expect(inSaal, `${q.id}.${o.id}`).toBe(false);
          expect(sp.era === 'today' && Math.hypot(sp.x - 1216, sp.z + 1571) < 120, `${q.id}.${o.id}`).toBe(false);
        }
    // the finale quest has no kill objective
    expect(Q4.quests.find((q) => q.id === 'q.k4.stellen')!.objectives.some((o) => o.type === 'kill')).toBe(false);
    // combat.disabled: set on entering k4_11 (finale) and every beat after it, and in the endings
    const sets = (b: { enter?: unknown }) => walk(b.enter).some((a) => a.do === 'flag' && (a.set as Any)['combat.disabled'] === true);
    const i11 = S4.beats.findIndex((b) => b.id === 'k4_11');
    for (const b of S4.beats.slice(i11, i11 + 4)) expect(sets(b), b.id).toBe(true);
    for (const b of S5.beats) expect(sets(b), b.id).toBe(true);
    // never switched back on before the credits
    const offs = [...actions(S4), ...actions(S5)].filter((a) => a.do === 'flag' && (a.set as Any)['combat.disabled'] === false);
    expect(offs).toHaveLength(1);
    expect(S5.beats.find((b) => b.id === 'e2')!.exit).toContainEqual({ do: 'flag', set: { 'combat.disabled': false } });
  });

  it('the Strohmann rises in the Ehrenhof of July 1793 before the torch; Glutlinge on the stairs; the Steinbrecher in 1796', () => {
    const q = (id: string) => [...Q3.quests, ...Q4.quests].find((x) => x.id === id)!;
    const stroh = q('q.k3.strohmann');
    const boss = stroh.objectives.find((o) => o.id === 'strohmann')!;
    expect(boss.spawn![0]).toMatchObject({ kind: 'strohmann', era: '1793-07', boss: true });
    expect(Math.hypot(boss.spawn![0]!.x - 1210, boss.spawn![0]!.z + 1114)).toBeLessThan(15);
    expect(stroh.objectives.find((o) => o.id === 'fackel')!.after).toEqual(['strohmann']);
    const glut = q('q.k3.festsaal').objectives.find((o) => o.id === 'glut')!;
    expect(glut.spawn![0]!.kind).toBe('glutling');
    const brecher = q('q.k4.steinplatz').objectives.find((o) => o.id === 'brecher')!;
    expect(brecher.spawn![0]).toMatchObject({ kind: 'steinbrecher', era: '1796', boss: true });
    // the Steinfraß (W7) wakes when it falls
    const b6 = S4.beats.find((b) => b.id === 'k4_6')!;
    expect(b6.complete).toEqual({ quest: { id: 'q.k4.steinplatz', objective: 'brecher', gte: 1 } });
    expect(b6.exit).toContainEqual({ do: 'flag', set: { 'k4.frass': true } });
    // the jaguar is calmed, never fought
    expect(q('q.k3.jaguar').objectives.map((o) => o.type)).toEqual(['calm']);
  });
});

// ---- headless run ----------------------------------------------------------------------------

function play(files: QuestFile[], ids: string[]) {
  const { quests } = questsInPlay(
    files.map((data) => ({ data })),
    false,
  );
  const flags: Record<string, FlagValue> = {};
  const codex: string[] = [];
  let xp = 0;
  const book = new QuestBook(quests as Map<string, QuestDefIn>, createQuestSlice(), {
    flags,
    codex,
    emit: (n, p) => {
      if (n === 'xp:grant') xp += (p as { amount: number }).amount;
      if (n === 'codex:unlocked') xp += 10;
    },
    now: () => 0,
    rng: seededRng(3),
  });
  for (const id of ids) {
    const q = quests.get(id)! as QuestDef;
    expect(book.offer(id) || book.state(id) === 'active', id).toBe(true);
    if (book.state(id) === 'offered') expect(book.accept(id)).toBe(true);
    // satisfy the objectives in order (after-chains open as we go)
    for (let pass = 0; pass < q.objectives.length + 1; pass++)
      for (const o of book.openObjectives(q)) {
        const n = need(o);
        for (let i = 0; i < n; i++) {
          const before = book.count(id, o.id);
          switch (o.type) {
            case 'kill': {
              const sp = o.spawn?.[0];
              const kind = sp?.kind ?? o.enemy!;
              const d = enemyDef(kind)!;
              xp += d.xp;
              book.handle('enemy:killed', { id: `${id}.${o.id}.${i}`, kind, quest: id, objective: o.id, x: sp?.x ?? 0, z: sp?.z ?? 0, era: sp?.era ?? q.era, boss: !!sp?.boss, by: 'light' });
              break;
            }
            case 'collect':
              book.handle('item:pickup', { item: o.item, count: 1, total: i + 1 });
              break;
            case 'examine':
              book.handle('clue:found', { id: o.clue, kind: 'story' });
              break;
            case 'echo':
              book.handle('echo:end', { id: o.clue });
              break;
            case 'room':
              book.handle('room:enter', { roomId: o.room, id: `KB-B01/${o.room}` });
              break;
            case 'calm':
              book.handle('menagerie:calmed', { animal: o.animal, id: 'k3.jaguar' });
              break;
            case 'talk':
              book.handle('npc:talk', { npc: o.npc, topic: 'greet' });
              break;
            case 'event':
              book.handle(o.event!, { ...(o.match ?? {}) });
              break;
            case 'reach':
              book.tick(0.1, { x: o.where!.x, z: o.where!.z, era: o.where!.era ?? q.era ?? 'today' });
              break;
            case 'escort':
              book.tick(0.1, { x: o.to!.x, z: o.to!.z, era: o.to!.era ?? q.era ?? 'today' }, () => 1);
              break;
            default:
              book.progress(id, o.id, 1, true);
          }
          expect(book.count(id, o.id), `${id}.${o.id} (${o.type})`).toBeGreaterThan(before);
        }
      }
    // 'auto' turn-ins pay out at once; the others wait at their npc
    expect(book.state(id), id).toBe(q.turnin === 'auto' ? 'done' : 'ready');
    if (q.turnin !== 'auto') expect(book.complete(id)).not.toBeNull();
    expect(flags[`quest.${id}`]).toBe('done');
  }
  return { xp, flags, codex };
}

describe('contentB: every quest plays through headless; the level curve', () => {
  const ids = (f: QuestFile, kind?: 'main' | 'side') => f.quests.filter((q) => !kind || q.kind === kind).map((q) => q.id);
  const START = 3600; // end of Ch. 2: L8 (§6.1 target L7–8)

  it('K3 and K4 main + side quests reach ready and pay out; the deeds are the quest flags', () => {
    const r = play([Q3, Q4], [...ids(Q3), ...ids(Q4)]);
    expect(r.flags['quest.q.k3.lehnstuhl']).toBe('done');
    expect(r.flags['quest.q.k4.zeichen']).toBe('done');
    expect(r.flags['flag.k3_pluenderer']).toBeUndefined();
    expect(r.xp).toBeGreaterThan(0);
  });

  it('XP: Ch. 3 ends at L9–10, Ch. 4 at L10–11 main only and L11–12 with side quests', () => {
    const k3main = play([Q3], ids(Q3, 'main')).xp;
    const k3all = play([Q3], ids(Q3)).xp;
    const k4main = play([Q4], ids(Q4, 'main')).xp;
    const k4all = play([Q4], ids(Q4)).xp;
    for (const xp of [k3main, k3all]) {
      expect(levelForXp(START + xp)).toBeGreaterThanOrEqual(9);
      expect(levelForXp(START + xp)).toBeLessThanOrEqual(10);
    }
    const mainOnly = levelForXp(START + k3main + k4main);
    expect(mainOnly).toBeGreaterThanOrEqual(10);
    expect(mainOnly).toBeLessThanOrEqual(11);
    expect(levelForXp(START + k3all + k4all)).toBeGreaterThanOrEqual(11);
  });
});
