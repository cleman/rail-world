import { World } from '../src/sim/world';
import type { LayoutDef } from '../src/sim/network';
import { def as base } from './branch-try';
const def: LayoutDef = { ...base, branches: [{ id: 'N', name: 'Navette', origin: 'Ouest', via: [[-1000, 100], [-500, 150], [0, 0], [500, -150], [1000, -100]], loops: [{ name: 'Milieu', at: 0.5 }], terminus: 'Est-N' }], circuits: [...base.circuits.filter(c => !c.via), { id: 'N1', name: 'Navette', track: 'N>', type: 'omnibus', fleet: 2, service: 2, cars: 3 }] };
const w = new World(def);
console.log('lignes', w.net.lines.map(l => `${l.id}:${l.center.length}`).join(' '), 'départs', w.net.starts['N>']?.map(e => e.id).join(','), 'desservies', w.circuits.map(c => `${c.id}:${c.served.join(',')}`).join(' | '));
let bad = 0;
for (let i = 0; i < 60 * Number(process.argv[2] ?? 7200); i++) {
  w.step(1 / 60);
  for (const e of w.net.edges) if (e.occupants.size > 1) throw new Error(`deux trains dans ${e.id} t=${w.time.toFixed(0)}`);
  if (i % 30 === 0) {
    const live = w.trains.filter(t => t.status !== 'stored').map(t => ({ t, c: Array.from({ length: t.cars }, (_, k) => t.pointAt(k * (t.carLen + t.gap) + t.carLen / 2)) }));
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) { let dm = 1e9; for (const p of live[a].c) for (const q of live[b].c) dm = Math.min(dm, Math.hypot(p.x - q.x, p.z - q.z)); if (dm < 3 && bad++ < 5) console.log('chevauchement', live[a].t.id, live[b].t.id, dm.toFixed(1), w.time.toFixed(0)); }
  }
}
for (const t of w.trains.filter(t => t.circuit.id === 'N1')) console.log(t.id, 'km', (t.odo / 1000).toFixed(1), JSON.stringify(t.stopLog), t.head.id);
