import { loadTerrain } from './terrain.mjs';
const T = loadTerrain(process.argv[2]);
const [x0, x1, z0, z1, step] = JSON.parse(process.argv[3]);
const out = [];
for (let z = z0; z <= z1; z += step) {
  const row = [String(z).padStart(6)];
  for (let x = x0; x <= x1; x += step) {
    const p = T.probe(x, z);
    row.push(((p.ground === 'water' ? '~' : '') + Math.round(p.h2025)).padStart(4));
  }
  out.push(row.join(''));
}
console.log('      ' + Array.from({ length: Math.floor((x1 - x0) / step) + 1 }, (_, i) => String(x0 + i * step).padStart(4)).join(''));
console.log(out.join('\n'));
