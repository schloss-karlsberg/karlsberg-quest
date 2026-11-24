/** Track a short press that never moved far enough to be a drag. */
export class PointerTap {
  readonly id: number;
  private readonly x: number;
  private readonly y: number;
  private readonly start: number;

  constructor(e: PointerEvent) {
    this.id = e.pointerId;
    this.x = e.clientX;
    this.y = e.clientY;
    this.start = e.timeStamp;
  }

  withinSlop(e: PointerEvent): boolean {
    return Math.hypot(e.clientX - this.x, e.clientY - this.y) <= 10;
  }

  completes(e: PointerEvent): boolean {
    return e.type === 'pointerup' && e.timeStamp - this.start <= 450 && this.withinSlop(e);
  }
}
