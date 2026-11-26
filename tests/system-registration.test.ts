import { expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { SystemRegistry } from '../src/core/systems';

it('keeps running systems usable when a late registration would introduce a cycle', async () => {
  const systems = new SystemRegistry();
  const ctx = {} as GameContext;
  const calls: string[] = [];
  systems.registerSystem({ id: 'consumer', after: ['provider'], dispose: () => calls.push('dispose consumer') });
  await systems.initAll(ctx);
  const init = vi.fn();
  await expect(systems.add({ id: 'provider', after: ['consumer'], init }, ctx)).rejects.toThrow(/cycle/);
  expect(init).not.toHaveBeenCalled();
  expect(systems.get('provider')).toBeUndefined();
  expect(systems.ids()).toEqual(['consumer']);

  await systems.add({ id: 'provider', init: () => { calls.push('init provider'); }, dispose: () => calls.push('dispose provider') }, ctx);
  expect(systems.ids()).toEqual(['provider', 'consumer']);
  systems.disposeAll();
  expect(calls).toEqual(['init provider', 'dispose consumer', 'dispose provider']);
});
