import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
for (let s = 1; s <= 8; s++) {
  const def = generateLayout(s), w = new World(def), t = new Terrain(w.net, def.urban); let tun = 0, near = 0, first = '';
  for (const r of t.rivers) for (const p of r.pts) { const n = t.nearest(p.x, p.z); if (n.tf > 0.5 && n.d < r.width / 2 + 10) { tun++; if (!first) first = `${p.x.toFixed(0)},${p.z.toFixed(0)} d=${n.d.toFixed(0)}`; } if (n.d < 40 && n.bf === 0 && n.tf === 0) near++; }
  console.log(`graine ${s}: points de rivière sur un tunnel ${tun} ${first}; points de rivière à <40 m d'une voie sans pont ${near}`);
}
