import { Scene, Vector3 } from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DialogueLine } from '../src/content/types';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { EchoDirector } from '../src/systems/chronik/echo';
import { stageEcho } from '../src/systems/chronik/staging';
import type { ChronikClue } from '../src/systems/chronik/types';
import { GhostFigure } from '../src/systems/chronik/world/ghosts';

// The echo director routes every figure through the twin hook (npc/twins.ts twinEcho). Until the
// authored twin models land the hook returns null: Mannlich and the Duke stay smoke silhouettes,
// and a seated mark still lowers the figure by the seat height.

const fakeEl = (): unknown => ({ className: '', textContent: '', classList: { add() {}, remove() {}, toggle() {} }, append() {}, remove() {} });
let savedDoc: unknown;
beforeAll(() => {
  savedDoc = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { createElement: fakeEl };
});
afterAll(() => {
  (globalThis as { document?: unknown }).document = savedDoc;
});

function fakeCtx(scene: Scene): GameContext {
  return {
    scene,
    player: { position: new Vector3(0, 2, 0), yaw: 0 },
    era: { info: { night: false }, current: '1789' },
    world: { heightAt: () => 0 },
    post: { uniforms: { uDesaturate: { value: 0 } } },
    t: (k: string) => k,
    ui: { hud: { subtitle() {}, prompt() {} } },
    audio: { ctx: null, bus: () => null, createSource3D: () => null, noise: () => null },
    events: new EventBus(),
    content: { speakers: new Map() },
    settings: { state: { reducedMotion: false, reducedFlash: false } },
  } as unknown as GameContext;
}

const line = (id: string, speaker: string, text: string, clue: string): DialogueLine => ({ id, speaker, text_de: text, trigger: { event: 'echo:start', id: clue } }) as unknown as DialogueLine;

const clue = (id: string, x: number, z: number): ChronikClue => ({ id, title_de: id, kind: 'echo', where: { x, z, radius: 3 } }) as unknown as ChronikClue;

function stage(scene: Scene) {
  return scene.getObjectByName('chronik-echo')!.children.filter((c) => c.type === 'Group');
}

describe('echo director: the twin hook is a no-op until the twin models land', () => {
  it('Mannlich (k1 Bauliste) is drawn as the smoke silhouette', () => {
    const scene = new Scene();
    const lines = { 'test.k1.mannlich': [line('m.1', 'mannlich', 'Ich hatte also einen Stall zu bauen.', 'test.k1.mannlich')] };
    const d = new EchoDirector(fakeCtx(scene), (id) => lines[id as keyof typeof lines] ?? [], fakeEl() as HTMLElement, () => {});
    d.start(clue('test.k1.mannlich', 0, -6));
    const figs = (d as unknown as { figures: { ghost: unknown }[] }).figures;
    expect(figs).toHaveLength(1);
    expect(figs[0]!.ghost).toBeInstanceOf(GhostFigure);
    d.update(0.5);
    expect(stage(scene)).toHaveLength(1);
  });

  it('the seated Duke (k2 Kabinett mark) stays smoke and sits 0.42 m below the storey floor', () => {
    const scene = new Scene();
    const id = 'test.k2.warnung';
    stageEcho(id, { atClue: true, marks: { herzog: { x: 1, z: -4, sit: true, face: { x: 0, z: -3 } }, schuegens: { x: 0, z: -3, face: { x: 1, z: -4 } } } });
    const lines: Record<string, DialogueLine[]> = { [id]: [line('h.1', 'herzog', 'Unglaubwürdig.', id), line('s.1', 'schuegens', 'Durchlaucht, die Franzosen.', id)] };
    const d = new EchoDirector(fakeCtx(scene), (k) => lines[k] ?? [], fakeEl() as HTMLElement, () => {});
    d.start(clue(id, 0, -4));
    const figs = (d as unknown as { figures: { ghost: GhostFigure; mark?: { sit?: boolean } }[] }).figures;
    expect(figs.map((f) => f.ghost instanceof GhostFigure)).toEqual([true, true]);
    d.update(0.5);
    const duke = figs.find((f) => f.mark?.sit)!;
    // the player's storey is y = 2 (fake); marks stand on it, the seated one 0.42 lower
    expect(duke.ghost.object.position.y).toBeCloseTo(2 - 0.42, 5);
    expect(figs.find((f) => !f.mark?.sit)!.ghost.object.position.y).toBeCloseTo(2, 5);
  });
});

describe('echo lifecycle', () => {
  it.each(['finish', 'skip', 'abort'] as const)('%s releases the scene and reports whether the memory was heard', (mode) => {
    const scene = new Scene();
    const ctx = fakeCtx(scene);
    const id = 'test.echo.lifecycle';
    const memory = clue(id, 0, -6);
    const heard: unknown[] = [];
    const ends: unknown[] = [];
    ctx.events.on('echo:end', (event) => ends.push(event));
    ctx.post.uniforms.uDesaturate!.value = 0.1;
    const d = new EchoDirector(
      ctx,
      () => [line('test.echo.line', 'hanne', 'Ein Satz.', id)],
      fakeEl() as HTMLElement,
      (completed, transcript) => heard.push({ id: completed.id, transcript }),
    );
    d.start(memory);
    expect(d.clue).toBe(memory);
    d.update(0.5);
    expect(ctx.post.uniforms.uDesaturate!.value).toBeGreaterThan(0.1);
    expect(ends).toEqual([]);
    if (mode === 'finish') d.update(d.progress.total);
    else if (mode === 'skip') d.skip();
    else d.finish(true);
    expect(d.clue).toBeNull();
    expect(ctx.post.uniforms.uDesaturate!.value).toBe(0.1);
    expect(scene.getObjectByName('chronik-echo')).toBeUndefined();
    d.dispose();
    expect(ends).toEqual([mode === 'abort' ? { id, aborted: true } : { id }]);
    expect(heard).toEqual(mode === 'abort' ? [] : [{ id, transcript: [{ speaker: 'hanne', text: 'Ein Satz.' }] }]);
  });
});
