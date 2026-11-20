import { describe, expect, it } from 'vitest';
import {
  COSTUME_IDS,
  COURT_COSTUME,
  costumeColours,
  costumeEmissive,
  costumeHides,
  FLAME_DEFAULT,
  LANTERN_DEFAULT,
  lanternColours,
  mixHex,
  partOf,
  resolveCostume,
  resolveTint,
  slotHex,
  staffOnBack,
  SURVEYOR_COSTUME,
} from '../src/player/costume';

/** Hue (degrees) and saturation (0..1) of an sRGB hex. */
function hs(hex: number): { h: number; s: number; v: number } {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: mx > 0 ? d / mx : 0, v: mx };
}

/** A loud safety orange: orange hue, strongly saturated, bright. */
const hiVis = (hex: number) => {
  const c = hs(hex);
  return c.h >= 10 && c.h <= 45 && c.s > 0.6 && c.v > 0.6;
};

describe('player costume tables', () => {
  it('resolves unknown input to the surveyor', () => {
    expect(resolveCostume('court')).toBe('court');
    expect(resolveCostume('default')).toBe('default');
    expect(resolveCostume('ballgown')).toBe('default');
    expect(resolveCostume(undefined)).toBe('default');
    expect(resolveCostume(3)).toBe('default');
    expect(COSTUME_IDS).toEqual(['default', 'court']);
  });

  it('the surveyor keeps the hi-vis vest and the backpack', () => {
    expect(costumeColours('default')).toBe(SURVEYOR_COSTUME);
    expect(hiVis(slotHex(SURVEYOR_COSTUME, 'Body', 'LightGreen')!)).toBe(true);
    expect(costumeHides('default', 'Backpack')).toBe(false);
    expect(staffOnBack('default')).toBe(true);
  });

  it('the court disguise has no hi-vis colour and no emissive anywhere', () => {
    expect(costumeColours('court')).toBe(COURT_COSTUME);
    for (const [slot, hex] of Object.entries(COURT_COSTUME)) expect(hiVis(hex), `${slot} ${hex.toString(16)}`).toBe(false);
    expect(Object.values(costumeEmissive('court')).every((e) => e === 0)).toBe(true);
  });

  it('the court disguise hides the backpack and the staff on the back', () => {
    for (const n of ['Backpack', 'Backpack_1', 'Backpack_3']) expect(costumeHides('court', n)).toBe(true);
    for (const n of ['Adventurer_Body', 'Adventurer_Head_2', 'Adventurer_Feet_1']) expect(costumeHides('court', n)).toBe(false);
    expect(staffOnBack('court')).toBe(false);
  });

  it('the court coat is dark blue, the waistcoat cream, the breeches black', () => {
    const coat = hs(COURT_COSTUME.Green!);
    expect(coat.h).toBeGreaterThan(200);
    expect(coat.h).toBeLessThan(250);
    expect(coat.v).toBeLessThan(0.35);
    const vest = hs(COURT_COSTUME.LightGreen!);
    expect(vest.v).toBeGreaterThan(0.8);
    expect(vest.s).toBeLessThan(0.25);
    expect(hs(COURT_COSTUME.Brown!).v).toBeLessThan(0.15);
  });

  it('a part-prefixed slot wins over the bare slot', () => {
    const t = { LightGreen: 1, 'Backpack.LightGreen': 2 };
    expect(slotHex(t, 'Backpack', 'LightGreen')).toBe(2);
    expect(slotHex(t, 'Body', 'LightGreen')).toBe(1);
    expect(slotHex(t, 'Body', 'Nope')).toBeNull();
    expect(partOf('Adventurer_Body_2')).toBe('Body');
    expect(partOf('Backpack_1')).toBe('Backpack');
    expect(partOf('avatar-glasses')).toBe('');
  });
});

describe('lantern tint', () => {
  it('null is the warm default', () => {
    expect(lanternColours(null)).toEqual({ glow: LANTERN_DEFAULT, flame: FLAME_DEFAULT });
    expect(LANTERN_DEFAULT).toBe(0xffa64a);
  });

  it('a tint colours the glass and lifts the flame towards white', () => {
    const { glow, flame } = lanternColours(0x6fd36a);
    expect(glow).toBe(0x6fd36a);
    expect(hs(flame).h).toBeCloseTo(hs(0x6fd36a).h, -1);
    expect(hs(flame).s).toBeLessThan(hs(0x6fd36a).s);
    expect(hs(flame).v).toBeGreaterThanOrEqual(hs(0x6fd36a).v);
  });

  it('rejects junk tints', () => {
    expect(resolveTint(-1)).toBeNull();
    expect(resolveTint(0x1000000)).toBeNull();
    expect(resolveTint(Number.NaN)).toBeNull();
    expect(resolveTint('red')).toBeNull();
    expect(resolveTint(0x00ff00)).toBe(0x00ff00);
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
});
