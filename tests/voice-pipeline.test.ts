/** Voice pipeline (scripts/voice): pure parts only — no network, no ffmpeg. */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPlan,
  contentFile,
  collectLines,
  creditsFor,
  emptyManifest,
  entryFiles,
  estimateMB,
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
  type ManifestEntry,
  type PriorityConfig,
  type VoiceLine,
  type VoicesConfig,
} from '../scripts/voice/lib.ts';
import { audioUrl, elevenLabsProvider, fillParams, hfSpaceProvider, isHfHost, type GradioConnect } from '../scripts/voice/providers.ts';
import priority from '../scripts/voice/priority.json';
import speechJson from '../scripts/voice/speech.json';
import voicesJson from '../scripts/voice/voices.json';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const line = (id: string, speaker: string, text: string, o: Partial<VoiceLine> = {}, order = 0): VoiceLine => ({
  id,
  speaker,
  text,
  chapter: 'tour',
  beats: [],
  source: 'pack',
  file: 'tour',
  order,
  ...o,
});

/** a manifest entry with both clip files */
const entry = (o: Partial<ManifestEntry> = {}): ManifestEntry => ({
  files: { opus: 'x.00000000.webm', aac: 'x.00000000.m4a' },
  textHash: '00000000',
  speechHash: '00000000',
  speaker: 'laub',
  provider: 'elevenlabs',
  voiceId: 'v-laub',
  model: 'eleven_flash_v2_5',
  licence: 'elevenlabs-free-noncommercial',
  date: '',
  chars: 1,
  credits: 1,
  durationMs: 1,
  ...o,
});

const voices: VoicesConfig = {
  providers: { elevenlabs: { defaultModel: 'eleven_flash_v2_5' } },
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
  it('clip file name is <lineId>.<sha256[0..8]>.<ext>', () => {
    expect(contentFile('laub.t.quelle', '9f02b107deadbeef', 'webm')).toBe('laub.t.quelle.9f02b107.webm');
    expect(contentFile('laub.t.quelle', 'abcdef0123', 'm4a')).toBe('laub.t.quelle.abcdef01.m4a');
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
    line('marlene.t.cameo', 'marlene', 'a', { beats: ['tour:t12'] }, 0),
    line('laub.t.intro', 'laub', 'b', { beats: ['tour:t16'] }, 1),
    line('laub.t.quelle', 'laub', 'c', { beats: ['tour:t17'] }, 2),
    line('laub.t.quelle.zurueck', 'laub', 'd', { beats: ['tour:t18'] }, 3),
    line('soll.k1.01', 'soll', 'e', { chapter: 'k1', file: 'kapitel-1' }, 4),
    line('laub.bark.idle.01', 'laub', 'f', { chapter: null, file: 'voices' }, 5),
  ];
  const cfg: PriorityConfig = {
    tiers: [
      { name: 'quelle', speakers: ['laub', 'marlene'], select: [{ beats: ['tour:t17', 'tour:t18'] }] },
      { name: 'tour', speakers: ['laub', 'marlene'], select: [{ chapter: 'tour' }] },
      { name: 'barks', select: [{ pack: 'voices' }] },
    ],
  };
  it('orders by tier, then play order; a line appears once; unmatched lines drop out', () => {
    expect(selectLines(lines, cfg).map((s) => `${s.tier}:${s.line.id}`)).toEqual([
      'quelle:laub.t.quelle',
      'quelle:laub.t.quelle.zurueck',
      'tour:marlene.t.cameo',
      'tour:laub.t.intro',
      'barks:laub.bark.idle.01',
    ]);
  });
  it('explicit ids / globs replace the tiers, in list order', () => {
    expect(selectLines(lines, cfg, { ids: ['laub.bark.*', 'laub.t.quelle*'] }).map((s) => s.line.id)).toEqual([
      'laub.bark.idle.01',
      'laub.t.quelle',
      'laub.t.quelle.zurueck',
    ]);
    expect(selectLines(lines, cfg, { ids: ['*'], speakers: ['marlene'] }).map((s) => s.line.id)).toEqual(['marlene.t.cameo']);
  });
});

describe('real content', () => {
  const lines = collectLines(loadContent(join(ROOT, 'content')));
  const byId = new Map(lines.map((l) => [l.id, l]));
  it('maps the guided tour’s spring beats to their inline lines', () => {
    const of = (b: string) => lines.filter((l) => l.beats.includes(b)).map((l) => l.id);
    expect(of('tour:t17')).toEqual(['laub.t.intro', 'player.q.laub', 'laub.t.intro.b', 'laub.t.quelle', 'laub.t.trog']);
    expect(of('tour:t18')).toEqual([
      'laub.k1.bleiche', 'player.q.wo', 'laub.t.1789', 'laub.t.seite',
      'liese.k1.sieht.v1', 'liese.k1.sieht.v2',
    ]);
  });
  it('ids are unique; inline story lines and quest lines are included; test chapters are excluded', () => {
    expect(byId.size).toBe(lines.length);
    expect(byId.get('marlene.t.cameo')?.source).toBe('story');
    expect(byId.get('quest.q.k1.ankunft.offer.0')?.speaker).toBe('laub');
    expect([...byId.keys()].some((id) => id.startsWith('test.'))).toBe(false);
  });
  it('the committed priority starts with Laub’s tour lines at the Quelle', () => {
    const sel = selectLines(lines, priority as PriorityConfig);
    expect(sel.slice(0, 7).map((s) => s.line.id)).toEqual([
      'laub.t.intro',
      'laub.t.intro.b',
      'laub.t.quelle',
      'laub.t.trog',
      'laub.k1.bleiche',
      'laub.t.1789',
      'laub.t.seite',
    ]);
    expect(new Set(sel.map((s) => s.line.speaker))).toEqual(new Set(['laub', 'marlene', 'player']));
  });
  it('selects each tour player clip once with only the speaker filter', () => {
    const sel = selectLines(lines, priority as PriorityConfig, { speakers: ['player'] });
    expect(sel.map((s) => s.line.id)).toEqual([
      'player.t.fuehrer',
      'player.t.wind',
      'player.t.hunde',
      'player.photo.gut',
      'player.photo.weg',
      'player.q.fund',
      'player.q.laub',
      'player.q.wo',
    ]);
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
    m.lines.a = entry({ textHash: textHash(t), speechHash: textHash(prepareTtsText(t)!), chars: 100, credits: 50 });
    const extra = [{ line: line('s', 'soll', t), tier: 'x' }, { line: line('cap', 'laub', '[Stille]'), tier: 'x' }];
    const p = buildPlan([...sel, ...extra], { voices, manifest: m, cap: 100 });
    expect(p.rows.find((r) => r.line.id === 'a')?.status).toBe('up-to-date');
    expect(p.rows.filter((r) => r.take).map((r) => r.line.id)).toEqual(['b', 'c']);
    expect(p.skipped.map((s) => `${s.line.id}:${s.reason}`)).toEqual(['s:no-voice', 'cap:nothing-to-speak']);
  });
});

describe('stale detection', () => {
  const h = textHash('Hallo');
  const e = entry({ textHash: h, voiceId: 'v1' });
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
    m.lines['z.line'] = entry({ files: { opus: 'z.line.0a1b2c3d.webm', aac: 'z.line.4e5f6a7b.m4a' }, date: '2026-11-20T00:00:00.000Z', durationMs: 100 });
    m.lines['a.line'] = entry({ files: { opus: 'a.line.00000000.webm', aac: 'a.line.11111111.m4a' }, provider: 'hf-space', licence: 'apache-2.0-model' });
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

  it('changing only the speech regenerates (speechHash)', () => {
    const first = buildPlan([{ line: l, tier: 'x' }], { voices, manifest: emptyManifest(), cap: 1000, speech: ovr }).rows[0]!;
    const m = emptyManifest();
    m.lines[l.id] = entry({ textHash: first.hash, speaker: 'marlene', voiceId: 'v-marlene', model: 'eleven_multilingual_v2', speechHash: first.speechHash });
    const same = buildPlan([{ line: l, tier: 'x' }], { voices, manifest: m, cap: 1000, speech: ovr }).rows[0]!;
    expect(same.status).toBe('up-to-date');
    const ovr2 = { 'marlene.k4.ruf': { ...ovr['marlene.k4.ruf'], speech: 'Hallo? Hörst du mich? Die Suppe wird kalt!' } };
    const again = buildPlan([{ line: l, tier: 'x' }], { voices, manifest: m, cap: 1000, speech: ovr2 }).rows[0]!;
    expect(again.status).toBe('stale-speech');
    expect(again.take).toBe(true);
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

describe('providers: config, credits, plan', () => {
  const mixed: VoicesConfig = {
    providers: { elevenlabs: { defaultModel: 'eleven_flash_v2_5', licence: 'elevenlabs-paid' }, 'hf-space': { defaultModel: 'qwen3-vd' } },
    speakers: {
      laub: { provider: 'elevenlabs', voiceId: 'v-laub' },
      marlene: { provider: 'hf-space', voicePrompt: 'Eine Frau Anfang vierzig, warme Altstimme' },
      soll: { provider: 'hf-space', voicePrompt: 'PLACEHOLDER' },
    },
  };
  it('resolves provider, voice id (prompt hash for designed voices), model and licence', () => {
    expect(resolveVoice('laub', mixed, 'eleven_v3')).toMatchObject({ provider: 'elevenlabs', voiceId: 'v-laub', model: 'eleven_v3', licence: 'elevenlabs-paid' });
    const m = resolveVoice('marlene', mixed, 'eleven_v3')!;
    expect(m).toMatchObject({ provider: 'hf-space', model: 'qwen3-vd', licence: 'apache-2.0-model', placeholder: false });
    expect(m.voiceId).toBe(`prompt:${textHash('Eine Frau Anfang vierzig, warme Altstimme')}`);
    expect(resolveVoice('soll', mixed)?.placeholder).toBe(true);
    expect(() => resolveVoice('x', { speakers: { x: { provider: 'nope' as never, voiceId: 'a' } } })).toThrow(/provider/);
    expect(() => resolveVoice('x', { speakers: { x: { voiceId: 'a', licence: 'cc-by' as never } } })).toThrow(/licence/);
  });
  it('hf-space costs 0 credits and keeps going after the credit cap; --max-lines guards it', () => {
    expect(creditsFor(500, 'qwen3-vd', 'hf-space')).toBe(0);
    const t = 'x'.repeat(100);
    const sel = [
      { line: line('l1', 'laub', t, {}, 0), tier: 'x' },
      { line: line('m1', 'marlene', t, {}, 1), tier: 'x' },
      { line: line('l2', 'laub', t, {}, 2), tier: 'x' },
      { line: line('m2', 'marlene', t, {}, 3), tier: 'x' },
      { line: line('m3', 'marlene', t, {}, 4), tier: 'x' },
    ];
    const p = buildPlan(sel, { voices: mixed, manifest: emptyManifest(), cap: 60, maxLines: { 'hf-space': 2 } });
    expect(p.rows.filter((r) => r.take).map((r) => r.line.id)).toEqual(['l1', 'm1', 'm2']);
    expect(p.stoppedAt?.line.id).toBe('l2');
    expect(p.limited).toEqual(['hf-space']);
    expect(p.spend).toBe(50);
    expect(buildPlan(sel, { voices: mixed, manifest: emptyManifest(), cap: 1000, limit: 2 }).rows.filter((r) => r.take).length).toBe(2);
  });
  it('provider change or a missing encoding regenerates', () => {
    const e = entry({ textHash: 'h', speechHash: 's' });
    const v = { voiceId: 'v-laub', model: 'eleven_flash_v2_5', provider: 'elevenlabs' as const };
    expect(lineStatus(e, 'h', v, () => true, 's')).toBe('up-to-date');
    expect(lineStatus(e, 'h', { ...v, provider: 'hf-space' }, () => true, 's')).toBe('stale-voice');
    expect(lineStatus(e, 'h', v, (f) => !f.endsWith('.m4a'), 's')).toBe('missing-file');
    expect(lineStatus({ ...e, files: undefined as never }, 'h', v, () => true, 's')).toBe('missing-file');
    expect(entryFiles({ file: 'old.mp3' })).toEqual(['old.mp3']);
    expect(entryFiles(e)).toEqual(['x.00000000.webm', 'x.00000000.m4a']);
  });
  it('estimates dist size from durations or characters', () => {
    expect(estimateMB([{ chars: 0, durationMs: 1_000_000 }])).toBeCloseTo(9.36, 2);
    expect(estimateMB([{ chars: 14_000 }])).toBeCloseTo(9.36, 2);
  });
});

describe('hf-space provider (mocked Gradio client, no network)', () => {
  const cfg = { space: 'Qwen/Qwen3-TTS', apiName: '/voice_design', params: { text: '$text', voice_description: '$voicePrompt', language: 'German', seed: 7 } };
  const voice = resolveVoice('marlene', { speakers: { marlene: { provider: 'hf-space', voicePrompt: 'warme Altstimme' } } })!;
  const req = { text: 'Hallo? Hörst du mich?', voice, model: voice.model, lang: 'de' };
  it('connects with the token, fills the params, downloads the file with auth only from HF hosts', async () => {
    const calls: unknown[] = [];
    const connect: GradioConnect = async (space, opts) => {
      calls.push(['connect', space, opts]);
      return { predict: async (ep, data) => (calls.push(['predict', ep, data]), { data: [{ url: 'https://qwen-qwen3-tts.hf.space/file=/tmp/a.wav', path: '/tmp/a.wav' }] }) };
    };
    const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response(new Uint8Array([1, 2, 3])));
    const p = hfSpaceProvider('hf_test_token', cfg, { connect, fetch: fetchMock as unknown as typeof fetch });
    const res = await p.synthesize(req);
    expect([...res.audio]).toEqual([1, 2, 3]);
    expect(res.billedCredits).toBe(0);
    expect(calls).toEqual([
      ['connect', 'Qwen/Qwen3-TTS', { hf_token: 'hf_test_token' }],
      ['predict', '/voice_design', { text: 'Hallo? Hörst du mich?', voice_description: 'warme Altstimme', language: 'German', seed: 7 }],
    ]);
    expect(fetchMock.mock.calls[0]![1]).toEqual({ headers: { authorization: 'Bearer hf_test_token' } });
    expect(isHfHost('https://evil.example.com/hf.space')).toBe(false);
    expect(isHfHost('https://huggingface.co/x')).toBe(true);
  });
  it('redacts the token from errors and refuses a placeholder endpoint', async () => {
    const connect: GradioConnect = async () => ({ predict: async () => Promise.reject(new Error('quota exceeded for hf_test_token')) });
    await expect(hfSpaceProvider('hf_test_token', cfg, { connect }).synthesize(req)).rejects.toThrow('quota exceeded for [REDACTED]');
    expect(() => hfSpaceProvider('t', { ...cfg, apiName: 'PLACEHOLDER_X' })).toThrow(/placeholder/);
  });
  it('helpers', () => {
    expect(audioUrl({ value: { url: 'https://x.hf.space/a.wav' } })).toBe('https://x.hf.space/a.wav');
    expect(audioUrl(['nope', 3])).toBeNull();
    expect(fillParams({ a: '$lang', b: '$model', c: 1 }, req)).toEqual({ a: 'de', b: voice.model, c: 1 });
  });
});

describe('elevenlabs provider (stubbed fetch, no network)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends the key only as a header, German language code, MP3 128 source', async () => {
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => new Response(new Uint8Array([9]), { headers: { 'character-cost': '12' } }));
    vi.stubGlobal('fetch', fetchMock);
    const voice = resolveVoice('laub', voices)!;
    const res = await elevenLabsProvider('sk_secret', { outputFormat: 'mp3_44100_128' }).synthesize({ text: 'Hallo', voice, model: 'eleven_flash_v2_5', lang: 'de' });
    expect([...res.audio]).toEqual([9]);
    expect(res.billedCredits).toBe(12);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/v-laub?output_format=mp3_44100_128');
    expect(url).not.toContain('sk_secret');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('sk_secret');
    expect(JSON.parse(init.body as string)).toMatchObject({ text: 'Hallo', model_id: 'eleven_flash_v2_5', language_code: 'de' });
  });
  it('sends each speaker\'s voice_settings from voices.json; character-cost is the billed credits', async () => {
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => new Response(new Uint8Array([1]), { headers: { 'character-cost': '54' } }));
    vi.stubGlobal('fetch', fetchMock);
    // the ElevenLabs picks live on in voices.json `$alternatives` (laub / marlene now use moss)
    const alt = (voicesJson as unknown as { $alternatives: VoicesConfig['speakers'] }).$alternatives;
    const voice = resolveVoice('marlene', { ...(voicesJson as unknown as VoicesConfig), speakers: { marlene: alt.marlene! } })!;
    expect(voice).toMatchObject({ voiceId: 'XrExE9yKIg1WjnnlVkGX', placeholder: false });
    const res = await elevenLabsProvider('k').synthesize({ text: 'Hallo', voice, model: voice.model, lang: 'de' });
    expect(res.billedCredits).toBe(54);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string).voice_settings).toMatchObject({ stability: 0.45, similarity_boost: 0.75, style: 0, speed: 1.06 });
  });
  it('error messages never carry the key', async () => {
    vi.stubGlobal('fetch', async () => new Response('bad key sk_secret', { status: 400 }));
    const voice = resolveVoice('laub', voices)!;
    await expect(elevenLabsProvider('sk_secret').synthesize({ text: 'x', voice, model: 'eleven_flash_v2_5', lang: 'de' })).rejects.toThrow(/\[REDACTED\]/);
  });
});
