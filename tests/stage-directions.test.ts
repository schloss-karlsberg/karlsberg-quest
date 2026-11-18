/**
 * Shown, not told (playtest round 5, rule (a)): no stage direction is written into what someone
 * says. Pack dialogue, quest lines and story lines: a bracketed sound caption only for the
 * `geraeusch` speaker and at most 30 characters; no „(Pause.)“ / „(sehr leise)“ / „(Er …)“ inside a
 * spoken line (a pause is a „…“ the presenter breathes at).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stageDirection } from '../src/systems/story/validate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as unknown;

function lines(): { where: string; speaker: string; text: string }[] {
  const out: { where: string; speaker: string; text: string }[] = [];
  for (const f of readdirSync(join(ROOT, 'content/packs'))) {
    const p = json(`content/packs/${f}`) as { dialogue?: { id: string; speaker: string; text_de: string }[] };
    for (const d of p.dialogue ?? []) out.push({ where: `${f}:${d.id}`, speaker: d.speaker, text: d.text_de });
  }
  const walk = (x: unknown, where: string): void => {
    if (Array.isArray(x)) x.forEach((v) => walk(v, where));
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o.speaker === 'string' && typeof o.text === 'string') out.push({ where: `${where}:${String(o.id ?? '')}`, speaker: o.speaker, text: o.text });
      for (const v of Object.values(o)) walk(v, where);
    }
  };
  for (const dir of ['content/quests', 'content/story'])
    for (const f of readdirSync(join(ROOT, dir)).filter((x) => /^0\d-/.test(x))) walk(json(`${dir}/${f}`), f);
  return out;
}

describe('stage directions are events, not text', () => {
  it('no spoken line carries a stage direction; sound captions stay short', () => {
    const all = lines();
    expect(all.length).toBeGreaterThan(400);
    const bad = all.map((l) => ({ ...l, why: stageDirection(l.text, l.speaker) })).filter((l) => l.why).map((l) => `${l.where} (${l.speaker}): ${l.why} — ${l.text}`);
    expect(bad).toEqual([]);
  });

  it('the checker catches what the testers saw', () => {
    expect(stageDirection('[Brecheisen auf Sandstein, dann Stille]')).not.toBeNull();
    expect(stageDirection('Das ist privat. (Pause.) Jemand muss ja …', 'soll')).not.toBeNull();
    expect(stageDirection('(sehr leise) Dann leg ich mich auch hin.', 'laub')).not.toBeNull();
    expect(stageDirection('[Das Licht erlischt. Schnee fällt rückwärts nach oben. Der Sommer kehrt zurück.]', 'geraeusch')).not.toBeNull();
    expect(stageDirection('[Kanonendonner, Raketen]', 'geraeusch')).toBeNull();
    expect(stageDirection('Das ist privat. … Jemand muss ja aufschreiben.', 'soll')).toBeNull();
  });
});
