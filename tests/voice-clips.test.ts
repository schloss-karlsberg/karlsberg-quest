import { describe, expect, it, vi } from 'vitest';
import type { AudioManager } from '../src/audio/audio';
import { VoiceClips } from '../src/systems/story/dialogue/voiceClips';
import { textHash } from '../src/systems/story/dialogue/voiceManifest';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Bytes a fake file returns; BAD bytes fail to decode (an Opus file this "browser" cannot read). */
const GOOD = 1200;
const BAD = 7;

function fakeAudio(): AudioManager {
  const ctx = {
    decodeAudioData: async (b: ArrayBuffer) => {
      if (b.byteLength === BAD) throw new Error('EncodingError');
      return { duration: b.byteLength / 1000 } as unknown as AudioBuffer;
    },
  };
  return { onUnlock: (fn: (c: AudioContext) => void) => fn(ctx as unknown as AudioContext) } as unknown as AudioManager;
}

const LINES: Record<string, string> = { a: 'Hallo', b: 'Grüß Gott, Herr Laub.', c: 'Dritte Zeile', d: 'Vierte Zeile', e: 'Fünfte Zeile' };
const manifest = {
  version: 1,
  lines: Object.fromEntries(
    Object.entries(LINES).map(([id, t]) => [id, { files: { opus: `${id}.${textHash(t)}.webm`, aac: `${id}.${textHash(t)}.m4a` }, textHash: textHash(t), durationMs: 1200 }]),
  ),
};

function server(opts: { manifest?: unknown; status?: number; gate?: boolean; body?: (url: string) => number | null } = {}) {
  let open = 0;
  let peak = 0;
  const urls: string[] = [];
  const release: (() => void)[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    urls.push(u);
    if (u.endsWith('manifest.json')) {
      if (opts.status) return new Response('nope', { status: opts.status });
      return new Response(JSON.stringify(opts.manifest ?? manifest));
    }
    open++;
    peak = Math.max(peak, open);
    if (opts.gate !== false) await new Promise<void>((r) => release.push(r));
    open--;
    const n = opts.body ? opts.body(u) : GOOD;
    if (n === null) return new Response('missing', { status: 404 });
    return new Response(new ArrayBuffer(n));
  }) as unknown as typeof fetch;
  return { fetchFn, urls, release, peak: () => peak };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await flush();
}

describe('VoiceClips', () => {
  it('a missing manifest means no voices and one debug line', async () => {
    const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = server({ status: 404 });
    const c = new VoiceClips(fakeAudio(), './', s.fetchFn, true);
    c.init();
    await flush();
    c.preload([{ id: 'a' }]);
    expect(c.stats().manifest).toBe('none');
    expect(c.take('a', 'Hallo')).toBeNull();
    expect(dbg).toHaveBeenCalledTimes(1);
    expect(err).not.toHaveBeenCalled();
    dbg.mockRestore();
    err.mockRestore();
  });

  it('an invalid manifest is no manifest', async () => {
    const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const c = new VoiceClips(fakeAudio(), './', server({ manifest: { version: 9 } }).fetchFn, true);
    c.init();
    await flush();
    expect(c.stats().manifest).toBe('none');
    dbg.mockRestore();
  });

  it('preloads with bounded concurrency, then serves decoded clips', async () => {
    const s = server();
    const c = new VoiceClips(fakeAudio(), '/base/', s.fetchFn, true);
    // requested before the manifest arrived: kept and loaded after
    c.preload(Object.keys(LINES).map((id) => ({ id, text: LINES[id] })));
    await flush();
    expect(c.stats().manifest).toBe('ok');
    expect(c.stats().loading).toBe(3);
    expect(c.stats().queued).toBe(2);
    expect(s.urls).toContain(`/base/voice/a.${textHash('Hallo')}.webm`);
    // not decoded yet: no clip, never waits
    expect(c.take('a', 'Hallo')).toBeNull();
    for (let i = 0; i < 10 && s.release.length; i++) {
      for (const r of s.release.splice(0)) r();
      await settle();
    }
    expect(s.peak()).toBeLessThanOrEqual(3);
    expect(c.stats().cached).toBe(5);
    expect(c.stats().lastFormat).toBe('opus');
    const clip = c.take('a', 'Hallo');
    expect(clip?.id).toBe('a');
    expect(clip?.seconds).toBeCloseTo(1.2);
  });

  it('a stale text gets no clip and is counted', async () => {
    const s = server();
    const c = new VoiceClips(fakeAudio(), './', s.fetchFn, true);
    c.preload([
      { id: 'a', text: 'Hallo' },
      { id: 'b', text: 'geändert' },
    ]);
    await flush();
    // the stale one is not even fetched
    expect(c.stats().loading).toBe(1);
    for (const r of s.release.splice(0)) r();
    await settle();
    expect(c.take('a', 'Hallo, Welt')).toBeNull();
    expect(c.stats().stale).toBe(1);
    expect(c.take('a', ' Hallo ')).not.toBeNull();
  });

  it('without Opus support it loads AAC only', async () => {
    const s = server({ gate: false });
    const c = new VoiceClips(fakeAudio(), './', s.fetchFn, false);
    c.preload([{ id: 'a' }]);
    await settle();
    expect(s.urls.filter((u) => !u.endsWith('manifest.json'))).toEqual([`./voice/a.${textHash('Hallo')}.m4a`]);
    expect(c.stats().lastFormat).toBe('aac');
    expect(c.take('a', 'Hallo')).not.toBeNull();
  });

  it('an Opus decode failure retries once as AAC, then goes straight to AAC', async () => {
    const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const s = server({ gate: false, body: (u) => (u.endsWith('.webm') ? BAD : GOOD) });
    const c = new VoiceClips(fakeAudio(), './', s.fetchFn, true);
    c.preload([{ id: 'a' }]);
    await settle();
    const clips = () => s.urls.filter((u) => !u.endsWith('manifest.json')).map((u) => u.split('/').pop()!.replace(/^(\w)\.\w+\./, '$1.'));
    expect(clips()).toEqual(['a.webm', 'a.m4a']);
    expect(c.take('a', 'Hallo')).not.toBeNull();
    expect(c.stats().opus).toBe(false);
    expect(c.stats().lastFormat).toBe('aac');
    // later clips skip Opus
    c.preload([{ id: 'b' }]);
    await settle();
    expect(clips()).toEqual(['a.webm', 'a.m4a', 'b.m4a']);
    expect(dbg).not.toHaveBeenCalled();
    dbg.mockRestore();
  });

  it('when every file fails the line murmurs (and the clip is not retried)', async () => {
    const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const s = server({ gate: false, body: (u) => (u.endsWith('.webm') ? BAD : null) });
    const c = new VoiceClips(fakeAudio(), './', s.fetchFn, true);
    c.preload([{ id: 'a' }]);
    await settle();
    expect(c.stats().failed).toBe(1);
    expect(c.take('a', 'Hallo')).toBeNull();
    await settle();
    expect(s.urls.filter((u) => !u.endsWith('manifest.json'))).toHaveLength(2);
    expect(dbg).toHaveBeenCalledTimes(1);
    dbg.mockRestore();
  });

  it('accepts the legacy single-file shape', async () => {
    const legacy = { version: 1, lines: { a: { file: `a.${textHash('Hallo')}.mp3`, textHash: textHash('Hallo') } } };
    const s = server({ gate: false, manifest: legacy });
    const c = new VoiceClips(fakeAudio(), './', s.fetchFn, true);
    c.preload([{ id: 'a' }]);
    await settle();
    expect(c.stats().lastFormat).toBe('legacy');
    expect(c.take('a', 'Hallo')).not.toBeNull();
  });
});
