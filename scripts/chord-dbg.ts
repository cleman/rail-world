import { readFileSync } from 'node:fs';
import { World } from '../src/sim/world';
import type { LayoutDef } from '../src/sim/network';
const def = JSON.parse(readFileSync('src/layout.json', 'utf8')) as LayoutDef;
const d: LayoutDef = { ...def, circuits: def.circuits.map(c => (c.via ? { ...c, fleet: 4, service: 3 } : c)) };
const w = new World(d);
let n = 0;
for (let i = 0; i < 60 * 1200 && n < 3; i++) {
  w.step(1 / 60);
  if (i % 30) continue;
  const live = w.trains.filter(t => t.status !== 'stored');
  for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
    const A = live[a], B = live[b]; let dm = 1e9;
    for (let k = 0; k < A.cars; k++) for (let m = 0; m < B.cars; m++) { const p = A.pointAt(k * (A.carLen + A.gap) + A.carLen / 2), q = B.pointAt(m * (B.carLen + B.gap) + B.carLen / 2); dm = Math.min(dm, Math.hypot(p.x - q.x, p.z - q.z)); }
    if (dm < 3) { n++; console.log(w.time.toFixed(0), A.id, B.id, dm.toFixed(1), '\n ', A.id, A.status, A.path.map(e => e.id).join(' '), '| res', A.reserved.map(e => e.id).join(' '), '\n ', B.id, B.status, B.path.map(e => e.id).join(' '), '| res', B.reserved.map(e => e.id).join(' ')); }
  }
}
{
  const w2 = new World(d);
  for (let i = 0; i < 60 * 681; i++) w2.step(1 / 60);
  for (const id of ['C21', 'F1']) { const t = w2.trains.find(x => x.id === id)!; console.log(id, 'd', t.d.toFixed(1), 'v', t.v.toFixed(1), 'len', t.length.toFixed(0), 'cars', t.cars, t.path.map(e => `${e.id}:${e.len.toFixed(0)}`).join(' '), 'head', t.pointAt(0).x.toFixed(0), t.pointAt(0).z.toFixed(0)); }
  const F = w2.trains.find(x => x.id === 'F1')!;
  console.log('res', F.reserved.map(e => `${e.id}:${e.len.toFixed(0)}`).join(' '));
  for (const id of ['B-b2_4', 'C-c2a', 'B-b2_3']) { const e = w2.net.edges.find(x => x.id === id)!; console.log(id, e.from.id, '->', e.to.id, e.len.toFixed(0), 'start', e.at(0).x.toFixed(0), e.at(0).z.toFixed(0), 'end', e.at(e.len).x.toFixed(0), e.at(e.len).z.toFixed(0)); }
}
