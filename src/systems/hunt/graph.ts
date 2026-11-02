/**
 * Path graph for the pack: the OSM walk graph (`ctx.data.paths`) as adjacency lists, plus
 * nearest-node queries and A*. Pure; the simulation and tests use it without three.js.
 */
export interface PathGraphLike {
  /** [x, y, z] triples (local frame). */
  nodes: ArrayLike<number>;
  /** [a, b, kind, length] quads. */
  edges: ArrayLike<number>;
}

export class PathGraph {
  /** x/z per node. */
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly adj: number[][];

  constructor(src: PathGraphLike) {
    const n = Math.floor(src.nodes.length / 3);
    this.xs = new Float64Array(n);
    this.zs = new Float64Array(n);
    this.adj = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      this.xs[i] = src.nodes[i * 3]!;
      this.zs[i] = src.nodes[i * 3 + 2]!;
    }
    for (let k = 0; k + 3 < src.edges.length; k += 4) {
      const a = src.edges[k]!;
      const b = src.edges[k + 1]!;
      if (a === b || a >= n || b >= n) continue;
      if (!this.adj[a]!.includes(b)) this.adj[a]!.push(b);
      if (!this.adj[b]!.includes(a)) this.adj[b]!.push(a);
    }
  }

  get size(): number {
    return this.xs.length;
  }

  dist(a: number, b: number): number {
    return Math.hypot(this.xs[a]! - this.xs[b]!, this.zs[a]! - this.zs[b]!);
  }

  /** Nearest node to x/z (optionally only nodes passing `ok`), or −1. */
  nearest(x: number, z: number, ok?: (i: number) => boolean, among?: readonly number[]): number {
    let best = -1;
    let bd = Infinity;
    const visit = (i: number) => {
      const d = (this.xs[i]! - x) ** 2 + (this.zs[i]! - z) ** 2;
      if (d < bd && (!ok || ok(i))) {
        bd = d;
        best = i;
      }
    };
    if (among) for (const i of among) visit(i);
    else for (let i = 0; i < this.xs.length; i++) visit(i);
    return best;
  }

  /** All nodes within r of x/z. */
  within(x: number, z: number, r: number): number[] {
    const out: number[] = [];
    const r2 = r * r;
    for (let i = 0; i < this.xs.length; i++) if ((this.xs[i]! - x) ** 2 + (this.zs[i]! - z) ** 2 <= r2) out.push(i);
    return out;
  }

  /** A* from a to b over nodes passing `ok`. Returns the node list (a … b) or null. */
  findPath(a: number, b: number, ok?: (i: number) => boolean, maxExpand = 5000): number[] | null {
    if (a < 0 || b < 0) return null;
    if (a === b) return [a];
    const g = new Map<number, number>([[a, 0]]);
    const came = new Map<number, number>();
    const open: { i: number; f: number }[] = [{ i: a, f: this.dist(a, b) }];
    const closed = new Set<number>();
    let expanded = 0;
    while (open.length && expanded < maxExpand) {
      // small open sets: linear min is fine and keeps the order deterministic
      let mi = 0;
      for (let k = 1; k < open.length; k++) if (open[k]!.f < open[mi]!.f) mi = k;
      const cur = open.splice(mi, 1)[0]!.i;
      if (cur === b) {
        const path = [b];
        let c = b;
        while (came.has(c)) {
          c = came.get(c)!;
          path.push(c);
        }
        return path.reverse();
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      expanded++;
      for (const nb of this.adj[cur]!) {
        if (closed.has(nb) || (ok && !ok(nb) && nb !== b)) continue;
        const ng = g.get(cur)! + this.dist(cur, nb);
        if (ng < (g.get(nb) ?? Infinity)) {
          g.set(nb, ng);
          came.set(nb, cur);
          open.push({ i: nb, f: ng + this.dist(nb, b) });
        }
      }
    }
    return null;
  }
}
