/** Small seeded PRNG (mulberry32). The pack simulation draws ALL its randomness from here. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** 0 ≤ x < 1 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer 0 ≤ i < n */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)]!;
  }

  /** Internal state (lets tests compare two runs). */
  get state(): number {
    return this.s;
  }
}

/** Stable integer hash of a few numbers (seed derivation). */
export function hashSeed(...v: number[]): number {
  let h = 2166136261;
  for (const x of v) {
    h ^= Math.round(x * 1000) | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
