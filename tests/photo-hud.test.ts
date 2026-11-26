import { expect, it, vi } from 'vitest';
import { showViewfinder } from '../src/systems/photo';

it('switches the shared HUD-hidden state and both phone controls on entry and exit', () => {
  const root = { toggleAttribute: vi.fn() };
  const frame = { classList: { toggle: vi.fn() } as unknown as DOMTokenList };
  const zoom = { classList: { toggle: vi.fn() } as unknown as DOMTokenList };

  showViewfinder(true, root, frame, zoom);
  showViewfinder(false, root, frame, zoom);

  expect(root.toggleAttribute.mock.calls).toEqual([['data-kq-photo', true], ['data-kq-photo', false]]);
  for (const el of [frame, zoom]) {
    expect(el.classList.toggle).toHaveBeenNthCalledWith(1, 'kq-hidden', false);
    expect(el.classList.toggle).toHaveBeenNthCalledWith(2, 'kq-hidden', true);
  }
});
