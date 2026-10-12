// Essai d'antenne sur une boucle circulaire : npx tsx scripts/branch-try.ts [secondes]
import { World } from '../src/sim/world';
import type { LayoutDef } from '../src/sim/network';
const R = 1500, centerline = Array.from({ length: 12 }, (_, i) => [Math.round(R * Math.cos((i / 12) * 2 * Math.PI)), Math.round(R * Math.sin((i / 12) * 2 * Math.PI))]);
export const def: LayoutDef = {
  centerline, trackSpacing: 4.5, platformOffset: 4.5, blockLength: 350,
  stations: [{ name: 'Nord', at: 0.1 }, { name: 'Est', at: 0.5 }, { name: 'Sud', at: 0.75 }],
  depots: [{ name: 'Dépôt', at: 0.9, tracks: 6, on: ['A', 'B'] }],
  circuits: [
    { id: 'A', track: 'A', type: 'omnibus', fleet: 3, service: 2, cars: 4, name: 'A' },
    { id: 'B', track: 'B', type: 'omnibus', fleet: 3, service: 2, cars: 4, name: 'B' },
    { id: 'D1', track: 'A', type: 'omnibus', fleet: 4, service: Number(process.env.SVC ?? 2), cars: 3, name: 'D', via: ['D'] },
  ],
  terrain: { seed: 1, amplitude: 0, scale: 600, maxGrade: 0.02 },
  branches: [{ id: 'D', name: 'Antenne', from: 0.25, side: 'A', via: [[0, 1000], [0, 500], [150, 0], [260, -400]], loops: [{ name: 'Mi-Pente', at: 0.5 }], terminus: 'Bout' }],
};
if (process.argv[1]?.includes('branch-try')) {
  const w = new World(def);
  console.log('lignes', w.net.lines.map(l => `${l.id}:${l.center.length}`).join(' '), 'arêtes', w.net.edges.length, 'desservies', w.circuits.map(c => `${c.id}:${c.served.join(',')}`).join(' | '));
  const T = Number(process.argv[2] ?? 3600);
  let bad = 0;
  for (let i = 0; i < 60 * T; i++) {
    w.step(1 / 60);
    for (const e of w.net.edges) if (e.occupants.size > 1) throw new Error(`deux trains dans ${e.id} à t=${w.time.toFixed(0)}`);
    if (i % 30) continue;
    const live = w.trains.filter(t => t.status !== 'stored').map(t => ({ t, c: Array.from({ length: t.cars }, (_, k) => t.pointAt(k * (t.carLen + t.gap) + t.carLen / 2)) }));
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      let dm = 1e9; for (const p of live[a].c) for (const q of live[b].c) dm = Math.min(dm, Math.hypot(p.x - q.x, p.z - q.z));
      if (dm < 3 && bad++ < 5) console.log('chevauchement', live[a].t.id, live[b].t.id, dm.toFixed(1), 't=', w.time.toFixed(0), live[a].t.head.id, live[b].t.head.id);
    }
  }
  for (const t of w.trains.filter(t => t.status !== 'stored')) console.log(t.id, 'km', (t.odo / 1000).toFixed(1), JSON.stringify(t.stopLog), t.head.id);
}
