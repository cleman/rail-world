import layout from '../src/layout.json';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
import { Traffic } from '../src/sim/traffic';
const def = layout as never as any, w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp);
const tr = new Traffic(roads, w, 9); tr.target.bus = 12; const seen = new Set<number>();
const near = (x: number, z: number) => { let b = '', d = 1e9; for (const p of wp.plans) { const q = Math.hypot(p.c.x - x, p.c.z - z); if (q < d) { d = q; b = p.zone.name ?? p.zone.kind; } } return `${b} d=${d.toFixed(0)}`; };
for (let i = 0; i < 60 * 900; i++) {
  w.step(1 / 60); tr.step(w, 1 / 60);
  for (const v of tr.vehicles) if (v.stuck > 140 && !seen.has(v.id)) { seen.add(v.id); console.log(`t=${(i / 60).toFixed(0)}s véh ${v.id} ${v.kind} stuck=${v.stuck.toFixed(0)} @ ${near(v.x, v.z)} lane tier ${v.lane.edge.tier} oneWay=${!!v.lane.edge.oneWay} noEntry=${!!v.lane.noEntry} holds=${v.holds.length} s=${v.s.toFixed(1)}/${v.lane.len.toFixed(1)} v=${v.v.toFixed(2)} nextOneWay=${v.plan[0]?.edge.oneWay} nodeHolders=${v.lane.to.holders.size} nodeDeg=${v.lane.to.edges.length} ahead=${v.lane.veh.indexOf(v) < v.lane.veh.length - 1} nextVeh=${v.plan[0]?.veh.length}`); { const h = v.lane.veh[v.lane.veh.length - 1] as any; const n = v.lane.to; console.log('   tête', h.id, h.kind, 's', h.s.toFixed(1), 'v', h.v.toFixed(2), 'holds', h.holds.length, 'node holders', [...n.holders].map((o: any) => `${o.id}@${o.lane.id}${o.lane.edge.oneWay ? 'R' : ''} s=${o.s.toFixed(0)}/${o.lane.len.toFixed(0)} v=${o.v.toFixed(1)}`).join(','), 'nextlane', h.plan[0]?.id, 'nextveh', (h.plan[0]?.veh ?? []).map((o: any) => o.id + ':' + o.v.toFixed(1)).join(','), 'ringIn', n.lanesIn.filter((l: any) => l.edge.oneWay && !l.noEntry).map((l: any) => l.veh.map((o: any) => `${o.id}:${(l.len - o.s).toFixed(0)}`).join('/')).join('|')); } }
}
console.log('removedStuck', tr.removedStuck, 'ring edges', roads.edges.filter(e => e.oneWay).length);
