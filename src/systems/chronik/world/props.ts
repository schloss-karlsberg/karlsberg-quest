/**
 * Small procedural props for object/document/map clues (≈ 0.3–0.6 m), built from primitives
 * with vertex colours. Chosen by `clue.prop`, else by keywords in the title, else by kind.
 */
import {
  type BufferGeometry,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  PlaneGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ChronikClue, PropKind } from '../types';

function part(g: BufferGeometry, hex: number, m?: Matrix4, jitter = 0.06): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (m) ng.applyMatrix4(m);
  const c = new Color(hex).convertSRGBToLinear();
  const n = ng.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 - jitter + ((i * 7919) % 97) / 97 * jitter * 2;
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  ng.setAttribute('color', new Float32BufferAttribute(col, 3));
  ng.deleteAttribute('uv');
  return ng;
}

const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const RX = (a: number) => new Matrix4().makeRotationX(a);
const RY = (a: number) => new Matrix4().makeRotationY(a);
const RZ = (a: number) => new Matrix4().makeRotationZ(a);
const mul = (...ms: Matrix4[]) => ms.reduce((a, b) => a.multiply(b), new Matrix4());

function paperSheet(w: number, h: number, curl: number, hex: number, m: Matrix4): BufferGeometry {
  const g = new PlaneGeometry(w, h, 8, 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, curl * (x / w) * (x / w) * 4);
  }
  g.computeVertexNormals();
  return part(g, hex, mul(m, RX(-Math.PI / 2)), 0.03);
}

export function buildProp(kind: PropKind): BufferGeometry {
  const parts: BufferGeometry[] = [];
  switch (kind) {
    case 'chest':
      parts.push(part(new BoxGeometry(0.62, 0.34, 0.4), 0x5a3b22, T(0, 0.17, 0)));
      parts.push(part(new CylinderGeometry(0.2, 0.2, 0.62, 10, 1, false, 0, Math.PI), 0x4d321c, mul(T(0, 0.34, 0), RZ(Math.PI / 2))));
      for (const x of [-0.22, 0.22]) parts.push(part(new BoxGeometry(0.04, 0.36, 0.42), 0x2b2b2b, T(x, 0.18, 0)));
      parts.push(part(new BoxGeometry(0.07, 0.09, 0.03), 0xb58b3d, T(0, 0.3, 0.21)));
      break;
    case 'book':
      parts.push(part(new BoxGeometry(0.34, 0.07, 0.46), 0x5b2318, T(0, 0.035, 0)));
      parts.push(part(new BoxGeometry(0.31, 0.055, 0.44), 0xe6dcc0, T(0.02, 0.036, 0)));
      parts.push(paperSheet(0.3, 0.42, 0.03, 0xefe5ca, mul(T(0.18, 0.08, 0), RZ(-0.15))));
      break;
    case 'paper':
      parts.push(paperSheet(0.42, 0.3, 0.04, 0xece2c6, mul(T(0, 0.02, 0), RY(0.3))));
      parts.push(paperSheet(0.36, 0.26, 0.05, 0xdccfa9, mul(T(0.08, 0.035, 0.05), RY(-0.2))));
      parts.push(part(new CylinderGeometry(0.015, 0.015, 0.03, 6), 0x9b2a1a, T(-0.1, 0.05, 0.02)));
      break;
    case 'scroll':
      parts.push(part(new CylinderGeometry(0.05, 0.05, 0.5, 14), 0xe2d5b2, mul(T(0, 0.05, 0), RZ(Math.PI / 2))));
      parts.push(paperSheet(0.5, 0.32, 0.02, 0xe9dcbc, T(0, 0.012, 0.17)));
      parts.push(part(new TorusGeometry(0.052, 0.01, 6, 14), 0x8c2f1f, mul(T(-0.12, 0.05, 0), RY(Math.PI / 2))));
      break;
    case 'jar': {
      const pts = [0, 0.11, 0.14, 0.13, 0.09, 0.06, 0.07].map((r, i) => new Vector2(r, i * 0.06));
      parts.push(part(new LatheGeometry(pts, 14), 0x7a5131));
      break;
    }
    case 'tablet':
      parts.push(part(new BoxGeometry(0.34, 0.025, 0.24), 0x1d1f22, mul(T(0, 0.015, 0), RY(0.4))));
      parts.push(part(new BoxGeometry(0.3, 0.004, 0.2), 0x2f6b7a, mul(T(0, 0.03, 0), RY(0.4)), 0.2));
      break;
    case 'compass':
      parts.push(part(new CylinderGeometry(0.11, 0.115, 0.05, 24), 0xb58b3d, T(0, 0.025, 0)));
      parts.push(part(new CylinderGeometry(0.095, 0.095, 0.006, 24), 0xe8dcc0, T(0, 0.052, 0)));
      parts.push(part(new BoxGeometry(0.16, 0.006, 0.014), 0x8c2f1f, mul(T(0, 0.058, 0), RY(0.6))));
      parts.push(part(new CylinderGeometry(0.11, 0.11, 0.012, 24, 1, false, 0, Math.PI), 0xa07a33, mul(T(0, 0.09, -0.11), RX(-1.1), T(0, 0, 0.11))));
      break;
    case 'horn':
      parts.push(part(new TorusGeometry(0.16, 0.025, 8, 24, Math.PI * 1.6), 0xb58b3d, mul(T(0, 0.04, 0), RX(Math.PI / 2))));
      parts.push(part(new CylinderGeometry(0.07, 0.02, 0.12, 12), 0xb58b3d, mul(T(0.16, 0.04, 0.06), RX(Math.PI / 2))));
      break;
    case 'stone':
    default: {
      const g = new IcosahedronGeometry(0.22, 1);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const s = 1 + 0.18 * Math.sin(p.getX(i) * 23 + p.getZ(i) * 17) * Math.cos(p.getY(i) * 19);
        p.setXYZ(i, p.getX(i) * s * 1.3, p.getY(i) * s * 0.7, p.getZ(i) * s);
      }
      g.computeVertexNormals();
      parts.push(part(g, 0xa58d6a, T(0, 0.12, 0), 0.15));
      // a chiselled mark
      parts.push(part(new BoxGeometry(0.1, 0.012, 0.012), 0x3a2c1c, mul(T(0.05, 0.27, 0.05), RY(0.5))));
    }
  }
  const g = mergeGeometries(parts, false)!;
  g.computeBoundingSphere();
  return g;
}

const KEYWORDS: [RegExp, PropKind][] = [
  [/kiste|truhe|kasten|koffer/i, 'chest'],
  [/handbuch|buch|register|akte|ledger|kladde/i, 'book'],
  [/bussole|kompass|schublade/i, 'compass'],
  [/tablet|laptop|punktwolke/i, 'tablet'],
  [/horn/i, 'horn'],
  [/krug|flasche|topf|kanne|gefäß/i, 'jar'],
  [/karte|plan|rolle/i, 'scroll'],
  [/brief|blatt|seite|zettel|liste|notiz/i, 'paper'],
  [/stein|block|zeichen|scherbe/i, 'stone'],
];

export function propKindFor(c: ChronikClue): PropKind | null {
  if (c.prop) return c.prop;
  if (c.kind === 'relief' || c.kind === 'echo' || c.kind === 'dialogue') return null;
  for (const [re, k] of KEYWORDS) if (re.test(c.title_de)) return k;
  return c.kind === 'document' ? 'paper' : c.kind === 'map' ? 'scroll' : 'stone';
}
