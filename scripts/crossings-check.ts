// Franchissements sans ouvrage : npx vite-node scripts/crossings-check.ts 1 2 3
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
for (const sd of process.argv.slice(2).map(Number)) {
  const def = generateLayout(sd), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp);
  let road = 0, roadLow = 0, rail = 0, railBad = 0, streetWater = 0;
  for (const e of r.edges) for (let d = 0; d <= e.poly.len; d += 3) {
    const s = e.poly.at(d), rv = t.riverNear(s.x, s.z);
    if (rv && rv.d < rv.hw + 1) { road++; if (s.y - t.height(s.x, s.z) < 0.9 && e.render) roadLow++; if (!e.render) streetWater++; }
  }
  const N = w.net.center.length;
  for (let i = 0; i < N; i++) { const p = w.net.center[i], rv = t.riverNear(p.x, p.z); if (rv && rv.d < rv.hw + 6) { rail++; if (!p.bf) railBad++; } }
  console.log(`graine ${sd}: route sur l'eau ${road} (sans tablier ${roadLow}, rues ${streetWater}), voie sur l'eau ${rail} (sans pont ${railBad}), lac ${!!wp.lake}`);
}
