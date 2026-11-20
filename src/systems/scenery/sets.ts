/**
 * The set pieces, per era and place (bible references in brackets). Each set is built when the
 * player comes within `range` of its centre in one of its eras and dropped when the era changes
 * or the player is far away. Positions avoid the story's anchors, checkpoints, NPC spots and clue
 * radii (they are checked in tests/scenery.test.ts).
 */
import { Color } from 'three';
import { WORLD_SETS } from './worldsets';
import { EHRENHOF_1789 } from './court';
import type { Era } from '../../core/era';
import { type SetBuilder, face } from './builder';
import { rng } from './kit';
import { fence, gate, railing } from './linear';
import { RUND, rundHouse, rundHouses } from './rund';
import { ROTUNDA, rotundaAt, rotundaSite } from './passage';
import { C, barrel, blockStack, cart, firePit, hoist, kennel, mortar, post, rubblePile, scale, sentryBox, straw, table, tools, trough, wagon, woodStack } from './props';

export interface SetDef {
  id: string;
  eras: readonly Era[];
  x: number;
  z: number;
  /** Build within this distance (m). */
  range: number;
  build(b: SetBuilder, opts: SetOptions): void;
  /** Places the set must leave free (anchors, NPCs, clues): x, z, radius. Checked in tests. */
  keepFree?: readonly [number, number, number][];
}

export interface SetOptions {
  era: Era;
  /** Ehrenhof gate: 0 closed … 1 open. */
  gateOpen: number;
}

const EMBER = new Color(2.4, 0.9, 0.25);
const LANTERN = new Color(2.2, 1.3, 0.5);

/** The Ehrenhof gitter's piers in the palace model (south → north; 4/5 are the gate piers). */
export const GITTER_PIERS: [number, number][] = [
  [1195.75, -1094.75],
  [1195.05, -1099.05],
  [1194.3, -1103.4],
  [1193.55, -1107.75],
  [1192.85, -1112.05],
  [1192.05, -1117.05],
  [1191.3, -1121.35],
  [1190.55, -1125.65],
  [1189.85, -1129.95],
  [1189.15, -1134.3],
];
export const GATE_CENTER: [number, number] = [1192.45, -1114.55];

/** Park fence at the Carlsluster Torhaus (bible 2.1): along the gatehouse's axis, both sides. */
export const PARK_FENCE: [number, number][][] = [
  [
    [1667.2, -429.7],
    [1672.4, -408.6],
    [1700, -395.5],
    [1732, -381],
    [1765, -368],
    [1800, -356],
  ],
  [
    [1627.0, -409.3],
    [1600, -396.5],
    [1570, -381.5],
    [1540, -367],
    [1505, -351],
  ],
];

// ---------------------------------------------------------------------------------------------
// 1796: the quarry of the ruin (bible 4.1, 4.3, 4.4)
// ---------------------------------------------------------------------------------------------

const baumagazin: SetDef = {
  id: 'k4-baumagazin',
  eras: ['1796'],
  x: 485,
  z: -850,
  range: 260,
  keepFree: [
    [497, -900, 6], // anchor A
    [496, -842, 1.6], // Soll
    [494, -826, 1.6], // Peter
    [490, -834, 2.5], // clue.k4.jaegersburg
    // clue.k4.pacht (495/−845) lies on Soll's table: examined across it, the table stays solid
  ],
  build(b) {
    const k = b.kit;
    // Soll's table in the yard, the lease sheet on it (clue.k4.pacht 495/−845)
    b.at(495.0, -844.9, 250);
    table(k, 11);
    b.box(495.0, -844.9, 250, 0.65, 0.38);
    // Peter's cart with the marked stone (clue.k4.stein_karren 496.5/−822)
    b.at(497.6, -821.0, 245, 1.2);
    cart(k, 12, 'marked');
    b.circle(497.6, -821.0, 1.15).circle(496.4, -823.6, 0.7);
    // the big heap broken out of the palace, and its stonebreakers
    b.at(481.5, -836, 15, 2);
    rubblePile(k, 13, 4.2, 3.4, 1.5);
    b.circle(481.5, -836, 2.1);
    b.at(484.6, -831.8, 200);
    tools(k, 14);
    b.circle(484.6, -831.8, 0.6);
    b.worker({ x: 478.6, z: -834.2, deg: 105, pose: 'sledge', phase: 0.2 });
    b.worker({ x: 484.4, z: -839.6, deg: 320, pose: 'pick', phase: 1.1 });
    // dressed blocks waiting for the carts
    b.at(488.2, -815.2, 245);
    blockStack(k, 15, 3, 2, 2);
    b.box(488.2, -815.2, 245, 1.1, 1.0);
    b.at(484.5, -861.5, 250);
    blockStack(k, 16, 4, 2, 3);
    b.box(484.5, -861.5, 250, 1.4, 1.0);
    b.worker({ x: 487.5, z: -858.5, deg: 250, pose: 'carry', phase: 0.4 });
    // wood from the palace (and a stable from Jägersburg, bible 4.3), a smaller heap
    b.at(486.8, -828.3, 250, 1.2);
    woodStack(k, 17, 3.4, 4);
    b.box(487.4, -828.3, 250, 1.6, 1.9);
    b.at(474.8, -849.5, 60, 1.6);
    rubblePile(k, 18, 3.2, 2.6, 1.1);
    b.circle(474.8, -849.5, 1.7);
    b.worker({ x: 477.4, z: -851.2, deg: 300, pose: 'lever', phase: 0.9 });
    // the scale (Waage) where the stone is sold by weight
    b.at(491.0, -852.5, 250);
    scale(k, 19);
    b.circle(490.0, -852.9, 0.35).circle(492.0, -852.1, 0.35).circle(491.8, -852.3, 0.45);
    // fire pit, its smoke and a stonebreaker warming his hands
    const fy = b.at(470.5, -829.0, 0);
    firePit(k, 20);
    b.circle(470.5, -829.0, 0.95);
    b.smoke.push({ x: 470.5, y: fy + 0.5, z: -829.0, height: 11, count: 40, size: 0.9 });
    b.glow(470.5, fy + 0.45, -829.0, 2.6, EMBER);
    b.worker({ x: 472.0, z: -830.6, deg: 320, pose: 'stand', phase: 2 });
    // barrels by the wall, carts waiting to leave
    for (const [x, z, s] of [[500.2, -851.0, 21], [500.6, -852.4, 22], [499.4, -853.0, 23]] as const) {
      b.at(x, z, 0, 0.3);
      b.model('architecture.barrel', () => barrel(k, s), { yaw: s, scale: 0.82 });
      b.circle(x, z, 0.32);
    }
    // detailed tiers: the yard's small things (CC0 models) round the barrels and Soll's table
    b.at(499.0, -849.6, 250, 0.4);
    b.model('architecture.crate.lid', undefined, { yaw: 0.2 });
    b.model('architecture.crate.lid', undefined, { y: 0.35, yaw: -0.15, scale: 0.9 });
    b.at(497.4, -846.8, 0, 0.2);
    b.model('architecture.stool', undefined, { yaw: 1.1 });
    b.at(493.6, -843.4, 0, 0.2);
    b.model('architecture.bucket', undefined, { yaw: 0.6 });
    b.at(485.6, -832.6, 0, 0.3);
    b.model('architecture.basket', undefined, { yaw: 0.4, scale: 1.2 });
    b.at(483.7, -831.2, 200, 0.2);
    b.model('architecture.pickaxe', undefined, { y: 0.34, yaw: 0.3, tiltZ: 1.25 });
    b.at(465.0, -842.5, 200, 1.4);
    cart(k, 24, 'stones');
    b.circle(465.0, -842.5, 1.2).circle(464.0, -840.0, 0.7);
    b.at(470.5, -862.0, 320, 1.4);
    cart(k, 25, 'empty');
    b.circle(470.5, -862.0, 1.2).circle(468.8, -864.0, 0.7);
    b.at(503.0, -805.0, 250, 1.6);
    rubblePile(k, 26, 2.6, 2.2, 0.9);
    b.circle(503.0, -805.0, 1.4);
  },
};

/** The road at the valley entrance: carts going west with dressed stone (bible 4.1). */
const taleingang: SetDef = {
  id: 'k4-taleingang',
  eras: ['1796'],
  x: 470,
  z: -896,
  range: 240,
  keepFree: [[497, -900, 9]],
  build(b) {
    const k = b.kit;
    b.at(474.0, -893.0, 265, 1.4);
    cart(k, 31, 'blocks');
    b.circle(474.0, -893.0, 1.2).circle(471.2, -893.3, 0.7);
    b.worker({ x: 473.5, z: -890.6, deg: 265, pose: 'stand', phase: 0.3 });
    b.at(452.0, -899.0, 262, 1.4);
    cart(k, 32, 'stones');
    b.circle(452.0, -899.0, 1.2).circle(449.2, -899.4, 0.7);
    b.at(435.0, -905.5, 255, 1.4);
    cart(k, 33, 'logs');
    b.circle(435.0, -905.5, 1.2).circle(432.2, -906.3, 0.7);
    b.worker({ x: 436.0, z: -903.0, deg: 255, pose: 'carry', phase: 1.3 });
  },
};

/** The roofless Ehrenhof, men breaking stones out of the walls (bible 4.4, W7). */
const ehrenhofRuin: SetDef = {
  id: 'k4-ehrenhof',
  eras: ['1796'],
  x: 1225,
  z: -1115,
  range: 220,
  keepFree: [
    [1216, -1114, 5], // anchor B
    [1195, -1112, 3.2], // clue.k4.anschlag at the pier
  ],
  build(b) {
    const k = b.kit;
    b.at(1232.5, -1101.5, 280, 1.4);
    cart(k, 41, 'blocks');
    b.circle(1232.5, -1101.5, 1.2).circle(1229.8, -1101.0, 0.7);
    b.at(1203.5, -1127.0, 100, 1.4);
    cart(k, 42, 'stones');
    b.circle(1203.5, -1127.0, 1.2).circle(1206.3, -1127.4, 0.7);
    b.at(1246.0, -1131.0, 0, 2);
    rubblePile(k, 43, 4.5, 3.0, 1.4);
    b.circle(1246.0, -1131.0, 2.2);
    b.at(1243.5, -1098.5, 170, 1.6);
    rubblePile(k, 44, 3.4, 2.4, 1.0);
    b.circle(1243.5, -1098.5, 1.6);
    b.at(1222.0, -1131.5, 0);
    blockStack(k, 45, 3, 2, 2);
    b.box(1222.0, -1131.5, 0, 1.1, 1.0);
    b.worker({ x: 1248.5, z: -1127.5, deg: 200, pose: 'lever', phase: 0.5 });
    b.worker({ x: 1241.0, z: -1101.6, deg: 20, pose: 'sledge', phase: 1.4 });
    b.worker({ x: 1225.0, z: -1129.0, deg: 0, pose: 'pick', phase: 0.1 });
    b.at(1239.5, -1105.0, 300);
    tools(k, 46);
    b.circle(1239.5, -1105.0, 0.6);
  },
};

// ---------------------------------------------------------------------------------------------
// 1789: the building site at the gallery's east end (bible 1.3) and the kennels (1.5)
// ---------------------------------------------------------------------------------------------

const bauplatz: SetDef = {
  id: 'k1-bauplatz',
  eras: ['1789'],
  x: 1288,
  z: -1230,
  range: 230,
  keepFree: [
    [1287, -1228, 1.8], // Hanne
    [1262, -1218.5, 2.6], // clue.k1.zeichen
  ],
  build(b) {
    const k = b.kit;
    // the rotunda KB-B07 going up (passage.ts): wall crown, the dome's centering, a scaffold on
    // both flanks; the colonnade, the portico and the way through them stay free
    const site = rotundaSite(k, b.heightAt, 51);
    b.solids.push(...site.solids);
    // a mason on the south scaffold's first deck, facing the drum; one dressing a block below
    {
      const [mx, mz] = rotundaAt(105, ROTUNDA.r + 1.15);
      const [cx, cz] = rotundaAt(0, 0);
      const deg = ((Math.atan2(cx - mx, -(cz - mz)) * 180) / Math.PI + 360) % 360;
      b.worker({ x: mx, z: mz, deg, pose: 'pick', phase: 0.6, y: site.deck[1] });
    }
    b.at(1296.0, -1238.5, 95, 2.5);
    hoist(k, 53, 6.5);
    b.circle(1294.6, -1238.6, 0.25).circle(1297.4, -1238.6, 0.25).circle(1296.6, -1238.5, 0.5);
    b.at(1293.0, -1219.0, 10);
    blockStack(k, 54, 4, 2, 2);
    b.box(1293.0, -1219.0, 10, 1.4, 1.0);
    b.worker({ x: 1296.2, z: -1221.5, deg: 280, pose: 'sledge', phase: 1.7 });
    b.at(1301.5, -1230.0, 90, 1.5);
    mortar(k, 55);
    b.box(1301.5, -1230.0, 90, 1.0, 0.55);
    b.at(1289.0, -1247.0, 170);
    blockStack(k, 56, 3, 2, 1);
    b.box(1289.0, -1247.0, 170, 1.1, 1.0);
    b.at(1306.0, -1243.0, 200, 1.6);
    rubblePile(k, 57, 3.0, 2.4, 0.8);
    b.circle(1306.0, -1243.0, 1.4);
    // the lodge (Bauhütte): a lean-to shed with a bench
    const ly = b.at(1312.0, -1222.0, 270, 2.5);
    k.box(4.2, 2.4, 0.12, 0, 0, -1.4, C.woodGrey);
    for (const sx of [-2, 2]) k.box(0.12, 2.4, 2.8, sx, 0, 0, C.woodGrey);
    k.box(4.6, 0.08, 3.4, 0, 2.15, 0.1, C.roof, [-0.18, 0, 0]);
    for (const sx of [-2, 2]) k.box(0.14, 1.8, 0.14, sx, 0, 1.35, C.woodDark);
    k.box(3.2, 0.08, 0.8, 0, 0.75, -0.9, C.wood);
    k.box(1.2, 0.8, 0.6, -1.2, 0, 0.6, C.sandstone);
    b.box(1312.0, -1222.0, 270, 2.2, 1.6);
    b.glow(1312.0 - 1.0, ly + 1.9, -1222.0, 0.9, LANTERN);
    b.at(1308.0, -1214.0, 180, 1.4);
    cart(k, 58, 'blocks');
    b.circle(1308.0, -1214.0, 1.2).circle(1308.0, -1211.2, 0.7);
  },
};

const zwinger: SetDef = {
  id: 'zwinger',
  eras: ['1789', '1793-02', '1793-07'],
  x: 1210,
  z: -1572,
  range: 220,
  keepFree: [
    [1177, -1571, 9], // Jost 1789 + his tutorial
    [1250, -1568, 2.5], // Jost 1793-07
    [1219, -1566, 2], // the Pikeur (today, but keep clear)
  ],
  build(b, o) {
    const k = b.kit;
    const r = rng(61);
    // kennels along the outer west wall, either side of Jost's place
    let s = 62;
    for (const z of [-1590.5, -1587.8, -1585.1, -1557.4, -1554.7, -1552.0]) {
      b.at(1181.0, z, 270, 0.6);
      kennel(k, s++);
      b.box(1181.0, z, 270, 0.6, 0.75);
    }
    // troughs and straw in the lane
    b.at(1175.5, -1583.0, 0, 1.2);
    trough(k, 70, 2.6, true);
    b.box(1175.5, -1583.0, 0, 1.35, 0.35);
    b.at(1175.0, -1558.5, 0, 1.2);
    trough(k, 71, 2.2, false);
    b.box(1175.0, -1558.5, 0, 1.15, 0.35);
    b.at(1172.0, -1590.0, 0, 1.5);
    straw(k, 72, o.era === '1793-07');
    b.circle(1172.0, -1590.0, 1.1);
    b.at(1171.0, -1552.0, 0, 1.2);
    straw(k, 73, true);
    b.circle(1171.0, -1552.0, 1.0);
    for (const [x, z] of [[1179.6, -1580.0], [1179.6, -1562.0]] as const) {
      b.at(x, z, 90, 0.2);
      post(k, Math.round(x * z));
      b.circle(x, z, 0.12);
    }
    b.at(1183.4, -1597.5, 0, 0.3);
    b.model('architecture.barrel', () => barrel(k, 74), { yaw: 1.3, scale: 0.82 });
    b.at(1182.6, -1596.4, 0, 0.2);
    b.model('architecture.bucket', undefined, { yaw: 2.1 });
    b.circle(1183.4, -1597.5, 0.32);
    // inside the walled yard: rows of kennels, troughs, straw (seen over the wall and from the Jägerhaus)
    s = 80;
    for (let i = 0; i < 7; i++) {
      b.at(1188 + i * 3.2, -1590.5, 0, 0.6);
      kennel(k, s++);
    }
    for (let i = 0; i < 7; i++) {
      b.at(1229 + i * 2.9, -1553.0, 180, 0.6);
      kennel(k, s++);
    }
    b.at(1200, -1565, 90, 1.2);
    trough(k, 95, 3.0, true);
    b.at(1236, -1580, 90, 1.2);
    trough(k, 96, 3.0, false);
    for (let i = 0; i < 4; i++) {
      b.at(1192 + r() * 50, -1585 + r() * 26, 0, 1.0);
      straw(k, 97 + i, false);
    }
    // east gate side (Jost opens the kennel gates in 1793-07, bible 3.12)
    b.at(1253.0, -1585.0, 90, 0.6);
    trough(k, 101, 2.2, o.era !== '1793-07');
    b.box(1253.0, -1585.0, 90, 1.15, 0.35);
    if (o.era === '1793-07') {
      // the night of the fire: a lantern on a post, the trough knocked over
      b.at(1254.0, -1576.0, 0, 0.2);
      post(k, 102);
      b.model('architecture.lantern', undefined, { x: 0.14, y: 0.66, scale: 0.85 });
      b.circle(1254.0, -1576.0, 0.12);
      const y = b.heightAt(1254.0, -1576.0);
      b.glow(1254.1, y + 1.15, -1576.0, 1.1, LANTERN);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// 1789–1793: the park fence, the Ehrenhof railing and gate, the Orangerie court (bible 2.1, 2.3, 2.7)
// ---------------------------------------------------------------------------------------------

const parkzaun: SetDef = {
  id: 'parkzaun',
  eras: ['1789', '1793-02', '1793-07'],
  x: 1650,
  z: -415,
  range: 280,
  keepFree: [
    [1680, -400, 3], // anchor A
    [1674, -405.5, 0.8], // where one stands to examine the scrap of wool
  ],
  build(b) {
    const k = b.kit;
    // east: the broken stretch just past the scrap of wool (where he climbed over, bible 2.1);
    // west: the park barrier on the road beside the gatehouse, and a trampled stretch where his
    // trail (and the pack) crosses towards the Orangerie (k2-spur, ≈ 1613/−402)
    // playtest round 2: the way into the park was a 2 m slot between the sentry box and the
    // gatehouse wall. Now the park gate east of the Torhaus stands wide open (6 m, where the anchor
    // is), and the sentry box stands outside, by the road, not in the passage.
    b.solids.push(...fence(k, PARK_FENCE[0]!, b.heightAt, 111, 1.55, [{ seg: 1, s0: 0.6, s1: 7.4 }]));
    b.solids.push(...fence(k, PARK_FENCE[1]!, b.heightAt, 112, 1.55, [{ seg: 0, s0: 0.6, s1: 6.0 }, { seg: 0, s0: 13.0, s1: 17.2 }]));
    {
      const [p0, p1] = [PARK_FENCE[0]![1]!, PARK_FENCE[0]![2]!];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const ux = (p1[0] - p0[0]) / len;
      const uz = (p1[1] - p0[1]) / len;
      const at = (s: number): [number, number] => [p0[0] + ux * s, p0[1] + uz * s];
      const a = at(0.4);
      const c = at(7.6);
      const y0 = Math.min(b.heightAt(a[0], a[1]), b.heightAt(c[0], c[1]));
      for (const [px, pz] of [a, c]) {
        k.place(px, y0 - 0.1, pz, Math.atan2(ux, uz));
        k.box(0.7, 2.9, 0.7, 0, 0, 0, C.sandstone);
        k.box(0.85, 0.18, 0.85, 0, 2.9, 0, C.sandstone);
        k.cone(0.3, 0.55, 0, 3.08, 0, C.sandstone, 8);
        b.circle(px, pz, 0.45);
      }
      // the wings swung into the park (north)
      gate(k, a, c, y0, 2.3, 1, [uz, -ux], 0.35);
      b.glow(a[0], y0 + 3.2, a[1], 0.7, LANTERN).glow(c[0], y0 + 3.2, c[1], 0.7, LANTERN);
    }
    // the barrier (Parkschranke), its pole raised, and the sentry box outside by the road
    const y = b.at(1622.4, -407.2, 296, 0.5);
    k.box(0.3, 1.1, 0.3, 0, 0, 0, C.woodDark);
    k.push(0, 1.05, 0, -1.15, 0, 0);
    k.box(0.12, 0.12, 5.2, 0, 0, 2.6, 0xb8b0a0);
    for (let i = 0; i < 4; i++) k.box(0.125, 0.125, 0.6, 0, 0, 0.6 + i * 1.25, 0x8a2a20);
    k.pop();
    b.circle(1622.4, -407.2, 0.25);
    b.at(1631.5, -402.5, 250, 0.8);
    sentryBox(k, 115);
    b.box(1631.5, -402.5, 250, 0.75, 0.7);
    b.glow(1631.5, y + 2.1, -402.5, 0.8, LANTERN);
  },
};

const gitter: SetDef = {
  id: 'ehrenhof-gitter',
  eras: ['1789', '1793-02', '1793-07'],
  x: GATE_CENTER[0],
  z: GATE_CENTER[1],
  range: 300,
  build(b, o) {
    const k = b.kit;
    // bars on the low wall (top ≈ 345.45 m) between the piers, the gate between piers 4 and 5
    railing(k, GITTER_PIERS, 345.45, 1.9, new Set([4]), 0.42);
    // the bars are solid (playtest: the player walked into them and fought through them)
    for (let i = 0; i + 1 < GITTER_PIERS.length; i++) {
      if (i === 4) continue;
      const [ax, az] = GITTER_PIERS[i]!;
      const [cx, cz] = GITTER_PIERS[i + 1]!;
      const len = Math.hypot(cx - ax, cz - az);
      b.solids.push({ kind: 'box', x: (ax + cx) / 2, z: (az + cz) / 2, ux: (cx - ax) / len, uz: (cz - az) / len, hu: len / 2 + 0.2, hv: 0.3 });
    }
    const a = GITTER_PIERS[4]!;
    const c = GITTER_PIERS[5]!;
    const y0 = Math.min(b.heightAt(GATE_CENTER[0] - 0.5, GATE_CENTER[1]), b.heightAt(GATE_CENTER[0] + 0.5, GATE_CENTER[1]));
    const s = gate(k, a, c, y0, 2.7, o.gateOpen, [1, 0.12], 0.68);
    if (s) b.solids.push(s);
    // an iron overthrow with a crown between the gate piers
    const mx = (a[0] + c[0]) / 2;
    const mz = (a[1] + c[1]) / 2;
    k.place(mx, y0 + 3.15, mz, Math.atan2(c[0] - a[0], c[1] - a[1]));
    k.beam(0, 0, -2.1, 0, 0, 2.1, 0.05, C.iron, 0.06);
    for (let i = -6; i <= 6; i++) {
      const zz = i * 0.3;
      const hh = 0.9 * Math.cos((i / 6) * Math.PI * 0.5);
      k.pole(0, 0, zz, 0, hh, zz, 0.012, C.iron, 4);
    }
    k.cyl(0.18, 0.12, 0.3, 0, 0.95, 0, 0x9a7a32, undefined, 8);
  },
};

const orangerieHof: SetDef = {
  id: 'k2-orangerie',
  eras: ['1793-02'],
  x: 1275,
  z: -975,
  range: 220,
  keepFree: [[1275, -960, 4]],
  build(b) {
    const k = b.kit;
    // the crates being loaded on a wagon below Mannlich's windows (bible 2.3)
    const y = b.at(1270.5, -982.0, 200, 2);
    wagon(k, 121);
    b.box(1270.5, -982.0, 200, 1.0, 2.3).circle(1270.5 + Math.sin(face(200)) * 3.6, -982.0 + Math.cos(face(200)) * 3.6, 0.4);
    for (const [x, z, sd] of [[1266.8, -985.5, 122], [1267.6, -987.2, 123], [1274.6, -986.0, 124]] as const) {
      b.at(x, z, 200 + sd, 0.4);
      b.model('architecture.crate.long', () => k.box(0.7, 0.5, 0.6, 0, 0, 0, C.woodGrey), { yaw: Math.PI / 2, scale: 1.05 });
      if (sd === 122) b.model('architecture.crate.lid', () => k.box(0.6, 0.45, 0.55, 0, 0.5, 0.02, C.woodGrey, [0, 0.2, 0]), { y: 0.48, yaw: 0.2 });
      b.circle(x, z, 0.5);
    }
    // the iron-bound chest of the collection waiting by the wagon
    b.at(1271.8, -986.4, 205, 0.5);
    b.model('architecture.chest', undefined, { scale: 0.9 });
    b.at(1264.0, -980.0, 0, 0.3);
    post(k, 125);
    b.circle(1264.0, -980.0, 0.12);
    b.glow(1264.1, y + 1.2, -980.0, 1.2, LANTERN);
    b.glow(1270.5, y + 2.6, -979.0, 1.4, LANTERN);
  },
};

/** The Karlslust's Rund (bible 1.6): the nineteen houses you count in K1 Teil B (playtest round 2). */
const rund: SetDef = {
  id: 'k1-rund',
  eras: ['1789', '1793-02', '1793-07'],
  x: RUND.x,
  z: RUND.z,
  range: 260,
  keepFree: [
    [1966, 92, 1.5], // the cassowary
    [1903, 87, 1.5], // the gardener
  ],
  build(b) {
    rundHouses().forEach((h, i) => rundHouse(b, h, 300 + i));
  },
};

export const SETS: readonly SetDef[] = [baumagazin, taleingang, ehrenhofRuin, bauplatz, zwinger, parkzaun, gitter, orangerieHof, rund, EHRENHOF_1789, ...WORLD_SETS];
