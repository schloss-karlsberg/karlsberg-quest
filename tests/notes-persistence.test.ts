import { expect, it, vi } from 'vitest';
import { STUCK_SECONDS, Telemetry, normaliseTelemetry } from '../src/systems/notes/logic';
import { MemoryStore, openNoteStore } from '../src/systems/notes/store';

const situation = { x: 2, z: 7, era: '1789', quest: 'test', objective: 'gate', play: 0, at: '2026-11-26T10:00:00Z' };

it('keeps detached note snapshots and telemetry in memory when IndexedDB is unavailable', async () => {
  vi.stubGlobal('indexedDB', undefined);
  try {
    const store = await openNoteStore();
    expect(store.kind).toBe('memory');
    const note = { text: 'Tor', pos: { x: 1 } };
    const first = await store.add(note);
    note.pos.x = 9;
    const second = await store.add(note);
    expect(second).toBeGreaterThan(first);
    const notes = await store.all<typeof note>();
    expect(notes.map(n => [n.id, n.pos.x])).toEqual([[first, 1], [second, 9]]);
    notes[0]!.pos.x = 4;
    expect((await store.all<typeof note>())[0]?.pos.x).toBe(1);
    const meta = { open: ['q1'] };
    await store.setMeta('telemetry', meta);
    meta.open.length = 0;
    expect(await store.getMeta('telemetry')).toEqual({ open: ['q1'] });
    await store.clear();
    expect(await store.all()).toEqual([]);
    expect(await store.getMeta('telemetry')).toBeUndefined();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('can flush and resume the stuck clock on either side of the threshold', async () => {
  const store = new MemoryStore();
  let tele = new Telemetry();
  async function flushAndReload() {
    // Same write condition as the notes system's periodic flush.
    if (tele.dirty) await store.setMeta('telemetry', tele.s);
    tele = new Telemetry(normaliseTelemetry(await store.getMeta('telemetry')));
  }

  tele.tick(STUCK_SECONDS - 1, situation, true);
  await flushAndReload();
  expect(tele.s.sinceProgress).toBe(STUCK_SECONDS - 1);
  expect(tele.tick(1, { ...situation, play: STUCK_SECONDS }, true)?.seconds).toBe(STUCK_SECONDS);
  await flushAndReload();
  tele.tick(7, { ...situation, play: STUCK_SECONDS + 7 }, true);
  await flushAndReload();
  expect(tele.openStuck()?.seconds).toBe(STUCK_SECONDS + 7);
  tele.progress();
  await flushAndReload();
  expect(tele.s.sinceProgress).toBe(0);
  expect(tele.s.stuck).toMatchObject([{ ended: true, seconds: STUCK_SECONDS + 7 }]);
});

it('persists objective progress even before there is a stuck episode to close', () => {
  const tele = new Telemetry(normaliseTelemetry({ sinceProgress: STUCK_SECONDS - 1 }));
  tele.progress();
  expect(tele.dirty).toBe(true);
  expect(tele.tick(1, situation, true)).toBeNull();
  expect(tele.s.sinceProgress).toBe(1);
});
