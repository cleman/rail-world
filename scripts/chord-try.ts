import { readFileSync } from 'node:fs';
import { buildNetwork, type LayoutDef } from '../src/sim/network';
import { minRadius } from '../src/sim/worldgen';
const def = JSON.parse(readFileSync('src/layout.json', 'utf8')) as LayoutDef;
def.chords = [{ id: 'C', name: 'Corde du centre', from: 0.2, to: 0.6, via: JSON.parse(process.env.VIA ?? '[[58,-540],[330,-170],[640,130],[830,300]]'), stations: [{ name: 'Centre', at: 0.45 }] }];
def.urban = [...(def.urban ?? []), { station: 'Centre', radius: 200 }];
const net = buildNetwork(def);
console.log('lines', net.lines.map(l => `${l.id}:${l.center.length}`).join(' '), 'edges', net.edges.length, 'maxGrade', (net.maxGrade * 100).toFixed(2));
const ch = net.lines[1], N = ch.center.length;
let mr = 1e9; for (let i = 8; i < N - 8; i++) { const a = ch.center[i - 8], b = ch.center[i], c = ch.center[i + 8]; const A = Math.hypot(b.x - a.x, b.z - a.z), B = Math.hypot(c.x - b.x, c.z - b.z), Cc = Math.hypot(c.x - a.x, c.z - a.z), ar = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)); mr = Math.min(mr, A * B * Cc / (2 * ar)); }
console.log('rayon min corde', mr.toFixed(0), 'structures', ch.structures.map(s => s.kind + s.len).join(','));
for (const tr of ['C+', 'C-']) console.log(tr, net.ring[tr].map(e => `${e.id}(${e.len.toFixed(0)},v${e.vmax.toFixed(0)})`).join(' '));
for (const n of ['A@C.dv1', 'A@C.x1a', 'A@C.x1b', 'A@C.mg2', 'B@C.mg1', 'B@C.dv2']) { const nd = net.nodes.get(n)!; console.log(n, 'ins', nd.ins.length, 'outs', nd.outs.map(o => o.id).join(',')); }
void minRadius;
import { World } from '../src/sim/world';
def.circuits.push({ id: 'X', name: 'Express par le centre (A)', track: 'A', type: 'rapide', fleet: 3, service: 2, cars: 4, via: ['C'], stops: { Nord: false, Est: false, Sud: false } });
def.circuits.push({ id: 'Y', name: 'Express par le centre (B)', track: 'B', type: 'rapide', fleet: 3, service: 2, cars: 4, via: ['C'], stops: { Nord: false, Est: false, Sud: false } });
const w = new World(def);
console.log(w.circuits.map(c => `${c.id}: ${c.served.join(',')}`).join(' | '));
let maxStuck = 0;
for (let i = 0; i < 60 * 3600; i++) {
  w.step(1 / 60);
  for (const e of w.net.edges) if (e.occupants.size > 1) throw new Error(`deux trains dans ${e.id} à t=${w.time.toFixed(0)}`);
  if (i % 600 === 0) { const st = w.trains.filter(t => t.status !== 'stored' && t.v < 0.1 && t.dwell <= 0).length; maxStuck = Math.max(maxStuck, st); }
}
for (const t of w.trains.filter(t => t.status !== 'stored')) console.log(t.id, 'km', (t.odo / 1000).toFixed(1), 'arrêts', JSON.stringify(t.stopLog), 'sur', t.head.id);
console.log('immobiles max', maxStuck);
