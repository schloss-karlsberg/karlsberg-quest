/** Voice pipeline, local `moss` provider: no model, no lock, no network. The child process is mocked;
 * only the runner's refusal paths run for real (system python, stops before any mlx import). */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  clipFilter,
  durationMs,
  encodeArgs,
  ffmpegAvailable,
  FFMPEG,
  makeupArgs,
  measureR128,
  OPUS_MAKEUP_DB,
  parseR128,
  pauseCapFilter,
  preLimitFilter,
  processClip,
  trimArgs,
} from '../scripts/voice/audio.ts';
import {
  LICENCES,
  MOSS_ATTRIBUTION,
  MOSS_ENGINE,
  MOSS_MODEL,
  PROVIDERS,
  buildPlan,
  creditsFor,
  emptyManifest,
  lineStatus,
  mossVoiceId,
  resolveVoice,
  selectLines,
  textHash,
  type ManifestEntry,
  type VoiceLine,
  type VoicesConfig,
} from '../scripts/voice/lib.ts';
import {
  EXIT_QUIET,
  EXIT_REFUSED,
  HEAVY_OWNER,
  MOSS_BATCH_MAX,
  QUIET_WINDOW,
  batches,
  buildClips,
  checkReference,
  heavyCommand,
  mossBatches,
  mossConfig,
  mossEstimate,
  parseRunnerOutput,
  refSha8For,
  sha8File,
  type MossItem,
  type RunFn,
} from '../scripts/voice/moss.ts';
import { mossProvider } from '../scripts/voice/providers.ts';
import voicesJson from '../scripts/voice/voices.json';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kq-moss-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// a fake ~/kq-models with two reference files and a forbidden ElevenLabs clip next to it
const HOME = join(tmp, 'home');
const VOICES = join(HOME, 'kq-models', 'voices');
const CLIPS = join(tmp, 'casting', 'clips');
mkdirSync(VOICES, { recursive: true });
mkdirSync(CLIPS, { recursive: true });
writeFileSync(join(VOICES, 'laub-ref.wav'), 'RIFF-laub-v1');
writeFileSync(join(VOICES, 'marlene-ref.wav'), 'RIFF-marlene');
writeFileSync(join(CLIPS, 'brian.mp3'), 'eleven');
symlinkSync(join(CLIPS, 'brian.mp3'), join(VOICES, 'sneaky.wav'));
const cfg = mossConfig({}, HOME);

const line = (id: string, speaker: string, text: string, order = 0): VoiceLine => ({ id, speaker, text, chapter: 'prolog', beats: [], source: 'pack', file: 'prolog', order });

const mossVoices: VoicesConfig = {
  providers: { moss: { defaultModel: MOSS_MODEL, licence: 'apache-2.0-model' } },
  speakers: {
    laub: { provider: 'moss', reference: 'laub-ref.wav', seed: 102, language: 'German', instruction: 'brisk', params: { max_tokens: 1000 }, postprocess: { maxPauseSec: 0.45 } },
    marlene: { provider: 'moss', reference: 'marlene-ref.wav', seed: 205, language: 'German' },
    soll: { provider: 'moss', reference: 'nope.wav', seed: 1 },
  },
};
const ro = { refSha8: refSha8For(cfg) };

describe('moss config', () => {
  it('defaults under <homedir>/kq-models, env overrides (with ~), never a hardcoded user path', () => {
    expect(cfg).toEqual({ venv: join(HOME, 'kq-models/venv-moss'), home: join(HOME, 'kq-models'), voices: VOICES, python: join(HOME, 'kq-models/venv-moss/bin/python'), owner: 'kq-voice-moss' });
    const c = mossConfig({ KQ_MOSS_HOME: '~/m', KQ_MOSS_VENV: '/opt/v', KQ_MOSS_VOICES: ' ' }, HOME);
    expect(c).toMatchObject({ home: join(HOME, 'm'), venv: '/opt/v', voices: join(HOME, 'm/voices'), python: '/opt/v/bin/python' });
  });
  it('KQ_HEAVY_OWNER relabels the lock owner (e.g. kq-voice-gate); default kq-voice-moss', () => {
    const g = mossConfig({ KQ_HEAVY_OWNER: 'kq-voice-gate' }, HOME);
    expect(heavyCommand(g, '/w/j.json').env.KQ_HEAVY_OWNER).toBe('kq-voice-gate');
    expect(heavyCommand(mossConfig({ KQ_HEAVY_OWNER: '  ' }, HOME), '/w/j.json').env.KQ_HEAVY_OWNER).toBe('kq-voice-moss');
  });
});

describe('reference guard', () => {
  it('accepts files inside the voices dir (relative or absolute)', () => {
    expect(checkReference('laub-ref.wav', VOICES, { mustExist: true })).toMatch(/laub-ref\.wav$/);
    expect(checkReference(join(VOICES, 'marlene-ref.wav'), VOICES)).toMatch(/marlene-ref\.wav$/);
  });
  it('rejects ../casting/clips paths, paths outside the voices dir and symlinks out of it', () => {
    expect(() => checkReference('../../../casting/clips/brian.mp3', VOICES)).toThrow(/ElevenLabs/);
    expect(() => checkReference(join(CLIPS, 'brian.mp3'), VOICES)).toThrow(/ElevenLabs/);
    expect(() => checkReference('sneaky.wav', VOICES)).toThrow(/ElevenLabs/);
    expect(() => checkReference('../elsewhere.wav', VOICES)).toThrow(/outside/);
    expect(() => checkReference('/etc/hosts', VOICES)).toThrow(/outside/);
    expect(() => checkReference(VOICES + '-evil/x.wav', VOICES)).toThrow(/outside/);
    expect(() => checkReference('gone.wav', VOICES, { mustExist: true })).toThrow(/missing/);
    expect(() => checkReference('', VOICES)).toThrow(/missing/);
  });
  it('voices.json references must be plain file names', () => {
    expect(() => resolveVoice('x', { speakers: { x: { provider: 'moss', reference: '../casting/clips/a.wav', seed: 1 } } })).toThrow(/plain file name/);
  });
});

describe('moss voice id, plan and manifest fields', () => {
  it('voiceId = moss:<speaker>:<sha8 of reference>:<seed>; a new reference or seed regenerates', () => {
    const v = resolveVoice('laub', mossVoices, 'eleven_v3', ro)!;
    const sha = sha8File(join(VOICES, 'laub-ref.wav'))!;
    expect(v).toMatchObject({ provider: 'moss', voiceId: `moss:laub:${sha}:102`, model: MOSS_MODEL, licence: 'apache-2.0-model', placeholder: false, postprocess: { maxPauseSec: 0.45 } });
    expect(v.moss).toMatchObject({ reference: 'laub-ref.wav', seed: 102, language: 'German', instruction: 'brisk', params: { max_tokens: 1000 } });
    const entry: ManifestEntry = {
      files: { opus: 'a.webm', aac: 'a.m4a' }, textHash: 'h', speechHash: 's', speaker: 'laub', provider: 'moss', voiceId: v.voiceId,
      model: v.model, licence: v.licence, date: '', chars: 1, credits: 0, durationMs: 1, attribution: MOSS_ATTRIBUTION, engine: MOSS_ENGINE,
    };
    expect(lineStatus(entry, 'h', v, () => true, 's')).toBe('up-to-date');
    const reseeded = resolveVoice('laub', { ...mossVoices, speakers: { laub: { ...mossVoices.speakers.laub!, seed: 103 } } }, undefined, ro)!;
    expect(reseeded.voiceId).toBe(`moss:laub:${sha}:103`);
    expect(lineStatus(entry, 'h', reseeded, () => true, 's')).toBe('stale-voice');
    // a new reference file (other bytes) → other sha → stale
    const voices2 = join(tmp, 'voices2');
    mkdirSync(voices2);
    writeFileSync(join(voices2, 'laub-ref.wav'), 'RIFF-laub-v2');
    const v2 = resolveVoice('laub', mossVoices, undefined, { refSha8: refSha8For({ voices: voices2 }) })!;
    expect(v2.voiceId).not.toBe(v.voiceId);
    expect(lineStatus(entry, 'h', v2, () => true, 's')).toBe('stale-voice');
    expect(mossVoiceId('laub', null, 1)).toBe('moss:laub:MISSING:1');
  });
  it('engine marker: model + tokenizer revisions and warm-up v1; a missing or different engine regenerates (voiceId unchanged)', () => {
    expect(MOSS_ENGINE).toEqual({
      model: 'MOSS-TTS-v1.5@cdd3b911b1585e3f2dbc7775ef10f9926f58850a',
      tokenizer: 'MOSS-Audio-Tokenizer@3cd226ba2947efa357ef453bcad111b6eafba782',
      warmup: 'v1',
    });
    const v = resolveVoice('laub', mossVoices, undefined, ro)!;
    expect(v.engine).toEqual(MOSS_ENGINE);
    expect(v.voiceId).toMatch(/^moss:laub:[0-9a-f]{8}:102$/); // the asset-rules voiceId format stays
    const base: ManifestEntry = {
      files: { opus: 'a.webm', aac: 'a.m4a' }, textHash: 'h', speechHash: 's', speaker: 'laub', provider: 'moss', voiceId: v.voiceId,
      model: v.model, licence: v.licence, date: '', chars: 1, credits: 0, durationMs: 1, attribution: MOSS_ATTRIBUTION,
    };
    expect(lineStatus({ ...base, engine: { ...MOSS_ENGINE } }, 'h', v, () => true, 's')).toBe('up-to-date');
    expect(lineStatus(base, 'h', v, () => true, 's')).toBe('stale-engine'); // pre-warm-up clips
    for (const k of ['model', 'tokenizer', 'warmup'] as const)
      expect(lineStatus({ ...base, engine: { ...MOSS_ENGINE, [k]: 'other' } }, 'h', v, () => true, 's'), k).toBe('stale-engine');
    expect(lineStatus({ ...base, engine: null as unknown as ManifestEntry['engine'] }, 'h', v, () => true, 's')).toBe('stale-engine');
    // non-moss voices carry no engine and ignore the field
    expect(lineStatus({ ...base, provider: 'elevenlabs', voiceId: 'abc' }, 'h', { voiceId: 'abc', model: v.model, provider: 'elevenlabs' }, () => true, 's')).toBe('up-to-date');
    // the plan regenerates them, and the stale count picks them up
    const sel = [{ line: line('laub.a', 'laub', 'Hallo Welt.'), tier: 't' }];
    const manifest = { version: 1 as const, lines: { 'laub.a': { ...base, textHash: textHash('Hallo Welt.'), speechHash: textHash('Hallo Welt.') } } };
    const p = buildPlan(sel, { voices: mossVoices, manifest, cap: 0, resolve: ro });
    expect(p.rows[0]).toMatchObject({ status: 'stale-engine', take: true });
    manifest.lines['laub.a'] = { ...manifest.lines['laub.a']!, engine: { ...MOSS_ENGINE } };
    expect(buildPlan(sel, { voices: mossVoices, manifest, cap: 0, resolve: ro }).rows[0]).toMatchObject({ status: 'up-to-date', take: false });
  });
  it('runner.py and MOSS_ENGINE agree on revisions and warm-up version', () => {
    const src = readFileSync(join(ROOT, 'scripts/voice/moss/runner.py'), 'utf8');
    expect(MOSS_ENGINE.model).toBe(`MOSS-TTS-v1.5@${/^REV = "([0-9a-f]{40})"$/m.exec(src)![1]}`);
    expect(MOSS_ENGINE.tokenizer).toBe(`MOSS-Audio-Tokenizer@${/^TOK_REV = "([0-9a-f]{40})"$/m.exec(src)![1]}`);
    expect(src).toMatch(/^WARMUP = \{"version": "v1", "text": "Hallo\.", "seed": 0, "max_tokens": 50\}$/m);
    expect(MOSS_ENGINE.warmup).toBe('v1');
  });
  it('a missing reference is a placeholder (planned in a dry run, skipped in a real run)', () => {
    expect(resolveVoice('soll', mossVoices, undefined, ro)).toMatchObject({ placeholder: true, voiceId: 'moss:soll:MISSING:1' });
    expect(resolveVoice('laub', mossVoices)?.placeholder).toBe(true); // no sha resolver at all
    expect(resolveVoice('x', { speakers: { x: { provider: 'moss', reference: 'a.wav' } } })).toBeNull(); // no seed
  });
  it('0 credits, respects --max-lines', () => {
    expect(creditsFor(5000, MOSS_MODEL, 'moss')).toBe(0);
    const sel = Array.from({ length: 9 }, (_, i) => ({ line: line(`l${i}`, i % 2 ? 'marlene' : 'laub', 'Hallo Welt.', i), tier: 't' }));
    const p = buildPlan(sel, { voices: mossVoices, manifest: emptyManifest(), cap: 0, maxLines: { moss: 7 }, resolve: ro });
    expect(p.rows.filter((r) => r.take).length).toBe(7);
    expect(p.limited).toEqual(['moss']);
    expect(p.spend).toBe(0);
  });
  it('dry-run estimate: minutes at RTF 1.1 plus one load per batch, number of lock batches', () => {
    const e = mossEstimate(Array.from({ length: 13 }, () => ({ chars: 140 })));
    expect(e).toMatchObject({ lines: 13, chars: 1820, batches: 3 });
    expect(e.minutes).toBeCloseTo(((1820 / 14) * 1.1 + 3 * 10) / 60, 5);
  });
});

describe('job building and batching', () => {
  const v = (s: string) => resolveVoice(s, mossVoices, undefined, ro)!.moss!;
  const items: MossItem[] = Array.from({ length: 14 }, (_, i) => ({ id: `line.${i}`, text: `Satz ${i}.`, moss: v(i % 2 ? 'marlene' : 'laub') }));
  it('≤ 6 per batch, order kept', () => {
    const b = batches(items);
    expect(b.map((x) => x.length)).toEqual([6, 6, 2]);
    expect(b.flat()).toEqual(items);
    expect(MOSS_BATCH_MAX).toBe(6);
    expect(batches([], 6)).toEqual([]);
  });
  it('clips carry the guarded absolute reference, seed, language, instruction and params', () => {
    const [laub, marlene] = buildClips(items.slice(0, 2), cfg);
    expect(laub).toEqual({ id: 'line.0', text: 'Satz 0.', reference: expect.stringMatching(/kq-models\/voices\/laub-ref\.wav$/), seed: 102, language: 'German', instruction: 'brisk', params: { max_tokens: 1000 } });
    expect(marlene).not.toHaveProperty('instruction');
    expect(() => buildClips([{ id: 'x', text: 'y', moss: { ...v('laub'), reference: '../../casting/clips/brian.mp3' } }], cfg)).toThrow(/ElevenLabs|outside/);
  });
});

describe('heavy lock and quiet window (mocked child process)', () => {
  const v = resolveVoice('laub', mossVoices, undefined, ro)!;
  const reqs = Array.from({ length: 8 }, (_, i) => ({ id: `laub.${i}`, text: `Satz ${i}.`, voice: v, model: v.model, lang: 'de' }));
  const work = join(tmp, 'work');
  const fakeRunner = (codes: number[] = []): { run: RunFn; calls: { cmd: string; args: string[]; o: { cwd: string; env: Record<string, string | undefined> } }[] } => {
    const calls: { cmd: string; args: string[]; o: { cwd: string; env: Record<string, string | undefined> } }[] = [];
    const run: RunFn = async (cmd, args, o) => {
      calls.push({ cmd, args, o });
      const code = codes.shift() ?? 0;
      if (code !== 0) return { code, stdout: '' };
      const job = JSON.parse((await import('node:fs')).readFileSync(args[args.length - 1]!, 'utf8')) as { outDir: string; clips: { id: string }[] };
      return { code: 0, stdout: 'noise\n' + job.clips.map((c) => JSON.stringify({ id: c.id, wav: join(job.outDir, `${c.id}.wav`), seconds: 2.5, rtf: 1.05 })).join('\n') + '\n' };
    };
    return { run, calls };
  };

  it('the command line is heavy.sh --check-load --strict --max-hold 10 -- <venv python> -I runner.py <job>, owner kq-voice-moss', () => {
    const c = heavyCommand(cfg, '/w/job.json');
    expect(c.cmd).toBe('scripts/dev/heavy.sh');
    expect(c.args).toEqual(['--check-load', '--strict', '--max-hold', '10', '--', cfg.python, '-I', 'scripts/voice/moss/runner.py', '/w/job.json']);
    expect(c.env).toMatchObject({ KQ_HEAVY_OWNER: HEAVY_OWNER, KQ_MOSS_VOICES: VOICES, HF_HUB_OFFLINE: '1' });
    expect(HEAVY_OWNER).toBe('kq-voice-moss');
  });

  it('runs one wrapped process per batch of ≤ 6 and yields every WAV', async () => {
    const { run, calls } = fakeRunner();
    const p = mossProvider({ cfg, repo: ROOT, workDir: work }, { run, exists: () => false, fileExists: () => true, env: { PATH: '/bin' } });
    const out = [];
    for await (const b of p.batches(reqs)) out.push(b);
    expect(calls.length).toBe(2);
    expect(calls.every((c) => c.cmd === 'scripts/dev/heavy.sh' && c.args.includes('--strict') && c.o.cwd === ROOT && c.o.env.KQ_HEAVY_OWNER === 'kq-voice-moss')).toBe(true);
    expect(calls[0]!.o.env.PATH).toBe('/bin');
    expect(out.map((b) => b.clips.length)).toEqual([6, 2]);
    expect(out.flatMap((b) => b.failed)).toEqual([]);
    expect(out[0]!.clips[0]).toMatchObject({ id: 'laub.0', seconds: 2.5, rtf: 1.05 });
  });

  it('--ids order is the batch order: the first listed id is the first real clip after the warm-up', async () => {
    // content order: nah before b; --ids asks for b first
    const lines = [line('laub.p.quelle.nah', 'laub', 'Da. Die Karlsbergquelle.', 1), line('laub.p.quelle.b', 'laub', 'Gehen Sie hin.', 2), line('laub.p.other', 'laub', 'Anders.', 0)];
    const sel = selectLines(lines, { tiers: [] }, { ids: ['laub.p.quelle.b', 'laub.p.quelle.nah'] });
    expect(sel.map((s) => s.line.id)).toEqual(['laub.p.quelle.b', 'laub.p.quelle.nah']);
    expect(selectLines(lines, { tiers: [] }, { ids: ['laub.p.quelle.nah', 'laub.p.quelle.b'] }).map((s) => s.line.id)).toEqual(['laub.p.quelle.nah', 'laub.p.quelle.b']);
    expect(selectLines(lines, { tiers: [] }, { ids: ['laub.p.quelle.b', 'laub.p.*'] }).map((s) => s.line.id)).toEqual(['laub.p.quelle.b', 'laub.p.quelle.nah', 'laub.p.other']); // globs: content order, no repeats
    const todo = buildPlan(sel, { voices: mossVoices, manifest: emptyManifest(), cap: 0, resolve: ro }).rows.filter((r) => r.take);
    const { run, calls } = fakeRunner();
    const p = mossProvider({ cfg, repo: ROOT, workDir: join(tmp, 'work-order') }, { run, exists: () => false, fileExists: () => true, env: {} });
    for await (const _ of p.batches(todo.map((r) => ({ id: r.line.id, text: r.tts, voice: r.voice, model: r.voice.model, lang: 'de' })))) void _;
    expect(calls.length).toBe(1);
    const job = JSON.parse(readFileSync(calls[0]!.args.at(-1)!, 'utf8')) as { clips: { id: string }[] };
    expect(job.clips.map((c) => c.id)).toEqual(['laub.p.quelle.b', 'laub.p.quelle.nah']);
  });

  it('no batch starts while /tmp/kq-quiet-window exists', async () => {
    const { run, calls } = fakeRunner();
    let polls = 0;
    const seen: string[] = [];
    const exists = (p: string) => {
      seen.push(p);
      return p === QUIET_WINDOW && polls < 3;
    };
    const sleep = async () => {
      expect(calls.length).toBe(0); // nothing ran while the window was open
      polls++;
    };
    const logs: string[] = [];
    const out = [];
    for await (const b of mossBatches(reqs.slice(0, 2).map((r) => ({ id: r.id, text: r.text, moss: v.moss! })), { cfg, repo: ROOT, workDir: work, log: (s) => logs.push(s) }, { run, exists, sleep, fileExists: () => true }))
      out.push(b);
    expect(polls).toBe(3);
    expect(seen).toContain(QUIET_WINDOW);
    expect(calls.length).toBe(1);
    expect(logs.some((l) => l.includes('waiting'))).toBe(true);
  });

  it('runner exit 76 (window opened inside the lock) retries; heavy.sh exit 75 stops; other failures skip the batch', async () => {
    const items = reqs.map((r) => ({ id: r.id, text: r.text, moss: v.moss! }));
    const a = fakeRunner([EXIT_QUIET]);
    const outA = [];
    for await (const b of mossBatches(items.slice(0, 3), { cfg, repo: ROOT, workDir: work }, { run: a.run, exists: () => false, fileExists: () => true })) outA.push(b);
    expect(a.calls.length).toBe(2);
    expect(outA[0]!.clips.length).toBe(3);

    const b = fakeRunner([EXIT_REFUSED]);
    const gen = mossBatches(items, { cfg, repo: ROOT, workDir: work }, { run: b.run, exists: () => false, fileExists: () => true });
    await expect(gen.next()).rejects.toThrow(/refused/);

    const c = fakeRunner([1, 0]);
    const outC = [];
    for await (const x of mossBatches(items, { cfg, repo: ROOT, workDir: work }, { run: c.run, exists: () => false, fileExists: () => true })) outC.push(x);
    expect(outC[0]).toMatchObject({ code: 1, clips: [], failed: items.slice(0, 6).map((i) => i.id) });
    expect(outC[1]!.clips.length).toBe(2);
  });

  it('refuses without the venv python and rejects non-moss voices', async () => {
    const gen = mossBatches([{ id: 'a', text: 'b', moss: v.moss! }], { cfg, repo: ROOT, workDir: work }, { exists: () => false, fileExists: () => false });
    await expect(gen.next()).rejects.toThrow(/KQ_MOSS_VENV/);
    const el = resolveVoice('x', { speakers: { x: { voiceId: 'abc' } } })!;
    expect(() => mossProvider({ cfg, repo: ROOT, workDir: work }).batches([{ id: 'x', text: 'y', voice: el, model: el.model, lang: 'de' }])).toThrow(/not a moss voice/);
  });

  it('parses only well-formed runner lines', () => {
    expect(parseRunnerOutput('loaded\n{"id":"a","wav":"/x/a.wav","seconds":1.2,"rtf":1}\n{bad\n{"id":1}\n')).toEqual([{ id: 'a', wav: '/x/a.wav', seconds: 1.2, rtf: 1 }]);
  });
});

describe('runner.py refusal paths (system python, no mlx import, no model)', () => {
  const py = spawnSync('python3', ['--version']).status === 0 ? 'python3' : null;
  const runner = join(ROOT, 'scripts/voice/moss/runner.py');
  // KQ_MOSS_HOME points at an empty dir: even a valid job could never find the snapshot (exit 4)
  const env = { PATH: process.env.PATH ?? '', KQ_MOSS_HOME: join(tmp, 'empty-home'), KQ_MOSS_VOICES: VOICES };
  const runJob = (job: unknown) => spawnSync(py!, ['-I', runner, '-'], { input: JSON.stringify(job), env, encoding: 'utf8' });
  const clip = (o: Record<string, unknown> = {}) => ({ id: 'a', text: 'Hallo.', reference: 'laub-ref.wav', seed: 1, language: 'German', ...o });
  it.skipIf(!py)('refuses ElevenLabs clips and references outside the voices dir before loading anything', () => {
    for (const reference of ['../../../casting/clips/brian.mp3', join(CLIPS, 'brian.mp3'), 'sneaky.wav', '/etc/hosts', '../x.wav']) {
      const r = runJob({ outDir: join(tmp, 'o'), clips: [clip({ reference })] });
      expect(r.status, `${reference}: ${r.stderr}`).toBe(3);
      expect(r.stdout).toBe('');
    }
  });
  it.skipIf(!py)('warm-up v1 with a mocked model: eval params, seed 0, one "Hallo." generate (first clip ref + language, max_tokens 50 only), nothing written; then per-clip reseed in job order', () => {
    // stand-ins for mlx.core / numpy / random record every call; run_batch gets them injected
    const probe = String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("runner", sys.argv[1])
runner = importlib.util.module_from_spec(spec); spec.loader.exec_module(runner)
ev = []
class Seeder:
    def __init__(self, name): self.name = name
    def seed(self, s): ev.append(["seed", self.name, s])
class MX:
    random = Seeder("mx")
    def eval(self, x): ev.append(["eval", x])
class NP:
    random = Seeder("np")
    float32 = "f32"
    def array(self, x, dtype=None): return list(x)
class Res:
    def __init__(self, text): self.audio = "audio:" + text; self.sample_rate = 4
class Model:
    def parameters(self): return "PARAMS"
    def generate(self, text, **kw):
        ev.append(["generate", text, kw]); yield Res(text)
runner.random = Seeder("random")
clips = [
    {"id": "b", "text": "Gehen Sie hin.", "reference": "/v/laub.wav", "seed": 102, "language": "German", "instruction": "brisk", "params": {"max_tokens": 900}},
    {"id": "nah", "text": "Da.", "reference": "/v/laub.wav", "seed": 102, "language": "German"},
]
runner.run_batch(Model(), clips, "/tok", "/out", MX(), NP(), lambda p, a, sr: ev.append(["write", p]))
print("EVENTS " + json.dumps(ev))
`;
    const r = spawnSync(py!, ['-I', '-c', probe, runner], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/warmup v1 done in \d+\.\d s/);
    const ev = JSON.parse(r.stdout.split('\n').find((l) => l.startsWith('EVENTS '))!.slice(7)) as unknown[];
    const clip = (text: string, kw: Record<string, unknown>, id: string) => [
      ['seed', 'mx', 102], ['seed', 'np', 102], ['seed', 'random', 102],
      ['generate', text, kw], ['eval', `audio:${text}`], ['write', `/out/${id}.wav`],
    ];
    expect(ev).toEqual([
      ['eval', 'PARAMS'],
      ['seed', 'mx', 0], ['seed', 'np', 0], ['seed', 'random', 0],
      ['generate', 'Hallo.', { audio_tokenizer_source: '/tok', ref_audio: '/v/laub.wav', max_tokens: 50, language: 'German' }],
      ['eval', 'audio:Hallo.'],
      ...clip('Gehen Sie hin.', { max_tokens: 900, audio_tokenizer_source: '/tok', ref_audio: '/v/laub.wav', language: 'German', instruction: 'brisk' }, 'b'),
      ...clip('Da.', { audio_tokenizer_source: '/tok', ref_audio: '/v/laub.wav', language: 'German' }, 'nah'),
    ]);
    // main() hands the freshly loaded model straight to run_batch (warm-up after every load)
    const src = readFileSync(runner, 'utf8');
    expect(src).toMatch(/model = load\(model_dir, lazy=True\)\n.*\n\s+run_batch\(model, clips,/);
  });
  it.skipIf(!py)('refuses more than 6 clips, bad ids and unknown params; a valid job stops at the missing snapshot', () => {
    expect(runJob({ outDir: join(tmp, 'o'), clips: Array.from({ length: 7 }, (_, i) => clip({ id: `c${i}` })) }).status).toBe(2);
    expect(runJob({ outDir: join(tmp, 'o'), clips: [clip({ id: '../x' })] }).status).toBe(2);
    expect(runJob({ outDir: join(tmp, 'o'), clips: [clip({ params: { trust_remote_code: true } })] }).status).toBe(2);
    expect(runJob([clip()]).status).toBe(2); // no out dir
    const ok = runJob({ outDir: join(tmp, 'o'), clips: [clip()] });
    expect([4, 76]).toContain(ok.status); // 76 if a quiet window happens to be active
  });
});

describe('loudness: pre-limit + static make-up to −18 LUFS (post-processing)', () => {
  it('gain to the target, then a gentle limiter; make-up is a plain gain to 24 kHz mono', () => {
    expect(preLimitFilter(-23.39)).toBe('volume=5.39dB,alimiter=limit=0.6:attack=5:release=50:level=false');
    expect(preLimitFilter('-12')).toBe('volume=-6.00dB,alimiter=limit=0.6:attack=5:release=50:level=false');
    expect(preLimitFilter(-Infinity)).toMatch(/^volume=0\.00dB,/); // silence: no gain
    expect(preLimitFilter(-90)).toMatch(/^volume=30\.00dB,/); // clamped
    const a = makeupArgs('l.wav', -18.8, 'n.wav');
    expect(a[a.indexOf('-af') + 1]).toBe('volume=0.80dB');
    expect(a.slice(-7)).toEqual(['-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', 'n.wav']);
    expect(a.join(' ')).not.toContain('loudnorm');
  });
  it('Opus gets the make-up gain (or none on the clean retry), AAC none', () => {
    const e = encodeArgs('n.wav', 'o.webm', 'a.m4a');
    expect(e.opus[e.opus.indexOf('-af') + 1]).toBe(`volume=${OPUS_MAKEUP_DB}dB`);
    expect(e.opus).toEqual(expect.arrayContaining(['libopus', '24k', 'voip', 'webm', 'o.webm']));
    expect(e.aac).not.toContain('-af');
    expect(encodeArgs('n.wav', 'o.webm', 'a.m4a', 0).opus).not.toContain('-af');
  });
  it('parses the ebur128 summary', () => {
    const s = '[Parsed_ebur128_0] t: 1 M: -20 S: -21 I: -25.0 LUFS\n  Integrated loudness:\n    I:         -18.3 LUFS\n  True peak:\n    Peak:       -1.2 dBFS\n';
    expect(parseR128(s)).toEqual({ i: -18.3, tp: -1.2 });
    expect(parseR128('    I:         -inf LUFS\n')).toEqual({ i: -Infinity, tp: -Infinity });
  });
  it.skipIf(!ffmpegAvailable())('a hot, peaky clip lands at −18 ± 0.5 LUFS in both encodings', () => {
    const src = join(tmp, 'hot.wav');
    // loud tone bursts with 0 dBFS clicks: peak-to-loudness ratio well over 16.5 dB
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', "aevalsrc='0.08*sin(2*PI*180*t)*(1+0.5*sin(2*PI*3*t))+if(lt(mod(t,0.5),0.002),0.98,0)':s=24000:d=3", src]);
    const o = join(tmp, 'hot.webm');
    const a = join(tmp, 'hot.m4a');
    processClip(src, o, a);
    expect(Math.abs(measureR128(a).i + 18)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(measureR128(o).i + 18)).toBeLessThanOrEqual(0.5);
  });
});

describe('pause cap (post-processing)', () => {
  it('builds silenceremove args only when a cap is set', () => {
    expect(pauseCapFilter(undefined)).toBeNull();
    expect(pauseCapFilter(0)).toBeNull();
    expect(pauseCapFilter(0.45)).toBe('silenceremove=stop_periods=-1:stop_duration=0.45:stop_threshold=-50dB:stop_silence=0');
    expect(() => pauseCapFilter(0.01)).toThrow(/range/);
    expect(clipFilter()).not.toContain('stop_periods');
    expect(clipFilter({ maxPauseSec: 0.45 }).startsWith('silenceremove=stop_periods=-1:stop_duration=0.45')).toBe(true);
    expect(clipFilter({ maxPauseSec: 0.45 })).toContain('areverse'); // lead/tail trim still follows
    const a = trimArgs('in.wav', 'out.wav', { maxPauseSec: 0.45 });
    expect(a.slice(a.indexOf('-af'), a.indexOf('-af') + 2)[1]).toBe(clipFilter({ maxPauseSec: 0.45 }));
    expect(a.slice(-5)).toEqual(['-ac', '1', '-ar', '48000', 'out.wav']);
  });
  it.skipIf(!ffmpegAvailable())('shortens a 1.5 s gap to about the cap, keeps a short gap', () => {
    const mk = (gap: number, name: string) => {
      const f = join(tmp, name);
      execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=220:d=0.5:r=24000', '-f', 'lavfi', '-i', `anullsrc=r=24000:cl=mono:d=${gap}`, '-f', 'lavfi', '-i', 'sine=f=220:d=0.5:r=24000', '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1', '-ac', '1', f]);
      return f;
    };
    const run = (f: string) => {
      const out = f.replace('.wav', '.out.wav');
      execFileSync(FFMPEG, trimArgs(f, out, { maxPauseSec: 0.45 }));
      return durationMs(out);
    };
    const long = run(mk(1.5, 'gap.wav'));
    expect(long).toBeGreaterThan(1400);
    expect(long).toBeLessThan(1650); // 2.5 s → ~1.5 s
    const short = run(mk(0.3, 'short.wav'));
    expect(short).toBeGreaterThan(1250); // 1.3 s, untouched
  });
});

describe('committed voices.json', () => {
  const vj = voicesJson as unknown as VoicesConfig & { $alternatives: Record<string, unknown> };
  it('laub and marlene use moss with the casting picks (seed, language, instruction); ElevenLabs kept as alternatives', () => {
    expect(vj.speakers.laub).toMatchObject({
      provider: 'moss', reference: 'laub-ref.wav', seed: 102, language: 'German', params: { max_tokens: 1000 }, postprocess: { maxPauseSec: 0.45 },
      instruction: 'A middle-aged man with a warm baritone voice, slightly formal, with dry humour. He speaks at a natural, brisk conversational pace.',
      note: 'picked 2026-11-20 by criteria, owner may override',
    });
    expect(vj.speakers.marlene).toMatchObject({
      provider: 'moss', reference: 'marlene-ref.wav', seed: 205, language: 'German',
      instruction: 'Eine Frau Mitte dreißig mit freundlicher, heller, klarer Stimme. Praktisch, schnell, etwas locker. Sie spricht in natürlichem, zügigem Gesprächstempo.',
      note: 'picked 2026-11-20 by criteria, owner may override',
    });
    expect(vj.$alternatives).toMatchObject({ laub: { provider: 'elevenlabs', voiceId: 'nPczCjzI2devNBz1zQrb' }, marlene: { provider: 'elevenlabs', voiceId: 'XrExE9yKIg1WjnnlVkGX' } });
  });
  it('every speaker resolves with a known provider and licence; no absolute paths committed', () => {
    for (const k of Object.keys(vj.speakers)) {
      const v = resolveVoice(k, vj, undefined, { refSha8: () => 'deadbeef' })!;
      expect(PROVIDERS).toContain(v.provider);
      expect(LICENCES).toContain(v.licence);
      if (v.provider === 'moss') expect(v).toMatchObject({ model: MOSS_MODEL, licence: 'apache-2.0-model', voiceId: `moss:${k}:deadbeef:${vj.speakers[k]!.seed}` });
    }
    expect(JSON.stringify(voicesJson)).not.toMatch(/\/Users\/|\/home\/[a-z]/);
  });
});
