/**
 * What may be committed under public/voice/ (owner, 2026-11-20): synthetic MOSS clips only, each voice
 * credited in public/assets/LICENSES.json `voices`; never ElevenLabs output, never a real person's voice.
 * The real folder is checked first (passes when empty or absent); the failure cases run on temp-dir
 * fixtures with tiny fake files, so no audio is ever committed for the tests.
 *
 * Size thresholds (scripts/voice/assetRules.ts): warn above VOICE_SIZE_WARN_MB (60 MB) of voice files,
 * fail above VOICE_SIZE_FAIL_MB (80 MB).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  VOICE_SIZE_FAIL_MB,
  VOICE_SIZE_WARN_MB,
  checkVoiceAssets,
  isCommittableVoiceDir,
  nonCommittableGuard,
  parseMossVoiceId,
} from '../scripts/voice/assetRules.ts';
import type { LicencesFile, VoiceCredit } from '../src/assets/types';

const REPO = resolve(__dirname, '..');
const VOICE_DIR = join(REPO, 'public/voice');
const licences = JSON.parse(readFileSync(join(REPO, 'public/assets/LICENSES.json'), 'utf8')) as LicencesFile;
const credits: VoiceCredit[] = licences.voices ?? [];

const tmpRoots: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'kq-voice-assets-'));
  tmpRoots.push(d);
  return d;
};
afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

const laub = () => credits.find((c) => c.speaker === 'laub')!;
const laubId = () => `moss:laub:${laub().referenceSha256.slice(0, 8)}:${laub().seed}`;

function entry(over: Record<string, unknown> = {}, id = 'laub.hello') {
  return {
    files: { opus: `${id}.aaaaaaaa.webm`, aac: `${id}.bbbbbbbb.m4a` },
    textHash: '00000000',
    speechHash: '00000000',
    speaker: 'laub',
    provider: 'moss',
    voiceId: laubId(),
    model: 'MOSS-TTS-v1.5@cdd3b91',
    licence: 'apache-2.0-model',
    date: '2026-11-20T00:00:00.000Z',
    chars: 10,
    credits: 0,
    durationMs: 900,
    attribution: 'MOSS-TTS-v1.5, OpenMOSS, Apache-2.0',
    ...over,
  };
}

/** A fixture voice folder: manifest + one tiny fake file per referenced clip (unless listed in `skip`). */
function fixture(lines: Record<string, Record<string, unknown>>, o: { skip?: string[]; extra?: string[] } = {}): string {
  const d = tmp();
  writeFileSync(join(d, 'manifest.json'), JSON.stringify({ version: 1, lines }));
  for (const e of Object.values(lines)) {
    const fs = e.files as { opus: string; aac: string };
    for (const f of [fs.opus, fs.aac]) if (!o.skip?.includes(f)) writeFileSync(join(d, f), 'x');
  }
  for (const f of o.extra ?? []) writeFileSync(join(d, f), 'x');
  return d;
}
const errs = (d: string) => checkVoiceAssets(d, credits).errors.join('\n');

describe('voice credits in LICENSES.json', () => {
  it('lists Laub and Marlene as synthetic MOSS voices with CC0 output', () => {
    expect(credits.map((c) => c.speaker).sort()).toEqual(['laub', 'marlene']);
    for (const c of credits) {
      expect(c).toMatchObject({ provider: 'moss', tool: 'MOSS-TTS-v1.5 (OpenMOSS)', toolLicence: 'Apache-2.0', outputLicence: 'CC0-1.0', generatedLocally: true, note: 'synthetic voice, no real person' });
      expect(c.referenceSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(laub().seed).toBe(102);
    expect(credits.find((c) => c.speaker === 'marlene')!.seed).toBe(205);
  });

  it('matches the seeds in scripts/voice/voices.json for every credited moss speaker', () => {
    const voices = JSON.parse(readFileSync(join(REPO, 'scripts/voice/voices.json'), 'utf8')) as { speakers: Record<string, { provider?: string; seed?: number }> };
    for (const c of credits) expect(voices.speakers[c.speaker]?.seed, c.speaker).toBe(c.seed);
  });
});

describe('public/voice (the committed folder)', () => {
  it('holds only credited synthetic MOSS clips (passes when there is no manifest and no clip)', () => {
    const r = checkVoiceAssets(VOICE_DIR, credits);
    expect(r.errors).toEqual([]);
    for (const w of r.warnings) console.warn(`voice assets: ${w}`);
  });
});

describe('checkVoiceAssets (fixtures)', () => {
  it('passes a missing folder, an empty folder and a good moss manifest', () => {
    expect(checkVoiceAssets(join(tmp(), 'nope'), credits).errors).toEqual([]);
    expect(checkVoiceAssets(tmp(), credits).errors).toEqual([]);
    const ok = checkVoiceAssets(fixture({ 'laub.hello': entry() }), credits);
    expect(ok.errors).toEqual([]);
    expect(ok.totalBytes).toBe(2);
  });

  it('fails ElevenLabs output, unknown licences and non-moss providers', () => {
    expect(errs(fixture({ 'laub.hello': entry({ licence: 'elevenlabs-free-noncommercial' }) }))).toMatch(/ElevenLabs output/);
    expect(errs(fixture({ 'laub.hello': entry({ licence: 'elevenlabs-paid' }) }))).toMatch(/ElevenLabs output/);
    expect(errs(fixture({ 'laub.hello': entry({ licence: 'cc-by-4.0' }) }))).toMatch(/licence "cc-by-4.0" is not allowed/);
    expect(errs(fixture({ 'laub.hello': entry({ licence: undefined }) }))).toMatch(/licence "undefined" is not allowed/);
    expect(errs(fixture({ 'laub.hello': entry({ provider: 'elevenlabs' }) }))).toMatch(/provider "elevenlabs" is not committable/);
    expect(errs(fixture({ 'laub.hello': entry({ provider: 'hf-space' }) }))).toMatch(/provider "hf-space" is not committable/);
  });

  it('fails speakers without a credit and voiceIds whose seed or reference differ from it', () => {
    expect(errs(fixture({ 'x.hi': entry({ speaker: 'zoe', voiceId: 'moss:zoe:12345678:1' }, 'x.hi') }))).toMatch(/speaker "zoe" has no voice credit/);
    expect(errs(fixture({ 'laub.hello': entry({ voiceId: laubId().replace(/:102$/, ':103') }) }))).toMatch(/seed 103 != credited seed 102/);
    expect(errs(fixture({ 'laub.hello': entry({ voiceId: 'moss:laub:deadbeef:102' }) }))).toMatch(/reference deadbeef != credited reference 537c2310/);
    expect(errs(fixture({ 'laub.hello': entry({ voiceId: 'nPczCjzI2devNBz1zQrb' }) }))).toMatch(/is not moss:<speaker>:<sha8>:<seed>/);
    expect(errs(fixture({ 'laub.hello': entry({ voiceId: laubId().replace('laub', 'marlene') }) }))).toMatch(/voiceId speaker marlene != laub/);
  });

  it('fails clips the manifest does not reference and referenced clips that are missing', () => {
    expect(errs(fixture({ 'laub.hello': entry() }, { extra: ['stray.cccccccc.webm'] }))).toMatch(/stray.cccccccc.webm: audio file not referenced/);
    expect(errs(fixture({ 'laub.hello': entry() }, { skip: ['laub.hello.bbbbbbbb.m4a'] }))).toMatch(/file laub.hello.bbbbbbbb.m4a is missing/);
    const noManifest = tmp();
    writeFileSync(join(noManifest, 'orphan.aaaaaaaa.webm'), 'x');
    expect(errs(noManifest)).toMatch(/orphan.aaaaaaaa.webm: audio file not referenced/);
  });

  it('fails "private" / "TEST-synthetic" names, any .wav, and stray non-clip files', () => {
    const priv = entry({ files: { opus: 'laub-private.aaaaaaaa.webm', aac: 'laub-private.bbbbbbbb.m4a' } });
    expect(errs(fixture({ 'laub.hello': priv }))).toMatch(/laub-private.aaaaaaaa.webm: file names with "private"/);
    const test = entry({ files: { opus: 'TEST-synthetic-laub.aaaaaaaa.webm', aac: 'laub.hello.bbbbbbbb.m4a' } });
    expect(errs(fixture({ 'laub.hello': test }))).toMatch(/TEST-synthetic-laub.aaaaaaaa.webm: file names with/);
    const wav = entry({ files: { opus: 'laub.hello.aaaaaaaa.wav', aac: 'laub.hello.bbbbbbbb.m4a' } });
    expect(errs(fixture({ 'laub.hello': wav }))).toMatch(/laub.hello.aaaaaaaa.wav: no .wav in public\/voice/);
    expect(errs(fixture({}, { extra: ['ref.wav'] }))).toMatch(/ref.wav: no .wav/);
    expect(errs(fixture({}, { extra: ['notes.txt'] }))).toMatch(/notes.txt: unexpected file/);
  });

  it('ignores pipeline scratch (.tmp/, *.part) that is gitignored', () => {
    const d = fixture({ 'laub.hello': entry() });
    mkdirSync(join(d, '.tmp'));
    writeFileSync(join(d, '.tmp', 'laub.hello.wav'), 'x');
    writeFileSync(join(d, 'laub.hello.webm.part'), 'x');
    expect(checkVoiceAssets(d, credits).errors).toEqual([]);
  });

  it('fails a broken manifest and file names with paths', () => {
    const d = tmp();
    writeFileSync(join(d, 'manifest.json'), '{nope');
    expect(errs(d)).toMatch(/not valid JSON/);
    writeFileSync(join(d, 'manifest.json'), JSON.stringify({ version: 2, lines: {} }));
    expect(errs(d)).toMatch(/not a version-1 voice manifest/);
    expect(errs(fixture({ 'laub.hello': entry({ files: { opus: '../x.webm', aac: 'laub.hello.bbbbbbbb.m4a' } }) }, { skip: ['../x.webm'] }))).toMatch(/must be a plain name/);
  });

  it(`warns above ${VOICE_SIZE_WARN_MB} MB and fails above ${VOICE_SIZE_FAIL_MB} MB of voice files (sparse fake files)`, () => {
    const big = (mb: number) => {
      const d = fixture({ 'laub.hello': entry() });
      truncateSync(join(d, 'laub.hello.aaaaaaaa.webm'), Math.round(mb * 1e6));
      return checkVoiceAssets(d, credits);
    };
    const under = big(VOICE_SIZE_WARN_MB - 1);
    expect([under.errors, under.warnings]).toEqual([[], []]);
    const warn = big(VOICE_SIZE_WARN_MB + 1);
    expect(warn.errors).toEqual([]);
    expect(warn.warnings.join('\n')).toMatch(/over the 60 MB warning line/);
    expect(big(VOICE_SIZE_FAIL_MB + 1).errors.join('\n')).toMatch(/over the 80 MB limit/);
  });

  it('parses moss voice ids', () => {
    expect(parseMossVoiceId('moss:laub:537c2310:102')).toEqual({ speaker: 'laub', sha8: '537c2310', seed: 102 });
    expect(parseMossVoiceId('moss:laub:537c231:102')).toBeNull();
    expect(parseMossVoiceId('XrExE9yKIg1WjnnlVkGX')).toBeNull();
  });
});

describe('pipeline guard: non-moss clips never land in public/voice', () => {
  it('nonCommittableGuard refuses elevenlabs / hf-space into public/voice unless allowed', () => {
    const base = { repo: REPO, allow: false };
    expect(nonCommittableGuard({ ...base, out: VOICE_DIR, providers: ['moss'] })).toBeNull();
    expect(nonCommittableGuard({ ...base, out: VOICE_DIR, providers: [] })).toBeNull();
    expect(nonCommittableGuard({ ...base, out: VOICE_DIR, providers: ['moss', 'elevenlabs'] })).toMatch(/refusing to write elevenlabs clips into public\/voice/);
    expect(nonCommittableGuard({ ...base, out: join(VOICE_DIR, 'sub'), providers: ['hf-space'] })).toMatch(/refusing to write hf-space clips/);
    expect(nonCommittableGuard({ ...base, out: `${VOICE_DIR}/../voice/`, providers: ['elevenlabs'] })).toMatch(/refusing/);
    expect(nonCommittableGuard({ ...base, out: VOICE_DIR, providers: ['elevenlabs'], allow: true })).toBeNull();
    expect(nonCommittableGuard({ ...base, out: tmp(), providers: ['elevenlabs'] })).toBeNull();
    expect(nonCommittableGuard({ ...base, out: join(REPO, 'public/voice-scratch'), providers: ['elevenlabs'] })).toBeNull();
  });

  it('isCommittableVoiceDir only matches public/voice and below', () => {
    expect(isCommittableVoiceDir(VOICE_DIR, REPO)).toBe(true);
    expect(isCommittableVoiceDir(join(VOICE_DIR, 'a/b'), REPO)).toBe(true);
    expect(isCommittableVoiceDir(join(REPO, 'public'), REPO)).toBe(false);
    expect(isCommittableVoiceDir(join(REPO, 'public/voicex'), REPO)).toBe(false);
  });

  describe('generate.mjs (real process, no key, no network)', () => {
    const dir = tmp();
    const voicesFile = join(dir, 'voices.json');
    writeFileSync(
      voicesFile,
      JSON.stringify({
        providers: { elevenlabs: { defaultModel: 'eleven_flash_v2_5', licence: 'elevenlabs-free-noncommercial' } },
        speakers: { laub: { provider: 'elevenlabs', voiceId: 'fakeVoiceIdForTests', model: null } },
      }),
    );
    const run = (...extra: string[]) =>
      spawnSync(process.execPath, [join(REPO, 'scripts/voice/generate.mjs'), '--voices', voicesFile, '--env', join(dir, 'none.env'), '--offline', '--speakers', 'laub', '--limit', '1', ...extra], {
        cwd: REPO,
        encoding: 'utf8',
        env: { ...process.env, ELEVENLABS_API_KEY: '', HF_TOKEN: '' },
      });
    const existedBefore = existsSync(VOICE_DIR);

    it('refuses an elevenlabs run into the default public/voice', () => {
      const r = run();
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/refusing to write elevenlabs clips into public\/voice/);
      expect(r.stderr).toMatch(/--allow-noncommittable/);
      expect(existsSync(VOICE_DIR)).toBe(existedBefore);
    });

    it('lets the same run past the guard with --out elsewhere or --allow-noncommittable (then stops at the missing key)', () => {
      for (const r of [run('--out', join(dir, 'out')), run('--allow-noncommittable')]) {
        expect(r.status).toBe(1);
        expect(r.stderr).not.toMatch(/refusing/);
        expect(r.stderr).toMatch(/ELEVENLABS_API_KEY/);
      }
      expect(existsSync(join(dir, 'out'))).toBe(false);
      expect(existsSync(VOICE_DIR)).toBe(existedBefore);
    });

    it('refuses --keep-raw inside public/voice (raw WAVs stay out of the committed folder)', () => {
      const r = run('--out', join(dir, 'out'), '--keep-raw', join(VOICE_DIR, 'raw'));
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/--keep-raw must point outside public\/voice/);
      expect(existsSync(VOICE_DIR)).toBe(existedBefore);
    });

    it('a dry run only warns', () => {
      const r = run('--dry-run');
      expect(r.status).toBe(0);
      expect(r.stderr).toMatch(/WARNING \(a real run would stop here\): refusing/);
    });
  });
});
