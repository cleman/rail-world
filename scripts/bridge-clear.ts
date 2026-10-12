// Garde (hauteur sous tablier au-dessus de l'eau) des ponts de rail au-dessus des rivières.
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import layout from '../src/layout.json';
const w = new World(layout as never), t = new Terrain(w.net, (layout as never as {urban:never}).urban);
let mn = 1e9, n = 0; const rows: string[] = [];
for (const g of w.net.guides) { const q = t.riverNear(g.x, g.z); if (q && q.d < q.hw) { const c = g.y - 2.1 - q.level; mn = Math.min(mn, c); n++; if (n % 6 === 0) rows.push(`${g.x.toFixed(0)},${g.z.toFixed(0)} garde ${c.toFixed(1)} d=${q.d.toFixed(0)} hw=${q.hw.toFixed(0)}`); } }
console.log(n, 'échantillons, garde min', mn.toFixed(1)); console.log(rows.join('\n'));
