// Endurance de mondes générés : npx tsx scripts/world-soak.ts [première] [dernière] [secondes]
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
const a = Number(process.argv[2] ?? 1), b = Number(process.argv[3] ?? 20), T = Number(process.argv[4] ?? 3600);
for (let s = a; s <= b; s++) {
  const d = generateLayout(s), w = new World(d);
  let overlaps = 0, first = '';
  const odo = new Map<string, number>(); let stuck = '';
  for (let i = 0; i < 60 * T; i++) {
    w.step(1 / 60);
    for (const e of w.net.edges) if (e.occupants.size > 1) throw new Error(`graine ${s} : deux trains dans ${e.id} t=${w.time.toFixed(0)}`);
    if (i % 30 === 0) {
      const live = w.trains.filter(t => t.status !== 'stored').map(t => ({ t, c: Array.from({ length: t.cars }, (_, k) => t.pointAt(k * (t.carLen + t.gap) + t.carLen / 2)) }));
      for (let x = 0; x < live.length; x++) for (let y = x + 1; y < live.length; y++) {
        let dm = 1e9; for (const p of live[x].c) for (const q of live[y].c) dm = Math.min(dm, Math.hypot(p.x - q.x, p.z - q.z));
        if (dm < 3) { overlaps++; if (!first) first = `${live[x].t.id}/${live[y].t.id} t=${w.time.toFixed(0)} ${dm.toFixed(1)}m ${live[x].t.head.id} ${live[y].t.head.id}`; }
      }
    }
    if (i % (60 * 900) === 0 && i > 0) {
      for (const t of w.trains) if (t.status === 'service') { const prev = odo.get(t.id) ?? -1e9; if (t.odo - prev < 300 && prev > -1e8 && !stuck) stuck = `${t.id} immobile (${t.head.id}) t=${w.time.toFixed(0)}`; odo.set(t.id, t.odo); }
    }
  }
  console.log(String(s).padStart(3), `${d.chords?.length ?? 0}C ${d.branches?.length ?? 0}A`, 'chevauchements', overlaps, first, stuck ? 'BLOQUÉ ' + stuck : 'fluide', 'rames', w.trains.filter(t => t.status !== 'stored').length);
}
