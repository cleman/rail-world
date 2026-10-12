import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
const s = +process.argv[2] || 1;
const def = generateLayout(s), w = new World(def), t = new Terrain(w.net, def.urban);
for (const l of w.net.lines) {
  const runs: string[] = []; let cur: { i: number; n: number; tf: number; bf: number; dmin: number; ymin: number } | null = null;
  l.center.forEach((g, i) => { const q = t.riverNear(g.x, g.z); const on = !!q && q.d < q.hw + 6 && !g.bf;
    if (on) { if (!cur) cur = { i, n: 0, tf: 0, bf: 0, dmin: 1e9, ymin: 1e9 }; cur.n++; cur.tf += g.tf ?? 0; cur.dmin = Math.min(cur.dmin, q!.d); cur.ymin = Math.min(cur.ymin, g.y - q!.level); }
    else if (cur) { runs.push(`i=${cur.i} n=${cur.n} tf=${cur.tf} dmin=${cur.dmin.toFixed(0)} y-eau=${cur.ymin.toFixed(1)}`); cur = null; } });
  if (cur) { const c: any = cur; runs.push(`i=${c.i} n=${c.n} tf=${c.tf} dmin=${c.dmin.toFixed(0)} y-eau=${c.ymin.toFixed(1)} (fin)`); }
  console.log(l.id, 'closed', l.closed, 'N', l.center.length, 'step', l.step, 'structures', JSON.stringify(l.structures.map(x => x.kind[0] + x.i0 + '+' + x.n)), '\n   sans pont:', runs.join(' | ') || '—');
}
