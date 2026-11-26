import { mulberry32 } from '../src/systems/progression/logic';

export function seeded(seed: number) {
  const fraction = mulberry32(seed);
  const int = (min: number, max: number) => min + Math.floor(fraction() * (max - min + 1));
  return {
    fraction,
    int,
    bool: () => fraction() < 0.5,
    pick: <T>(values: readonly T[]): T => values[int(0, values.length - 1)]!,
    subset: <T>(values: readonly T[]): T[] => values.filter(() => fraction() < 0.5),
  };
}

export type Seeded = ReturnType<typeof seeded>;
