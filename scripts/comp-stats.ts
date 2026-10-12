import { generateLayout } from '../src/sim/worldgen';
for (let s = 1; s <= 20; s++) {
  const d = generateLayout(s); const xs = d.centerline.map(p => p[0]), zs = d.centerline.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...zs) - Math.min(...zs);
  console.log(s, `anneau ${Math.round(w)}×${Math.round(h)}`, `${d.chords?.length ?? 0}C ${d.branches?.length ?? 0}A`, d.branches?.map(b => `${b.id}${b.side}:${b.loops!.length}éviter`).join(' '), 'gares', d.stations.length);
}
