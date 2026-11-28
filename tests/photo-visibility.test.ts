/** Photo mode, the pixel test of a shot (src/systems/photo/visibility.ts, TASK-080). */
import { Color, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, type WebGLRenderTarget, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEEN_CLEAR, SEEN_MIN, type ShotResult, type TargetJudgement, type Verdict, VERDICT_DE } from '../src/systems/photo/core';
import { MAX_SUBJECTS, SEEN, ShotVisibility, TIP_DE, TIP_PARTLY_DE, countIds, liveSubjects, registerSubject, seenFrom, shotTip } from '../src/systems/photo/visibility';

/** An RGBA8 buffer with `counts[i]` pixels of subject i and `empty` cleared pixels. */
function buffer(counts: number[], empty = 5): Uint8Array {
  const px: number[] = [];
  counts.forEach((n, i) => {
    for (let k = 0; k < n; k++) px.push((i + 1) * SEEN.step, 255, 0, 255);
  });
  for (let k = 0; k < empty; k++) px.push(0, 0, 0, 0);
  return Uint8Array.from(px);
}

describe('photo visibility: counting', () => {
  it('counts the pixels of each subject and skips the cleared ones', () => {
    expect(countIds(buffer([7, 0, 3]), 3)).toEqual([7, 0, 3]);
    expect(countIds(buffer([4]), 2)).toEqual([4, 0]);
    expect(countIds(new Uint8Array(0), 2)).toEqual([0, 0]);
  });

  it('ignores an index outside the subjects of this shot and reads a slightly off red', () => {
    const px = Uint8Array.from([SEEN.step * 9, 255, 0, 255, SEEN.step + 2, 255, 0, 255, SEEN.step - 3, 255, 0, 255]);
    expect(countIds(px, 2)).toEqual([2, 0]);
    expect(MAX_SUBJECTS).toBeGreaterThanOrEqual(8);
  });

  it('turns whole and visible pixels into a share; a silhouette too small to tell is not measured', () => {
    expect(seenFrom(200, 50, 10_000)).toEqual({ share: 0.25, area: 0.005 });
    expect(seenFrom(200, 260, 10_000)!.share).toBe(1);
    expect(seenFrom(SEEN.minPx - 1, 10, 10_000)).toBeUndefined();
    expect(seenFrom(0, 0, 10_000)).toBeUndefined();
  });
});

const detail = (o: Partial<TargetJudgement>): TargetJudgement => ({ id: 'reh.ricke', inFrame: true, good: false, stars: 1, verdict: 'verdeckt', dist: 12, ndcX: 0, ndcY: 0, frac: 0.08, clear: 0, fallback: false, ...o });
const shot = (verdict: Verdict, details: TargetJudgement[], stars = 1): ShotResult => {
  const good = details.filter((d) => d.good).map((d) => d.id);
  return { era: 'today', signal: true, targets: details.filter((d) => d.inFrame).map((d) => d.id), good, stars: good.length ? stars : details.some((d) => d.inFrame) ? 1 : 0, verdict, verdict_de: VERDICT_DE[verdict], details };
};
const range = (id: string) => (id.startsWith('reh') ? 32 : 25);

describe('photo visibility: the tip under a weak shot', () => {
  it('every reason a target can miss has a German sentence', () => {
    for (const v of ['verdeckt', 'zu-klein', 'zu-weit', 'zu-nah', 'nicht-mittig', 'unscharf', 'aufgeschreckt', 'nicht-alle'] as const) {
      expect(TIP_DE[v], v).toMatch(/^[A-ZÄÖÜ].+\.$/);
      expect(shotTip(shot(v, [detail({ verdict: v })]), range)).toBe(TIP_DE[v]);
    }
  });

  it('hidden deer: says that something stands in front', () => {
    const r = shot('verdeckt', [detail({ seen: 0.1 }), detail({ id: 'reh.kitz', seen: 0 })]);
    expect(shotTip(r, range)).toBe('Etwas steht davor. Such dir eine freie Sicht.');
  });

  it('„Nicht alle im Bild“ is explained by what the partner missed', () => {
    const r = shot('nicht-alle', [detail({ verdict: 'nicht-alle' }), detail({ id: 'reh.kitz', verdict: 'verdeckt', seen: 0.2 })]);
    expect(shotTip(r, range)).toBe(TIP_DE.verdeckt);
    const framing = shot('nicht-alle', [detail({ verdict: 'nicht-alle' }), detail({ id: 'reh.kitz', verdict: 'nicht-mittig' })]);
    expect(shotTip(framing, range)).toBe(TIP_DE['nicht-mittig']);
  });

  it('a board far beyond its range in the background earns no advice', () => {
    const far = detail({ id: 'photo.parkplatz', verdict: 'zu-weit', dist: 190 });
    expect(shotTip(shot('zu-weit', [far]), range)).toBeNull();
    // the deer a little out of range do: the player is trying
    expect(shotTip(shot('zu-weit', [far, detail({ verdict: 'zu-weit', dist: 36 })]), range)).toBe(TIP_DE['zu-weit']);
  });

  it('a good shot says nothing, unless cover alone cost the third star', () => {
    const clear = detail({ good: true, stars: 3, verdict: 'perfekt', seen: 0.95 });
    expect(shotTip(shot('perfekt', [clear], 3), range)).toBeNull();
    const partly = detail({ good: true, stars: 2, verdict: 'gut', seen: (SEEN_MIN + SEEN_CLEAR) / 2 });
    expect(shotTip(shot('gut', [partly], 2), range)).toBe(TIP_PARTLY_DE);
    const farButClear = detail({ good: true, stars: 2, verdict: 'gut', seen: 0.9, dist: 24 });
    expect(shotTip(shot('gut', [farButClear], 2), range)).toBeNull();
  });

  it('nothing in the frame, or no signal: no tip', () => {
    expect(shotTip(shot('leer', [detail({ inFrame: false, stars: 0, verdict: 'leer' })]), range)).toBeNull();
    expect(shotTip({ ...shot('kein-netz', []), signal: false }, range)).toBeNull();
  });
});

describe('photo visibility: subjects', () => {
  const offs: (() => void)[] = [];
  afterEach(() => {
    for (const off of offs.splice(0)) off();
  });

  it('lists a body only while it is in the scene and drawn; the newest getter wins', () => {
    const scene = new Scene();
    const herd = new Group();
    const doe = new Group();
    herd.add(doe);
    offs.push(registerSubject('reh.ricke', () => doe));
    expect(liveSubjects(scene)).toEqual([]);
    scene.add(herd);
    expect(liveSubjects(scene)).toEqual([{ id: 'reh.ricke', object: doe }]);
    herd.visible = false;
    expect(liveSubjects(scene)).toEqual([]);
    herd.visible = true;
    const other = new Group();
    scene.add(other);
    const off = registerSubject('reh.ricke', () => other);
    expect(liveSubjects(scene)).toEqual([{ id: 'reh.ricke', object: other }]);
    off();
    off();
    expect(liveSubjects(scene)).toEqual([{ id: 'reh.ricke', object: doe }]);
  });
});

interface Pass {
  /** Red (of 255) of every mesh the camera's layers let through. */
  ids: number[];
  hidden: number;
  background: unknown;
  layer: number;
  autoClear: boolean;
}

/** A renderer that records what each pass would draw and answers the read-backs from a script. */
function fakeRenderer(reads: Uint8Array[], failAt = -1) {
  const passes: Pass[] = [];
  let target: WebGLRenderTarget | null = null;
  const r = {
    autoClear: true,
    clears: 0,
    getRenderTarget: () => target,
    setRenderTarget: (t: WebGLRenderTarget | null) => void (target = t),
    getClearAlpha: () => 1,
    getClearColor: (c: Color) => c.set(0x112233),
    setClearColor: vi.fn(),
    clear: () => void r.clears++,
    render(scene: Scene, camera: PerspectiveCamera) {
      if (passes.length === failAt) throw new Error('context lost');
      const ids: number[] = [];
      let hidden = 0;
      scene.traverse((o) => {
        if (!o.visible) hidden++;
        const m = o as Mesh;
        if (m.isMesh && camera.layers.test(m.layers) && o.parent?.visible !== false) ids.push(Math.round((m.material as MeshBasicMaterial).color.r * 255));
      });
      passes.push({ ids, hidden, background: scene.background, layer: camera.layers.mask, autoClear: r.autoClear });
    },
    readRenderTargetPixels: (_t: unknown, _x: number, _y: number, _w: number, _h: number, out: Uint8Array) => {
      out.fill(0);
      out.set(reads.shift()!);
    },
  };
  return { r: r as unknown as WebGLRenderer & { clears: number }, passes };
}

describe('photo visibility: the three passes', () => {
  const offs: (() => void)[] = [];
  afterEach(() => {
    for (const off of offs.splice(0)) off();
  });

  function stage() {
    const scene = new Scene();
    scene.background = new Color(0x335577);
    const camera = new PerspectiveCamera(60, 16 / 9);
    const coat = new MeshBasicMaterial({ color: 0x777777 });
    const fern = new Mesh(undefined, new MeshBasicMaterial({ color: 0xff0000 }));
    const doe = new Group().add(new Mesh(undefined, coat), new Mesh(undefined, coat));
    const fawn = new Group().add(new Mesh(undefined, coat));
    scene.add(fern, doe, fawn);
    offs.push(registerSubject('reh.ricke', () => doe), registerSubject('reh.kitz', () => fawn));
    return { scene, camera, coat, fern, doe, fawn };
  }

  it('whole silhouettes, the scene without the subjects, then the subjects against its depth', () => {
    const { scene, camera, coat, fern, doe, fawn } = stage();
    const { r, passes } = fakeRenderer([buffer([400, 300]), buffer([80, 300])]);
    const vis = new ShotVisibility();
    const seen = vis.measure(r, scene, camera)!;
    expect(seen.get('reh.ricke')!.share).toBeCloseTo(0.2);
    expect(seen.get('reh.kitz')!.share).toBe(1);
    expect(vis.runs).toBe(1);
    const one = SEEN.step;
    expect(passes).toHaveLength(3);
    // 1 and 3: only the subjects, in their id colours, on the private layer, without the sky
    for (const p of [passes[0]!, passes[2]!]) {
      expect(p.ids).toEqual([one, one, one * 2]);
      expect(p.background).toBeNull();
      expect(p.layer).toBe(1 << SEEN.layer);
    }
    // 2: everything else as it is drawn (the fern), the two subjects hidden
    expect(passes[1]).toMatchObject({ ids: [255], hidden: 2, layer: 1, autoClear: true });
    expect((passes[1]!.background as Color).getHex()).toBe(0x335577);
    expect(passes[2]!.autoClear).toBe(false);
    expect(r.clears).toBe(1);
    // nothing is left changed
    expect([...doe.children, ...fawn.children].every((m) => (m as Mesh).material === coat && m.layers.mask === 1)).toBe(true);
    expect([doe.visible, fawn.visible, fern.visible]).toEqual([true, true, true]);
    expect(camera.layers.mask).toBe(1);
    expect((scene.background as Color).getHex()).toBe(0x335577);
    expect(r.autoClear).toBe(true);
    expect(r.getRenderTarget()).toBeNull();
    vis.dispose();
  });

  it('draws nothing when no subject is in the world', () => {
    const scene = new Scene();
    const { r, passes } = fakeRenderer([]);
    expect(new ShotVisibility().measure(r, scene, new PerspectiveCamera())).toBeNull();
    expect(passes).toEqual([]);
  });

  it('a failing pass gives no measurement and still restores the scene', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { scene, camera, coat, doe, fawn } = stage();
    for (const failAt of [0, 1, 2]) {
      const { r } = fakeRenderer([buffer([400, 300]), buffer([80, 300])], failAt);
      expect(new ShotVisibility().measure(r, scene, camera)).toBeNull();
      expect([...doe.children, ...fawn.children].every((m) => (m as Mesh).material === coat && m.layers.mask === 1)).toBe(true);
      expect([doe.visible, fawn.visible, camera.layers.mask, r.autoClear]).toEqual([true, true, 1, true]);
      expect(scene.background).not.toBeNull();
    }
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('a silhouette of a few pixels is left to the geometric rules', () => {
    const { scene, camera } = stage();
    const { r } = fakeRenderer([buffer([SEEN.minPx - 4, 300]), buffer([2, 150])]);
    const seen = new ShotVisibility().measure(r, scene, camera)!;
    expect(seen.has('reh.ricke')).toBe(false);
    expect(seen.get('reh.kitz')!.share).toBe(0.5);
  });
});
