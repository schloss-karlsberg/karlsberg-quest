import { describe, expect, it } from 'vitest';
import { MODELS_DIST, interiorModelsView } from '../src/systems/interiors/index';

describe('interiors: the model groups only near or inside', () => {
  it('inside: drawn and casting shadows', () => {
    expect(interiorModelsView(true, 0, false)).toEqual({ visible: true, shadows: true });
    expect(interiorModelsView(true, 40, false)).toEqual({ visible: true, shadows: true });
  });

  it('near, outside: drawn, no shadows; far: hidden (with a 3 m hysteresis)', () => {
    expect(interiorModelsView(false, MODELS_DIST - 5, false)).toEqual({ visible: true, shadows: false });
    expect(interiorModelsView(false, MODELS_DIST + 1, false).visible).toBe(false);
    expect(interiorModelsView(false, MODELS_DIST + 1, true).visible).toBe(true);
    expect(interiorModelsView(false, MODELS_DIST + 4, true)).toEqual({ visible: false, shadows: false });
    expect(interiorModelsView(false, 60, false).visible).toBe(false);
  });
});
