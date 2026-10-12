import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import layout from '../src/layout.json';
const def: any = JSON.parse(JSON.stringify(layout)); if (process.argv[2]) def.rivers[0].points = JSON.parse(process.argv[2]);
const w = new World(def), t = new Terrain(w.net, def.urban);
for (const l of w.net.lines) {
  let cur: any = null; const runs: string[] = [];
  l.center.forEach((g, i) => { const q = t.riverNear(g.x, g.z); const on = !!q && q.d < q.hw + 6 && (!g.bf || g.tf);
    if (on) { cur ??= { i, n: 0, x: g.x, z: g.z, tf: 0, bf: 0, y: 1e9 }; cur.n++; cur.tf += g.tf ?? 0; cur.bf += g.bf ?? 0; cur.y = Math.min(cur.y, g.y - q!.level); } else if (cur) { runs.push(`i=${cur.i} n=${cur.n} (${cur.x.toFixed(0)},${cur.z.toFixed(0)}) tf=${cur.tf} bf=${cur.bf} y-eau=${cur.y.toFixed(1)}`); cur = null; } });
  if (cur) runs.push(`i=${cur.i} n=${cur.n} (${cur.x.toFixed(0)},${cur.z.toFixed(0)}) tf=${cur.tf} bf=${cur.bf} y-eau=${cur.y.toFixed(1)}`);
  console.log(l.id, 'N', l.center.length, 'struct', JSON.stringify(l.structures.map(x => x.kind[0] + x.i0 + '+' + x.n)), '\n   ', runs.join(' | ') || '—');
}
