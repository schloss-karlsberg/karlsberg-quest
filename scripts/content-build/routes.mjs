// Route tool (tour WP-16): resolves a walkable route over the OSM path graph and writes
// content/routes/<id>.json for the npc walk system (docs/design/tour/systems.md §3).
//
//   node scripts/content-build/routes.mjs                 # every scripts/content-build/routes/*.spec.json
//   node scripts/content-build/routes.mjs p-fuehrung      # one spec by id (or a path to a spec file)
//   node scripts/content-build/routes.mjs --check         # resolve and report, write nothing
//
// Spec: { id, note?, stops: [{ id, x, z, ref?, offGraph?, glades? }], roadFactor?, maxStep?, minStep?, tolerance? }.
// Input: public/data/paths.json (kq-paths-v1: nodes = flat [x, y, z] triples, edges = flat
// [a, b, kind, length_m] quads, kinds = path / track / road). Each stop is projected onto its
// nearest graph edge (a virtual node splits the edge); consecutive stops are joined by the
// shortest walk (Dijkstra; road edges cost `roadFactor` × their length, so paths and tracks win
// when the detour is small). The polyline is simplified (Douglas-Peucker, stops pinned) and
// resampled to `minStep` ≤ step ≤ `maxStep`, rounded to 0.1 m.
// Output: { id, stops: [{ id, x, z, glades? }], points: [[x, z], ...] }; stops lie on the polyline, in order.
// A stop farther than SNAP_WARN m from the graph is reported (exit code 1), never silently snapped.
// The first or last stop may set `offGraph: true` (an open place such as a car park): it keeps its
// spec position and is joined to the graph by a straight spur, which the report lists.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const SPEC_DIR = `${ROOT}/scripts/content-build/routes`;
const OUT_DIR = `${ROOT}/content/routes`;
/** Playable extent (systems.md §3 validator). */
const EXTENT = { x0: 150, x1: 2300, z0: -2150, z1: 500 };
const SNAP_WARN = 15;
const STOP_ON_LINE = 3;
const WALK_SPEED = 1.6;

const r1 = (v) => Math.round(v * 10) / 10;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The path graph: node positions [x, z] and an adjacency list of { to, len, cost }. */
export function loadGraph(file = `${ROOT}/public/data/paths.json`, roadFactor = 1.25) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data.format !== 'kq-paths-v1') throw new Error(`${file}: expected kq-paths-v1, got ${data.format}`);
  const pos = [];
  for (let i = 0; i < data.nodes.length; i += 3) pos.push([data.nodes[i], data.nodes[i + 2]]);
  const road = data.kinds.indexOf('road');
  const edges = [];
  for (let i = 0; i < data.edges.length; i += 4) {
    const [a, b, kind, len] = data.edges.slice(i, i + 4);
    edges.push({ a, b, kind, len, factor: kind === road ? roadFactor : 1 });
  }
  return { pos, edges, kinds: data.kinds };
}

function segProject(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  const q = [a[0] + t * dx, a[1] + t * dz];
  return { t, q, d: dist(p, q) };
}

/** Nearest point on the graph to p: { edge, t, q, d } plus the nearest real node distance. */
function nearestOnGraph(g, p) {
  let best = null;
  g.edges.forEach((e, i) => {
    const r = segProject(p, g.pos[e.a], g.pos[e.b]);
    if (!best || r.d < best.d) best = { edge: i, ...r };
  });
  let nodeD = Infinity;
  for (const q of g.pos) nodeD = Math.min(nodeD, dist(p, q));
  return { ...best, nodeD };
}

/** Graph with the stops spliced in as virtual nodes; returns adjacency and the stop node ids. */
function splice(g, snaps) {
  const pos = g.pos.slice();
  const splits = new Map(); // edge index → [{ t, node }]
  const stopNodes = snaps.map((s) => {
    const list = splits.get(s.edge) ?? [];
    const same = list.find((v) => Math.abs(v.t - s.t) < 1e-9);
    if (same) return same.node;
    const node = pos.length;
    pos.push(s.q);
    list.push({ t: s.t, node });
    splits.set(s.edge, list);
    return node;
  });
  const adj = pos.map(() => []);
  const link = (a, b, len, factor) => {
    adj[a].push({ to: b, len, cost: len * factor });
    adj[b].push({ to: a, len, cost: len * factor });
  };
  g.edges.forEach((e, i) => {
    const list = splits.get(i);
    if (!list) return link(e.a, e.b, e.len, e.factor);
    // the edge's own length (along the OSM way) scaled by t; chain a → splits → b
    const chain = [{ t: 0, node: e.a }, ...list.sort((u, v) => u.t - v.t), { t: 1, node: e.b }];
    for (let k = 1; k < chain.length; k++) link(chain[k - 1].node, chain[k].node, (chain[k].t - chain[k - 1].t) * e.len, e.factor);
  });
  return { pos, adj, stopNodes };
}

function dijkstra(adj, from, to) {
  const n = adj.length;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  cost[from] = 0;
  // binary heap of [cost, node]
  const heap = [[0, from]];
  const push = (it) => {
    heap.push(it);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [c, u] = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === to) break;
    for (const { to: v, cost: w } of adj[u]) {
      if (c + w < cost[v]) {
        cost[v] = c + w;
        prev[v] = u;
        push([cost[v], v]);
      }
    }
  }
  if (!Number.isFinite(cost[to])) return null;
  const path = [];
  for (let v = to; v !== -1; v = prev[v]) path.push(v);
  return path.reverse();
}

/** Douglas-Peucker on an open polyline (first and last kept). */
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let md = -1, mk = -1;
    for (let k = i + 1; k < j; k++) {
      const d = segProject(pts[k], pts[i], pts[j]).d;
      if (d > md) (md = d), (mk = k);
    }
    if (md > tol) {
      keep[mk] = 1;
      stack.push([i, mk], [mk, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Resample one leg (fixed endpoints) so that minStep ≤ step ≤ maxStep. */
function resample(pts, minStep, maxStep) {
  // split long segments evenly
  const dense = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const n = Math.max(1, Math.ceil(dist(a, b) / maxStep));
    for (let s = 1; s <= n; s++) dense.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]);
  }
  // drop interior points closer than minStep to the last kept one (and to the leg's end)
  const end = dense[dense.length - 1];
  const out = [dense[0]];
  for (let k = 1; k < dense.length - 1; k++) {
    const p = dense[k];
    if (dist(p, out[out.length - 1]) < minStep || dist(p, end) < minStep) continue;
    out.push(p);
  }
  out.push(end);
  // dropping can leave a gap > maxStep: fill it again (no new short steps: gap > maxStep ≥ 2·minStep)
  const res = [out[0]];
  for (let k = 1; k < out.length; k++) {
    const a = out[k - 1], b = out[k];
    const n = Math.max(1, Math.ceil(dist(a, b) / maxStep));
    for (let s = 1; s <= n; s++) res.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]);
  }
  return res;
}

/** Arc length of q's projection onto the polyline (nearest segment), and the distance to it. */
export function project(points, q) {
  let best = { d: Infinity, s: 0 };
  let acc = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    const r = segProject(q, a, b);
    if (r.d < best.d - 1e-9) best = { d: r.d, s: acc + r.t * dist(a, b) };
    acc += dist(a, b);
  }
  return best;
}

export function buildRoute(spec, g) {
  const maxStep = spec.maxStep ?? 30;
  const minStep = spec.minStep ?? 3;
  const tol = spec.tolerance ?? 1;
  const problems = [];
  const last = spec.stops.length - 1;
  const snaps = spec.stops.map((st, i) => {
    const s = nearestOnGraph(g, [st.x, st.z]);
    if (st.offGraph && i !== 0 && i !== last) problems.push(`stop '${st.id}': offGraph is only allowed on the first or last stop`);
    if (s.d > SNAP_WARN && !st.offGraph) problems.push(`stop '${st.id}' (${st.x}, ${st.z}) is ${s.d.toFixed(1)} m from the path graph (> ${SNAP_WARN} m)`);
    return { ...s, stop: st };
  });
  const { pos, adj, stopNodes } = splice(g, snaps);
  // legs between consecutive stops, each simplified and resampled with its ends pinned
  const spur = (s) => (s.stop.offGraph && s.d > 0.05 ? [s.stop.x, s.stop.z] : null);
  const head = spur(snaps[0]);
  const tail = spur(snaps[last]);
  const points = head ? resample([head, pos[stopNodes[0]]], minStep, maxStep) : [pos[stopNodes[0]]];
  for (let i = 1; i < stopNodes.length; i++) {
    const path = dijkstra(adj, stopNodes[i - 1], stopNodes[i]);
    if (!path) throw new Error(`${spec.id}: no walkable path from '${spec.stops[i - 1].id}' to '${spec.stops[i].id}'`);
    const leg = path.map((n) => pos[n]).filter((p, k, a) => k === 0 || dist(p, a[k - 1]) > 1e-6);
    if (leg.length < 2) continue; // two stops on the same spot
    points.push(...resample(simplify(leg, tol), minStep, maxStep).slice(1));
  }
  if (tail) points.push(...resample([points[points.length - 1], tail], minStep, maxStep).slice(1));
  const rounded = points.map(([x, z]) => [r1(x), r1(z)]).filter((p, k, a) => k === 0 || p[0] !== a[k - 1][0] || p[1] !== a[k - 1][1]);
  const stops = snaps.map((s) => {
    const q = spur(s) ?? s.q;
    // a stop's glades (circles kept free of forest-floor props, src/systems/walk) pass through as written
    return { id: s.stop.id, x: r1(q[0]), z: r1(q[1]), ...(s.stop.glades ? { glades: s.stop.glades } : {}) };
  });
  // checks: stops on the line and in order, step lengths, extent
  let lastS = -1;
  const report = stops.map((st, i) => {
    const pr = project(rounded, [st.x, st.z]);
    if (pr.d > STOP_ON_LINE) problems.push(`stop '${st.id}' lies ${pr.d.toFixed(2)} m from the polyline (> ${STOP_ON_LINE} m)`);
    if (pr.s < lastS) problems.push(`stop '${st.id}' is out of route order (s ${pr.s.toFixed(1)} < ${lastS.toFixed(1)})`);
    lastS = pr.s;
    return { id: st.id, s: pr.s, offset: snaps[i].d, nodeD: snaps[i].nodeD, spur: !!spur(snaps[i]) };
  });
  let length = 0, minSeen = Infinity, maxSeen = 0;
  for (let k = 1; k < rounded.length; k++) {
    const d = dist(rounded[k - 1], rounded[k]);
    length += d;
    minSeen = Math.min(minSeen, d);
    maxSeen = Math.max(maxSeen, d);
  }
  if (maxSeen > maxStep + 0.15) problems.push(`a step is ${maxSeen.toFixed(1)} m (> ${maxStep} m)`);
  for (const [x, z] of rounded) {
    if (x < EXTENT.x0 || x > EXTENT.x1 || z < EXTENT.z0 || z > EXTENT.z1) {
      problems.push(`point (${x}, ${z}) is outside the playable extent`);
      break;
    }
  }
  return { route: { id: spec.id, stops, points: rounded }, report, length, minStep: minSeen, maxStep: maxSeen, problems };
}

function specFiles(args) {
  const named = args.filter((a) => !a.startsWith('--'));
  if (!named.length) return readdirSync(SPEC_DIR).filter((f) => f.endsWith('.spec.json')).sort().map((f) => `${SPEC_DIR}/${f}`);
  return named.map((a) => (existsSync(a) ? a : `${SPEC_DIR}/${a}.spec.json`));
}

function main(args) {
  const check = args.includes('--check');
  let failed = false;
  for (const file of specFiles(args)) {
    const spec = JSON.parse(readFileSync(file, 'utf8'));
    const g = loadGraph(undefined, spec.roadFactor ?? 1.25);
    const r = buildRoute(spec, g);
    const mins = r.length / WALK_SPEED / 60;
    console.log(`route ${spec.id}: ${r.length.toFixed(1)} m, ${r.route.points.length} points (steps ${r.minStep.toFixed(1)}–${r.maxStep.toFixed(1)} m), ${mins.toFixed(1)} min at ${WALK_SPEED} m/s`);
    for (const s of r.report) {
      console.log(`  ${s.id.padEnd(12)} s ${s.s.toFixed(1).padStart(7)} m   ${s.spur ? 'off graph, spur' : 'snapped'} ${s.offset.toFixed(1)} m (nearest node ${s.nodeD.toFixed(1)} m)`);
    }
    for (const p of r.problems) console.error(`  ! ${p}`);
    if (r.problems.length) failed = true;
    if (!check) {
      mkdirSync(OUT_DIR, { recursive: true });
      const out = `${OUT_DIR}/${spec.id}.json`;
      // compact points (one pair per line) keep the diff readable
      const json = `{\n  "id": ${JSON.stringify(r.route.id)},\n  "stops": [\n${r.route.stops.map((s) => `    ${JSON.stringify(s)}`).join(',\n')}\n  ],\n  "points": [\n${r.route.points.map((p) => `    ${JSON.stringify(p)}`).join(',\n')}\n  ]\n}\n`;
      writeFileSync(out, json);
      console.log(`  → ${out.slice(ROOT.length + 1)}`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
