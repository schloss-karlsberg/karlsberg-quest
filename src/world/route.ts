/**
 * Way-finding over the walkable ground: A* on a 2 m grid around start and goal, with a caller's
 * `blocked(x, z)` (footprints, set-dressing solids, interior walls, water). Used by the travel
 * system's Wegweiser so that a hint walks round a wing or through a door instead of pointing
 * through a wall (playtest round 2). Pure (no three.js); tests/route.test.ts.
 */

export interface RouteOptions {
  /** Grid cell (m). */
  cell?: number;
  /** Margin around the start/goal box (m). */
  margin?: number;
  /** Largest box side (m); longer trips route towards the goal and stop at the box edge. */
  maxSide?: number;
  /** Give up after this many expanded cells (falls back to the straight line). */
  maxExpand?: number;
}

export interface RouteResult {
  /** Waypoints from start to (goal or the furthest reachable point towards it), simplified. */
  points: [number, number][];
  /** True when the goal itself was reached by the search. */
  complete: boolean;
  /** True when no search was needed (straight line is free). */
  straight: boolean;
}

/** Is the straight segment free (sampled every `step` m)? */
export function lineFree(ax: number, az: number, bx: number, bz: number, blocked: (x: number, z: number) => boolean, step = 1): boolean {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(L / step));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

/** A route from (sx, sz) to (gx, gz). */
export function findRoute(sx: number, sz: number, gx: number, gz: number, blocked: (x: number, z: number) => boolean, opts: RouteOptions = {}): RouteResult {
  const cell = opts.cell ?? 2;
  const margin = opts.margin ?? 40;
  const maxSide = opts.maxSide ?? 420;
  const maxExpand = opts.maxExpand ?? 60000;
  if (lineFree(sx, sz, gx, gz, blocked)) return { points: [[sx, sz], [gx, gz]], complete: true, straight: true };
  // a far goal: aim for the point on the line at the box limit
  let tx = gx;
  let tz = gz;
  const D = Math.hypot(gx - sx, gz - sz);
  const reach = maxSide - 2 * margin;
  let partial = false;
  if (D > reach) {
    tx = sx + ((gx - sx) / D) * reach;
    tz = sz + ((gz - sz) / D) * reach;
    partial = true;
  }
  const x0 = Math.min(sx, tx) - margin;
  const z0 = Math.min(sz, tz) - margin;
  const W = Math.ceil((Math.max(sx, tx) + margin - x0) / cell) + 1;
  const H = Math.ceil((Math.max(sz, tz) + margin - z0) / cell) + 1;
  const N = W * H;
  const cx = (i: number) => x0 + (i % W) * cell;
  const cz = (i: number) => z0 + Math.floor(i / W) * cell;
  const idx = (x: number, z: number) => Math.round((z - z0) / cell) * W + Math.round((x - x0) / cell);
  // 0 unknown, 1 free, 2 blocked
  const walk = new Uint8Array(N);
  const isFree = (i: number): boolean => {
    let w = walk[i]!;
    if (w === 0) {
      w = blocked(cx(i), cz(i)) ? 2 : 1;
      walk[i] = w;
    }
    return w === 1;
  };
  // the midpoint of every move is tested too (half-cell grid, cached): a thin wall between two
  // free cells (an interior wall, a fence) must not be jumped — playtest round 2 found the
  // Wegweiser leading into the corner of the east wing because a 2 m step crossed a wall
  const W2 = 2 * W - 1;
  const half = new Uint8Array(W2 * (2 * H - 1));
  const midFree = (a: number, b: number): boolean => {
    const k = (Math.floor(a / W) + Math.floor(b / W)) * W2 + (a % W) + (b % W);
    let w = half[k]!;
    if (w === 0) {
      w = blocked((cx(a) + cx(b)) / 2, (cz(a) + cz(b)) / 2) ? 2 : 1;
      half[k] = w;
    }
    return w === 1;
  };
  const start = idx(sx, sz);
  let goal = idx(tx, tz);
  let moved = false;
  // a goal inside something (a building's centre, a prop): accept the nearest free cell round it
  if (!isFree(goal)) {
    let best = -1;
    let bd = Infinity;
    const gi = goal % W;
    const gj = Math.floor(goal / W);
    for (let r = 1; r < 14 && best < 0; r++) {
      for (let j = gj - r; j <= gj + r; j++) {
        for (let i = gi - r; i <= gi + r; i++) {
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          if (Math.max(Math.abs(i - gi), Math.abs(j - gj)) !== r) continue;
          const k = j * W + i;
          if (!isFree(k)) continue;
          const d = Math.hypot(i - gi, j - gj);
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
      }
    }
    if (best >= 0) {
      goal = best;
      moved = true;
    }
  }
  const g = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  // binary heap of [f, i]
  const heapF: number[] = [];
  const heapI: number[] = [];
  const push = (f: number, i: number) => {
    heapF.push(f);
    heapI.push(i);
    let k = heapF.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapF[p]! <= heapF[k]!) break;
      [heapF[p], heapF[k]] = [heapF[k]!, heapF[p]!];
      [heapI[p], heapI[k]] = [heapI[k]!, heapI[p]!];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heapI[0]!;
    const lf = heapF.pop()!;
    const li = heapI.pop()!;
    if (heapF.length) {
      heapF[0] = lf;
      heapI[0] = li;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heapF.length && heapF[l]! < heapF[m]!) m = l;
        if (r < heapF.length && heapF[r]! < heapF[m]!) m = r;
        if (m === k) break;
        [heapF[m], heapF[k]] = [heapF[k]!, heapF[m]!];
        [heapI[m], heapI[k]] = [heapI[k]!, heapI[m]!];
        k = m;
      }
    }
    return top;
  };
  const gi = goal % W;
  const gj = Math.floor(goal / W);
  const h = (i: number) => {
    const dx = Math.abs((i % W) - gi);
    const dz = Math.abs(Math.floor(i / W) - gj);
    return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * cell;
  };
  walk[start] = 1;
  g[start] = 0;
  push(h(start), start);
  let best = start;
  let bestH = h(start);
  let expanded = 0;
  let found = false;
  const DIRS = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.4142],
    [1, -1, 1.4142],
    [-1, 1, 1.4142],
    [-1, -1, 1.4142],
  ] as const;
  while (heapF.length) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) {
      found = true;
      break;
    }
    const hc = h(cur);
    if (hc < bestH) {
      bestH = hc;
      best = cur;
    }
    if (++expanded > maxExpand) break;
    const ci = cur % W;
    const cj = Math.floor(cur / W);
    for (const [di, dj, c] of DIRS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni;
      if (closed[n] || !isFree(n)) continue;
      // no corner cutting
      if (di && dj && (!isFree(cj * W + ni) || !isFree(nj * W + ci))) continue;
      if (!midFree(cur, n)) continue;
      const ng = g[cur]! + c * cell;
      if (ng < g[n]!) {
        g[n] = ng;
        from[n] = cur;
        push(ng + h(n), n);
      }
    }
  }
  const end = found ? goal : best;
  if (end === start) return { points: [[sx, sz], [gx, gz]], complete: false, straight: true };
  const cells: number[] = [];
  for (let i = end; i >= 0; i = from[i]!) {
    cells.push(i);
    if (i === start) break;
  }
  cells.reverse();
  const raw: [number, number][] = cells.map((i) => [cx(i), cz(i)]);
  raw[0] = [sx, sz];
  if (found && !partial && !moved) raw.push([gx, gz]);
  return { points: simplify(raw, blocked), complete: found && !partial, straight: false };
}

/** Drop waypoints whose neighbours see each other (string pulling). */
export function simplify(pts: [number, number][], blocked: (x: number, z: number) => boolean): [number, number][] {
  if (pts.length <= 2) return pts;
  const out: [number, number][] = [pts[0]!];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineFree(pts[i]![0], pts[i]![1], pts[j]![0], pts[j]![1], blocked, 0.3)) j--;
    out.push(pts[j]!);
    i = j;
  }
  return out;
}

/** Total length of a polyline. */
export function pathLength(pts: readonly [number, number][]): number {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  return L;
}
