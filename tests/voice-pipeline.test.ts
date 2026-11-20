/** Voice pipeline (scripts/voice): pure parts only — no network, no ffmpeg. */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildPlan,
  clipFile,
  collectLines,
  creditsFor,
  emptyManifest,
  lineStatus,
  loadContent,
  prepareTtsText,
  readManifest,
  redact,
  resolveVoice,
  selectLines,
  speechFor,
  spendCap,
  textHash,
  writeManifest,
  type Manifest,
  type PriorityConfig,
  type VoiceLine,
  type VoicesConfig,
} from '../scripts/voice/lib.ts';
import priority from '../scripts/voice/priority.json';
import speechJson from '../scripts/voice/speech.json';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const line = (id: string, speaker: string, text: string, o: Partial<VoiceLine> = {}, order = 0): VoiceLine => ({
  id,
  speaker,
  text,
  chapter: 'prolog',
  beats: [],
  source: 'pack',
  file: 'prolog',
  order,
  ...o,
});

const voices: VoicesConfig = {
  defaultModel: 'eleven_flash_v2_5',
  speakers: { laub: { voiceId: 'v-laub' }, marlene: { voiceId: 'v-marlene', model: 'eleven_multilingual_v2' } },
};

describe('textHash (contract)', () => {
  it('matches the shared test vectors', () => {
    expect(textHash('Hallo')).toBe('9f02b107');
    expect(textHash('  Grüß   Gott, Herr Laub. ')).toBe('003a186c');
  });
  it('normalises NFC and whitespace before hashing', () => {
    expect(textHash('Grüß Gott')).toBe(textHash('Grüß  Gott'));
    expect(textHash('a\n\tb')).toBe(textHash('a b'));
    expect(textHash('Hallo.')).not.toBe(textHash('Hallo'));
  });
  it('file name is <lineId>.<hash>.mp3', () => {
    expect(clipFile('laub.p.quelle', '9f02b107')).toBe('laub.p.quelle.9f02b107.mp3');
  });
});

describe('prepareTtsText', () => {
  it('drops sound captions and stage directions, keeps editorial letters', () => {
    expect(prepareTtsText('[Stille]')).toBeNull();
    expect(prepareTtsText('(hustend) Von unten nach oben.')).toBe('Von unten nach oben.');
    expect(prepareTtsText('von „breite[r] Unterstützung“')).toBe('Von „breiter Unterstützung“');
  });
  it('drops the player name with its punctuation and fills year placeholders year-free', () => {
    expect(prepareTtsText('Morgen, {Name}! Brötchen.')).toBe('Morgen! Brötchen.');
    expect(prepareTtsText('{Name}? Hier Marlene.')).toBe('Hier Marlene.');
    expect(prepareTtsText('{name}? {name}! Die Suppe wird kalt!')).toBe('Die Suppe wird kalt!');
    expect(prepareTtsText('Nach {jahre:1793} Jahren.')).toBe('Nach über zweihundert Jahren.');
  });
  it('never changes the hash text: hash is over the displayed line', () => {
    const shown = 'Morgen, {Name}! Brötchen.';
    expect(textHash(shown)).not.toBe(textHash(prepareTtsText(shown)!));
  });
});

describe('credits', () => {
  it('per-model rates, rounded up', () => {
    expect(creditsFor(87, 'eleven_flash_v2_5')).toBe(44);
    expect(creditsFor(87, 'eleven_multilingual_v2')).toBe(87);
    expect(creditsFor(10, 'eleven_v3')).toBe(10);
    expect(() => creditsFor(1, 'nope')).toThrow(/unknown model/);
  });
  it('spend cap = min(budget, remaining) − reserve', () => {
    expect(spendCap({ budget: 8000, reserve: 1400 })).toBe(6600);
    expect(spendCap({ budget: 8000, reserve: 1400, remaining: 5000 })).toBe(3600);
    expect(spendCap({ budget: 1000, reserve: 1400 })).toBe(0);
  });
  it('per-speaker model wins over the run model', () => {
    expect(resolveVoice('laub', voices, 'eleven_v3')?.model).toBe('eleven_v3');
    expect(resolveVoice('marlene', voices, 'eleven_v3')?.model).toBe('eleven_multilingual_v2');
    expect(resolveVoice('laub', voices)?.model).toBe('eleven_flash_v2_5');
    expect(resolveVoice('soll', voices)).toBeNull();
  });
});

describe('selection', () => {
  const lines = [
    line('marlene.p.01b', 'marlene', 'a', { beats: ['prolog:p1'] }, 0),
    line('laub.p.intro', 'laub', 'b', { beats: ['prolog:p3'] }, 1),
    line('laub.p.quelle', 'laub', 'c', { beats: ['prolog:p3q'] }, 2),
    line('laub.p.quelle.1789', 'laub', 'd', { beats: ['prolog:p3r'] }, 3),
    line('soll.k1.01', 'soll', 'e', { chapter: 'k1', file: 'kapitel-1' }, 4),
    line('laub.bark.idle.01', 'laub', 'f', { chapter: null, file: 'voices' }, 5),
  ];
  const cfg: PriorityConfig = {
    tiers: [
      { name: 'quelle', speakers: ['laub', 'marlene'], select: [{ beats: ['prolog:p3q', 'prolog:p3r'] }] },
      { name: 'prolog', speakers: ['laub', 'marlene'], select: [{ chapter: 'prolog' }] },
      { name: 'barks', select: [{ pack: 'voices' }] },
    ],
  };
  it('orders by tier, then play order; a line appears once; unmatched lines drop out', () => {
    expect(selectLines(lines, cfg).map((s) => `${s.tier}:${s.line.id}`)).toEqual([
      'quelle:laub.p.quelle',
      'quelle:laub.p.quelle.1789',
      'prolog:marlene.p.01b',
      'prolog:laub.p.intro',
      'barks:laub.bark.idle.01',
    ]);
  });
  it('explicit ids / globs replace the tiers, in list order', () => {
    expect(selectLines(lines, cfg, { ids: ['laub.bark.*', 'laub.p.quelle*'] }).map((s) => s.line.id)).toEqual([
      'laub.bark.idle.01',
      'laub.p.quelle',
      'laub.p.quelle.1789',
    ]);
    expect(selectLines(lines, cfg, { ids: ['*'], speakers: ['marlene'] }).map((s) => s.line.id)).toEqual(['marlene.p.01b']);
  });
});

describe('real content', () => {
  const lines = collectLines(loadContent(join(ROOT, 'content')));
  const byId = new Map(lines.map((l) => [l.id, l]));
  it('maps the Karlsbergquelle beats p3q / p3r to their pack lines', () => {
    const of = (b: string) => lines.filter((l) => l.beats.includes(b)).map((l) => l.id);
    expect(of('prolog:p3q')).toEqual(['laub.p.quelle', 'laub.p.quelle.b', 'laub.p.quelle.nah', 'laub.p.quelle.trog']);
    expect(of('prolog:p3r')).toEqual(['laub.p.quelle.1789', 'laub.p.quelle.regel', 'laub.p.quelle.zurueck', 'laub.p.quelle.heute']);
  });
  it('ids are unique; inline story lines and quest lines are included; test chapters are not', () => {
    expect(byId.size).toBe(lines.length);
    expect(byId.get('marlene.p.trichter')?.source).toBe('story');
    expect(byId.get('quest.q.p.quelle.offer.0')?.speaker).toBe('laub');
    expect([...byId.keys()].some((id) => id.startsWith('test.'))).toBe(false);
  });
  it('the committed priority starts with the Quelle scene', () => {
    const sel = selectLines(lines, priority as PriorityConfig);
    expect(sel.slice(0, 8).map((s) => s.line.id)).toEqual([
      'laub.p.quelle',
      'laub.p.quelle.b',
      'laub.p.quelle.nah',
      'laub.p.quelle.trog',
      'laub.p.quelle.1789',
      'laub.p.quelle.regel',
      'laub.p.quelle.zurueck',
      'laub.p.quelle.heute',
    ]);
    expect(sel.every((s) => s.line.speaker === 'laub' || s.line.speaker === 'marlene')).toBe(true);
  });
});

describe('plan + budget', () => {
  // 100 chars each on flash = 50 credits
  const t = 'x'.repeat(100);
  const sel = ['a', 'b', 'c', 'd'].map((id, i) => ({ line: line(id, 'laub', t, {}, i), tier: 'x' }));
  it('stops before the line that would exceed budget − reserve', () => {
    const p = buildPlan(sel, { voices, manifest: emptyManifest(), cap: spendCap({ budget: 1530, reserve: 1400 }) });
    expect(p.rows.filter((r) => r.take).map((r) => r.line.id)).toEqual(['a', 'b']);
    expect(p.spend).toBe(100);
    expect(p.stoppedAt?.line.id).toBe('c');
  });
  it('stops instead of skipping ahead to a cheaper line', () => {
    const s2 = [...sel.slice(0, 2), { line: line('big', 'laub', 'y'.repeat(400), {}, 9), tier: 'x' }, { line: line('tiny', 'laub', 'z', {}, 10), tier: 'x' }];
    const p = buildPlan(s2, { voices, manifest: emptyManifest(), cap: 120 });
    expect(p.rows.filter((r) => r.take).map((r) => r.line.id)).toEqual(['a', 'b']);
  });
  it('up-to-date lines cost nothing; no-voice and caption-only lines are skipped', () => {
    const m: Manifest = emptyManifest();
    m.lines.a = { file: clipFile('a', textHash(t)), textHash: textHash(t), speaker: 'laub', voiceId: 'v-laub', model: 'eleven_flash_v2_5', date: '', chars: 100, credits: 50, durationMs: 1, speechHash: textHash(prepareTtsText(t)!) };
    const extra = [{ line: line('s', 'soll', t), tier: 'x' }, { line: line('cap', 'laub', '[Stille]'), tier: 'x' }];
    const p = buildPlan([...sel, ...extra], { voices, manifest: m, cap: 100 });
    expect(p.rows.find((r) => r.line.id === 'a')?.status).toBe('up-to-date');
    expect(p.rows.filter((r) => r.take).map((r) => r.line.id)).toEqual(['b', 'c']);
    expect(p.skipped.map((s) => `${s.line.id}:${s.reason}`)).toEqual(['s:no-voice', 'cap:nothing-to-speak']);
  });
});

describe('stale detection', () => {
  const h = textHash('Hallo');
  const e = { file: clipFile('l', h), textHash: h, speaker: 'laub', voiceId: 'v1', model: 'eleven_flash_v2_5', date: '', chars: 5, credits: 3, durationMs: 400 };
  const v = { voiceId: 'v1', model: 'eleven_flash_v2_5' };
  it('new / up to date / text, voice, model or file changed', () => {
    expect(lineStatus(undefined, h, v)).toBe('new');
    expect(lineStatus(e, h, v)).toBe('up-to-date');
    expect(lineStatus(e, textHash('Hallo!'), v)).toBe('stale-text');
    expect(lineStatus(e, h, { ...v, voiceId: 'v2' })).toBe('stale-voice');
    expect(lineStatus(e, h, { ...v, model: 'eleven_v3' })).toBe('stale-model');
    expect(lineStatus(e, h, v, () => false)).toBe('missing-file');
  });
});

describe('manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kq-voice-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  it('round-trips, writes atomically (no temp left), sorts keys', () => {
    const p = join(dir, 'sub', 'manifest.json');
    expect(readManifest(p)).toEqual(emptyManifest());
    const m = emptyManifest();
    m.lines['z.line'] = { file: 'z.line.00000000.mp3', textHash: '00000000', speaker: 'laub', voiceId: 'v', model: 'eleven_flash_v2_5', date: '2026-11-20T00:00:00.000Z', chars: 1, credits: 1, durationMs: 100 };
    m.lines['a.line'] = { ...m.lines['z.line']!, file: 'a.line.00000000.mp3' };
    writeManifest(p, m);
    const back = readManifest(p);
    expect(back).toEqual(m);
    expect(Object.keys(back.lines)).toEqual(['a.line', 'z.line']);
    expect(readdirSync(join(dir, 'sub'))).toEqual(['manifest.json']);
  });
});

describe('redact', () => {
  it('removes the secret from messages', () => {
    expect(redact('bad key sk_123 in sk_123', 'sk_123')).toBe('bad key [REDACTED] in [REDACTED]');
    expect(redact('nothing', '')).toBe('nothing');
  });
});

describe('speech overrides', () => {
  const shown = '{name}? {name}! Die Suppe wird kalt!';
  const l = line('marlene.k4.ruf', 'marlene', shown);
  const ovr = { 'marlene.k4.ruf': { forText: textHash(shown), speech: 'Hallo? Hallo! Die Suppe wird kalt!' } };

  it('a current override is spoken; the hash stays over the displayed text', () => {
    expect(speechFor(l, ovr)).toEqual({ text: 'Hallo? Hallo! Die Suppe wird kalt!', source: 'override', staleOverride: false });
    const p = buildPlan([{ line: l, tier: 'x' }], { voices, manifest: emptyManifest(), cap: 1000, speech: ovr });
    expect(p.rows[0]!.tts).toBe('Hallo? Hallo! Die Suppe wird kalt!');
    expect(p.rows[0]!.hash).toBe(textHash(shown));
    expect(p.rows[0]!.speechHash).toBe(textHash('Hallo? Hallo! Die Suppe wird kalt!'));
  });

  it('a stale override (text changed) is never spoken: auto-prep + reported', () => {
    const changed = line('marlene.k4.ruf', 'marlene', '{name}? Die Suppe ist kalt!');
    expect(speechFor(changed, ovr)).toEqual({ text: 'Die Suppe ist kalt!', source: 'auto', staleOverride: true });
    const p = buildPlan([{ line: changed, tier: 'x' }], { voices, manifest: emptyManifest(), cap: 1000, speech: ovr });
    expect(p.rows[0]!.tts).toBe('Die Suppe ist kalt!');
    expect(p.staleOverrides.map((x) => x.id)).toEqual(['marlene.k4.ruf']);
  });

  it('changing only the speech regenerates (speechHash), the clip name stays', () => {
    const first = buildPlan([{ line: l, tier: 'x' }], { voices, manifest: emptyManifest(), cap: 1000, speech: ovr }).rows[0]!;
    const m = emptyManifest();
    m.lines[l.id] = { file: clipFile(l.id, first.hash), textHash: first.hash, speaker: 'marlene', voiceId: 'v-marlene', model: 'eleven_multilingual_v2', date: '', chars: first.chars, credits: first.credits, durationMs: 1, speechHash: first.speechHash };
    const same = buildPlan([{ line: l, tier: 'x' }], { voices, manifest: m, cap: 1000, speech: ovr }).rows[0]!;
    expect(same.status).toBe('up-to-date');
    const ovr2 = { 'marlene.k4.ruf': { ...ovr['marlene.k4.ruf'], speech: 'Hallo? Hörst du mich? Die Suppe wird kalt!' } };
    const again = buildPlan([{ line: l, tier: 'x' }], { voices, manifest: m, cap: 1000, speech: ovr2 }).rows[0]!;
    expect(again.status).toBe('stale-speech');
    expect(again.take).toBe(true);
    expect(clipFile(l.id, again.hash)).toBe(m.lines[l.id]!.file);
    // dropping the override goes back to auto-prep, which is a speech change too
    expect(buildPlan([{ line: l, tier: 'x' }], { voices, manifest: m, cap: 1000 }).rows[0]!.status).toBe('stale-speech');
  });

  it('the committed speech.json is well-formed', () => {
    for (const [id, v] of Object.entries(speechJson)) {
      if (id.startsWith('$')) continue;
      const o = v as { forText: string; speech: string };
      expect(o.forText, id).toMatch(/^[0-9a-f]{8}$/);
      expect(o.speech.length, id).toBeGreaterThan(0);
      expect(o.speech, id).not.toMatch(/\{/);
    }
  });
});
