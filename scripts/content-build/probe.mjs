import { loadTerrain, pointInRing } from './terrain.mjs';
const T = loadTerrain(process.argv[2]);
const pts = JSON.parse(process.argv[3]);
for (const [name, x, z] of pts) {
  const p = T.probe(x, z);
  const fp = T.fps.filter((b) => pointInRing(x, z, b.ring)).map((b) => b.id);
  console.log(name.padEnd(28), x, z, JSON.stringify(p), fp.join(','));
}
