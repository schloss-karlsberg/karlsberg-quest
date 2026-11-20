import { describe, expect, it } from 'vitest';
import {
  Lru,
  clipForLine,
  clipSeconds,
  clipCandidates,
  clipUrl,
  entryKey,
  lookupClip,
  manifestUrl,
  normalizeLineText,
  opusPlayable,
  parseEntry,
  parseVoiceManifest,
  sayLineIds,
  textHash,
} from '../src/systems/story/dialogue/voiceManifest';
import { HALL_CHAIN, RADIO_CHAIN, RING_CHAIN } from '../src/systems/story/dialogue/voice';
import { contentFile, textHash as pipelineHash } from '../scripts/voice/lib';

const entry = (text: string, extra: Record<string, unknown> = {}) => {
  const h = textHash(text);
  return { files: { opus: `laub.a.${h}.webm`, aac: `laub.a.${h}.m4a` }, textHash: h, speaker: 'laub', durationMs: 5230, ...extra };
};

describe('voice manifest: text hash', () => {
  it('matches the shared test vectors', () => {
    expect(textHash('Hallo')).toBe('9f02b107');
    expect(textHash('  Grüß   Gott, Herr Laub. ')).toBe('003a186c');
  });

  it('normalises NFC and whitespace before hashing', () => {
    expect(normalizeLineText(' a \n\t b  ')).toBe('a b');
    // decomposed ü (u + combining diaeresis) hashes like the composed one
    expect(textHash('Grüß Gott')).toBe(textHash('Grüß Gott'));
    expect(textHash('Grüß\nGott')).toBe(textHash('Grüß Gott'));
    expect(textHash('')).toBe('811c9dc5');
    expect(textHash('Hallo')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('voice manifest: parse / validate', () => {
  it('accepts a valid manifest', () => {
    const m = parseVoiceManifest({
      version: 1,
      lines: { 'laub.a': entry('Hallo', { voiceId: 'v', model: 'm', date: '2026-11-20', chars: 5, credits: 5, provider: 'p', speechHash: 'deadbeef', licence: { name: 'x' } }) },
    });
    expect(m).not.toBeNull();
    expect(m!.lines['laub.a']!.files).toEqual({ opus: 'laub.a.9f02b107.webm', aac: 'laub.a.9f02b107.m4a' });
    expect(m!.lines['laub.a']!.textHash).toBe('9f02b107');
    expect(m!.lines['laub.a']!.durationMs).toBe(5230);
  });

  it('rejects anything that is not a version-1 manifest', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { version: 2, lines: {} }, { version: 1 }, { version: 1, lines: [] }, { version: '1', lines: {} }]) {
      expect(parseVoiceManifest(bad)).toBeNull();
    }
  });

  it('drops malformed entries and keeps the rest', () => {
    const m = parseVoiceManifest({
      version: 1,
      lines: {
        ok: entry('Hallo'),
        noFile: { textHash: '9f02b107' },
        badHash: { file: 'x.mp3', textHash: 'XYZ' },
        shortHash: { file: 'x.mp3', textHash: '9f02b10' },
        traversal: { file: '../secret.mp3', textHash: '9f02b107' },
        slash: { file: 'a/b.mp3', textHash: '9f02b107' },
        url: { file: 'https://evil/x.mp3', textHash: '9f02b107' },
        dot: { file: '.hidden.mp3', textHash: '9f02b107' },
        notAudio: { file: 'x.js', textHash: '9f02b107' },
        badFiles: { files: { opus: '../x.webm', aac: 'a/b.m4a' }, textHash: '9f02b107' },
        emptyFiles: { files: {}, textHash: '9f02b107' },
        notObj: 'x.mp3',
        // bad optional fields are dropped, the entry stays
        negDuration: { file: 'x.mp3', textHash: '9f02b107', durationMs: -1, speaker: 3 },
        aacOnly: { files: { aac: 'y.m4a', opus: 7 }, textHash: '9f02b107' },
      },
    });
    expect(Object.keys(m!.lines)).toEqual(['ok', 'negDuration', 'aacOnly']);
    expect(m!.lines.negDuration).toEqual({ files: { legacy: 'x.mp3' }, textHash: '9f02b107' });
    expect(m!.lines.aacOnly).toEqual({ files: { aac: 'y.m4a' }, textHash: '9f02b107' });
  });

  it('entries keep only known fields', () => {
    // unknown fields (e.g. the pipeline's optional speechHash) are ignored, not rejected
    const e = parseEntry({ file: 'a.9f02b107.mp3', textHash: '9f02b107', extra: 'x', speechHash: 'deadbeef' });
    expect(e).toEqual({ files: { legacy: 'a.9f02b107.mp3' }, textHash: '9f02b107' });
  });

  it('a line id like __proto__ cannot reach the prototype', () => {
    const m = parseVoiceManifest(JSON.parse('{"version":1,"lines":{"__proto__":{"file":"a.mp3","textHash":"9f02b107"}}}'));
    expect(lookupClip(m, 'toString', 'Andere Zeile').kind).toBe('none');
    expect(clipForLine(m, '__proto__', 'Hallo')?.files.legacy).toBe('a.mp3');
  });
});

describe('voice manifest: selection and stale detection', () => {
  const m = parseVoiceManifest({ version: 1, lines: { 'laub.a': entry('  Grüß   Gott, Herr Laub. ') } });

  it('selects the clip when the displayed text matches', () => {
    expect(clipForLine(m, 'laub.a', 'Grüß Gott, Herr Laub.')?.textHash).toBe('003a186c');
    expect(lookupClip(m, 'laub.a', 'Grüß Gott, Herr Laub.').kind).toBe('clip');
  });

  it('a changed text makes the recording stale', () => {
    expect(lookupClip(m, 'laub.a', 'Grüß Gott, Frau Laub.').kind).toBe('stale');
    expect(clipForLine(m, 'laub.a', 'Grüß Gott, Frau Laub.')).toBeNull();
  });

  it('no manifest, no id or an unknown id: no clip', () => {
    expect(lookupClip(null, 'laub.a', 'x').kind).toBe('none');
    expect(lookupClip(m, undefined, 'x').kind).toBe('none');
    expect(lookupClip(m, 'laub.b', 'x').kind).toBe('none');
  });

  it('templated lines match by the raw template hash (before {Name} substitution)', () => {
    const tpl = 'Na, {Name}, wieder da?';
    const mt = parseVoiceManifest({ version: 1, lines: { 'laub.t': { file: 'laub.t.x.mp3', textHash: textHash(tpl) } } });
    expect(lookupClip(mt, 'laub.t', [tpl, 'Na, Mara, wieder da?']).kind).toBe('clip');
    // the filled-in string alone does not match the template's hash
    expect(lookupClip(mt, 'laub.t', 'Na, Mara, wieder da?').kind).toBe('stale');
  });

  it('falls back to the text hash for id-less or unknown ids (quest lines, variants)', () => {
    const q = 'Bring mir drei Pilze vom Waldrand.';
    const mq = parseVoiceManifest({
      version: 1,
      lines: {
        'quest.q.k1.pilze.offer.1': { file: 'quest.q.k1.pilze.offer.1.x.mp3', textHash: textHash(q), speaker: 'laub' },
        'laub.joke.v2': { file: 'laub.joke.v2.x.mp3', textHash: textHash('Schon wieder?'), speaker: 'laub' },
        'marlene.ja': { file: 'marlene.ja.x.mp3', textHash: textHash('Ja.'), speaker: 'marlene' },
      },
    });
    expect(mq!.byHash.get(textHash(q))).toEqual(['quest.q.k1.pilze.offer.1']);
    const r = lookupClip(mq, undefined, q);
    expect(r.kind === 'clip' && r.id).toBe('quest.q.k1.pilze.offer.1');
    // an id the manifest does not know (the say action's own id of a variant) → by hash
    const v = lookupClip(mq, 'laub.joke', 'Schon  wieder?', 'laub');
    expect(v.kind === 'clip' && v.id).toBe('laub.joke.v2');
    // a hash match of another speaker's line is not taken
    expect(lookupClip(mq, undefined, 'Ja.', 'laub').kind).toBe('none');
    expect(lookupClip(mq, undefined, 'Ja.', 'sp.marlene').kind).toBe('clip');
    // an unknown text: nothing
    expect(lookupClip(mq, undefined, 'Etwas Neues.').kind).toBe('none');
    // a known id with a changed text stays stale (no hash fallback)
    expect(lookupClip(mq, 'marlene.ja', 'Bring mir drei Pilze vom Waldrand.').kind).toBe('stale');
  });

  it('builds URLs under the Vite base', () => {
    expect(manifestUrl('./')).toBe('./voice/manifest.json');
    expect(manifestUrl('/karlsberg-quest/')).toBe('/karlsberg-quest/voice/manifest.json');
    expect(clipUrl('./', 'laub.a.003a186c.webm')).toBe('./voice/laub.a.003a186c.webm');
  });

  it('paces to the decoded length when it differs from the manifest', () => {
    const e = { files: { legacy: 'a.mp3' }, textHash: '9f02b107', durationMs: 5230 };
    expect(clipSeconds(e)).toBeCloseTo(5.23);
    expect(clipSeconds(e, 5.25)).toBeCloseTo(5.23);
    expect(clipSeconds(e, 4.1)).toBeCloseTo(4.1);
    expect(clipSeconds({ files: { legacy: 'a.mp3' }, textHash: '9f02b107' }, 2)).toBe(2);
    expect(clipSeconds(null)).toBe(0);
  });
});

describe('voice manifest: format choice', () => {
  const both = { files: { opus: 'a.h.webm', aac: 'a.h.m4a' }, textHash: '9f02b107' };

  it('Opus only when canPlayType says "probably"', () => {
    expect(opusPlayable((t) => (t === 'audio/webm; codecs="opus"' ? 'probably' : ''))).toBe(true);
    expect(opusPlayable(() => 'maybe')).toBe(false);
    expect(opusPlayable(() => '')).toBe(false);
    expect(opusPlayable(null)).toBe(false);
    expect(
      opusPlayable(() => {
        throw new Error('x');
      }),
    ).toBe(false);
  });

  it('tries Opus, then AAC; without Opus support AAC first', () => {
    expect(clipCandidates(both, { playable: true, broken: false }).map((c) => c.format)).toEqual(['opus', 'aac']);
    expect(clipCandidates(both, { playable: false, broken: false }).map((c) => c.format)).toEqual(['aac']);
  });

  it('after an Opus decode failure, clips go straight to AAC', () => {
    expect(clipCandidates(both, { playable: true, broken: true })).toEqual([{ format: 'aac', file: 'a.h.m4a' }]);
    expect(clipCandidates({ files: { opus: 'a.webm' }, textHash: '9f02b107' }, { playable: true, broken: true })).toEqual([]);
  });

  it('the legacy file comes last; an Opus-only entry still gets one try', () => {
    expect(clipCandidates({ files: { aac: 'a.m4a', legacy: 'a.mp3' }, textHash: '9f02b107' }, { playable: true, broken: false }).map((c) => c.file)).toEqual(['a.m4a', 'a.mp3']);
    expect(clipCandidates({ files: { opus: 'a.webm' }, textHash: '9f02b107' }, { playable: false, broken: false }).map((c) => c.format)).toEqual(['opus']);
  });

  it('the cache key is stable per entry', () => {
    expect(entryKey(both)).toBe('a.h.webm');
    expect(entryKey({ files: { aac: 'b.m4a' }, textHash: '9f02b107' })).toBe('b.m4a');
  });
});

describe('voice manifest: helpers', () => {
  it('LRU evicts the least recently used', () => {
    const l = new Lru<string, number>(2);
    l.set('a', 1);
    l.set('b', 2);
    expect(l.get('a')).toBe(1);
    l.set('c', 3);
    expect(l.has('b')).toBe(false);
    expect(l.has('a')).toBe(true);
    expect(l.size).toBe(2);
  });

  it('collects say ids of a beat in order', () => {
    const beat = {
      id: 'b1',
      enter: [{ do: 'say', id: 'laub.1', text: 'x' }, { do: 'wait', then: [{ do: 'say', line: 'dlg.2' }] }],
      reactions: [{ when: {}, then: [{ do: 'say', id: 'laub.1' }, { do: 'say', text: 'no id' }] }],
      exit: [{ do: 'say', id: 'laub.3' }],
    };
    expect(sayLineIds(beat)).toEqual(['laub.1', 'dlg.2', 'laub.3']);
    const jokes = { enter: [{ do: 'say', id: 'laub.joke', variants: ['a', 'b'] }, { do: 'say', id: 'laub.era', text_by_era: { '1789': 'x', today: 'y' } }] };
    expect(sayLineIds(jokes)).toEqual(['laub.joke', 'laub.joke.v1', 'laub.joke.v2', 'laub.era', 'laub.era.era-1789', 'laub.era.era-today']);
  });

  it('runtime and pipeline hashes agree (scripts/voice/lib.ts)', () => {
    const samples = ['Hallo', '  Grüß   Gott, Herr Laub. ', 'Na, {Name}, wieder da?', 'Grüße\n\taus {jahre:1793}…', '', '„Zurück. Jetzt.“ – ÄÖÜ ß €'];
    expect(pipelineHash('Hallo')).toBe('9f02b107');
    expect(pipelineHash('  Grüß   Gott, Herr Laub. ')).toBe('003a186c');
    for (const s of samples) expect(pipelineHash(s)).toBe(textHash(s));
  });

  it('pipeline file names pass runtime validation', () => {
    const opus = contentFile('quest.q.k1.pilze.offer.0', 'a1b2c3d4e5f6', 'webm');
    const aac = contentFile('quest.q.k1.pilze.offer.0', 'a1b2c3d4e5f6', 'm4a');
    const e = parseEntry({ files: { opus, aac }, textHash: textHash('x'), speechHash: textHash('y'), provider: 'elevenlabs', licence: 'pending' });
    expect(e?.files).toEqual({ opus, aac });
  });

  it('clip chains match the casting render', () => {
    const R = RADIO_CHAIN.clip;
    expect([R.highpassHz, R.lowpassHz, R.edgeQ, R.edgeStages]).toEqual([300, 3400, 0.707, 2]);
    expect([R.presenceHz, R.presenceQ, R.presenceDb, R.driveDb, R.trimDb]).toEqual([1700, 0.9, 4, 6, -6]);
    expect(R.hiss).toEqual({ amplitude: 0.006, bandHz: 1800, bandQ: 0.5 });
    expect(R.crackle).toEqual({ perS: 9, amplitude: 0.25, bandHz: 3200, bandQ: 0.7 });
    const L = RING_CHAIN.clip;
    expect([L.highpassHz, L.highpassQ, L.dry]).toEqual([110, 0.707, 1]);
    expect(L.comb).toEqual({ bandHz: 1250, bandQ: 1.6, delayS: 0.0016, feedback: 0.62, gain: 0.5 });
    expect(L.slap).toEqual({ lowpassHz: 3000, delayS: 0.023, gain: 0.18 });
    expect([L.presenceHz, L.presenceQ, L.presenceDb]).toEqual([2500, 1, 2]);
    // stable feedback loops
    expect(L.comb.feedback).toBeLessThan(1);
    expect(RING_CHAIN.blip.combFeedback).toBeLessThan(0.7);
    expect(HALL_CHAIN.feedback).toBeLessThan(0.6);
  });
});
