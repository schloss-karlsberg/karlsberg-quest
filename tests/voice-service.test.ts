/** Voice pipeline, moss **service mode** (scripts/voice/mossService.ts + generate.mjs): submit / collect
 * against a fake moss-service client module (a temp file injected via KQ_MOSS_SERVICE_CLIENT). No model,
 * no lock, no real service: the fake client only reads and writes JSON files in a temp dir. */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FFMPEG, ffmpegAvailable } from '../scripts/voice/audio.ts';
import { MOSS_ENGINE, mossVoiceId, textHash, type MossVoice } from '../scripts/voice/lib.ts';
import {
  DEFAULT_WAIT_MIN,
  MISSING_CLIENT,
  SERVICE_PROJECT,
  assessResult,
  checkRawDir,
  clientRefusals,
  isStaleResult,
  loadServiceClient,
  mapEngineIdentity,
  mossMode,
  normalizeWaitArg,
  readRegistry,
  registryDiffs,
  serviceJob,
  sha256File,
  submitSummary,
  textSha256,
  type Registry,
  type RegistryVoice,
  type ResultRecord,
  type ServiceClient,
  type ServiceJob,
} from '../scripts/voice/mossService.ts';

const REPO = resolve(__dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'kq-moss-service-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// --- fixtures ---------------------------------------------------------------------------------
const VOICES_DIR = join(tmp, 'kq-models', 'voices');
mkdirSync(VOICES_DIR, { recursive: true });
writeFileSync(join(VOICES_DIR, 'laub-ref.wav'), 'RIFF-laub-ref');
writeFileSync(join(VOICES_DIR, 'guest-ref.wav'), 'RIFF-guest-ref');
const LAUB_SHA = sha256File(join(VOICES_DIR, 'laub-ref.wav'));
const SVC_ENGINE = {
  engine: 'moss-tts',
  model: `OpenMOSS-Team/${MOSS_ENGINE.model}`,
  tokenizer: `OpenMOSS-Team/${MOSS_ENGINE.tokenizer}`,
  runtime: 'mlx-audio',
  warmup: 'v1',
};
const laubVoice = { provider: 'moss', reference: 'laub-ref.wav', seed: 102, language: 'German', instruction: 'A dry baritone.', params: { max_tokens: 1000 }, model: null };
const voicesFile = (speakers: Record<string, unknown>, name: string) => {
  const f = join(tmp, name);
  writeFileSync(f, JSON.stringify({ providers: { moss: { defaultModel: 'MOSS-TTS-v1.5@cdd3b91', licence: 'apache-2.0-model' } }, speakers }));
  return f;
};
const VOICES = voicesFile({ laub: laubVoice }, 'voices.json');
const VOICES_GUEST = voicesFile({ 'guest-test': { ...laubVoice, reference: 'guest-ref.wav', seed: 7 } }, 'voices-guest.json');
const GUEST_SHA = sha256File(join(VOICES_DIR, 'guest-ref.wav'));
const VOICES_PLAYER = voicesFile({
  player: { provider: 'moss', serviceVoice: 'guest-test', refSha256: GUEST_SHA, seed: 7, params: { max_tokens: 150 }, licence: 'speaker-permission' },
}, 'voices-player.json');

const CONTENT = join(tmp, 'content');
mkdirSync(join(CONTENT, 'packs'), { recursive: true });
const LINES = [
  { id: 'laub.a', speaker: 'laub', text_de: 'Guten Tag.' },
  { id: 'laub.b', speaker: 'laub', text_de: 'Gehen Sie hin, {Name}.' },
  { id: 'guest.a', speaker: 'guest-test', text_de: 'Hallo.' },
  { id: 'player.a', speaker: 'player', text_de: 'Hallo.' },
];
writeFileSync(join(CONTENT, 'packs', 'voices.pack.json'), JSON.stringify({ pack: 'voices', dialogue: LINES }));
// speech.json override for laub.a; laub.b is auto-prepped ({Name} dropped)
const SPEECH = join(tmp, 'speech.json');
writeFileSync(SPEECH, JSON.stringify({ 'laub.a': { forText: textHash('Guten Tag.'), speech: 'Guten Tag, gnädige Frau.' } }));
const SPOKEN: Record<string, string> = { 'laub.a': 'Guten Tag, gnädige Frau.', 'laub.b': 'Gehen Sie hin.', 'guest.a': 'Hallo.', 'player.a': 'Hallo.' };

const regVoice = (over: Partial<RegistryVoice> = {}): RegistryVoice => ({
  engine: 'moss-tts',
  visibility: 'public',
  seed: 102,
  ref_sha256: LAUB_SHA,
  ref_source: 'moss-synthetic',
  language: 'German',
  instruction: 'A dry baritone.',
  params: { max_tokens: 1000 },
  ok: true,
  error: null,
  engine_identity: { ...SVC_ENGINE },
  ...over,
});
const playerRegistry = (over: Partial<RegistryVoice> = {}): Registry => ({
  'guest-test': regVoice({ seed: 7, ref_sha256: GUEST_SHA, ref_source: 'real-person-recording', instruction: null, params: { max_tokens: 150 }, ...over }),
});

// the fake client: state files in FAKE_MOSS_STATE (registry.json, results.json, answers.json → submitted.json)
const CLIENT = join(tmp, 'fake-moss.mjs');
writeFileSync(
  CLIENT,
  `import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const S = process.env.FAKE_MOSS_STATE;
const read = (f, d) => (existsSync(S + '/' + f) ? JSON.parse(readFileSync(S + '/' + f, 'utf8')) : d);
export async function submit(jobs) {
  writeFileSync(S + '/submitted.json', JSON.stringify(jobs));
  const answers = read('answers.json', {});
  const results = read('results.json', {});
  const rows = jobs.map((j) => answers[j.id] ?? { project: j.project, id: j.id, status: 'queued', key: 'k'.repeat(64), cached: false });
  for (const r of rows) if (r.status === 'queued') results[r.id] = { project: r.project, id: r.id, status: 'queued' };
  writeFileSync(S + '/results.json', JSON.stringify(results));
  return rows;
}
export function result(project, id) { return read('results.json', {})[id] ?? null; }
export async function waitAll(project, ids, { timeoutMs = 0 } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const m = new Map(ids.map((id) => [id, result(project, id)]));
    if ([...m.values()].every((r) => r && !['queued', 'running'].includes(r.status)) || Date.now() >= end) return m;
    await new Promise((r) => setTimeout(r, 20));
  }
}
export function registry() { return read('registry.json', {}); }
`,
);
const NOEXPORT = join(tmp, 'not-a-client.mjs');
writeFileSync(NOEXPORT, 'export const x = 1;\n');

const STATE = join(tmp, 'state');
const OUT = join(tmp, 'out');
const RAW = join(tmp, 'raw-service');
const state = (f: string, v: unknown) => writeFileSync(join(STATE, f), JSON.stringify(v));
const readState = (f: string) => (existsSync(join(STATE, f)) ? JSON.parse(readFileSync(join(STATE, f), 'utf8')) : undefined);

function gen(extra: string[], env: Record<string, string> = {}, voices = VOICES) {
  return spawnSync(
    process.execPath,
    [join(REPO, 'scripts/voice/generate.mjs'), '--env', join(tmp, 'none.env'), '--offline', '--voices', voices, '--content', CONTENT, '--speech', SPEECH, '--out', OUT, '--raw-dir', RAW, '--ids', '*', ...extra],
    {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, ELEVENLABS_API_KEY: '', HF_TOKEN: '', KQ_MOSS_VOICES: VOICES_DIR, KQ_MOSS_MODE: 'service', KQ_MOSS_SERVICE_CLIENT: CLIENT, FAKE_MOSS_STATE: STATE, ...env },
    },
  );
}

beforeEach(() => {
  rmSync(STATE, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(STATE, { recursive: true });
  state('registry.json', { laub: regVoice(), 'guest-test': regVoice({ visibility: 'private', seed: 7, ref_source: 'real-person-recording' }) });
});

// --- pure helpers -----------------------------------------------------------------------------
describe('mossService helpers', () => {
  it('mode: direct by default, service by env or flag, anything else refused', () => {
    expect(mossMode({})).toBe('direct');
    expect(mossMode({ KQ_MOSS_MODE: 'direct' })).toBe('direct');
    expect(mossMode({ KQ_MOSS_MODE: ' Service ' })).toBe('service');
    expect(mossMode({}, true)).toBe('service');
    expect(() => mossMode({ KQ_MOSS_MODE: 'cloud' })).toThrow(/direct" or "service/);
  });

  it('loads the client only from KQ_MOSS_SERVICE_CLIENT, with clear errors', async () => {
    await expect(loadServiceClient({})).rejects.toThrow(MISSING_CLIENT);
    await expect(loadServiceClient({ KQ_MOSS_SERVICE_CLIENT: '  ' })).rejects.toThrow(/set KQ_MOSS_SERVICE_CLIENT/);
    await expect(loadServiceClient({ KQ_MOSS_SERVICE_CLIENT: join(tmp, 'nope.mjs') })).rejects.toThrow(/missing file/);
    await expect(loadServiceClient({ KQ_MOSS_SERVICE_CLIENT: NOEXPORT })).rejects.toThrow(/submit\(\) and result\(\)/);
    const c = await loadServiceClient({ KQ_MOSS_SERVICE_CLIENT: CLIENT });
    expect(typeof c.submit).toBe('function');
  });

  it('builds a job with the spoken text and no seed / params', () => {
    const j = serviceJob({ id: 'laub.a', speaker: 'laub', text: 'Guten Tag.' }, RAW);
    expect(j).toEqual({ project: SERVICE_PROJECT, id: 'laub.a', voice: 'laub', text: 'Guten Tag.', output: { path: join(RAW, 'laub.a.wav'), format: 'wav' } });
    expect(Object.keys(j).sort()).toEqual(['id', 'output', 'project', 'text', 'voice']);
  });

  it('refuses a raw dir with a public/ path component', () => {
    expect(checkRawDir(join(REPO, 'public', 'raw-service'))).toMatch(/inside a public\/ folder/);
    expect(checkRawDir(join(tmp, 'x', 'public', 'deep'))).toMatch(/public/);
    expect(checkRawDir(join(REPO, '.voice-raw', 'raw-service'))).toBeNull();
    expect(checkRawDir(join(tmp, 'publicity'))).toBeNull();
  });

  it('reserves guest-test for the player mapping and rejects private registry voices', () => {
    const lines = [
      { id: 'a', speaker: 'laub' },
      { id: 'b', speaker: 'guest-test' },
      { id: 'c', speaker: 'secret' },
    ];
    const reg: Registry = { laub: regVoice(), 'guest-test': regVoice({ visibility: 'public' }), secret: regVoice({ visibility: 'private' }) };
    const r = clientRefusals(lines, reg);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatch(/^b: voice guest-test is reserved for the player mapping/);
    expect(r[1]).toMatch(/^c: registry voice secret has visibility "private"/);
    expect(clientRefusals([lines[1]!], {})).toHaveLength(1);
  });

  describe('consistency guard (voices.json vs registry)', () => {
    const ours: MossVoice = { speaker: 'laub', reference: 'laub-ref.wav', refSha8: LAUB_SHA.slice(0, 8), seed: 102, language: 'German', instruction: 'A dry baritone.', params: { max_tokens: 1000 } };
    const diff = (over: Partial<RegistryVoice>, me: Partial<MossVoice> = {}) => registryDiffs([{ ...ours, ...me }], { laub: regVoice(over) });
    it('agrees when everything matches (params key order irrelevant)', () => {
      expect(diff({})).toEqual([]);
      expect(diff({ params: { max_tokens: 1000 } }, { params: { max_tokens: 1000 } })).toEqual([]);
      expect(registryDiffs([{ ...ours, params: { a: 1, b: 2 } }], { laub: regVoice({ params: { b: 2, a: 1 } }) })).toEqual([]);
    });
    it.each([
      ['seed', { seed: 103 }, /laub\.seed: voices\.json 102 != registry 103/],
      ['ref', { ref_sha256: 'deadbeef'.padEnd(64, '0') }, /laub\.ref_sha256\[0:8\]: voices\.json "[0-9a-f]{8}" != registry "deadbeef"/],
      ['language', { language: 'English' }, /laub\.language: voices\.json "German" != registry "English"/],
      ['language missing', { language: null }, /laub\.language: voices\.json "German" != registry \(none\)/],
      ['instruction', { instruction: 'Another voice.' }, /laub\.instruction: voices\.json "A dry baritone\." != registry "Another voice\."/],
      ['params', { params: { max_tokens: 900 } }, /laub\.params: voices\.json \{"max_tokens":1000\} != registry \{"max_tokens":900\}/],
      ['engine model', { engine_identity: { ...SVC_ENGINE, model: 'OpenMOSS-Team/MOSS-TTS-v1.5@0000' } }, /engine_identity\.model: voices\.json "MOSS-TTS-v1\.5@cdd3b911[0-9a-f]+" != registry "MOSS-TTS-v1\.5@0000"/],
      ['engine tokenizer', { engine_identity: { ...SVC_ENGINE, tokenizer: 'OpenMOSS-Team/MOSS-Audio-Tokenizer@1111' } }, /engine_identity\.tokenizer/],
      ['engine warmup', { engine_identity: { ...SVC_ENGINE, warmup: 'v2' } }, /engine_identity\.warmup: voices\.json "v1" != registry "v2"/],
      ['no warmup', { engine_identity: { ...SVC_ENGINE, warmup: undefined } }, /engine_identity\.warmup: voices\.json "v1" != registry \(none\)/],
      ['engine identity missing', { engine_identity: null }, /laub\.engine_identity:/],
      ['engine', { engine: 'fake' }, /laub\.engine: voices\.json "moss-tts" != registry "fake"/],
      ['registry check failing', { ok: false, error: 'ref sha mismatch' }, /the registry's own check fails: ref sha mismatch/],
    ])('fails on a %s mismatch', (_n, over, re) => {
      const d = diff(over as Partial<RegistryVoice>);
      expect(d.length).toBeGreaterThan(0);
      expect(d.join('\n')).toMatch(re);
    });
    it('fails when the voice is not registered, or our reference is missing', () => {
      expect(registryDiffs([ours], {})).toEqual(['laub: voice laub is missing from the moss-service registry']);
      expect(diff({}, { refSha8: null }).join()).toMatch(/local reference laub-ref\.wav is missing/);
    });
    it('our side: instruction absent on both sides is equal; on one side only it differs', () => {
      expect(diff({ instruction: null }, { instruction: undefined })).toEqual([]);
      expect(diff({ instruction: null }).join()).toMatch(/instruction/);
    });
  });

  it('maps the service engine identity to the manifest shape', () => {
    expect(mapEngineIdentity(SVC_ENGINE)).toEqual({ ...MOSS_ENGINE });
    expect(mapEngineIdentity({ ...SVC_ENGINE, engine: 'fake' })).toBeNull();
    expect(mapEngineIdentity(null)).toBeNull();
  });

  describe('assessResult', () => {
    const l = { id: 'laub.a', speaker: 'laub', text: 'Guten Tag.', seed: 102 };
    const wavSha = 'c'.repeat(64);
    const ok = (over: Partial<ResultRecord> = {}): ResultRecord => ({
      status: 'ok',
      key: 'f'.repeat(64),
      output: '/x/laub.a.wav',
      sha256: wavSha,
      text_sha256: textSha256('Guten Tag.'),
      engine: { ...SVC_ENGINE },
      seed: 102,
      voice: 'laub',
      ...over,
    });
    const deps = { exists: () => true, hashFile: () => wavSha };
    it('pending, missing and final failure states', () => {
      expect(assessResult(l, null, deps)).toEqual({ kind: 'none' });
      expect(assessResult(l, { status: 'queued' }, deps)).toEqual({ kind: 'queued', status: 'queued' });
      expect(assessResult(l, { status: 'running' }, deps)).toEqual({ kind: 'queued', status: 'running' });
      expect(assessResult(l, { status: 'failed', error: 'engine crash' }, deps)).toEqual({ kind: 'failed', reason: 'failed: engine crash' });
      expect(assessResult(l, { status: 'refused', error: 'private voice' }, deps)).toEqual({ kind: 'failed', reason: 'refused: private voice' });
      expect(assessResult(l, { status: 'weird' }, deps)).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/unknown status/) });
    });
    it('ok → ready with engine, key and raw sha', () => {
      expect(assessResult(l, ok(), deps)).toEqual({ kind: 'ready', wav: '/x/laub.a.wav', engine: { ...MOSS_ENGINE }, serviceKey: 'f'.repeat(64), sha256Raw: wavSha, cached: false });
    });
    it('cached without an engine record takes the registry engine identity', () => {
      const rec = ok({ status: 'cached', engine: undefined });
      expect(assessResult(l, rec, { ...deps, registry: { laub: regVoice() } })).toMatchObject({ kind: 'ready', cached: true, engine: { ...MOSS_ENGINE } });
      expect(assessResult(l, rec, deps)).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/^engine/) });
      expect(assessResult(l, rec, { ...deps, registry: { laub: regVoice({ engine_identity: { ...SVC_ENGINE, warmup: 'v0' } }) } })).toMatchObject({ kind: 'failed' });
    });
    it('fails on a text_sha256 mismatch', () => {
      expect(assessResult(l, ok({ text_sha256: textSha256('Guten Tag!') }), deps)).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/text_sha256/) });
      expect(assessResult(l, ok({ text_sha256: undefined }), deps)).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/text_sha256/) });
    });
    it('fails on a WAV sha mismatch or a missing WAV', () => {
      expect(assessResult(l, ok(), { ...deps, hashFile: () => 'd'.repeat(64) })).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/WAV sha256/) });
      expect(assessResult(l, ok(), { ...deps, exists: () => false })).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/WAV missing/) });
    });
    it('fails on an engine mismatch, another voice or seed', () => {
      expect(assessResult(l, ok({ engine: { ...SVC_ENGINE, warmup: 'v0' } }), deps)).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/^engine/) });
      expect(assessResult(l, ok({ engine: { ...SVC_ENGINE, model: 'OpenMOSS-Team/MOSS-TTS-v1.5@other' } }), deps)).toMatchObject({ kind: 'failed' });
      expect(assessResult(l, ok({ voice: 'marlene' }), deps)).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/voice/) });
      expect(assessResult(l, ok({ seed: 7 }), deps)).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/seed/) });
    });
    it('a final result for another text is stale (resubmitted, not collected)', () => {
      expect(isStaleResult(ok({ text_sha256: textSha256('old') }), l)).toBe(true);
      expect(isStaleResult(ok(), l)).toBe(false);
      expect(isStaleResult({ status: 'queued' }, l)).toBe(false);
      expect(isStaleResult(null, l)).toBe(false);
    });
    it('recognizes a requested take in fresh and seedless cached results', () => {
      const take = { ...l, takeSeed: 8 };
      expect(isStaleResult(ok(), take)).toBe(true);
      expect(assessResult(take, ok({ seed: 8 }), deps).kind).toBe('ready');
      const cached = ok({ status: 'cached', seed: undefined });
      expect(assessResult(take, cached, deps).kind).toBe('failed');
      const output = serviceJob(take, RAW).output.path;
      expect(assessResult(take, { ...cached, output }, deps).kind).toBe('ready');
      expect(isStaleResult({ ...cached, output }, l)).toBe(true);
    });
    it('rejects an earlier result for the same seed and text rendered with another token budget', () => {
      const bounded = { ...l, lineMaxTokens: 82 };
      for (const result of [ok(), ok({ status: 'cached', seed: undefined })]) {
        expect(isStaleResult(result, bounded)).toBe(true);
        expect(assessResult(bounded, result, deps).kind).toBe('failed');
        const updated = { ...result, output: serviceJob(bounded, RAW).output.path };
        expect(assessResult(bounded, updated, deps).kind).toBe('ready');
        expect(isStaleResult(updated, { ...bounded, lineMaxTokens: 83 })).toBe(true);
        expect(isStaleResult(updated, l)).toBe(true);
      }
    });
  });

  it('--wait takes an optional number of minutes', () => {
    expect(normalizeWaitArg(['--wait'])).toEqual(['--wait', String(DEFAULT_WAIT_MIN)]);
    expect(normalizeWaitArg(['--wait', '--collect'])).toEqual(['--wait', '30', '--collect']);
    expect(normalizeWaitArg(['--wait', '5'])).toEqual(['--wait', '5']);
    expect(normalizeWaitArg(['--wait', '0.5', '-v'])).toEqual(['--wait', '0.5', '-v']);
  });

  it('summarises submit answers', () => {
    const s = submitSummary([
      { id: 'a', status: 'queued', cached: true },
      { id: 'b', status: 'queued', cached: false },
      { id: 'c', status: 'refused', error: 'bad' },
    ]);
    expect(s.queued).toBe(2);
    expect(s.cached).toBe(1);
    expect(s.refused.map((r) => r.id)).toEqual(['c']);
  });

  it('reads the registry from registry(), else moss-registry list --json next to SUBMIT (read-only)', async () => {
    const base = { submit: async () => [], result: () => null } as unknown as ServiceClient;
    expect(await readRegistry({ ...base, registry: () => ({ laub: regVoice() }) })).toEqual({ laub: regVoice() });
    expect(await readRegistry({ ...base, registry: () => ({ voices: { laub: regVoice() } }) as unknown as Registry })).toEqual({ laub: regVoice() });
    const calls: string[][] = [];
    const exec = async (cmd: string, args: string[]) => (calls.push([cmd, ...args]), JSON.stringify({ laub: regVoice() }));
    expect(await readRegistry({ ...base, SUBMIT: '/svc/bin/moss-submit' }, exec)).toEqual({ laub: regVoice() });
    expect(calls).toEqual([['/svc/bin/moss-registry', 'list', '--json']]);
    await expect(readRegistry(base)).rejects.toThrow(/neither registry\(\) nor SUBMIT/);
    // the real spawn path, with a stub moss-registry script
    const bin = join(tmp, 'svc-bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'moss-registry'), `#!/bin/sh\n[ "$1 $2" = "list --json" ] || exit 2\necho '${JSON.stringify({ laub: { seed: 102 } })}'\n`);
    chmodSync(join(bin, 'moss-registry'), 0o755);
    expect(await readRegistry({ ...base, SUBMIT: join(bin, 'moss-submit') })).toEqual({ laub: { seed: 102 } });
  });
});

// --- generate.mjs, real process ----------------------------------------------------------------
describe('generate.mjs service mode (fake client)', () => {
  it('fails clearly when KQ_MOSS_SERVICE_CLIENT is missing, submits nothing', () => {
    const r = gen(['--submit'], { KQ_MOSS_SERVICE_CLIENT: '' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/set KQ_MOSS_SERVICE_CLIENT/);
    expect(readState('submitted.json')).toBeUndefined();
  });

  it('refuses --raw-dir under public/', () => {
    const r = gen(['--raw-dir', join(tmp, 'site', 'public', 'raw')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/inside a public\/ folder/);
    expect(readState('submitted.json')).toBeUndefined();
  });

  it('--submit/--collect without service mode are refused (direct stays the default)', () => {
    const r = gen(['--collect'], { KQ_MOSS_MODE: '' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/need moss service mode/);
  });

  it('submits one job per line: prepared speech text, raw path, no seed / params; prints the owner step', () => {
    state('answers.json', { 'laub.b': { project: SERVICE_PROJECT, id: 'laub.b', status: 'queued', key: 'e'.repeat(64), cached: true } });
    const r = gen(['--speakers', 'laub']);
    expect(r.status, r.stderr).toBe(0);
    const jobs = readState('submitted.json') as ServiceJob[];
    expect(jobs.map((j) => j.id)).toEqual(['laub.a', 'laub.b']);
    for (const j of jobs) {
      expect(Object.keys(j).sort()).toEqual(['id', 'output', 'project', 'text', 'voice']);
      expect(j).toMatchObject({ project: 'karlsberg-quest', voice: 'laub', text: SPOKEN[j.id], output: { path: join(RAW, `${j.id}.wav`), format: 'wav' } });
    }
    expect(r.stdout).toMatch(/2 queued \(1 cached\) — owner runs: moss-run/);
    expect(existsSync(OUT)).toBe(false); // nothing post-processed, no output dir
  });

  it('sends a text-scaled max_tokens override using the prepared speech and registry defaults', () => {
    const voices = voicesFile({ laub: { ...laubVoice, scaleMaxTokensToText: true } }, 'bounded.json');
    const r = gen(['--speakers', 'laub', '--submit', '--force'], {}, voices);
    expect(r.status, r.stderr).toBe(0);
    const jobs = readState('submitted.json') as ServiceJob[];
    expect(jobs.map((j) => [j.text, j.params, j.output.path])).toEqual([
      [SPOKEN['laub.a'], { max_tokens: 82 }, join(RAW, 'laub.a~max82.wav')],
      [SPOKEN['laub.b'], { max_tokens: 67 }, join(RAW, 'laub.b~max67.wav')],
    ]);
  });

  it('a row refused by the service is reported with a non-zero exit', () => {
    state('answers.json', { 'laub.a': { project: SERVICE_PROJECT, id: 'laub.a', status: 'refused', error: 'output inside a git work tree' } });
    const r = gen(['--speakers', 'laub', '--submit']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/refused by moss-service: laub\.a: output inside a git work tree/);
    expect(r.stdout).toMatch(/1 queued \(0 cached\)/);
  });

  it('a registry mismatch fails with a precise diff and submits nothing', () => {
    state('registry.json', { laub: regVoice({ seed: 103, params: { max_tokens: 500 } }) });
    const r = gen(['--speakers', 'laub']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/laub\.seed: voices\.json 102 != registry 103/);
    expect(r.stderr).toMatch(/laub\.params: voices\.json \{"max_tokens":1000\} != registry \{"max_tokens":500\}/);
    expect(r.stderr).toMatch(/Nothing submitted/);
    expect(readState('submitted.json')).toBeUndefined();
  });

  it('refuses guest-test as a speaker and respects private registry visibility', () => {
    const r = gen(['--speakers', 'guest-test'], {}, VOICES_GUEST);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/guest\.a: voice guest-test is reserved for the player mapping/);
    expect(readState('submitted.json')).toBeUndefined();
    state('registry.json', { laub: regVoice({ visibility: 'private' }) });
    const p = gen(['--speakers', 'laub']);
    expect(p.status).toBe(1);
    expect(p.stderr).toMatch(/visibility "private"/);
    expect(readState('submitted.json')).toBeUndefined();
  });

  it('submits player lines through the approved service mapping without a local reference', () => {
    state('registry.json', playerRegistry());
    const r = gen(['--speakers', 'player', '--submit'], {}, VOICES_PLAYER);
    expect(r.status, r.stderr).toBe(0);
    expect(readState('submitted.json')).toEqual([
      { project: SERVICE_PROJECT, id: 'player.a', voice: 'guest-test', text: 'Hallo.', output: { path: join(RAW, 'player.a.wav'), format: 'wav' } },
    ]);
  });

  it.each([
    [{ visibility: 'private' }, /visibility "private"/],
    [{ ok: false, error: 'public consent required' }, /public real-person consent check/],
    [{ ref_source: 'moss-synthetic' }, /public real-person consent check/],
    [{ ref_sha256: GUEST_SHA.slice(0, 8) + '0'.repeat(56) }, /player\.ref_sha256:/],
  ])('refuses a player submission for registry override %j', (over, reason) => {
    state('registry.json', playerRegistry(over));
    const r = gen(['--speakers', 'player', '--submit'], {}, VOICES_PLAYER);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(reason);
    expect(readState('submitted.json')).toBeUndefined();
  });

  it('skips the service-only player voice in direct mode', () => {
    const r = gen(['--speakers', 'player'], { KQ_MOSS_MODE: 'direct' }, VOICES_PLAYER);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/requiring service mode \(skipped\): player/);
    expect(r.stdout).toMatch(/Nothing to generate/);
  });

  it('--dry-run prints the service plan and the registry check, submits nothing', () => {
    state('results.json', { 'laub.a': { status: 'queued' } });
    const r = gen(['--speakers', 'laub', '--dry-run', '-v']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/moss service mode \(dry run, nothing submitted\)/);
    expect(r.stdout).toMatch(/1 still queued · 1 submit/);
    expect(r.stdout).toMatch(/Registry check: voices\.json and the moss-service registry agree/);
    expect(readState('submitted.json')).toBeUndefined();
  });

  it('--wait times out cleanly with "still queued"', () => {
    const r = gen(['--speakers', 'laub', '--submit', '--wait', '0.002']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/2 queued/);
    expect(r.stdout).toMatch(/laub\.a: still queued/);
    expect(r.stdout).toMatch(/0 collected, 2 still queued/);
  });

  describe('collect', () => {
    const wav = join(tmp, 'tone.wav');
    const haveFfmpeg = ffmpegAvailable();
    if (haveFfmpeg) execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=220:d=0.6:r=24000', '-ac', '1', wav]);
    const okRec = (id: string, over: Partial<ResultRecord> = {}): ResultRecord => {
      mkdirSync(RAW, { recursive: true });
      const out = join(RAW, `${id}.wav`);
      writeFileSync(out, haveFfmpeg ? readFileSync(wav) : `RIFF-${id}`);
      return { status: 'ok', key: 'a'.repeat(64), output: out, sha256: sha256File(out), text_sha256: textSha256(SPOKEN[id]!), engine: { ...SVC_ENGINE }, seed: 102, voice: 'laub', project: SERVICE_PROJECT, id, ...over };
    };
    const manifest = () => (existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : { lines: {} });

    it.skipIf(!haveFfmpeg)('rerolls only the configured line and records its take under the credited voice ID', () => {
      const voices = voicesFile({ laub: { ...laubVoice, lineSeeds: { 'laub.a': 103 } } }, 'voices-reroll.json');
      state('results.json', { 'laub.a': okRec('laub.a'), 'laub.b': okRec('laub.b') });
      expect(gen(['--collect']).status).toBe(0);
      const submit = gen(['--submit'], {}, voices);
      expect(submit.status, submit.stderr).toBe(0);
      expect(readState('submitted.json')).toEqual([
        { project: SERVICE_PROJECT, id: 'laub.a', voice: 'laub', text: SPOKEN['laub.a'], seed: 103, output: { path: join(RAW, 'laub.a~103.wav'), format: 'wav' } },
      ]);
      state('results.json', { 'laub.a': okRec('laub.a', { seed: 103 }) });
      const collect = gen(['--collect'], {}, voices);
      expect(collect.status, collect.stderr).toBe(0);
      expect(manifest().lines['laub.a']).toMatchObject({ voiceId: mossVoiceId('laub', LAUB_SHA.slice(0, 8), 102), takeSeed: 103 });
      expect(manifest().lines['laub.b']).not.toHaveProperty('takeSeed');
      expect(gen(['--submit'], {}, voices).stdout).toContain('Nothing to generate');
    });

    it.skipIf(!haveFfmpeg)('checks consent on collect and keeps player as the manifest speaker for a cached guest-test clip', () => {
      state('results.json', {
        'player.a': okRec('player.a', { status: 'cached', engine: undefined, seed: undefined, voice: 'guest-test' }),
      });
      state('registry.json', playerRegistry({ visibility: 'private' }));
      const refused = gen(['--speakers', 'player', '--collect'], {}, VOICES_PLAYER);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toMatch(/visibility "private"/);
      expect(existsSync(OUT)).toBe(false);
      state('registry.json', playerRegistry());
      const collected = gen(['--speakers', 'player', '--collect'], {}, VOICES_PLAYER);
      expect(collected.status, collected.stderr).toBe(0);
      expect(manifest().lines['player.a']).toMatchObject({
        speaker: 'player', voiceId: mossVoiceId('player', GUEST_SHA.slice(0, 8), 7), licence: 'speaker-permission',
      });
    });

    it.skipIf(!haveFfmpeg)('ok and cached results are post-processed into manifest entries with serviceKey + sha256Raw', () => {
      const a = okRec('laub.a');
      const b = okRec('laub.b', { status: 'cached', engine: undefined, key: 'b'.repeat(64) });
      state('results.json', { 'laub.a': a, 'laub.b': b });
      const r = gen(['--speakers', 'laub', '--collect']);
      expect(r.status, r.stderr + r.stdout).toBe(0);
      const m = manifest();
      const e = m.lines['laub.a'];
      expect(e).toMatchObject({
        provider: 'moss',
        speaker: 'laub',
        voiceId: mossVoiceId('laub', LAUB_SHA.slice(0, 8), 102),
        engine: { ...MOSS_ENGINE },
        serviceKey: 'a'.repeat(64),
        sha256Raw: a.sha256,
        speechHash: textHash(SPOKEN['laub.a']!),
        credits: 0,
      });
      expect(m.lines['laub.b']).toMatchObject({ serviceKey: 'b'.repeat(64), engine: { ...MOSS_ENGINE } });
      expect(existsSync(join(OUT, e.files.opus))).toBe(true);
      expect(existsSync(a.output!)).toBe(true); // raw WAV kept: the service cache points at it
      expect(r.stdout).toMatch(/2 collected, 0 still queued, 0 failed/);
      // now up to date: nothing left to submit or collect
      const again = gen(['--speakers', 'laub']);
      expect(again.status).toBe(0);
      expect(again.stdout).toMatch(/Nothing to generate/);
    });

    it('failed / refused: reported, manifest untouched, non-zero exit; queued: skipped', () => {
      state('results.json', { 'laub.a': { status: 'failed', error: 'engine crash' }, 'laub.b': { status: 'refused', error: 'quiet' } });
      const r = gen(['--speakers', 'laub', '--collect']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/laub\.a: failed: engine crash – manifest unchanged/);
      expect(r.stderr).toMatch(/laub\.b: refused: quiet/);
      expect(manifest().lines).toEqual({});
      state('results.json', { 'laub.a': { status: 'queued' }, 'laub.b': { status: 'running' } });
      const q = gen(['--speakers', 'laub', '--collect']);
      expect(q.status).toBe(0);
      expect(q.stdout).toMatch(/laub\.a: still queued \(queued\)/);
      expect(q.stdout).toMatch(/laub\.b: still queued \(running\)/);
      expect(readState('submitted.json')).toBeUndefined();
    });

    it('fails a line on a text_sha256, WAV sha or engine mismatch (manifest untouched)', () => {
      state('results.json', {
        'laub.a': okRec('laub.a', { text_sha256: textSha256('Guten Tag.') }), // the display text, not the spoken one
        'laub.b': okRec('laub.b', { sha256: '0'.repeat(64) }),
      });
      const r = gen(['--speakers', 'laub', '--collect']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/laub\.a: text_sha256/);
      expect(r.stderr).toMatch(/laub\.b: WAV sha256 [0-9a-f]{64} != recorded 0{64}/);
      expect(manifest().lines).toEqual({});
      state('results.json', { 'laub.a': okRec('laub.a', { engine: { ...SVC_ENGINE, warmup: 'v0' } }) });
      const e = gen(['--ids', 'laub.a', '--collect']);
      expect(e.status).toBe(1);
      expect(e.stderr).toMatch(/laub\.a: engine .*"warmup":"v0"/);
      expect(manifest().lines).toEqual({});
    });

    it('collect of a line never submitted says so', () => {
      const r = gen(['--ids', 'laub.a', '--collect']);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/laub\.a: not submitted yet/);
    });

    it('default mode resubmits a line whose result is for an older text', () => {
      state('results.json', { 'laub.a': okRec('laub.a', { text_sha256: textSha256('old text') }) });
      const r = gen(['--ids', 'laub.a']);
      expect(r.status, r.stderr).toBe(0);
      expect((readState('submitted.json') as ServiceJob[]).map((j) => j.id)).toEqual(['laub.a']);
    });
  });
});
