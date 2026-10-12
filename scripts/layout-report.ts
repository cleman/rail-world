// Rapport d'un layout : tunnels, ponts, zones, rivières, pentes. Usage : npx vite-node scripts/layout-report.ts [layout.json]
import { readFileSync } from 'node:fs';
import { buildNetwork, type LayoutDef } from '../src/sim/network';
import { Terrain } from '../src/sim/terrain';

const file = process.argv[2] ?? 'src/layout.json';
const def = JSON.parse(readFileSync(file, 'utf8')) as LayoutDef;
const net = buildNetwork(def), N = net.center.length, t = new Terrain(net, def.urban);
const f = (v: number) => v.toFixed(0);
console.log(`${file} : ${N} échantillons, ${f(N * net.step)} m de ligne, pente max ${(net.maxGrade * 100).toFixed(2)} %`);
for (const l of net.lines) for (const s of l.structures) {
  const a = l.center[s.i0], b = l.center[(s.i0 + s.n - 1) % l.center.length];
  console.log(`  ${s.kind === 'tunnel' ? 'tunnel' : 'pont  '} ${f(s.len).padStart(4)} m  (${f(a.x)},${f(a.z)}) -> (${f(b.x)},${f(b.z)})  altitude voie ${a.y.toFixed(1)} m  [${l.id}]`);
}
for (const l of net.lines.slice(1)) console.log(`  corde ${l.id} : ${l.center.length} échantillons, ${f(l.center.length * l.step)} m`);
for (const z of t.zones) console.log(`  zone ${z.kind.padEnd(7)} ${(z.name ?? '').padEnd(12)} (${f(z.x)},${f(z.z)}) rayon ${z.r}`);
for (const r of t.rivers) console.log(`  rivière ${r.name} : ${r.pts.length} points, niveau ${r.pts[0].level.toFixed(1)} -> ${r.pts[r.pts.length - 1].level.toFixed(1)} m`);
