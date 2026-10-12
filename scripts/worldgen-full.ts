// Monde complet pour des graines : npx vite-node scripts/worldgen-full.ts 1 2 3 — réseau, routes, passages à niveau, 5 min de trafic.
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
import { Traffic } from '../src/sim/traffic';

for (const sd of process.argv.slice(2).map(Number)) {
  const t0 = Date.now(), def = generateLayout(sd), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp);
  const seen = new Set<number>(), st = [r.nodes[0]];
  while (st.length) { const n = st.pop()!; if (seen.has(n.id)) continue; seen.add(n.id); for (const e of n.edges) st.push(e.a === n ? e.b : e.a); }
  const lost = wp.plans.filter(p => !r.nodes.some(n => Math.hypot(n.x - p.zone.x, n.z - p.zone.z) < p.zone.r)).map(p => p.zone.name ?? 'village');
  const tr = new Traffic(r, w, sd + 5); let vsum = 0, k = 0, maxN = 0, over = 0;
  for (let i = 0; i < 60 * 300; i++) {
    w.step(1 / 60); tr.step(w, 1 / 60);
    if (i % 60 === 0 && i) {
      vsum += tr.vehicles.reduce((a, v) => a + v.v, 0) / Math.max(1, tr.vehicles.length); k++; maxN = Math.max(maxN, tr.vehicles.length);
      for (const l of r.lanes) for (let j = 1; j < l.veh.length; j++) { const a = l.veh[j - 1] as any, b = l.veh[j] as any; if (b.s - b.len - a.s < -0.3) over++; }
    }
  }
  console.log(`seed ${sd}: ${def.urban!.length} zones, routes ${r.edges.length} tronçons/${r.nodes.length} noeuds, ${r.crossings.length} PN, connexe=${seen.size === r.nodes.length}, villes isolées=[${lost}], lac=${!!wp.lake}, véhicules max ${maxN}, v moy ${(vsum / k).toFixed(1)} m/s, bloqués ${tr.removedStuck}, chevauchements ${over}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
