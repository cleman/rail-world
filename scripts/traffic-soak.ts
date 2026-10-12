// Circulation routière sur des mondes générés : blocages (véhicules retirés après 150 s à l'arrêt) et chevauchements.
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
import { Traffic } from '../src/sim/traffic';
const a = +process.argv[2] || 1, b = +process.argv[3] || 5, T = +process.argv[4] || 900;
for (let s = a; s <= b; s++) {
  const def = generateLayout(s), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp);
  const tr = new Traffic(r, w, s + 5); tr.target.bus = 10;
  let over = 0; const stuckAt: string[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < 60 * T; i++) {
    w.step(1 / 60); tr.step(w, 1 / 60);
    if (i % 60 === 0) {
      for (const l of r.lanes) for (let j = 1; j < l.veh.length; j++) { const p = l.veh[j - 1] as any, q = l.veh[j] as any; if (q.s - q.len - p.s < -0.3) over++; }
      for (const v of tr.vehicles) if (v.stuck > 120 && !seen.has(v.id)) { seen.add(v.id); stuckAt.push(`${v.kind}@${v.x.toFixed(0)},${v.z.toFixed(0)} y=${v.y.toFixed(1)} lights=${!!v.lane.to.lights} cross=${!!v.lane.to.crossing}`); }
    }
  }
  const lv = r.crossings.filter(c => c.node.edges.every(e => !e.render)).length, decks = wp.plans.flatMap(p => p.streets.filter(x => x.deck)).length;
  console.log(`graine ${s}: ponts ${decks}, passages de ville ${lv}, feux ${r.nodes.filter(n => n.lights).length}, bloqués ${tr.removedStuck + stuckAt.length}, chevauchements ${over}, véhicules ${tr.vehicles.length}`, stuckAt.slice(0, 3).join(' | '));
}
