/**
 * fx quality level. 'high' by default; `?fxq=low` forces low, and 'auto' drops to low when the
 * frame rate stays under ~40 fps for a few seconds (expensive parts: particle counts, heat
 * shimmer, halos, mist). Debug: `kq.fx.quality('low' | 'high' | 'auto')`.
 */
export type QualityLevel = 'low' | 'high';

export class Quality {
  level: QualityLevel = 'high';
  auto = true;
  private acc = 0;
  private frames = 0;
  private slow = 0;
  private readonly listeners = new Set<(q: QualityLevel) => void>();

  constructor(param: string | null) {
    if (param === 'low' || param === 'high') {
      this.level = param;
      this.auto = false;
    }
  }

  get high(): boolean {
    return this.level === 'high';
  }

  set(level: QualityLevel | 'auto'): void {
    if (level === 'auto') {
      this.auto = true;
      return;
    }
    this.auto = false;
    if (level !== this.level) {
      this.level = level;
      for (const fn of this.listeners) fn(level);
    }
  }

  onChange(fn: (q: QualityLevel) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Feed real frame times; returns true if the level changed. */
  sample(dt: number): boolean {
    if (!this.auto || this.level === 'low' || dt <= 0 || dt > 0.5) return false;
    this.acc += dt;
    this.frames++;
    if (this.acc < 1) return false;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    this.slow = fps < 40 ? this.slow + 1 : 0;
    if (this.slow >= 4) {
      this.level = 'low';
      for (const fn of this.listeners) fn('low');
      return true;
    }
    return false;
  }
}
