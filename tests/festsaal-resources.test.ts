import { Scene, Sprite, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { createInitialState, GameStateStore } from '../src/core/state';
import { FESTSAAL_FLAG, FestsaalObjects, type FestsaalSpot } from '../src/systems/interiors/festsaal';
import { disposalCounts } from './disposal-counts';

function setup() {
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
    }),
  });
  const scene = new Scene();
  const state = new GameStateStore(createInitialState());
  const prompt = vi.fn();
  const ctx = {
    scene, state, player: { position: new Vector3(), yaw: 0 },
    input: { wasPressed: () => false }, ui: { hud: { prompt } },
  } as unknown as GameContext;
  return { scene, state, prompt, props: new FestsaalObjects(ctx) };
}

afterEach(() => vi.unstubAllGlobals());

it('releases Festsaal props on every re-entry or clear, and keeps one texture until teardown', () => {
  const { scene, state, prompt, props } = setup();
  const spots: FestsaalSpot[] = [
    { key: 'uhr', x: 0, y: 1.1, z: -1, yaw: 0 },
    { key: 'dukat', x: 5, y: 1.1, z: -1, yaw: 0 },
    { key: 'tuergriff', x: -5, y: 1.1, z: -1, yaw: 0 },
    { key: 'nichts', x: 5, y: 1.1, z: -5, yaw: 0 },
  ];
  const texture = disposalCounts();
  const batches: ReturnType<typeof disposalCounts>[] = [];
  const glints = () => props.group.children.filter((n) => n instanceof Sprite);
  props.show(spots);
  const map = glints()[0]!.material.map!;
  texture.watch(map);
  for (let i = 0; i < 4; i++) {
    const batch = disposalCounts();
    batch.watchTree(props.group);
    batches.push(batch);
    expect(props.active).toBe(true);
    expect(props.spots()).toEqual(spots);
    expect(glints().map((n) => n.material.map)).toEqual([map, map, map]);
    expect(scene.children).toEqual([props.group]);

    if (i === 0) {
      props.update();
      expect(state.state.flags['e.owner']).toBe('festsaal');
      expect(props.take('uhr')).toBe(true);
      expect(props.take('dukat')).toBe(false);
      expect(state.state.flags[FESTSAAL_FLAG]).toBe('uhr');
      expect(prompt).toHaveBeenLastCalledWith(null, undefined, 'festsaal');
      expect(state.state.flags['e.owner']).toBeUndefined();
    }
    if (i < 3) props.show(spots); // direct replacement goes through the same cleanup
    else props.clear();
    expect(texture.calls(map)).toBe(0);
  }
  expect(props.active).toBe(false);
  expect(props.group.children).toHaveLength(0);
  expect(state.state.flags[FESTSAAL_FLAG]).toBe('uhr');
  props.clear();
  props.dispose();
  expect(scene.children).toHaveLength(0);
  expect(texture.calls(map)).toBe(1);
  expect(batches.map((batch) => ({ live: batch.live(), repeated: batch.repeated() }))).toEqual(
    Array.from({ length: 4 }, () => ({ live: 0, repeated: [] })),
  );
});
