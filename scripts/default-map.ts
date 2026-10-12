import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import layout from '../src/layout.json';
const def = layout as never, w = new World(def), t = new Terrain(w.net, (def as any).urban);
for (const z of t.zones) console.log(`${z.kind.padEnd(6)} ${String(z.name ?? '').padEnd(12)} x=${z.x.toFixed(0)} z=${z.z.toFixed(0)} r=${z.r}`);
// tracé des lignes : un point tous les ~200 m
for (const l of w.net.lines) console.log(l.id, l.center.filter((_, i) => i % 40 === 0).map(g => `${g.x.toFixed(0)},${g.z.toFixed(0)}`).join(' '), 'struct', JSON.stringify(l.structures.map(x => x.kind[0] + x.i0 + '+' + x.n)));
console.log('rivière', t.rivers[0].pts.filter((_, i) => i % 12 === 0).map(p => `${p.x.toFixed(0)},${p.z.toFixed(0)}`).join(' '));
