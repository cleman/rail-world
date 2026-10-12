import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
for (const s of [1, 3, 7, 12]) {
  const def = generateLayout(s), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp);
  for (const p of wp.plans) for (const st of p.streets) if (st.deck) {
    const c = st.pts[st.deck.c0], inG = r.edges.filter(e => !e.render).some(e => e.poly.pts.some(q => Math.hypot(q.x - c[0], q.z - c[1]) < 1));
    const near = r.edges.filter(e => !e.render).filter(e => e.poly.pts.some(q => Math.hypot(q.x - c[0], q.z - c[1]) < 25)).length;
    console.log(`graine ${s} ${p.zone.name} deck c0 ${c[0].toFixed(0)},${c[1].toFixed(0)} pts ${st.pts.length} dansGraphe ${inG} aretesProches25m ${near}`);
  }
}
